# Marker

**Local-first** reading of 23andMe-style raw genotype text. Your file is parsed and interpreted in the browser (or in the optional Mac app). Optional enrichment looks up **public rsID metadata only**—never your full file.

Repository: **`dataPhysicist/marker-local-genome`** — name matches the npm package and reads clearly as “local genome” tooling (better than a bare `marker`, which is overloaded on GitHub).

This repo contains **no private user data**, no API keys, and no backend.

---

## Optional enrichment

The app works fully offline after your genotype file is loaded. If you click **Run enrichment**, the browser sends only selected **rsID strings** from interpreted findings to **MyVariant.info**. It never sends your genotype calls, raw file contents, filename, or local report data.

When MyVariant returns usable metadata, Marker extracts:

- gene names from current MyVariant shapes such as `dbnsfp.genename`, `dbnsfp.ensemblgene`, `dbsnp.gene`, `cadd.genename`, and ClinVar gene fields;
- clinical significance labels from nested ClinVar / `rcv_accession` fields;
- outbound reference links for MyVariant.info, dbSNP, ClinVar search, and PubMed search.

The enrichment card reports exactly how many rsIDs were fetched, how many had parsed fields, how many unique gene names were found, how many clinical-significance rows were found, and how many requests failed. Full JSON export includes the enrichment cache as `enrichment_optional`; raw JSON export stays genotype/call focused.

If the API is offline, blocked by the browser, or returns links but no usable fields for the queried rsIDs, Marker says so instead of treating that as a successful enrichment.

---

## Use it (no install)

### GitHub Pages

1. Push this repo to GitHub and enable **Pages** (Settings → Pages → **GitHub Actions** as the source).
2. The workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys the `dist/` build on every push to `main`.
3. Live site: **`https://dataphysicist.github.io/marker-local-genome/`** (after the first successful Pages deploy; GitHub normalizes username to lowercase here).

**If your site is a username/org Pages repo** (`<username>.github.io` served from `/`), edit the workflow and set `VITE_BASE` to `/` instead of `/ ${{ github.event.repository.name }}/`.

---

## Mac app (installer-style)

### Download (recommended)

1. Open [**Releases**](https://github.com/dataPhysicist/marker-local-genome/releases) (after you publish tags—see below).
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
git clone https://github.com/dataPhysicist/marker-local-genome.git
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

Everything below runs on **your Mac**. Cross-compiling macOS installers from Linux or Windows is not supported here.

### Prerequisites

1. **macOS** (Apple Silicon or Intel).
2. **Node.js** — this repo declares **`>=20`** in [`package.json`](package.json); [`.nvmrc`](.nvmrc) pins **`22`**. Match one of those so `npm ci` and `electron-builder` behave consistently:

   ```bash
   node -v    # expect v20.x or v22.x (or newer LTS you’ve validated)
   ```

   If you use [nvm](https://github.com/nvm-sh/nvm): `nvm install && nvm use` from the repo root (reads `.nvmrc`).

3. **Xcode Command Line Tools** (compiler toolchain `electron-builder` expects):

   ```bash
   xcode-select -p
   ```

   If that errors, install tools once:

   ```bash
   xcode-select --install
   ```

   Accept the GUI prompt and wait until the install finishes.

4. **Git** (to clone). Optional sanity check before packaging:

   ```bash
   npm test
   ```

### Copy-paste: clone → DMG + ZIP

Run from a terminal **outside** Cursor if you prefer; the paths are the same.

```bash
# 1) Get the source
git clone https://github.com/dataPhysicist/marker-local-genome.git
cd marker-local-genome

# 2) Use a supported Node (see Prerequisites)
command -v nvm >/dev/null 2>&1 && nvm install && nvm use

# 3) Install deps exactly as lockfile (requires package-lock.json)
npm ci

# 4) (Optional) Verify the app logic before packaging
npm test

# 5) Build Vite bundle + Electron artifacts (DMG and ZIP)
npm run dist:mac
```

That script expands to **`npm run build`** (TypeScript + Vite) then **`electron-builder --mac dmg zip`**, per [`package.json`](package.json).

### Where the files land

Packaged output directory: **`release/`** (`build.directories.output` in `package.json`).

After a successful run you should see at least:

- **`Marker-<version>-<arch>.dmg`** — e.g. `Marker-1.0.0-arm64.dmg` on Apple Silicon, or `Marker-1.0.0-x64.dmg` on Intel (`dmg.artifactName` uses `${productName}-${version}-${arch}.${ext}`).
- A **ZIP** next to it (same folder; name follows electron-builder’s default for the `zip` mac target — still under `release/`).

List them:

```bash
ls -la release/
```

Install: open the DMG, drag **Marker** into **Applications**.

### First launch (unsigned build)

Signing is intentionally disabled (`mac.identity: null` in [`package.json`](package.json)). The first time you open the app, **Control-click or right-click Marker → Open → Open** (or **System Settings → Privacy & Security → Open Anyway** after a block). That is normal for a local/developer build without an Apple Developer ID.

### Architecture notes

By default **electron-builder builds for the CPU architecture of the machine you run on**. To produce an **arm64** DMG, run the steps on Apple Silicon; for **x64**, run on an Intel Mac (or use CI). Building both architectures in one go is possible with electron-builder’s multi-arch options, but that is slower and not required for a single-machine install.

### If something fails

| Symptom | What to try |
|--------|-------------|
| `xcode-select: error` or missing `clang` | Finish **Xcode Command Line Tools** install (`xcode-select --install`). |
| `npm ci` errors | Use Node **20+**, ensure you are in the repo root with `package-lock.json` present, delete `node_modules` and run `npm ci` again. |
| Stale or confusing `release/` output | Remove old artifacts: `rm -rf release/*` then `npm run dist:mac` again. |
| Hangs or signing/keychain prompts you don’t want | For a fully local unsigned build you can disable auto discovery: `export CSC_IDENTITY_AUTO_DISCOVERY=false` then re-run `npm run dist:mac`. |

---

## Publish to GitHub (`dataPhysicist/marker-local-genome`)

Repository URLs are set in [`package.json`](package.json).

### Fast path (this machine)

**Prerequisite:** GitHub CLI in `.local/bin/gh` (bundled path). If missing: `chmod +x scripts/ensure-gh.sh && ./scripts/ensure-gh.sh`

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

That creates **`dataPhysicist/marker-local-genome`**, sets **`origin`**, and **`git push`**es **`main`**.

### Manual `gh` one-liner

```bash
cd /path/to/marker-local-genome
gh repo create dataPhysicist/marker-local-genome --public --source=. --remote=origin --push \
  --description "Marker — local-first genotype reader (browser + optional Mac app)"
```

If the repo **already exists**:

```bash
git remote add origin https://github.com/dataPhysicist/marker-local-genome.git
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
