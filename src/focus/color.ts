/**
 * Picks the focus mode background from the artwork. Pure functions over pixel
 * data, so they run (and are tested) without a DOM.
 */

export type Rgb = [number, number, number];

/** Used when the artwork can't be read or has no usable color. */
export const FALLBACK_COLOR: Rgb = [48, 48, 48];

/**
 * Highest relative luminance the background may reach. White text on it keeps
 * a contrast ratio of at least 1.05 / (0.15 + 0.05) ≈ 5.25.
 */
export const MAX_BACKGROUND_LUMINANCE = 0.15;

/** Pixels darker/brighter than this carry no hue worth picking. */
const MIN_CHANNEL = 24;
const MAX_CHANNEL = 232;

/**
 * The artwork's predominant color, from RGBA pixel data. Pixels are grouped in
 * coarse buckets (16 levels per channel) and weighted by saturation, so a vivid
 * area beats a slightly larger grey one; the winning bucket's mean is returned.
 * Transparent, near-black and near-white pixels are ignored.
 */
export function pickDominantColor(pixels: ArrayLike<number>): Rgb {
  const buckets = new Map<number, { r: number; g: number; b: number; weight: number }>();

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    if (a < 128) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < MIN_CHANNEL || min > MAX_CHANNEL) continue;

    const saturation = (max - min) / max;
    const weight = 1 + saturation * 3;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
    bucket.weight += weight;
    buckets.set(key, bucket);
  }

  let best: { r: number; g: number; b: number; weight: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket;
  }
  if (!best) return FALLBACK_COLOR;

  return [
    Math.round(best.r / best.weight),
    Math.round(best.g / best.weight),
    Math.round(best.b / best.weight),
  ];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Darkens `color`, keeping its hue, until white text reads well on it. */
export function toBackground(color: Rgb): Rgb {
  let [r, g, b] = color;
  while (relativeLuminance([r, g, b]) > MAX_BACKGROUND_LUMINANCE) {
    r = Math.floor(r * 0.9);
    g = Math.floor(g * 0.9);
    b = Math.floor(b * 0.9);
  }
  return [r, g, b];
}

export function toCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}
