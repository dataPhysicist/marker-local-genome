# Marker

**Local-first** reading of 23andMe-style raw genotype text. Your file is parsed and interpreted in the browser (or in the optional Mac app). Optional enrichment looks up **public rsID metadata only**—never your full file.

Repository: **`dataphysicist/marker-local-genome`** — name matches the npm package and reads clearly as “local genome” tooling (better than a bare `marker`, which is overloaded on GitHub).

This repo contains **no private user data**, no API keys, and no backend.

---

## Use it (no install)

### GitHub Pages

1. Push this repo to GitHub and enable **Pages** (Settings → Pages → **GitHub Actions** as the source).
2. The workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys the `dist/` build on every push to `main`.
3. Live site: **`https://dataphysicist.github.io/marker-local-genome/`** (after the first successful Pages deploy).

**If your site is a username/org Pages repo** (`<username>.github.io` served from `/`), edit the workflow and set `VITE_BASE` to `/` instead of `/ ${{ github.event.repository.name }}/`.

---

## Mac app (installer-style)

### Download (recommended)

1. Open [**Releases**](https://github.com/dataphysicist/marker-local-genome/releases) (after you publish tags—see below).
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
git clone https://github.com/dataphysicist/marker-local-genome.git
cd marker-local-genome
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

## Publish to GitHub (`dataphysicist/marker-local-genome`)

Repository URLs are set in [`package.json`](package.json).

### Fast path (this machine)

**A) Personal access token (works in any terminal, including Cursor)** — create a [classic token](https://github.com/settings/tokens) with **`repo`** scope (or a fine-grained token with **Contents** + **Actions** on `marker-local-genome`).

```bash
cd path/to/marker-local-genome   # repo root (folder with package.json)
export PATH="$PWD/.local/bin:$PATH"
export GH_TOKEN='paste_your_token_here'
./scripts/github-auth.sh
./scripts/publish-github.sh
```

Unset after: `unset GH_TOKEN`

**B) Browser device flow** — run `gh auth login -h github.com -p https -w`, open **https://github.com/login/device**, enter the code shown, then `./scripts/publish-github.sh`.

That creates **`dataphysicist/marker-local-genome`**, sets **`origin`**, and **`git push`**es **`main`**.

### Manual `gh` one-liner

```bash
cd /path/to/marker-local-genome
gh repo create dataphysicist/marker-local-genome --public --source=. --remote=origin --push \
  --description "Marker — local-first genotype reader (browser + optional Mac app)"
```

If the repo **already exists**:

```bash
git remote add origin https://github.com/dataphysicist/marker-local-genome.git
git push -u origin main
```

### After the first push

1. **Settings → Pages → Source: GitHub Actions**.
2. Optional Mac DMG: `git tag v1.0.0 && git push origin v1.0.0`

The workflow [`.github/workflows/release-mac.yml`](.github/workflows/release-mac.yml) attaches DMG/ZIP to the Release.

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
