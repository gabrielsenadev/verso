import { LYRICS_BROWSE_ID_PREFIX, LYRICS_TAB_FALLBACK_INDEX, SELECTORS } from './constants.ts';
import { state } from './state.ts';
import type { DomRepeat, LyricsTab, UnknownRecord } from './types.ts';
import { isRecord } from './utils.ts';

/**
 * Reads the InnerTube `tabRenderer` behind a tab header. The headers are
 * stamped by a `<dom-repeat>` over the watch-next response's tabs, so Polymer
 * can map each element back to its data item; some builds also bind it on the
 * element itself.
 */
export function getTabRenderer(tab: Element): UnknownRecord | null {
  const candidates: unknown[] = [];
  try {
    const repeat = tab.parentElement?.querySelector<DomRepeat>(':scope > dom-repeat');
    candidates.push(repeat?.itemForElement?.(tab));
  } catch {
    // Not a Polymer dom-repeat
  }
  for (const prop of ['data', '__data']) {
    try {
      candidates.push((tab as unknown as UnknownRecord)[prop]);
    } catch {
      continue;
    }
  }

  for (const item of candidates) {
    if (!isRecord(item)) continue;
    return isRecord(item['tabRenderer']) ? item['tabRenderer'] : item;
  }
  return null;
}

/**
 * Finds the Lyrics tab by the lyrics browse id in its data rather than by its
 * label, which is localized ("Lyrics", "Letra", …), or its position, which
 * shifts when YouTube Music adds tabs such as "Comments".
 */
export function findLyricsTab(): LyricsTab | null {
  const tabs = [...document.querySelectorAll<HTMLElement>(SELECTORS.tabs)];

  for (const element of tabs) {
    const tabRenderer = getTabRenderer(element);
    if (!tabRenderer) continue;

    // Only the endpoint: a tab's `content` can hold a whole queue of songs.
    const browseId = findBrowseIdInObject(tabRenderer['endpoint']);
    if (!browseId) continue;

    // Songs without lyrics keep the tab, marked unselectable.
    const hasLyrics = tabRenderer['unselectable'] !== true;
    return { element, browseId: hasLyrics ? browseId : null };
  }

  // Tab data unreadable: fall back to the usual position and a page-wide scan.
  const element = tabs[LYRICS_TAB_FALLBACK_INDEX];
  return element ? { element, browseId: findBrowseIdInPage() } : null;
}

/**
 * Read live rather than from the last reconcile: our container stays in the
 * page after switching tabs, and its scroll parent is shared with the other
 * tabs (e.g. the "Up next" queue), so scrolling there would move their list.
 */
export function isLyricsTabOpen(): boolean {
  const tab = state.lyricsTabElement;
  return !!tab?.isConnected && isTabSelected(tab);
}

export function isTabSelected(tab: Element): boolean {
  return (
    tab.getAttribute('aria-selected') === 'true' ||
    tab.classList.contains('iron-selected')
  );
}

/** Last resort when the tab data can't be read: scan the player page's data. */
export function findBrowseIdInPage(): string | null {
  const playerPage = document.querySelector(SELECTORS.playerPage);
  if (!playerPage) return null;

  const candidates: Element[] = [playerPage, ...playerPage.querySelectorAll('*')];
  for (const el of candidates) {
    for (const prop of ['data', '__data', 'playerPageData_']) {
      try {
        const result = findBrowseIdInObject(
          (el as unknown as UnknownRecord)[prop]
        );
        if (result) return result;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function findBrowseIdInObject(
  obj: unknown,
  depth = 0,
  visited: WeakSet<object> = new WeakSet()
): string | null {
  if (!isRecord(obj) || depth > 12) return null;
  try {
    if (visited.has(obj)) return null;
    visited.add(obj);

    const browseId = obj['browseId'];
    if (
      typeof browseId === 'string' &&
      browseId.startsWith(LYRICS_BROWSE_ID_PREFIX)
    ) {
      return browseId;
    }

    for (const key of Object.keys(obj)) {
      try {
        const result = findBrowseIdInObject(obj[key], depth + 1, visited);
        if (result) return result;
      } catch {
        continue;
      }
    }
  } catch {
    // Exotic objects may throw on property access or Object.keys
  }
  return null;
}
