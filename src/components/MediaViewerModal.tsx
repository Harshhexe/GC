import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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
import type { MessageMedia } from '../types';

/** Mounted only while a video is actually being viewed — useVideoPlayer
 *  needs a real source, so this stays a separate component rather than a
 *  conditional hook call inside MediaViewerModal itself. */
function VideoPlayerView({ url }: { url: string }) {
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
  const translateY = useSharedValue(0);
  const insets = useSafeAreaInsets();

  // Read on the JS thread and captured by value. `Dimensions.get()` is a
  // JS-thread-only API, and a gesture callback is a worklet running on the UI
  // thread — calling it from in there takes the whole app down with it.
  const screenHeight = Dimensions.get('window').height;

  // Each open starts from centre — otherwise the next photo would appear
  // already shoved down by however far the last one was dragged.
  useEffect(() => {
    if (media) translateY.value = 0;
  }, [media, translateY]);

  // Drag the whole surface down (or up) to dismiss, the way every photo
  // viewer behaves. `activeOffsetY` keeps a vertical drag from stealing
  // horizontal gestures or taps on the video's own transport controls.
  const panGesture = Gesture.Pan()
    .activeOffsetY([-18, 18])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const flung = Math.abs(e.velocityY) > 900;
      if (Math.abs(translateY.value) > DISMISS_DISTANCE || flung) {
        // Close immediately and let the surface keep travelling underneath the
        // Modal's own fade-out. Deferring the close into withTiming's
        // completion callback instead would mean running it on the UI thread
        // after the view may already be gone.
        runOnJS(onClose)();
        translateY.value = withTiming(Math.sign(translateY.value || e.velocityY) * screenHeight, {
          duration: duration.fast,
          easing: easing.out,
          reduceMotion,
        });
      } else {
        translateY.value = withTiming(0, { duration: duration.base, easing: easing.out, reduceMotion });
      }
    });

  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // The backdrop thins out as you drag, so the chat shows through and the
  // gesture feels like it's actually peeling the viewer away.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateY.value),
      [0, DISMISS_DISTANCE * 2],
      [1, 0.25],
      Extrapolation.CLAMP
    ),
  }));

  // Chrome fades out during the drag — it would otherwise ride along and
  // fight the sense that the whole thing is being dismissed.
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(translateY.value), [0, 80], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={!!media} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.flex}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.flex, surfaceStyle]}>
              {media?.type === 'video' ? (
                <VideoPlayerView url={media.url} />
              ) : media ? (
                <Image
                  source={media.url}
                  style={styles.media}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={140}
                />
              ) : null}
            </Animated.View>
          </GestureDetector>

          {/* Chrome sits outside the dragged surface so it can fade
              independently, and above it so the buttons stay tappable. */}
          {/* Insets are applied by hand rather than with SafeAreaView: a
              Modal renders in its own hierarchy, outside the provider that
              SafeAreaView reads from, so it measures nothing there and the
              buttons ride up under the status bar. The hook still works —
              it's called from this component, which does sit in the tree. */}
          <Animated.View
            style={[styles.topBarWrap, { paddingTop: insets.top || spacing.xl }, chromeStyle]}
            pointerEvents="box-none"
          >
            <View style={styles.topBar}>
              <Pressable style={styles.iconButton} onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>

              <View style={styles.topBarActions}>
                {onReply && (
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
  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
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
});
