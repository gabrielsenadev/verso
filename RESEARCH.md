# YouTube Music Lyrics Sync - Technical Research

## Overview

YouTube Music has a lyrics tab, but it only shows **plain, unsynced text** on the web client. However, the **same API endpoint** returns **full timed/synced lyrics with millisecond precision** when called with the Android Music client context. This extension will leverage that to build a Spotify-style synced lyrics overlay.

---

## 1. YouTube Music Page Structure

### Key DOM Elements

| Element | Selector | Purpose |
|---------|----------|---------|
| Video/Audio player | `document.querySelector('video')` | Main media element for playback |
| Movie player | `document.querySelector('#movie_player')` | YouTube's player wrapper with API methods |
| Player page | `document.querySelector('ytmusic-player-page')` | The full-screen player page container |
| Tab headers | `ytmusic-player-page .tab-header` | "Up next", "Lyrics", "Related" tabs |
| Lyrics tab content | `ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]` | The lyrics panel (plain text) |
| Description text | `.description` inside the shelf renderer | The actual lyrics text element |
| Footer (source) | `.footer` inside the shelf renderer | Shows "Source: Musixmatch" |
| Player bar | `ytmusic-player-bar` | Bottom player bar with controls |
| Progress bar | `#progress-bar` | Seek slider |
| Search input | `input#input.style-scope.ytmusic-search-box` | Search box |

### Player Page Tabs

The player page has 3 main tabs accessible via:
```js
const tabs = document.querySelectorAll('ytmusic-player-page .tab-header');
// tabs[0] = "Up next"
// tabs[1] = "Lyrics"
// tabs[2] = "Related"
```

Each tab is a Polymer element with class `tab-header style-scope ytmusic-player-page`. The selected tab gets the `iron-selected` class.

---

## 2. Accessing Playback Time

### Method 1: Video Element (Recommended)
```js
const video = document.querySelector('video');
video.currentTime;  // Current position in seconds (e.g., 199.916944)
video.duration;     // Total duration in seconds (e.g., 355)
video.paused;       // Boolean - is paused?
```

### Method 2: Movie Player API
```js
const player = document.querySelector('#movie_player');
player.getCurrentTime();  // Same as video.currentTime
player.getDuration();     // Same as video.duration
player.getPlayerState();  // 1 = playing, 2 = paused, 3 = buffering
```

### Syncing Strategy
- Use `requestAnimationFrame` or `setInterval` (every ~100ms) to poll `video.currentTime`
- Convert to milliseconds: `video.currentTime * 1000`
- Compare against `startTimeMilliseconds` / `endTimeMilliseconds` from timed lyrics data

---

## 3. Extracting the Lyrics Browse ID

The lyrics browse ID is needed to fetch timed lyrics. Format: `MPLYt_XXXXX`

### How to Find It

The browse ID is stored inside Polymer element data on the player page. Extract it by scanning elements that have a `data` property:

```js
function getLyricsBrowseId() {
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    if (el.data && typeof el.data === 'object') {
      const str = JSON.stringify(el.data);
      if (str.includes('MUSIC_PAGE_TYPE_TRACK_LYRICS')) {
        const match = str.match(/"browseId"\s*:\s*"(MPLYt[a-zA-Z0-9_-]+)"/);
        if (match) return match[1];
      }
    }
  }
  return null;
}
```

### Example Result
For "Bohemian Rhapsody" by Queen (video ID: `yl3TsqL0ZPw`):
- **Browse ID**: `MPLYt_lBAWMJdpu9Y-7`

### Alternative: Extract from Tab Endpoint Data
The tab data contains a `browseEndpoint` with the lyrics browse ID:
```json
{
  "endpoint": {
    "browseEndpoint": {
      "browseId": "MPLYt_lBAWMJdpu9Y-7",
      "browseEndpointContextSupportedConfigs": {
        "browseEndpointContextMusicConfig": {
          "pageType": "MUSIC_PAGE_TYPE_TRACK_LYRICS"
        }
      }
    }
  },
  "title": "Lyrics"
}
```

---

## 4. Fetching Timed Lyrics - THE KEY DISCOVERY

### The Problem
The **web client** (`WEB_REMIX`) returns only plain text lyrics (~3KB response):
```json
{
  "musicDescriptionShelfRenderer": {
    "description": { "runs": [{ "text": "Is this the real life?..." }] },
    "footer": { "runs": [{ "text": "Source: Musixmatch" }] }
  }
}
```

### The Solution
The **Android Music client** (`ANDROID_MUSIC`) returns full timed lyrics (~457KB response) from the **exact same endpoint and browse ID**!

### API Endpoint
```
POST https://music.youtube.com/youtubei/v1/browse?prettyPrint=false
```

### Request Body (Timed Lyrics - ANDROID_MUSIC client)
```json
{
  "context": {
    "client": {
      "clientName": "ANDROID_MUSIC",
      "clientVersion": "7.27.52",
      "androidSdkVersion": 30,
      "hl": "en",
      "gl": "US"
    }
  },
  "browseId": "MPLYt_XXXXX"
}
```

### Request Headers
```
Content-Type: application/json
```

### No Authentication Required!
The API works **without login or YouTube Premium**. The `has_unlimited_entitlement` in the response shows `"False"` but timed lyrics are still returned.

### API Key (from ytcfg)
```js
const apiKey = window.ytcfg.data_.INNERTUBE_API_KEY;
// Value: "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30"
```

This key can be extracted at runtime from the page, or hardcoded (it's a public API key shared across all YouTube Music users).

---

## 5. Timed Lyrics Response Structure

### Full Response Shape
```json
{
  "responseContext": { ... },
  "contents": {
    "sectionListRenderer": {
      "contents": [
        {
          "musicDescriptionShelfRenderer": { ... }
        }
      ]
    }
  }
}
```

### Inside the Android response, deep in the template/model structure:
```
contents -> ... -> timedLyricsModel -> lyricsData -> timedLyricsData[]
```

### Path to Timed Lyrics
Found via recursive search through the response object:
```js
function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[key]) return obj[key];
  for (const k of Object.keys(obj)) {
    const result = findKey(obj[k], key);
    if (result) return result;
  }
  return null;
}

const timedData = findKey(responseData, 'timedLyricsData');
```

### Timed Lyrics Data Entry Format
```json
{
  "lyricLine": "Is this the real life? Is this just fantasy?",
  "cueRange": {
    "startTimeMilliseconds": "20",
    "endTimeMilliseconds": "7100",
    "metadata": {
      "id": "0"
    }
  }
}
```

### Key Fields
| Field | Type | Description |
|-------|------|-------------|
| `lyricLine` | string | The lyric text for this line |
| `cueRange.startTimeMilliseconds` | string (numeric) | When this line starts (ms) |
| `cueRange.endTimeMilliseconds` | string (numeric) | When this line ends (ms) |
| `cueRange.metadata.id` | string (numeric) | Sequential line index |

**Note**: Times are strings, not numbers. Parse with `parseInt()`.

### Complete Example (Bohemian Rhapsody - 54 lines)
```json
[
  { "lyricLine": "Is this the real life? Is this just fantasy?",      "cueRange": { "startTimeMilliseconds": "20",    "endTimeMilliseconds": "7100"  }},
  { "lyricLine": "Caught in a landslide, no escape from reality",     "cueRange": { "startTimeMilliseconds": "7100",  "endTimeMilliseconds": "14830" }},
  { "lyricLine": "Open your eyes, look up to the skies and see",      "cueRange": { "startTimeMilliseconds": "14830", "endTimeMilliseconds": "25150" }},
  { "lyricLine": "I'm just a poor boy (ooh, poor boy), I need no sympathy", "cueRange": { "startTimeMilliseconds": "25150", "endTimeMilliseconds": "30700" }},
  ...
]
```

### Additional Metadata in lyricsData
```json
{
  "timedLyricsData": [...],
  "sourceMessage": "Source: Musixmatch",
  "backgroundImage": {
    "sources": [{ "url": "https://lh3.googleusercontent.com/..." }]
  },
  "timedLyricsCommand": { ... },
  "colorSamplePaletteEntityKey": "..."
}
```

---

## 6. ytcfg - Page Configuration

Available at `window.ytcfg.data_`:

| Key | Value | Purpose |
|-----|-------|---------|
| `INNERTUBE_API_KEY` | `AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30` | API key for browse requests |
| `INNERTUBE_CLIENT_NAME` | `WEB_REMIX` | Web client identifier |
| `INNERTUBE_CLIENT_VERSION` | `1.20260331.01.00` | Client version |
| `INNERTUBE_CONTEXT` | `{...}` | Full context object for API calls |
| `INNERTUBE_CONTEXT_GL` | Country code | Geolocation |
| `INNERTUBE_CONTEXT_HL` | Language code | Language |
| `VISITOR_DATA` | Encoded string | Visitor identification |

---

## 7. Detecting Song Changes

### Method 1: URL Observation
YouTube Music uses SPA navigation. Watch for URL changes:
```js
// The video ID is in the URL: /watch?v=VIDEO_ID
const observer = new MutationObserver(() => {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get('v');
  // Compare with previously stored videoId
});
observer.observe(document.querySelector('title'), { childList: true });
```

### Method 2: Player Events
```js
const video = document.querySelector('video');
video.addEventListener('loadeddata', () => {
  // New song loaded
});
```

### Method 3: Navigation Events (YouTube SPA)
```js
// YouTube Music fires 'yt-navigate-finish' on page transitions
document.addEventListener('yt-navigate-finish', (event) => {
  // Check if we're on a watch page
  if (window.location.pathname === '/watch') {
    // Extract new video data
  }
});
```

---

## 8. Web vs Android Client Comparison

| Aspect | WEB_REMIX | ANDROID_MUSIC |
|--------|-----------|---------------|
| Client name | `WEB_REMIX` | `ANDROID_MUSIC` |
| Client version | `1.20260331.01.00` | `7.27.52` |
| Lyrics response size | ~3 KB | ~457 KB |
| Lyrics format | Plain text (runs) | Timed lyrics with ms precision |
| Has timing data | No | Yes |
| Requires auth | No | No |
| Same browse ID | Yes | Yes |
| Same endpoint | Yes | Yes |

---

## 9. UI Reference (Spotify-style)

Based on the reference image (`example-ui.png`):

- **Background**: Dark olive/green gradient (extracted from album art)
- **Active line**: Bold, white, full opacity, slightly larger font
- **Inactive lines**: Dimmed/semi-transparent (opacity ~0.4-0.5), normal weight
- **Layout**: Vertically stacked lines, centered, with generous line spacing
- **Scrolling**: Active line stays roughly centered; smooth scroll animation
- **Interaction**: Click on a line to seek to that timestamp

---

## 10. Extension Architecture Plan

```
ytms-lyrics-sync/
  manifest.json          # Chrome extension manifest (MV3)
  content.js             # Content script injected into music.youtube.com
  styles.css             # Spotify-style lyrics overlay CSS
  background.js          # Service worker (optional, for lifecycle)
  icons/                 # Extension icons
```

### Content Script Flow
1. Detect we're on a YouTube Music watch page
2. Wait for player page to load
3. Extract lyrics `browseId` from DOM data
4. Fetch timed lyrics via `/youtubei/v1/browse` with ANDROID_MUSIC context
5. Build the synced lyrics overlay UI
6. Poll `video.currentTime` to highlight the current line
7. Auto-scroll to keep active line centered
8. Listen for song changes and repeat

### Permissions Needed
```json
{
  "permissions": [],
  "host_permissions": ["*://music.youtube.com/*"],
  "content_scripts": [{
    "matches": ["*://music.youtube.com/*"],
    "js": ["content.js"],
    "css": ["styles.css"]
  }]
}
```

---

## 11. Known Considerations

1. **No auth needed**: Timed lyrics work without login, but some songs may not have lyrics at all
2. **Lyrics source**: Musixmatch provides the lyrics data
3. **Rate limiting**: Unknown, but since we only fetch once per song, unlikely to be an issue
4. **SPA navigation**: YouTube Music is a single-page app; must handle dynamic navigation
5. **Premium upsell banner**: May appear (selector: `button "No thanks"` / `button "1 month free"`) and should not interfere with our overlay
6. **Empty lyrics**: Some songs won't have a lyrics tab or browse ID; handle gracefully
7. **API key stability**: The public API key `AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30` may change; best to extract from `ytcfg` at runtime
