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
 * The strip is a shortcut, not a gallery — the "open album" button is what
 * covers browsing properly — so this deliberately reads a small fixed page
 * rather than paginating. Asking for everything would stall opening the camera
 * on a phone with 40,000 photos on it.
 *
 * Permission is *not* requested here. Prompting the moment the camera opens
 * would stack a second system dialog on top of the camera permission, which
 * reads as the app demanding everything at once. Instead the strip stays empty
 * until something asks for it, and the caller decides when to prompt.
 */
export function useRecentMedia(enabled: boolean, limit = 24) {
  const [assets, setAssets] = useState<RecentAsset[]>([]);
  const [permission, setPermission] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    // expo-media-library has no web implementation; the strip simply does not
    // exist there, and the album button falls back to the file picker.
    if (Platform.OS === 'web' || !enabled) return;
    setLoading(true);
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      setPermission(perm.status);
      if (!perm.granted) {
        setAssets([]);
        return;
      }
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
    } catch {
      // A camera that still works is worth more than a filmstrip; failing to
      // read the roll should never block taking a picture.
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    load();
  }, [load]);

  /** Prompts for library access, then loads. For the "allow access" affordance. */
  const request = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    const perm = await MediaLibrary.requestPermissionsAsync();
    setPermission(perm.status);
    if (perm.granted) await load();
    return perm.granted;
  }, [load]);

  return { assets, permission, loading, reload: load, request };
}
