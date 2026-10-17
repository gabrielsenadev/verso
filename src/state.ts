import type { State } from './types.ts';

export const state: State = {
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
  lyricsLookupVideoId: null,
  focusMode: false,
  focusOverlay: null,
  focusColorSource: null,
};
