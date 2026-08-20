import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { fromWebCapture } from '../lib/media';
import type { PickResult } from '../lib/media';

/** Matches compressImage()'s ceiling, so a webcam still costs what a phone photo does. */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.9;

function describeError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow it in your browser’s site settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Your camera is already in use by another app.';
  }
  return 'Couldn’t start the camera — try again.';
}

/**
 * Webcam capture for desktop browsers.
 *
 * `ImagePicker.launchCameraAsync` is a `capture`-flagged file input on web,
 * which a laptop ignores — it opens a file chooser and never touches the
 * webcam. This is the `getUserMedia` path: live preview, shutter, then a
 * review step before the shot reaches the composer.
 *
 * Web-only by construction (it renders DOM `<video>`/`<canvas>` nodes); the
 * caller gates on supportsWebCamera().
 */
export function WebCameraModal({
  visible,
  onClose,
  onCapture,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (result: PickResult) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async (preferredDeviceId: string | null) => {
    setStarting(true);
    setError(null);
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Labels are empty until a stream has been granted, so the device list is
      // only worth reading (and a switch button only worth showing) after this.
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
      setDeviceId(preferredDeviceId ?? activeId);
    } catch (err) {
      stop();
      setError(describeError(err));
    } finally {
      setStarting(false);
    }
  }, [stop]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (visible) {
      setShot(null);
      start(null);
    } else {
      stop();
    }
    return stop;
  }, [visible, start, stop]);

  function switchCamera() {
    if (devices.length < 2) return;
    const index = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(index + 1) % devices.length];
    start(next.deviceId);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Drawn un-mirrored even though the preview is mirrored — the same thing
    // phone cameras do. A mirrored preview feels right; a mirrored *photo*
    // reverses any text that happened to be in frame.
    ctx.drawImage(video, 0, 0, width, height);
    setShot({ dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height });
  }

  function usePhoto() {
    if (!shot) return;
    onCapture(fromWebCapture(shot.dataUrl, shot.width, shot.height));
    stop();
    onClose();
  }

  function close() {
    stop();
    onClose();
  }

  if (Platform.OS !== 'web') return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Camera</Text>
            <View style={styles.headerActions}>
              {devices.length > 1 && !shot && (
                <PressableScale style={styles.iconBtn} hitSlop={8} onPress={switchCamera}>
                  <Ionicons name="camera-reverse-outline" size={20} color={colors.onSurface} />
                </PressableScale>
              )}
              <PressableScale style={styles.iconBtn} hitSlop={8} onPress={close}>
                <Ionicons name="close" size={20} color={colors.onSurface} />
              </PressableScale>
            </View>
          </View>

          <View style={styles.stage}>
            {/* The preview stays mounted while a shot is under review so the
                stream isn't torn down and restarted on every Retake. */}
            {React.createElement('video', {
              ref: videoRef as never,
              autoPlay: true,
              playsInline: true,
              muted: true,
              style: {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
                display: shot ? 'none' : 'block',
              },
            })}

            {shot &&
              React.createElement('img', {
                src: shot.dataUrl,
                alt: 'Captured photo',
                style: { width: '100%', height: '100%', objectFit: 'cover' },
              })}

            {starting && !error && (
              <View style={styles.stageOverlay}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.hint}>Starting camera…</Text>
              </View>
            )}

            {error && (
              <View style={styles.stageOverlay}>
                <Ionicons name="videocam-off-outline" size={28} color={colors.onSurfaceVariant} />
                <Text style={styles.errorText}>{error}</Text>
                <PressableScale style={styles.retryBtn} onPress={() => start(deviceId)}>
                  <Text style={styles.retryText}>Try again</Text>
                </PressableScale>
              </View>
            )}
          </View>

          <View style={styles.controls}>
            {shot ? (
              <>
                <PressableScale style={styles.secondaryBtn} onPress={() => setShot(null)}>
                  <Ionicons name="refresh" size={16} color={colors.onSurface} />
                  <Text style={styles.secondaryText}>Retake</Text>
                </PressableScale>
                <PressableScale style={styles.primaryBtn} haptic="medium" onPress={usePhoto}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryText}>Use photo</Text>
                </PressableScale>
              </>
            ) : (
              <PressableScale
                style={[styles.shutter, (starting || !!error) && styles.shutterDisabled]}
                scaleTo={0.9}
                haptic="medium"
                disabled={starting || !!error}
                onPress={capture}
              >
                <View style={styles.shutterInner} />
              </PressableScale>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.label, color: colors.onSurface, fontSize: 15 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  stage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceLowest,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stageOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surfaceLowest,
  },
  hint: { ...typography.body, color: colors.onSurfaceVariant, fontSize: 13 },
  errorText: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  retryText: { ...typography.label, color: colors.onSurface, fontSize: 13 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  shutter: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  secondaryText: { ...typography.label, color: colors.onSurface, fontSize: 13 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
  },
  primaryText: { ...typography.label, color: '#FFFFFF', fontSize: 13 },
});
