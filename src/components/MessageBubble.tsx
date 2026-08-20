import { memo, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, radius, shadows, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import {
  BUBBLE_ALPHA,
  type BubbleStyle,
  GroupTheme,
  flattenTint,
  groupTheme,
} from '../theme/groupThemes';
import { Message } from '../types';
import { clockTime } from '../utils/time';
import type { Reader } from '../hooks/useReadReceipts';
import { ReactionPill } from './ReactionPill';
import { PressableScale } from './ui/PressableScale';
import { Avatar } from './ui/Avatar';
import { MessageQuotePreview } from './MessageQuotePreview';
import { MessageMediaView } from './MessageMediaView';
import { PollCard } from './PollCard';
import type { Poll } from '../lib/polls';
import { LinkPreviewCard, extractFirstUrl } from './LinkPreviewCard';
import { tapFeedback } from '../utils/haptics';
import { segmentMentionText } from '../lib/mentions';

const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 84;

/**
 * All callback props take the `message` itself rather than being pre-bound
 * per-row — that lets the screen pass the same stable function reference for
 * every row (instead of a fresh closure per render), which combined with
 * `memo()` below is what stops the entire visible list from re-rendering on
 * every composer keystroke.
 */
function MessageBubbleImpl({
  message,
  isMessageOfTheDay,
  isPinned,
  showAuthor,
  showAvatar = true,
  showTimestamp = true,
  readers,
  tint,
  bubbleStyle = 'translucent',
  highlighted,
  selectMode,
  selected,
  isVisible = true,
  downloaded,
  poll,
  myPollVotes,
  onPollVote,
  onLongPress,
  onPress,
  onToggleReaction,
  onSwipeReply,
  onQuotePress,
  onMentionPress,
  onMediaPress,
  myId,
}: {
  message: Message;
  isMessageOfTheDay?: boolean;
  isPinned?: boolean;
  /** False when this message continues a run from the same author. */
  showAuthor?: boolean;
  /** False on every row but the last in a same-author run. */
  showAvatar?: boolean;
  /** False when this message is followed by another from the same author within 1 min. */
  showTimestamp?: boolean;
  /** Members whose "read up to" mark lands on this message. */
  readers?: Reader[];
  /** The group's theme, so each GC tints its own transcript. */
  tint?: GroupTheme;
  /** Glass or solid fill — a personal readability choice, set per group. */
  bubbleStyle?: BubbleStyle;
  /** Briefly true right after a "jump to original" lands here. */
  highlighted?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  /** Whether the bubble is currently visible in the viewport */
  isVisible?: boolean;
  /** Whether this message's photo/video has been saved to the device. */
  downloaded?: boolean;
  /** Resolved poll for a `pollId` message — undefined until it loads. */
  poll?: Poll;
  myPollVotes?: string[];
  onPollVote?: (pollId: string, optionIds: string[]) => void;
  /** Screen-space Y of the touch is passed along so the caller can anchor a menu there. */
  onLongPress: (message: Message, pageY: number, pageX: number) => void;
  onPress?: (message: Message) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onSwipeReply?: (message: Message) => void;
  /** Tapping the quoted strip inside this bubble — jump to the original. */
  onQuotePress?: (message: Message) => void;
  /** Tapping an @mention span — opens that member's profile. Omitted (not
   *  just a no-op) while in select mode, so the tap falls through to
   *  selecting the bubble instead of opening a profile. */
  onMentionPress?: (userId: string) => void;
  /** Tapping an image/video/document attachment. */
  onMediaPress?: (message: Message) => void;
  myId?: string;
}) {
  const [showSeenText, setShowSeenText] = useState(false);
  const mine = message.isMine;
  const theme = tint ?? groupTheme('violet');
  const opaque = bubbleStyle === 'opaque';
  const hasCaption = message.text.trim().length > 0;
  const detectedUrl = useMemo(() => extractFirstUrl(message.text), [message.text]);

  const textSegments = segmentMentionText(message.text, message.mentions, message.mentionEveryone);
  const renderedText = message.aiShare ? (
    // A shared GC AI answer. The sender is the member who shared it — which
    // is honest — so the badge does the work of making clear the words are
    // the AI's and not theirs.
    <View style={styles.aiShareBlock}>
      <View style={styles.aiShareHead}>
        <Ionicons name="sparkles" size={11} color={theme.accent} />
        <Text style={[styles.aiShareBadge, { color: theme.accent }]}>GC AI</Text>
      </View>
      <Text style={styles.aiShareQuestion} numberOfLines={2}>
        {message.aiShare.question}
      </Text>
      <Text style={styles.text}>{message.aiShare.answer}</Text>
    </View>
  ) : textSegments.length === 1 && textSegments[0].type === 'text' ? (
      <Text style={styles.text}>{message.text}</Text>
    ) : (
      <Text style={styles.text}>
        {textSegments.map((seg) =>
          seg.type === 'text' ? (
            <Text key={seg.key}>{seg.value}</Text>
          ) : (
            <Text
              key={seg.key}
              style={[styles.mention, { color: theme.accent }]}
              onPress={onMentionPress && seg.userId ? () => onMentionPress(seg.userId!) : undefined}
            >
              {seg.value}
            </Text>
          )
        )}
      </Text>
    );

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

  // Highlight pulse when jumped to from a reply's quoted strip.
  const highlight = useSharedValue(0);
  useEffect(() => {
    if (!highlighted) return;
    highlight.value = withSequence(
      withTiming(1, { duration: 180, easing: easing.out, reduceMotion }),
      withTiming(0, { duration: 900, easing: easing.inOut, reduceMotion })
    );
  }, [highlighted, highlight]);

  const highlightStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(129, 140, 248, ${interpolate(highlight.value, [0, 1], [0, 0.16])})`,
  }));

  // Swipe-right-to-reply. Horizontal-only pan, clamped, snaps back after
  // either a real release past the trigger distance or a small flick.
  const translateX = useSharedValue(0);
  const replyArmed = useSharedValue(0);

  const panGesture = Gesture.Pan()
    // On web too. This used to be disabled off-native because the gesture
    // swallowed vertical drags and the transcript would only scroll from the
    // gaps between bubbles. The actual cure was `touch-action: pan-y` on the
    // row (see public/index.html): touch-action is resolved at touchstart, so
    // the browser keeps ownership of vertical panning no matter what the
    // handler does afterwards, while horizontal movement still reaches the
    // handler. Scrolling and swipe-to-reply can therefore both work.
    .enabled(!!onSwipeReply && !selectMode)
    .activeOffsetX([-1000, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      const dx = Math.max(0, e.translationX);
      translateX.value = dx > SWIPE_MAX ? SWIPE_MAX + (dx - SWIPE_MAX) * 0.15 : dx;
      replyArmed.value = dx >= SWIPE_TRIGGER ? 1 : 0;
    })
    .onEnd((e) => {
      const dx = Math.max(0, e.translationX);
      if (dx >= SWIPE_TRIGGER && onSwipeReply) {
        runOnJS(tapFeedback)();
        runOnJS(onSwipeReply)(message);
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      replyArmed.value = 0;
    });

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0.5, 1], Extrapolation.CLAMP) },
    ],
  }));

  const deleted = !!message.isDeleted;

  return (
    <Animated.View
      entering={
        mine
          ? FadeInDown.springify().damping(24).stiffness(250).mass(0.6).reduceMotion(reduceMotion)
          : FadeInDown.duration(260).easing(easing.out).reduceMotion(reduceMotion)
      }
      style={[styles.rowOuter]}
    >
      <Animated.View style={[styles.replyIconWrap, replyIconStyle]}>
        <View style={[styles.replyIconCircle, { backgroundColor: `${theme.accent}33` }]}>
          <Ionicons name="arrow-undo" size={16} color={theme.accent} />
        </View>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          // Web hook for the `touch-action: pan-y` rule in public/index.html.
          // GestureDetector sets its own touch-action on this node for the pan
          // gesture, which is what stops the transcript from scrolling while
          // your finger is on a bubble. Declaring pan-y hands vertical panning
          // back to the browser, and because touch-action is resolved at
          // touchstart the scroll can no longer be cancelled after the fact.
          // Spread + cast because `dataSet` is a react-native-web extension
          // that isn't in React Native's ViewProps types. No-op off web.
          {...({ dataSet: { gcbubble: '1' } } as object)}
          style={[styles.row, mine && styles.rowMine, swipeStyle, highlightStyle]}
        >
          {selectMode && (
            <PressableScale
              style={styles.selectDot}
              scaleTo={0.85}
              haptic="light"
              onPress={() => onPress?.(message)}
            >
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={selected ? theme.accent : colors.outline}
              />
            </PressableScale>
          )}

          {!mine && (
            <View style={styles.avatarSlot}>
              {showAvatar && (
                <Avatar
                  emoji={message.authorEmoji}
                  imageUrl={message.authorAvatarUrl}
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

            {isPinned && (
              <View style={styles.pinBadge}>
                <Ionicons name="pin" size={10} color={colors.onSurfaceVariant} />
                <Text style={styles.pinBadgeText}>PINNED</Text>
              </View>
            )}

            {!mine && showAuthor !== false && (
              <Text style={[styles.author, { color: message.authorColor }]}>{message.authorName}</Text>
            )}

            <PressableScale
              onLongPress={deleted ? undefined : (e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
              onPress={selectMode ? () => onPress?.(message) : undefined}
              scaleTo={0.98}
              haptic="medium"
            >
              <Animated.View
                style={[
                  styles.bubbleShadow,
                  mine && !deleted && Platform.OS === 'ios' && shadows.glow,
                  mine && styles.bubbleShadowMine,
                  isMessageOfTheDay && styles.motdShadow,
                  isMessageOfTheDay && glowStyle,
                ]}
              >
                {mine && !deleted ? (
                  <LinearGradient
                    colors={
                      opaque
                        ? [
                            flattenTint(theme.colors[0], BUBBLE_ALPHA.mineTop),
                            flattenTint(theme.colors[1], BUBBLE_ALPHA.mineBottom),
                          ]
                        : [`${theme.colors[0]}59`, `${theme.colors[1]}3D`]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.bubble,
                      styles.bubbleMine,
                      { borderColor: `${theme.accent}8C` },
                      isMessageOfTheDay && styles.bubbleMotd,
                      !!message.media && styles.bubbleMedia,
                    ]}
                  >
                    {message.replyPreview && (
                      <MessageQuotePreview
                        compact
                        accentColor={theme.accent}
                        authorName={message.replyPreview.authorName}
                        text={message.replyPreview.text}
                        kind={message.replyPreview.kind}
                        isDeleted={message.replyPreview.isDeleted}
                        isMine={message.replyPreview.authorId === myId}
                        onPress={onQuotePress ? () => onQuotePress(message) : undefined}
                        onLongPress={deleted ? undefined : (e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
                      />
                    )}
                    {poll && (
                      <PollCard
                        poll={poll}
                        myVotes={myPollVotes ?? []}
                        tint={theme.accent}
                        onVote={(ids) => onPollVote?.(poll.id, ids)}
                        onLongPress={(e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
                      />
                    )}
                    {message.media && (
                      <MessageMediaView
                        media={message.media}
                        isMine={mine}
                        tint={theme.accent}
                        isVisible={isVisible}
                        downloaded={downloaded}
                        onPress={() => onMediaPress?.(message)}
                        onLongPress={(e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
                      />
                    )}
                    {hasCaption && (
                      <View style={message.media && styles.captionPad}>{renderedText}</View>
                    )}
                    {!!detectedUrl && !deleted && (
                      <LinkPreviewCard url={detectedUrl} accentColor={theme.accent} />
                    )}
                  </LinearGradient>
                ) : (
                  <View
                    style={[
                      styles.bubble,
                      styles.bubbleTheirs,
                      opaque && styles.bubbleTheirsOpaque,
                      isMessageOfTheDay && styles.bubbleMotd,
                      deleted && styles.bubbleDeleted,
                      !!message.media && !deleted && styles.bubbleMedia,
                    ]}
                  >
                    {message.replyPreview && !deleted && (
                      <MessageQuotePreview
                        compact
                        accentColor={theme.accent}
                        authorName={message.replyPreview.authorName}
                        text={message.replyPreview.text}
                        kind={message.replyPreview.kind}
                        isDeleted={message.replyPreview.isDeleted}
                        isMine={message.replyPreview.authorId === myId}
                        onPress={onQuotePress ? () => onQuotePress(message) : undefined}
                        onLongPress={(e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
                      />
                    )}
                    {deleted ? (
                      <View style={styles.deletedRow}>
                        <Ionicons
                          name={message.deletedByAdmin ? 'shield-outline' : 'ban-outline'}
                          size={14}
                          color={colors.outline}
                        />
                        <Text style={styles.deletedBodyText}>
                          {message.deletedByAdmin ? 'Deleted by admin' : 'This message was deleted'}
                        </Text>
                      </View>
                    ) : (
                      <>
                        {poll && (
                          <PollCard
                            poll={poll}
                            myVotes={myPollVotes ?? []}
                            tint={theme.accent}
                            onVote={(ids) => onPollVote?.(poll.id, ids)}
                            onLongPress={(e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
                          />
                        )}
                        {message.media && (
                          <MessageMediaView
                            media={message.media}
                            isMine={mine}
                            tint={theme.accent}
                            isVisible={isVisible}
                            downloaded={downloaded}
                            onPress={() => onMediaPress?.(message)}
                            onLongPress={(e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
                          />
                        )}
                        {hasCaption && (
                          <View style={message.media && styles.captionPad}>{renderedText}</View>
                        )}
                        {!!detectedUrl && !deleted && (
                          <LinkPreviewCard url={detectedUrl} accentColor={theme.accent} />
                        )}
                      </>
                    )}
                  </View>
                )}
              </Animated.View>
            </PressableScale>

            {!deleted && (showTimestamp || message.reactions.length > 0 || message.editedAt) && (
              <View style={[styles.metaRow, mine && styles.metaRowMine]}>
                {showTimestamp && <Text style={styles.time}>{clockTime(message.createdAt)}</Text>}
                {!!message.editedAt && <Text style={styles.editedTag}>edited</Text>}
                {message.reactions.map((r) => (
                  <ReactionPill key={r.emoji} reaction={r} onPress={() => onToggleReaction(message, r.emoji)} />
                ))}
              </View>
            )}

            {/* Seen-by row: filter out message author's own avatar */}
            {(() => {
              const otherReaders = readers?.filter((r) => r.id !== message.authorId);
              if (!otherReaders?.length) return null;
              const names = otherReaders.map((r) => r.displayName).join(', ');
              return (
                <Pressable onPress={() => setShowSeenText((prev) => !prev)} hitSlop={6}>
                  <Animated.View
                    entering={FadeInDown.duration(duration.fast).reduceMotion(reduceMotion)}
                    style={[styles.seenRow, mine && styles.seenRowMine]}
                  >
                    {showSeenText ? (
                      <Text style={styles.seenText}>Seen by {names}</Text>
                    ) : (
                      <>
                        {otherReaders.slice(0, 5).map((r, i) => (
                          <View key={r.id} style={[styles.seenAvatar, i > 0 && styles.seenOverlap]}>
                            <Avatar
                              emoji={r.avatarEmoji}
                              imageUrl={r.avatarUrl}
                              label={r.displayName}
                              size={20}
                              ringColors={[r.avatarColor, r.avatarColor]}
                            />
                          </View>
                        ))}
                        {otherReaders.length > 5 && (
                          <Text style={styles.seenMore}>+{otherReaders.length - 5}</Text>
                        )}
                      </>
                    )}
                  </Animated.View>
                </Pressable>
              );
            })()}
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

function arePropsEqual(prev: any, next: any) {
  return (
    prev.message === next.message &&
    prev.isMessageOfTheDay === next.isMessageOfTheDay &&
    prev.isPinned === next.isPinned &&
    prev.showAuthor === next.showAuthor &&
    prev.showAvatar === next.showAvatar &&
    prev.showTimestamp === next.showTimestamp &&
    prev.readers === next.readers &&
    prev.tint === next.tint &&
    prev.bubbleStyle === next.bubbleStyle &&
    prev.highlighted === next.highlighted &&
    prev.selectMode === next.selectMode &&
    prev.selected === next.selected &&
    prev.downloaded === next.downloaded &&
    prev.poll === next.poll &&
    prev.myPollVotes === next.myPollVotes &&
    prev.onPollVote === next.onPollVote &&
    prev.onLongPress === next.onLongPress &&
    prev.onPress === next.onPress &&
    prev.onToggleReaction === next.onToggleReaction &&
    prev.onSwipeReply === next.onSwipeReply &&
    prev.onQuotePress === next.onQuotePress &&
    prev.onMentionPress === next.onMentionPress &&
    prev.onMediaPress === next.onMediaPress
  );
}

export const MessageBubble = memo(MessageBubbleImpl, arePropsEqual);

const styles = StyleSheet.create({
  rowOuter: { justifyContent: 'center' },
  replyIconWrap: {
    position: 'absolute',
    left: spacing.lg - 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: -1,
  },
  replyIconCircle: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: 6,
    backgroundColor: 'transparent',
  },
  rowMine: { justifyContent: 'flex-end' },
  selectDot: { width: 26, alignItems: 'center', justifyContent: 'center', marginRight: -2 },
  avatarSlot: { width: 28, alignItems: 'center' },
  column: { maxWidth: '76%', alignItems: 'flex-start' },
  columnMine: { alignItems: 'flex-end' },

  motdBadge: { marginBottom: 3, marginHorizontal: spacing.xs },
  motdText: { ...typography.label, fontSize: 9, color: colors.yellow },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
    marginHorizontal: spacing.xs,
  },
  pinBadgeText: { ...typography.label, fontSize: 9, color: colors.onSurfaceVariant },

  author: {
    ...typography.label,
    fontSize: 11,
    marginBottom: 4,
    marginLeft: spacing.xs,
  },

  bubbleShadow: { borderRadius: radius.md + 4 },
  bubbleShadowMine: {
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#6366F1',
          shadowOpacity: 0.28,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
        }
      : { elevation: 0 }),
  },
  motdShadow: {
    ...(Platform.OS === 'ios' ? { shadowColor: colors.yellow } : { elevation: 0 }),
  },

  bubble: {
    borderRadius: radius.md + 4,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bubbleMine: { borderBottomRightRadius: radius.sm },
  bubbleTheirs: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: radius.sm,
  },
  bubbleTheirsOpaque: {
    backgroundColor: flattenTint('#FFFFFF', BUBBLE_ALPHA.theirs),
  },
  bubbleDeleted: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
  },
  bubbleMotd: { borderColor: colors.yellow },
  // Media gets a thin frame instead of the usual text padding, so the
  // image/video sits close to the bubble edge.
  bubbleMedia: { padding: 3 },
  captionPad: { paddingTop: spacing.xs, paddingHorizontal: spacing.xs },

  text: { ...typography.body, fontSize: 15, lineHeight: 21, color: colors.onSurface },
  mention: { fontFamily: typography.bodyMedium.fontFamily },
  aiShareBlock: { gap: 5 },
  aiShareHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiShareBadge: {
    ...typography.micro,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  aiShareQuestion: {
    ...typography.micro,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deletedBodyText: { ...typography.body, fontSize: 14, color: colors.outline, fontStyle: 'italic' },

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
  editedTag: { ...typography.micro, fontSize: 11, color: colors.outline, fontStyle: 'italic' },

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
  seenText: {
    ...typography.micro,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
});
