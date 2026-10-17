import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLyricsBrowseId } from '../src/api.ts';

function watchNext(tabs: unknown[]): unknown {
  return {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: { watchNextTabbedResultsRenderer: { tabs } },
      },
    },
  };
}

const upNext = {
  tabRenderer: {
    title: 'Up next',
    // The queue may mention other browse ids; only tab endpoints count
    content: { musicQueueRenderer: { browseId: 'MPLYt_from_the_queue' } },
  },
};

function lyricsTab(extra: Record<string, unknown> = {}): unknown {
  return {
    tabRenderer: {
      title: 'Lyrics',
      endpoint: { browseEndpoint: { browseId: 'MPLYt_e5FYs5ruAAc-1' } },
      ...extra,
    },
  };
}

test('the lyrics browse id comes from the Lyrics tab endpoint', () => {
  assert.equal(parseLyricsBrowseId(watchNext([upNext, lyricsTab()])), 'MPLYt_e5FYs5ruAAc-1');
});

test('an unselectable Lyrics tab means the song has no lyrics', () => {
  assert.equal(parseLyricsBrowseId(watchNext([upNext, lyricsTab({ unselectable: true })])), null);
});

test('responses without a Lyrics tab yield nothing', () => {
  assert.equal(parseLyricsBrowseId(watchNext([upNext])), null);
  assert.equal(parseLyricsBrowseId({}), null);
  assert.equal(parseLyricsBrowseId(null), null);
});
