import { log } from '../logger.ts';
import { getCurrentSongMs, getMoviePlayer } from '../player.ts';
import { state } from '../state.ts';
import { isLyricsTabOpen } from '../tabs.ts';
import { getScrollParent } from '../utils.ts';

export function findActiveLine(currentMs: number): number {
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
export function syncActiveLine(force = false): void {
  if (!state.timedLyrics || !state.lyricsContainer?.isConnected) return;

  const currentMs = getCurrentSongMs();
  if (currentMs === null) return;

  const newActiveLine = findActiveLine(currentMs);
  if (!force && newActiveLine === state.activeLine) return;

  log.debug('Active line', newActiveLine, '| song ms', Math.round(currentMs));
  state.activeLine = newActiveLine;
  updateActiveLineDOM(newActiveLine);
  // Hidden tabs don't animate: a smooth scroll started there stalls, and every
  // later one queues behind it until the user scrolls by hand
  scrollToActiveLine(newActiveLine, force || document.hidden ? 'instant' : 'smooth');
}

export function updateActiveLineDOM(activeIndex: number): void {
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

export function scrollToActiveLine(
  activeIndex: number,
  behavior: ScrollBehavior = 'smooth'
): void {
  const container = state.lyricsContainer;
  if (!container || !(state.focusMode || isLyricsTabOpen())) return;

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

export function seekTo(timeMs: number): void {
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
export function startSyncLoop(): void {
  if (state.syncFrame !== null) return;
  const tick = () => {
    syncActiveLine();
    state.syncFrame = requestAnimationFrame(tick);
  };
  state.syncFrame = requestAnimationFrame(tick);
}

export function stopSyncLoop(): void {
  if (state.syncFrame !== null) {
    cancelAnimationFrame(state.syncFrame);
    state.syncFrame = null;
  }
}
