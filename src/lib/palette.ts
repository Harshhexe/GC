/**
 * Colour maths for turning a photo's pixels into usable theme colours.
 *
 * Pure and React Native free, so the bucketing can be checked directly.
 */

export type Rgb = { r: number; g: number; b: number };

export function rgbToHsl({ r, g, b }: Rgb) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h: h * 360, s, l };
}

export function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];

  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/**
 * Buckets pixels by hue and picks the most prominent, most colourful ones.
 *
 * Scored by population *and* saturation rather than population alone: photos
 * are mostly sky, skin and wall, so a pure headcount returns a row of greys
 * and nothing that works as a theme. Near-greys are dropped outright for the
 * same reason.
 */
export function dominantHues(pixels: Rgb[], count = 5): number[] {
  if (pixels.length === 0) return [];

  // 24 buckets = 15° each, which is about the point where two hues stop
  // reading as the same colour.
  const BUCKETS = 24;
  const weight = new Float64Array(BUCKETS);
  const hueSum = new Float64Array(BUCKETS);

  for (const px of pixels) {
    const { h, s, l } = rgbToHsl(px);
    // Washed-out and near-black pixels carry no usable hue.
    if (s < 0.18 || l < 0.08 || l > 0.94) continue;
    const bucket = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS));
    const score = s * (1 - Math.abs(l - 0.5));
    weight[bucket] += score;
    hueSum[bucket] += h * score;
  }

  const ranked = Array.from({ length: BUCKETS }, (_, i) => i)
    .filter((i) => weight[i] > 0)
    .sort((a, b) => weight[b] - weight[a])
    .slice(0, count)
    .map((i) => hueSum[i] / weight[i]);

  return ranked;
}
