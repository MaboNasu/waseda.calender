import OpenAI from 'openai';

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Fill it in ai-office/.env');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * @param {{systemPrompt: string, userPrompt: string, model: string, temperature?: number, maxTokens?: number}} params
 * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number}}>}
 */
export async function generate({ systemPrompt, userPrompt, model, temperature = 0.7, maxTokens = 500 }) {
  const response = await getClient().chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const choice = response.choices?.[0];
  return {
    text: choice?.message?.content ?? '',
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}
