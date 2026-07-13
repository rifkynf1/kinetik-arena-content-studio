# Project 5: AI Content Studio & Brand-Voice Assistant

Prototipe tugas mahasiswa (bukan untuk production) — **Kinetik Arena**, Event Organizer (EO)
turnamen esports & gaming fiktif.

## Struktur Proyek

```
/
├── api/
│   ├── _lib/
│   │   ├── gemini.js        # Wrapper panggilan Gemini API (@google/genai) + fallback 3 model
│   │   └── loadContext.js   # Baca rules.md & file CSV di /data
│   ├── generate.js          # POST -> generate konten 4 format dari brief
│   └── sentiment.js         # GET  -> zero-shot sentiment & theme classification
├── data/
│   ├── sample_posts.csv     # Data few-shot (contoh konten lama per format/event)
│   └── comments_dataset.csv # Data komentar peserta/penonton turnamen
├── public/
│   ├── index.html           # UI single-page tema dark/neon esports (Tailwind CDN)
│   └── app.js                # Logic frontend (vanilla JS, fetch ke /api)
├── rules.md                 # System prompt / brand-voice guideline
├── vercel.json               # Rewrite root -> /public
├── package.json
└── .env.example
```

## Tech Stack

- **Frontend**: HTML + Vanilla JS + Tailwind CSS (via CDN) — tema dark/neon esports (font Orbitron/Rajdhani via Google Fonts).
- **Backend**: Node.js sebagai Vercel Serverless Functions (folder `/api`).
- **Parsing CSV**: [`papaparse@^5.5.4`](https://www.npmjs.com/package/papaparse) — dipilih karena bisa parse string secara sinkron (`Papa.parse(text, {header:true})`), lebih simpel di lingkungan serverless dibanding `csv-parser` yang berbasis stream.
- **Model AI**: Gemini lewat **`@google/genai`** — SDK resmi terbaru dari Google (SDK lama `@google/generative-ai` sudah **deprecated** sejak GA `@google/genai` pada Mei 2025). Dipanggil dengan **fallback 3 model berurutan** (`gemini-3.1-flash-lite` → `gemini-2.5-flash-lite` → `gemini-2.5-flash`) — kalau satu model kena limit/overload (HTTP 429/500/503), otomatis lanjut ke model berikutnya (masing-masing punya kuota terpisah). Tidak ada rate-limiting di level aplikasi.

## Setup Lokal

```bash
npm install
cp .env.example .env
# isi GEMINI_API_KEY di file .env dengan API key dari https://aistudio.google.com/apikey

npm install -g vercel   # kalau belum ada
vercel dev
```

Buka `http://localhost:3000`.

## Keamanan API Key

- `GEMINI_API_KEY` **hanya** dibaca di sisi server (`api/_lib/gemini.js`) lewat `process.env`.
- Frontend (`public/app.js`) **tidak pernah** menyentuh API key — ia hanya `fetch()` ke endpoint `/api/generate` dan `/api/sentiment` di domain sendiri.
- Saat deploy ke Vercel, set `GEMINI_API_KEY` di **Project Settings → Environment Variables** (jangan commit `.env`).

## Alur Fitur

1. **Brief → Konten 4 Format**: `public/index.html` kirim brief ke `POST /api/generate`. Endpoint ini membaca `rules.md` (brand-voice Kinetik Arena) + `data/sample_posts.csv` (few-shot) lalu memanggil Gemini dengan `responseSchema` supaya outputnya terstruktur: Broadcast WhatsApp, Pengumuman Discord/Telegram, Utas X/Twitter (array tweet), Caption Instagram — plus saran jadwal posting.
2. **Approval UI**: tiap kartu format bisa diedit langsung di textarea (utas Twitter disimpan sebagai teks, tiap tweet dipisah baris kosong), tombol **Setujui** menyimpan versi final ke state, dan **Export** menggabungkan semua yang disetujui jadi satu file `.txt`.
3. **Sentiment & Theme Digest**: tombol di dashboard memanggil `GET /api/sentiment`, yang membaca `data/comments_dataset.csv` (komentar seputar war tiket, jadwal match, server/lag, bracket, dsb) dan meminta Gemini melakukan zero-shot classification (sentimen + tema utama), lalu ditampilkan sebagai kartu statistik + tabel rincian.

## Catatan

- Ini adalah prototipe untuk keperluan belajar/tugas kuliah — belum ada autentikasi, rate-limiting, caching, atau validasi input yang ketat seperti pada aplikasi production sungguhan.
- Data di `/data/*.csv` adalah data contoh (dummy), silakan diganti dengan data asli sesuai kebutuhan.
