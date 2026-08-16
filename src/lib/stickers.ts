import { supabase } from './supabase';
import type { Sticker } from '../types';

type StickerRow = {
  id: string;
  created_by: string | null;
  image_url: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

const COLUMNS = 'id, created_by, image_url, width, height, created_at';

function fromRow(row: StickerRow): Sticker {
  return {
    id: row.id,
    createdBy: row.created_by,
    imageUrl: row.image_url,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export async function fetchMyStickers(userId: string): Promise<Sticker[]> {
  const { data, error } = await supabase
    .from('stickers')
    .select(COLUMNS)
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as StickerRow[]).map(fromRow);
}

export async function fetchFavoriteStickers(userId: string): Promise<Sticker[]> {
  const { data, error } = await supabase
    .from('sticker_favorites')
    .select(`sticker_id, created_at, stickers ( ${COLUMNS} )`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as { stickers: StickerRow | null }[])
    .map((row) => row.stickers)
    .filter((s): s is StickerRow => !!s)
    .map(fromRow);
}

export async function fetchFavoriteStickerIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('sticker_favorites').select('sticker_id').eq('user_id', userId);
  if (error || !data) return new Set();
  return new Set((data as { sticker_id: string }[]).map((r) => r.sticker_id));
}

export async function favoriteSticker(userId: string, stickerId: string): Promise<boolean> {
  const { error } = await supabase.from('sticker_favorites').insert({ user_id: userId, sticker_id: stickerId });
  return !error;
}

export async function unfavoriteSticker(userId: string, stickerId: string): Promise<boolean> {
  const { error } = await supabase
    .from('sticker_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('sticker_id', stickerId);
  return !error;
}

const TIMEOUT_MS = 45_000;

/** The edge function answers `{ ok: false, error }` on every failure path —
 *  pull that out of the raw Response so the alert says what actually broke. */
async function readErrorBody(context: unknown): Promise<string | null> {
  if (!context || typeof (context as Response).text !== 'function') return null;
  try {
    const raw = await (context as Response).text();
    const parsed = JSON.parse(raw) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

/**
 * Uploads the picked photo plus the text-overlay placement to the
 * render-sticker edge function, which flattens them server-side into one
 * flat JPEG and saves the result. Returns the saved sticker on success.
 */
export async function renderSticker(params: {
  imageBase64: string;
  text: string;
  xPct: number;
  yPct: number;
  fontSizePct: number;
  color: string;
}): Promise<{ sticker: Sticker | null; error: string | null }> {
  let data: unknown;
  let error: { name?: string; message?: string; context?: unknown } | null;
  const startedAt = Date.now();
  try {
    // Left unbounded, a stalled connection just hangs the composer forever —
    // this turns that into a clear, retryable failure instead. 45s is
    // generous: cold starts plus the actual decode/render/upload work rarely
    // clear a few seconds, even on a slow link.
    const result = await supabase.functions.invoke('render-sticker', { body: params, timeout: TIMEOUT_MS });
    data = result.data;
    error = result.error;
  } catch (e) {
    return { sticker: null, error: e instanceof Error ? e.message : 'Could not reach the server.' };
  }

  if (error) {
    // A timeout doesn't surface as an AbortError here: functions-js catches
    // the aborted fetch and rethrows it as a FunctionsFetchError whose
    // message is the generic "Failed to send a request to the Edge
    // Function". Checking the error name alone therefore mislabelled every
    // slow render as unreachable, so fall back to how long we actually
    // waited to tell "timed out" apart from "never connected".
    const elapsed = Date.now() - startedAt;
    if (
      error.name === 'AbortError' ||
      /abort|timeout/i.test(error.message ?? '') ||
      elapsed >= TIMEOUT_MS - 1_000
    ) {
      return { sticker: null, error: 'Taking too long — check your connection and try again.' };
    }

    // Non-2xx responses arrive as FunctionsHttpError, which reports only
    // "Edge Function returned a non-2xx status code" — the actual reason is
    // in the response body this carries, so dig it out rather than showing
    // the user a status code dressed as an explanation.
    const fromBody = await readErrorBody(error.context);
    return { sticker: null, error: fromBody ?? error.message ?? 'Could not create the sticker.' };
  }

  const payload = data as { ok: boolean; sticker?: StickerRow; error?: string };
  if (!payload?.ok || !payload.sticker) {
    return { sticker: null, error: payload?.error ?? 'Could not create the sticker.' };
  }
  return { sticker: fromRow(payload.sticker), error: null };
}
