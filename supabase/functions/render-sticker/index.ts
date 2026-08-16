import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { FONT_BASE64 } from './fontData.ts';

/**
 * Bakes a text overlay onto a photo and produces a flat PNG sticker.
 *
 * Compositing happens server-side rather than on-device: it's the only way
 * to get one canonical, already-flattened image that renders identically in
 * everyone's chat (no client-side text-layer format to keep in sync across
 * platforms), and it keeps the heavy lifting (decode/resize/rasterize text/
 * encode) off low-end phones. ImageScript is pure-JS/WASM, so this runs fine
 * on Deno's edge runtime with no native image library.
 *
 * The caller must be a real, signed-in user (checked below), but sticker
 * creation isn't group-scoped — same "is this a real user" bar as GIF
 * search. Storage writes and the `stickers` insert use the service role,
 * since the client never talks to the `stickers` bucket directly.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'stickers';
// Stickers are drawn at 148pt in the transcript, so anything past ~320px is
// pixels nobody sees paid for in CPU time on every single create. Dropping
// from 640 quarters the pixel count the text rasterizer and encoder chew
// through, which is most of the render cost.
const MAX_DIMENSION = 320;
// PNG's deflate pass was the single most expensive step here (~6s of edge
// CPU per sticker, which on a slow uplink pushed the whole round trip past
// the client's timeout and surfaced as "couldn't reach the edge function").
// The source is an opaque photo, so there is no transparency to preserve —
// JPEG at a deliberately low quality encodes in a fraction of the time and
// ships a much smaller file.
const JPEG_QUALITY = 60;
const MAX_TEXT_LENGTH = 60;
const MIN_FONT_PX = 14;
const MAX_FONT_PX = 220;
const OUTLINE_PX = 2;

// Embedded as base64 rather than read from a sibling file: the deploy
// bundler only ships what it can trace through imports, and a raw
// Deno.readFile('./assets/font.ttf') call isn't part of that import graph —
// confirmed the hard way when a first deploy silently shipped index.ts alone
// and left the asset behind. An import is traceable; a runtime file path
// isn't.
let fontBytesCache: Uint8Array | null = null;
function loadFont(): Uint8Array {
  if (fontBytesCache) return fontBytesCache;
  const binary = atob(FONT_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  fontBytesCache = bytes;
  return fontBytesCache;
}

function rgba(hex: string, alpha = 255): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return ((r << 24) | (g << 16) | (b << 8) | alpha) >>> 0;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Use POST' }, 405);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) {
      return jsonResponse({ ok: false, error: 'Server is not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'Missing Authorization header' }, 401);

    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await asUser.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ ok: false, error: 'Invalid session' }, 401);
    }
    const userId = userData.user.id;

    let body: {
      imageBase64?: unknown;
      text?: unknown;
      xPct?: unknown;
      yPct?: unknown;
      fontSizePct?: unknown;
      color?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid request body' }, 400);
    }

    if (typeof body.imageBase64 !== 'string' || !body.imageBase64) {
      return jsonResponse({ ok: false, error: 'Missing image' }, 400);
    }
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
    const xPct = clamp01(body.xPct);
    const yPct = clamp01(body.yPct);
    const fontSizePct = typeof body.fontSizePct === 'number' && Number.isFinite(body.fontSizePct)
      ? Math.min(Math.max(body.fontSizePct, 0.02), 0.4)
      : 0.12;
    const color = typeof body.color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(body.color)
      ? body.color
      : '#FFFFFF';

    let imageBytes: Uint8Array;
    try {
      imageBytes = base64ToBytes(body.imageBase64);
    } catch {
      return jsonResponse({ ok: false, error: 'Malformed image data' }, 400);
    }

    let image: Image;
    try {
      const decoded = await Image.decode(imageBytes);
      image = decoded instanceof Image ? decoded : decoded[0];
    } catch {
      return jsonResponse({ ok: false, error: 'Could not read that image' }, 400);
    }

    if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION) {
      if (image.width >= image.height) {
        image.resize(MAX_DIMENSION, Image.RESIZE_AUTO);
      } else {
        image.resize(Image.RESIZE_AUTO, MAX_DIMENSION);
      }
    }

    if (text) {
      const font = loadFont();
      const fontSize = Math.round(Math.min(Math.max(fontSizePct * image.width, MIN_FONT_PX), MAX_FONT_PX));

      try {
        const mainLayer = await Image.renderText(font, fontSize, text, rgba(color));
        const outlineLayer = await Image.renderText(font, fontSize, text, rgba('#000000'));

        const centerX = xPct * image.width;
        const centerY = yPct * image.height;
        const textX = Math.round(centerX - mainLayer.width / 2);
        const textY = Math.round(centerY - mainLayer.height / 2);

        // Cheap outline: stamp the black layer at a ring of offsets behind
        // the real text, rather than pulling in a stroke-capable font
        // renderer for one effect. Four offsets rather than eight — each one
        // is a full-layer composite, and at this size the diagonals were
        // paying CPU for a difference you can't see.
        const offsets = [
          [-OUTLINE_PX, 0], [OUTLINE_PX, 0], [0, -OUTLINE_PX], [0, OUTLINE_PX],
        ];
        for (const [dx, dy] of offsets) {
          image.composite(outlineLayer, textX + dx, textY + dy);
        }
        image.composite(mainLayer, textX, textY);
      } catch (renderError) {
        console.error(`[render-sticker] text render failed: ${String(renderError)}`);
        // A sticker with just the photo beats a hard failure over a
        // cosmetic-only step.
      }
    }

    const encoded = await image.encodeJPEG(JPEG_QUALITY);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const path = `${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, encoded, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) {
      console.error(`[render-sticker] upload failed: ${uploadError.message}`);
      return jsonResponse({ ok: false, error: 'Could not save the sticker' }, 500);
    }

    const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path);

    const { data: stickerRow, error: insertError } = await admin
      .from('stickers')
      .insert({
        created_by: userId,
        image_url: publicUrlData.publicUrl,
        width: image.width,
        height: image.height,
      })
      .select('id, created_by, image_url, width, height, created_at')
      .single();

    if (insertError || !stickerRow) {
      console.error(`[render-sticker] insert failed: ${insertError?.message}`);
      return jsonResponse({ ok: false, error: 'Could not save the sticker' }, 500);
    }

    return jsonResponse({ ok: true, sticker: stickerRow });
  } catch (error) {
    console.error(`[render-sticker] ${String(error)}`);
    return jsonResponse({ ok: false, error: 'Something went wrong' }, 500);
  }
});

function clamp01(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
