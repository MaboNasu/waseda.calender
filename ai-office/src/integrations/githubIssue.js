/**
 * CEOが「採用」と決定し、かつOwner承認が不要(または承認済み)になった時点で、
 * その決定内容をGitHub Issueとして自動起票する(Constitution上の「本番リリース」等の
 * 承認カテゴリには触れない — コードは一切変更せず、人間が着手しやすい形に変換するだけ)。
 *
 * GITHUB_TOKEN・GITHUB_REPO が未設定の場合は無効化される(オプトイン機能)。
 * 起票に失敗しても会議フロー自体は止めない(ベストエフォート、例外を投げない)。
 */

import { redact } from '../security/secretGuard.js';

const GITHUB_API_BASE = 'https://api.github.com';

function isConfigured() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

function buildIssueBody(transcript, decisionLogPath) {
  const decision = transcript.decision?.parsed;
  const lines = [
    `AI Office会議(meetingId: \`${transcript.meetingId}\`)での決定を自動起票しています。`,
    '',
    `**議題**: ${transcript.topic}`,
    `**決定**: 採用`,
    `**根拠**: ${decision?.reasoning ?? '(記録なし)'}`,
    `**検証方法**: ${decision?.verificationMethod || '(なし)'}`,
    `**再評価条件/時期**: ${decision?.reevaluateAt || '(なし)'}`,
    '',
    `詳細な議論の経緯(誰が何を主張し、Red Teamが何を指摘し、どう修正されたか)は` +
      ` Decision Log を参照: \`${decisionLogPath}\`(リポジトリにはコミットされないローカルログのため、` +
      `パスのみの参照になります)。`,
    '',
    '_このIssueはAI Office (Discord) が自動作成しました。実装はこのIssueを見た人間が判断してください' +
      '(コード変更は自動化されていません)。_',
  ];
  return redact(lines.join('\n'));
}

/**
 * @param {object} transcript MeetingOrchestratorの完了済みトランスクリプト
 * @param {string} decisionLogPath saveDecisionLog()が書き込んだMarkdownファイルの絶対パス
 * @returns {Promise<{created: boolean, url?: string, reason?: string}>}
 */
export async function createDecisionIssue(transcript, decisionLogPath) {
  if (transcript.decision?.parsed?.decision !== 'adopted') {
    return { created: false, reason: 'not_adopted' };
  }
  if (!isConfigured()) {
    return { created: false, reason: 'not_configured' };
  }

  const [owner, repo] = process.env.GITHUB_REPO.split('/');
  if (!owner || !repo) {
    console.warn('[github-issue] GITHUB_REPO の形式が不正です(期待形式: owner/repo)。起票をスキップします。');
    return { created: false, reason: 'invalid_repo_format' };
  }

  const title = `[AI Office決定] ${transcript.topic}`.slice(0, 250);
  const body = buildIssueBody(transcript, decisionLogPath);

  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body, labels: ['ai-office-decision'] }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[github-issue] Issue作成に失敗しました(status: ${response.status}): ${redact(errText).slice(0, 300)}`);
      return { created: false, reason: `http_${response.status}` };
    }

    const json = await response.json();
    return { created: true, url: json.html_url };
  } catch (error) {
    console.warn('[github-issue] Issue作成中にエラーが発生しました:', error.message);
    return { created: false, reason: 'network_error' };
  }
}
