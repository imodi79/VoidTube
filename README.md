<h1 align="center">VoidTube</h1>  

<p align="center">
  <img src="https://img.shields.io/github/license/imodi79/voidtube?style=flat&cacheSeconds=300" alt="License" />
  <img
    src="https://img.shields.io/github/v/release/imodi79/voidtube?display_name=tag&sort=semver&style=flat&cacheSeconds=300"
    alt="Latest release"
  />
  <img
    src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-1f6feb?style=flat"
    alt="Platform macOS Windows Linux"
  />
  <img src="https://img.shields.io/badge/Built%20with-Electron-47848f?style=flat" alt="Built with Electron" />
  <img src="https://img.shields.io/badge/YouTube-Player-ff0000?style=flat" alt="YouTube Player" />
</p>

---

<p align="center">
🎬 VoidTube is a focused desktop YouTube player. It keeps playback clean, puts your channels on the right, and a persistent play history on the left.
</p>

![VoidTube Screenshot](resource/screenshot1.webp)


<p align="center">
You can use this project for anything and for as long as you want. I am happy if it helps you.
If you like the app and want to support it, feel free to <a href="https://paypal.me/istvanmodi">buy me a coffee</a> ☕.
Donations are optional. This is not a paid product and donations do not unlock features or services. ❤️
</p>


---

## Table of contents

- [What this app is for](#what-this-app-is-for)
- [How it works (short)](#how-it-works-short)
- [Screenshots](#screenshots)
- [Download (prebuilt)](#download-prebuilt)
- [Quick start](#quick-start)
- [Build (step by step)](#build-step-by-step)
- [Google Cloud setup (why this is needed)](#google-cloud-setup-why-this-is-needed)
- [Configuration](#configuration)
- [Notes / limitations](#notes--limitations)
- [Project status / maintenance](#project-status--maintenance)
- [License](#license)

---

## What this app is for

VoidTube is a clean, distraction‑free way to watch YouTube on desktop:

- ▶️ Play a single video in the main view, or browse search/channel results in a grid.
- 🧠 Keep a local play history with resume position per video.
- 🔊 Control volume globally from one slider.
- 📺 Browse your subscriptions in the right sidebar (ordered by your clicks / recency).
- 🧼 Toggle a full, clean view for distraction‑free watching.
- 🌐 If a video cannot be embedded, open it in the browser instead.

## How it works (short)

VoidTube uses the YouTube IFrame Player API for playback.  
It uses the YouTube Data API for search, subscriptions, and channel browsing.  
Auth is handled via the OAuth device code flow (a safe, browser‑based login).


## Screenshots

<table border="0" cellspacing="10" cellpadding="0">
  <tr>
    <td><img src="resource/screenshot3.webp" alt="VoidTube Demo"></td>
    <td><img src="resource/screenshot2.webp" alt="VoidTube Demo"></td>
  </tr>
</table>

## Download (prebuilt)

⬇️ Want the finished app without building? Grab the installers from the
**[v1.0.0 release](https://github.com/imodi79/VoidTube/releases/tag/v1.0.0)**.

- macOS: `.dmg`
- Windows: `.exe` (NSIS installer)
- Linux: `.AppImage` or `.deb`

⚠️ You still need your own Google Cloud credentials to sign in and use search/subscriptions. See the setup section below.

### Publish GitHub Releases (maintainers)

The installer files are large, so keep them out of the repo and upload them to GitHub Releases instead.

Step-by-step:

1) Build on each OS (or CI) so you get native installers:
   - `npm run build:mac`
   - `npm run build:win`
   - `npm run build:linux`
2) In `dist/`, keep the installer files and ignore `*-unpacked` folders and `builder-debug.yml`.
3) Create a tag and push it:
   - `git tag v1.0.0`
   - `git push --tags`
4) On GitHub, go to **Releases** -> **Draft a new release**.
5) Pick the tag, add a title/notes, then upload the installer files from `dist/`:
   - macOS `.dmg`
   - Windows `.exe`
   - Linux `.AppImage` and `.deb`
6) Publish the release. The downloads will appear on the Releases page.


## Quick start

```bash
npm install
npm run dev
```

The app will launch in development mode.

## Build (step by step)

You do **not** need to be a programmer to build this.  
Just follow these steps:

1) Install Node.js (LTS is fine): https://nodejs.org
2) Download / clone this repository
3) Open a terminal in the project folder
4) Run:

```bash
npm install
npm run generate:icons
npm run build:mac
npm run build:win
npm run build:linux
```

Build output goes to `dist/`.

ℹ️ Installers are OS-specific. For macOS builds you need macOS (or CI). Cross-build support is limited.

## Google Cloud setup (why this is needed)

YouTube does not allow apps to search subscriptions or access private data without a developer key.
That is why **each user needs their own Google Cloud project**.

It sounds scary, but it is just a few clicks and takes about 5 minutes.

### What you are creating

- A **Google Cloud project** (just a container for settings)
- A **YouTube Data API key** (for search and video data)
- An **OAuth Client ID** (so you can sign in safely)

### Step by step

1) Create a project:  
   https://console.cloud.google.com/

2) Enable **YouTube Data API v3**:  
   https://console.cloud.google.com/apis/library/youtube.googleapis.com

3) Create an OAuth Client ID:  
   https://console.cloud.google.com/apis/credentials  
   Recommended type: **TVs and Limited Input devices** (device code flow)

4) Create an API key on the same Credentials page.

5) Open VoidTube, go to the Sign In screen, and paste:
    - Client ID
    - Client Secret (optional but recommended)
    - API key

Helpful docs:
- YouTube Data API overview: https://developers.google.com/youtube/v3/getting-started
- OAuth device flow: https://developers.google.com/identity/protocols/oauth2/limited-input-device

## Configuration

You have two options:

1) **In‑app (recommended for builds)**  
   On the sign‑in overlay, fill in the three fields and sign in.
   The values are saved locally on your device.

2) **Local config / environment variables (dev use)**
    - `config.local.json` (git‑ignored). Example: `config.example.json`
    - Or env vars:
        - `YT_CLIENT_ID`
        - `YT_CLIENT_SECRET` (optional)
        - `YT_API_KEY`

## Notes / limitations

- Tokens are stored locally (not encrypted).
- API usage is subject to YouTube quota limits for your project.
- `config.local.json`, `build/`, and `dist/` are git‑ignored.

## Project status / maintenance

This is a personal project, so do not expect heavy maintenance. I may fix serious bugs from time to time.
Contributions and forks are welcome.

## License

MIT.
