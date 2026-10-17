export interface TimedLyricLine {
  text: string;
  startMs: number;
}

export interface TimedLyrics {
  lines: TimedLyricLine[];
  /**
   * Whether lines carry start times. Some sources (e.g. LyricFind) send
   * `timedLyricsData` without any `cueRange`: shown styled, but not synced.
   */
  synced: boolean;
  /** Attribution as the API returned it, e.g. "Source: Musixmatch". */
  source: string | null;
}

export interface LyricsTab {
  element: HTMLElement;
  /** `null` when the song has no lyrics or the id can't be found. */
  browseId: string | null;
}

export interface State {
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
  /** Full-screen overlay with the player, its controls and the lyrics. */
  focusMode: boolean;
  focusOverlay: HTMLElement | null;
  /** Song whose lyrics browse id was last looked up through the API. */
  lyricsLookupVideoId: string | null;
  /** Artwork the focus mode background color was last taken from. */
  focusColorSource: string | null;
}

/** Any object reached while walking an untyped InnerTube response. */
export type UnknownRecord = Record<string, unknown>;

/** Subset of the `#movie_player` element API exposed by YouTube's player. */
export interface MoviePlayer extends HTMLElement {
  getVideoData?: () => { video_id?: string } | undefined;
  getCurrentTime?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getDuration?: () => number;
  /** The watch response for the loaded video; `lengthSeconds` is a numeric string. */
  getPlayerResponse?: () =>
    | { videoDetails?: { videoId?: string; lengthSeconds?: string } }
    | undefined;
  /** 0–100. */
  getVolume?: () => number;
  setVolume?: (volume: number) => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
}

/** Polymer's `<dom-repeat>`, which stamps the player page tabs. */
export interface DomRepeat extends HTMLElement {
  itemForElement?: (el: Element) => unknown;
}
