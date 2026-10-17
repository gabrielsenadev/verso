import { ANDROID_CLIENT, BROWSE_ENDPOINT } from './constants.ts';
import type { TimedLyrics } from './types.ts';
import { findObjectWithKey, isRecord, readText } from './utils.ts';

export function getApiKey(): string | null {
  try {
    return window.ytcfg?.data_?.INNERTUBE_API_KEY || null;
  } catch {
    return null;
  }
}

export async function fetchTimedLyrics(browseId: string): Promise<TimedLyrics | null> {
  const apiKey = getApiKey();
  const url = `https://music.youtube.com${BROWSE_ENDPOINT}${apiKey ? '&key=' + encodeURIComponent(apiKey) : ''}`;

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
      browseId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lyrics API returned ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseTimedLyrics(data);
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
