import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, radius, shadows, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GroupTheme, groupTheme } from '../theme/groupThemes';
import { Message } from '../types';
import { clockTime } from '../utils/time';
import type { Reader } from '../hooks/useReadReceipts';
import { ReactionPill } from './ReactionPill';
import { PressableScale } from './ui/PressableScale';
import { Avatar } from './ui/Avatar';

export function MessageBubble({
  message,
  isMessageOfTheDay,
  showAuthor,
  showAvatar,
  showTimestamp = true,
  readers,
  tint,
  onLongPress,
  onToggleReaction,
}: {
  message: Message;
  isMessageOfTheDay?: boolean;
  /** False when this message continues a run from the same author. */
  showAuthor?: boolean;
  /** True when this message is the last in a run from the same author. */
  showAvatar?: boolean;
  /** False when this message is followed by another from the same author within 1 min. */
  showTimestamp?: boolean;
  /** Members whose "read up to" mark lands on this message. */
  readers?: Reader[];
  /** The group's theme, so each GC tints its own transcript. */
  tint?: GroupTheme;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  const mine = message.isMine;
  const theme = tint ?? groupTheme('violet');

  const lastTapRef = useRef<number>(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burstEmoji, setBurstEmoji] = useState<string | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });
  const prevReactedSet = useRef<Set<string>>(new Set());

  const dynamicEmojiFontSize = useMemo(() => {
    const minDim = Math.min(bubbleSize.width, bubbleSize.height);
    if (!minDim) return 32;
    return Math.max(20, Math.min(minDim * 0.55, 48));
  }, [bubbleSize.width, bubbleSize.height]);

  const triggerBurst = (emoji: string) => {
    setBurstEmoji(emoji);
    setTimeout(() => setBurstEmoji(null), 700);
  };

  useEffect(() => {
    const currentReacted = new Set(
      message.reactions.filter((r) => r.reactedByMe).map((r) => r.emoji)
    );

    for (const emoji of currentReacted) {
      if (!prevReactedSet.current.has(emoji)) {
        triggerBurst(emoji);
        break;
      }
    }

    prevReactedSet.current = currentReacted;
  }, [message.reactions]);

  const handleBubblePress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (lastTapRef.current && now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      lastTapRef.current = 0;
      onToggleReaction('❤️');
    } else {
      lastTapRef.current = now;
      tapTimerRef.current = setTimeout(() => {
        lastTapRef.current = 0;
      }, DOUBLE_TAP_DELAY);
    }
  };

  // Message of the day breathes — a slow glow so the eye finds it without
  // anything flashing or demanding a tap.
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!isMessageOfTheDay) return;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: easing.inOut, reduceMotion }),
        withTiming(0, { duration: 1800, easing: easing.inOut, reduceMotion })
      ),
      -1,
      false
    );
  }, [isMessageOfTheDay, glow]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glow.value, [0, 1], [0.2, 0.6]),
    shadowRadius: interpolate(glow.value, [0, 1], [10, 22]),
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
      style={[styles.row, mine && styles.rowMine]}
    >
      {!mine && (
        <View style={styles.avatarSlot}>
          {showAvatar !== false && (
            <Avatar
              emoji={message.authorEmoji}
              label={message.authorName}
              size={28}
              ringColors={[message.authorColor, theme.accent]}
            />
          )}
        </View>
      )}

      <View style={[styles.column, mine && styles.columnMine]}>
        {isMessageOfTheDay && (
          <View style={styles.motdBadge}>
            <Text style={styles.motdText}>🏆 MESSAGE OF THE DAY</Text>
          </View>
        )}

        {!mine && showAuthor !== false && (
          <Text style={[styles.author, { color: message.authorColor }]}>{message.authorName}</Text>
        )}

        <View style={[styles.bubbleWrap, message.reactions.length > 0 && styles.bubbleWrapWithReactions]}>
          <PressableScale onPress={handleBubblePress} onLongPress={onLongPress} scaleTo={0.98} haptic="medium">
            <Animated.View
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width !== bubbleSize.width || height !== bubbleSize.height) {
                  setBubbleSize({ width, height });
                }
              }}
              style={[
                styles.bubbleShadow,
                mine && shadows.glow,
                mine && styles.bubbleShadowMine,
                isMessageOfTheDay && styles.motdShadow,
                isMessageOfTheDay && glowStyle,
              ]}
            >
              {mine ? (
                <LinearGradient
                  colors={[`${theme.colors[0]}59`, `${theme.colors[1]}3D`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.bubble,
                    styles.bubbleMine,
                    { borderColor: `${theme.accent}8C` },
                    isMessageOfTheDay && styles.bubbleMotd,
                  ]}
                >
                  <Text style={styles.text}>{message.text}</Text>
                </LinearGradient>
              ) : (
                <View
                  style={[styles.bubble, styles.bubbleTheirs, isMessageOfTheDay && styles.bubbleMotd]}
                >
                  <Text style={styles.text}>{message.text}</Text>
                </View>
              )}

              {/* Emoji Burst Animated Overlay (Scaled to bubble width & height) */}
              {!!burstEmoji && (
                <Animated.View
                  entering={ZoomIn.duration(220).springify().damping(11)}
                  exiting={FadeOut.duration(280)}
                  style={styles.emojiOverlay}
                  pointerEvents="none"
                >
                  <Text style={[styles.emojiBurstText, { fontSize: dynamicEmojiFontSize }]}>
                    {burstEmoji}
                  </Text>
                </Animated.View>
              )}
            </Animated.View>
          </PressableScale>

          {/* Reaction Tapback Badge — mine on left (-4), theirs on right (-4) */}
          {message.reactions.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
              style={[styles.tapbackBadge, mine ? styles.tapbackMine : styles.tapbackTheirs]}
            >
              {Platform.OS !== 'web' && (
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.tapbackContent}>
                {message.reactions.map((r) => (
                  <ReactionPill key={r.emoji} reaction={r} onPress={() => onToggleReaction(r.emoji)} />
                ))}
              </View>
            </Animated.View>
          )}
        </View>

        {showTimestamp && (
          <View style={[styles.metaRow, mine && styles.metaRowMine]}>
            <Text style={styles.time}>{clockTime(message.createdAt)}</Text>
          </View>
        )}

        {/* Seen-by row: filter out message author's own avatar */}
        {(() => {
          const otherReaders = readers?.filter((r) => r.id !== message.authorId);
          if (!otherReaders?.length) return null;
          return (
            <Animated.View
              entering={FadeInDown.duration(duration.fast).reduceMotion(reduceMotion)}
              style={[styles.seenRow, mine && styles.seenRowMine]}
            >
              {otherReaders.slice(0, 5).map((r, i) => (
                <View key={r.id} style={[styles.seenAvatar, i > 0 && styles.seenOverlap]}>
                  <Avatar
                    emoji={r.avatarEmoji}
                    label={r.displayName}
                    size={20}
                    ringColors={[r.avatarColor, r.avatarColor]}
                  />
                </View>
              ))}
              {otherReaders.length > 5 && (
                <Text style={styles.seenMore}>+{otherReaders.length - 5}</Text>
              )}
            </Animated.View>
          );
        })()}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: 6,
  },
  rowMine: { justifyContent: 'flex-end' },
  avatarSlot: { width: 28, alignItems: 'center', paddingBottom: 20 },
  column: { maxWidth: '76%', alignItems: 'flex-start' },
  columnMine: { alignItems: 'flex-end' },

  bubbleWrap: { position: 'relative' },
  bubbleWrapWithReactions: { marginTop: 10 },
  emojiOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 30,
  },
  emojiBurstText: {
    fontSize: 46,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tapbackBadge: {
    position: 'absolute',
    top: -12,
    zIndex: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(18, 18, 28, 0.88)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  tapbackMine: { left: -4 },
  tapbackTheirs: { right: -4 },
  tapbackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },

  motdBadge: { marginBottom: 3, marginHorizontal: spacing.xs },
  motdText: { ...typography.label, fontSize: 9, color: colors.yellow },

  author: {
    ...typography.label,
    fontSize: 11,
    marginBottom: 4,
    marginLeft: spacing.xs,
  },

  bubbleShadow: { borderRadius: radius.md + 4 },
  bubbleShadowMine: { shadowOpacity: 0.28, shadowRadius: 14 },
  motdShadow: { shadowColor: colors.yellow },

  bubble: {
    borderRadius: radius.md + 4,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
  },
  bubbleMine: { borderBottomRightRadius: radius.sm },
  bubbleTheirs: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(55, 51, 61, 0.55)' : glass.fillStrong,
    borderColor: glass.stroke,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleMotd: { borderColor: colors.yellow },

  text: { ...typography.body, fontSize: 15, lineHeight: 21, color: colors.onSurface },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginHorizontal: spacing.xs,
    flexWrap: 'wrap',
  },
  metaRowMine: { justifyContent: 'flex-end' },
  time: { ...typography.micro, fontSize: 11, color: colors.outline },

  seenRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: spacing.xs },
  seenRowMine: { justifyContent: 'flex-end' },
  // A ring around each keeps overlapping avatars from bleeding together.
  seenAvatar: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  // Slight overlap so a row of readers reads as a cluster, not a list.
  seenOverlap: { marginLeft: -6 },
  seenMore: { ...typography.micro, fontSize: 10, color: colors.outline, marginLeft: 4 },
});
