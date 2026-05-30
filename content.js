// Runs inside Netflix watch pages (extension context).
// 1. Injects inject.js into page so it can hook fetch/XHR.
// 2. Listens for captured Netflix subtitle XML, stores it.
// 3. Renders user-uploaded subs as overlay on top of <video>.

(() => {
  // ---------- 0. Inject page-context script ----------
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inject.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.error("[CustomSubs] inject failed", e);
  }

  // ---------- 0a. Current Netflix title tracking ----------
  function getCurrentTitleId() {
    const m = location.pathname.match(/\/watch\/(\d+)/);
    return m ? m[1] : null;
  }

  let currentTitleId = null;
  function syncCurrentTitle() {
    const id = getCurrentTitleId();
    if (id && id !== currentTitleId) {
      currentTitleId = id;
      console.log("[CustomSubs] title changed to", id);
      chrome.storage.local.set({ currentTitleId: id });
      loadFromStorage();
    }
  }
  syncCurrentTitle();

  // Detect SPA URL changes (Netflix uses pushState)
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      syncCurrentTitle();
    }
  }, 500);

  // ---------- 1. Capture Netflix subs sent from inject.js ----------
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.type !== "NETFLIX_SUB_CAPTURED") return;
    const titleId = getCurrentTitleId();
    if (!titleId) {
      console.warn("[CustomSubs] capture ignored — no title ID in URL");
      return;
    }
    chrome.storage.local.get(["capturedByTitle"], (data) => {
      const map = data.capturedByTitle || {};
      map[titleId] = { ttml: d.text, capturedAt: d.ts, capturedUrl: d.url };
      chrome.storage.local.set({ capturedByTitle: map, currentTitleId: titleId });
      console.log(
        "[CustomSubs] captured subs for title",
        titleId,
        d.text.length,
        "chars"
      );
    });
  });

  // ---------- 2. Subtitle render state ----------
  let cues = [];
  let offset = 0;
  let overlayEl = null;
  let videoEl = null;
  let rafId = null;

  function loadFromStorage() {
    const titleId = getCurrentTitleId();
    chrome.storage.local.get(["subsByTitle", "offset"], (data) => {
      const entry = (data.subsByTitle || {})[titleId];
      if (entry && entry.text) {
        const cleaned = entry.text.replace(/^﻿/, "");
        cues = entry.format === "vtt" ? parseVTT(cleaned) : parseSRT(cleaned);
        console.log(
          `[CustomSubs] Loaded ${cues.length} cues for title ${titleId}. First:`,
          cues[0]
        );
        if (cues.length === 0) {
          console.warn(
            "[CustomSubs] 0 cues parsed. First 300 chars:",
            cleaned.slice(0, 300)
          );
        }
      } else {
        cues = [];
        console.log(
          `[CustomSubs] No subs for title ${titleId} — overlay will be empty`
        );
      }
      if (typeof data.offset === "number") offset = data.offset;
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    console.log("[CustomSubs] storage changed", area, Object.keys(changes));
    if (changes.subsByTitle) loadFromStorage();
    if (changes.offset) offset = changes.offset.newValue || 0;
  });

  // Fallback: popup can force a reload via runtime message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "RELOAD_SUBS") {
      console.log("[CustomSubs] reload requested by popup");
      loadFromStorage();
    }
  });

  // ---------- 3. Parsers ----------
  function parseSRT(text) {
    // Normalize: strip BOM, normalize line endings, normalize fancy dashes
    text = text
      .replace(/^﻿/, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[–—]+>/g, "-->"); // em/en dash variants
    const result = [];
    // Split on lines containing a timecode arrow, walk forward
    const lines = text.split("\n");
    const timeRe =
      /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(timeRe);
      if (!m) continue;
      const start = toSec(m[1], m[2], m[3], m[4]);
      const end = toSec(m[5], m[6], m[7], m[8]);
      const textLines = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "") {
        // stop if we hit next cue (an index line followed by timecode)
        if (/^\d+$/.test(lines[j].trim()) && lines[j + 1] && timeRe.test(lines[j + 1])) break;
        textLines.push(lines[j]);
        j++;
      }
      result.push({ start, end, text: textLines.join("\n").trim() });
      i = j;
    }
    return result;
  }

  function parseVTT(text) {
    return parseSRT(text.replace("WEBVTT", "").trim());
  }

  function toSec(h, m, s, ms) {
    return +h * 3600 + +m * 60 + +s + +ms / 1000;
  }

  // ---------- 4. Overlay mount ----------
  function ensureOverlay() {
    videoEl = document.querySelector("video");
    if (!videoEl) return false;
    // Try multiple containers; fall back to video's parent
    const container =
      document.querySelector(".watch-video") ||
      document.querySelector(".NFPlayer") ||
      document.querySelector('[data-uia="video-canvas"]') ||
      videoEl.parentElement;
    if (!container) return false;
    if (!overlayEl || !container.contains(overlayEl)) {
      overlayEl = document.createElement("div");
      overlayEl.id = "custom-subs-overlay";
      container.appendChild(overlayEl);
      console.log("[CustomSubs] overlay mounted into", container);
    }
    return true;
  }

  function tick() {
    if (videoEl && overlayEl) {
      const t = videoEl.currentTime + offset;
      const cue = cues.find((c) => t >= c.start && t <= c.end);
      const newText = cue ? cue.text : "";
      if (overlayEl.dataset.last !== newText) {
        overlayEl.innerHTML = escapeHtml(newText).replace(/\n/g, "<br>");
        overlayEl.dataset.last = newText;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ---------- 5. SPA navigation watcher ----------
  const observer = new MutationObserver(() => {
    const v = document.querySelector("video");
    if (v && v !== videoEl) {
      videoEl = v;
      ensureOverlay();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ---------- 6. Boot ----------
  function boot() {
    if (ensureOverlay()) {
      if (rafId) cancelAnimationFrame(rafId);
      tick();
    } else {
      setTimeout(boot, 1000);
    }
  }

  loadFromStorage();
  boot();
})();
