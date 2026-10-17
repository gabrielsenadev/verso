<p align="center">
  <img src="src/icons/icon128.png" alt="Verso logo" width="96" />
</p>

<h1 align="center">Verso</h1>

<p align="center">
  <strong>Karaoke-style, time-synced lyrics and a distraction-free focus mode for YouTube Music.</strong>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/verso-%E2%80%93-youtube-music-lyr/hacckbeagegildemobkfelpfcidipagf" target="_blank">
    <img alt="Available in the Chrome Web Store" src="https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png" height="58" />
  </a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/verso-youtube-music-lyrics/" target="_blank">
    <img alt="Get the add-on for Firefox" src="https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg" height="58" />
  </a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.2-blue.svg?cacheSeconds=2592000" />
  <img alt="Chrome" src="https://img.shields.io/badge/chrome-%3E%3D120-blue.svg" />
  <img alt="Edge" src="https://img.shields.io/badge/edge-%3E%3D120-blue.svg" />
  <img alt="Firefox" src="https://img.shields.io/badge/firefox-%3E%3D140-blue.svg" />
  <img alt="Maintained" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  <a href="LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" />
  </a>
</p>

<p align="center">
  <img alt="Verso focus mode, before and after comparison, and synced lyrics in YouTube Music" src="docs/images/showcase.png" width="720" />
</p>

## ✨ Features

- 🎤 **Synced lyrics** – the current line is highlighted in real time as the song plays.
- 📜 **Auto-scroll** – the lyrics list follows the music so you never lose your place.
- ⏩ **Click to seek** – click any line to jump straight to that part of the song.
- 🎧 **Focus mode** – a full-screen view with just the cover (or video), the playback controls and the lyrics, over a background taken from the artwork. Open it from the button in the player bar; close it with ✕ or `Esc`.
- 🔒 **Private by design** – no permissions, no tracking, no data collection.

## 📦 Install

Install Verso from the [Chrome Web Store](https://chromewebstore.google.com/detail/verso-%E2%80%93-youtube-music-lyr/hacckbeagegildemobkfelpfcidipagf) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/verso-youtube-music-lyrics/), then open [YouTube Music](https://music.youtube.com), play a song and open the **Lyrics** tab.

## 🛠️ Development

### Prerequisites

- node 26.4.0 (`nvm use`)
- pnpm 10.34.5 (`corepack enable`)
- Chrome/Edge >=120 or Firefox >=140

### Setup

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then load the extension in developer mode:

- **Chrome:** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select `dist/chrome`.
- **Edge:** open `edge://extensions`, enable **Developer mode**, click **Load unpacked** and select `dist/edge`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.

### Packaging

To build the store zips into `dist/artifacts/`:

```sh
pnpm package
```

### Tests

```sh
pnpm test
```

## 🔒 Privacy

Verso requests no permissions, collects no data and only talks to YouTube Music itself.

> Not affiliated with, endorsed by or sponsored by YouTube or Google.

## 👤 Author

**Gabriel Sena** – [@gabrielsenadev](https://github.com/gabrielsenadev)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />
Feel free to check the [issues page](https://github.com/gabrielsenadev/verso/issues).

## 💛 Show your support

Give a ⭐️ if this project helped you!

<a href="https://buymeacoffee.com/gabrielsenadev" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
</a>

## 📝 License

Copyright © 2026 [Gabriel Sena](https://github.com/gabrielsenadev).<br />
This project is [MIT](LICENSE) licensed.
