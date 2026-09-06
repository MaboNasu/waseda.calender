import { GoogleGenerativeAI } from '@google/generative-ai';

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set. Fill it in ai-office/.env');
    }
    client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return client;
}

/**
 * @param {{systemPrompt: string, userPrompt: string, model: string, temperature?: number, maxTokens?: number}} params
 * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number}}>}
 */
export async function generate({ systemPrompt, userPrompt, model, temperature = 0.7, maxTokens = 500 }) {
  const genModel = getClient().getGenerativeModel({ model, systemInstruction: systemPrompt });

  const result = await genModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    // thinkingBudget: 0 で内部思考(見えないreasoningトークン)を無効化する。
    // maxOutputTokensの予算を丸ごと可視のJSON出力に使わせるための対策
    // (UX/UI等で「JSONは有効だが中身が空」になる症状の根本対策の試み)。
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const usage = result.response.usageMetadata ?? {};
  return {
    text: result.response.text(),
    usage: {
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    },
  };
}
