import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

type Bucket = 'group-avatars' | 'user-avatars';

/**
 * Push a picked image into Supabase Storage and return its public URL.
 *
 * Takes base64 (ImagePicker gives it to us directly) rather than the file URI:
 * `fetch()` on a `file://` URI is unreliable across RN platforms, whereas
 * decoding base64 to an ArrayBuffer works the same everywhere.
 *
 * The path is `<userId>/<name>` because the storage policies pin each user to
 * writing inside their own folder.
 */
async function compressAvatarBase64(base64: string): Promise<{ base64: string; extension: string }> {
  try {
    const ImageManipulator = require('expo-image-manipulator');
    const manipulateAsync = ImageManipulator.manipulateAsync || ImageManipulator.default?.manipulateAsync;
    const SaveFormat = ImageManipulator.SaveFormat || ImageManipulator.default?.SaveFormat;
    if (manipulateAsync) {
      const source = base64.startsWith('data:') || base64.startsWith('file:') || base64.startsWith('http')
        ? base64
        : `data:image/jpeg;base64,${base64}`;
      const result = await manipulateAsync(
        source,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.75, format: SaveFormat?.JPEG ?? 'jpeg', base64: true }
      );
      if (result?.base64) {
        return { base64: result.base64, extension: 'jpg' };
      }
    }
  } catch (e) {
    // If manipulator fails, proceed with original base64
  }
  return { base64, extension: 'jpg' };
}

async function upload(
  bucket: Bucket,
  rawBase64: string,
  userId: string,
  extension = 'jpg'
): Promise<{ url: string | null; error: string | null }> {
  try {
    const { base64, extension: outExt } = await compressAvatarBase64(rawBase64);
    const contentType = outExt === 'png' ? 'image/png' : 'image/jpeg';
    const path = `${userId}/${Date.now()}.${outExt}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, decode(base64), { contentType, upsert: false });

    if (error) return { url: null, error: error.message };

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : 'Upload failed.' };
  }
}

export function uploadGroupAvatar(base64: string, userId: string, extension = 'jpg') {
  return upload('group-avatars', base64, userId, extension);
}

export function uploadUserAvatar(base64: string, userId: string, extension = 'jpg') {
  return upload('user-avatars', base64, userId, extension);
}
