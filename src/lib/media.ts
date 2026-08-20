import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// expo-image-manipulator is loaded lazily inside compressImage() so the app
// doesn't crash at startup when the native module isn't linked in the current
// dev-client binary (the import itself throws synchronously).
// SDK 54's `expo-file-system` root export is the new File/Directory API,
// which has no readAsStringAsync — the classic functions live behind the
// `/legacy` entry point. Importing the root here silently yields `undefined`
// and blows up only at call time, i.e. exactly when you pick a photo.
import * as FileSystem from 'expo-file-system/legacy';
import { captureVideoPoster } from './videoPoster';
import { Ionicons } from '@expo/vector-icons';
import type { MediaType, MessageKind } from '../types';

/** A picked-but-not-yet-uploaded attachment, sitting in the composer. */
export type PendingAttachment = {
  uri: string;
  base64: string;
  mime: string;
  type: MediaType;
  /** Filename — the only label documents get; images/videos may not have one. */
  name: string | null;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Videos only: a local poster frame grabbed from the clip, uploaded
   *  alongside it so the bubble has something to draw. */
  thumbUri: string | null;
};

export type PickResult = { attachment: PendingAttachment; error: null } | { attachment: null; error: string };

// Storage rejects anything over the project's global file size limit (50MB on
// the free plan) with a 413, and the `message-media` bucket sets no limit of
// its own to override it. Keeping the video cap just under that means an
// oversized clip is refused instantly at pick time, with a message that says
// what's wrong — rather than after grinding through a long upload.
const SIZE_LIMITS: Record<MediaType, number> = {
  image: 15 * 1024 * 1024,
  gif: 15 * 1024 * 1024,
  video: 45 * 1024 * 1024,
  file: 20 * 1024 * 1024,
  // AAC at 128kbps is ~1MB/min, so this is far above the 5-minute recording
  // ceiling — it's a backstop against a corrupt file, not a real limit.
  voice: 15 * 1024 * 1024,
  // Stickers never go through this picker — they're already a hosted PNG by
  // the time a message references one — but the map needs an entry to stay
  // total over MediaType.
  sticker: 15 * 1024 * 1024,
};

function mediaTypeFor(mime: string): MediaType {
  if (mime === 'image/gif') return 'gif';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

function tooLarge(type: MediaType, size: number): string | null {
  const limit = SIZE_LIMITS[type];
  if (size <= limit) return null;
  const label = type === 'file' ? 'document' : type;
  return `That ${label} is too big — keep it under ${Math.round(limit / (1024 * 1024))}MB.`;
}

async function readAsBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
}

// A phone photo comes in around 2-4MB straight off the sensor; nobody's
// squinting at message-thread photos at full resolution, and every extra MB
// is more bytes to upload now and more bytes every group member re-downloads
// every time they reopen the chat. Capping the long edge and re-encoding at
// a modest JPEG quality routinely lands well under 1MB with no visible loss
// at chat-bubble size.
const MAX_IMAGE_DIMENSION = 1280;
const IMAGE_COMPRESS_QUALITY = 0.55;


async function compressImage(uri: string, width: number, height: number) {
  try {
    const ImageManipulator = require('expo-image-manipulator');
    const manipulateAsync = ImageManipulator.manipulateAsync || ImageManipulator.default?.manipulateAsync;
    const SaveFormat = ImageManipulator.SaveFormat || ImageManipulator.default?.SaveFormat;
    if (!manipulateAsync) {
      throw new Error('manipulateAsync unavailable');
    }
    const needsResize = Math.max(width, height) > MAX_IMAGE_DIMENSION;
    const actions = needsResize
      ? [{ resize: width >= height ? { width: MAX_IMAGE_DIMENSION } : { height: MAX_IMAGE_DIMENSION } }]
      : [];
    const result = await manipulateAsync(uri, actions, {
      compress: IMAGE_COMPRESS_QUALITY,
      format: SaveFormat?.JPEG ?? 'jpeg',
    });
    const info = await FileSystem.getInfoAsync(result.uri);
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      size: info.exists && 'size' in info ? info.size : 0,
    };
  } catch (err) {
    console.warn('Image compression unavailable, sending original:', err);
    const info = await FileSystem.getInfoAsync(uri);
    return {
      uri,
      width,
      height,
      size: info.exists && 'size' in info ? info.size : 0,
    };
  }
}

async function fromImagePickerAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickResult> {
  const isVideo =
    asset.type === 'video' ||
    (asset.mimeType != null && asset.mimeType.startsWith('video/')) ||
    asset.duration != null ||
    /\.(mov|mp4|m4v|webm|avi|mkv)$/i.test(asset.uri);

  const isGif = asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.uri);

  const type: MediaType = isVideo ? 'video' : isGif ? 'gif' : 'image';
  let outMime =
    asset.mimeType ??
    (isVideo ? (asset.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4') : isGif ? 'image/gif' : 'image/jpeg');

  let uri = asset.uri;
  let width = asset.width || null;
  let height = asset.height || null;
  let size = asset.fileSize ?? 0;

  // On iOS native, fileSize for picked videos/photos is often 0 or undefined.
  if (size === 0 && Platform.OS !== 'web') {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && 'size' in info && typeof info.size === 'number') {
        size = info.size;
      }
    } catch {
      // Info lookup is best effort
    }
  }

  // Regular photos only — a compressed GIF loses its animation entirely,
  // and manipulating a video file with image-manipulator throws an error.
  if (type === 'image') {
    try {
      const compressed = await compressImage(asset.uri, asset.width, asset.height);
      uri = compressed.uri;
      width = compressed.width;
      height = compressed.height;
      if (compressed.size > 0) size = compressed.size;
      outMime = 'image/jpeg';
    } catch {
      // Compression is a nice-to-have — if it fails for any reason, fall
      // back to uploading the original rather than blocking the send.
    }
  }

  const sizeError = size > 0 ? tooLarge(type, size) : null;
  if (sizeError) return { attachment: null, error: sizeError };

  // Done after the size check so an oversized clip is rejected before we
  // spend time decoding a frame out of it.
  const thumbUri = type === 'video' ? await captureVideoPoster(uri) : null;

  try {
    const dataUriMatch = uri.match(/^data:[^;]+;base64,(.+)$/);
    const base64 = Platform.OS === 'web' ? dataUriMatch?.[1] ?? asset.base64 ?? (await readAsBase64(uri)) : '';

    // asset.duration in expo-image-picker is in seconds (e.g. 14.2s) or ms
    const durationMs =
      asset.duration != null
        ? Math.round(asset.duration > 10000 ? asset.duration : asset.duration * 1000)
        : null;

    return {
      attachment: {
        uri,
        base64,
        mime: outMime,
        type,
        name: asset.fileName ?? null,
        size,
        width,
        height,
        durationMs,
        thumbUri,
      },
      error: null,
    };
  } catch (err) {
    console.warn('fromImagePickerAsset processing error:', err);
    return { attachment: null, error: 'Couldn’t read that file — try again.' };
  }
}

/**
 * Videos get transcoded by the OS at pick time rather than uploaded raw.
 * `Passthrough` hands back the untouched original, which on a modern iPhone
 * means 4K HEVC — routinely 100MB+ for a clip of any length (past the
 * server's limit outright) and in a codec most browsers refuse to play, so a
 * video sent from a phone wouldn't open on the web at all. 720p H.264 is a
 * fraction of the size, plays everywhere, and is more than enough for a chat
 * bubble. This is the video counterpart to compressImage() above — and it's
 * free: AVFoundation does the work natively, no ffmpeg needed.
 */
const VIDEO_EXPORT_PRESET = ImagePicker.VideoExportPreset.H264_1280x720;

/** Photo or video library — covers gifs too, since they show up as regular
 *  images there (distinguished later by mime type). */
export async function pickFromLibrary(): Promise<PickResult | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { attachment: null, error: 'GC needs photo library access to send media.' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    videoExportPreset: VIDEO_EXPORT_PRESET,
    quality: 0.85,
    base64: Platform.OS === 'web',
  });
  if (result.canceled || result.assets.length === 0) return null;
  return fromImagePickerAsset(result.assets[0]);
}

export async function pickFromCamera(): Promise<PickResult | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { attachment: null, error: 'GC needs camera access to take a photo.' };

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    videoExportPreset: VIDEO_EXPORT_PRESET,
    quality: 0.85,
    base64: Platform.OS === 'web',
  });
  if (result.canceled || result.assets.length === 0) return null;
  return fromImagePickerAsset(result.assets[0]);
}

/**
 * Whether to use the in-app `getUserMedia` camera instead of the OS one.
 *
 * `ImagePicker.launchCameraAsync` on web is a file input carrying the
 * `capture` attribute. A phone honours that and opens its camera app; a laptop
 * ignores it entirely and opens a file chooser, so "Camera" there did nothing
 * a laptop user would recognise as a camera. `getUserMedia` is the only way to
 * reach a webcam — but only worth preferring where the OS picker fails, so
 * touch devices keep their native camera app (better capture UI, and
 * standalone iOS PWAs have a patchy `getUserMedia` history).
 */
export function supportsWebCamera(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return false;
  return true;
}

/**
 * Web-only: turn a dropped or pasted File object into a PendingAttachment.
 */
export async function fromWebFile(file: File): Promise<PickResult> {
  const mime = file.type || 'application/octet-stream';
  const isVideo = mime.startsWith('video/') || /\.(mov|mp4|m4v|webm|avi|mkv)$/i.test(file.name);
  const isGif = mime === 'image/gif' || /\.gif$/i.test(file.name);
  const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|svg)$/i.test(file.name);
  const type: MediaType = isVideo ? 'video' : isGif ? 'gif' : isImage ? 'image' : 'file';

  const size = file.size;
  const sizeError = tooLarge(type, size);
  if (sizeError) return { attachment: null, error: sizeError };

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(',');
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';

      let width: number | null = null;
      let height: number | null = null;

      if (type === 'image' || type === 'gif') {
        try {
          const img = new (window as any).Image();
          img.src = dataUrl;
          await new Promise<void>((r) => {
            img.onload = () => {
              width = img.naturalWidth || null;
              height = img.naturalHeight || null;
              r();
            };
            img.onerror = () => r();
          });
        } catch {}
      }

      resolve({
        attachment: {
          uri: dataUrl,
          base64,
          mime,
          type,
          name: file.name,
          size,
          width,
          height,
          durationMs: null,
          thumbUri: null,
        },
        error: null,
      });
    };
    reader.onerror = () => {
      resolve({ attachment: null, error: 'Could not read that file.' });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Turns an image retrieved from clipboard (base64 string or data URI) into a PendingAttachment.
 * Works across both Native (iOS/Android) and Web.
 */
export async function fromClipboardImage(data: string, name?: string): Promise<PickResult> {
  try {
    let base64 = data;
    let mime = 'image/png';
    let uri = data;

    if (data.startsWith('data:')) {
      const comma = data.indexOf(',');
      const semi = data.indexOf(';');
      if (comma >= 0 && semi >= 0) {
        mime = data.slice(5, semi);
        base64 = data.slice(comma + 1);
      }
    } else {
      uri = `data:image/png;base64,${data}`;
    }

    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const size = Math.floor((base64.length * 3) / 4) - padding;

    const sizeError = tooLarge('image', size);
    if (sizeError) return { attachment: null, error: sizeError };

    let width: number | null = null;
    let height: number | null = null;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const img = new (window as any).Image();
        img.src = uri;
        await new Promise<void>((r) => {
          img.onload = () => {
            width = img.naturalWidth || null;
            height = img.naturalHeight || null;
            r();
          };
          img.onerror = () => r();
        });
      } catch {}
    } else if (Platform.OS !== 'web') {
      const localUri = `${FileSystem.cacheDirectory}pasted-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(localUri, base64, { encoding: 'base64' });
      uri = localUri;
    }

    return {
      attachment: {
        uri,
        base64: Platform.OS === 'web' ? base64 : '',
        mime,
        type: 'image',
        name: name || `pasted-image-${Date.now()}.png`,
        size,
        width,
        height,
        durationMs: null,
        thumbUri: null,
      },
      error: null,
    };
  } catch (err) {
    console.warn('[media] fromClipboardImage failed:', err);
    return { attachment: null, error: 'Could not paste image from clipboard.' };
  }
}

/**
 * Web-only: turn a still grabbed off a live camera stream into an attachment.
 * The canvas already emits a sized, compressed JPEG, so this skips
 * compressImage() and only has to re-check the size limit.
 */
export function fromWebCapture(dataUrl: string, width: number, height: number): PickResult {
  const comma = dataUrl.indexOf(',');
  const semi = dataUrl.indexOf(';');
  if (comma < 0 || semi < 0) return { attachment: null, error: 'Couldn’t read that photo — try again.' };

  const mime = dataUrl.slice(5, semi) || 'image/jpeg';
  const base64 = dataUrl.slice(comma + 1);
  // base64 carries 3 bytes per 4 characters, minus whatever the padding covers.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const size = Math.floor((base64.length * 3) / 4) - padding;

  const sizeError = tooLarge('image', size);
  if (sizeError) return { attachment: null, error: sizeError };

  return {
    attachment: {
      uri: dataUrl,
      base64,
      mime,
      type: 'image',
      name: `photo-${Date.now()}.jpg`,
      size,
      width,
      height,
      durationMs: null,
      thumbUri: null,
    },
    error: null,
  };
}

export async function pickDocument(): Promise<PickResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    // Same native-vs-web split as the image/camera pickers: base64 here on
    // native (bridged through the picker result) risks the same freeze for
    // a large document; web has no expo-file-system fallback, so it has to
    // come from the picker instead.
    base64: Platform.OS === 'web',
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType ?? 'application/octet-stream';
  const type = mediaTypeFor(mime);
  const size = asset.size ?? 0;
  const sizeError = size > 0 ? tooLarge(type, size) : null;
  if (sizeError) return { attachment: null, error: sizeError };

  try {
    const base64 = Platform.OS === 'web' ? asset.base64 ?? (await readAsBase64(asset.uri)) : '';
    return {
      attachment: {
        uri: asset.uri,
        base64,
        mime,
        type,
        name: asset.name,
        size,
        width: null,
        height: null,
        durationMs: null,
        thumbUri: null,
      },
      error: null,
    };
  } catch {
    return { attachment: null, error: 'Couldn’t read that file — try again.' };
  }
}

/** Icon + label for a message kind — shared by the reply quote strip, the
 *  long-press preview card, and notifications. */
export function describeMedia(
  kind: Exclude<MessageKind, 'text'>,
  name?: string | null
): { icon: keyof typeof Ionicons.glyphMap; label: string } {
  switch (kind) {
    case 'image':
      return { icon: 'image', label: 'Photo' };
    case 'gif':
      return { icon: 'image', label: 'GIF' };
    case 'video':
      return { icon: 'videocam', label: 'Video' };
    case 'file':
      return { icon: 'document-text', label: name || 'Document' };
    case 'voice':
      return { icon: 'mic', label: 'Voice message' };
    case 'sticker':
      return { icon: 'happy', label: 'Sticker' };
    case 'poll':
      return { icon: 'bar-chart', label: 'Poll' };
    default:
      return { icon: 'document-text', label: name || 'Attachment' };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Saves a photo or video message's attachment to the device's own library —
 * the "Download" action for image/video messages.
 *
 * expo-media-library was added for this and, like expo-image-manipulator
 * above, isn't guaranteed to be linked in whatever dev-client binary is
 * currently installed until the app is rebuilt — a `require` at module load
 * time would crash the whole app on that build, not just this feature, so
 * it's resolved lazily and fails soft instead.
 */
export async function downloadMediaToDevice(url: string): Promise<{ error: string | null }> {
  if (Platform.OS === 'web') {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { error: null };
    } catch {
      return { error: 'Could not download that.' };
    }
  }

  let MediaLibrary: typeof import('expo-media-library');
  try {
    MediaLibrary = require('expo-media-library');
  } catch {
    return { error: 'Saving needs the latest app update — try again after updating GC.' };
  }

  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return { error: 'Allow photo library access to save media.' };

    const filename = url.split('/').pop()?.split('?')[0] || `gc-${Date.now()}`;
    const localUri = `${FileSystem.cacheDirectory}${filename}`;
    const { uri } = await FileSystem.downloadAsync(url, localUri);
    await MediaLibrary.saveToLibraryAsync(uri);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save that.' };
  }
}
