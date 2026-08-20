import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Custom chat wallpapers.
 *
 * A wallpaper is personal and per-device, so it never goes to the server —
 * which means the picked image has to survive on its own. On native the
 * picker hands back a URI in the cache directory, and iOS is free to evict
 * that at any point, so the file is copied somewhere permanent and the copy is
 * what gets stored. On web there is no filesystem to copy into, so the image
 * is kept as a data URL.
 */

/** Where copies live on native. Trailing slash included. */
const WALLPAPER_DIR = `${FileSystem.documentDirectory ?? ''}wallpapers/`;

/**
 * Wallpapers are stretched across the whole screen, so they can afford to be
 * softer than a photo in a bubble — and on web the result is inlined as a data
 * URL into AsyncStorage, where every extra byte is storage a browser may cap.
 */
const MAX_DIMENSION = 1080;
const QUALITY = 0.6;

export type WallpaperResult = { uri: string; error: null } | { uri: null; error: string };

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(WALLPAPER_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(WALLPAPER_DIR, { intermediates: true });
  }
}

/**
 * Opens the photo library and returns a URI that stays valid.
 * Resolves to null when the picker was dismissed.
 */
export async function pickChatWallpaper(groupId: string): Promise<WallpaperResult | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { uri: null, error: 'GC needs photo library access to set a wallpaper.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: QUALITY,
    base64: Platform.OS === 'web',
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];

  try {
    const manipulator = await import('expo-image-manipulator');
    const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
    const actions =
      longEdge > MAX_DIMENSION
        ? [
            {
              resize:
                (asset.width ?? 0) >= (asset.height ?? 0)
                  ? { width: MAX_DIMENSION }
                  : { height: MAX_DIMENSION },
            },
          ]
        : [];

    const output = await manipulator.manipulateAsync(asset.uri, actions, {
      compress: QUALITY,
      format: manipulator.SaveFormat.JPEG,
      base64: Platform.OS === 'web',
    });

    if (Platform.OS === 'web') {
      if (!output.base64) return { uri: null, error: 'Couldn’t read that image — try another.' };
      return { uri: `data:image/jpeg;base64,${output.base64}`, error: null };
    }

    await ensureDir();
    // Named per group so replacing a wallpaper overwrites rather than piling
    // up copies; the timestamp busts expo-image's cache for the old file.
    const dest = `${WALLPAPER_DIR}${groupId}-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: output.uri, to: dest });
    await removeStaleWallpapers(groupId, dest);
    return { uri: dest, error: null };
  } catch (err) {
    console.warn('pickChatWallpaper failed:', err);
    // The uncompressed original is still perfectly usable as a background;
    // failing the whole action over a resize would be worse than a bigger file.
    if (Platform.OS === 'web') {
      return asset.base64
        ? { uri: `data:image/jpeg;base64,${asset.base64}`, error: null }
        : { uri: null, error: 'Couldn’t read that image — try another.' };
    }
    return { uri: asset.uri, error: null };
  }
}

/** Deletes this group's previous wallpaper files, keeping `keepUri`. */
async function removeStaleWallpapers(groupId: string, keepUri: string) {
  try {
    const names = await FileSystem.readDirectoryAsync(WALLPAPER_DIR);
    await Promise.all(
      names
        .filter((n) => n.startsWith(`${groupId}-`) && !keepUri.endsWith(n))
        .map((n) => FileSystem.deleteAsync(`${WALLPAPER_DIR}${n}`, { idempotent: true }))
    );
  } catch {}
}

/** Called when a wallpaper is cleared, so the file doesn't linger on disk. */
export async function deleteChatWallpaper(groupId: string, uri: string | null) {
  if (!uri || Platform.OS === 'web' || !uri.startsWith(WALLPAPER_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {}
  await removeStaleWallpapers(groupId, '');
}
