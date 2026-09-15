# YouTube Music Synced Lyrics

Browser extension that replaces the YouTube Music lyrics tab with time-synced,
karaoke-style lyrics: the current line is highlighted as the song plays, the
list auto-scrolls, and clicking a line seeks the player to that timestamp.

Works on Chrome/Chromium (MV3) and Firefox 128+.

![Example UI](example-ui.png)

## Requirements

- [Node.js](https://nodejs.org) 22.18 or newer (24 LTS recommended). The build
  script itself is TypeScript, run through Node's built-in type stripping.
- Chrome/Chromium/Edge, and/or Firefox **128+**

The extension is written in TypeScript and bundled to plain JS with esbuild; the
shipped extension still has no runtime dependencies.

## Build

```bash
npm install          # required: the build uses esbuild + typescript
npm run build        # production build of both targets
npm run build:dev    # development build (logging + inline source maps)
```

This produces two unpacked extension directories:

```
dist/chrome/     # load this in Chrome
dist/firefox/    # load this in Firefox
```

Build a single target if you prefer:

```bash
npm run build:chrome
npm run build:firefox
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Type-checks the project, then runs the build tests (`node --test`) |
| `npm run typecheck` | Type-checks without emitting anything (`tsc --noEmit`) |
| `npm run build:dev` | Development build: logging enabled, inline source maps, no minification |
| `npm run lint:firefox` | Validates the Firefox build with `web-ext lint` |
| `npm run dev:firefox` | Builds, then launches a temporary Firefox profile with the extension loaded |
| `npm run package` | Builds both targets and zips them into `dist/artifacts/` |
| `npm run clean` | Deletes `dist/` |

## Install in developer mode

### Chrome / Chromium / Edge

1. `npm run build:chrome`
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dist/chrome` directory.
5. Open <https://music.youtube.com>, play a song, and click the **Lyrics** tab.

After changing code, run `npm run build:chrome` again and hit the **reload**
icon on the extension card. Reload the YouTube Music tab too — content scripts
are injected at page load.

### Firefox

The quickest path is `npm run dev:firefox`, which builds the extension, opens a
throwaway Firefox profile with it already installed, and live-reloads on every
rebuild.

To install it into your normal profile instead:

1. `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select `dist/firefox/manifest.json` (the manifest file itself, not the folder).
5. Open <https://music.youtube.com>, play a song, and click the **Lyrics** tab.

After changing code, run `npm run build:firefox` again and click **Reload** on
the extension in `about:debugging`. Temporary add-ons are removed when Firefox
closes, so this has to be repeated each session.

## Project layout

```
src/                  shared extension sources (identical for both browsers)
  content.ts          all the lyrics logic — runs in the page's MAIN world
  background.ts       minimal lifecycle listener
  logger.ts           logging that only exists in development builds
  env.d.ts            build-time constants + YouTube Music page globals
  styles.css          lyrics panel styling
  icons/
manifest.base.json    manifest fields shared by both browsers
build.ts              bundles src/ and merges the base manifest with overrides
tsconfig.json         strict TypeScript config (type-check only; esbuild emits)
test/                 build + manifest tests
```

`build.ts` bundles each entry point (`content.ts`, `background.ts`) into a
self-contained IIFE with esbuild, copies the static assets, and writes a
target-specific `manifest.json`. Nothing under `dist/` is edited by hand.

## Development vs production builds

The bundler substitutes a `__DEV__` literal at build time, so the two builds
differ in what survives:

| | development | production |
| --- | --- | --- |
| Logging | enabled (`[YTMS]`, `debug` and up) | removed entirely |
| Source maps | inline | none |
| Minification | no | yes |

Because `__DEV__` is a literal, every `log.*` body collapses to dead code in a
production build and esbuild drops it — plus `console`/`debugger` calls are
dropped outright. The production console stays clean.

Mode is production unless you ask for otherwise: pass `--dev` (or set
`NODE_ENV=development`).

## Why the manifests differ

Only two manifest keys differ between the targets, and `build.ts` is the single
source of truth for both:

- **Background script.** Firefox does not support MV3 service workers, so the
  Firefox manifest uses an event page (`"background": { "scripts": [...] }`)
  while Chrome uses `"background": { "service_worker": ... }`.
- **`browser_specific_settings`.** Firefox requires an explicit add-on id for
  MV3 extensions. It also pins `strict_min_version` to `128.0`, because the
  content script runs with `"world": "MAIN"` and Firefox only supports that
  from version 128 (Chrome has supported it since 111).

The version number in both manifests is injected from `package.json`, so bump
it there and rebuild.

## Debugging

- **Content script logs** appear in the normal page console on
  music.youtube.com, prefixed with `[YTMS]` — but only in a development build,
  so use `npm run build:dev` (or `npm run dev:firefox`) when debugging. The
  verbosity threshold lives in `src/logger.ts`.
- **Background logs**: in Chrome, click **service worker** on the extension card
  in `chrome://extensions`; in Firefox, click **Inspect** in
  `about:debugging#/runtime/this-firefox`.
- The content script deliberately runs in the page's `MAIN` world so it can read
  YouTube Music's own `ytcfg` config and internal Polymer element data to find
  the lyrics `browseId`. It uses no extension APIs, which is why the same file
  works unchanged in both browsers.
