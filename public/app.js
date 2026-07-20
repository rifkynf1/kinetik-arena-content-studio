// ---- State ----
const approved = { whatsapp: null, discord_telegram: null, twitter_thread: null, instagram_caption: null };
let currentCalendarSuggestion = null;

// ---- Elements ----
const briefInput = document.getElementById("briefInput");
const generateBtn = document.getElementById("generateBtn");
const generateStatus = document.getElementById("generateStatus");
const resultSection = document.getElementById("resultSection");

const editWhatsapp = document.getElementById("editWhatsapp");
const editDiscord = document.getElementById("editDiscord");
const editTwitter = document.getElementById("editTwitter");
const editInstagram = document.getElementById("editInstagram");
const exportBtn = document.getElementById("exportBtn");

const placeholderPanel = document.getElementById("placeholderPanel");
const placeholderInputs = document.getElementById("placeholderInputs");
const applyPlaceholdersBtn = document.getElementById("applyPlaceholdersBtn");
const allEditTextareas = [editWhatsapp, editDiscord, editTwitter, editInstagram];

const loadSentimentBtn = document.getElementById("loadSentimentBtn");
const sentimentStatus = document.getElementById("sentimentStatus");
const sentimentDashboard = document.getElementById("sentimentDashboard");

// ---- Helpers ----
function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function escapeHtml(str) {
  return String(str === null || str === undefined ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showAlert({ icon = "info", title, text, confirmText = "Oke, Mengerti" }) {
  if (typeof Swal === "undefined") {
    window.alert(`${title ? title + "\n" : ""}${text || ""}`);
    return;
  }
  Swal.fire({
    icon,
    title,
    text,
    confirmButtonText: confirmText,
    background: "#0a111e",
    color: "#e2e8f0",
    confirmButtonColor: "#00f0ff",
    customClass: { popup: "font-rajdhani", confirmButton: "font-cyber" },
  });
}

function setBtnLocked(btn, locked) {
  if (!btn) return;
  btn.dataset.locked = locked ? "true" : "false";
  btn.classList.toggle("opacity-40", locked);
  btn.classList.toggle("cursor-not-allowed", locked);
}

function clearApprovalStatuses() {
  document.querySelectorAll("[data-status]").forEach((el) => (el.textContent = ""));
  Object.keys(approved).forEach((k) => (approved[k] = null));
  document.querySelectorAll("[data-spotcheck]").forEach((cb) => {
    cb.checked = false;
    cb.disabled = true;
    syncSpotCheckVisual(cb.dataset.spotcheck);
  });
  document.querySelectorAll("[data-eval-panel]").forEach((panel) => {
    panel.classList.add("hidden");
    panel.classList.remove("opacity-50");
    const key = panel.dataset.evalPanel;
    const criteriaEl = document.querySelector(`[data-eval-criteria="${key}"]`);
    const overallEl = document.querySelector(`[data-eval-overall="${key}"]`);
    const verdictEl = document.querySelector(`[data-eval-verdict="${key}"]`);
    const summaryEl = document.querySelector(`[data-eval-summary="${key}"]`);
    const violationsEl = document.querySelector(`[data-eval-violations="${key}"]`);
    const staleEl = document.querySelector(`[data-eval-stale="${key}"]`);
    if (criteriaEl) criteriaEl.innerHTML = "";
    if (overallEl) overallEl.textContent = "";
    if (verdictEl) verdictEl.textContent = "";
    if (summaryEl) summaryEl.textContent = "";
    if (violationsEl) violationsEl.innerHTML = "";
    if (staleEl) staleEl.classList.add("hidden");
  });
}

document.querySelectorAll(".approve-btn, [data-requires-spotcheck]").forEach((btn) => setBtnLocked(btn, true));

function renderScheduleBadges() {
  ["whatsapp", "discord_telegram", "twitter_thread", "instagram_caption"].forEach((key) => {
    const el = document.querySelector(`[data-schedule="${key}"]`);
    if (!el) return;
    const sched = currentCalendarSuggestion && currentCalendarSuggestion[key];
    if (!sched) {
      el.textContent = "";
      return;
    }
    el.textContent = sched.day && sched.time
      ? `Upload: ${sched.day}, ${sched.date} pukul ${sched.time} WIB. ${sched.reasoning || ""}`
      : `Jadwal upload: ${sched.reasoning || "Belum bisa ditentukan, tanggal event belum diketahui dari brief."}`;
  });
}

function threadArrayToText(arr) {
  return (arr || []).join("\n\n");
}
function threadTextToArray(text) {
  return text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
}

const ID_MONTHS = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};
function parseFlexibleDate(str) {
  if (!str) return null;
  const s = str.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (m && ID_MONTHS[m[2].toLowerCase()] !== undefined) {
    return new Date(+m[3], ID_MONTHS[m[2].toLowerCase()], +m[1]);
  }
  return null;
}

const UPLOAD_SCHEDULE_DEFAULTS = {
  twitter_thread: { daysBefore: 4, time: "09:00" },
  discord_telegram: { daysBefore: 3, time: "17:00" },
  whatsapp: { daysBefore: 2, time: "19:00" },
  instagram_caption: { daysBefore: 1, time: "12:00" },
};

function recomputeCalendarFromFilledDates(filledDates) {
  const validDates = filledDates.map(parseFlexibleDate).filter((d) => d && !Number.isNaN(d.getTime()));
  if (!validDates.length) return;
  const earliest = validDates.reduce((min, d) => (d < min ? d : min));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  currentCalendarSuggestion = currentCalendarSuggestion || {};
  Object.entries(UPLOAD_SCHEDULE_DEFAULTS).forEach(([key, { daysBefore, time }]) => {
    const uploadDate = new Date(earliest);
    uploadDate.setDate(uploadDate.getDate() - daysBefore);
    if (uploadDate < today) uploadDate.setTime(today.getTime() + 24 * 60 * 60 * 1000);

    const dateStr = `${uploadDate.getFullYear()}-${String(uploadDate.getMonth() + 1).padStart(2, "0")}-${String(uploadDate.getDate()).padStart(2, "0")}`;
    currentCalendarSuggestion[key] = {
      date: dateStr,
      day: uploadDate.toLocaleDateString("id-ID", { weekday: "long" }),
      time,
      reasoning: `Perkiraan otomatis, H-${daysBefore} dari tanggal event yang baru diisi.`,
    };
  });
}

function scanPlaceholders() {
  const found = new Set();
  allEditTextareas.forEach((ta) => {
    const matches = ta.value.match(/\[([^\[\]]+)\]/g) || [];
    matches.forEach((m) => found.add(m.slice(1, -1)));
  });

  if (!found.size) {
    placeholderPanel.classList.add("hidden");
    placeholderInputs.innerHTML = "";
    return;
  }

  placeholderInputs.innerHTML = [...found]
    .map((name) => {
      const safeName = escapeHtml(name);
      return `
    <label class="flex flex-col gap-1 text-xs text-gray-400">
      <span>[${safeName}]</span>
      <input type="text" data-placeholder-input="${safeName}" placeholder="Isi nilai asli untuk ${safeName}..."
        class="bg-black/40 border border-zinc-700 rounded p-2 text-gray-200 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none" />
    </label>
  `;
    })
    .join("");
  placeholderPanel.classList.remove("hidden");
}

applyPlaceholdersBtn.addEventListener("click", () => {
  const inputs = placeholderInputs.querySelectorAll("[data-placeholder-input]");
  const filledDateValues = [];
  inputs.forEach((input) => {
    const value = input.value.trim();
    if (!value) return;
    const name = input.dataset.placeholderInput;
    const token = `[${name}]`;
    allEditTextareas.forEach((ta) => {
      ta.value = ta.value.split(token).join(value);
    });

    if (/tanggal/i.test(name)) filledDateValues.push(value);
  });
  if (filledDateValues.length) recomputeCalendarFromFilledDates(filledDateValues);
  renderScheduleBadges();
  scanPlaceholders();

  allEditTextareas.forEach((ta) => {
    const key = Object.keys(evalTextareaMap).find((k) => evalTextareaMap[k] === ta);
    const panel = document.querySelector(`[data-eval-panel="${key}"]`);
    if (key && panel && !panel.classList.contains("hidden")) runEvaluation(key, { silent: true });
  });
});

// ---- Generate Content ----
generateBtn.addEventListener("click", async () => {
  const brief = briefInput.value.trim();
  if (!brief) {
    generateStatus.textContent = "Isi brief dulu ya, Warriors.";
    generateStatus.className = "text-sm text-rose-400";
    return;
  }

  setBusy(generateBtn, true, "⚡ MENGHASILKAN...", "⚡ GENERATE KONTEN");
  generateStatus.textContent = "Memanggil AI Content Studio...";
  generateStatus.className = "text-sm text-slate-400";
  clearApprovalStatuses();

  resultSection.classList.add("hidden");
  resultSection.classList.remove("flex");
  editWhatsapp.value = "";
  editDiscord.value = "";
  editTwitter.value = "";
  editInstagram.value = "";
  currentCalendarSuggestion = null;
  renderScheduleBadges();
  placeholderPanel.classList.add("hidden");
  placeholderInputs.innerHTML = "";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Gagal generate konten.");

    const { whatsapp, discord_telegram, twitter_thread, instagram_caption, calendar_suggestion } = payload.data;
    editWhatsapp.value = whatsapp || "";
    editDiscord.value = discord_telegram || "";
    editTwitter.value = threadArrayToText(twitter_thread);
    editInstagram.value = instagram_caption || "";

    currentCalendarSuggestion = calendar_suggestion || null;
    renderScheduleBadges();

    resultSection.classList.remove("hidden");
    resultSection.classList.add("flex");
    scanPlaceholders();
    generateStatus.textContent = "Konten berhasil dibuat. Silakan review & edit sebelum disetujui.";
    generateStatus.className = "text-sm text-emerald-400";
  } catch (err) {
    generateStatus.textContent = `Error: ${err.message}`;
    generateStatus.className = "text-sm text-rose-400";
  } finally {
    setBusy(generateBtn, false, "⚡ MENGHASILKAN...", "⚡ GENERATE KONTEN");
  }
});

const formatLabels = {
  whatsapp: "WhatsApp",
  discord_telegram: "Discord/Telegram",
  twitter_thread: "X/Twitter",
  instagram_caption: "Instagram",
};

// ---- Approval buttons ----
document.querySelectorAll(".approve-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.locked === "true") {
      const formatName = formatLabels[btn.dataset.approve] || "ini";
      showAlert({
        icon: "warning",
        title: "Belum Direview",
        text: `Klik "EVALUASI (AI JUDGE)" dulu, lalu centang "Human spot-check" untuk konten ${formatName} ini sebelum bisa disetujui. Ini memastikan tidak ada konten yang di-approve tanpa direview manusia.`,
      });
      return;
    }

    const key = btn.dataset.approve;
    const statusEl = document.querySelector(`[data-status="${key}"]`);

    if (key === "whatsapp") approved.whatsapp = editWhatsapp.value;
    if (key === "discord_telegram") approved.discord_telegram = editDiscord.value;
    if (key === "twitter_thread") approved.twitter_thread = threadTextToArray(editTwitter.value);
    if (key === "instagram_caption") approved.instagram_caption = editInstagram.value;

    statusEl.textContent = "✅ Disetujui";
    statusEl.className = "text-[11px] text-emerald-400";
  });
});

function syncSpotCheckVisual(key) {
  const checkbox = document.querySelector(`[data-spotcheck="${key}"]`);
  if (!checkbox) return;
  const boxEl = checkbox.nextElementSibling;
  const feedbackEl = document.querySelector(`[data-spotcheck-feedback="${key}"]`);
  const approveBtn = document.querySelector(`[data-approve="${key}"]`);
  const copyBtn = document.querySelector(`[data-requires-spotcheck="${key}"]`);

  if (boxEl) {
    boxEl.classList.toggle("border-emerald-400", checkbox.checked);
    boxEl.classList.toggle("bg-emerald-500/20", checkbox.checked);
    boxEl.classList.toggle("opacity-40", checkbox.disabled);
    boxEl.classList.toggle("cursor-not-allowed", checkbox.disabled);
    const icon = boxEl.querySelector("svg");
    if (icon) icon.classList.toggle("opacity-100", checkbox.checked);
  }
  if (feedbackEl) {
    feedbackEl.textContent = checkbox.checked ? "Tersimpan - akan ikut masuk saat kamu klik Export di bawah." : "";
  }
  setBtnLocked(approveBtn, !checkbox.checked);
  setBtnLocked(copyBtn, !checkbox.checked);
}

document.querySelectorAll("[data-spotcheck]").forEach((checkbox) => {
  checkbox.disabled = true;
  const key = checkbox.dataset.spotcheck;
  syncSpotCheckVisual(key);

  checkbox.addEventListener("change", () => syncSpotCheckVisual(key));
  checkbox.addEventListener("click", () => setTimeout(() => syncSpotCheckVisual(key), 0));

  const label = checkbox.closest("label");
  if (label) {
    label.addEventListener("click", (e) => {
      if (checkbox.disabled) {
        e.preventDefault();
        showAlert({
          icon: "warning",
          title: "Belum Bisa Dicentang",
          text: `Klik "EVALUASI (AI JUDGE)" dulu dan pastikan hasilnya "APPROVED" sebelum human spot-check bisa dicentang untuk konten ${
            formatLabels[key] || "ini"
          }. Kalau hasilnya "NEEDS REVISION", perbaiki dulu kontennya lalu evaluasi ulang.`,
        });
      }
    });
  }
});

// ---- Copy buttons ----
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.dataset.locked === "true") {
      const formatName = formatLabels[btn.dataset.requiresSpotcheck] || "ini";
      showAlert({
        icon: "warning",
        title: "Belum Direview",
        text: `Klik "EVALUASI (AI JUDGE)" dulu, lalu centang "Human spot-check" untuk konten ${formatName} ini sebelum bisa disalin. Ini mencegah konten yang belum direview ikut ter-copy ke luar.`,
      });
      return;
    }

    const targetId = btn.dataset.copy;
    const value = document.getElementById(targetId).value;
    try {
      await navigator.clipboard.writeText(value);
      const original = btn.textContent;
      btn.textContent = "DISALIN!";
      setTimeout(() => (btn.textContent = original), 1200);
    } catch {
      showAlert({
        icon: "error",
        title: "Gagal Menyalin",
        text: "Browser menolak akses clipboard (biasanya karena izin belum diberikan atau halaman tidak dibuka lewat HTTPS/localhost). Coba salin manual dengan menyorot teks di kotak konten lalu Ctrl+C.",
      });
    }
  });
});

// ---- Evaluate (LLM-as-Judge) buttons ----
const evalTextareaMap = {
  whatsapp: editWhatsapp,
  discord_telegram: editDiscord,
  twitter_thread: editTwitter,
  instagram_caption: editInstagram,
};

function markEvalStale(key) {
  const panel = document.querySelector(`[data-eval-panel="${key}"]`);
  if (!panel || panel.classList.contains("hidden")) return;

  const staleEl = document.querySelector(`[data-eval-stale="${key}"]`);
  if (staleEl) staleEl.classList.remove("hidden");
  panel.classList.add("opacity-50");

  const spotCheckbox = document.querySelector(`[data-spotcheck="${key}"]`);
  if (spotCheckbox) {
    spotCheckbox.disabled = true;
    spotCheckbox.checked = false;
    syncSpotCheckVisual(key);
  }
}

async function runEvaluation(key, { silent = false } = {}) {
  const btn = document.querySelector(`.evaluate-btn[data-evaluate="${key}"]`);
  const textarea = evalTextareaMap[key];
  const panel = document.querySelector(`[data-eval-panel="${key}"]`);
  const staleEl = document.querySelector(`[data-eval-stale="${key}"]`);
  const criteriaEl = document.querySelector(`[data-eval-criteria="${key}"]`);
  const overallEl = document.querySelector(`[data-eval-overall="${key}"]`);
  const verdictEl = document.querySelector(`[data-eval-verdict="${key}"]`);
  const summaryEl = document.querySelector(`[data-eval-summary="${key}"]`);
  const violationsEl = document.querySelector(`[data-eval-violations="${key}"]`);

  const content = key === "twitter_thread" ? threadTextToArray(textarea.value) : textarea.value;
  if (!content || (Array.isArray(content) && !content.length)) {
    if (!silent) {
      showAlert({
        icon: "warning",
        title: "Konten Masih Kosong",
        text: "Belum ada teks di kartu ini untuk dievaluasi. Klik \"GENERATE KONTEN\" dulu di bagian atas, atau isi manual dulu sebelum menekan Evaluasi.",
      });
    }
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "MENILAI...";

  try {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: key, content, brief: briefInput.value }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Gagal mengevaluasi konten.");

    const { criteria, overall_score, verdict, summary, unfilled_placeholders, overpromise_violations } = payload.data;

    criteriaEl.innerHTML = (criteria || [])
      .map(
        (c) => `
      <div class="flex items-start justify-between gap-3">
        <span class="text-gray-300">${escapeHtml(c.label || c.key)}</span>
        <span class="text-amber-300 font-bold whitespace-nowrap">${escapeHtml(c.score)}/5</span>
      </div>
      <p class="text-gray-500 text-[11px] -mt-1">${escapeHtml(c.comment || "")}</p>
    `
      )
      .join("");

    overallEl.textContent = `Overall: ${overall_score}/5`;
    const isApproved = verdict === "approved";
    verdictEl.textContent = isApproved ? "✔ APPROVED" : "✎ NEEDS REVISION";
    verdictEl.className = isApproved ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
    summaryEl.textContent = summary || "";

    if (violationsEl) {
      const groups = [
        { label: "Placeholder belum diisi", items: unfilled_placeholders },
        { label: "Klaim overpromise", items: overpromise_violations },
      ].filter((g) => g.items && g.items.length);

      violationsEl.innerHTML = groups
        .map(
          (g) => `
        <p class="text-rose-400"><span class="font-bold">${escapeHtml(g.label)}:</span> ${g.items.map((v) => `"${escapeHtml(v)}"`).join(", ")}</p>
      `
        )
        .join("");
    }

    const spotCheckbox = document.querySelector(`[data-spotcheck="${key}"]`);
    if (spotCheckbox) {
      spotCheckbox.disabled = !isApproved;
      if (!isApproved) spotCheckbox.checked = false;
      syncSpotCheckVisual(key);
    }

    if (staleEl) staleEl.classList.add("hidden");
    panel.classList.remove("hidden", "opacity-50");
  } catch (err) {
    showAlert({
      icon: "error",
      title: "Evaluasi Gagal",
      text: `${err.message}. Coba klik "EVALUASI (AI JUDGE)" lagi - kalau masih gagal, kemungkinan API key Gemini belum diset atau sedang kena limit.`,
    });
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

document.querySelectorAll(".evaluate-btn").forEach((btn) => {
  btn.addEventListener("click", () => runEvaluation(btn.dataset.evaluate));
});

Object.entries(evalTextareaMap).forEach(([key, textarea]) => {
  textarea.addEventListener("input", () => markEvalStale(key));
});

// ---- Export ----
function spotCheckNote(key) {
  const checkbox = document.querySelector(`[data-spotcheck="${key}"]`);
  if (!checkbox) return "";
  const agreed = checkbox.checked ? "Human spot-check: DISETUJUI oleh reviewer manusia." : "Human spot-check: belum/tidak disetujui manual.";
  return `\n[${agreed}]`;
}

exportBtn.addEventListener("click", () => {
  const parts = [];
  if (approved.whatsapp) parts.push(`=== BROADCAST WHATSAPP ===\n${approved.whatsapp}${spotCheckNote("whatsapp")}`);
  if (approved.discord_telegram) parts.push(`=== PENGUMUMAN DISCORD/TELEGRAM ===\n${approved.discord_telegram}${spotCheckNote("discord_telegram")}`);
  if (approved.twitter_thread && approved.twitter_thread.length)
    parts.push(`=== UTAS X/TWITTER ===\n${approved.twitter_thread.join("\n\n")}${spotCheckNote("twitter_thread")}`);
  if (approved.instagram_caption) parts.push(`=== CAPTION INSTAGRAM ===\n${approved.instagram_caption}${spotCheckNote("instagram_caption")}`);

  if (!parts.length) {
    showAlert({
      icon: "info",
      title: "Belum Ada yang Disetujui",
      text: "Export cuma mengambil konten yang sudah di-klik \"Setujui\". Review dulu minimal 1 format (evaluasi + centang human spot-check), baru klik Setujui pada kartunya, lalu coba Export lagi.",
    });
    return;
  }

  const blob = new Blob([parts.join("\n\n\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nexus-cube-content-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- Sentiment Dashboard ----
const datasetSelect = document.getElementById("datasetSelect");
const customCsvFile = document.getElementById("customCsvFile");

if (datasetSelect) {
  datasetSelect.addEventListener("change", () => {
    if (datasetSelect.value === "upload") {
      customCsvFile.classList.remove("hidden");
    } else {
      customCsvFile.classList.add("hidden");
    }
  });
}

loadSentimentBtn.addEventListener("click", async () => {
  setBusy(loadSentimentBtn, true, "MENGANALISIS...", "MUAT ANALISIS KOMENTAR");
  sentimentStatus.textContent = "Mengambil & menganalisis komentar dari dataset...";
  sentimentStatus.className = "text-sm text-slate-400";

  try {
    let requestBody = {};
    const mode = datasetSelect ? datasetSelect.value : "comments_dataset.csv";

    if (mode === "upload") {
      const file = customCsvFile.files[0];
      if (!file) throw new Error("Silakan pilih file CSV terlebih dahulu.");
      const fileText = await file.text();
      requestBody = { customCsvText: fileText };
    } else {
      requestBody = { datasetName: mode };
    }

    const res = await fetch("/api/sentiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Gagal memuat analisis sentimen.");

    const { summary, top_themes, items, weekly_summary } = payload.data;

    document.getElementById("statTotal").textContent = summary.total ?? "-";
    document.getElementById("statPositive").textContent = summary.positive ?? "-";
    document.getElementById("statNegative").textContent = summary.negative ?? "-";
    document.getElementById("statNeutral").textContent = summary.neutral ?? "-";

    const weeklyBody = document.getElementById("weeklySummaryBody");
    const spikeBanner = document.getElementById("spikeAlertBanner");
    const spikeText = document.getElementById("spikeAlertText");
    weeklyBody.innerHTML = "";
    const spikeWeeks = [];
    (weekly_summary || []).forEach((w) => {
      const tr = document.createElement("tr");
      if (w.is_spike) tr.className = "bg-red-500/10";
      tr.innerHTML = `
        <td class="p-2 text-slate-300">${escapeHtml(w.week_start)} s.d. ${escapeHtml(w.week_end)}</td>
        <td class="p-2 text-slate-400">${Number(w.total) || 0}</td>
        <td class="p-2 text-emerald-400">${Number(w.positive) || 0}</td>
        <td class="p-2 text-rose-400">${Number(w.negative) || 0}</td>
        <td class="p-2 text-slate-400">${Number(w.neutral) || 0}</td>
        <td class="p-2 text-slate-300">${Math.round((Number(w.negative_ratio) || 0) * 100)}%</td>
        <td class="p-2">${w.is_spike ? '<span class="text-rose-400 font-bold">⚠ SPIKE</span>' : '<span class="text-slate-500">normal</span>'}</td>
      `;
      weeklyBody.appendChild(tr);
      if (w.is_spike) spikeWeeks.push(w);
    });

    if (spikeWeeks.length) {
      spikeBanner.classList.remove("hidden");
      spikeText.textContent = `Terdeteksi ${spikeWeeks.length} minggu dengan lonjakan sentimen negatif (>=30%): ${spikeWeeks
        .map((w) => `${w.week_start} s.d. ${w.week_end} (${Math.round(w.negative_ratio * 100)}% negatif)`)
        .join(", ")}.`;
    } else {
      spikeBanner.classList.add("hidden");
    }

    const themeList = document.getElementById("themeList");
    themeList.innerHTML = "";
    (top_themes || []).forEach((t) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm";
      row.innerHTML = `
        <span class="text-slate-200">${escapeHtml(t.theme)}</span>
        <span class="text-slate-400 text-xs">${Number(t.count) || 0}x &middot; <span class="capitalize">${escapeHtml(t.sentiment_lean)}</span></span>
      `;
      themeList.appendChild(row);
    });

    const tbody = document.getElementById("itemsTableBody");
    tbody.innerHTML = "";
    (items || []).forEach((item) => {
      const tr = document.createElement("tr");
      const sentimentColor =
        item.sentiment === "positive" ? "text-emerald-400" : item.sentiment === "negative" ? "text-rose-400" : "text-slate-400";
      tr.innerHTML = `
        <td class="p-2 text-slate-400">#${escapeHtml(item.id)}</td>
        <td class="p-2 font-medium ${sentimentColor} capitalize">${escapeHtml(item.sentiment)}</td>
        <td class="p-2 text-slate-300 truncate max-w-[120px]" title="${escapeHtml(item.theme)}">${escapeHtml(item.theme)}</td>
        <td class="p-2 text-slate-400 text-xs pr-4">${escapeHtml(item.text || "")}</td>
      `;
      tbody.appendChild(tr);
    });

    sentimentDashboard.classList.remove("hidden");
    sentimentDashboard.classList.add("flex");
    sentimentStatus.textContent = "Analisis selesai.";
    sentimentStatus.className = "text-sm text-emerald-400";
  } catch (err) {
    sentimentStatus.textContent = `Error: ${err.message}`;
    sentimentStatus.className = "text-sm text-rose-400";
  } finally {
    setBusy(loadSentimentBtn, false, "MENGANALISIS...", "MUAT ANALISIS KOMENTAR");
  }
});
