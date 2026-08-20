/**
 * A minimal PNG decoder.
 *
 * React Native gives no pixel access, so wallpaper colour extraction on native
 * needs to decode an image in JS. PNG is the cheap option: inflate (via pako,
 * pure JS, so it ships over EAS Update with no native rebuild) plus PNG's five
 * row filters, against the several hundred lines a baseline JPEG decoder
 * costs. Only ever run on a downscaled copy — see paletteExtract.
 *
 * Deliberately free of React Native imports so it can be exercised directly
 * under Node against a reference encoder.
 */
import { inflate } from 'pako';

/** Reads IHDR + concatenated IDAT out of a PNG byte stream. */
function readPngChunks(bytes: Uint8Array) {
  // 8-byte signature, then length/type/data/crc chunks.
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + 8;

    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4; // + CRC
  }

  return { width, height, bitDepth, colorType, idat };
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decodes an 8-bit truecolour PNG (with or without alpha) to raw samples.
 * Returns null for anything else — palette and 16-bit PNGs never come out of
 * the manipulator, so they aren't worth carrying decode paths for.
 */
export function decodePng(bytes: Uint8Array): { width: number; height: number; data: Uint8Array; channels: number } | null {
  const { width, height, bitDepth, colorType, idat } = readPngChunks(bytes);
  if (!width || !height || bitDepth !== 8) return null;
  if (colorType !== 2 && colorType !== 6) return null;
  const channels = colorType === 6 ? 4 : 3;

  // IDAT is one zlib stream that may be split across chunks.
  let total = 0;
  for (const chunk of idat) total += chunk.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const chunk of idat) {
    joined.set(chunk, at);
    at += chunk.length;
  }

  const raw = inflate(joined);
  const stride = width * channels;
  const out = new Uint8Array(height * stride);

  // Each row is prefixed with a filter byte and is reconstructed against the
  // row above it, so this has to run in order.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;

    for (let x = 0; x < stride; x++) {
      const value = raw[rowStart + x];
      const left = x >= channels ? out[outStart + x - channels] : 0;
      const up = y > 0 ? out[outStart - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[outStart - stride + x - channels] : 0;

      let recon: number;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + left; break;
        case 2: recon = value + up; break;
        case 3: recon = value + ((left + up) >> 1); break;
        case 4: recon = value + paeth(left, up, upLeft); break;
        default: return null;
      }
      out[outStart + x] = recon & 0xff;
    }
  }

  return { width, height, data: out, channels };
}
