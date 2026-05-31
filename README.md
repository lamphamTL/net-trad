# net-trad

Firefox + Chrome extension to overlay custom subtitles on Netflix.

## Install

Grab latest from [Releases](https://github.com/lamphamTL/net-trad/releases/latest).

**Firefox** — download `netflix-subs-firefox-vX.Y.Z.xpi` → drag onto Firefox window → Add. Auto-updates from then on.

**Chrome / Edge / Brave** — download `netflix-subs-chrome-vX.Y.Z.zip` → unzip to a permanent folder → `chrome://extensions` → enable Developer mode → "Load unpacked" → pick folder. Manual update per release.

## Develop

Source lives in `src/`. Load unpacked from `src/` in Chrome, or `web-ext run --source-dir=src` for Firefox.
