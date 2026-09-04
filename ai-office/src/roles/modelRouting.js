/**
 * role id -> 担当するAIモデル のマッピング(Constitution 7条)。
 * roleDefinitions.js とは独立しているため、モデルの入れ替え・値下げ対応・
 * 障害時の一時変更は、このファイルの該当行を書き換えるだけで完結する
 * (役職のpersonaやオーケストレーターのコードには触れなくてよい)。
 *
 * 異なるプロバイダーを割り当てることで、単一モデルにペルソナを演じさせる
 * だけの構成にならないようにしている(意見の多様性はモデル特性由来)。
 */
export const MODEL_ROUTING = {
  ceo: { provider: 'openai', model: 'gpt-4.1', temperature: 0.4 },
  cto: { provider: 'groq', model: 'openai/gpt-oss-120b', temperature: 0.6 },
  product: { provider: 'gemini', model: 'gemini-3.6-flash', temperature: 0.5 },
  growth: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.8 },
  ux_ui: { provider: 'gemini', model: 'gemini-3.6-flash', temperature: 0.6 },
  // Red Teamは毎回1回だけ固定で呼び出すため、安価なモデルに固定する。
  red_team: { provider: 'groq', model: 'openai/gpt-oss-120b', temperature: 0.7 },
  cfo: { provider: 'gemini', model: 'gemini-3.6-flash', temperature: 0.5 },
  legal: { provider: 'gemini', model: 'gemini-3.6-flash', temperature: 0.2 },
};

export function getModelRouting(roleId) {
  const routing = MODEL_ROUTING[roleId];
  if (!routing) {
    throw new Error(`modelRouting.js に role "${roleId}" のモデル割当がありません。`);
  }
  return routing;
}
