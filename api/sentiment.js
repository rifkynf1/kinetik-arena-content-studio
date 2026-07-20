const { generateJSON } = require('./_lib/gemini');
const { loadComments } = require('./_lib/loadContext');

const ALLOWED_DATASETS = new Set(['comments_dataset.csv', 'comments_event_offline.csv']);
const NEGATIVE_SPIKE_THRESHOLD = 0.3;
const MIN_SAMPLE_PER_WEEK = 3;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        positive: { type: 'number' },
        negative: { type: 'number' },
        neutral: { type: 'number' },
      },
      required: ['total', 'positive', 'negative', 'neutral'],
    },
    top_themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          count: { type: 'number' },
          sentiment_lean: { type: 'string' },
        },
        required: ['theme', 'count', 'sentiment_lean'],
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sentiment: { type: 'string' },
          theme: { type: 'string' },
        },
        required: ['id', 'sentiment', 'theme'],
      },
    },
  },
  required: ['summary', 'top_themes', 'items'],
};

function getWeekStart(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  const dayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOffset);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function buildWeeklySummary(items, timestampMap) {
  const weekBuckets = new Map();

  for (const item of items) {
    const ts = timestampMap[String(item.id)];
    if (!ts) continue;
    const weekStart = getWeekStart(ts);
    if (!weekStart) continue;
    const key = toDateStr(weekStart);

    if (!weekBuckets.has(key)) {
      weekBuckets.set(key, { weekStart, total: 0, positive: 0, negative: 0, neutral: 0 });
    }
    const bucket = weekBuckets.get(key);
    bucket.total += 1;
    if (item.sentiment === 'positive') bucket.positive += 1;
    else if (item.sentiment === 'negative') bucket.negative += 1;
    else bucket.neutral += 1;
  }

  return Array.from(weekBuckets.values())
    .sort((a, b) => a.weekStart - b.weekStart)
    .map((bucket) => {
      const weekEnd = new Date(bucket.weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const negativeRatio = bucket.total > 0 ? bucket.negative / bucket.total : 0;
      const isSpike = bucket.total >= MIN_SAMPLE_PER_WEEK && negativeRatio >= NEGATIVE_SPIKE_THRESHOLD;
      return {
        week_start: toDateStr(bucket.weekStart),
        week_end: toDateStr(weekEnd),
        total: bucket.total,
        positive: bucket.positive,
        negative: bucket.negative,
        neutral: bucket.neutral,
        negative_ratio: Math.round(negativeRatio * 100) / 100,
        is_spike: isSpike,
      };
    });
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Gunakan GET atau POST.' });
    return;
  }

  try {
    let commentsBlock = '';
    const textMap = {};
    const timestampMap = {};

    if (req.method === 'POST' && req.body && req.body.customCsvText) {
      const Papa = require('papaparse');
      const { data } = Papa.parse(req.body.customCsvText, { header: true, skipEmptyLines: true });
      if (!data || !data.length) throw new Error('CSV kosong atau format salah. Pastikan memiliki header (post_id, comment_text, channel).');
      commentsBlock = data
        .map((row, idx) => {
          const cId = String(row.post_id || row.id || idx + 1);
          const text = row.comment_text || row.comment || row.komentar || '';
          const channel = row.channel || row.platform || 'unknown';
          textMap[cId] = text;
          if (row.timestamp) timestampMap[cId] = row.timestamp;
          return `#${cId} [${channel}]: "${text}"`;
        })
        .join('\n');
    } else {
      const requested = req.body && req.body.datasetName;
      const datasetName = ALLOWED_DATASETS.has(requested) ? requested : 'comments_dataset.csv';
      const comments = loadComments(datasetName);
      if (!comments.length) {
        res.status(200).json({
          ok: true,
          data: { summary: { total: 0, positive: 0, negative: 0, neutral: 0 }, top_themes: [], items: [], weekly_summary: [] },
        });
        return;
      }
      commentsBlock = comments
        .map((row) => {
          const cId = String(row.post_id);
          textMap[cId] = row.comment_text;
          if (row.timestamp) timestampMap[cId] = row.timestamp;
          return `#${cId} [${row.channel}]: "${row.comment_text}"`;
        })
        .join('\n');
    }

    const prompt = `Berikut adalah daftar komentar publik seputar Nexus Cube
dari berbagai platform (Discord, Twitter, Instagram, Telegram). Komentar seputar war tiket,
jadwal match, kualitas server/streaming, bracket, hingga pelayanan panitia:

${commentsBlock}

Tugasmu (zero-shot classification, tanpa contoh sebelumnya, tanpa training model):
1. Klasifikasikan tiap komentar ke salah satu sentimen: "positive", "negative", atau "neutral".
2. Tentukan tema utama tiap komentar secara singkat (mis. "war tiket", "lag/server",
   "jadwal match", "bracket & rules", "respon panitia", "prize pool", "venue/streaming", dll).
3. Buat ringkasan jumlah komentar per sentimen.
4. Buat daftar tema-tema utama yang paling sering muncul beserta jumlahnya dan
   kecenderungan sentimennya secara umum.

Balas HANYA dalam format JSON sesuai schema yang diberikan. Field "id" harus sama
persis dengan nomor id komentar aslinya (dalam bentuk string).`;

    const result = await generateJSON({
      systemInstruction: 'Kamu adalah AI analyst yang objektif untuk menganalisis sentimen dan tema komentar peserta/penonton turnamen esports Nexus Cube. Jangan menambahkan opini pribadi, hanya klasifikasikan berdasarkan isi komentar.',
      prompt,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    });

    if (result && result.items && result.items.length) {
      result.items = result.items.map((item) => ({
        ...item,
        text: textMap[String(item.id)] || '',
      }));
      result.weekly_summary = buildWeeklySummary(result.items, timestampMap);
      result.summary = result.items.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.sentiment === 'positive') acc.positive += 1;
          else if (item.sentiment === 'negative') acc.negative += 1;
          else acc.neutral += 1;
          return acc;
        },
        { total: 0, positive: 0, negative: 0, neutral: 0 }
      );
    } else {
      result.weekly_summary = [];
    }

    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error('Error di /api/sentiment:', err);
    res.status(500).json({ ok: false, error: err.message || 'Terjadi kesalahan di server.' });
  }
};
