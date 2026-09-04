/**
 * 実際のAPIキーやネットワークアクセスなしにオーケストレーターの動作を検証するための
 * モックプロバイダー。roles.config.js の provider を 'mock' に切り替えると使われる
 * (本番運用では使わない。scripts/dry-run.js からの動作確認専用)。
 *
 * 各フェーズが期待するJSONの形(rounds.jsのプロンプト定義)に沿った、それらしい
 * ダミー応答を返す。役職名や議題に軽く反応させることで、Discord埋め込みの見た目や
 * ラウンド進行のロジックを実データに近い形で確認できるようにしている。
 */

function fakeUsage(text) {
  const approxTokens = Math.max(10, Math.round(text.length / 3));
  return { inputTokens: approxTokens, outputTokens: approxTokens };
}

export async function generate({ systemPrompt, userPrompt, model }) {
  const isRebuttal = userPrompt.includes('"rebuttals"');
  const isRevision = userPrompt.includes('"revisedStance"');
  const isDecision = userPrompt.includes('"decision"');

  let payload;
  if (isDecision) {
    payload = {
      decision: `[MOCK/${model}] 議題を条件付きで承認する`,
      keyArguments: ['[MOCK] CFOのコスト試算', '[MOCK] CTOの実装可否判断'],
      rejectedAlternatives: ['[MOCK] 全面却下案(根拠不十分のため)'],
      reasoning: '[MOCK] これはダミー応答です。実際のAPIキーで実行すると本物の推論結果に置き換わります。',
    };
  } else if (isRevision) {
    payload = {
      changed: true,
      revisedStance: `[MOCK/${model}] 反論を踏まえ、条件付きで賛成に修正`,
      diffSummary: '[MOCK] 反論の一部を取り入れ、当初案にリスク低減策を追加した(ダミー)。',
    };
  } else if (isRebuttal) {
    payload = {
      rebuttals: [
        { targetRole: 'ceo', disagreement: '[MOCK] 決定を急ぎすぎている', reason: '[MOCK] 検証データが不足している(ダミー)' },
      ],
    };
  } else {
    payload = {
      stance: `[MOCK/${model}] この議題には賛成寄り`,
      reasoning: `[MOCK] ${systemPrompt.slice(0, 20)}…という立場からのダミー理由付け。`,
      risks: ['[MOCK] ダミーのリスク項目'],
    };
  }

  const text = JSON.stringify(payload);
  return { text, usage: fakeUsage(text) };
}
