import { Platform } from 'react-native';

/**
 * Grabbing a frame out of a video, in one place.
 *
 * Loaded lazily rather than imported at module scope so a dev-client binary
 * that predates the native module degrades to "no poster" instead of throwing
 * on startup — the import itself is what throws when it isn't linked.
 */
function getThumbnailFn(): ((uri: string, opts: object) => Promise<{ uri: string }>) | null {
  try {
    const mod = require('expo-video-thumbnails');
    return mod.getThumbnailAsync ?? mod.default?.getThumbnailAsync ?? null;
  } catch {
    return null;
  }
}

/** The opening frame, rather than one seeked to partway in: seeking costs
 *  real time on a long clip, and frame 0 is what the sender was aiming at. */
const POSTER_OPTIONS = { time: 0, quality: 0.7 };

function captureVideoPosterWeb(videoUri: string): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        video.removeAttribute('src');
        video.load();
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);

      const captureFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            clearTimeout(timer);
            cleanup();
            resolve(dataUrl);
            return;
          }
        } catch {}
        clearTimeout(timer);
        cleanup();
        resolve(null);
      };

      video.onloadeddata = () => {
        video.currentTime = 0.001;
      };

      video.onseeked = () => {
        captureFrame();
      };

      video.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(null);
      };

      video.src = videoUri;
    } catch {
      resolve(null);
    }
  });
}

/** Capture a poster from a local file. Used at send time. */
export async function captureVideoPoster(fileUri: string): Promise<string | null> {
  if (Platform.OS === 'web') return captureVideoPosterWeb(fileUri);
  const getThumbnailAsync = getThumbnailFn();
  if (!getThumbnailAsync) return null;
  try {
    const { uri } = await getThumbnailAsync(fileUri, POSTER_OPTIONS);
    return uri ?? null;
  } catch (err) {
    console.warn('Video poster capture failed:', err);
    return null;
  }
}

// Videos sent before posters existed have no `media_thumb_url`, and there's no
// server-side job to backfill them on a ₹0 budget. Deriving one on the device
// keeps those bubbles from being permanently blank. Results are memoised for
// the session (including failures, as null) so a video scrolled past repeatedly
// is only ever decoded once, and concurrent requests for the same URL share a
// single in-flight promise.
const posterCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Poster for a video that's already uploaded. iOS reads this over range
 * requests rather than pulling the whole file, so it's far cheaper than it
 * looks — but it's still work, so prefer the stored `thumbUrl` when there is
 * one and treat this purely as the fallback for older messages.
 */
export async function getRemoteVideoPoster(videoUrl: string): Promise<string | null> {
  if (posterCache.has(videoUrl)) return posterCache.get(videoUrl) ?? null;

  const pending = inFlight.get(videoUrl);
  if (pending) return pending;

  const request = (Platform.OS === 'web' ? captureVideoPosterWeb(videoUrl) : captureVideoPoster(videoUrl)).then((uri) => {
    posterCache.set(videoUrl, uri);
    inFlight.delete(videoUrl);
    return uri;
  });

  inFlight.set(videoUrl, request);
  return request;
}
