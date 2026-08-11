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
async function upload(
  bucket: Bucket,
  base64: string,
  userId: string,
  extension = 'jpg'
): Promise<{ url: string | null; error: string | null }> {
  try {
    const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
    const path = `${userId}/${Date.now()}.${extension}`;

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
