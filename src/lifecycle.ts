import { log } from './logger.ts';
import { fetchTimedLyrics } from './api.ts';
import { RECONCILE_DELAY_MS, SELECTORS, STALE_RETRY_DELAY_MS, STALE_RETRY_LIMIT } from './constants.ts';
import { createLyricsContainer, destroyLyricsContainer, injectContainer } from './lyrics/dom.ts';
import { startSyncLoop, stopSyncLoop, syncActiveLine } from './lyrics/sync.ts';
import { getVideoId } from './player.ts';
import { state } from './state.ts';
import { findLyricsTab, isTabSelected } from './tabs.ts';
import type { TimedLyrics } from './types.ts';

export function bindVideo(video: HTMLVideoElement): void {
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

export function resetSongState(newVideoId: string | null): void {
  destroyLyricsContainer();
  if (state.currentBrowseId) state.staleBrowseId = state.currentBrowseId;
  state.currentVideoId = newVideoId;
  state.currentBrowseId = null;
  state.timedLyrics = null;
  state.activeLine = -1;
  state.lyricsContainer = null;
  state.staleRetries = 0;
}

export function scheduleReconcile(delayMs = RECONCILE_DELAY_MS): void {
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
export function reconcile(): void {
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

export async function loadLyrics(browseId: string): Promise<void> {
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

  log.info('Timed lyrics:', lyrics.lines.length, 'lines, synced:', lyrics.synced);
  destroyLyricsContainer();
  // Without start times every line would "start" at 0, so leave sync off
  state.timedLyrics = lyrics.synced ? lyrics.lines : null;
  state.lyricsContainer = createLyricsContainer(lyrics);
  injectContainer(state.lyricsContainer);
  syncActiveLine(true);
}
