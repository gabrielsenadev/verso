'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { build, buildManifest, DIST_DIR } = require('../build.js');

const pkg = require('../package.json');
const SHARED_FILES = ['content.js', 'background.js', 'styles.css'];
const ICONS = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];

function readBuiltManifest(target) {
  const outDir = build(target);
  return JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
}

test.after(() => {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
});

test('unknown target is rejected', () => {
  assert.throws(() => buildManifest('safari'), /Unknown target: safari/);
});

for (const target of ['chrome', 'firefox']) {
  test(`${target}: build emits every shared file plus a manifest`, () => {
    const outDir = build(target);

    for (const file of [...SHARED_FILES, ...ICONS, 'manifest.json']) {
      assert.ok(
        fs.existsSync(path.join(outDir, file)),
        `missing ${file} in dist/${target}`
      );
    }
  });

  test(`${target}: shared sources are copied byte-for-byte`, () => {
    const outDir = build(target);

    for (const file of SHARED_FILES) {
      assert.equal(
        fs.readFileSync(path.join(outDir, file), 'utf8'),
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        `${file} differs from src/`
      );
    }
  });

  test(`${target}: manifest is MV3 and versioned from package.json`, () => {
    const manifest = readBuiltManifest(target);

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.content_scripts[0].world, 'MAIN');
    assert.deepEqual(manifest.content_scripts[0].matches, [
      '*://music.youtube.com/*',
    ]);
  });

  test(`${target}: build is idempotent and leaves no stale files`, () => {
    const outDir = build(target);
    const staleFile = path.join(outDir, 'stale.js');
    fs.writeFileSync(staleFile, '// removed by the next build');

    build(target);

    assert.equal(fs.existsSync(staleFile), false);
  });
}

test('chrome: background is an MV3 service worker', () => {
  const manifest = readBuiltManifest('chrome');

  assert.deepEqual(manifest.background, { service_worker: 'background.js' });
  assert.equal(manifest.browser_specific_settings, undefined);
});

test('firefox: background is an event page, not a service worker', () => {
  const manifest = readBuiltManifest('firefox');

  // Firefox has no MV3 service worker support.
  assert.equal(manifest.background.service_worker, undefined);
  assert.deepEqual(manifest.background.scripts, ['background.js']);
});

test('firefox: declares an add-on id and a MAIN-world-capable minimum', () => {
  const { gecko } = readBuiltManifest('firefox').browser_specific_settings;

  // MV3 in Firefox requires an explicit id.
  assert.match(gecko.id, /@/);
  // `world: "MAIN"` content scripts landed in Firefox 128.
  assert.ok(
    parseInt(gecko.strict_min_version, 10) >= 128,
    `strict_min_version ${gecko.strict_min_version} predates MAIN world support`
  );
  // Required by AMO going forward; the extension collects nothing.
  assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
});

test('background script uses no Chrome-only global', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'background.js'),
    'utf8'
  );

  assert.match(source, /globalThis\.browser \?\? globalThis\.chrome/);
  assert.doesNotMatch(source, /^\s*chrome\./m);
});

test('content script uses no extension API, so it runs in the MAIN world', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'content.js'),
    'utf8'
  );

  // MAIN-world scripts have no access to browser.*/chrome.* in either browser.
  assert.doesNotMatch(source, /\b(?:chrome|browser)\.(?:runtime|storage|tabs)\b/);
});
