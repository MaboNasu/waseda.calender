import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Constitution 13条: Owner承認・却下・保留、続行/再試行/中止の操作は
 * OWNER_DISCORD_USER_ID に設定されたユーザーからのみ有効とする。
 */
export function isOwner(userId) {
  const ownerId = process.env.OWNER_DISCORD_USER_ID;
  if (!ownerId) {
    // eslint-disable-next-line no-console
    console.warn('[owner-gate] OWNER_DISCORD_USER_ID が未設定です。誰の承認操作も無効として扱います。');
    return false;
  }
  return userId === ownerId;
}

export const OWNER_ONLY_MESSAGE = '⛔ この操作はOwnerのみ実行できます。';

export function buildApprovalRow(meetingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`meeting_approve:${meetingId}`).setLabel('承認').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`meeting_reject:${meetingId}`).setLabel('却下').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`meeting_hold:${meetingId}`).setLabel('保留').setStyle(ButtonStyle.Secondary),
  );
}

export function buildContinueRetryAbortRow(meetingId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`meeting_continue:${meetingId}`).setLabel('続行').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`meeting_retry:${meetingId}`).setLabel('再試行').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`meeting_abort:${meetingId}`).setLabel('中止').setStyle(ButtonStyle.Danger),
  );
}

/** customId(例: "meeting_approve:mtg_123") を {action, meetingId} に分解する。 */
export function parseButtonCustomId(customId) {
  const [action, meetingId] = customId.split(':');
  return { action, meetingId };
}
