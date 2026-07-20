const { generateJSON } = require("./_lib/gemini");
const { loadRules } = require("./_lib/loadContext");

const RUBRIC_CRITERIA = [
  {
    key: "tone_energy",
    label: "Tone & Energi Brand",
    guidance: "Apakah nada tulisan energik, kompetitif, dan Gen Z-friendly sesuai kepribadian brand Nexus Cube (bukan datar/kaku ala pengumuman kantoran)?",
  },
  {
    key: "gaming_terms",
    label: "Istilah Gaming/Esports",
    guidance: "Apakah istilah wajib (hype, war tiket, match, bracket, prize pool, dll) dipakai secara natural dan sesuai konteks, bukan dipaksakan?",
  },
  {
    key: "format_compliance",
    label: "Kepatuhan Aturan Format",
    guidance: "Apakah struktur & panjang kontennya sesuai aturan format spesifik (WhatsApp detail lengkap, Discord/Telegram nada official, tiap tweet thread <280 karakter, caption Instagram naratif)?",
  },
  {
    key: "cta_clarity",
    label: "Kejelasan CTA",
    guidance: "Apakah ada call-to-action yang jelas dan actionable di akhir konten?",
  },
  {
    key: "hard_rules",
    label: "Kepatuhan Hard Rules",
    guidance: "Apakah konten menghindari klaim palsu/overpromise (mis. 'dijamin menang', 'server 100% tanpa lag') dan tidak mengarang harga/tanggal/link yang tidak disediakan brief?",
  },
];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          score: { type: "number", description: "Skor 1-5" },
          comment: { type: "string" },
        },
        required: ["key", "score", "comment"],
      },
    },
    overall_score: { type: "number", description: "Rata-rata skor semua kriteria, 1-5" },
    verdict: { type: "string", description: "'approved' kalau overall_score >= 3.5, selain itu 'needs_revision'" },
    summary: { type: "string", description: "Ringkasan penilaian 1-2 kalimat." },
  },
  required: ["criteria", "overall_score", "verdict", "summary"],
};

function contentToText(content) {
  if (Array.isArray(content)) return content.join("\n\n");
  return String(content || "");
}

function findUnfilledPlaceholders(text) {
  const matches = text.match(/\[([^\[\]]+)\]/g) || [];
  return [...new Set(matches)];
}

const OVERPROMISE_PATTERNS = [
  /dijamin\s+(menang|juara|naik\s*rank|masuk\s*final)/i,
  /pasti\s+(menang|juara)/i,
  /100%\s*(tanpa|no)\s*lag/i,
  /tanpa\s*lag\s*sama\s*sekali/i,
  /(server|koneksi)\s*(pasti|dijamin)?\s*(tidak|gak|nggak)\s*(bakal|akan)?\s*(nge)?lag/i,
];

function findOverpromiseViolations(text) {
  const hits = OVERPROMISE_PATTERNS.map((re) => text.match(re)).filter(Boolean).map((m) => m[0]);
  return [...new Set(hits)];
}

const SCREAMING_TEXT_ALLOWLIST = new Set(["CTA", "GG", "WA", "IG", "VIP", "EO", "FAQ", "MLBB"]);
const SCREAMING_TEXT_MAX = 2;

function countScreamingWords(text) {
  const tokens = text.match(/\b[A-Z]{3,}\b/g) || [];
  return tokens.filter((t) => !SCREAMING_TEXT_ALLOWLIST.has(t));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Gunakan POST." });
    return;
  }

  try {
    const { format, content, brief } = req.body || {};
    if (!format || !content) {
      res.status(400).json({ error: "Field 'format' dan 'content' wajib diisi." });
      return;
    }

    const rules = loadRules();
    const contentText = contentToText(content);
    const rubricBlock = RUBRIC_CRITERIA.map(
      (c, i) => `${i + 1}. [key: "${c.key}"] ${c.label} — ${c.guidance}`
    ).join("\n");

    const prompt = `Kamu bertindak sebagai JUDGE (LLM-as-judge) yang menilai brand-fit konten
promosi Nexus Cube, BUKAN sebagai penulis. Nilai secara objektif, jangan menulis ulang kontennya.

Brand-voice guideline (rules.md) sebagai acuan penilaian:
---
${rules}
---

${brief ? `Brief asli yang jadi konteks konten ini:\n"${brief}"\n\n` : ""}Format konten: ${format}
Konten yang dinilai:
---
${contentText}
---

Nilai konten di atas terhadap 5 kriteria rubric berikut, tiap kriteria diberi skor 1-5
(1 = sangat tidak sesuai, 5 = sangat sesuai) beserta komentar singkat (1 kalimat) kenapa:

${rubricBlock}

Setelah itu hitung overall_score (rata-rata 5 skor tsb), tentukan verdict "approved" kalau
overall_score >= 3.5, selain itu "needs_revision", dan tulis summary 1-2 kalimat.

Balas HANYA dalam format JSON sesuai schema yang diberikan. Field "key" di tiap item criteria
harus persis salah satu dari: ${RUBRIC_CRITERIA.map((c) => `"${c.key}"`).join(", ")}.`;

    const result = await generateJSON({
      systemInstruction:
        "Kamu adalah AI evaluator (LLM-as-judge) yang objektif dan konsisten, mengikuti rubric yang diberikan apa adanya tanpa bias ke arah selalu memberi skor tinggi.",
      prompt,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    });

    const labelMap = Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, c.label]));
    if (result && result.criteria && result.criteria.length) {
      result.criteria = result.criteria.map((c) => ({ ...c, label: labelMap[c.key] || c.key }));

      const avg = result.criteria.reduce((sum, c) => sum + Number(c.score || 0), 0) / result.criteria.length;
      result.overall_score = Math.round(avg * 10) / 10;
      result.verdict = result.overall_score >= 3.5 ? "approved" : "needs_revision";

      const unfilled = findUnfilledPlaceholders(contentText);
      if (unfilled.length) {
        result.verdict = "needs_revision";
        result.unfilled_placeholders = unfilled;
        result.summary = `${result.summary || ""} Catatan tambahan: konten ini masih punya ${unfilled.length} placeholder kosong (${unfilled.join(", ")}) yang wajib diisi sebelum posting - verdict otomatis diturunkan ke "needs_revision" terlepas dari skor brand-fit-nya.`.trim();
      }

      const overpromise = findOverpromiseViolations(contentText);
      if (overpromise.length) {
        result.verdict = "needs_revision";
        result.overpromise_violations = overpromise;
        result.summary = `${result.summary || ""} Catatan tambahan: konten ini mengandung klaim overpromise/tidak bisa dipastikan (${overpromise.join(", ")}) yang dilarang di hard rules - verdict otomatis diturunkan ke "needs_revision".`.trim();
      }

      const screaming = countScreamingWords(contentText);
      if (screaming.length > SCREAMING_TEXT_MAX) {
        result.verdict = "needs_revision";
        result.screaming_text_violations = [...new Set(screaming)];
        result.summary = `${result.summary || ""} Catatan tambahan: konten ini punya ${screaming.length} kata SCREAMING TEXT (maks ${SCREAMING_TEXT_MAX} kata penekanan) - verdict otomatis diturunkan ke "needs_revision".`.trim();
      }
    }

    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("Error di /api/evaluate:", err);
    res.status(500).json({ ok: false, error: err.message || "Terjadi kesalahan di server." });
  }
};
