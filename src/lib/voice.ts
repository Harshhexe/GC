import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { setAudioModeAsync } from 'expo-audio';
import type { PendingAttachment } from './media';

/**
 * Put the iOS audio session back into playback mode.
 *
 * Recording requires the PlayAndRecord category, and that category routes
 * output to the *receiver* — the small earpiece speaker you hold to your head
 * on a call — rather than the loudspeaker. iOS keeps that category until it's
 * changed, so without this every sound the app makes after one recording
 * comes out of the wrong speaker, barely audible.
 *
 * Cheap and idempotent, so it's safe to call defensively before playback as
 * well as after recording — a recording interrupted by a crash or a
 * backgrounded app would otherwise leave the session stuck.
 */
export async function releaseRecordingSession() {
  try {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  } catch {
    // Routing is a nicety; never let it break playback or a send.
  }
}

/** Voice notes are conversational, not podcasts — a hard ceiling keeps a
 *  pocket-dial from becoming a 40MB upload, and gives the UI something
 *  definite to count down to. */
export const MAX_VOICE_DURATION_MS = 5 * 60 * 1000;

/** Below this it's a fumbled tap, not a message. */
export const MIN_VOICE_DURATION_MS = 700;

/**
 * Wraps a finished recording into the same shape every other attachment
 * uses, so it flows through the existing upload → send → render path
 * untouched rather than needing a parallel one.
 */
export async function voiceAttachmentFrom(
  uri: string,
  durationMs: number
): Promise<PendingAttachment | null> {
  if (!uri) return null;

  let size = 0;
  if (Platform.OS !== 'web') {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && 'size' in info && typeof info.size === 'number') size = info.size;
    } catch {
      // Size is only used for the label — not worth failing a send over.
    }
  }

  // expo-audio records AAC in an .m4a container on both platforms.
  const isM4a = /\.m4a$/i.test(uri) || Platform.OS !== 'web';

  return {
    uri,
    base64: '',
    mime: isM4a ? 'audio/m4a' : 'audio/webm',
    type: 'voice',
    name: `voice-${Date.now()}.${isM4a ? 'm4a' : 'webm'}`,
    size,
    width: null,
    height: null,
    durationMs: Math.round(durationMs),
    thumbUri: null,
  };
}

/** "0:07" / "1:23" — the label under a waveform, and the live timer while
 *  recording. Rounds down so a recording never briefly shows a second it
 *  hasn't reached. */
export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * A stable pseudo-waveform for a voice note.
 *
 * Real amplitude data would mean decoding the audio on the device for every
 * bubble, which is far too much work for decoration. Deriving the bars from
 * the URL instead means they're deterministic — the same note draws the same
 * shape on every device and every re-render, so it reads as a property of the
 * message rather than random noise that reshuffles as you scroll.
 */
export function waveformFor(seed: string, bars: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    // Kept clear of the extremes: an all-the-way-down bar looks like a gap,
    // and an all-the-way-up one flattens the shape.
    out.push(0.28 + ((hash >>> 8) % 1000) / 1000 * 0.72);
  }
  return out;
}
