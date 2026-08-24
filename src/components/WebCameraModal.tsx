import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
 * Webcam capture for desktop browsers styled with GC's atmospheric neo-glass design.
 * Live preview, HUD framing reticles, ring-light illumination mode, camera switcher,
 * and review workflow before sending to chat.
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
  const [mirrored, setMirrored] = useState(true);
  const [ringLight, setRingLight] = useState(false);
  const [flashing, setFlashing] = useState(false);

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
      setRingLight(false);
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

    setFlashing(true);
    setTimeout(() => setFlashing(false), 200);

    const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw unmirrored so any real world text/objects stay upright
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

  const currentDevice = devices.find((d) => d.deviceId === deviceId);
  const deviceLabel = currentDevice?.label || (devices.length > 1 ? `Camera ${devices.findIndex((d) => d.deviceId === deviceId) + 1}` : 'Camera');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.webModalLayer, ringLight && styles.webModalLayerRingLight]}>
        <Pressable style={styles.webBackdrop} onPress={close} />

        <View style={[styles.webCard, ringLight && styles.cardRingLight]}>
          {/* Ambient atmospheric spotlight washes inside card */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <LinearGradient
              colors={['#181028', '#0C0A14', '#050409']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(129, 140, 248, 0.22)', 'rgba(192, 132, 252, 0.12)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.6 }}
              style={styles.topSpotlight}
            />
            <LinearGradient
              colors={['rgba(244, 114, 182, 0.14)', 'transparent']}
              start={{ x: 1, y: 1 }}
              end={{ x: 0.4, y: 0.4 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <LinearGradient
                colors={['#818CF8', '#C084FC', '#F472B6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBadge}
              >
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </LinearGradient>

              <View style={styles.titleColumn}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>GC Camera</Text>
                  <View style={styles.liveChip}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>HD</Text>
                  </View>
                </View>
                <Text style={styles.subtitle}>{shot ? 'Review your capture' : deviceLabel}</Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              {!shot && (
                <>
                  <PressableScale
                    style={[styles.actionBtn, ringLight && styles.actionBtnActive]}
                    hitSlop={8}
                    onPress={() => setRingLight(!ringLight)}
                    aria-label="Ring Light"
                  >
                    <Ionicons
                      name={ringLight ? 'sunny' : 'sunny-outline'}
                      size={18}
                      color={ringLight ? '#FBBF24' : colors.onSurface}
                    />
                  </PressableScale>

                  <PressableScale
                    style={styles.actionBtn}
                    hitSlop={8}
                    onPress={() => setMirrored(!mirrored)}
                    aria-label="Mirror Preview"
                  >
                    <Ionicons name="swap-horizontal" size={18} color={colors.onSurface} />
                  </PressableScale>
                </>
              )}

              {devices.length > 1 && !shot && (
                <PressableScale
                  style={styles.actionBtn}
                  hitSlop={8}
                  onPress={switchCamera}
                  aria-label="Switch Camera"
                >
                  <Ionicons name="camera-reverse-outline" size={18} color={colors.onSurface} />
                </PressableScale>
              )}

              <PressableScale style={styles.closeBtn} hitSlop={8} onPress={close} aria-label="Close">
                <Ionicons name="close" size={18} color={colors.onSurface} />
              </PressableScale>
            </View>
          </View>

          {/* Viewfinder / Stage */}
          <View style={styles.stageWrap}>
            <View style={styles.stage}>
              {/* Native Web Video Element */}
              {React.createElement('video', {
                ref: videoRef as never,
                autoPlay: true,
                playsInline: true,
                muted: true,
                style: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: mirrored ? 'scaleX(-1)' : 'none',
                  display: shot ? 'none' : 'block',
                  backgroundColor: '#000000',
                },
              })}

              {/* Shot Review Display */}
              {shot &&
                React.createElement('img', {
                  src: shot.dataUrl,
                  alt: 'Captured photo',
                  style: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  },
                })}

              {/* Shutter White Flash Animation */}
              {flashing && <View style={styles.flashOverlay} />}

              {/* HUD Corner Framing Brackets */}
              {!shot && !starting && !error && (
                <View style={styles.hudOverlay} pointerEvents="none">
                  <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
                  <View style={[styles.cornerBracket, styles.cornerTopRight]} />
                  <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
                  <View style={[styles.cornerBracket, styles.cornerBottomRight]} />

                  <View style={styles.hudTopChip}>
                    <Ionicons name="videocam-outline" size={12} color="rgba(255, 255, 255, 0.75)" />
                    <Text style={styles.hudTopChipText} numberOfLines={1}>{deviceLabel}</Text>
                  </View>

                  <View style={styles.hudBottomChip}>
                    <Text style={styles.hudBottomChipText}>1280 × 720</Text>
                  </View>
                </View>
              )}

              {/* Starting / Loading State */}
              {starting && !error && (
                <View style={styles.stageOverlay}>
                  <View style={styles.spinnerGlow}>
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                  <Text style={styles.hintTitle}>Connecting to Camera…</Text>
                  <Text style={styles.hintSub}>Please grant permission in your browser if prompted</Text>
                </View>
              )}

              {/* Error State */}
              {error && (
                <View style={styles.stageOverlay}>
                  <View style={styles.errorIconWrap}>
                    <Ionicons name="videocam-off-outline" size={32} color="#F87171" />
                  </View>
                  <Text style={styles.errorTitle}>Camera Unavailable</Text>
                  <Text style={styles.errorText}>{error}</Text>
                  <PressableScale style={styles.retryBtn} onPress={() => start(deviceId)}>
                    <LinearGradient
                      colors={['#6366F1', '#8B5CF6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.retryGradient}
                    >
                      <Ionicons name="refresh" size={15} color="#FFFFFF" />
                      <Text style={styles.retryText}>Try Again</Text>
                    </LinearGradient>
                  </PressableScale>
                </View>
              )}

              {/* Captured Review Badge */}
              {shot && (
                <View style={styles.capturedBadge} pointerEvents="none">
                  <Ionicons name="sparkles" size={12} color="#F472B6" />
                  <Text style={styles.capturedBadgeText}>Photo Ready</Text>
                </View>
              )}
            </View>
          </View>

          {/* Controls Bar */}
          <View style={styles.controls}>
            {shot ? (
              <View style={styles.reviewControls}>
                <PressableScale style={styles.secondaryBtn} scaleTo={0.96} onPress={() => setShot(null)}>
                  <Ionicons name="refresh" size={17} color={colors.onSurface} />
                  <Text style={styles.secondaryText}>Retake</Text>
                </PressableScale>

                <PressableScale style={styles.primaryBtnWrap} scaleTo={0.96} haptic="medium" onPress={usePhoto}>
                  <LinearGradient
                    colors={['#6366F1', '#A855F7', '#EC4899']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryText}>Send to Chat</Text>
                  </LinearGradient>
                </PressableScale>
              </View>
            ) : (
              <View style={styles.shutterRow}>
                <View style={styles.shutterSide}>
                  <PressableScale
                    style={[styles.featurePill, ringLight && styles.featurePillActive]}
                    onPress={() => setRingLight(!ringLight)}
                  >
                    <Ionicons name="sunny" size={14} color={ringLight ? '#FBBF24' : colors.onSurfaceVariant} />
                    <Text style={[styles.featurePillText, ringLight && styles.featurePillTextActive]}>
                      {ringLight ? 'Glow On' : 'Glow'}
                    </Text>
                  </PressableScale>
                </View>

                <PressableScale
                  style={[styles.shutterOuter, (starting || !!error) && styles.shutterDisabled]}
                  scaleTo={0.92}
                  haptic="medium"
                  disabled={starting || !!error}
                  onPress={capture}
                >
                  <LinearGradient
                    colors={['#818CF8', '#C084FC', '#F472B6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.shutterGlowRing}
                  >
                    <View style={styles.shutterInner} />
                  </LinearGradient>
                </PressableScale>

                <View style={styles.shutterSide}>
                  {devices.length > 1 && (
                    <PressableScale style={styles.featurePill} onPress={switchCamera}>
                      <Ionicons name="camera-reverse" size={14} color={colors.onSurfaceVariant} />
                      <Text style={styles.featurePillText}>Flip</Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webModalLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 1000,
  },
  webModalLayerRingLight: {
    backgroundColor: 'rgba(255, 248, 235, 0.22)',
  },
  webBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  topSpotlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  webCard: {
    width: '100%',
    maxWidth: 780,
    maxHeight: 740,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
  },
  cardRingLight: {
    borderColor: 'rgba(255, 245, 220, 0.65)',
    shadowColor: '#FDE047',
    shadowOpacity: 0.35,
    shadowRadius: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleColumn: {
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  title: {
    ...typography.headline,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stageWrap: {
    padding: spacing.md,
  },
  stage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: '#07060A',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    zIndex: 20,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: spacing.md,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  cornerBracket: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: 'rgba(129, 140, 248, 0.85)',
  },
  cornerTopLeft: {
    top: 14,
    left: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 4,
  },
  cornerTopRight: {
    top: 14,
    right: 14,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 4,
  },
  cornerBottomLeft: {
    bottom: 14,
    left: 14,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 4,
  },
  cornerBottomRight: {
    bottom: 14,
    right: 14,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 4,
  },
  hudTopChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 14, 25, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    maxWidth: 220,
  },
  hudTopChipText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  hudBottomChip: {
    alignSelf: 'flex-end',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 14, 25, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  hudBottomChipText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  capturedBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 14, 25, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.4)',
  },
  capturedBadgeText: {
    ...typography.label,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stageOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    padding: spacing.xl,
    backgroundColor: '#090810',
  },
  spinnerGlow: {
    padding: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.1)',
    marginBottom: spacing.xs,
  },
  hintTitle: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  hintSub: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  errorIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  errorTitle: {
    ...typography.headline,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  retryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  retryText: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  controls: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shutterSide: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  featurePillActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  featurePillText: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  featurePillTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  shutterDisabled: {
    opacity: 0.35,
  },
  shutterGlowRing: {
    width: '100%',
    height: '100%',
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  shutterInner: {
    width: '100%',
    height: '100%',
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#12101C',
  },
  reviewControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  secondaryText: {
    ...typography.label,
    color: colors.onSurface,
    fontSize: 13.5,
    fontWeight: '600',
  },
  primaryBtnWrap: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 4,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md - 2,
  },
  primaryText: {
    ...typography.label,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
