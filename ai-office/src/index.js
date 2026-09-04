import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { commandDefinitions } from './discord/commandDefinitions.js';
import { postRoleMessage, buildEmbed } from './discord/threadRenderer.js';
import { MeetingOrchestrator } from './orchestrator/meeting.js';
import { ROLES } from './roles/roles.config.js';
import {
  CostTracker,
  estimateMeetingCostUsd,
  DEFAULT_COST_CONFIRM_THRESHOLD_USD,
} from './cost/tracker.js';
import { getMeetingIdForThread, loadMeeting } from './storage/transcriptStore.js';

const REQUIRED_ENV_VARS = ['DISCORD_BOT_TOKEN', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.warn(`[warn] ${key} が未設定です。ai-office/.env を確認してください(該当プロバイダーの呼び出しでエラーになります)。`);
  }
}

const costConfirmThresholdUsd =
  Number(process.env.COST_CONFIRM_THRESHOLD_USD) || DEFAULT_COST_CONFIRM_THRESHOLD_USD;

/** channelId(スレッドID) -> 実行中のMeetingOrchestrator。/meeting cancel から参照する。 */
const activeMeetings = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

async function registerGlobalCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.application.id), {
    body: commandDefinitions.map((cmd) => cmd.toJSON()),
  });
  console.log(`[startup] Registered ${commandDefinitions.length} global command(s).`);
}

client.once('ready', async () => {
  console.log(`[startup] Logged in as ${client.user.tag}`);
  try {
    await registerGlobalCommands();
  } catch (error) {
    console.error('[startup] Failed to register commands:', error);
  }
});

async function handleMeetingStart(interaction) {
  const topic = interaction.options.getString('topic', true);
  const rounds = interaction.options.getInteger('rounds') ?? 1;

  if (
    !interaction.inGuild() ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(interaction.channel?.type)
  ) {
    await interaction.reply({
      content: '⚠️ このコマンドはサーバー内の通常テキストチャンネルで実行してください(会議用スレッドを作成します)。',
      ephemeral: true,
    });
    return;
  }

  const costTracker = new CostTracker();
  const availability = costTracker.canStartNewMeeting();
  if (!availability.allowed) {
    const reasonText =
      availability.reason === 'monthly_budget_exceeded'
        ? `月間予算($${availability.monthlyBudgetUsd})を超過しています(当月累計: $${availability.monthlyTotalUsd.toFixed(4)})。`
        : `1日の会議開始上限(${availability.dailyMeetingLimit}回)に達しています(本日: ${availability.dailyCount}回)。`;
    await interaction.reply({ content: `🛑 会議を開始できません。${reasonText}`, ephemeral: true });
    return;
  }

  const estimatedCostUsd = estimateMeetingCostUsd(ROLES, rounds);

  await interaction.deferReply({ ephemeral: true });

  if (estimatedCostUsd > costConfirmThresholdUsd) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm').setLabel('開始する').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel').setLabel('やめる').setStyle(ButtonStyle.Secondary),
    );
    const confirmMessage = await interaction.editReply({
      content: `⚠️ この会議の概算コストは **$${estimatedCostUsd.toFixed(4)}** です(閾値 $${costConfirmThresholdUsd})。開始しますか?`,
      components: [row],
    });

    let buttonInteraction;
    try {
      buttonInteraction = await confirmMessage.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });
    } catch {
      await interaction.editReply({ content: '⌛ 応答がなかったため、会議の開始をキャンセルしました。', components: [] });
      return;
    }

    if (buttonInteraction.customId === 'cancel') {
      await buttonInteraction.update({ content: '会議の開始をキャンセルしました。', components: [] });
      return;
    }
    await buttonInteraction.update({ content: '✅ 開始します…', components: [] });
  }

  const topicSlug = topic.length > 80 ? `${topic.slice(0, 80)}…` : topic;
  const thread = await interaction.channel.threads.create({
    name: `🏢 ${topicSlug}`,
    autoArchiveDuration: 1440,
    reason: 'AI Office meeting',
  });

  costTracker.recordMeetingStart(thread.id);
  const orchestrator = new MeetingOrchestrator({ topic, rounds, threadId: thread.id, costTracker });
  activeMeetings.set(thread.id, orchestrator);

  await thread.send(
    `📋 **議題**: ${topic}\n参加役職: ${ROLES.map((r) => r.name).join(' / ')}\nラウンド数: ${rounds}\n\n意見表明フェーズを開始します…`,
  );

  await interaction.editReply({ content: `🏢 会議スレッドを作成しました: ${thread}`, components: [] });

  orchestrator
    .run(async (message) => {
      await postRoleMessage(thread, message);
    })
    .then(async (transcript) => {
      activeMeetings.delete(thread.id);
      if (transcript.aborted) {
        await thread.send('⏹️ 会議は中断されました。');
        return;
      }
      await thread.send(`💰 この会議の推定コスト: $${transcript.totalCostUsd.toFixed(4)}`);
    })
    .catch(async (error) => {
      activeMeetings.delete(thread.id);
      console.error('[meeting] failed:', error);
      await thread.send(`❌ 会議の進行中にエラーが発生しました: ${error.message}`);
    });
}

async function handleMeetingDecision(interaction) {
  const meetingId = getMeetingIdForThread(interaction.channelId);
  if (!meetingId) {
    await interaction.reply({ content: 'このスレッドに紐づく会議が見つかりません。', ephemeral: true });
    return;
  }
  const transcript = loadMeeting(meetingId);
  if (!transcript?.decision) {
    await interaction.reply({ content: 'まだ最終決定は出ていません。', ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [buildEmbed(transcript.decision)] });
}

async function handleMeetingCost(interaction) {
  const costTracker = new CostTracker();
  const meetingId = getMeetingIdForThread(interaction.channelId);
  const monthlyTotalUsd = costTracker.getMonthlyTotalUsd();
  const lines = [`当月累計コスト: $${monthlyTotalUsd.toFixed(4)} / 予算 $${costTracker.monthlyBudgetUsd}`];
  if (meetingId) {
    lines.push(`この会議のコスト: $${costTracker.getMeetingCostUsd(meetingId).toFixed(4)}`);
  } else {
    lines.push('(このスレッドに紐づく会議は見つかりませんでした)');
  }
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function handleMeetingCancel(interaction) {
  const orchestrator = activeMeetings.get(interaction.channelId);
  if (!orchestrator) {
    await interaction.reply({ content: 'このスレッドで進行中の会議が見つかりません。', ephemeral: true });
    return;
  }
  orchestrator.abort();
  await interaction.reply({ content: '⏹️ 中断をリクエストしました(現在実行中のフェーズの完了後に停止します)。' });
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'meeting') return;

  try {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') await handleMeetingStart(interaction);
    else if (subcommand === 'decision') await handleMeetingDecision(interaction);
    else if (subcommand === 'cost') await handleMeetingCost(interaction);
    else if (subcommand === 'cancel') await handleMeetingCancel(interaction);
  } catch (error) {
    console.error('[interaction] error:', error);
    const payload = { content: `❌ エラーが発生しました: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

process.on('SIGINT', () => client.destroy().finally(() => process.exit(0)));
process.on('SIGTERM', () => client.destroy().finally(() => process.exit(0)));

client.login(process.env.DISCORD_BOT_TOKEN);
