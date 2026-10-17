import { SELECTORS } from './constants.ts';
import { state } from './state.ts';
import type { MoviePlayer } from './types.ts';

export function getMoviePlayer(): MoviePlayer | null {
  return document.querySelector<MoviePlayer>(SELECTORS.moviePlayer);
}

export function getVideoId(): string | null {
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
export function getCurrentSongMs(): number | null {
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
