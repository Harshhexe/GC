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

/**
 * Uploads the picked photo plus the text-overlay placement to the
 * render-sticker edge function, which flattens them server-side into one
 * PNG and saves the result. Returns the saved sticker on success.
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
  let error: { name?: string; message?: string } | null;
  try {
    // Left unbounded, a stalled connection just hangs the composer forever —
    // this turns that into a clear, retryable failure instead. 45s is
    // generous: cold starts plus the actual decode/render/upload work rarely
    // clear a few seconds, even on a slow link.
    const result = await supabase.functions.invoke('render-sticker', { body: params, timeout: 45_000 });
    data = result.data;
    error = result.error;
  } catch (e) {
    return { sticker: null, error: e instanceof Error ? e.message : 'Could not reach the server.' };
  }

  if (error) {
    const timedOut = error.name === 'AbortError' || /abort|timeout/i.test(error.message ?? '');
    return {
      sticker: null,
      error: timedOut
        ? 'Taking too long — check your connection and try again.'
        : error.message ?? 'Could not create the sticker.',
    };
  }

  const payload = data as { ok: boolean; sticker?: StickerRow; error?: string };
  if (!payload?.ok || !payload.sticker) {
    return { sticker: null, error: payload?.error ?? 'Could not create the sticker.' };
  }
  return { sticker: fromRow(payload.sticker), error: null };
}
