import * as openai from './openai.js';
import * as gemini from './gemini.js';
import * as groq from './groq.js';
import * as mock from './mock.js';

/** provider名(roles.config.jsで指定) -> 実装 のレジストリ。差し替えはここに1エントリ足すだけ。 */
const PROVIDERS = {
  openai,
  gemini,
  groq,
  mock,
};

/**
 * AI_OFFICE_MOCK=1 の間は、指定されたproviderに関わらずモックへリダイレクトする。
 * scripts/dry-run.js からの動作確認専用(本番運用では絶対に立てないこと)。
 */
const FORCE_MOCK = process.env.AI_OFFICE_MOCK === '1';

/**
 * @param {string} providerName
 * @param {{systemPrompt: string, userPrompt: string, model: string, temperature?: number, maxTokens?: number}} params
 */
export async function generate(providerName, params) {
  if (FORCE_MOCK) return mock.generate(params);

  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown provider "${providerName}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider.generate(params);
}
