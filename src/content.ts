import { log } from './logger.ts';

// ===== CONSTANTS =====

const ANDROID_CLIENT = {
  clientName: 'ANDROID_MUSIC',
  clientVersion: '7.27.52',
  androidSdkVersion: 30,
};

const BROWSE_ENDPOINT = '/youtubei/v1/browse?prettyPrint=false';

const LYRICS_PAGE_TYPE = 'MUSIC_PAGE_TYPE_TRACK_LYRICS';
const LYRICS_BROWSE_ID_PREFIX = 'MPLYt';
// Only used when the tab data can't be read: YouTube Music lists
// "Up next", "Lyrics", … in that order.
const LYRICS_TAB_FALLBACK_INDEX = 1;

const SELECTORS = {
  video: '#movie_player video',
  moviePlayer: '#movie_player',
  playerPage: 'ytmusic-player-page',
  tabs: 'ytmusic-player-page .tab-header',
  lyricsShelf: `ytmusic-description-shelf-renderer[page-type="${LYRICS_PAGE_TYPE}"]`,
  anyShelf: 'ytmusic-player-page ytmusic-description-shelf-renderer',
  tabContent: 'ytmusic-player-page #tab-content',
} as const;

const CONTAINER_ID = 'verso-container';

/** Coalesces bursts of DOM mutations into one reconcile pass. */
const RECONCILE_DELAY_MS = 100;
/**
 * While the Lyrics tab is open but the page still holds the previous song's
 * data, retry a few times in case no further mutation arrives to wake us.
 */
const STALE_RETRY_DELAY_MS = 500;
const STALE_RETRY_LIMIT = 10;

// ===== TYPES =====

interface TimedLyricLine {
  text: string;
  startMs: number;
}

interface TimedLyrics {
  lines: TimedLyricLine[];
  /** Attribution as the API returned it, e.g. "Source: Musixmatch". */
  source: string | null;
}

interface LyricsTab {
  element: HTMLElement;
  /** `null` when the song has no lyrics or the id can't be found. */
  browseId: string | null;
}

interface State {
  currentVideoId: string | null;
  /** Browse id lyrics were (or are being) loaded for. */
  currentBrowseId: string | null;
  /** The previous song's browse id, which the page keeps for a moment. */
  staleBrowseId: string | null;
  timedLyrics: TimedLyricLine[] | null;
  activeLine: number;
  syncFrame: number | null;
  lyricsContainer: HTMLElement | null;
  videoElement: HTMLVideoElement | null;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
  staleRetries: number;
  lyricsTabElement: HTMLElement | null;
  /** Whether the Lyrics tab was selected on the last reconcile. */
  lyricsTabOpen: boolean;
}

/** Any object reached while walking an untyped InnerTube response. */
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

/** Subset of the `#movie_player` element API exposed by YouTube's player. */
interface MoviePlayer extends HTMLElement {
  getVideoData?: () => { video_id?: string } | undefined;
  getCurrentTime?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
}

/** Polymer's `<dom-repeat>`, which stamps the player page tabs. */
interface DomRepeat extends HTMLElement {
  itemForElement?: (el: Element) => unknown;
}

// ===== STATE =====

const state: State = {
  currentVideoId: null,
  currentBrowseId: null,
  staleBrowseId: null,
  timedLyrics: null,
  activeLine: -1,
  syncFrame: null,
  lyricsContainer: null,
  videoElement: null,
  reconcileTimer: null,
  staleRetries: 0,
  lyricsTabElement: null,
  lyricsTabOpen: false,
};

// ===== UTILS =====

function getMoviePlayer(): MoviePlayer | null {
  return document.querySelector<MoviePlayer>(SELECTORS.moviePlayer);
}

function getVideoId(): string | null {
  // Prefer the player's own state: on autoplay the URL's `?v=` is only updated
  // after the new video starts loading, so it lags behind `loadstart`.
  try {
    const id = getMoviePlayer()?.getVideoData?.()?.video_id;
    if (id) return id;
  } catch {
    // Fall through to the URL
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

/**
 * Playback position of the current song in ms. On autoplay YTM can append the
 * next song to the same media timeline, so `video.currentTime` keeps counting
 * from the previous song's duration; the player API is relative to the song.
 */
function getCurrentSongMs(): number | null {
  try {
    const seconds = getMoviePlayer()?.getCurrentTime?.();
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  } catch {
    // Fall through to the media element
  }
  const video = state.videoElement;
  return video ? video.currentTime * 1000 : null;
}

function getApiKey(): string | null {
  try {
    return window.ytcfg?.data_?.INNERTUBE_API_KEY || null;
  } catch {
    return null;
  }
}

function findObjectWithKey(
  obj: unknown,
  targetKey: string,
  maxDepth = 15
): UnknownRecord | null {
  if (!isRecord(obj) || maxDepth <= 0) return null;
  if (obj[targetKey] !== undefined) return obj;
  for (const key of Object.keys(obj)) {
    const result = findObjectWithKey(obj[key], targetKey, maxDepth - 1);
    if (result) return result;
  }
  return null;
}

/** Reads InnerTube text, which is a plain string, `{ content }` or `{ runs }`. */
function readText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!isRecord(value)) return null;
  if (typeof value['content'] === 'string') return readText(value['content']);
  if (!Array.isArray(value['runs'])) return null;
  const text = value['runs']
    .map((run: unknown) =>
      isRecord(run) && typeof run['text'] === 'string' ? run['text'] : ''
    )
    .join('');
  return text.trim() || null;
}

/** Resolves once `selector` matches; rejects after `timeout` ms if given. */
function waitForElement(selector: string, timeout?: number): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver((_, obs) => {
      const found = document.querySelector(selector);
      if (found) {
        obs.disconnect();
        if (timer !== undefined) clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
          }, timeout);
  });
}

// ===== LYRICS TAB =====

/**
 * Reads the InnerTube `tabRenderer` behind a tab header. The headers are
 * stamped by a `<dom-repeat>` over the watch-next response's tabs, so Polymer
 * can map each element back to its data item; some builds also bind it on the
 * element itself.
 */
function getTabRenderer(tab: Element): UnknownRecord | null {
  const candidates: unknown[] = [];
  try {
    const repeat = tab.parentElement?.querySelector<DomRepeat>(':scope > dom-repeat');
    candidates.push(repeat?.itemForElement?.(tab));
  } catch {
    // Not a Polymer dom-repeat
  }
  for (const prop of ['data', '__data']) {
    try {
      candidates.push((tab as unknown as UnknownRecord)[prop]);
    } catch {
      continue;
    }
  }

  for (const item of candidates) {
    if (!isRecord(item)) continue;
    return isRecord(item['tabRenderer']) ? item['tabRenderer'] : item;
  }
  return null;
}

/**
 * Finds the Lyrics tab by the lyrics browse id in its data rather than by its
 * label, which is localized ("Lyrics", "Letra", …), or its position, which
 * shifts when YouTube Music adds tabs such as "Comments".
 */
function findLyricsTab(): LyricsTab | null {
  const tabs = [...document.querySelectorAll<HTMLElement>(SELECTORS.tabs)];

  for (const element of tabs) {
    const tabRenderer = getTabRenderer(element);
    if (!tabRenderer) continue;

    // Only the endpoint: a tab's `content` can hold a whole queue of songs.
    const browseId = findBrowseIdInObject(tabRenderer['endpoint']);
    if (!browseId) continue;

    // Songs without lyrics keep the tab, marked unselectable.
    const hasLyrics = tabRenderer['unselectable'] !== true;
    return { element, browseId: hasLyrics ? browseId : null };
  }

  // Tab data unreadable: fall back to the usual position and a page-wide scan.
  const element = tabs[LYRICS_TAB_FALLBACK_INDEX];
  return element ? { element, browseId: findBrowseIdInPage() } : null;
}

/**
 * Read live rather than from the last reconcile: our container stays in the
 * page after switching tabs, and its scroll parent is shared with the other
 * tabs (e.g. the "Up next" queue), so scrolling there would move their list.
 */
function isLyricsTabOpen(): boolean {
  const tab = state.lyricsTabElement;
  return !!tab?.isConnected && isTabSelected(tab);
}

function isTabSelected(tab: Element): boolean {
  return (
    tab.getAttribute('aria-selected') === 'true' ||
    tab.classList.contains('iron-selected')
  );
}

/** Last resort when the tab data can't be read: scan the player page's data. */
function findBrowseIdInPage(): string | null {
  const playerPage = document.querySelector(SELECTORS.playerPage);
  if (!playerPage) return null;

  const candidates: Element[] = [playerPage, ...playerPage.querySelectorAll('*')];
  for (const el of candidates) {
    for (const prop of ['data', '__data', 'playerPageData_']) {
      try {
        const result = findBrowseIdInObject(
          (el as unknown as UnknownRecord)[prop]
        );
        if (result) return result;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function findBrowseIdInObject(
  obj: unknown,
  depth = 0,
  visited: WeakSet<object> = new WeakSet()
): string | null {
  if (!isRecord(obj) || depth > 12) return null;
  try {
    if (visited.has(obj)) return null;
    visited.add(obj);

    const browseId = obj['browseId'];
    if (
      typeof browseId === 'string' &&
      browseId.startsWith(LYRICS_BROWSE_ID_PREFIX)
    ) {
      return browseId;
    }

    for (const key of Object.keys(obj)) {
      try {
        const result = findBrowseIdInObject(obj[key], depth + 1, visited);
        if (result) return result;
      } catch {
        continue;
      }
    }
  } catch {
    // Exotic objects may throw on property access or Object.keys
  }
  return null;
}

// ===== API MODULE =====

async function fetchTimedLyrics(browseId: string): Promise<TimedLyrics | null> {
  const apiKey = getApiKey();
  const url = `https://music.youtube.com${BROWSE_ENDPOINT}${apiKey ? '&key=' + encodeURIComponent(apiKey) : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    // Requests without the page's session cookies get "Lyrics not available"
    // back, so `omit` is not an option here.
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          ...ANDROID_CLIENT,
          hl: window.ytcfg?.data_?.INNERTUBE_CONTEXT_HL || 'en',
          gl: window.ytcfg?.data_?.INNERTUBE_CONTEXT_GL || 'US',
        },
      },
      browseId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lyrics API returned ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseTimedLyrics(data);
}

function parseTimedLyrics(responseData: unknown): TimedLyrics | null {
  const lyricsData = findObjectWithKey(responseData, 'timedLyricsData');
  const timedData = lyricsData?.['timedLyricsData'];
  if (!lyricsData || !Array.isArray(timedData)) {
    return null;
  }

  const lines = timedData.filter(isRecord).map((entry) => {
    const cueRange = isRecord(entry['cueRange']) ? entry['cueRange'] : {};
    return {
      text: typeof entry['lyricLine'] === 'string' ? entry['lyricLine'] : '',
      startMs:
        parseInt(String(cueRange['startTimeMilliseconds'] ?? '0'), 10) || 0,
    };
  });

  return { lines, source: readText(lyricsData['sourceMessage']) };
}

// ===== DOM MODULE =====

function createLyricsContainer(lyrics: TimedLyrics): HTMLElement {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;

  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'verso-lyrics-scroll-wrapper';

  const spacerTop = document.createElement('div');
  spacerTop.className = 'verso-lyrics-spacer-top';

  const linesWrapper = document.createElement('div');
  linesWrapper.className = 'verso-lyrics-lines';
  linesWrapper.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const line = e.target.closest<HTMLElement>('.verso-lyric-line');
    const startMs = state.timedLyrics?.[Number(line?.dataset['index'])]?.startMs;
    if (startMs !== undefined) seekTo(startMs);
  });

  lyrics.lines.forEach((line, index) => {
    // A native button is focusable and activated by Enter/Space on its own.
    const lineEl = document.createElement('button');
    lineEl.type = 'button';
    lineEl.className = 'verso-lyric-line';
    lineEl.dataset['index'] = String(index);
    lineEl.textContent = line.text || '♪';
    linesWrapper.appendChild(lineEl);
  });

  const spacerBottom = document.createElement('div');
  spacerBottom.className = 'verso-lyrics-spacer-bottom';

  scrollWrapper.append(spacerTop, linesWrapper, spacerBottom);
  container.appendChild(scrollWrapper);

  if (lyrics.source) {
    const source = document.createElement('div');
    source.className = 'verso-lyrics-source';
    source.textContent = lyrics.source;
    container.appendChild(source);
  }

  return container;
}

function injectContainer(container: HTMLElement): void {
  // Sit exactly where YouTube Music renders its own lyrics
  const nativeShelf =
    document.querySelector<HTMLElement>(SELECTORS.lyricsShelf) ??
    document.querySelector<HTMLElement>(SELECTORS.anyShelf);
  const target =
    nativeShelf?.parentElement ?? document.querySelector(SELECTORS.tabContent);

  if (!target) {
    log.warn('No injection target found');
    return;
  }
  log.debug('Injection target:', target.tagName, target.id, target.className);

  // Hide YouTube Music's own (unsynced) lyrics while ours are shown
  if (nativeShelf) nativeShelf.style.display = 'none';
  target.prepend(container);
}

function destroyLyricsContainer(): void {
  document.getElementById(CONTAINER_ID)?.remove();

  for (const shelf of document.querySelectorAll<HTMLElement>(SELECTORS.anyShelf)) {
    shelf.style.removeProperty('display');
  }
}

// ===== SYNC MODULE =====

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

/**
 * Highlights the line for the current playback position. Only touches the DOM
 * when the line changed, unless `force` (fresh container, scroll position
 * possibly left over from the previous song).
 */
function syncActiveLine(force = false): void {
  if (!state.timedLyrics || !state.lyricsContainer?.isConnected) return;

  const currentMs = getCurrentSongMs();
  if (currentMs === null) return;

  const newActiveLine = findActiveLine(currentMs);
  if (!force && newActiveLine === state.activeLine) return;

  log.debug('Active line', newActiveLine, '| song ms', Math.round(currentMs));
  state.activeLine = newActiveLine;
  updateActiveLineDOM(newActiveLine);
  scrollToActiveLine(newActiveLine, force ? 'instant' : 'smooth');
}

function updateActiveLineDOM(activeIndex: number): void {
  const container = state.lyricsContainer;
  if (!container) return;

  const lines = container.querySelectorAll('.verso-lyric-line');
  lines.forEach((line, i) => {
    line.classList.toggle('verso-active', i === activeIndex);
    line.classList.toggle('verso-past', i < activeIndex);
    if (i === activeIndex) line.setAttribute('aria-current', 'true');
    else line.removeAttribute('aria-current');
  });
}

function scrollToActiveLine(
  activeIndex: number,
  behavior: ScrollBehavior = 'smooth'
): void {
  const container = state.lyricsContainer;
  if (!container || !isLyricsTabOpen()) return;

  // Before the first lyric starts, keep the first line in view
  const activeLine = container.querySelector<HTMLElement>(
    `.verso-lyric-line[data-index="${Math.max(activeIndex, 0)}"]`
  );
  if (!activeLine) return;

  // Our wrapper only scrolls if its parent has a fixed height; in YTM's tab
  // layout it usually grows with its content and an ancestor scrolls instead.
  const scroller = getScrollParent(activeLine);
  if (!scroller) return;

  const scrollerRect = scroller.getBoundingClientRect();
  const lineRect = activeLine.getBoundingClientRect();
  const offset =
    lineRect.top - scrollerRect.top - scroller.clientHeight / 2 + lineRect.height / 2;

  scroller.scrollTo({
    top: scroller.scrollTop + offset,
    behavior,
  });
}

function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function seekTo(timeMs: number): void {
  // Seek through the player API: like `getCurrentTime`, it is relative to the
  // current song, while the media element's timeline may span several songs.
  const player = getMoviePlayer();
  if (player?.seekTo) {
    player.seekTo(timeMs / 1000, true);
  } else if (state.videoElement) {
    state.videoElement.currentTime = timeMs / 1000;
  }
  syncActiveLine();
}

/** Follows playback every frame while playing; media events cover the rest. */
function startSyncLoop(): void {
  if (state.syncFrame !== null) return;
  const tick = () => {
    syncActiveLine();
    state.syncFrame = requestAnimationFrame(tick);
  };
  state.syncFrame = requestAnimationFrame(tick);
}

function stopSyncLoop(): void {
  if (state.syncFrame !== null) {
    cancelAnimationFrame(state.syncFrame);
    state.syncFrame = null;
  }
}

function bindVideo(video: HTMLVideoElement): void {
  if (state.videoElement === video) return;
  state.videoElement = video;

  const onSourceChange = () => scheduleReconcile();
  video.addEventListener('loadstart', onSourceChange);
  video.addEventListener('loadeddata', onSourceChange);

  video.addEventListener('playing', startSyncLoop);
  video.addEventListener('pause', stopSyncLoop);
  video.addEventListener('ended', stopSyncLoop);
  // Seeks from anywhere (lyrics, player bar, keyboard) and background tabs,
  // where animation frames don't run.
  const onTimeChange = () => syncActiveLine();
  video.addEventListener('seeked', onTimeChange);
  video.addEventListener('timeupdate', onTimeChange);

  if (!video.paused) startSyncLoop();
}

// ===== LIFECYCLE =====

function resetSongState(newVideoId: string | null): void {
  destroyLyricsContainer();
  if (state.currentBrowseId) state.staleBrowseId = state.currentBrowseId;
  state.currentVideoId = newVideoId;
  state.currentBrowseId = null;
  state.timedLyrics = null;
  state.activeLine = -1;
  state.lyricsContainer = null;
  state.staleRetries = 0;
}

function scheduleReconcile(delayMs = RECONCILE_DELAY_MS): void {
  if (state.reconcileTimer !== null) return;
  state.reconcileTimer = setTimeout(() => {
    state.reconcileTimer = null;
    reconcile();
  }, delayMs);
}

/**
 * Brings our UI in line with the page. Runs whenever the player page mutates
 * or the media element loads a new source; safe to run any number of times.
 */
function reconcile(): void {
  const video = document.querySelector<HTMLVideoElement>(SELECTORS.video);
  if (video) bindVideo(video);

  const videoId = getVideoId();
  if (videoId && videoId !== state.currentVideoId) {
    log.info('Song change detected:', videoId);
    resetSongState(videoId);
  }

  const lyricsTab = findLyricsTab();
  state.lyricsTabElement = lyricsTab?.element ?? null;
  const wasOpen = state.lyricsTabOpen;
  state.lyricsTabOpen = !!lyricsTab && isTabSelected(lyricsTab.element);
  if (!lyricsTab || !state.lyricsTabOpen) return;

  const { browseId } = lyricsTab;
  if (!browseId || browseId === state.staleBrowseId) {
    // No lyrics, or the page hasn't caught up with the new song yet
    if (state.staleRetries < STALE_RETRY_LIMIT) {
      state.staleRetries++;
      scheduleReconcile(STALE_RETRY_DELAY_MS);
    }
    return;
  }

  if (browseId !== state.currentBrowseId) {
    void loadLyrics(browseId);
    return;
  }

  // Same lyrics, but switching tabs may have removed our container
  if (state.lyricsContainer && !state.lyricsContainer.isConnected) {
    injectContainer(state.lyricsContainer);
    syncActiveLine(true);
  } else if (!wasOpen) {
    // Scrolling was paused while another tab was open
    syncActiveLine(true);
  }
}

async function loadLyrics(browseId: string): Promise<void> {
  const videoId = state.currentVideoId;
  // Claimed up front so concurrent reconciles don't fetch the same lyrics
  state.currentBrowseId = browseId;
  log.info('Loading lyrics for:', videoId, browseId);

  let lyrics: TimedLyrics | null;
  try {
    lyrics = await fetchTimedLyrics(browseId);
  } catch (err) {
    log.error('Failed to fetch lyrics:', err);
    return;
  }

  if (state.currentVideoId !== videoId || state.currentBrowseId !== browseId) {
    return;
  }

  if (!lyrics || lyrics.lines.length === 0) {
    // Leave YouTube Music's own lyrics (or its "not available" message) as is
    log.info('No timed lyrics for this song');
    return;
  }

  log.info('Timed lyrics:', lyrics.lines.length, 'lines');
  destroyLyricsContainer();
  state.timedLyrics = lyrics.lines;
  state.lyricsContainer = createLyricsContainer(lyrics);
  injectContainer(state.lyricsContainer);
  syncActiveLine(true);
}

// ===== INIT =====

function init(): void {
  log.info('Initializing...');

  // No timeout: the player page may only be created once the user opens the
  // player, possibly long after landing on the home page.
  waitForElement(SELECTORS.playerPage)
    .then((playerPage) => {
      // Tab switches, song changes and YTM rendering its own lyrics all show
      // up as mutations inside the player page.
      new MutationObserver(() => scheduleReconcile()).observe(playerPage, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-selected'],
      });
      scheduleReconcile();
    })
    .catch((err: unknown) => {
      log.warn('Player page not found:', err);
    });
}

init();
