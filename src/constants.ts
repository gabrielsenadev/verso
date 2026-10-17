export const ANDROID_CLIENT = {
  clientName: 'ANDROID_MUSIC',
  clientVersion: '7.27.52',
  androidSdkVersion: 30,
};

export const BROWSE_ENDPOINT = '/youtubei/v1/browse?prettyPrint=false';
export const NEXT_ENDPOINT = '/youtubei/v1/next?prettyPrint=false';

export const LYRICS_PAGE_TYPE = 'MUSIC_PAGE_TYPE_TRACK_LYRICS';
export const LYRICS_BROWSE_ID_PREFIX = 'MPLYt';
// Only used when the tab data can't be read: YouTube Music lists
// "Up next", "Lyrics", … in that order.
export const LYRICS_TAB_FALLBACK_INDEX = 1;

export const SELECTORS = {
  video: '#movie_player video',
  moviePlayer: '#movie_player',
  playerPage: 'ytmusic-player-page',
  tabs: 'ytmusic-player-page .tab-header',
  lyricsShelf: `ytmusic-description-shelf-renderer[page-type="${LYRICS_PAGE_TYPE}"]`,
  anyShelf: 'ytmusic-player-page ytmusic-description-shelf-renderer',
  tabContent: 'ytmusic-player-page #tab-content',
  appLayout: 'ytmusic-app-layout',
  player: 'ytmusic-player-page ytmusic-player',
  // The player bar comes in two versions, A/B tested: the classic
  // `ytmusic-player-bar` and the newer `ytmusic-miniplayer`. Each selector
  // lists both; only one of them is on the page at a time.
  playerBarImage: 'ytmusic-player-bar img.image, ytmusic-miniplayer img.ytmusicTrackInfoThumbnail',
  playerBarTitle:
    'ytmusic-player-bar .content-info-wrapper .title, ytmusic-miniplayer .ytmusicTrackInfoTitle',
  playerBarButtons:
    'ytmusic-player-bar .right-controls-buttons, ytmusic-miniplayer .ytMusicMiniPlayerRightSection',
  /** The focus button goes before this one in the newer player bar. */
  playerBarMenuButton: '.ytMusicMiniPlayerMenuButton',
  togglePlayerPage: 'ytmusic-player-bar .toggle-player-page-button button',
  /** The newer player bar has no toggle: clicking the bar itself opens the player page. */
  miniPlayer: 'ytmusic-miniplayer',
  previousButton:
    'ytmusic-player-bar .previous-button button, ytmusic-miniplayer .ytmusicPlayerControlsPreviousButton button',
  playPauseButton:
    'ytmusic-player-bar #play-pause-button button, ytmusic-miniplayer .ytmusicPlayerControlsPlayPauseButton button',
  nextButton:
    'ytmusic-player-bar .next-button button, ytmusic-miniplayer .ytmusicPlayerControlsNextButton button',
  /** Classic player bar: the state is the renderer's `like-status` attribute. */
  likeRenderer: 'ytmusic-player-bar ytmusic-like-button-renderer',
  likeButton:
    'ytmusic-player-bar ytmusic-like-button-renderer .like button, ytmusic-miniplayer like-button-view-model button',
  dislikeButton:
    'ytmusic-player-bar ytmusic-like-button-renderer .dislike button, ytmusic-miniplayer dislike-button-view-model button',
  focusLyrics: '#verso-focus .verso-focus-lyrics',
} as const;

export const CONTAINER_ID = 'verso-container';
export const FOCUS_OVERLAY_ID = 'verso-focus';
export const FOCUS_BUTTON_ID = 'verso-focus-button';
/** Set on `<html>` while focus mode is on; the stylesheet keys off it. */
export const FOCUS_ACTIVE_CLASS = 'verso-focus-active';

/** Coalesces bursts of DOM mutations into one reconcile pass. */
export const RECONCILE_DELAY_MS = 100;
/**
 * While the Lyrics tab is open but the page still holds the previous song's
 * data, retry a few times in case no further mutation arrives to wake us.
 */
export const STALE_RETRY_DELAY_MS = 500;
export const STALE_RETRY_LIMIT = 10;
