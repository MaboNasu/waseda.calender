import * as openai from './openai.js';
import * as gemini from './gemini.js';
import * as groq from './groq.js';

/** provider名(roles.config.jsで指定) -> 実装 のレジストリ。差し替えはここに1エントリ足すだけ。 */
const PROVIDERS = {
  openai,
  gemini,
  groq,
};

/**
 * @param {string} providerName
 * @param {{systemPrompt: string, userPrompt: string, model: string, temperature?: number, maxTokens?: number}} params
 */
export async function generate(providerName, params) {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown provider "${providerName}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider.generate(params);
}
