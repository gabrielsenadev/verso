#!/usr/bin/env node
'use strict';

/**
 * Builds one unpacked extension directory per browser target.
 *
 * The shared sources in `src/` are identical across targets; only the
 * manifest differs, because Firefox and Chrome disagree on two keys:
 *
 *   - background: Firefox has no MV3 service worker support, so it needs
 *     an event page (`background.scripts`). Chrome needs `service_worker`.
 *   - browser_specific_settings: Firefox requires an explicit add-on id for
 *     MV3, plus a minimum version — `world: "MAIN"` content scripts only
 *     landed in Firefox 128.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const BASE_MANIFEST = path.join(ROOT, 'manifest.base.json');

const FIREFOX_ADDON_ID = 'ytms-lyrics-sync@gabrielsena.dev';
// `world: "MAIN"` in content_scripts is only supported from Firefox 128.
const FIREFOX_MIN_VERSION = '128.0';

const TARGETS = {
  chrome: {
    background: { service_worker: 'background.js' },
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
  },
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildManifest(target) {
  if (!TARGETS[target]) {
    throw new Error(`Unknown target: ${target}`);
  }

  const { version } = readJson(path.join(ROOT, 'package.json'));
  const base = readJson(BASE_MANIFEST);

  return {
    ...base,
    version,
    ...TARGETS[target],
  };
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function build(target) {
  const outDir = path.join(DIST_DIR, target);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  copyDir(SRC_DIR, outDir);
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(buildManifest(target), null, 2) + '\n'
  );

  return outDir;
}

function main() {
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const targets = requested.length ? requested : Object.keys(TARGETS);

  for (const target of targets) {
    const outDir = build(target);
    console.log(`built ${target} -> ${path.relative(ROOT, outDir)}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { build, buildManifest, TARGETS, DIST_DIR, SRC_DIR };
