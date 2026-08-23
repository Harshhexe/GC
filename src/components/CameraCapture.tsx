import { useCallback, useEffect, useRef, useState } from 'react';
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
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration as motionDuration, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { useRecentMedia, type RecentAsset } from '../hooks/useRecentMedia';
import { fromCameraCapture, pickFromLibrary, type PendingAttachment } from '../lib/media';
import { tapFeedback, successFeedback } from '../utils/haptics';

/** Hard ceiling on a recorded clip, mirroring the voice-note cap in spirit —
 *  long enough for anything conversational, short enough that the upload and
 *  the 50MB storage limit stay comfortable. */
const MAX_VIDEO_SECONDS = 60;

type Mode = 'photo' | 'video';

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

  const { assets, permission: mediaPermission, request: requestMedia } = useRecentMedia(visible);

  // Reset transient state whenever the camera is reopened, so it never comes
  // back mid-recording or still showing the previous session's timer.
  useEffect(() => {
    if (!visible) {
      setRecording(false);
      setElapsed(0);
      setBusy(false);
      setMode('photo');
    }
  }, [visible]);

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

  const finish = useCallback(
    async (result: Awaited<ReturnType<typeof fromCameraCapture>>) => {
      if (result.error || !result.attachment) {
        onError(result.error ?? 'Couldn’t use that capture.');
        return;
      }
      successFeedback();
      onCaptured(result.attachment);
      onClose();
    },
    [onCaptured, onClose, onError]
  );

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;
      await finish(
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
  }, [busy, finish, onError]);

  const stopVideo = useCallback(() => {
    if (!recording) return;
    // stopRecording resolves the pending recordAsync promise below, which is
    // where the finished clip is actually handled.
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
      await finish(await fromCameraCapture({ uri: clip.uri, kind: 'video' }));
    } catch {
      setRecording(false);
      onError('Couldn’t record that video — try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, recording, finish, onError]);

  const onShutter = useCallback(() => {
    tapFeedback();
    if (mode === 'photo') {
      takePhoto();
    } else if (recording) {
      stopVideo();
    } else {
      startVideo();
    }
  }, [mode, recording, takePhoto, startVideo, stopVideo]);

  /** A tap on the filmstrip. Library assets need resolving to a real file
   *  first: on iOS the identifier is a `ph://` URL that nothing can upload. */
  const useRollAsset = useCallback(
    async (asset: RecentAsset) => {
      if (busy) return;
      setBusy(true);
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id);
        const uri = info.localUri ?? asset.uri;
        await finish(
          await fromCameraCapture({
            uri,
            kind: asset.mediaType,
            width: info.width,
            height: info.height,
            durationSeconds: info.duration ?? null,
          })
        );
      } catch {
        onError('Couldn’t open that item — try the album instead.');
      } finally {
        setBusy(false);
      }
    },
    [busy, finish, onError]
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
      onCaptured(result.attachment);
      onClose();
    } finally {
      setBusy(false);
    }
  }, [onCaptured, onClose, onError]);

  if (!visible) return null;

  // Permission gate. Shown inside the modal rather than before opening it, so
  // the request always has visible context explaining what it is for.
  const needsCamera = !permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        {needsCamera ? (
          <View style={[styles.permissionRoot, { paddingTop: insets.top + spacing.lg }]}>
            <Pressable
              style={styles.permissionClose}
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
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              flash={flash}
              mode={mode === 'video' ? 'video' : 'picture'}
            />

            {/* Top chrome. Kept clear of the notch/Dynamic Island. */}
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
                  <Text style={styles.recText}>
                    {`0:${String(elapsed).padStart(2, '0')}`}
                  </Text>
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

            <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
              {/* Filmstrip: a shortcut to the last few shots, not a gallery.
                  Hidden entirely while recording so it can't be tapped
                  mid-clip. */}
              {!recording && (
                <View style={styles.stripWrap}>
                  {Platform.OS !== 'web' && mediaPermission != null && !assets.length ? (
                    <Pressable style={styles.stripEmpty} onPress={requestMedia}>
                      <Ionicons name="images-outline" size={16} color={colors.onSurfaceVariant} />
                      <Text style={styles.stripEmptyText}>Tap to show recent photos</Text>
                    </Pressable>
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
                            item.mediaType === 'video' ? 'Send this video' : 'Send this photo'
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

              {/* Mode switch. Text labels rather than icons: "PHOTO"/"VIDEO"
                  is unambiguous, and it matches what every phone camera does. */}
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
                        style={[
                          styles.modeText,
                          mode === m && { color: accentColor, fontWeight: '800' },
                        ]}
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
                  disabled={busy}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Open photo album"
                >
                  <Ionicons name="images" size={22} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  onPress={onShutter}
                  disabled={busy && !recording}
                  accessibilityRole="button"
                  accessibilityLabel={
                    mode === 'photo'
                      ? 'Take photo'
                      : recording
                        ? 'Stop recording'
                        : 'Start recording'
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },

  permissionRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.appChrome,
  },
  permissionClose: { position: 'absolute', left: spacing.lg, top: spacing.xl },
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
  // 44pt round hit areas over a live preview, dark enough to stay legible
  // against a bright scene.
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
    gap: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  stripWrap: { height: 62, justifyContent: 'center' },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
  stripEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stripEmptyText: { ...typography.micro, color: colors.onSurfaceVariant },

  modes: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  modeTab: { paddingVertical: 6, paddingHorizontal: spacing.sm },
  modeText: { ...typography.label, fontSize: 12, color: 'rgba(255, 255, 255, 0.65)' },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl + spacing.sm,
    paddingTop: spacing.xs,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  // Recording turns the disc into a square "stop" — the standard camera idiom.
  shutterStop: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.error,
  },
});
