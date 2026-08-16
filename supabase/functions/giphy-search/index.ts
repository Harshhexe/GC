import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

/**
 * A thin, authenticated proxy in front of Giphy's search API.
 *
 * Giphy's client-side SDKs do embed the API key in the app by design — their
 * keys are meant to be public, rate-limited per key rather than metered like
 * an LLM key. This app proxies anyway, for one concrete reason: a key baked
 * into the bundle is trivially extracted and can be lifted by someone else's
 * app entirely, burning this app's quota on traffic that was never its own.
 * A server-side proxy means the key never leaves this function, and the
 * proxy itself still requires a real session — no anonymous scraping.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

/** Capped well below Giphy's own page limits — this is a chat-composer
 *  picker, not an infinite-scroll gallery. */
const MAX_LIMIT = 30;

type GiphyImageRendition = { url?: string; width?: string; height?: string; size?: string };

type GiphyGif = {
  id: string;
  images: {
    // Preferred sending rendition: capped near 2MB by Giphy, the rendition
    // their own docs recommend for message-sending use cases.
    downsized?: GiphyImageRendition;
    fixed_height?: GiphyImageRendition;
    original?: GiphyImageRendition;
    // Small, fast-loading thumbnail for the search grid — never sent.
    fixed_width_small?: GiphyImageRendition;
    preview_gif?: GiphyImageRendition;
  };
};

export type GifResult = {
  id: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  size: number | null;
};

function pickSendRendition(gif: GiphyGif): GiphyImageRendition | undefined {
  return gif.images.downsized ?? gif.images.fixed_height ?? gif.images.original;
}

function pickPreviewRendition(gif: GiphyGif): GiphyImageRendition | undefined {
  return gif.images.fixed_width_small ?? gif.images.preview_gif ?? pickSendRendition(gif);
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapGif(gif: GiphyGif): GifResult | null {
  const send = pickSendRendition(gif);
  const preview = pickPreviewRendition(gif);
  if (!send?.url) return null;
  return {
    id: gif.id,
    url: send.url,
    previewUrl: preview?.url ?? send.url,
    width: toNumber(send.width),
    height: toNumber(send.height),
    size: toNumber(send.size),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Use POST' }, 405);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const giphyKey = Deno.env.get('GIPHY_API_KEY');

    if (!url || !anonKey || !giphyKey) {
      return jsonResponse({ ok: false, error: 'Server is not configured' }, 500);
    }

    // A real session is required, but membership in any particular group is
    // not — GIF search isn't group-scoped, it's just "is this a real user".
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

    let body: { query?: unknown; offset?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 100) : '';
    const offset = typeof body.offset === 'number' && body.offset >= 0 ? Math.floor(body.offset) : 0;

    const giphyUrl = new URL(query ? `${GIPHY_BASE}/search` : `${GIPHY_BASE}/trending`);
    giphyUrl.searchParams.set('api_key', giphyKey);
    giphyUrl.searchParams.set('limit', String(MAX_LIMIT));
    giphyUrl.searchParams.set('offset', String(offset));
    giphyUrl.searchParams.set('rating', 'pg-13');
    if (query) giphyUrl.searchParams.set('q', query);

    const giphyResp = await fetch(giphyUrl);
    if (!giphyResp.ok) {
      console.error(`[giphy-search] upstream ${giphyResp.status}`);
      return jsonResponse({ ok: false, error: 'GIF search is unavailable right now' }, 502);
    }

    const giphyData = (await giphyResp.json()) as { data?: GiphyGif[] };
    const results = (giphyData.data ?? [])
      .map(mapGif)
      .filter((g): g is GifResult => g !== null);

    return jsonResponse({ ok: true, results });
  } catch (error) {
    console.error(`[giphy-search] ${String(error)}`);
    return jsonResponse({ ok: false, error: 'Something went wrong' }, 500);
  }
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
