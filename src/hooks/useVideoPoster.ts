import { useEffect, useState } from 'react';
import { getRemoteVideoPoster } from '../lib/videoPoster';

/**
 * Derives a poster frame for a video that has none stored (i.e. one sent
 * before posters were captured at send time). Pass null to opt out — callers
 * should always prefer the message's own `thumbUrl` and only fall back here.
 */
export function useVideoPoster(videoUrl: string | null | undefined): string | null {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    if (!videoUrl) {
      setPoster(null);
      return;
    }
    let cancelled = false;
    getRemoteVideoPoster(videoUrl).then((uri) => {
      if (!cancelled) setPoster(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  return poster;
}
