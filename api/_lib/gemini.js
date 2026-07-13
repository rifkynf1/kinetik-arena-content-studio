const { GoogleGenAI } = require("@google/genai");

// 3 model dicoba berurutan, tiap model punya kuota terpisah di Google AI Studio,
// jadi kalau satu kena limit/overload kita otomatis lanjut ke model berikutnya.
// Bisa dioverride lewat env var GEMINI_MODELS (dipisah koma) kalau perlu.
const MODELS = process.env.GEMINI_MODELS
  ? process.env.GEMINI_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
  : [
      "gemini-3.1-flash-lite", // utama: termurah & tercepat
      "gemini-2.5-flash-lite", // cadangan 1: kelas & biaya serupa, kuota terpisah
      "gemini-2.5-flash",      // cadangan 2: sedikit lebih pintar, tetap cepat
    ];

// Status yang layak dicoba ulang ke model cadangan (rate limit / overload server).
// Error lain (mis. 400 bad request, API key invalid) langsung dilempar, tidak ada gunanya ganti model.
const FALLBACK_STATUSES = new Set([429, 500, 503]);

let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum di-set di environment variables.");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/**
 * Memanggil Gemini dan memaksa output JSON sesuai responseSchema.
 * Mencoba MODELS secara berurutan; pindah ke model berikutnya hanya kalau
 * error-nya termasuk FALLBACK_STATUSES (429/500/503).
 * @param {object} opts
 * @param {string} opts.systemInstruction - System prompt (isi rules.md).
 * @param {string} opts.prompt - User prompt / brief + data few-shot.
 * @param {object} [opts.responseSchema] - JSON schema untuk structured output.
 * @param {number} [opts.temperature]
 */
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
          responseMimeType: "application/json",
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
