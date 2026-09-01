import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Turns stored message-media URLs into short-lived signed ones.
 *
 * The `message-media` bucket used to be world-readable: anyone holding a URL
 * could fetch a private group's photo forever, with no auth and no way to
 * revoke it — a removed member kept working links, and deleting a message left
 * its media reachable. The bucket is private now, so every render has to ask
 * for a signed URL, and Storage re-checks group membership each time.
 *
 * Existing rows still store the old public-style URL. Rather than migrate the
 * column, the object path is recovered from that URL, which keeps old and new
 * messages on one code path.
 */

const BUCKET = 'message-media';

/**
 * How long message media survives before the nightly job removes it from
 * storage — see supabase/auto_cleanup_10_days.sql, which must agree with this.
 * The message itself is kept forever; only the file expires.
 */
export const MEDIA_RETENTION_DAYS = 10;

/** True once this media is old enough that the cleanup job has taken it. */
export function isMediaExpired(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}
/** Long enough to watch a video, short enough that a leaked link dies fast. */
const TTL_SECONDS = 60 * 60;
/** Re-sign a little before expiry so nothing 400s mid-view. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
/** De-dupes concurrent signs for the same object (a grid of thumbs mounts at once). */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * `https://<ref>.supabase.co/storage/v1/object/public/message-media/<path>`
 * -> `<path>`. Returns null for anything that isn't a message-media object, so
 * avatars, stickers and remote GIF URLs pass through untouched.
 */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/** True when this URL points at the private bucket and therefore needs signing. */
export function needsSigning(url: string | null | undefined): boolean {
  return storagePathFromUrl(url) !== null;
}

export async function signedUrlFor(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const path = storagePathFromUrl(url);
  // Not a private-bucket object (sticker, avatar, giphy) — use as-is.
  if (!path) return url;

  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;

  const pending = inFlight.get(path);
  if (pending) return pending;

  const task = (async () => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
      return data.signedUrl;
    } finally {
      inFlight.delete(path);
    }
  })();

  inFlight.set(path, task);
  return task;
}

/** Signs a batch in parallel — for the media grid, which mounts many at once. */
export async function signedUrlsFor(urls: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      if (!u) return;
      const signed = await signedUrlFor(u);
      if (signed) out.set(u, signed);
    })
  );
  return out;
}

/**
 * Render-time signed URL, plus whether signing actually failed.
 *
 * `url === null` alone is ambiguous — it means both "still signing" and "there
 * is nothing to sign". The transcript needs to tell those apart: message media
 * is deleted from storage after 10 days while the message row stays, so a
 * signature that fails because the object is gone is the signal that the photo
 * expired, not that the app is broken.
 */
export function useSignedMedia(url: string | null | undefined): {
  url: string | null;
  failed: boolean;
} {
  const [resolved, setResolved] = useState<string | null>(() =>
    needsSigning(url) ? null : (url ?? null)
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!url) {
      setResolved(null);
      return;
    }
    if (!needsSigning(url)) {
      setResolved(url);
      return;
    }
    // Show the cached signature immediately when we already have one, so a
    // re-mount doesn't flash empty while the round trip happens.
    const path = storagePathFromUrl(url);
    const hit = path ? cache.get(path) : null;
    if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      setResolved(hit.url);
      return;
    }
    setResolved(null);
    signedUrlFor(url).then((signed) => {
      if (cancelled) return;
      setResolved(signed);
      // Storage refuses to sign an object that no longer exists, which is
      // exactly what an expired photo looks like from here.
      if (!signed) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { url: resolved, failed };
}

/**
 * Render-time signed URL. Returns the original untouched for anything outside
 * the private bucket, so callers can use it unconditionally.
 */
export function useSignedMediaUrl(url: string | null | undefined): string | null {
  return useSignedMedia(url).url;
}

/**
 * Pairs a rotating signed URL with a cache key that does not rotate.
 *
 * expo-image keys its disk cache on the URI. Signed URLs change every hour and
 * on every cold start (the signature cache above is in memory only), so the key
 * changed constantly and `cachePolicy="memory-disk"` never hit — every image
 * was re-downloaded in full on each app open. With 26 MB of message media that
 * was enough to burn through the 5 GB monthly egress allowance and put the
 * project over its quota.
 *
 * The storage path is stable for the life of the object, so it is the correct
 * key: the signature can rotate freely underneath it and the bytes on disk stay
 * valid. Nothing about the privacy model changes — the bucket is still private
 * and Storage still re-checks membership on every sign.
 *
 * `original` must be the stored URL that `signed` was produced from, otherwise
 * two different objects would share a cache entry.
 */
export function signedImageSource(
  signed: string | null | undefined,
  original: string | null | undefined
): { uri: string; cacheKey?: string } | undefined {
  if (!signed) return undefined;
  const key = storagePathFromUrl(original);
  // Anything outside the private bucket (giphy, stickers, avatars) already has
  // a stable URL, so expo-image's default key is correct for it.
  return key ? { uri: signed, cacheKey: key } : { uri: signed };
}

/** Drops cached signatures — call on sign-out so they don't outlive the session. */
export function clearSignedUrlCache() {
  cache.clear();
  inFlight.clear();
}
