import { log } from './logger.ts';
import { SELECTORS } from './constants.ts';
import { scheduleReconcile } from './lifecycle.ts';
import { syncActiveLine } from './lyrics/sync.ts';
import { waitForElement } from './utils.ts';

function init(): void {
  log.info('Initializing...');

  // Back from another tab or window: jump straight to the current line,
  // cutting short any scroll animation left stalled while hidden
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncActiveLine(true);
  });
  // Alt-tab only hides the page when the window ends up fully covered
  window.addEventListener('focus', () => syncActiveLine(true));

  // No timeout: the player page may only be created once the user opens the
  // player, possibly long after landing on the home page.
  waitForElement(SELECTORS.playerPage)
    .then((playerPage) => {
      // Tab switches, song changes and YTM rendering its own lyrics all show
      // up as mutations inside the player page.
      new MutationObserver(() => scheduleReconcile()).observe(playerPage, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-selected'],
      });
      scheduleReconcile();
    })
    .catch((err: unknown) => {
      log.warn('Player page not found:', err);
    });
}

init();
