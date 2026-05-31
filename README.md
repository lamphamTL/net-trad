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

Version lives in the `VERSION` file at repo root. To release:

1. Bump `VERSION` (e.g. `0.1.0` → `0.1.1`)
2. Commit and push to `main`

GitHub Actions runs on every push to `main`. If a release for the current `VERSION` already exists, the workflow is a no-op — so only version bumps trigger an actual release. Each release publishes:

- `netflix-subs-firefox-vX.Y.Z.xpi` (Mozilla-signed)
- `netflix-subs-chrome-vX.Y.Z.zip` (Chrome manifest variant)
- `updates.json` (Firefox auto-update manifest)

Manual trigger also available via Actions tab → Release → Run workflow.
