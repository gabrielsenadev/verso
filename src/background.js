// Firefox exposes the standard `browser` namespace; Chrome only `chrome`.
const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onInstalled.addListener((details) => {
  console.log('[YTMS Lyrics Sync] Installed:', details.reason);
});
