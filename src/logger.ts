/**
 * Console logging that only exists in development builds.
 *
 * `__DEV__` is substituted with a literal `true`/`false` by esbuild, so in a
 * production build every call below collapses to a no-op function body and the
 * bundler drops it — nothing reaches the user's console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const PREFIX = '[YTMS]';

/** Production is silent; development logs everything. */
const ACTIVE_LEVEL: LogLevel = __DEV__ ? 'debug' : 'silent';

function shouldLog(level: LogLevel): boolean {
  return __DEV__ && LOG_LEVELS[level] >= LOG_LEVELS[ACTIVE_LEVEL];
}

export const log = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) console.log(PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    if (shouldLog('info')) console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    if (shouldLog('error')) console.error(PREFIX, ...args);
  },
};
