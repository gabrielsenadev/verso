import { SELECTORS } from '../constants.ts';
import { seekTo } from '../lyrics/sync.ts';
import { getCurrentSongMs, getMoviePlayer, getSongDurationMs } from '../player.ts';
import { state } from '../state.ts';
import { createIconButton, setIcon } from './icons.ts';

/** YTM updates its like state asynchronously after the click. */
const LIKE_REFRESH_DELAY_MS = 150;

interface FocusControls {
  root: HTMLElement;
  currentTime: HTMLElement;
  duration: HTMLElement;
  seek: HTMLInputElement;
  playPause: HTMLButtonElement;
  like: HTMLButtonElement;
  dislike: HTMLButtonElement;
  mute: HTMLButtonElement;
  volume: HTMLInputElement;
  /** Whether the user is dragging a slider, which playback must not move. */
  seeking: boolean;
  adjustingVolume: boolean;
}

let controls: FocusControls | null = null;

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function createSlider(className: string, label: string): HTMLInputElement {
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = `verso-slider ${className}`;
  slider.min = '0';
  slider.step = 'any';
  slider.setAttribute('aria-label', label);
  return slider;
}

/** Fills the track up to the thumb (range inputs only style it natively in Firefox). */
function setSliderFill(slider: HTMLInputElement): void {
  const max = Number(slider.max) || 1;
  const percent = (Number(slider.value) / max) * 100;
  slider.style.setProperty('--verso-slider-fill', `${percent}%`);
}

/** Drives YTM's own player bar buttons, so its state (queue, likes) stays in charge. */
function clickNative(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click();
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setLabel(button: HTMLButtonElement, label: string): void {
  if (button.getAttribute('aria-label') === label) return;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function getLikeStatus(): string | null {
  const renderer = document.querySelector(SELECTORS.likeRenderer);
  if (renderer) return renderer.getAttribute('like-status');
  // Newer player bar: plain toggle buttons
  const pressed = (selector: string) =>
    document.querySelector(selector)?.getAttribute('aria-pressed') === 'true';
  if (pressed(SELECTORS.likeButton)) return 'LIKE';
  if (pressed(SELECTORS.dislikeButton)) return 'DISLIKE';
  return null;
}

export function createFocusControls(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'verso-focus-controls';

  // ----- Progress -----
  const progress = document.createElement('div');
  progress.className = 'verso-focus-progress';

  const currentTime = document.createElement('span');
  currentTime.className = 'verso-focus-time';
  const duration = document.createElement('span');
  duration.className = 'verso-focus-time';
  const seek = createSlider('verso-focus-seek', 'Seek');

  seek.addEventListener('input', () => {
    if (!controls) return;
    controls.seeking = true;
    setText(currentTime, formatTime(Number(seek.value)));
    setSliderFill(seek);
  });
  seek.addEventListener('change', () => {
    if (!controls) return;
    controls.seeking = false;
    seekTo(Number(seek.value));
  });

  progress.append(currentTime, seek, duration);

  // ----- Buttons -----
  const buttons = document.createElement('div');
  buttons.className = 'verso-focus-buttons';

  const previous = createIconButton('previous', 'Previous');
  previous.addEventListener('click', () => clickNative(SELECTORS.previousButton));

  const playPause = createIconButton('play', 'Play');
  playPause.classList.add('verso-focus-play');
  playPause.addEventListener('click', () => clickNative(SELECTORS.playPauseButton));

  const next = createIconButton('next', 'Next');
  next.addEventListener('click', () => clickNative(SELECTORS.nextButton));

  const refreshSoon = () => setTimeout(syncFocusControls, LIKE_REFRESH_DELAY_MS);
  const like = createIconButton('likeOutline', 'Like');
  like.addEventListener('click', () => {
    clickNative(SELECTORS.likeButton);
    refreshSoon();
  });
  const dislike = createIconButton('dislikeOutline', 'Dislike');
  dislike.addEventListener('click', () => {
    clickNative(SELECTORS.dislikeButton);
    refreshSoon();
  });

  const transport = document.createElement('div');
  transport.className = 'verso-focus-transport';
  transport.append(previous, playPause, next);

  const rating = document.createElement('div');
  rating.className = 'verso-focus-rating';
  rating.append(like, dislike);

  // ----- Volume -----
  const volumeGroup = document.createElement('div');
  volumeGroup.className = 'verso-focus-volume';

  const mute = createIconButton('volume', 'Mute');
  mute.addEventListener('click', () => {
    const player = getMoviePlayer();
    if (player?.isMuted?.()) player.unMute?.();
    else player?.mute?.();
    syncFocusControls();
  });

  const volume = createSlider('verso-focus-volume-slider', 'Volume');
  volume.max = '100';
  volume.addEventListener('input', () => {
    if (!controls) return;
    controls.adjustingVolume = true;
    const player = getMoviePlayer();
    const value = Number(volume.value);
    player?.setVolume?.(value);
    if (value > 0 && player?.isMuted?.()) player.unMute?.();
    setSliderFill(volume);
  });
  volume.addEventListener('change', () => {
    if (controls) controls.adjustingVolume = false;
    syncFocusControls();
  });

  volumeGroup.append(mute, volume);
  buttons.append(transport, rating, volumeGroup);
  root.append(progress, buttons);

  controls = {
    root,
    currentTime,
    duration,
    seek,
    playPause,
    like,
    dislike,
    mute,
    volume,
    seeking: false,
    adjustingVolume: false,
  };
  return root;
}

/** Mirrors playback, rating and volume into the focus mode controls. */
export function syncFocusControls(): void {
  if (!state.focusMode || !controls?.root.isConnected) return;
  const c = controls;

  const durationMs = getSongDurationMs() ?? 0;
  const currentMs = Math.min(getCurrentSongMs() ?? 0, durationMs);
  setText(c.duration, formatTime(durationMs));
  if (!c.seeking) {
    c.seek.max = String(durationMs);
    c.seek.value = String(currentMs);
    setText(c.currentTime, formatTime(currentMs));
    setSliderFill(c.seek);
  }

  const playing = !!state.videoElement && !state.videoElement.paused;
  setIcon(c.playPause, playing ? 'pause' : 'play');
  setLabel(c.playPause, playing ? 'Pause' : 'Play');

  const likeStatus = getLikeStatus();
  const liked = likeStatus === 'LIKE';
  const disliked = likeStatus === 'DISLIKE';
  // Outlined until active, filled once active, as in YTM's own player bar
  setIcon(c.like, liked ? 'like' : 'likeOutline');
  setIcon(c.dislike, disliked ? 'dislike' : 'dislikeOutline');
  c.like.setAttribute('aria-pressed', String(liked));
  c.dislike.setAttribute('aria-pressed', String(disliked));

  const player = getMoviePlayer();
  const muted = player?.isMuted?.() ?? false;
  setIcon(c.mute, muted ? 'muted' : 'volume');
  setLabel(c.mute, muted ? 'Unmute' : 'Mute');
  if (!c.adjustingVolume) {
    const level = muted ? 0 : (player?.getVolume?.() ?? 100);
    c.volume.value = String(level);
    setSliderFill(c.volume);
  }
}
