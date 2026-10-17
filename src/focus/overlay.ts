import { log } from '../logger.ts';
import {
  FOCUS_ACTIVE_CLASS,
  FOCUS_BUTTON_ID,
  FOCUS_OVERLAY_ID,
  SELECTORS,
} from '../constants.ts';
import { injectContainer } from '../lyrics/dom.ts';
import { syncActiveLine } from '../lyrics/sync.ts';
import { state } from '../state.ts';
import { isLyricsTabOpen } from '../tabs.ts';
import { FALLBACK_COLOR, pickDominantColor, toBackground, toCss, type Rgb } from './color.ts';
import { createFocusControls, syncFocusControls } from './controls.ts';
import { createIconButton } from './icons.ts';

/** Marquee speed for titles too long to fit. */
const TITLE_SCROLL_PX_PER_SECOND = 40;

/** Artwork is scaled down to this many pixels per side before sampling. */
const COLOR_SAMPLE_SIZE = 32;

/** Where the native player is laid over the overlay, as CSS variables on `<html>`. */
const MEDIA_VARS = {
  left: '--verso-focus-media-left',
  top: '--verso-focus-media-top',
  width: '--verso-focus-media-width',
  height: '--verso-focus-media-height',
} as const;

let mediaObserver: ResizeObserver | null = null;

// ----- Entry point -----

/** Adds the focus mode button to YTM's player bar; safe to call repeatedly. */
export function injectFocusButton(onClick: () => void): void {
  if (document.getElementById(FOCUS_BUTTON_ID)?.isConnected) return;
  const host = document.querySelector(SELECTORS.playerBarButtons);
  if (!host) return;

  const button = createIconButton('focus', 'Focus mode');
  button.id = FOCUS_BUTTON_ID;
  button.addEventListener('click', (e) => {
    // Clicks on the player bar's background open/close the player page
    e.stopPropagation();
    onClick();
  });
  const menu = host.querySelector(`:scope > ${SELECTORS.playerBarMenuButton}`);
  if (menu) host.insertBefore(button, menu);
  else host.prepend(button);
}

// ----- Overlay -----

function createFocusOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = FOCUS_OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Focus mode');

  const left = document.createElement('div');
  left.className = 'verso-focus-left';
  // Empty slot: YTM's own player is positioned over it
  const media = document.createElement('div');
  media.className = 'verso-focus-media';
  left.append(createTitle(), media, createFocusControls());

  const lyrics = document.createElement('div');
  lyrics.className = 'verso-focus-lyrics';
  // Shown by the stylesheet only while there's no lyrics container
  const message = document.createElement('div');
  message.className = 'verso-focus-message';
  lyrics.appendChild(message);

  const close = createIconButton('close', 'Exit focus mode');
  close.classList.add('verso-focus-close');
  close.addEventListener('click', exitFocusMode);

  overlay.append(left, lyrics, close);
  return overlay;
}

/**
 * The song title, plus a copy that only shows while it scrolls: the two side
 * by side make the marquee loop seamlessly.
 */
function createTitle(): HTMLElement {
  const title = document.createElement('div');
  title.className = 'verso-focus-title';
  const track = document.createElement('div');
  track.className = 'verso-focus-title-track';
  const text = document.createElement('span');
  text.className = 'verso-focus-title-text';
  const copy = document.createElement('span');
  copy.className = 'verso-focus-title-text';
  copy.setAttribute('aria-hidden', 'true');
  track.append(text, copy);
  title.appendChild(track);
  return title;
}

/** The player bar shows the song even while an ad plays; the media session doesn't. */
function getSongTitle(): string {
  const fromBar = document.querySelector(SELECTORS.playerBarTitle)?.textContent?.trim();
  return fromBar || navigator.mediaSession?.metadata?.title || '';
}

function syncTitle(): void {
  const title = state.focusOverlay?.querySelector<HTMLElement>('.verso-focus-title');
  const [text, copy] = title?.querySelectorAll('.verso-focus-title-text') ?? [];
  if (!title || !text || !copy) return;

  const songTitle = getSongTitle();
  if (text.textContent === songTitle) return;
  text.textContent = songTitle;
  copy.textContent = songTitle;
  title.title = songTitle;
  updateMarquee();
}

/** Scrolls the title only when it overflows; restarts from the start on every change. */
function updateMarquee(): void {
  const title = state.focusOverlay?.querySelector<HTMLElement>('.verso-focus-title');
  const text = title?.querySelector<HTMLElement>('.verso-focus-title-text');
  if (!title || !text) return;

  title.classList.remove('verso-marquee');
  // Reading the layout also flushes the class removal, so the animation restarts
  if (text.offsetWidth <= title.clientWidth) return;

  title.classList.add('verso-marquee');
  // Measured with the marquee's trailing gap, which the copy then fills
  const distance = text.offsetWidth;
  title.style.setProperty('--verso-marquee-distance', `${distance}px`);
  title.style.setProperty(
    '--verso-marquee-duration',
    `${distance / TITLE_SCROLL_PX_PER_SECOND}s`
  );
}

/** Shown in place of the lyrics, e.g. when the song has none; `''` to clear. */
export function setFocusMessage(text: string): void {
  const message = state.focusOverlay?.querySelector('.verso-focus-message');
  if (message && message.textContent !== text) message.textContent = text;
}

function positionPlayer(): void {
  const media = state.focusOverlay?.querySelector('.verso-focus-media');
  if (!media) return;
  const rect = media.getBoundingClientRect();
  const root = document.documentElement.style;
  const set = (name: string, px: number) => {
    const value = `${px}px`;
    if (root.getPropertyValue(name) !== value) root.setProperty(name, value);
  };
  set(MEDIA_VARS.left, rect.left);
  set(MEDIA_VARS.top, rect.top);
  set(MEDIA_VARS.width, rect.width);
  set(MEDIA_VARS.height, rect.height);
}

/** Sizes the media slot for a square cover or a 16:9 music video. */
function syncMediaMode(): void {
  const videoMode = !!document.querySelector(SELECTORS.player)?.hasAttribute('video-mode');
  state.focusOverlay?.classList.toggle('verso-focus-video', videoMode);
}

function openPlayerPage(): void {
  const layout = document.querySelector(SELECTORS.appLayout);
  if (layout && !layout.hasAttribute('player-page-open')) {
    const toggle =
      document.querySelector<HTMLElement>(SELECTORS.togglePlayerPage) ??
      document.querySelector<HTMLElement>(SELECTORS.miniPlayer);
    toggle?.click();
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  // Keep YTM from also handling it, e.g. by closing the player page
  e.preventDefault();
  e.stopPropagation();
  exitFocusMode();
}

export function enterFocusMode(): void {
  if (state.focusMode) return;
  const playerPage = document.querySelector(SELECTORS.playerPage);
  if (!playerPage) {
    log.warn('Focus mode: player page not found');
    return;
  }
  log.info('Entering focus mode');

  state.focusMode = true;
  openPlayerPage();

  const overlay = state.focusOverlay ?? createFocusOverlay();
  state.focusOverlay = overlay;
  // Inside the player page, so YTM's player can be stacked above the overlay
  playerPage.appendChild(overlay);
  document.documentElement.classList.add(FOCUS_ACTIVE_CLASS);

  mediaObserver = new ResizeObserver(() => {
    positionPlayer();
    updateMarquee();
  });
  const media = overlay.querySelector('.verso-focus-media');
  if (media) mediaObserver.observe(media);
  const title = overlay.querySelector('.verso-focus-title');
  if (title) mediaObserver.observe(title);
  window.addEventListener('resize', positionPlayer);
  window.addEventListener('keydown', onKeyDown, true);

  if (state.lyricsContainer) {
    injectContainer(state.lyricsContainer);
    syncActiveLine(true);
  }
  syncFocusMode();
  positionPlayer();
  overlay.querySelector<HTMLElement>('.verso-focus-close')?.focus();
}

export function exitFocusMode(): void {
  if (!state.focusMode) return;
  log.info('Leaving focus mode');

  state.focusMode = false;
  mediaObserver?.disconnect();
  mediaObserver = null;
  window.removeEventListener('resize', positionPlayer);
  window.removeEventListener('keydown', onKeyDown, true);

  document.documentElement.classList.remove(FOCUS_ACTIVE_CLASS);
  for (const name of Object.values(MEDIA_VARS)) {
    document.documentElement.style.removeProperty(name);
  }
  state.focusOverlay?.remove();

  // Back to the Lyrics tab; if it's closed, reconcile puts them back once it opens
  const container = state.lyricsContainer;
  if (container) {
    if (isLyricsTabOpen()) {
      injectContainer(container);
      syncActiveLine(true);
    } else {
      container.remove();
    }
  }
  document.getElementById(FOCUS_BUTTON_ID)?.focus();
}

/** Brings everything but the lyrics in line with what's playing. */
export function syncFocusMode(): void {
  if (!state.focusMode) return;
  syncMediaMode();
  syncTitle();
  // The slot can move without resizing (e.g. the page settling), which the
  // ResizeObserver misses
  positionPlayer();
  syncFocusControls();
  void updateFocusColor();
}

// ----- Background color -----

/** Largest artwork the page announces for the current song. */
function getArtworkUrl(): string | null {
  const artwork = navigator.mediaSession?.metadata?.artwork ?? [];
  let best: { src: string; size: number } | null = null;
  for (const { src, sizes } of artwork) {
    const size = parseInt(sizes ?? '', 10) || 0;
    if (!best || size > best.size) best = { src, size };
  }
  return best?.src ?? document.querySelector<HTMLImageElement>(SELECTORS.playerBarImage)?.src ?? null;
}

function extractColor(url: string): Promise<Rgb> {
  return new Promise((resolve) => {
    const img = new Image();
    // Both artwork hosts allow CORS; without it the canvas would be unreadable
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = COLOR_SAMPLE_SIZE;
        canvas.height = COLOR_SAMPLE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(FALLBACK_COLOR);
        ctx.drawImage(img, 0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE);
        resolve(pickDominantColor(ctx.getImageData(0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE).data));
      } catch (err) {
        log.warn('Focus mode: artwork unreadable', err);
        resolve(FALLBACK_COLOR);
      }
    };
    img.onerror = () => resolve(FALLBACK_COLOR);
    img.src = url;
  });
}

async function updateFocusColor(): Promise<void> {
  const url = getArtworkUrl();
  if (!url || url === state.focusColorSource) return;
  state.focusColorSource = url;

  const color = toBackground(await extractColor(url));
  // A newer song may have started while the artwork loaded
  if (state.focusColorSource !== url) return;
  log.debug('Focus mode color:', toCss(color), 'from', url);
  state.focusOverlay?.style.setProperty('--verso-focus-color', toCss(color));
}
