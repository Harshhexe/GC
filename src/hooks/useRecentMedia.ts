import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export type RecentAsset = {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  durationMs: number | null;
};

/**
 * The most recent camera-roll items, for the filmstrip along the bottom of the
 * camera.
 *
 * The strip is a shortcut, not a gallery — the "open album" button covers
 * browsing properly — so this reads a small fixed page rather than paginating.
 * Asking for everything would stall opening the camera on a phone with 40,000
 * photos on it.
 *
 * Permission is checked but never requested automatically: a second system
 * dialog stacked on top of the camera prompt reads as the app demanding
 * everything at once. `granted` is false until the user taps the strip's own
 * affordance, which calls `request()`.
 */
export function useRecentMedia(enabled: boolean, limit = 30) {
  const [assets, setAssets] = useState<RecentAsset[]>([]);
  const [granted, setGranted] = useState(false);
  /** Whether we've actually heard back about permission yet — lets the UI say
   *  "allow access" rather than "show photos" once it knows it was denied. */
  const [asked, setAsked] = useState(false);
  const [loading, setLoading] = useState(false);

  const read = useCallback(async () => {
    const page = await MediaLibrary.getAssetsAsync({
      first: limit,
      sortBy: [MediaLibrary.SortBy.creationTime],
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    });
    setAssets(
      page.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        mediaType: a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
        durationMs: a.duration ? Math.round(a.duration * 1000) : null,
      }))
    );
  }, [limit]);

  const load = useCallback(async () => {
    // expo-media-library has no web implementation; the strip does not exist
    // there, and the album button falls back to the file picker.
    if (Platform.OS === 'web' || !enabled) return;
    setLoading(true);
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      setAsked(true);
      setGranted(perm.granted);
      if (!perm.granted) {
        setAssets([]);
        return;
      }
      await read();
    } catch {
      // A camera that still works is worth more than a filmstrip; failing to
      // read the roll should never block taking a picture.
      setAssets([]);
      setGranted(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, read]);

  useEffect(() => {
    load();
  }, [load]);

  /** Prompts for library access, then loads. Wired to the strip's affordance. */
  const request = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      setAsked(true);
      setGranted(perm.granted);
      if (perm.granted) await read();
      return perm.granted;
    } catch {
      return false;
    }
  }, [read]);

  return { assets, granted, asked, loading, reload: load, request };
}
