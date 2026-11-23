# Museflow Studio

A standalone original-music website, inspired by modern music-creation workspaces. It is **not affiliated with OpenMusic** and uses original code and audio synthesis.

## Features

- Responsive create-music interface with prompt, title, mood, and 1–4 unique takes
- **30-second, 1-, 2-, 5-, 10-, 15-, and 30-minute instrumental generation**
- Seven original sound styles: sleep, spa, rain, lo-fi, piano-inspired, cinematic and ambient
- **35 free commercial-use instrumental tracks** with playback, downloads and a button to create a 30-minute composition in a similar style
- Persistent **My library** backed by a local JSON index and audio files
- Secure random seeds, evolving melodies/chord progressions, and SHA-256 exact-audio duplicate checks
- Automated tests and a GitHub Actions workflow that synthesizes and commits the 35 MP3 files

**Important:** The free generator produces procedurally synthesized instrumentals, **not neural AI music**. Different seeds reduce repetition but neither seed variation nor hash comparison guarantees that tracks are unlike all existing music. The bundled catalogue has a nonexclusive project licence; commercial use does not guarantee copyright-claim-free uploads.

## Get started on your Mac

1. Install [Node.js 20 or later](https://nodejs.org/).
2. On this repository page, choose **Code → Download ZIP** and unzip the folder.
3. Open Terminal and enter the extracted folder. For example:

   ```bash
   cd ~/Downloads/museflow-studio-main
   node server.js
   ```

4. In a browser open **http://127.0.0.1:4173**.

You can also run `bash start.command` from the extracted directory.

The studio uses only Node's built-in libraries, so **npm install is not required**.

### MP3 versus WAV

- Installing **FFmpeg** is recommended for MP3 exports: `brew install ffmpeg` (if you have Homebrew).
- Without FFmpeg, the composer can export WAV.
- The catalogue is playable on demand. If the 35 MP3 assets have not yet been built, the server synthesizes missing tracks when first requested.

## Free commercial-use music

The bundled MP3 catalogue is built automatically with [GitHub Actions](.github/workflows/build-catalog.yml) and committed to `public/catalog-audio/`. This workflow takes longer than ordinary checks because it renders 35 real audio files.

View progress in the **Actions → Build original MP3 library** tab. You can also start it manually with **Run workflow**. If the workflow cannot push audio files due to repository permissions, go to **Settings → Actions → General → Workflow permissions**, allow **Read and write permissions**, and rerun the workflow.

To build locally (requires FFmpeg):

```bash
npm run build:catalog
```

Please read [MUSIC_LICENSE.txt](public/MUSIC_LICENSE.txt) before commercially distributing music. Do not register the shared instrumental catalogue in Content ID as exclusively yours.

## Originality

Generated takes receive fresh secure random seeds. The synthesizer varies melody fragments and harmonic progression over longer pieces and checks output file SHA-256 hashes for exact duplicate recordings in your local generated-track library. This detects **exact duplicate audio**, not all perceptually similar compositions. Musical or copyright originality cannot be guaranteed.

## Project structure

| Path | Purpose |
| --- | --- |
| `server.js` | Local Node server and generation job API |
| `ambient-engine.js` | Standalone procedural music engine |
| `public/index.html` | Responsive interface and web player |
| `public/catalog-audio/` | 35 generated catalog MP3s |
| `scripts/build-catalog.js` | Reproducible catalog builder |
| `data/` | Local generated song files (not committed) |
| `tests/` | Node test suite |
| `.github/workflows/` | Automated tests and MP3 build |

### Test

```bash
npm test
```

### Hosting limitations

GitHub stores the **source code and catalogue**. GitHub Pages alone cannot execute Node.js music-generation jobs or preserve the local audio library. For a public live website, deploy on a Node.js hosting service with persistent storage. Do not expose this local single-user server publicly without adding authentication, rate limiting and file storage management.

### Existing saved music

If you previously used another Museflow installation, back up its entire `data/` directory before replacing files. Do not overwrite that directory with a new download if it contains your music.
