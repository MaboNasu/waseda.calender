import { EmbedBuilder } from 'discord.js';
import { ROLES } from '../roles/roles.config.js';

const WEBHOOK_NAME = 'AI Office';
const webhookCache = new Map();

function roleName(roleId) {
  return ROLES.find((r) => r.id === roleId)?.name ?? roleId;
}

/** チャンネルに紐づくWebhookを取得する。無ければ作成する(役職ごとに名前/色を変えて投稿するため)。 */
async function getOrCreateWebhook(channel) {
  const parentChannel = channel.isThread() ? channel.parent : channel;
  if (!parentChannel) {
    throw new Error('Webhookを作成できるチャンネルが見つかりません(スレッドの親チャンネル取得に失敗)。');
  }
  if (webhookCache.has(parentChannel.id)) return webhookCache.get(parentChannel.id);

  const webhooks = await parentChannel.fetchWebhooks();
  let webhook = webhooks.find((w) => w.name === WEBHOOK_NAME);
  if (!webhook) {
    webhook = await parentChannel.createWebhook({ name: WEBHOOK_NAME });
  }
  webhookCache.set(parentChannel.id, webhook);
  return webhook;
}

function truncate(text, max = 1000) {
  if (!text) return '(なし)';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function footerText(message) {
  return `${message.provider}/${message.model} · ${message.phase} · $${message.costUsd.toFixed(4)}`;
}

export function buildEmbed(message) {
  const embed = new EmbedBuilder().setColor(message.color ?? 0x999999).setFooter({ text: footerText(message) }).setTimestamp(new Date(message.timestamp));

  if (message.parsed?.parseError) {
    return embed
      .setTitle(`${message.roleName} — 出力解析エラー`)
      .setDescription(`⚠️ JSON形式で応答を得られませんでした。生の出力:\n${truncate(message.raw, 900)}`);
  }

  const p = message.parsed;

  switch (message.phase) {
    case 'opening':
      return embed
        .setTitle(`${message.roleName} — 意見表明`)
        .addFields(
          { name: '結論', value: truncate(p.stance) },
          { name: '理由', value: truncate(p.reasoning) },
          { name: '懸念点', value: truncate(Array.isArray(p.risks) && p.risks.length ? p.risks.map((r) => `・${r}`).join('\n') : 'なし') },
        );

    case 'rebuttal': {
      const rebuttals = Array.isArray(p.rebuttals) ? p.rebuttals : [];
      const value = rebuttals.length
        ? rebuttals.map((r) => `**→ ${roleName(r.targetRole)}**: ${r.disagreement}\n根拠: ${r.reason}`).join('\n\n')
        : '(反論なし)';
      return embed.setTitle(`${message.roleName} — 反論`).addFields({ name: '反論内容', value: truncate(value) });
    }

    case 'revision':
      return embed
        .setTitle(`${message.roleName} — ${p.changed ? '意見を修正' : '意見を維持'}`)
        .addFields(
          { name: '最終見解', value: truncate(p.revisedStance) },
          { name: p.changed ? '変更点' : '維持する理由', value: truncate(p.diffSummary) },
        );

    case 'decision':
      return embed
        .setTitle('🏁 CEOの最終決定')
        .addFields(
          { name: '決定事項', value: truncate(p.decision) },
          { name: '採用した主張', value: truncate(Array.isArray(p.keyArguments) ? p.keyArguments.map((a) => `・${a}`).join('\n') : '') },
          { name: '却下した案', value: truncate(Array.isArray(p.rejectedAlternatives) && p.rejectedAlternatives.length ? p.rejectedAlternatives.map((a) => `・${a}`).join('\n') : 'なし') },
          { name: '決定理由', value: truncate(p.reasoning) },
        );

    default:
      return embed.setTitle(message.roleName).setDescription(truncate(message.raw));
  }
}

/**
 * 役職名義のWebhookでメッセージを投稿する。
 * @param {import('discord.js').TextBasedChannel} channel 投稿先(スレッド可)
 * @param {object} message MeetingOrchestrator が生成したメッセージオブジェクト
 */
export async function postRoleMessage(channel, message) {
  const webhook = await getOrCreateWebhook(channel);
  await webhook.send({
    username: message.roleName,
    embeds: [buildEmbed(message)],
    threadId: channel.isThread() ? channel.id : undefined,
  });
}
