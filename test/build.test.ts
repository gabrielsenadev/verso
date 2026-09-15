import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { build, buildManifest, DIST_DIR, SRC_DIR } from '../build.ts';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

const BUNDLES = ['content.js', 'background.js'];
const STATIC_FILES = ['styles.css'];
const ICONS = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];

const TARGETS = ['chrome', 'firefox'] as const;

function readBuiltManifest(target: string): Record<string, any> {
  const outDir = build(target);
  return JSON.parse(
    fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')
  ) as Record<string, any>;
}

function readSource(file: string): string {
  return fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
}

test.after(() => {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
});

test('unknown target is rejected', () => {
  assert.throws(() => buildManifest('safari'), /Unknown target: safari/);
  assert.throws(() => build('safari'), /Unknown target: safari/);
});

for (const target of TARGETS) {
  test(`${target}: build emits every bundle and asset plus a manifest`, () => {
    const outDir = build(target);

    for (const file of [
      ...BUNDLES,
      ...STATIC_FILES,
      ...ICONS,
      'manifest.json',
    ]) {
      assert.ok(
        fs.existsSync(path.join(outDir, file)),
        `missing ${file} in dist/${target}`
      );
    }
  });

  test(`${target}: no TypeScript source leaks into the build`, () => {
    const outDir = build(target);
    const leaked = fs
      .readdirSync(outDir, { recursive: true })
      .map(String)
      .filter((entry) => entry.endsWith('.ts'));

    assert.deepEqual(leaked, []);
  });

  test(`${target}: bundles are self-contained, with no module syntax left`, () => {
    const outDir = build(target);

    for (const file of BUNDLES) {
      const bundle = fs.readFileSync(path.join(outDir, file), 'utf8');
      assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/m, `${file} is not bundled`);
    }
  });

  test(`${target}: manifest is MV3 and versioned from package.json`, () => {
    const manifest = readBuiltManifest(target);

    assert.equal(manifest['manifest_version'], 3);
    assert.equal(manifest['version'], pkg.version);
    assert.equal(manifest['content_scripts'][0].world, 'MAIN');
    assert.deepEqual(manifest['content_scripts'][0].matches, [
      '*://music.youtube.com/*',
    ]);
  });

  test(`${target}: the bundler target is not copied into the manifest`, () => {
    assert.equal(readBuiltManifest(target)['esbuildTarget'], undefined);
  });

  test(`${target}: build is idempotent and leaves no stale files`, () => {
    const outDir = build(target);
    const staleFile = path.join(outDir, 'stale.js');
    fs.writeFileSync(staleFile, '// removed by the next build');

    build(target);

    assert.equal(fs.existsSync(staleFile), false);
  });

  test(`${target}: a production build ships no logging`, () => {
    const outDir = build(target, { mode: 'production' });

    for (const file of BUNDLES) {
      const bundle = fs.readFileSync(path.join(outDir, file), 'utf8');
      assert.doesNotMatch(bundle, /console\./, `${file} still calls console`);
      assert.doesNotMatch(bundle, /\[YTMS\]/, `${file} still ships the log prefix`);
    }
  });

  test(`${target}: a development build keeps logging`, () => {
    const outDir = build(target, { mode: 'development' });

    for (const file of BUNDLES) {
      const bundle = fs.readFileSync(path.join(outDir, file), 'utf8');
      assert.match(bundle, /console\./, `${file} dropped console in dev`);
      assert.match(bundle, /\[YTMS\]/, `${file} dropped the log prefix in dev`);
    }
  });
}

test('mode defaults to production when NODE_ENV is unset', () => {
  const previous = process.env['NODE_ENV'];
  delete process.env['NODE_ENV'];
  try {
    const bundle = fs.readFileSync(
      path.join(build('chrome'), 'content.js'),
      'utf8'
    );
    assert.doesNotMatch(bundle, /console\./);
  } finally {
    if (previous !== undefined) process.env['NODE_ENV'] = previous;
  }
});

test('NODE_ENV=development selects the development build', () => {
  const previous = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'development';
  try {
    const bundle = fs.readFileSync(
      path.join(build('chrome'), 'content.js'),
      'utf8'
    );
    assert.match(bundle, /console\./);
  } finally {
    if (previous === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previous;
  }
});

test('chrome: background is an MV3 service worker', () => {
  const manifest = readBuiltManifest('chrome');

  assert.deepEqual(manifest['background'], { service_worker: 'background.js' });
  assert.equal(manifest['browser_specific_settings'], undefined);
});

test('firefox: background is an event page, not a service worker', () => {
  const manifest = readBuiltManifest('firefox');

  // Firefox has no MV3 service worker support.
  assert.equal(manifest['background'].service_worker, undefined);
  assert.deepEqual(manifest['background'].scripts, ['background.js']);
});

test('firefox: declares an add-on id and a MAIN-world-capable minimum', () => {
  const { gecko } = readBuiltManifest('firefox')['browser_specific_settings'];

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
  const source = readSource('background.ts');

  assert.match(source, /globalThis\.browser \?\? globalThis\.chrome/);
  assert.doesNotMatch(source, /^\s*chrome\./m);
});

test('content script uses no extension API, so it runs in the MAIN world', () => {
  const source = readSource('content.ts');

  // MAIN-world scripts have no access to browser.*/chrome.* in either browser.
  assert.doesNotMatch(source, /\b(?:chrome|browser)\.(?:runtime|storage|tabs)\b/);
});
