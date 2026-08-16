import { supabase } from './supabase';

/**
 * The client's entire Giphy surface: a group id is never needed, so it's
 * just a query and an offset. The actual API key stays in the edge function
 * — see supabase/functions/giphy-search for why this is proxied rather than
 * embedded, even though Giphy's own client SDKs would allow it.
 */

export type GifResult = {
  id: string;
  /** The rendition to actually send — never the tiny preview. */
  url: string;
  /** Small, fast-loading thumbnail for the search grid. */
  previewUrl: string;
  width: number | null;
  height: number | null;
  size: number | null;
};

/** Empty query returns Giphy's trending feed — the picker's default view. */
export async function searchGifs(query: string, offset = 0): Promise<GifResult[]> {
  try {
    const { data, error } = await supabase.functions.invoke('giphy-search', {
      body: { query, offset },
    });
    if (error || !data?.ok) return [];
    return (data.results ?? []) as GifResult[];
  } catch {
    // Offline, DNS, whatever — an empty result list reads as "no matches"
    // rather than crashing the picker, and the user can just retry.
    return [];
  }
}
