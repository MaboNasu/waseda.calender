/**
 * 会議フェーズの定数。meeting.js と decisionLogRenderer.js の両方から参照されるため、
 * 循環インポートを避けて独立したファイルに切り出している。
 */
export const PHASES = {
  TRIAGE: 'triage',
  OPENING: 'opening',
  RED_TEAM: 'redTeam',
  REVISION: 'revision',
  APPROVAL_CHECK: 'approvalCheck',
  DECISION: 'decision',
};
