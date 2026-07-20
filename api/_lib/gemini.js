const { GoogleGenAI } = require('@google/genai');

const MODELS = process.env.GEMINI_MODELS
  ? process.env.GEMINI_MODELS.split(',')
      .map((m) => m.trim())
      .filter(Boolean)
  : ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

const FALLBACK_STATUSES = new Set([429, 500, 503]);

let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum di-set di environment variables.');
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

async function generateJSON({ systemInstruction, prompt, responseSchema, temperature = 0.8 }) {
  const ai = getClient();

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature,
          responseMimeType: 'application/json',
          ...(responseSchema ? { responseSchema } : {}),
        },
      });

      const text = response.text;
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`Gagal parse JSON dari Gemini: ${err.message}\nRaw: ${text}`);
      }
    } catch (err) {
      lastErr = err;
      const status = err.status ?? err.code;
      if (!FALLBACK_STATUSES.has(status)) throw err;
      console.warn(`Model ${model} gagal (status ${status}), coba model cadangan...`);
    }
  }

  throw lastErr;
}

module.exports = { generateJSON, MODELS };
