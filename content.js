(function () {
  'use strict';

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
  };

  const SYNC_INTERVAL_MS = 50;
  const CONTAINER_ID = 'ytms-synced-lyrics-container';

  // ===== LOGGING =====

  // Hard-coded config for now. Future: read from extension settings / storage.
  const LOG_CONFIG = {
    level: 'debug', // 'debug' | 'info' | 'warn' | 'error' | 'silent'
    prefix: '[YTMS]',
  };

  const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

  function shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[LOG_CONFIG.level];
  }

  const log = {
    debug: (...args) => {
      if (shouldLog('debug')) console.log(LOG_CONFIG.prefix, ...args);
    },
    info: (...args) => {
      if (shouldLog('info')) console.info(LOG_CONFIG.prefix, ...args);
    },
    warn: (...args) => {
      if (shouldLog('warn')) console.warn(LOG_CONFIG.prefix, ...args);
    },
    error: (...args) => {
      if (shouldLog('error')) console.error(LOG_CONFIG.prefix, ...args);
    },
  };

  // ===== STATE =====

  const state = {
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

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function getApiKey() {
    try {
      return window.ytcfg?.data_?.INNERTUBE_API_KEY || null;
    } catch {
      return null;
    }
  }

  function findKeyDeep(obj, targetKey, maxDepth = 15) {
    if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;
    if (obj[targetKey] !== undefined) return obj[targetKey];
    for (const key of Object.keys(obj)) {
      const result = findKeyDeep(obj[key], targetKey, maxDepth - 1);
      if (result) return result;
    }
    return null;
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver((_, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
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

  function findBrowseIdInObject(obj, depth = 0, visited = null) {
    if (!visited) visited = new WeakSet();
    if (!obj || typeof obj !== 'object' || depth > 12) return null;
    try {
      if (visited.has(obj)) return null;
      visited.add(obj);
    } catch {
      return null;
    }

    if (
      typeof obj.browseId === 'string' &&
      obj.browseId.startsWith('MPLYt')
    ) {
      return obj.browseId;
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

  function getLyricsBrowseId() {
    const playerPage = document.querySelector('ytmusic-player-page');
    if (!playerPage) return null;

    // Check the player page element itself
    for (const prop of ['data', '__data', 'playerPageData_']) {
      try {
        const result = findBrowseIdInObject(playerPage[prop]);
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
          if (el[prop] && typeof el[prop] === 'object') {
            const result = findBrowseIdInObject(el[prop]);
            if (result) return result;
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  async function fetchTimedLyrics(browseId) {
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

    const data = await response.json();
    return parseTimedLyrics(data);
  }

  function parseTimedLyrics(responseData) {
    const timedData = findKeyDeep(responseData, 'timedLyricsData');
    if (!timedData || !Array.isArray(timedData)) {
      return null;
    }

    return timedData.map((entry) => ({
      text: entry.lyricLine || '',
      startMs: parseInt(entry.cueRange?.startTimeMilliseconds || '0', 10),
      endMs: parseInt(entry.cueRange?.endTimeMilliseconds || '0', 10),
    }));
  }

  // ===== DOM MODULE =====

  function createLyricsContainer() {
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

  function injectContainer(container) {
    // Try multiple injection targets
    const targets = [
      document.querySelector('#tab-content'),
      document.querySelector('ytmusic-player-page #tab-content'),
      document.querySelector('ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]')?.parentElement,
      document.querySelector('ytmusic-description-shelf-renderer')?.parentElement,
    ];

    const target = targets.find((t) => t);
    log.debug('Injection target:', target?.tagName, target?.id, target?.className);

    if (!target) {
      log.warn('No injection target found');
      return;
    }

    const originalShelf = target.querySelector(
      'ytmusic-description-shelf-renderer'
    );
    if (originalShelf) {
      originalShelf.style.display = 'none';
    }
    target.prepend(container);
  }

  function renderLyricsLines(lyrics, container) {
    const linesWrapper = container.querySelector('.ytms-lyrics-lines');
    linesWrapper.replaceChildren();

    lyrics.forEach((line, index) => {
      const lineEl = document.createElement('div');
      lineEl.classList.add('ytms-lyric-line');
      lineEl.dataset.index = index;
      lineEl.dataset.startMs = line.startMs;
      lineEl.textContent = line.text || '\u266A';

      lineEl.addEventListener('click', () => {
        seekToLine(line.startMs);
      });

      linesWrapper.appendChild(lineEl);
    });
  }

  function renderFallbackLyrics(plainText, container) {
    const linesWrapper = container.querySelector('.ytms-lyrics-lines');
    linesWrapper.replaceChildren();
    container.classList.add('ytms-fallback-mode');

    const textEl = document.createElement('div');
    textEl.classList.add('ytms-plain-lyrics');
    textEl.textContent = plainText;
    linesWrapper.appendChild(textEl);
  }

  function destroyLyricsContainer() {
    const existing = document.getElementById(CONTAINER_ID);
    if (existing) existing.remove();

    const originalShelf = document.querySelector(
      'ytmusic-description-shelf-renderer[style*="display: none"]'
    );
    if (originalShelf) {
      originalShelf.style.display = '';
    }
  }

  // ===== SYNC MODULE =====

  function startSyncLoop() {
    stopSyncLoop();

    const video = document.querySelector(SELECTORS.video);
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

  function findActiveLine(currentMs) {
    const lyrics = state.timedLyrics;
    if (!lyrics) return -1;

    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentMs >= lyrics[i].startMs) {
        return i;
      }
    }
    return -1;
  }

  function updateActiveLineDOM(activeIndex) {
    const container = state.lyricsContainer;
    if (!container) return;

    const lines = container.querySelectorAll('.ytms-lyric-line');
    lines.forEach((line, i) => {
      line.classList.toggle('ytms-active', i === activeIndex);
      line.classList.toggle('ytms-past', i < activeIndex);
    });
  }

  function scrollToActiveLine(activeIndex) {
    const container = state.lyricsContainer;
    if (!container || activeIndex < 0) return;

    const scrollWrapper = container.querySelector(
      '.ytms-lyrics-scroll-wrapper'
    );
    const activeLine = container.querySelector(
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

  function seekToLine(timeMs) {
    const video =
      state.videoElement || document.querySelector(SELECTORS.video);
    if (video) {
      video.currentTime = timeMs / 1000;
    }
  }

  function stopSyncLoop() {
    if (state.syncTimer) {
      clearInterval(state.syncTimer);
      state.syncTimer = null;
    }
  }

  // ===== NAVIGATION MODULE =====

  function resetSongState(newVideoId) {
    stopSyncLoop();
    destroyLyricsContainer();
    state.currentVideoId = newVideoId;
    state.timedLyrics = null;
    state.currentBrowseId = null;
    state.activeLine = -1;
    state.fallbackMode = false;
    state.lyricsContainer = null;
  }

  function isLyricsTabActive() {
    const tabs = document.querySelectorAll('ytmusic-player-page .tab-header');
    for (const tab of tabs) {
      if (tab.textContent.trim().toLowerCase() !== 'lyrics') continue;
      return (
        tab.classList.contains('iron-selected') ||
        tab.getAttribute('aria-selected') === 'true' ||
        tab.hasAttribute('selected')
      );
    }
    return false;
  }

  function observeSongChanges() {
    const video = document.querySelector(SELECTORS.video);
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

  function observeLyricsTab() {
    const playerPage = document.querySelector(SELECTORS.playerPage);
    if (!playerPage) return;

    playerPage.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab-header');
      if (!tab) return;
      if (tab.textContent.trim().toLowerCase() !== 'lyrics') return;

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

  async function loadLyricsForCurrentSong() {
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

      log.info('Timed lyrics result:', timedLyrics ? timedLyrics.length + ' lines' : 'null');

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

  function showFallbackLyrics() {
    const shelf = document.querySelector(SELECTORS.lyricsShelf);
    const desc = shelf?.querySelector('.description');
    if (desc && desc.textContent.trim()) {
      state.fallbackMode = true;
      const container = createLyricsContainer();
      renderFallbackLyrics(desc.textContent.trim(), container);
      injectContainer(container);
      state.lyricsContainer = container;
    } else {
      showNoLyricsState();
    }
  }

  function showNoLyricsState() {
    const container = createLyricsContainer();
    const linesWrapper = container.querySelector('.ytms-lyrics-lines');
    const msg = document.createElement('div');
    msg.className = 'ytms-no-lyrics';
    msg.textContent = 'No lyrics available for this song';
    linesWrapper.appendChild(msg);
    injectContainer(container);
    state.lyricsContainer = container;
  }

  // ===== INIT =====

  function init() {
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
      .catch((err) => {
        log.warn('Player page not found:', err);
      });
  }

  init();
})();
