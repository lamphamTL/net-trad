// Toolbar icon → open detached popup window (real window, not toolbar popup).
// Real windows do NOT close on focus loss, so file picker works inside them.

let uiWindowId = null;

chrome.action.onClicked.addListener(async () => {
  // Reuse existing window if still open
  if (uiWindowId !== null) {
    try {
      const win = await chrome.windows.get(uiWindowId);
      if (win) {
        await chrome.windows.update(uiWindowId, { focused: true });
        return;
      }
    } catch (_) {
      uiWindowId = null;
    }
  }
  const w = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 380,
    height: 620,
  });
  uiWindowId = w.id;
});

chrome.windows.onRemoved.addListener((id) => {
  if (id === uiWindowId) uiWindowId = null;
});
