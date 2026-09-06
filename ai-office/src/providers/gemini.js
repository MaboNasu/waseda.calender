import { GoogleGenAI } from '@google/genai';

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set. Fill it in ai-office/.env');
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/**
 * @param {{systemPrompt: string, userPrompt: string, model: string, temperature?: number, maxTokens?: number}} params
 * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number}}>}
 */
export async function generate({ systemPrompt, userPrompt, model, temperature = 0.7, maxTokens = 500 }) {
  const response = await getClient().models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      // thinkingBudget: 0 で内部思考(見えないreasoningトークン)を無効化する。
      // maxOutputTokensの予算を丸ごと可視のJSON出力に使わせるための対策
      // (旧SDK(@google/generative-ai)ではthinkingConfigが認識されず無視されていたため、
      // 実際にサポートされている@google/genaiへ切り替えた)。
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const usage = response.usageMetadata ?? {};
  return {
    text: response.text ?? '',
    usage: {
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    },
  };
}
