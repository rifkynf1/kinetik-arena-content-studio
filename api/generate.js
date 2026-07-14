const { generateJSON } = require('./_lib/gemini');
const { loadRules, loadSamplePosts } = require('./_lib/loadContext');

// Skema 1 rekomendasi jadwal upload (dipakai berulang untuk tiap format di calendar_suggestion).
const SCHEDULE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string', description: 'Tanggal upload, format YYYY-MM-DD, harus di masa depan relatif ke tanggal acuan.' },
    day: { type: 'string', description: 'Nama hari dalam Bahasa Indonesia, mis. "Rabu".' },
    time: { type: 'string', description: 'Jam upload, format HH:MM (24 jam), waktu Indonesia bagian barat (WIB).' },
    reasoning: { type: 'string', description: 'Alasan konkret pemilihan tanggal & jam ini untuk platform tsb.' },
  },
  required: ['date', 'day', 'time', 'reasoning'],
};

// Skema output supaya Gemini selalu balas terstruktur,
// mencakup 4 format konten + saran jadwal posting.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_on_topic: {
      type: 'boolean',
      description: 'true kalau brief ini benar-benar tentang promosi event/turnamen esports Nexus Cube, false kalau brief-nya di luar konteks itu sama sekali (mis. resep masakan, curhat pribadi, pertanyaan umum yang tidak berhubungan dengan event/promosi esports).',
    },
    off_topic_reason: {
      type: 'string',
      description: 'Kalau is_on_topic false, jelaskan singkat (1 kalimat) kenapa brief ini dianggap di luar konteks. Kalau is_on_topic true, isi string kosong.',
    },
    whatsapp: { type: 'string' },
    discord_telegram: { type: 'string' },
    twitter_thread: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array tweet berurutan (thread), tiap elemen 1 tweet.',
    },
    instagram_caption: { type: 'string' },
    calendar_suggestion: {
      type: 'object',
      description: 'Jadwal UPLOAD/POSTING konten (bukan jadwal turnamen), terpisah per format.',
      properties: {
        whatsapp: SCHEDULE_ITEM_SCHEMA,
        discord_telegram: SCHEDULE_ITEM_SCHEMA,
        twitter_thread: SCHEDULE_ITEM_SCHEMA,
        instagram_caption: SCHEDULE_ITEM_SCHEMA,
      },
      required: ['whatsapp', 'discord_telegram', 'twitter_thread', 'instagram_caption'],
    },
  },
  required: ['is_on_topic', 'off_topic_reason', 'whatsapp', 'discord_telegram', 'twitter_thread', 'instagram_caption', 'calendar_suggestion'],
};

function buildFewShotBlock(samplePosts) {
  if (!samplePosts.length) return '(Tidak ada data contoh tersedia.)';
  return samplePosts.map((row, i) => `Contoh #${i + 1} [format: ${row.format}, event: ${row.event}]:\n${row.content}`).join('\n\n---\n\n');
}

// Validasi kasar brief SEBELUM manggil Gemini sama sekali, supaya brief yang jelas
// asal-asalan (terlalu pendek / cuma 1-2 kata) langsung ditolak dengan pasti - tidak
// bergantung pada AI "mau nurut" instruksi di rules.md, yang sifatnya tidak selalu konsisten.
const MIN_BRIEF_LENGTH = 12;
const MIN_BRIEF_WORDS = 3;

function isBriefTooVague(brief) {
  const trimmed = brief.trim();
  if (trimmed.length < MIN_BRIEF_LENGTH) return true;
  const words = trimmed.split(/\s+/).filter((w) => w.length > 1);
  if (words.length < MIN_BRIEF_WORDS) return true;
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Gunakan POST.' });
    return;
  }

  try {
    const { brief } = req.body || {};
    if (!brief || typeof brief !== 'string' || !brief.trim()) {
      res.status(400).json({ error: "Field 'brief' wajib diisi." });
      return;
    }
    if (isBriefTooVague(brief)) {
      res.status(400).json({
        error: 'Brief terlalu singkat/kurang jelas. Tambahkan minimal info produk atau event yang mau dipromosikan, misal: nama event, tanggal, atau detail promo.',
      });
      return;
    }

    const rules = loadRules();
    const samplePosts = loadSamplePosts();
    const fewShotBlock = buildFewShotBlock(samplePosts);

    const now = new Date();
    const todayDate = now.toISOString().slice(0, 10);
    const todayDayName = now.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });

    const prompt = `Berikut adalah contoh-contoh konten Nexus Cube sebelumnya (few-shot reference).
Pelajari gaya, struktur, istilah gaming, dan nada bicaranya:

${fewShotBlock}

---

Brief/instruksi konten baru dari panitia:
"${brief.trim()}"

LANGKAH PERTAMA - CEK KONTEKS: sebelum menulis apa pun, tentukan is_on_topic. Set ke false
HANYA kalau brief ini jelas SAMA SEKALI tidak berhubungan dengan promosi event/turnamen
esports Nexus Cube (misal: resep masakan, curhat pribadi, pertanyaan matematika, tugas
sekolah, atau topik lain yang tidak ada kaitannya dengan event/gaming/esports). Kalau masih
ada kemungkinan itu tentang event Nexus Cube walau infonya minim, anggap is_on_topic true -
jangan terlalu sensitif menolak. Kalau is_on_topic false, isi off_topic_reason singkat dan
untuk field whatsapp/discord_telegram/twitter_thread/instagram_caption cukup isi string
kosong ("" atau array kosong) - tidak perlu menulis konten promosi sama sekali.

Kalau is_on_topic true, lanjutkan tugas berikut - buat konten promosi turnamen berdasarkan
brief di atas dalam 4 format sekaligus:
1. Broadcast WhatsApp / Grup WA (detail lengkap)
2. Pengumuman Discord/Telegram (nada official komunitas)
3. Utas (thread) X/Twitter — array beberapa tweet berurutan, tweet pertama sebagai hook
4. Caption Instagram (naratif & visual)

ATURAN ANTI-MENGARANG (PALING PENTING, sering dilanggar - baca sampai habis):
- Kalau brief TIDAK menyebutkan suatu info (harga tiket, prize pool, tanggal, format match,
  venue, link, dll), kamu WAJIB isi bagian itu dengan placeholder eksplisit seperti
  [HARGA TIKET], [PRIZE POOL], [TANGGAL], [FORMAT MATCH], [NAMA VENUE], [LINK DAFTAR] -
  JANGAN PERNAH mengisi dengan angka/tanggal/nama karangan sendiri yang terdengar masuk akal,
  walau kelihatannya "membantu". Ini pelanggaran serius, sama seperti berbohong ke pembaca.
- Contoh kesalahan nyata yang HARUS DIHINDARI: brief cuma "Buat promo War Tiket Nexus Cup
  Mobile Legends Season 5." (tanpa detail apa pun) tapi hasilnya malah mengarang
  "Registrasi: 18-25 Juli 2026", "Match Day: 30 Juli - 2 Agustus 2026", "Prize Pool:
  Rp20.000.000", "Format: 5v5 Single Elimination", "Biaya Daftar: Rp150.000/tim" -
  SEMUA angka itu tidak ada di brief, jadi SEMUA itu salah dan harus jadi placeholder.
- Sebaliknya: info yang MEMANG disebutkan di brief (misal brief bilang "prize pool
  Rp20.000.000") WAJIB ditulis apa adanya, jangan diubah jadi placeholder juga.
- Aturan yang sama berlaku untuk field date/time di calendar_suggestion: kalau kamu perlu
  tanggal event (match day/registrasi) untuk bernalar soal jadwal upload tapi brief tidak
  menyebutkannya, jangan mengarang tanggal event - cukup pilih jadwal upload yang masuk akal
  berdasarkan info yang memang tersedia.

ATURAN FORMATTING WAJIB untuk whatsapp, discord_telegram, dan instagram_caption (perhatikan
baik-baik, ini sering dilanggar):
- WAJIB pisahkan tiap bagian/poin dengan BARIS KOSONG (\\n\\n), sama persis seperti pola di
  contoh few-shot di atas. JANGAN PERNAH menggabungkan semua kalimat jadi satu paragraf padat
  tanpa jeda baris — itu SALAH walau isinya benar.
- Sapaan pembuka, isi/poin detail (pakai emoji sebagai bullet di baris terpisah-pisah), dan
  CTA penutup harus masing-masing jadi blok terpisah dengan baris kosong di antaranya, persis
  seperti struktur di contoh few-shot.
- Untuk twitter_thread, tiap elemen array adalah 1 tweet - jangan gabungkan beberapa tweet
  jadi 1 elemen string panjang.

ATURAN ANTI-REPETISI ANTAR FORMAT (penting, sering dilanggar): keempat format JANGAN cuma
saling tempel-ulang info yang sama dengan kalimat pembuka beda tipis - itu bikin hasilnya
kerasa seperti 1 template yang di-copy 4 kali. Bedakan STRUKTURNYA, bukan cuma kata-katanya:
- whatsapp: boleh pakai daftar poin emoji (Format/Prize Pool/dll) karena broadcast memang
  butuh detail lengkap yang gampang dipindai.
- discord_telegram: JANGAN sekadar copy daftar poin yang sama dari WhatsApp. Tulis lebih
  naratif/informatif ala pengumuman komunitas resmi - boleh tetap ada **bold** untuk info
  krusial, tapi rangkai dalam kalimat, bukan daftar bullet emoji yang identik dengan WhatsApp.
- twitter_thread: HARUS terasa native platform X - tweet pendek, punchy, tidak sekadar
  memecah paragraf WhatsApp jadi potongan-potongan. Fokus ke 1-2 info paling penting saja per
  thread, jangan coba masukkan semua detail seperti di WhatsApp/Discord.
- instagram_caption: HARUS storytelling/naratif visual, BUKAN daftar poin emoji lagi. Bayangkan
  ini teks pendamping foto/poster - alurnya cerita singkat, bukan rangkuman fakta berbaris.
- Kalau brief-nya minim info (banyak placeholder), variasikan cara PENYAMPAIAN placeholder itu
  antar format juga - jangan keempatnya menampilkan daftar placeholder yang identik persis.

Tanggal acuan hari ini (server, WIB): ${todayDate} (${todayDayName}). Semua tanggal yang kamu
sarankan WAJIB berada di masa depan relatif ke tanggal acuan ini.

Plus rekomendasi JADWAL UPLOAD/POSTING (calendar_suggestion) — ini BUKAN jadwal turnamen
(match day/registrasi tetap fakta dari brief, jangan diubah), tapi kapan sebaiknya
masing-masing dari 4 konten di atas di-upload/posting. Buat rekomendasi TERPISAH untuk
whatsapp, discord_telegram, twitter_thread, dan instagram_caption — masing-masing dengan
date (YYYY-MM-DD), day (nama hari), time (HH:MM), dan reasoning sendiri.

Aturan supaya rekomendasi jadwal upload ini tidak template/asal sama tiap kali:
- BERNALAR dari detail konkret di brief (tanggal war tiket/registrasi/match day yang
  disebutkan) untuk menentukan tanggal upload — idealnya beberapa hari SEBELUM tanggal
  acara tsb (H-3 s.d. H-1), bukan tanggal tetap yang selalu sama.
- Waktu upload BOLEH beda antar platform sesuai karakter platform (mis. WhatsApp broadcast
  malam saat orang santai cek HP, Instagram jam makan siang/malam saat engagement tinggi,
  Discord saat komunitas biasanya aktif, X/Twitter bisa lebih pagi sebagai teaser sebelum
  broadcast utama) — TAPI jangan ikuti pola ini secara membabi-buta tiap kali; kalau konteks
  brief (mis. urgensi war tiket) lebih masuk akal untuk pola waktu yang beda, ikuti itu.
- JANGAN kasih tanggal & jam yang persis sama di keempat platform kecuali memang ada alasan
  kuat dari brief yang mendukungnya.
- Dua brief dengan konteks berbeda harus menghasilkan rekomendasi jadwal upload yang berbeda
  juga — jangan mengulang pola jawaban yang sama setiap kali diminta.

Balas HANYA dalam format JSON sesuai schema yang diberikan.`;

    const result = await generateJSON({
      systemInstruction: rules,
      prompt,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.9,
    });

    // Brief di luar konteks Nexus Cube (mis. resep masakan, curhat, dll) - tolak di sini,
    // jangan lanjut proses/tampilkan 4 format kosong yang tidak berguna ke user.
    if (result && result.is_on_topic === false) {
      res.status(400).json({
        ok: false,
        error: `Brief ini sepertinya di luar konteks promosi event Nexus Cube${
          result.off_topic_reason ? `: ${result.off_topic_reason}` : '.'
        } Coba tulis brief yang berhubungan dengan turnamen/event esports.`,
      });
      return;
    }

    // Hitung ulang nama hari dari tanggal (bukan percaya mentah-mentah ke AI) supaya
    // tidak ada kasus AI salah sebut hari - misal bilang tanggalnya Rabu padahal
    // tanggal itu sebenarnya jatuh di hari Kamis.
    if (result && result.calendar_suggestion) {
      for (const key of Object.keys(result.calendar_suggestion)) {
        const item = result.calendar_suggestion[key];
        if (!item || !item.date) continue;
        const parsed = new Date(`${item.date}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
          item.day = parsed.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
        }
      }
    }

    res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error('Error di /api/generate:', err);
    res.status(500).json({ ok: false, error: err.message || 'Terjadi kesalahan di server.' });
  }
};
