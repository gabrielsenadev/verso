import { log } from './logger.ts';

// Firefox exposes the standard `browser` namespace; Chrome only `chrome`.
const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onInstalled.addListener((details) => {
  log.info('Installed:', details.reason);
});
