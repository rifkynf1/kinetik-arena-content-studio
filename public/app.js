// ---- State ----
const approved = { whatsapp: null, discord_telegram: null, twitter_thread: null, instagram_caption: null };

// ---- Elements ----
const briefInput = document.getElementById("briefInput");
const generateBtn = document.getElementById("generateBtn");
const generateStatus = document.getElementById("generateStatus");
const resultSection = document.getElementById("resultSection");

const editWhatsapp = document.getElementById("editWhatsapp");
const editDiscord = document.getElementById("editDiscord");
const editTwitter = document.getElementById("editTwitter");
const editInstagram = document.getElementById("editInstagram");
const calendarSuggestion = document.getElementById("calendarSuggestion");
const exportBtn = document.getElementById("exportBtn");

const loadSentimentBtn = document.getElementById("loadSentimentBtn");
const sentimentStatus = document.getElementById("sentimentStatus");
const sentimentDashboard = document.getElementById("sentimentDashboard");

// ---- Helpers ----
function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function clearApprovalStatuses() {
  document.querySelectorAll("[data-status]").forEach((el) => (el.textContent = ""));
  Object.keys(approved).forEach((k) => (approved[k] = null));
}

// Thread disimpan di textarea sebagai teks, tiap tweet dipisah baris kosong ("\n\n")
function threadArrayToText(arr) {
  return (arr || []).join("\n\n");
}
function threadTextToArray(text) {
  return text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
}

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

    calendarSuggestion.innerHTML = calendar_suggestion
      ? `<span class="font-display font-bold text-white">${calendar_suggestion.best_day}, ${calendar_suggestion.best_time}</span>
         <span class="text-slate-400"> — ${calendar_suggestion.reasoning}</span>`
      : "Tidak ada saran jadwal.";

    resultSection.classList.remove("hidden");
    generateStatus.textContent = "Konten berhasil dibuat. Silakan review & edit sebelum disetujui.";
    generateStatus.className = "text-sm text-emerald-400";
  } catch (err) {
    generateStatus.textContent = `Error: ${err.message}`;
    generateStatus.className = "text-sm text-rose-400";
  } finally {
    setBusy(generateBtn, false, "⚡ MENGHASILKAN...", "⚡ GENERATE KONTEN");
  }
});

// ---- Approval buttons ----
document.querySelectorAll(".approve-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
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

// ---- Copy buttons ----
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const targetId = btn.dataset.copy;
    const value = document.getElementById(targetId).value;
    try {
      await navigator.clipboard.writeText(value);
      const original = btn.textContent;
      btn.textContent = "DISALIN!";
      setTimeout(() => (btn.textContent = original), 1200);
    } catch {
      alert("Gagal menyalin ke clipboard.");
    }
  });
});

// ---- Export ----
exportBtn.addEventListener("click", () => {
  const parts = [];
  if (approved.whatsapp) parts.push(`=== BROADCAST WHATSAPP ===\n${approved.whatsapp}`);
  if (approved.discord_telegram) parts.push(`=== PENGUMUMAN DISCORD/TELEGRAM ===\n${approved.discord_telegram}`);
  if (approved.twitter_thread && approved.twitter_thread.length)
    parts.push(`=== UTAS X/TWITTER ===\n${approved.twitter_thread.join("\n\n")}`);
  if (approved.instagram_caption) parts.push(`=== CAPTION INSTAGRAM ===\n${approved.instagram_caption}`);

  if (!parts.length) {
    alert("Belum ada konten yang disetujui. Klik 'Setujui' pada minimal satu format dulu.");
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
loadSentimentBtn.addEventListener("click", async () => {
  setBusy(loadSentimentBtn, true, "MENGANALISIS...", "MUAT ANALISIS KOMENTAR");
  sentimentStatus.textContent = "Mengambil & menganalisis komentar dari dataset...";
  sentimentStatus.className = "text-sm text-slate-400";

  try {
    const res = await fetch("/api/sentiment");
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Gagal memuat analisis sentimen.");

    const { summary, top_themes, items } = payload.data;

    document.getElementById("statTotal").textContent = summary.total ?? "-";
    document.getElementById("statPositive").textContent = summary.positive ?? "-";
    document.getElementById("statNegative").textContent = summary.negative ?? "-";
    document.getElementById("statNeutral").textContent = summary.neutral ?? "-";

    const themeList = document.getElementById("themeList");
    themeList.innerHTML = "";
    (top_themes || []).forEach((t) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm";
      row.innerHTML = `
        <span class="text-slate-200">${t.theme}</span>
        <span class="text-slate-400 text-xs">${t.count}x · <span class="capitalize">${t.sentiment_lean}</span></span>
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
        <td class="p-2 text-slate-400">#${item.id}</td>
        <td class="p-2 font-medium ${sentimentColor} capitalize">${item.sentiment}</td>
        <td class="p-2 text-slate-300">${item.theme}</td>
      `;
      tbody.appendChild(tr);
    });

    sentimentDashboard.classList.remove("hidden");
    sentimentStatus.textContent = "Analisis selesai.";
    sentimentStatus.className = "text-sm text-emerald-400";
  } catch (err) {
    sentimentStatus.textContent = `Error: ${err.message}`;
    sentimentStatus.className = "text-sm text-rose-400";
  } finally {
    setBusy(loadSentimentBtn, false, "MENGANALISIS...", "MUAT ANALISIS KOMENTAR");
  }
});
