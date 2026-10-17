import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_COLOR,
  MAX_BACKGROUND_LUMINANCE,
  pickDominantColor,
  relativeLuminance,
  toBackground,
  type Rgb,
} from '../src/focus/color.ts';

/** RGBA pixel data: `count` pixels of each given color, in order. */
function pixels(...runs: [color: Rgb, count: number, alpha?: number][]): Uint8ClampedArray {
  const data: number[] = [];
  for (const [[r, g, b], count, alpha = 255] of runs) {
    for (let i = 0; i < count; i++) data.push(r, g, b, alpha);
  }
  return new Uint8ClampedArray(data);
}

test('a solid image yields its own color', () => {
  assert.deepEqual(pickDominantColor(pixels([[200, 40, 60], 100])), [200, 40, 60]);
});

test('near-black and near-white areas are ignored', () => {
  const art = pixels([[0, 0, 0], 700], [[255, 255, 255], 200], [[30, 90, 200], 100]);
  assert.deepEqual(pickDominantColor(art), [30, 90, 200]);
});

test('a vivid area beats a slightly larger grey one', () => {
  const art = pixels([[128, 128, 128], 120], [[220, 30, 30], 100]);
  assert.deepEqual(pickDominantColor(art), [220, 30, 30]);
});

test('transparent pixels are ignored', () => {
  const art = pixels([[220, 30, 30], 500, 0], [[40, 160, 80], 10]);
  assert.deepEqual(pickDominantColor(art), [40, 160, 80]);
});

test('an image with no usable color falls back', () => {
  assert.deepEqual(pickDominantColor(pixels([[0, 0, 0], 50], [[255, 255, 255], 50])), FALLBACK_COLOR);
  assert.deepEqual(pickDominantColor(new Uint8ClampedArray()), FALLBACK_COLOR);
});

test('backgrounds are dark enough for white text', () => {
  for (const color of [
    [255, 255, 255],
    [255, 230, 0],
    [120, 220, 255],
    [200, 40, 60],
  ] as Rgb[]) {
    const background = toBackground(color);
    assert.ok(relativeLuminance(background) <= MAX_BACKGROUND_LUMINANCE);
    // WCAG AA for normal text
    assert.ok(1.05 / (relativeLuminance(background) + 0.05) >= 4.5);
  }
});

test('dark colors are kept as they are', () => {
  assert.deepEqual(toBackground([40, 20, 60]), [40, 20, 60]);
});
