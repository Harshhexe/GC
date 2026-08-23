import { useEffect } from 'react';
import { ActivityIndicator, Dimensions, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { preventScreenCaptureAsync, allowScreenCaptureAsync } from '../lib/screenCapture';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { useSignedMediaUrl } from '../lib/mediaUrl';
import type { MessageMedia } from '../types';

/** Mounted only while a video is actually being viewed — useVideoPlayer
 *  needs a real source, so this stays a separate component rather than a
 *  conditional hook call inside MediaViewerModal itself. */
function VideoPlayerView({ url, poster }: { url: string; poster?: string | null }) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webVideoContainer}>
        {/* @ts-ignore */}
        <video
          src={url}
          poster={poster || undefined}
          controls
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            maxWidth: '92vw',
            maxHeight: '82vh',
            objectFit: 'contain',
            backgroundColor: '#000000',
            outline: 'none',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          }}
        />
      </View>
    );
  }

  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls />;
}

/** How far you have to drag before letting go dismisses instead of snapping back. */
const DISMISS_DISTANCE = 120;

export function MediaViewerModal({
  media,
  onClose,
  onJumpToMessage,
  onReply,
}: {
  media: MessageMedia | null;
  onClose: () => void;
  /** Jumps back to the message this attachment belongs to — shown when the
   *  viewer was opened from somewhere other than the transcript itself. */
  onJumpToMessage?: () => void;
  /** Reply to the message this attachment belongs to. */
  onReply?: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  // Full-size playback and full-size stills both come out of the private
  // bucket, so the viewer opens against a signed URL rather than the stored one.
  const signedUrl = useSignedMediaUrl(media?.url);
  const signedThumb = useSignedMediaUrl(media?.thumbUrl);

  const screenHeight = Dimensions.get('window').height;

  // Screenshot & Screen recording protection for View Once media
  useEffect(() => {
    if (Platform.OS === 'web' || !media) return;
    if (media.viewOnce) {
      preventScreenCaptureAsync().catch(() => {});
    } else {
      allowScreenCaptureAsync().catch(() => {});
    }
    return () => {
      if (Platform.OS !== 'web') {
        allowScreenCaptureAsync().catch(() => {});
      }
    };
  }, [media]);

  // Reset transforms whenever a new image or media opens
  useEffect(() => {
    if (media) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      savedTranslateX.value = 0;
      translateY.value = 0;
      savedTranslateY.value = 0;
    }
  }, [media, scale, savedScale, translateX, savedTranslateX, translateY, savedTranslateY]);

  // Pinch-to-zoom gesture (2 fingers)
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = savedScale.value * e.scale;
      scale.value = Math.max(1, Math.min(nextScale, 5));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        scale.value = withTiming(1, { duration: 180, easing: easing.out, reduceMotion });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 180, easing: easing.out, reduceMotion });
        savedTranslateX.value = 0;
        translateY.value = withTiming(0, { duration: 180, easing: easing.out, reduceMotion });
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  // Double-tap to quickly zoom in (2.5x) or zoom back out (1x)
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd(() => {
      if (scale.value > 1.2) {
        scale.value = withTiming(1, { duration: 200, easing: easing.out, reduceMotion });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 200, easing: easing.out, reduceMotion });
        savedTranslateX.value = 0;
        translateY.value = withTiming(0, { duration: 200, easing: easing.out, reduceMotion });
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5, { duration: 200, easing: easing.out, reduceMotion });
        savedScale.value = 2.5;
      }
    });

  // Pan gesture: moves zoomed image around when zoomed in, or pulls down to dismiss when at 1x
  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1.05) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      } else {
        const flung = Math.abs(e.velocityY) > 900;
        if (Math.abs(translateY.value) > DISMISS_DISTANCE || flung) {
          runOnJS(onClose)();
          translateY.value = withTiming(Math.sign(translateY.value || e.velocityY) * screenHeight, {
            duration: duration.fast,
            easing: easing.out,
            reduceMotion,
          });
        } else {
          translateY.value = withTiming(0, { duration: duration.base, easing: easing.out, reduceMotion });
        }
      }
    });

  // Combine gestures: double-tap races with simultaneous pinch + pan
  const imageGestures = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const videoSurfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    if (scale.value > 1.05) {
      return { opacity: 1 };
    }
    return {
      opacity: interpolate(
        Math.abs(translateY.value),
        [0, DISMISS_DISTANCE * 2],
        [1, 0.25],
        Extrapolation.CLAMP
      ),
    };
  });

  const chromeStyle = useAnimatedStyle(() => {
    if (scale.value > 1.05) {
      return { opacity: withTiming(0, { duration: 150 }) };
    }
    return {
      opacity: interpolate(Math.abs(translateY.value), [0, 80], [1, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <Modal visible={!!media} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.flex}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

          <GestureDetector
            gesture={
              Platform.OS === 'web' && media?.type === 'video'
                ? Gesture.Native()
                : media?.type === 'video'
                  ? panGesture
                  : imageGestures
            }
          >
            <Animated.View style={styles.flex}>
              {media?.type === 'video' ? (
                <Animated.View style={[styles.flex, videoSurfaceStyle]}>
                  {/* useVideoPlayer wants a real source at mount, so the player
                      only appears once the signature has come back. */}
                  {!!signedUrl && <VideoPlayerView url={signedUrl} poster={signedThumb} />}
                </Animated.View>
              ) : media ? (
                <Animated.View style={[styles.flex, animatedImageStyle, styles.imageCenterWrap]}>
                  {signedUrl ? (
                    <Image
                      source={signedUrl}
                      style={styles.media}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      transition={140}
                    />
                  ) : (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  )}
                </Animated.View>
              ) : null}
            </Animated.View>
          </GestureDetector>

          {/* Chrome Top Bar */}
          <Animated.View
            style={[styles.topBarWrap, { paddingTop: insets.top || spacing.xl }, chromeStyle]}
            pointerEvents="box-none"
          >
            <View style={styles.topBar}>
              <Pressable style={styles.iconButton} onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>

              {media?.viewOnce && (
                <View style={styles.viewOnceBadge}>
                  <Ionicons name="flame" size={13} color="#FFA450" />
                  <Text style={styles.viewOnceBadgeText}>View Once · Protected</Text>
                </View>
              )}

              <View style={styles.topBarActions}>
                {onReply && !media?.viewOnce && (
                  <Pressable style={styles.iconButton} onPress={onReply} hitSlop={8}>
                    <Ionicons name="arrow-undo" size={20} color="#FFFFFF" />
                  </Pressable>
                )}
                {onJumpToMessage && (
                  <Pressable style={styles.pillButton} onPress={onJumpToMessage} hitSlop={8}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.pillText}>Go to message</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.96)' },
  media: { flex: 1, width: '100%' },
  topBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  webVideoContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pillText: { ...typography.label, fontSize: 12.5, color: '#FFFFFF' },
  viewOnceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 164, 80, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 164, 80, 0.35)',
  },
  viewOnceBadgeText: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFA450',
  },
  imageCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
