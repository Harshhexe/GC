import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import type { PendingAttachment } from './media';

/**
 * Push a picked attachment into the `message-media` bucket and return its
 * public URL. Path is `<groupId>/<filename>` because the storage insert
 * policy pins uploads to groups the uploader actually belongs to.
 */
export async function uploadMessageMedia(
  groupId: string,
  attachment: PendingAttachment
): Promise<{ url: string | null; error: string | null }> {
  try {
    const safeName = (attachment.name ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${groupId}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
      .from('message-media')
      .upload(path, decode(attachment.base64), {
        contentType: attachment.mime,
        upsert: false,
      });

    if (error) return { url: null, error: error.message };

    const { data } = supabase.storage.from('message-media').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : 'Upload failed.' };
  }
}
