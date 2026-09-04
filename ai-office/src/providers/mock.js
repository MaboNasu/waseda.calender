/**
 * 実際のAPIキーやネットワークアクセスなしにオーケストレーターの動作を検証するための
 * モックプロバイダー。roles.config.js の provider を 'mock' に切り替えると使われる
 * (本番運用では使わない。scripts/dry-run.js からの動作確認専用)。
 *
 * 各フェーズが期待するJSONの形(rounds.jsのプロンプト定義)に沿った、それらしい
 * ダミー応答を返す。フェーズの判別は、プロンプト内に含まれる固有のJSONキー名で行う。
 */

function fakeUsage(text) {
  const approxTokens = Math.max(10, Math.round(text.length / 3));
  return { inputTokens: approxTokens, outputTokens: approxTokens };
}

export async function generate({ systemPrompt, userPrompt, model }) {
  let payload;

  if (userPrompt.includes('"rejectedAlternatives"')) {
    // Decision
    payload = {
      decision: 'adopted',
      keyArguments: ['[MOCK] CFOのコスト試算', '[MOCK] CTOの実装可否判断'],
      rejectedAlternatives: ['[MOCK] 全面却下案(根拠不十分のため)'],
      reasoning: '[MOCK] これはダミー応答です。実際のAPIキーで実行すると本物の推論結果に置き換わります。',
      ownerApprovalOpinion: 'not_required',
      verificationMethod: '[MOCK] 公開後1週間のアクセス数を確認する',
      reevaluateAt: '[MOCK] 2週間後',
    };
  } else if (userPrompt.includes('"requiredRoles"')) {
    // Triage (Round 0)
    payload = {
      problemDefinition: `[MOCK/${model}] ダミーの問題定義`,
      requiredRoles: ['product', 'growth', 'ux_ui'],
      specialistRoles: [],
      mandatoryApprovalTags: [],
      reasoning: '[MOCK] ダミーの招集理由',
    };
  } else if (userPrompt.includes('"findings"')) {
    // Red Team
    payload = {
      findings: [{ issue: '[MOCK] 検証データが不足している(ダミー)', relatedRoleId: '', severity: 'low' }],
    };
  } else if (userPrompt.includes('"revisedStance"')) {
    // Revision
    payload = {
      changed: true,
      revisedStance: `[MOCK/${model}] 反論を踏まえ、条件付きで賛成に修正`,
      diffSummary: '[MOCK] 反論の一部を取り入れ、当初案にリスク低減策を追加した(ダミー)。',
    };
  } else if (userPrompt.includes('"ownerApprovalOpinion"')) {
    // Approval check (CTO)
    payload = { ownerApprovalOpinion: 'not_required', reason: '[MOCK] 固定カテゴリに該当しないと判断(ダミー)' };
  } else {
    // Opening
    payload = {
      positionTag: 'support',
      stance: `[MOCK/${model}] この議題には賛成寄り`,
      reasoning: `[MOCK] ${systemPrompt.slice(0, 20)}…という立場からのダミー理由付け。`,
      risks: ['[MOCK] ダミーのリスク項目'],
    };
  }

  const text = JSON.stringify(payload);
  return { text, usage: fakeUsage(text) };
}
