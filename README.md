# Marker

**Local-first** reading of 23andMe-style raw genotype text. Your file is parsed and interpreted in the browser (or in the optional Mac app). Optional enrichment looks up **public rsID metadata only**—never your full file.

This repository contains **no private user data**, no API keys, and no backend. Safe to make public on GitHub.

---

## Use it (no install)

### GitHub Pages

1. Push this repo to GitHub and enable **Pages** (Settings → Pages → **GitHub Actions** as the source).
2. The workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys the `dist/` build on every push to `main`.
3. Open: `https://<your-username>.github.io/<repo-name>/`

**If your site is a username/org Pages repo** (`<username>.github.io` served from `/`), edit the workflow and set `VITE_BASE` to `/` instead of `/ ${{ github.event.repository.name }}/`.

---

## Mac app (installer-style)

### Download (recommended)

1. Open [**Releases**](https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/releases) on your fork (after you publish tags—see below).
2. Download **`Marker-<version>-arm64.dmg`** for Apple Silicon Macs (GitHub Actions runner builds arm64).
3. Open the DMG, drag **Marker** into **Applications**.
4. **First launch (unsigned build):** Right-click **Marker** → **Open** → confirm. This is normal when Apple Developer signing isn’t configured.

The Mac build wraps the same web UI in [Electron](electron/main.mjs); it serves `dist/` only on `127.0.0.1` inside your machine so Web Workers behave reliably—**your genotype file never leaves your Mac.**

### Intel Macs

CI currently publishes an **arm64** DMG from `macos-latest`. On Intel, use **GitHub Pages** (above), or build locally on an Intel Mac (below).

---

## Develop locally

Requirements: **Node.js 22+** (or 20 LTS).

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
npm ci
npm run dev
```

- Tests: `npm test`
- Production bundle: `npm run build`

### Run the desktop shell locally (after build)

```bash
npm run electron:start
```

---

## Build a Mac `.dmg` yourself

Must run on **macOS** with Xcode command-line tools available:

```bash
npm ci
npm run dist:mac
```

Artifacts appear under `release/` (DMG + ZIP).

---

## Publish to GitHub (first time)

1. **Replace placeholders** in [`package.json`](package.json) (`YOUR_GITHUB_USERNAME`, `YOUR_REPO_NAME`) and optionally bump `version`.
2. Initialize git and push:

```bash
git init
git add .
git commit -m "Initial publish: Marker local genome reader"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

3. Enable **GitHub Pages** from Actions (see above).
4. **Optional Mac release:** tag and push:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow [`.github/workflows/release-mac.yml`](.github/workflows/release-mac.yml) builds the DMG/ZIP and attaches them to the Release.

---

## Knowledge base

Curated loci are generated from [`scripts/generate_kb.py`](scripts/generate_kb.py) into [`src/data/kb.json`](src/data/kb.json). Regenerate after editing the script:

```bash
python3 scripts/generate_kb.py
```

---

## License

[MIT](LICENSE)

See also [SECURITY.md](SECURITY.md).
