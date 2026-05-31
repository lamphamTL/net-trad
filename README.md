# net-trad

Firefox + Chrome extension to overlay custom subtitles on Netflix.

## Install

Grab latest from [Releases](https://github.com/lamphamTL/net-trad/releases/latest).

**Firefox** — download `netflix-subs-firefox-vX.Y.Z.xpi` → drag onto Firefox window → Add. Auto-updates from then on.

**Chrome / Edge / Brave** — download `netflix-subs-chrome-vX.Y.Z.zip` → unzip to a permanent folder → `chrome://extensions` → enable Developer mode → "Load unpacked" → pick folder. Manual update per release.

## Develop

Source lives in `src/`. Load unpacked from `src/` in Chrome, or `web-ext run --source-dir=src` for Firefox.

## Cut a release

One-time setup: add repo secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` (from https://addons.mozilla.org/developers/addon/api/key/).

```bash
git tag v0.1.1
git push origin v0.1.1
```

GitHub Actions builds + signs + publishes:
- `netflix-subs-firefox-vX.Y.Z.xpi` (Mozilla-signed)
- `netflix-subs-chrome-vX.Y.Z.zip` (Chrome manifest variant)
- `updates.json` (Firefox auto-update manifest)

Or trigger manually via Actions tab → Release → Run workflow → enter version.
