// Runs in page context (NOT extension context).
// Hooks fetch + XHR to capture Netflix's subtitle XML/TTML responses.
// Sends them to the content script via window.postMessage.

(() => {
  const isSubtitleUrl = (url) => {
    if (!url) return false;
    return /nflxvideo\.net|nflxso\.net|oca-/.test(url);
  };

  const looksLikeTTML = (text) =>
    typeof text === "string" &&
    text.length > 100 &&
    /<tt[\s>]/i.test(text.slice(0, 2000));

  const send = (text, url) => {
    window.postMessage(
      { type: "NETFLIX_SUB_CAPTURED", text, url, ts: Date.now() },
      "*"
    );
  };

  // ---- fetch hook ----
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    p.then((res) => {
      try {
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0] && args[0].url;
        if (!isSubtitleUrl(url)) return;
        res
          .clone()
          .text()
          .then((text) => {
            if (looksLikeTTML(text)) send(text, url);
          })
          .catch(() => {});
      } catch (_) {}
    }).catch(() => {});
    return p;
  };

  // ---- XHR hook ----
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    xhr.open = function (method, url) {
      xhr.__url = url;
      return origOpen.apply(this, arguments);
    };
    xhr.addEventListener("load", function () {
      try {
        if (!isSubtitleUrl(xhr.__url)) return;
        const text = xhr.responseText;
        if (looksLikeTTML(text)) send(text, xhr.__url);
      } catch (_) {}
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  console.log("[CustomSubs] page hooks installed");
})();
