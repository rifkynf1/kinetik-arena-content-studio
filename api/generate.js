const { generateJSON } = require("./_lib/gemini");
const { loadRules, loadSamplePosts } = require("./_lib/loadContext");

// Skema output supaya Gemini selalu balas terstruktur (bukan teks bebas),
// mencakup 4 format konten + saran jadwal posting.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    whatsapp: { type: "string" },
    discord_telegram: { type: "string" },
    twitter_thread: {
      type: "array",
      items: { type: "string" },
      description: "Array tweet berurutan (thread), tiap elemen 1 tweet.",
    },
    instagram_caption: { type: "string" },
    calendar_suggestion: {
      type: "object",
      properties: {
        best_day: { type: "string" },
        best_time: { type: "string" },
        reasoning: { type: "string" },
      },
      required: ["best_day", "best_time", "reasoning"],
    },
  },
  required: ["whatsapp", "discord_telegram", "twitter_thread", "instagram_caption", "calendar_suggestion"],
};

function buildFewShotBlock(samplePosts) {
  if (!samplePosts.length) return "(Tidak ada data contoh tersedia.)";
  return samplePosts
    .map(
      (row, i) =>
        `Contoh #${i + 1} [format: ${row.format}, event: ${row.event}]:\n${row.content}`
    )
    .join("\n\n---\n\n");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Gunakan POST." });
    return;
  }

  try {
    const { brief } = req.body || {};
    if (!brief || typeof brief !== "string" || !brief.trim()) {
      res.status(400).json({ error: "Field 'brief' wajib diisi." });
      return;
    }

    const rules = loadRules();
    const samplePosts = loadSamplePosts();
    const fewShotBlock = buildFewShotBlock(samplePosts);

    const prompt = `Berikut adalah contoh-contoh konten Nexus Cube sebelumnya (few-shot reference).
Pelajari gaya, struktur, istilah gaming, dan nada bicaranya:

${fewShotBlock}

---

Brief/instruksi konten baru dari panitia:
"${brief.trim()}"

Tugasmu: buat konten promosi turnamen berdasarkan brief di atas dalam 4 format sekaligus:
1. Broadcast WhatsApp / Grup WA (detail lengkap)
2. Pengumuman Discord/Telegram (nada official komunitas)
3. Utas (thread) X/Twitter — array beberapa tweet berurutan, tweet pertama sebagai hook
4. Caption Instagram (naratif & visual)

Plus 1 saran jadwal posting (hari & jam terbaik untuk audiens Gen Z gamer di Indonesia,
beserta alasan singkatnya).

Balas HANYA dalam format JSON sesuai schema yang diberikan.`;

    const result = await generateJSON({
      systemInstruction: rules,
      prompt,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.9,
    });

    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("Error di /api/generate:", err);
    res.status(500).json({ ok: false, error: err.message || "Terjadi kesalahan di server." });
  }
};
