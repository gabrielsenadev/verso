#!/usr/bin/env node

/**
 * Builds one unpacked extension directory per browser target.
 *
 * The TypeScript sources in `src/` are bundled to plain JS with esbuild — one
 * IIFE per entry point, no imports left at runtime, which both MV3 background
 * flavours and a `world: "MAIN"` content script can load as-is.
 *
 * The sources are identical across targets; only the manifest differs, because
 * Firefox and Chrome disagree on two keys:
 *
 * - background: Firefox has no MV3 service worker support, so it needs an
 *   event page (`background.scripts`). Chrome needs `service_worker`.
 * - browser_specific_settings: Firefox requires an explicit add-on id under
 *   MV3, plus a minimum version — `world: "MAIN"` content scripts only
 *   landed in Firefox 128.
 *
 * Build mode decides whether logging survives: `__DEV__` is substituted with a
 * literal, so a production bundle dead-code-eliminates every log call.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import esbuild from 'esbuild';

const ROOT = import.meta.dirname;
export const SRC_DIR = path.join(ROOT, 'src');
export const DIST_DIR = path.join(ROOT, 'dist');
const BASE_MANIFEST = path.join(ROOT, 'manifest.base.json');

const FIREFOX_ADDON_ID = 'ytms-lyrics-sync@gabrielsena.dev';
// `world: "MAIN"` in content_scripts is only supported from Firefox 128.
const FIREFOX_MIN_VERSION = '128.0';

/** Entry points bundled for every target, relative to `src/`. */
const ENTRY_POINTS = ['content.ts', 'background.ts'];

export type Mode = 'development' | 'production';

export interface BuildOptions {
  mode?: Mode;
}

export const TARGETS = {
  chrome: {
    background: { service_worker: 'background.js' },
    // Chrome 120 is comfortably below the MV3 baseline we rely on.
    esbuildTarget: ['chrome120'],
  },
  firefox: {
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        // The extension sends nothing anywhere; lyrics are fetched by the page
        // itself from YouTube Music's own API.
        data_collection_permissions: { required: ['none'] },
      },
    },
    esbuildTarget: ['firefox128'],
  },
} as const;

export type Target = keyof typeof TARGETS;

function isTarget(value: string): value is Target {
  return Object.hasOwn(TARGETS, value);
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

export function buildManifest(target: string): Record<string, unknown> {
  if (!isTarget(target)) {
    throw new Error(`Unknown target: ${target}`);
  }

  const { version } = readJson(path.join(ROOT, 'package.json'));
  const base = readJson(BASE_MANIFEST);
  // `esbuildTarget` drives the bundler only; it is not a manifest key.
  const { esbuildTarget: _esbuildTarget, ...manifestKeys } = TARGETS[target];

  return {
    ...base,
    version,
    ...manifestKeys,
  };
}

/** Copies static assets (CSS, icons) — everything except the TS sources. */
function copyStaticAssets(from: string, to: string): void {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => !src.endsWith('.ts'),
  });
}

function resolveMode(mode?: Mode): Mode {
  if (mode) return mode;
  return process.env['NODE_ENV'] === 'development' ? 'development' : 'production';
}

export function build(target: string, options: BuildOptions = {}): string {
  if (!isTarget(target)) {
    throw new Error(`Unknown target: ${target}`);
  }

  const mode = resolveMode(options.mode);
  const dev = mode === 'development';
  const outDir = path.join(DIST_DIR, target);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  copyStaticAssets(SRC_DIR, outDir);

  esbuild.buildSync({
    entryPoints: ENTRY_POINTS.map((entry) => path.join(SRC_DIR, entry)),
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target: [...TARGETS[target].esbuildTarget],
    platform: 'browser',
    charset: 'utf8',
    legalComments: 'none',
    define: { __DEV__: String(dev) },
    sourcemap: dev ? 'inline' : false,
    minify: !dev,
    // Nothing should reach the console outside development.
    drop: dev ? [] : ['console', 'debugger'],
  });

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(buildManifest(target), null, 2) + '\n'
  );

  return outDir;
}

function main(): void {
  const args = process.argv.slice(2);
  const mode: Mode = args.includes('--dev') ? 'development' : resolveMode();
  const requested = args.filter((arg) => !arg.startsWith('-'));
  const targets = requested.length ? requested : Object.keys(TARGETS);

  for (const target of targets) {
    const outDir = build(target, { mode });
    console.log(`built ${target} (${mode}) -> ${path.relative(ROOT, outDir)}`);
  }
}

if (process.argv[1] === import.meta.filename) {
  main();
}
