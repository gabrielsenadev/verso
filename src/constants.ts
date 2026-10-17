export const ANDROID_CLIENT = {
  clientName: 'ANDROID_MUSIC',
  clientVersion: '7.27.52',
  androidSdkVersion: 30,
};

export const BROWSE_ENDPOINT = '/youtubei/v1/browse?prettyPrint=false';

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
} as const;

export const CONTAINER_ID = 'verso-container';

/** Coalesces bursts of DOM mutations into one reconcile pass. */
export const RECONCILE_DELAY_MS = 100;
/**
 * While the Lyrics tab is open but the page still holds the previous song's
 * data, retry a few times in case no further mutation arrives to wake us.
 */
export const STALE_RETRY_DELAY_MS = 500;
export const STALE_RETRY_LIMIT = 10;
