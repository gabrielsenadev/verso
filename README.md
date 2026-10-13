<h1 align="center">Welcome to Verso 👋</h1>
<p>
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blue.svg?cacheSeconds=2592000" />
  <img alt="Chrome" src="https://img.shields.io/badge/chrome-%3E%3D120-blue.svg" />
  <img alt="Firefox" src="https://img.shields.io/badge/firefox-%3E%3D140-blue.svg" />
  <a href="#" target="_blank">
    <img alt="Maintained" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" />
  </a>
</p>

> Karaoke-style, time-synced lyrics in the YouTube Music lyrics tab. The current line is highlighted as the song plays, the list auto-scrolls, and clicking a line seeks to it.

<!-- ![Example UI](example-ui.png) -->

### 🏠 [Homepage](https://github.com/gabrielsenadev/verso)

## Prerequisites

- node 26.4.0 (`nvm use`)
- pnpm 10.34.5 (`corepack enable`)
- Chrome/Edge >=120 or Firefox >=140

## Install

```sh
pnpm install --frozen-lockfile
```

## Usage

```sh
pnpm build
```

Then load the extension in developer mode:

- **Chrome/Edge:** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select `dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.

Open [YouTube Music](https://music.youtube.com), play a song and open the **Lyrics** tab.

To build the store zips into `dist/artifacts/`:

```sh
pnpm package
```

## Run tests

```sh
pnpm test
```

## Privacy

Verso requests no permissions, collects no data and only talks to YouTube Music itself.

> Not affiliated with, endorsed by or sponsored by YouTube or Google.

## Author

👤 **Gabriel Sena**

* Github: [@gabrielsenadev](https://github.com/gabrielsenadev)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/gabrielsenadev/verso/issues).

## Show your support

Give a ⭐️ if this project helped you!

<a href="https://buymeacoffee.com/gabrielsenadev" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
</a>

## 📝 License

Copyright © 2026 [Gabriel Sena](https://github.com/gabrielsenadev).<br />
This project is [MIT](LICENSE) licensed.
