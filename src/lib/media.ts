import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
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
};

export type PickResult = { attachment: PendingAttachment; error: null } | { attachment: null; error: string };

const SIZE_LIMITS: Record<MediaType, number> = {
  image: 15 * 1024 * 1024,
  gif: 15 * 1024 * 1024,
  video: 60 * 1024 * 1024,
  file: 20 * 1024 * 1024,
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

async function fromImagePickerAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickResult> {
  const mime = asset.mimeType ?? (asset.duration != null ? 'video/mp4' : 'image/jpeg');
  const type = mediaTypeFor(mime);
  const size = asset.fileSize ?? 0;
  const sizeError = size > 0 ? tooLarge(type, size) : null;
  if (sizeError) return { attachment: null, error: sizeError };

  try {
    // On native, the picker call deliberately does NOT request base64 (no
    // `base64: true`) — on real devices that makes the native module encode
    // the full-res (often HEIC) photo and marshal that multi-MB string
    // across the bridge as part of resolving the picker promise itself,
    // which is what was freezing the UI right after the permission prompt.
    // Reading it here instead, via a separate FileSystem call, avoids that.
    // expo-file-system has no web implementation at all, so web has to keep
    // getting base64 the other way — straight from the picker (Blob/File
    // under the hood there, not a native bridge, so it isn't the same cost).
    const base64 = asset.base64 ?? (await readAsBase64(asset.uri));
    return {
      attachment: {
        uri: asset.uri,
        base64,
        mime,
        type,
        name: asset.fileName ?? null,
        size,
        width: asset.width || null,
        height: asset.height || null,
        durationMs: asset.duration ?? null,
      },
      error: null,
    };
  } catch {
    return { attachment: null, error: 'Couldn’t read that file — try again.' };
  }
}

/** Photo or video library — covers gifs too, since they show up as regular
 *  images there (distinguished later by mime type). */
export async function pickFromLibrary(): Promise<PickResult | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { attachment: null, error: 'GC needs photo library access to send media.' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
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
    quality: 0.85,
    base64: Platform.OS === 'web',
  });
  if (result.canceled || result.assets.length === 0) return null;
  return fromImagePickerAsset(result.assets[0]);
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
    const base64 = asset.base64 ?? (await readAsBase64(asset.uri));
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
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
