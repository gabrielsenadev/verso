import { ANDROID_CLIENT, BROWSE_ENDPOINT, NEXT_ENDPOINT } from './constants.ts';
import { findBrowseIdInObject } from './tabs.ts';
import type { TimedLyrics } from './types.ts';
import { findObjectWithKey, isRecord, readText } from './utils.ts';

export function getApiKey(): string | null {
  try {
    return window.ytcfg?.data_?.INNERTUBE_API_KEY || null;
  } catch {
    return null;
  }
}

async function postInnerTube(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = getApiKey();
  const url = `https://music.youtube.com${endpoint}${apiKey ? '&key=' + encodeURIComponent(apiKey) : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    // Requests without the page's session cookies get "Lyrics not available"
    // back, so `omit` is not an option here.
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          ...ANDROID_CLIENT,
          hl: window.ytcfg?.data_?.INNERTUBE_CONTEXT_HL || 'en',
          gl: window.ytcfg?.data_?.INNERTUBE_CONTEXT_GL || 'US',
        },
      },
      ...params,
    }),
  });

  if (!response.ok) {
    throw new Error(`InnerTube ${endpoint} returned ${response.status}`);
  }

  return response.json();
}

export async function fetchTimedLyrics(browseId: string): Promise<TimedLyrics | null> {
  return parseTimedLyrics(await postInnerTube(BROWSE_ENDPOINT, { browseId }));
}

/**
 * Looks up the lyrics browse id for a song straight from the watch-next data,
 * for when the page's Lyrics tab can't tell (never rendered, not yet updated).
 */
export async function fetchLyricsBrowseId(videoId: string): Promise<string | null> {
  return parseLyricsBrowseId(await postInnerTube(NEXT_ENDPOINT, { videoId }));
}

export function parseLyricsBrowseId(responseData: unknown): string | null {
  const tabbed = findObjectWithKey(responseData, 'watchNextTabbedResultsRenderer');
  const tabs = tabbed?.['watchNextTabbedResultsRenderer'];
  const list = isRecord(tabs) && Array.isArray(tabs['tabs']) ? tabs['tabs'] : [];

  for (const tab of list) {
    const tabRenderer = isRecord(tab) ? tab['tabRenderer'] : null;
    if (!isRecord(tabRenderer)) continue;
    // Only the endpoint: the "Up next" tab's content holds a whole queue.
    const browseId = findBrowseIdInObject(tabRenderer['endpoint']);
    if (!browseId) continue;
    // Songs without lyrics keep the tab, marked unselectable.
    return tabRenderer['unselectable'] === true ? null : browseId;
  }
  return null;
}

export function parseTimedLyrics(responseData: unknown): TimedLyrics | null {
  const lyricsData = findObjectWithKey(responseData, 'timedLyricsData');
  const timedData = lyricsData?.['timedLyricsData'];
  if (!lyricsData || !Array.isArray(timedData)) {
    return null;
  }

  const entries = timedData.filter(isRecord);
  const synced = entries.some(
    (entry) =>
      isRecord(entry['cueRange']) &&
      entry['cueRange']['startTimeMilliseconds'] !== undefined
  );

  const lines = entries.map((entry) => {
    const cueRange = isRecord(entry['cueRange']) ? entry['cueRange'] : {};
    return {
      text: typeof entry['lyricLine'] === 'string' ? entry['lyricLine'] : '',
      startMs:
        parseInt(String(cueRange['startTimeMilliseconds'] ?? '0'), 10) || 0,
    };
  });

  return { lines, synced, source: readText(lyricsData['sourceMessage']) };
}
