const { generateJSON } = require("./_lib/gemini");
const { loadComments } = require("./_lib/loadContext");

// Skema output untuk zero-shot classification sentimen + tema.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        total: { type: "number" },
        positive: { type: "number" },
        negative: { type: "number" },
        neutral: { type: "number" },
      },
      required: ["total", "positive", "negative", "neutral"],
    },
    top_themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          theme: { type: "string" },
          count: { type: "number" },
          sentiment_lean: { type: "string" },
        },
        required: ["theme", "count", "sentiment_lean"],
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          sentiment: { type: "string" },
          theme: { type: "string" },
        },
        required: ["id", "sentiment", "theme"],
      },
    },
  },
  required: ["summary", "top_themes", "items"],
};

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Gunakan GET atau POST." });
    return;
  }

  try {
    let commentsBlock = "";

    if (req.method === "POST" && req.body && req.body.customCsvText) {
      // Opsi 1: User upload CSV custom
      const Papa = require("papaparse");
      const { data } = Papa.parse(req.body.customCsvText, { header: true, skipEmptyLines: true });
      if (!data || !data.length) throw new Error("CSV kosong atau format salah. Pastikan memiliki header (id, platform, comment).");
      commentsBlock = data.map((row, idx) => `#${row.id || idx+1} [${row.platform || 'unknown'}]: "${row.comment || row.komentar || ''}"`).join("\n");
    } else {
      // Opsi 2: Dropdown pilih dataset lokal
      const datasetName = (req.body && req.body.datasetName) ? req.body.datasetName : "comments_dataset.csv";
      const comments = loadComments(datasetName);
      if (!comments.length) {
        res.status(200).json({
          ok: true,
          data: { summary: { total: 0, positive: 0, negative: 0, neutral: 0 }, top_themes: [], items: [] },
        });
        return;
      }
      commentsBlock = comments.map((row) => `#${row.id} [${row.platform}]: "${row.comment}"`).join("\n");
    }

    const prompt = `Berikut adalah daftar komentar publik seputar Nexus Cube (Nexus Cube)
dari berbagai platform (Discord, Twitter, Instagram, Telegram). Komentar seputar war tiket,
jadwal match, kualitas server/streaming, bracket, hingga pelayanan panitia:

${commentsBlock}

Tugasmu (zero-shot classification, tanpa contoh sebelumnya):
1. Klasifikasikan tiap komentar ke salah satu sentimen: "positive", "negative", atau "neutral".
2. Tentukan tema utama tiap komentar secara singkat (mis. "war tiket", "lag/server",
   "jadwal match", "bracket & rules", "respon panitia", "prize pool", "venue/streaming", dll).
3. Buat ringkasan jumlah komentar per sentimen.
4. Buat daftar tema-tema utama yang paling sering muncul beserta jumlahnya dan
   kecenderungan sentimennya secara umum.

Balas HANYA dalam format JSON sesuai schema yang diberikan. Field "id" harus sama
persis dengan nomor id komentar aslinya (dalam bentuk string).`;

    const result = await generateJSON({
      systemInstruction:
        "Kamu adalah AI analyst yang objektif untuk menganalisis sentimen dan tema komentar peserta/penonton turnamen esports Nexus Cube. Jangan menambahkan opini pribadi, hanya klasifikasikan berdasarkan isi komentar.",
      prompt,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    });

    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("Error di /api/sentiment:", err);
    res.status(500).json({ ok: false, error: err.message || "Terjadi kesalahan di server." });
  }
};
