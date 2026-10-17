import { log } from '../logger.ts';
import { CONTAINER_ID, SELECTORS } from '../constants.ts';
import { seekTo } from './sync.ts';
import { state } from '../state.ts';
import type { TimedLyrics } from '../types.ts';

export function createLyricsContainer(lyrics: TimedLyrics): HTMLElement {
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.classList.toggle('verso-unsynced', !lyrics.synced);

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
    // A native button is focusable and activated by Enter/Space on its own;
    // unsynced lines have nowhere to seek to, so they're plain text.
    const lineEl = document.createElement(lyrics.synced ? 'button' : 'div');
    if (lineEl instanceof HTMLButtonElement) lineEl.type = 'button';
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

export function injectContainer(container: HTMLElement): void {
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

export function destroyLyricsContainer(): void {
  document.getElementById(CONTAINER_ID)?.remove();

  for (const shelf of document.querySelectorAll<HTMLElement>(SELECTORS.anyShelf)) {
    shelf.style.removeProperty('display');
  }
}
