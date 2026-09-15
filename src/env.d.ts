/**
 * Build-time constants replaced by esbuild's `define`, plus the page globals the
 * content script reads out of YouTube Music's own bundle.
 */

/** `true` in development builds, `false` in production. Dead code around a
 * `false` literal is eliminated by esbuild, so production ships no logging. */
declare const __DEV__: boolean;

/** Firefox's standard namespace; absent in Chrome, where only `chrome` exists. */
declare var browser: typeof chrome | undefined;

interface YtcfgData {
  INNERTUBE_API_KEY?: string;
  INNERTUBE_CONTEXT_HL?: string;
  INNERTUBE_CONTEXT_GL?: string;
}

interface Window {
  ytcfg?: {
    data_?: YtcfgData;
  };
}
