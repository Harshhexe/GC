import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import type { PendingAttachment } from './media';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const BUCKET = 'message-media';

// Large uploads over a flaky connection can otherwise hang indefinitely with
// zero feedback — which from the user's side is indistinguishable from
// "upload is broken". Neither uploadAsync nor createUploadTask takes a
// timeout, so it's enforced here by racing the task against a timer.
const UPLOAD_TIMEOUT_MS = 180_000;

/**
 * Push a picked attachment into the `message-media` bucket and return its
 * public URL. Path is `<groupId>/<filename>` because the storage insert
 * policy pins uploads to groups the uploader actually belongs to.
 */
export async function uploadMessageMedia(
  groupId: string,
  attachment: PendingAttachment,
  /** 0–1, native only — lets the composer show real upload progress instead
   *  of an indefinite spinner for large videos. */
  onProgress?: (fraction: number) => void
): Promise<{ url: string | null; thumbUrl: string | null; error: string | null }> {
  try {
    let name = attachment.name || (attachment.type === 'image' ? 'photo.jpg' : attachment.type === 'video' ? 'video.mp4' : 'file');
    // Ensure web-safe extensions: convert .heic/.heif to .jpg, and add extension if missing
    if (attachment.type === 'image') {
      if (/\.(heic|heif)$/i.test(name)) {
        name = name.replace(/\.(heic|heif)$/i, '.jpg');
      } else if (!/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name)) {
        const ext = attachment.mime === 'image/png' ? '.png' : attachment.mime === 'image/webp' ? '.webp' : attachment.mime === 'image/gif' ? '.gif' : '.jpg';
        name = `${name}${ext}`;
      }
    } else if (attachment.type === 'video' && !/\.(mp4|mov|webm|m4v)$/i.test(name)) {
      name = `${name}.mp4`;
    }

    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = Date.now();
    const path = `${groupId}/${stamp}-${safeName}`;

    const error = await putFile(path, attachment.uri, attachment.mime, attachment.base64, onProgress);
    if (error) return { url: null, thumbUrl: null, error };

    // The poster frame rides along as its own small object. It's derived from
    // the video rather than a second copy of it, and it's what makes a video
    // renderable at all in a bubble or the media grid. A failure here is not
    // worth losing the video over — the UI falls back to a plain icon.
    let thumbUrl: string | null = null;
    if (attachment.thumbUri) {
      const thumbPath = `${groupId}/${stamp}-thumb.jpg`;
      const thumbError = await putFile(thumbPath, attachment.thumbUri, 'image/jpeg');
      if (!thumbError) thumbUrl = publicUrlFor(thumbPath);
    }

    return { url: publicUrlFor(path), thumbUrl, error: null };
  } catch (e) {
    return { url: null, thumbUrl: null, error: e instanceof Error ? e.message : 'Upload failed.' };
  }
}

function publicUrlFor(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads one object. Returns an error string, or null on success. */
async function putFile(
  path: string,
  fileUri: string,
  contentType: string,
  base64?: string,
  onProgress?: (fraction: number) => void
): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Web genuinely has a real in-memory Blob/ArrayBuffer already, and no
    // filesystem to stream from, so supabase-js is the right client here.
    const fileData = base64 ? decode(base64) : await fetch(fileUri).then((r) => r.blob());
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, fileData, { contentType, upsert: false });
    return error ? error.message : null;
  }

  // Native does NOT go through supabase-js. Handing it the result of
  // `fetch(fileUri).blob()` is the standard web recipe but a trap in React
  // Native: RN's Blob is a handle into a native blob registry, and pushing a
  // whole video back through the JS bridge to upload it means the entire file
  // has to sit in JS memory — which is exactly why a photo would go through
  // fine and a video would not. Supabase's own RN guidance sidesteps it with
  // `arrayBuffer()`, but that has the same memory profile and only survives
  // because avatars are small.
  //
  // Streaming the file straight off disk to Storage's REST endpoint keeps the
  // bytes out of JS entirely, works at any size, and is what makes a real
  // progress number possible.
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return 'Not signed in — sign in and try again.';

  const task = FileSystem.createUploadTask(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`,
    fileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
    },
    (progress) => {
      if (progress.totalBytesExpectedToSend > 0) {
        onProgress?.(progress.totalBytesSent / progress.totalBytesExpectedToSend);
      }
    }
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      task.cancelAsync().catch(() => {});
      reject(new Error('Upload timed out — check your connection and try again.'));
    }, UPLOAD_TIMEOUT_MS);
  });

  let result;
  try {
    result = await Promise.race([task.uploadAsync(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!result) return 'Upload was cancelled.';
  if (result.status < 200 || result.status >= 300) {
    // Storage answers with a JSON error body; surfacing it is the difference
    // between a debuggable failure and a silent one. 413 in particular means
    // the file beat the project's global size limit, which no amount of
    // retrying will fix.
    return storageErrorFor(result.status, result.body);
  }
  return null;
}

function storageErrorFor(status: number, body: string | undefined): string {
  if (status === 413) return 'That file is too big for the server — try a shorter video.';
  if (status === 401 || status === 403) return 'Not allowed to upload here — try signing out and back in.';

  let detail = '';
  try {
    const parsed = body ? JSON.parse(body) : null;
    detail = parsed?.message || parsed?.error || '';
  } catch {
    detail = (body ?? '').slice(0, 120);
  }
  return `Upload failed (${status})${detail ? `: ${detail}` : ''}.`;
}
