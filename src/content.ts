import { log } from './logger.ts';

// ===== CONSTANTS =====

const ANDROID_CLIENT = {
  clientName: 'ANDROID_MUSIC',
  clientVersion: '7.27.52',
  androidSdkVersion: 30,
};

const BROWSE_ENDPOINT = '/youtubei/v1/browse?prettyPrint=false';

const SELECTORS = {
  video: 'video',
  moviePlayer: '#movie_player',
  playerPage: 'ytmusic-player-page',
  tabHeaders: 'ytmusic-player-page .tab-header',
  lyricsShelf:
    'ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]',
  tabContent: '#tab-content',
  playerBar: 'ytmusic-player-bar',
} as const;

const SYNC_INTERVAL_MS = 50;
const CONTAINER_ID = 'ytms-synced-lyrics-container';

// ===== TYPES =====

interface TimedLyricLine {
  text: string;
  startMs: number;
  endMs: number;
}

interface State {
  currentVideoId: string | null;
  currentBrowseId: string | null;
  timedLyrics: TimedLyricLine[] | null;
  activeLine: number;
  syncTimer: ReturnType<typeof setInterval> | null;
  lyricsContainer: HTMLElement | null;
  videoElement: HTMLVideoElement | null;
  fallbackMode: boolean;
}

/** Any object reached while walking an untyped InnerTube response. */
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

// ===== STATE =====

const state: State = {
  currentVideoId: null,
  currentBrowseId: null,
  timedLyrics: null,
  activeLine: -1,
  syncTimer: null,
  lyricsContainer: null,
  videoElement: null,
  fallbackMode: false,
};

// ===== UTILS =====

function getVideoId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

function getApiKey(): string | null {
  try {
    return window.ytcfg?.data_?.INNERTUBE_API_KEY || null;
  } catch {
    return null;
  }
}

function findKeyDeep(
  obj: unknown,
  targetKey: string,
  maxDepth = 15
): unknown {
  if (!isRecord(obj) || maxDepth <= 0) return null;
  if (obj[targetKey] !== undefined) return obj[targetKey];
  for (const key of Object.keys(obj)) {
    const result = findKeyDeep(obj[key], targetKey, maxDepth - 1);
    if (result) return result;
  }
  return null;
}

function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver((_, obs) => {
      const found = document.querySelector(selector);
      if (found) {
        obs.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

// ===== API MODULE =====

function findBrowseIdInObject(
  obj: unknown,
  depth = 0,
  visited: WeakSet<object> | null = null
): string | null {
  if (!visited) visited = new WeakSet();
  if (!isRecord(obj) || depth > 12) return null;
  try {
    if (visited.has(obj)) return null;
    visited.add(obj);
  } catch {
    return null;
  }

  if (typeof obj['browseId'] === 'string' && obj['browseId'].startsWith('MPLYt')) {
    return obj['browseId'];
  }

  try {
    for (const key of Object.keys(obj)) {
      try {
        const val = obj[key];
        if (val && typeof val === 'object') {
          const result = findBrowseIdInObject(val, depth + 1, visited);
          if (result) return result;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Object.keys may throw on some exotic objects
  }
  return null;
}

function getLyricsBrowseId(): string | null {
  const playerPage = document.querySelector('ytmusic-player-page');
  if (!playerPage) return null;

  // Check the player page element itself
  for (const prop of ['data', '__data', 'playerPageData_']) {
    try {
      const result = findBrowseIdInObject(
        (playerPage as unknown as UnknownRecord)[prop]
      );
      if (result) return result;
    } catch {
      continue;
    }
  }

  // Scan child elements
  const elements = playerPage.querySelectorAll('*');
  for (const el of elements) {
    for (const prop of ['data', '__data']) {
      try {
        const value = (el as unknown as UnknownRecord)[prop];
        if (value && typeof value === 'object') {
          const result = findBrowseIdInObject(value);
          if (result) return result;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function fetchTimedLyrics(
  browseId: string
): Promise<TimedLyricLine[] | null> {
  const apiKey = getApiKey();
  const url = `https://music.youtube.com${BROWSE_ENDPOINT}${apiKey ? '&key=' + apiKey : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          ...ANDROID_CLIENT,
          hl: window.ytcfg?.data_?.INNERTUBE_CONTEXT_HL || 'en',
          gl: window.ytcfg?.data_?.INNERTUBE_CONTEXT_GL || 'US',
        },
      },
      browseId: browseId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lyrics API returned ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseTimedLyrics(data);
}

function parseTimedLyrics(responseData: unknown): TimedLyricLine[] | null {
  const timedData = findKeyDeep(responseData, 'timedLyricsData');
  if (!Array.isArray(timedData)) {
    return null;
  }

  return timedData.map((entry: UnknownRecord) => {
    const cueRange = isRecord(entry['cueRange']) ? entry['cueRange'] : {};
    return {
      text: typeof entry['lyricLine'] === 'string' ? entry['lyricLine'] : '',
      startMs: parseInt(String(cueRange['startTimeMilliseconds'] ?? '0'), 10),
      endMs: parseInt(String(cueRange['endTimeMilliseconds'] ?? '0'), 10),
    };
  });
}

// ===== DOM MODULE =====

function createLyricsContainer(): HTMLElement {
  destroyLyricsContainer();

  const container = document.createElement('div');
  container.id = CONTAINER_ID;

  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'ytms-lyrics-scroll-wrapper';

  const spacerTop = document.createElement('div');
  spacerTop.className = 'ytms-lyrics-spacer-top';

  const linesWrapper = document.createElement('div');
  linesWrapper.className = 'ytms-lyrics-lines';

  const spacerBottom = document.createElement('div');
  spacerBottom.className = 'ytms-lyrics-spacer-bottom';

  scrollWrapper.appendChild(spacerTop);
  scrollWrapper.appendChild(linesWrapper);
  scrollWrapper.appendChild(spacerBottom);

  const source = document.createElement('div');
  source.className = 'ytms-lyrics-source';
  source.textContent = 'Source: Musixmatch';

  container.appendChild(scrollWrapper);
  container.appendChild(source);

  return container;
}

function injectContainer(container: HTMLElement | null): void {
  if (!container) return;

  // Try multiple injection targets
  const targets = [
    document.querySelector('#tab-content'),
    document.querySelector('ytmusic-player-page #tab-content'),
    document.querySelector(
      'ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]'
    )?.parentElement,
    document.querySelector('ytmusic-description-shelf-renderer')?.parentElement,
  ];

  const target = targets.find((t): t is Element => Boolean(t));
  log.debug('Injection target:', target?.tagName, target?.id, target?.className);

  if (!target) {
    log.warn('No injection target found');
    return;
  }

  const originalShelf = target.querySelector<HTMLElement>(
    'ytmusic-description-shelf-renderer'
  );
  if (originalShelf) {
    originalShelf.style.display = 'none';
  }
  target.prepend(container);
}

function renderLyricsLines(
  lyrics: TimedLyricLine[],
  container: HTMLElement
): void {
  const linesWrapper = container.querySelector('.ytms-lyrics-lines');
  if (!linesWrapper) return;
  linesWrapper.replaceChildren();

  lyrics.forEach((line, index) => {
    const lineEl = document.createElement('div');
    lineEl.classList.add('ytms-lyric-line');
    lineEl.dataset['index'] = String(index);
    lineEl.dataset['startMs'] = String(line.startMs);
    lineEl.textContent = line.text || '♪';

    lineEl.addEventListener('click', () => {
      seekToLine(line.startMs);
    });

    linesWrapper.appendChild(lineEl);
  });
}

function renderFallbackLyrics(plainText: string, container: HTMLElement): void {
  const linesWrapper = container.querySelector('.ytms-lyrics-lines');
  if (!linesWrapper) return;
  linesWrapper.replaceChildren();
  container.classList.add('ytms-fallback-mode');

  const textEl = document.createElement('div');
  textEl.classList.add('ytms-plain-lyrics');
  textEl.textContent = plainText;
  linesWrapper.appendChild(textEl);
}

function destroyLyricsContainer(): void {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.remove();

  const originalShelf = document.querySelector<HTMLElement>(
    'ytmusic-description-shelf-renderer[style*="display: none"]'
  );
  if (originalShelf) {
    originalShelf.style.display = '';
  }
}

// ===== SYNC MODULE =====

function startSyncLoop(): void {
  stopSyncLoop();

  const video = document.querySelector<HTMLVideoElement>(SELECTORS.video);
  if (!video) return;
  state.videoElement = video;

  state.syncTimer = setInterval(() => {
    if (!state.timedLyrics || !state.lyricsContainer) return;
    if (video.paused) return;

    const currentMs = video.currentTime * 1000;
    const newActiveLine = findActiveLine(currentMs);

    if (newActiveLine !== state.activeLine) {
      state.activeLine = newActiveLine;
      updateActiveLineDOM(newActiveLine);
      scrollToActiveLine(newActiveLine);
    }
  }, SYNC_INTERVAL_MS);
}

function findActiveLine(currentMs: number): number {
  const lyrics = state.timedLyrics;
  if (!lyrics) return -1;

  for (let i = lyrics.length - 1; i >= 0; i--) {
    const line = lyrics[i];
    if (line && currentMs >= line.startMs) {
      return i;
    }
  }
  return -1;
}

function updateActiveLineDOM(activeIndex: number): void {
  const container = state.lyricsContainer;
  if (!container) return;

  const lines = container.querySelectorAll('.ytms-lyric-line');
  lines.forEach((line, i) => {
    line.classList.toggle('ytms-active', i === activeIndex);
    line.classList.toggle('ytms-past', i < activeIndex);
  });
}

function scrollToActiveLine(activeIndex: number): void {
  const container = state.lyricsContainer;
  if (!container || activeIndex < 0) return;

  const scrollWrapper = container.querySelector('.ytms-lyrics-scroll-wrapper');
  const activeLine = container.querySelector<HTMLElement>(
    `.ytms-lyric-line[data-index="${activeIndex}"]`
  );
  if (!activeLine || !scrollWrapper) return;

  const wrapperHeight = scrollWrapper.clientHeight;
  const lineTop = activeLine.offsetTop;
  const lineHeight = activeLine.offsetHeight;
  const targetScroll = lineTop - wrapperHeight / 2 + lineHeight / 2;

  scrollWrapper.scrollTo({
    top: targetScroll,
    behavior: 'smooth',
  });
}

function seekToLine(timeMs: number): void {
  const video =
    state.videoElement ||
    document.querySelector<HTMLVideoElement>(SELECTORS.video);
  if (video) {
    video.currentTime = timeMs / 1000;
  }
}

function stopSyncLoop(): void {
  if (state.syncTimer) {
    clearInterval(state.syncTimer);
    state.syncTimer = null;
  }
}

// ===== NAVIGATION MODULE =====

function resetSongState(newVideoId: string | null): void {
  stopSyncLoop();
  destroyLyricsContainer();
  state.currentVideoId = newVideoId;
  state.timedLyrics = null;
  state.currentBrowseId = null;
  state.activeLine = -1;
  state.fallbackMode = false;
  state.lyricsContainer = null;
}

function isLyricsTabActive(): boolean {
  const tabs = document.querySelectorAll('ytmusic-player-page .tab-header');
  for (const tab of tabs) {
    if (tab.textContent?.trim().toLowerCase() !== 'lyrics') continue;
    return (
      tab.classList.contains('iron-selected') ||
      tab.getAttribute('aria-selected') === 'true' ||
      tab.hasAttribute('selected')
    );
  }
  return false;
}

function observeSongChanges(): void {
  const video = document.querySelector<HTMLVideoElement>(SELECTORS.video);
  if (!video) return;
  state.videoElement = video;

  video.addEventListener('loadstart', () => {
    const videoId = getVideoId();
    if (!videoId || videoId === state.currentVideoId) return;

    log.info('Song change detected via loadstart:', videoId);
    resetSongState(videoId);

    if (isLyricsTabActive()) {
      log.debug('Lyrics tab active — reloading lyrics');
      setTimeout(() => loadLyricsForCurrentSong(), 500);
    }
  });
}

function observeLyricsTab(): void {
  const playerPage = document.querySelector(SELECTORS.playerPage);
  if (!playerPage) return;

  playerPage.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const tab = target.closest('.tab-header');
    if (!tab) return;
    if (tab.textContent?.trim().toLowerCase() !== 'lyrics') return;

    log.debug('Lyrics tab clicked');
    const videoId = getVideoId();
    if (!videoId) return;

    // New song OR never loaded yet — reset and fetch fresh
    if (videoId !== state.currentVideoId || !state.timedLyrics) {
      log.info('Loading lyrics on tab click for:', videoId);
      resetSongState(videoId);
      setTimeout(() => loadLyricsForCurrentSong(), 500);
      return;
    }

    // Same song, already loaded — re-inject if container was removed (tab switch)
    if (!document.getElementById(CONTAINER_ID)) {
      setTimeout(() => {
        injectContainer(state.lyricsContainer);
        startSyncLoop();
      }, 500);
    }
  });
}

async function loadLyricsForCurrentSong(): Promise<void> {
  log.info('Loading lyrics for:', state.currentVideoId);

  const browseId = await waitForBrowseId();
  if (!browseId) {
    log.info('No browse ID found');
    showNoLyricsState();
    return;
  }

  if (getVideoId() !== state.currentVideoId) return;

  state.currentBrowseId = browseId;
  log.debug('Browse ID:', browseId);

  try {
    log.debug('Fetching timed lyrics...');
    const timedLyrics = await fetchTimedLyrics(browseId);

    if (getVideoId() !== state.currentVideoId) return;

    log.info(
      'Timed lyrics result:',
      timedLyrics ? timedLyrics.length + ' lines' : 'null'
    );

    if (timedLyrics && timedLyrics.length > 0) {
      state.timedLyrics = timedLyrics;
      state.fallbackMode = false;

      const container = createLyricsContainer();
      renderLyricsLines(timedLyrics, container);
      log.debug('Injecting container into DOM...');
      injectContainer(container);
      state.lyricsContainer = container;

      log.debug('Container injected:', !!document.getElementById(CONTAINER_ID));
      log.debug('Starting sync loop');
      startSyncLoop();
    } else {
      log.info('No timed lyrics, showing fallback');
      showFallbackLyrics();
    }
  } catch (err) {
    log.error('Failed to fetch lyrics:', err);
    showFallbackLyrics();
  }
}

async function waitForBrowseId(maxAttempts = 10, intervalMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    const browseId = getLyricsBrowseId();
    if (browseId) return browseId;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

function showFallbackLyrics(): void {
  const shelf = document.querySelector(SELECTORS.lyricsShelf);
  const desc = shelf?.querySelector('.description');
  const text = desc?.textContent?.trim();
  if (text) {
    state.fallbackMode = true;
    const container = createLyricsContainer();
    renderFallbackLyrics(text, container);
    injectContainer(container);
    state.lyricsContainer = container;
  } else {
    showNoLyricsState();
  }
}

function showNoLyricsState(): void {
  const container = createLyricsContainer();
  const linesWrapper = container.querySelector('.ytms-lyrics-lines');
  const msg = document.createElement('div');
  msg.className = 'ytms-no-lyrics';
  msg.textContent = 'No lyrics available for this song';
  linesWrapper?.appendChild(msg);
  injectContainer(container);
  state.lyricsContainer = container;
}

// ===== INIT =====

function init(): void {
  if (!window.location.hostname.includes('music.youtube.com')) return;

  log.info('Initializing...');

  waitForElement(SELECTORS.playerPage)
    .then(async () => {
      observeLyricsTab();
      try {
        await waitForElement(SELECTORS.video, 5000);
        observeSongChanges();
      } catch (err) {
        log.warn('Video element not found:', err);
      }
    })
    .catch((err: unknown) => {
      log.warn('Player page not found:', err);
    });
}

init();
