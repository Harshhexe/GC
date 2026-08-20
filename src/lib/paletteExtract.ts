import { Platform } from 'react-native';
import { decodePng } from './png';
import { dominantHues, hslToHex, type Rgb } from './palette';

/**
 * Pulling a colour palette out of a wallpaper.
 *
 * There is no pixel access in React Native, so the two platforms get there
 * differently: web draws the image to a canvas and reads it back, while native
 * asks expo-image-manipulator for a small PNG and decodes it in JS.
 *
 * Everything is done on a downscaled copy: 64px on the long edge is far more
 * than enough to find dominant colours, and keeps both the decode and the
 * bucketing cheap enough to run inline when a wallpaper is picked.
 */

/** Sampling size. Small on purpose — this is colour, not detail. */
const SAMPLE_SIZE = 64;

async function samplePixelsWeb(uri: string): Promise<Rgb[]> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image load failed'));
    el.src = uri;
  });

  const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // ignore transparent
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  return pixels;
}

async function samplePixelsNative(uri: string): Promise<Rgb[]> {
  const manipulator = await import('expo-image-manipulator');
  const output = await manipulator.manipulateAsync(uri, [{ resize: { width: SAMPLE_SIZE } }], {
    format: manipulator.SaveFormat.PNG,
    base64: true,
  });
  if (!output.base64) return [];

  const binary = globalThis.atob(output.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const decoded = decodePng(bytes);
  if (!decoded) return [];

  const pixels: Rgb[] = [];
  const { data, channels } = decoded;
  for (let i = 0; i < data.length; i += channels) {
    if (channels === 4 && data[i + 3] < 128) continue;
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  return pixels;
}

/**
 * The palette offered under a wallpaper.
 *
 * Hues come from the photo, but saturation and lightness are pinned to the
 * range the built-in themes live in. A theme colour is used as a ~35% tint over
 * near-black *and* as light accent text, so a muddy or near-black hue lifted
 * verbatim would fail both jobs — see the contrast work in MessageBubble.
 */
export async function extractWallpaperPalette(uri: string): Promise<string[]> {
  try {
    const pixels =
      Platform.OS === 'web' ? await samplePixelsWeb(uri) : await samplePixelsNative(uri);
    const hues = dominantHues(pixels);
    // Same ballpark as the built-in themes' primary colours.
    return hues.map((h) => hslToHex(h, 0.68, 0.62));
  } catch (err) {
    console.warn('extractWallpaperPalette failed:', err);
    return [];
  }
}
