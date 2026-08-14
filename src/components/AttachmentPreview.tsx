import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { formatFileSize } from '../lib/media';
import type { PendingAttachment } from '../lib/media';

/** Drag this far down and letting go drops the attachment. */
const DISMISS_DISTANCE = 52;

/**
 * The picked-but-not-yet-sent attachment sitting above the composer. Shares
 * its geometry with MessageQuotePreview (the reply strip) on purpose — the
 * two stack directly on top of each other when you reply *with* an
 * attachment, and their close buttons have to line up.
 */
export function AttachmentPreview({
  attachment,
  uploading,
  progress,
  accentColor,
  viewOnce,
  onToggleViewOnce,
  onRemove,
}: {
  attachment: PendingAttachment;
  uploading: boolean;
  /** 0–1. Stays 0 until the first progress event lands. */
  progress: number;
  accentColor: string;
  viewOnce: boolean;
  onToggleViewOnce: () => void;
  onRemove: () => void;
}) {
  const translateY = useSharedValue(0);

  // Swipe down to discard, matching the fullscreen viewer's dismiss gesture.
  // Disabled mid-upload: the bytes are already going, and yanking the strip
  // away would suggest it stopped when it hasn't.
  const panGesture = Gesture.Pan()
    .enabled(!uploading)
    .activeOffsetY([-12, 12])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (translateY.value > DISMISS_DISTANCE || e.velocityY > 800) {
        translateY.value = withTiming(
          120,
          { duration: duration.fast, easing: easing.out, reduceMotion },
          () => runOnJS(onRemove)()
        );
      } else {
        translateY.value = withTiming(0, { duration: duration.base, easing: easing.out, reduceMotion });
      }
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    // Fades as it goes, so a half-drag reads as "this is on its way out".
    opacity: 1 - Math.min(translateY.value / (DISMISS_DISTANCE * 2), 0.6),
  }));

  const isImage = attachment.type === 'image' || attachment.type === 'gif';
  const canBeViewOnce = attachment.type === 'image' || attachment.type === 'video';
  // A video's poster is generated at pick time; documents never have one.
  const previewUri = isImage ? attachment.uri : attachment.thumbUri;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={dragStyle}>
        <View style={styles.row}>
          {previewUri ? (
            <Image source={previewUri} style={styles.thumb} contentFit="cover" transition={120} />
          ) : (
            <View style={styles.thumbIcon}>
              <Ionicons
                name={
                  attachment.type === 'video'
                    ? 'videocam'
                    : attachment.type === 'voice'
                      ? 'mic'
                      : 'document-text'
                }
                size={20}
                color={accentColor}
              />
            </View>
          )}

          {attachment.type === 'video' && previewUri && (
            <View style={styles.thumbPlay} pointerEvents="none">
              <Ionicons name="play" size={12} color="#FFFFFF" />
            </View>
          )}

          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {attachment.type === 'voice'
                ? 'Voice note'
                : attachment.name || (attachment.type === 'video' ? 'Video' : 'Photo')}
            </Text>
            <Text style={styles.meta}>
              {uploading
                ? progress > 0
                  ? `Sending… ${Math.round(progress * 100)}%`
                  : 'Sending…'
                : viewOnce
                  ? 'View once · they get one look'
                  : formatFileSize(attachment.size)}
            </Text>
          </View>

          {/* Offered for photos and videos only — "view once" is meaningless
              for a document you could just re-download, and for a voice note
              there's nothing to look at. */}
          {!uploading && canBeViewOnce && (
            <PressableScale
              hitSlop={6}
              style={[
                styles.onceButton,
                viewOnce
                  ? { backgroundColor: accentColor, borderColor: accentColor }
                  : { borderColor: 'rgba(255, 255, 255, 0.18)' },
              ]}
              haptic="light"
              onPress={onToggleViewOnce}
            >
              <Text style={[styles.onceText, viewOnce && styles.onceTextActive]}>1</Text>
            </PressableScale>
          )}

          {!uploading && (
            <PressableScale
              hitSlop={8}
              style={[styles.closeButton, { backgroundColor: `${accentColor}26` }]}
              onPress={onRemove}
            >
              <Ionicons name="close" size={16} color={accentColor} />
            </PressableScale>
          )}
        </View>

        {uploading && <UploadBar progress={progress} accentColor={accentColor} />}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The "is it actually doing anything" answer. Before the first progress event
 * lands there's nothing truthful to fill to, so the bar pulses instead — a bar
 * sitting frozen at zero looks identical to a tap that never registered, which
 * is the whole complaint. Once real byte counts arrive it becomes a normal
 * determinate fill.
 */
function UploadBar({ progress, accentColor }: { progress: number; accentColor: string }) {
  const pulse = useSharedValue(0.35);
  const width = useSharedValue(0);
  const indeterminate = progress <= 0;

  useEffect(() => {
    if (!indeterminate) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: easing.inOut, reduceMotion }),
      -1,
      true
    );
  }, [indeterminate, pulse]);

  useEffect(() => {
    // Eased rather than snapped: progress events arrive in coarse jumps and a
    // bar that lurches reads as broken.
    width.value = withTiming(progress, { duration: duration.base, easing: easing.out, reduceMotion });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() =>
    indeterminate
      ? { width: '100%' as const, opacity: pulse.value }
      : { width: `${Math.max(width.value, 0.02) * 100}%` as `${number}%`, opacity: 1 }
  );

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: accentColor }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches MessageQuotePreview's padding so both strips' close buttons sit
  // on the same vertical line when a reply and an attachment are both staged.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  thumb: { width: 40, height: 40, borderRadius: radius.sm },
  thumbIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits over the video poster's top-left corner, matching the thumb's inset.
  thumbPlay: {
    position: 'absolute',
    left: spacing.sm + 2 + 12,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 1 },
  name: { ...typography.bodyMedium, fontSize: 13.5, color: colors.onSurface },
  meta: { ...typography.micro, fontSize: 11, color: colors.onSurfaceVariant },
  onceButton: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onceText: { ...typography.label, fontSize: 12, color: colors.onSurfaceVariant },
  onceTextActive: { color: '#FFFFFF' },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  track: {
    height: 3,
    marginTop: 4,
    marginHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill },
});
