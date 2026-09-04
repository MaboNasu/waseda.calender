import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, REST, Routes, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { commandDefinitions } from './discord/commandDefinitions.js';
import { postRoleMessage, buildEmbed } from './discord/threadRenderer.js';
import { MeetingOrchestrator, PHASES } from './orchestrator/meeting.js';
import { ROLES } from './roles/roles.config.js';
import { CostTracker, estimateMeetingCostUsd, DEFAULT_COST_CONFIRM_THRESHOLD_USD } from './cost/tracker.js';
import { getMeetingIdForThread, loadMeeting, findRecentDecisionByTopic, saveMeeting } from './storage/transcriptStore.js';
import { saveDecisionLog } from './storage/decisionLogRenderer.js';
import { isOwner, buildApprovalRow, buildContinueRetryAbortRow, parseButtonCustomId, OWNER_ONLY_MESSAGE } from './approval/ownerGate.js';

const REQUIRED_ENV_VARS = ['DISCORD_BOT_TOKEN', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.warn(`[warn] ${key} が未設定です。ai-office/.env を確認してください(該当プロバイダーの呼び出しでエラーになります)。`);
  }
}
if (!process.env.OWNER_DISCORD_USER_ID) {
  console.warn('[warn] OWNER_DISCORD_USER_ID が未設定です。Owner承認ボタンは誰の操作も受け付けません(Constitution 13条)。');
}

const costConfirmThresholdUsd = Number(process.env.COST_CONFIRM_THRESHOLD_USD) || DEFAULT_COST_CONFIRM_THRESHOLD_USD;

/** threadId -> 実行中/完了済みのMeetingOrchestrator。/meeting status・cancel から参照する。 */
const activeMeetings = new Map();
/** meetingId -> MeetingOrchestrator。Owner承認ボタン等、customIdにmeetingIdしか乗らない場面から参照する。 */
const meetingsById = new Map();

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

client.once('clientReady', async () => {
  console.log(`[startup] Logged in as ${client.user.tag}`);
  try {
    await registerGlobalCommands();
  } catch (error) {
    console.error('[startup] Failed to register commands:', error);
  }
});

function phaseLabel(phase) {
  return { triage: 'Round0(トリアージ)', opening: '意見表明', redTeam: 'Red Team', revision: '修正', approvalCheck: '承認要否判定', decision: 'CEO決定' }[phase] ?? phase;
}

/** 会議完了後(正常終了/障害ブロック/中断のいずれか)の後処理を1箇所にまとめる。 */
async function finalizeMeeting(orchestrator, thread, transcript) {
  if (transcript.aborted) {
    activeMeetings.delete(thread.id);
    await thread.send(`⏹️ 会議は中断されました(理由: ${transcript.abortReason ?? '不明'})。`);
    return;
  }

  if (transcript.blockedOnFailure) {
    const { phase, failedRoleIds } = transcript.blockedOnFailure;
    await thread.send({
      content: `⚠️ プロバイダー障害により **${phaseLabel(phase)}** で ${failedRoleIds.join(', ')} の応答が得られませんでした。\nこの議題は重要な会議(Owner承認カテゴリ該当、またはRed Teamの有意な指摘あり)のため、欠員のままCEOが決定することを禁止しています。Ownerの指示を待ちます。`,
      components: [buildContinueRetryAbortRow(orchestrator.meetingId)],
    });
    return;
  }

  // 正常に決定まで到達
  const decisionLogPath = saveDecisionLog(transcript);
  console.log(`[decision-log] saved to ${decisionLogPath}`);

  if (transcript.ownerApproval.required) {
    await thread.send({
      content: '🔔 この決定はOwner承認が必要と判定されました。',
      components: [buildApprovalRow(orchestrator.meetingId)],
    });
  } else {
    activeMeetings.delete(thread.id);
  }

  await thread.send(`💰 この会議の推定コスト: $${transcript.totalCostUsd.toFixed(4)}`);
}

async function handleMeetingStart(interaction) {
  const topic = interaction.options.getString('topic', true);

  if (!interaction.inGuild() || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(interaction.channel?.type)) {
    await interaction.reply({
      content: '⚠️ このコマンドはサーバー内の通常テキストチャンネルで実行してください(会議用スレッドを作成します)。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // 重複会議防止: 直近に同一議題の決定がないか確認する。
  const existingDecision = findRecentDecisionByTopic(topic);
  if (existingDecision) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dup_proceed').setLabel('それでも新規に実行する').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('dup_cancel').setLabel('やめる').setStyle(ButtonStyle.Secondary),
    );
    const dupMessage = await interaction.editReply({
      content: `📎 同一・類似の議題について既に決定があります(${existingDecision.startedAt}): **${existingDecision.decision?.parsed?.decision ?? '不明'}**\n${existingDecision.decision?.parsed?.reasoning ?? ''}\n\nそれでも新規に会議を開始しますか?`,
      components: [row],
    });
    let dupInteraction;
    try {
      dupInteraction = await dupMessage.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
    } catch {
      await interaction.editReply({ content: '⌛ 応答がなかったため、会議の開始をキャンセルしました。', components: [] });
      return;
    }
    if (dupInteraction.customId === 'dup_cancel') {
      await dupInteraction.update({ content: '会議の開始をキャンセルしました。', components: [] });
      return;
    }
    await dupInteraction.update({ content: '既存の決定を確認の上、新規に開始します…', components: [] });
  }

  const costTracker = new CostTracker();
  const availability = costTracker.canStartNewMeeting();
  if (!availability.allowed) {
    const reasonText =
      availability.reason === 'monthly_budget_exceeded'
        ? `月間予算($${availability.monthlyBudgetUsd})を超過しています(当月累計: $${availability.monthlyTotalUsd.toFixed(4)})。`
        : availability.reason === 'openai_monthly_budget_exceeded'
          ? `OpenAI月間予算($${availability.openaiMonthlyBudgetUsd})を超過しています(当月累計: $${availability.openaiMonthlyTotalUsd.toFixed(4)})。`
          : `1日の会議開始上限(${availability.dailyMeetingLimit}回)に達しています(本日: ${availability.dailyCount}回)。`;
    await interaction.editReply({ content: `🛑 会議を開始できません。${reasonText}`, components: [] });
    return;
  }

  const estimatedCostUsd = estimateMeetingCostUsd(ROLES);
  if (estimatedCostUsd > costConfirmThresholdUsd) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm').setLabel('開始する').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel').setLabel('やめる').setStyle(ButtonStyle.Secondary),
    );
    const confirmMessage = await interaction.editReply({
      content: `⚠️ この会議の概算コスト上限は **$${estimatedCostUsd.toFixed(4)}** です(閾値 $${costConfirmThresholdUsd})。開始しますか?`,
      components: [row],
    });
    let buttonInteraction;
    try {
      buttonInteraction = await confirmMessage.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
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
  const thread = await interaction.channel.threads.create({ name: `🏢 ${topicSlug}`, autoArchiveDuration: 1440, reason: 'AI Office meeting' });

  costTracker.recordMeetingStart(thread.id);
  const orchestrator = new MeetingOrchestrator({ topic, threadId: thread.id, costTracker });
  activeMeetings.set(thread.id, orchestrator);
  meetingsById.set(orchestrator.meetingId, orchestrator);

  await thread.send(`📋 **議題**: ${topic}\n\nRound0(CEOによる問題定義・招集)を開始します…`);
  await interaction.editReply({ content: `🏢 会議スレッドを作成しました: ${thread}`, components: [] });

  orchestrator
    .run(async (message) => postRoleMessage(thread, message))
    .then((transcript) => finalizeMeeting(orchestrator, thread, transcript))
    .catch(async (error) => {
      activeMeetings.delete(thread.id);
      console.error('[meeting] failed:', error);
      await thread.send(`❌ 会議の進行中にエラーが発生しました: ${error.message}`);
    });
}

async function handleMeetingStatus(interaction) {
  if (activeMeetings.size === 0) {
    await interaction.reply({ content: '現在進行中の会議はありません。', ephemeral: true });
    return;
  }
  const lines = [...activeMeetings.values()].map((o) => {
    const t = o.transcript;
    const lastRound = t.rounds[t.rounds.length - 1];
    const status = t.decision ? '完了' : t.blockedOnFailure ? `ブロック中(${phaseLabel(t.blockedOnFailure.phase)})` : t.aborted ? '中断済み' : `進行中(${phaseLabel(lastRound?.phase ?? PHASES.TRIAGE)})`;
    const approval = t.ownerApproval.required ? ` / Owner承認: ${t.ownerApproval.status ?? 'pending'}` : '';
    return `- <#${o.threadId}> 「${t.topic}」— ${status}${approval}`;
  });
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
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
  const approval = transcript.ownerApproval.required ? `\nOwner承認: ${transcript.ownerApproval.status ?? 'pending'}` : '\nOwner承認: 不要';
  await interaction.reply({ content: approval, embeds: [buildEmbed(transcript.decision)] });
}

async function handleMeetingCost(interaction) {
  const costTracker = new CostTracker();
  const meetingId = getMeetingIdForThread(interaction.channelId);
  const monthlyTotalUsd = costTracker.getMonthlyTotalUsd();
  const openaiMonthlyTotalUsd = costTracker.getOpenAIMonthlyTotalUsd();
  const lines = [
    `当月累計コスト: $${monthlyTotalUsd.toFixed(4)} / 予算 $${costTracker.monthlyBudgetUsd}`,
    `うちOpenAI: $${openaiMonthlyTotalUsd.toFixed(4)} / 予算 $${costTracker.openaiMonthlyBudgetUsd}`,
  ];
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
  orchestrator.abort('owner_requested');
  await interaction.reply({ content: '⏹️ 中断をリクエストしました(現在実行中のフェーズの完了後に停止します)。' });
}

async function handleButtonInteraction(interaction) {
  const { action, meetingId } = parseButtonCustomId(interaction.customId);
  const ownerOnlyActions = ['meeting_approve', 'meeting_reject', 'meeting_hold', 'meeting_continue', 'meeting_retry', 'meeting_abort'];
  if (!ownerOnlyActions.includes(action)) return; // 自分たち発行のボタンではない(confirm/cancel/dup_*はawaitMessageComponent側で処理済み)

  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: OWNER_ONLY_MESSAGE, ephemeral: true });
    return;
  }

  const orchestrator = meetingsById.get(meetingId);
  if (!orchestrator) {
    await interaction.reply({ content: 'この会議は見つかりません(再起動などで失われた可能性があります)。', ephemeral: true });
    return;
  }

  const thread = await client.channels.fetch(orchestrator.threadId);

  if (['meeting_approve', 'meeting_reject', 'meeting_hold'].includes(action)) {
    const statusMap = { meeting_approve: 'approved', meeting_reject: 'rejected', meeting_hold: 'held' };
    orchestrator.transcript.ownerApproval.status = statusMap[action];
    orchestrator.transcript.ownerApproval.by = interaction.user.id;
    orchestrator.transcript.ownerApproval.at = new Date().toISOString();
    saveMeeting(orchestrator.meetingId, orchestrator.transcript);
    saveDecisionLog(orchestrator.transcript);
    const labelMap = { meeting_approve: '✅ 承認しました', meeting_reject: '❌ 却下しました', meeting_hold: '⏸️ 保留にしました' };
    await interaction.update({ content: labelMap[action], components: [] });
    activeMeetings.delete(orchestrator.threadId);
    return;
  }

  if (action === 'meeting_abort') {
    orchestrator.abort('owner_requested_after_failure');
    orchestrator.transcript.aborted = true;
    orchestrator.transcript.abortReason = 'owner_requested_after_failure';
    saveMeeting(orchestrator.meetingId, orchestrator.transcript);
    await interaction.update({ content: '⏹️ 中止しました。', components: [] });
    activeMeetings.delete(orchestrator.threadId);
    return;
  }

  if (action === 'meeting_continue') {
    await interaction.update({ content: '▶️ 現状の情報のまま続行します…', components: [] });
    const transcript = await orchestrator.forceDecision((message) => postRoleMessage(thread, message));
    await finalizeMeeting(orchestrator, thread, transcript);
    return;
  }

  if (action === 'meeting_retry') {
    await interaction.update({ content: '🔁 会議を最初からやり直します…', components: [] });
    const costTracker = orchestrator.costTracker;
    const newOrchestrator = new MeetingOrchestrator({ topic: orchestrator.topic, threadId: orchestrator.threadId, costTracker });
    activeMeetings.set(orchestrator.threadId, newOrchestrator);
    meetingsById.set(newOrchestrator.meetingId, newOrchestrator);
    newOrchestrator
      .run((message) => postRoleMessage(thread, message))
      .then((transcript) => finalizeMeeting(newOrchestrator, thread, transcript))
      .catch(async (error) => {
        activeMeetings.delete(orchestrator.threadId);
        console.error('[meeting] retry failed:', error);
        await thread.send(`❌ 再試行中にエラーが発生しました: ${error.message}`);
      });
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'meeting') return;

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') await handleMeetingStart(interaction);
    else if (subcommand === 'status') await handleMeetingStatus(interaction);
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
