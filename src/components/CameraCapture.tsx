import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration as motionDuration, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { useRecentMedia, type RecentAsset } from '../hooks/useRecentMedia';
import {
  fromCameraCapture,
  pickFromLibrary,
  formatFileSize,
  copyToCacheDir,
  type PendingAttachment,
} from '../lib/media';
import { tapFeedback, successFeedback } from '../utils/haptics';

/** Hard ceiling on a recorded clip, mirroring the voice-note cap in spirit —
 *  long enough for anything conversational, short enough that the upload and
 *  the 50MB storage limit stay comfortable. */
const MAX_VIDEO_SECONDS = 60;

type Mode = 'photo' | 'video';

/**
 * Zoom on expo-camera is awkward: `zoom` is a 0..1 *fraction of the device's
 * maximum*, not a magnification, and the maximum itself is never exposed. So a
 * labelled "2x" can only ever be an approximation of the normalised value.
 *
 * The 0.5x/1x boundary is the exception and the one that actually mattered
 * here: iOS reaches those by switching physical lens, which is exact. Left to
 * itself expo-camera opens on a virtual multi-camera device whose zero point
 * is the ultra-wide, which is why the camera used to start at 0.5x instead of
 * the 1x everyone expects.
 */
const WIDE_LENS = 'builtInWideAngleCamera';
const ULTRA_WIDE_LENS = 'builtInUltraWideCamera';

/** Only used to place the 2x/4x presets on the 0..1 scale; see above. */
const ASSUMED_MAX_ZOOM = 8;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** 1 -> "1", 2.35 -> "2.4" — keeps the pill from jittering in width. */
const formatFactor = (f: number) => (Number.isInteger(f) ? String(f) : f.toFixed(1));
/** magnification (on the wide lens) -> expo-camera's normalised zoom */
const zoomForFactor = (factor: number) =>
  clamp01((factor - 1) / (ASSUMED_MAX_ZOOM - 1));
/** the inverse, for the live readout while pinching */
const factorForZoom = (zoom: number) => 1 + zoom * (ASSUMED_MAX_ZOOM - 1);

/** Mounted only while a recorded clip is actually being reviewed —
 *  useVideoPlayer needs a real source, so this can't be a conditional hook
 *  inside the parent. */
function ReviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

export function CameraCapture({
  visible,
  onClose,
  onCaptured,
  onError,
  accentColor,
}: {
  visible: boolean;
  onClose: () => void;
  /** Hands back a ready-to-send attachment; the caller owns sending it. */
  onCaptured: (attachment: PendingAttachment) => void;
  onError: (message: string) => void;
  accentColor: string;
}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [mode, setMode] = useState<Mode>('photo');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  /** expo-camera's normalised 0..1 zoom, not a magnification. */
  const [zoom, setZoom] = useState(0);
  /** iOS only: which physical lens is active. 0.5x is a lens, not a zoom. */
  const [lens, setLens] = useState(WIDE_LENS);
  const [lenses, setLenses] = useState<string[]>([]);
  /** Zoom at the moment a pinch began, so the gesture is relative. */
  const pinchBase = useRef(0);
  /** Mirrors zoom for the gesture callbacks, which must not close over state. */
  const zoomRef = useRef(0);
  zoomRef.current = zoom;
  /**
   * Height of the bottom chrome, measured rather than assumed — it changes
   * with the safe-area inset and with whether the filmstrip is showing. The
   * preview is centred in the space *above* it, so the controls sit on black
   * instead of covering the shot, and the dead band ends up under the
   * controls rather than stranded above the frame.
   */
  const [chromeHeight, setChromeHeight] = useState(0);
  /** Captured but not yet sent — drives the review step. */
  const [pending, setPending] = useState<PendingAttachment | null>(null);

  const cameraGranted = !!permission?.granted;
  const {
    assets,
    granted: mediaGranted,
    asked: mediaAsked,
    request: requestMedia,
  } = useRecentMedia(visible && cameraGranted);

  useEffect(() => {
    if (!visible) {
      setRecording(false);
      setElapsed(0);
      setBusy(false);
      setMode('photo');
      setPending(null);
      // Reopen at 1x on the wide lens rather than wherever it was left.
      setZoom(0);
      setLens(WIDE_LENS);
    }
  }, [visible]);

  // Which lenses this device actually has, so 0.5x is only offered when there
  // is an ultra-wide to switch to.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !visible || !cameraGranted) return;
    let cancelled = false;
    cameraRef.current
      ?.getAvailableLensesAsync()
      .then((l) => !cancelled && setLenses(l))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, cameraGranted, facing]);

  /**
   * Ask for the photo roll once, right after camera access is settled.
   *
   * This deliberately reverses an earlier call. Holding the prompt back until
   * the user tapped the strip avoided stacking two system dialogs, but it also
   * meant the filmstrip was empty on first open — which is precisely when it
   * is most useful. The prompts are sequential rather than simultaneous, so
   * the cost is small and the strip is actually populated.
   */
  const mediaPrompted = useRef(false);
  useEffect(() => {
    if (!visible) {
      mediaPrompted.current = false;
      return;
    }
    if (!cameraGranted || mediaGranted || mediaPrompted.current) return;
    // `asked` means the current status is known; requesting before that would
    // race the initial read and could prompt for something already granted.
    if (!mediaAsked) return;
    mediaPrompted.current = true;
    requestMedia();
  }, [visible, cameraGranted, mediaGranted, mediaAsked, requestMedia]);

  // Recording timer. Separate from the recordAsync promise because that only
  // resolves once the clip is finished — there is nothing to count with.
  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  /** Captures land in review rather than sending straight away — a photo of
   *  the wrong thing is otherwise irreversible once it's in the group. */
  const stage = useCallback(
    (result: Awaited<ReturnType<typeof fromCameraCapture>>) => {
      if (result.error || !result.attachment) {
        onError(result.error ?? 'Couldn’t use that capture.');
        return;
      }
      setPending(result.attachment);
    },
    [onError]
  );

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;
      stage(
        await fromCameraCapture({
          uri: photo.uri,
          kind: 'photo',
          width: photo.width,
          height: photo.height,
        })
      );
    } catch {
      onError('Couldn’t take that photo — try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, stage, onError]);

  const stopVideo = useCallback(() => {
    if (!recording) return;
    // Resolves the pending recordAsync promise below, which is where the
    // finished clip is actually handled.
    cameraRef.current?.stopRecording();
    setRecording(false);
  }, [recording]);

  const startVideo = useCallback(async () => {
    if (!cameraRef.current || busy || recording) return;
    setRecording(true);
    try {
      const clip = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS });
      setRecording(false);
      if (!clip?.uri) return;
      setBusy(true);
      stage(await fromCameraCapture({ uri: clip.uri, kind: 'video' }));
    } catch {
      setRecording(false);
      onError('Couldn’t record that video — try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, recording, stage, onError]);

  /**
   * Pinch anywhere on the preview. Relative to where the gesture started, so
   * repeated pinches accumulate the way they do in every native camera.
   * Updates are gated to meaningful deltas — an unfiltered 60fps setState on
   * the preview surface is visible jank.
   */
  const applyZoom = useCallback((next: number) => {
    setZoom((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
  }, []);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          runOnJS(rememberPinchBase)();
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(handlePinch)(e.scale);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function rememberPinchBase() {
    pinchBase.current = zoomRef.current;
  }

  function handlePinch(scale: number) {
    // Pinch scale is multiplicative on magnification, so convert to a factor,
    // scale that, then convert back rather than scaling the 0..1 value (which
    // would make the gesture feel wrong at the low end).
    const baseFactor = factorForZoom(pinchBase.current);
    applyZoom(zoomForFactor(baseFactor * scale));
  }

  /** Presets. 0.5x is a lens change on iOS; the rest are digital zoom. */
  const selectPreset = useCallback((factor: number) => {
    tapFeedback();
    if (factor < 1) {
      setLens(ULTRA_WIDE_LENS);
      setZoom(0);
      return;
    }
    setLens(WIDE_LENS);
    setZoom(zoomForFactor(factor));
  }, []);

  const onShutter = useCallback(() => {
    tapFeedback();
    if (mode === 'photo') takePhoto();
    else if (recording) stopVideo();
    else startVideo();
  }, [mode, recording, takePhoto, startVideo, stopVideo]);

  /** A tap on the filmstrip. Library assets need resolving to a real file
   *  first: on iOS the identifier is a `ph://` URL that nothing can upload. */
  const useRollAsset = useCallback(
    async (asset: RecentAsset) => {
      if (busy) return;
      setBusy(true);
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id);
        // Out of the Photos container and into our own cache before anything
        // tries to upload it — see copyToCacheDir.
        const uri = await copyToCacheDir(info.localUri ?? asset.uri, asset.mediaType);
        stage(
          await fromCameraCapture({
            uri,
            kind: asset.mediaType,
            width: info.width,
            height: info.height,
            durationSeconds: asset.mediaType === 'video' ? (info.duration ?? null) : null,
            fileName: info.filename ?? null,
          })
        );
      } catch {
        onError('Couldn’t open that item — try the album instead.');
      } finally {
        setBusy(false);
      }
    },
    [busy, stage, onError]
  );

  const openAlbum = useCallback(async () => {
    tapFeedback();
    setBusy(true);
    try {
      const result = await pickFromLibrary();
      if (!result) return;
      if (result.error || !result.attachment) {
        onError(result.error ?? 'Couldn’t open your photos.');
        return;
      }
      setPending(result.attachment);
    } finally {
      setBusy(false);
    }
  }, [onError]);

  const confirmSend = useCallback(() => {
    if (!pending) return;
    successFeedback();
    onCaptured(pending);
    setPending(null);
    onClose();
  }, [pending, onCaptured, onClose]);

  // 0.5x is only meaningful where there is an ultra-wide to switch to.
  const hasUltraWide =
    Platform.OS === 'ios' && lenses.some((l) => l.toLowerCase().includes('ultrawide'));
  const presets = hasUltraWide ? [0.5, 1, 2, 4] : [1, 2, 4];
  const currentFactor = lens === ULTRA_WIDE_LENS ? 0.5 : factorForZoom(zoom);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      // Without an explicit fullScreen presentation the modal can composite
      // over the chat instead of replacing it, which left the screen showing
      // the transcript above the camera preview.
      presentationStyle="fullScreen"
      onRequestClose={pending ? () => setPending(null) : onClose}
    >
      {/* Gesture handlers do not reach into a Modal's separate view tree
          without their own root here — without this the pinch is silently
          dead, the same way it is in MediaViewerModal. */}
      <GestureHandlerRootView style={styles.root}>
        {!cameraGranted ? (
          <View style={styles.permissionRoot}>
            <Pressable
              style={[styles.permissionClose, { top: insets.top + spacing.sm }]}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </Pressable>
            <Ionicons name="camera-outline" size={44} color={accentColor} />
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>
              GC uses your camera only when you choose to take a photo or record a video for the
              group.
            </Text>
            <PressableScale
              style={[styles.permissionBtn, { backgroundColor: accentColor }]}
              scaleTo={0.96}
              haptic="medium"
              onPress={requestPermission}
            >
              <Text style={styles.permissionBtnText}>Allow camera</Text>
            </PressableScale>
          </View>
        ) : pending ? (
          /* ── Review ─────────────────────────────────────────────────── */
          <View style={styles.root}>
            <View style={styles.previewFill}>
              {pending.type === 'video' ? (
                <ReviewVideo uri={pending.uri} />
              ) : (
                <Image
                  source={pending.uri}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  transition={120}
                />
              )}
            </View>

            <View style={[styles.reviewTop, { paddingTop: insets.top + spacing.sm }]}>
              <Pressable
                style={styles.roundBtn}
                onPress={() => setPending(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Retake"
              >
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              </Pressable>
              <View style={styles.metaPill}>
                <Ionicons
                  name={pending.type === 'video' ? 'videocam' : 'image'}
                  size={13}
                  color={colors.onSurfaceVariant}
                />
                <Text style={styles.metaText}>
                  {pending.size > 0 ? formatFileSize(pending.size) : 'Ready'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.reviewBar,
                { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs },
              ]}
            >
              <PressableScale
                style={styles.retakeBtn}
                scaleTo={0.96}
                haptic="light"
                onPress={() => {
                  tapFeedback();
                  setPending(null);
                }}
                accessibilityLabel="Retake"
              >
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.retakeText}>Retake</Text>
              </PressableScale>

              <PressableScale
                style={[styles.sendBtn, { backgroundColor: accentColor }]}
                scaleTo={0.96}
                haptic="medium"
                onPress={confirmSend}
                accessibilityLabel="Send to the group"
              >
                <Text style={styles.sendText}>Send</Text>
                <Ionicons name="send" size={16} color="#FFFFFF" />
              </PressableScale>
            </View>
          </View>
        ) : (
          /* ── Capture ────────────────────────────────────────────────── */
          <>
            {/* The sensor is 4:3; a full-bleed preview on a ~19.5:9 phone
                makes the view center-crop hard (everything looks zoomed in)
                and upscale what's left (everything looks soft). Constraining
                the surface to the sensor's own ratio and letterboxing shows
                the true framing at native resolution instead. */}
            <GestureDetector gesture={pinch}>
              <View style={[styles.cameraStage, { paddingBottom: chromeHeight }]}>
                <View style={styles.cameraFrame}>
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing={facing}
                    flash={flash}
                    ratio="4:3"
                    zoom={zoom}
                    // iOS only; ignored elsewhere. Pinning the wide lens is
                    // what makes the camera open at 1x instead of 0.5x.
                    selectedLens={facing === 'back' ? lens : undefined}
                    mode={mode === 'video' ? 'video' : 'picture'}
                  />
                </View>
              </View>
            </GestureDetector>

            <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
              <Pressable
                style={styles.roundBtn}
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close camera"
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>

              {recording && (
                <Animated.View
                  entering={FadeIn.duration(motionDuration.fast).reduceMotion(reduceMotion)}
                  exiting={FadeOut.duration(motionDuration.fast).reduceMotion(reduceMotion)}
                  style={styles.recPill}
                >
                  <View style={styles.recDot} />
                  <Text style={styles.recText}>{`0:${String(elapsed).padStart(2, '0')}`}</Text>
                </Animated.View>
              )}

              <Pressable
                style={styles.roundBtn}
                onPress={() => {
                  tapFeedback();
                  setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Flash ${flash}`}
              >
                <Ionicons
                  name={flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline'}
                  size={22}
                  color={flash === 'off' ? '#FFFFFF' : accentColor}
                />
              </Pressable>
            </View>

            <View
              style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
              onLayout={(e) => setChromeHeight(e.nativeEvent.layout.height)}
            >
              {/* Zoom. Sits above the filmstrip so the thumb reaches it
                  without covering the preview, and reads as part of the
                  camera rather than part of the send controls. */}
              <View style={styles.zoomRow}>
                <View style={styles.zoomCluster}>
                  {presets.map((factor) => {
                    const active = Math.abs(currentFactor - factor) < 0.05;
                    return (
                      <Pressable
                        key={factor}
                        onPress={() => selectPreset(factor)}
                        hitSlop={10}
                        style={[styles.zoomPill, active && styles.zoomPillActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Zoom ${factor}x`}
                      >
                        <Text
                          style={[
                            styles.zoomText,
                            active && { color: accentColor, fontWeight: '800' },
                          ]}
                        >
                          {active
                            ? `${formatFactor(currentFactor)}\u00D7`
                            : formatFactor(factor)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Filmstrip. Hidden while recording so it can't be tapped
                  mid-clip. */}
              {!recording && Platform.OS !== 'web' && (
                <View style={styles.stripWrap}>
                  {!mediaGranted ? (
                    <PressableScale
                      style={styles.stripCta}
                      scaleTo={0.97}
                      haptic="light"
                      onPress={requestMedia}
                      accessibilityLabel="Show recent photos"
                    >
                      <Ionicons name="images-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.stripCtaText}>
                        {mediaAsked ? 'Allow photo access' : 'Show recent photos'}
                      </Text>
                    </PressableScale>
                  ) : assets.length === 0 ? (
                    <Text style={styles.stripEmptyText}>No recent photos</Text>
                  ) : (
                    <FlatList
                      horizontal
                      data={assets}
                      keyExtractor={(a) => a.id}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.strip}
                      renderItem={({ item }) => (
                        <PressableScale
                          scaleTo={0.94}
                          haptic="light"
                          style={styles.thumb}
                          onPress={() => useRollAsset(item)}
                          accessibilityLabel={
                            item.mediaType === 'video' ? 'Review this video' : 'Review this photo'
                          }
                        >
                          <Image
                            source={item.uri}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={120}
                          />
                          {item.mediaType === 'video' && (
                            <View style={styles.thumbVideo}>
                              <Ionicons name="play" size={11} color="#FFFFFF" />
                            </View>
                          )}
                        </PressableScale>
                      )}
                    />
                  )}
                </View>
              )}

              {!recording && (
                <View style={styles.modes}>
                  {(['photo', 'video'] as Mode[]).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        tapFeedback();
                        setMode(m);
                      }}
                      hitSlop={8}
                      style={styles.modeTab}
                      accessibilityRole="button"
                      accessibilityState={{ selected: mode === m }}
                      accessibilityLabel={m === 'photo' ? 'Photo mode' : 'Video mode'}
                    >
                      <Text
                        style={[styles.modeText, mode === m && { color: accentColor }]}
                      >
                        {m === 'photo' ? 'PHOTO' : 'VIDEO'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.controls}>
                <Pressable
                  style={styles.sideBtn}
                  onPress={openAlbum}
                  disabled={busy || recording}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Open photo album"
                >
                  <Ionicons name="images" size={22} color={recording ? colors.outline : '#FFFFFF'} />
                </Pressable>

                <Pressable
                  onPress={onShutter}
                  disabled={busy && !recording}
                  accessibilityRole="button"
                  accessibilityLabel={
                    mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'
                  }
                  style={[styles.shutterRing, recording && { borderColor: colors.error }]}
                >
                  {busy && !recording ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <View
                      style={[
                        styles.shutterCore,
                        mode === 'video' && !recording && { backgroundColor: colors.error },
                        recording && styles.shutterStop,
                      ]}
                    />
                  )}
                </Pressable>

                <Pressable
                  style={styles.sideBtn}
                  onPress={() => {
                    tapFeedback();
                    setFacing((f) => (f === 'back' ? 'front' : 'back'));
                  }}
                  disabled={recording}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Switch camera"
                >
                  <Ionicons
                    name="camera-reverse"
                    size={24}
                    color={recording ? colors.outline : '#FFFFFF'}
                  />
                </Pressable>
              </View>
            </View>
          </>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  /** Used by the review step, which contains rather than crops. */
  previewFill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  /** Full-screen black bed; the preview is centred inside it, so the bars
   *  above and below are deliberate letterboxing rather than dead space. */
  cameraStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // aspectRatio is width/height, so a portrait 4:3 sensor is 3/4.
  cameraFrame: { width: '100%', aspectRatio: 3 / 4, overflow: 'hidden', backgroundColor: '#000000' },

  permissionRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.appChrome,
  },
  permissionClose: { position: 'absolute', left: spacing.lg },
  permissionTitle: { ...typography.titleMd, color: colors.onSurface },
  permissionBody: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  permissionBtnText: { ...typography.label, color: '#FFFFFF', fontSize: 14 },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  recText: { ...typography.label, color: '#FFFFFF', fontSize: 12 },

  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  stripWrap: { minHeight: 60, justifyContent: 'center' },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  thumbVideo: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  stripCta: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  stripCtaText: { ...typography.micro, color: '#FFFFFF' },
  stripEmptyText: { ...typography.micro, color: colors.onSurfaceVariant, textAlign: 'center' },

  zoomRow: { alignItems: 'center' },
  /** Segmented pill, the way every phone camera does it — one glass container
   *  so the options read as a single control rather than four loose buttons. */
  zoomCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  // 38pt visual with hitSlop 10 clears the 44pt minimum in every direction
  // while keeping the cluster compact enough not to crowd the filmstrip.
  zoomPill: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPillActive: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  zoomText: { ...typography.label, fontSize: 12, color: 'rgba(255, 255, 255, 0.8)' },

  modes: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  modeTab: { paddingVertical: 4, paddingHorizontal: spacing.md },
  modeText: { ...typography.label, fontSize: 12, color: 'rgba(255, 255, 255, 0.65)' },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl + spacing.sm,
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  shutterRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
  /** Recording turns the disc into a square "stop" — the standard idiom. */
  shutterStop: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.error },

  reviewTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  metaText: { ...typography.micro, color: colors.onSurfaceVariant },

  reviewBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  retakeText: { ...typography.label, fontSize: 13, color: '#FFFFFF' },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.pill,
  },
  sendText: { ...typography.label, fontSize: 13, color: '#FFFFFF' },
});
