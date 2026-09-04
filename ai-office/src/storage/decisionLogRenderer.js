import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from '../security/secretGuard.js';
import { PHASES } from '../orchestrator/meeting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECISIONS_DIR = path.join(__dirname, '..', '..', 'logs', 'decisions');

fs.mkdirSync(DECISIONS_DIR, { recursive: true });

const DECISION_LABELS = {
  adopted: '採用',
  rejected: '不採用',
  pending: '保留',
  experiment: '実験',
};

function findRound(transcript, phase) {
  return transcript.rounds.find((r) => r.phase === phase) ?? null;
}

function slugify(topic, meetingId) {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length >= 3 ? slug : meetingId;
}

function listify(items, empty = '(なし)') {
  return items.length ? items.map((s) => `- ${s}`).join('\n') : empty;
}

/**
 * Constitution 11条: Decision Logの必須14項目+推定APIコストをMarkdownとして整形する。
 * JSON側の生データ(rawテキストや個別トークン数)はここには含めない。
 * @param {object} transcript MeetingOrchestratorが生成したトランスクリプト
 */
export function renderMarkdown(transcript) {
  const opening = findRound(transcript, PHASES.OPENING);
  const revision = findRound(transcript, PHASES.REVISION);
  const redTeam = findRound(transcript, PHASES.RED_TEAM);
  const decision = transcript.decision;

  const participants = (opening?.messages ?? []).map((m) => `${m.roleName}(${m.provider}/${m.model})${m.failed ? ' ※応答失敗' : ''}`);

  const initialOpinions = (opening?.messages ?? []).map(
    (m) => `**${m.roleName}**: ${m.parsed?.stance ?? '(出力解析失敗)'}\n  理由: ${m.parsed?.reasoning ?? ''}`,
  );

  const redTeamFindings = (redTeam?.messages?.[0]?.parsed?.findings ?? []).map(
    (f) => `[${f.severity ?? '不明'}] ${f.issue}${f.relatedRoleId ? `(関連: ${f.relatedRoleId})` : ''}`,
  );

  const revisedOpinions = revision
    ? revision.messages.map((m) => `**${m.roleName}**: ${m.parsed?.changed ? '修正' : '維持'} — ${m.parsed?.revisedStance ?? ''}\n  ${m.parsed?.diffSummary ?? ''}`)
    : ['(Revisionは実施されませんでした: Red Teamの指摘なし・意見の相違なしと判定)'];

  const decisionLabel = decision ? DECISION_LABELS[decision.parsed?.decision] ?? '不明' : '(未決定)';

  const ownerApprovalText = transcript.ownerApproval?.required
    ? `必要(状態: ${transcript.ownerApproval.status ?? 'pending'})`
    : '不要(CEO・CTOともに承認不要と判断、かつ固定カテゴリに非該当)';

  const statusNote = transcript.aborted
    ? `\n> ⚠️ この会議は中断されました(理由: ${transcript.abortReason ?? '不明'})\n`
    : transcript.blockedOnFailure
      ? `\n> ⚠️ プロバイダー障害によりブロックされています(フェーズ: ${transcript.blockedOnFailure.phase}, 失敗役職: ${transcript.blockedOnFailure.failedRoleIds.join(', ')})\n`
      : '';

  const md = `# Decision Log: ${transcript.topic}
${statusNote}
- **日時**: ${transcript.startedAt}
- **議題**: ${transcript.topic}
- **Constitution version**: ${transcript.constitutionVersion}
- **推定APIコスト**: $${transcript.totalCostUsd.toFixed(4)}

## 問題定義

${transcript.problemDefinition || '(記録なし)'}

## 参加役職

${listify(participants)}

## 初期意見

${initialOpinions.join('\n\n') || '(記録なし)'}

## 主要反論・Red Teamの指摘

${listify(redTeamFindings, '(指摘なし)')}

## 修正後の意見

${revisedOpinions.join('\n\n')}

## CEOの判断

${decision?.parsed?.reasoning ?? '(未決定)'}

## 採用 / 不採用 / 保留 / 実験

**${decisionLabel}**

## Owner承認の有無

${ownerApprovalText}

## 検証方法

${decision?.parsed?.verificationMethod || '(なし)'}

## 再評価条件 / 再評価時期

${decision?.parsed?.reevaluateAt || '(なし)'}
`;

  // Constitution 13条・セキュリティガード: Markdown保存前にも念のためredact(二重の安全策)。
  return redact(md);
}

/** @returns {string} 書き込んだファイルの絶対パス */
export function saveDecisionLog(transcript) {
  const dateStr = transcript.startedAt.slice(0, 10);
  const slug = slugify(transcript.topic, transcript.meetingId);
  const filePath = path.join(DECISIONS_DIR, `${dateStr}_${slug}.md`);
  fs.writeFileSync(filePath, renderMarkdown(transcript));
  return filePath;
}
