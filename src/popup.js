console.log("[popup] script loaded");

const titleIdEl = document.getElementById("titleId");
const fileInput = document.getElementById("file");
const offsetInput = document.getElementById("offset");
const clearBtn = document.getElementById("clear");
const downloadBtn = document.getElementById("download");
const captureStatusEl = document.getElementById("captureStatus");
const uploadStatusEl = document.getElementById("uploadStatus");

let currentTitleId = null;

function refreshCurrentTitle() {
  chrome.storage.local.get(["currentTitleId"], (d) => {
    currentTitleId = d.currentTitleId || null;
    titleIdEl.textContent =
      currentTitleId || "(open a Netflix /watch/ page)";
    refreshCaptureStatus();
    refreshUploadStatus();
  });
}

refreshCurrentTitle();
chrome.storage.onChanged.addListener((c) => {
  if (c.currentTitleId) refreshCurrentTitle();
  if (c.capturedByTitle) refreshCaptureStatus();
  if (c.subsByTitle) refreshUploadStatus();
});

// ---------- Capture / Download ----------
function refreshCaptureStatus() {
  if (!currentTitleId) {
    captureStatusEl.textContent = "No current title.";
    downloadBtn.disabled = true;
    return;
  }
  chrome.storage.local.get(["capturedByTitle"], (data) => {
    const entry = (data.capturedByTitle || {})[currentTitleId];
    if (entry && entry.ttml) {
      const when = new Date(entry.capturedAt || Date.now()).toLocaleTimeString();
      captureStatusEl.textContent = `Captured at ${when} (${entry.ttml.length} chars) for title ${currentTitleId}`;
      downloadBtn.disabled = false;
    } else {
      captureStatusEl.textContent = `No subs captured for title ${currentTitleId}. Play with subtitles ON.`;
      downloadBtn.disabled = true;
    }
  });
}

downloadBtn.addEventListener("click", () => {
  if (!currentTitleId) return;
  chrome.storage.local.get(["capturedByTitle"], (data) => {
    const entry = (data.capturedByTitle || {})[currentTitleId];
    if (!entry) return;
    const srt = ttmlToSrt(entry.ttml);
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netflix_${currentTitleId}.srt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});

// ---------- Upload ----------
function refreshUploadStatus() {
  if (!currentTitleId) {
    uploadStatusEl.textContent = "";
    return;
  }
  chrome.storage.local.get(["subsByTitle", "offset"], (data) => {
    if (typeof data.offset === "number") offsetInput.value = data.offset;
    const entry = (data.subsByTitle || {})[currentTitleId];
    uploadStatusEl.textContent = entry
      ? `Loaded ${entry.format || "srt"}, ${entry.text.length} chars for title ${currentTitleId}`
      : `No subs loaded for title ${currentTitleId}.`;
  });
}

async function handleFile(file) {
  if (!file) {
    uploadStatusEl.textContent = "No file.";
    return;
  }
  if (!currentTitleId) {
    uploadStatusEl.textContent =
      "No current Netflix title. Open Netflix /watch/ first.";
    return;
  }
  uploadStatusEl.textContent = `Reading ${file.name}...`;
  try {
    const text = await file.text();
    const format = file.name.toLowerCase().endsWith(".vtt") ? "vtt" : "srt";
    await saveSubsForTitle(currentTitleId, text, format);
    uploadStatusEl.textContent = `Loaded ${file.name} (${text.length} chars) — applied to title ${currentTitleId}`;
    pingTabs();
  } catch (err) {
    console.error("[popup] file read error:", err);
    uploadStatusEl.textContent = "Read error: " + err.message;
  }
}

fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

// Drag-and-drop zone
const dropZone = document.getElementById("dropZone");
if (dropZone) {
  ["dragenter", "dragover"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = "#e50914";
      dropZone.style.background = "#1f1f1f";
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = "#555";
      dropZone.style.background = "transparent";
    })
  );
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
}

function saveSubsForTitle(titleId, text, format) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["subsByTitle"], (data) => {
      const map = data.subsByTitle || {};
      map[titleId] = { text, format };
      chrome.storage.local.set({ subsByTitle: map }, () => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

function pingTabs() {
  chrome.tabs.query({ url: "*://*.netflix.com/*" }, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: "RELOAD_SUBS" }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

offsetInput.addEventListener("change", () => {
  chrome.storage.local.set({ offset: parseFloat(offsetInput.value) || 0 });
});

clearBtn.addEventListener("click", () => {
  if (!currentTitleId) return;
  chrome.storage.local.get(["subsByTitle"], (data) => {
    const map = data.subsByTitle || {};
    delete map[currentTitleId];
    chrome.storage.local.set({ subsByTitle: map }, () => {
      uploadStatusEl.textContent = `Cleared subs for title ${currentTitleId}.`;
      pingTabs();
    });
  });
});

// ---------- TTML → SRT converter ----------
function ttmlToSrt(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const root = doc.getElementsByTagName("tt")[0];
  const tickRate =
    (root && parseInt(root.getAttribute("ttp:tickRate"), 10)) || 10000000;
  const ps = doc.getElementsByTagName("p");
  let out = "";
  let idx = 1;
  for (const p of ps) {
    const begin = parseTtmlTime(p.getAttribute("begin"), tickRate);
    const end = parseTtmlTime(p.getAttribute("end"), tickRate);
    if (begin == null || end == null) continue;
    const text = extractText(p).trim();
    if (!text) continue;
    out += `${idx++}\n${fmtSrt(begin)} --> ${fmtSrt(end)}\n${text}\n\n`;
  }
  return out;
}

function parseTtmlTime(v, tickRate) {
  if (!v) return null;
  let m = v.match(/^(\d+)t$/);
  if (m) return parseInt(m[1], 10) / tickRate;
  m = v.match(/^(\d+):(\d+):(\d+)(?:[.,](\d+))?$/);
  if (m) {
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4] ? parseFloat("0." + m[4]) : 0);
  }
  m = v.match(/^([\d.]+)(s|ms)$/);
  if (m) return m[2] === "ms" ? parseFloat(m[1]) / 1000 : parseFloat(m[1]);
  return null;
}

function extractText(node) {
  let out = "";
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.nodeValue;
    else if (c.nodeName.toLowerCase() === "br") out += "\n";
    else out += extractText(c);
  }
  return out;
}

function fmtSrt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

console.log("[popup] all listeners attached.");
