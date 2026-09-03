import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Message, GroupMember } from '../types';
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
import { MessageText } from './MessageText';

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
  dailyName,
  readers,
  privateCommentCount = 0,
  onPrivateCommentsPress,
  tint,
  bubbleStyle = 'translucent',
  onWallpaper = false,
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
  memberMap,
  onMediaPress,
  onRetry,
  myId,
}: {
  message: Message;
  isMessageOfTheDay?: boolean;
  isPinned?: boolean;
  onRetry?: (message: Message) => void;
  /** False when this message continues a run from the same author. */
  showAuthor?: boolean;
  /** False on every row but the last in a same-author run. */
  showAvatar?: boolean;
  /** Today's AI-chosen GC name for the sender, shown beside their name.
   *  Undefined until the group has generated names for the day. */
  dailyName?: { name: string; emoji: string };
  /** False when this message is followed by another from the same author within 1 min. */
  showTimestamp?: boolean;
  /** Members whose "read up to" mark lands on this message. */
  readers?: Reader[];
  /** How many private comments *this viewer* may see on this message. Already
   *  scoped by RLS, so it differs per person and is 0 for non-participants —
   *  which is what keeps the indicator itself from leaking anything. */
  privateCommentCount?: number;
  onPrivateCommentsPress?: (message: Message) => void;
  /** The group's theme, so each GC tints its own transcript. */
  tint?: GroupTheme;
  /** Glass or solid fill — a personal readability choice, set per group. */
  bubbleStyle?: BubbleStyle;
  /** Whether a custom wallpaper is behind the transcript. Translucent bubbles
   *  need a dark backing there — see WALLPAPER_BACKING. */
  onWallpaper?: boolean;
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
  /** Lookup for group members — used to show member emoji/avatar in mention chips. */
  memberMap?: Map<string, GroupMember>;
  /** Tapping an image/video/document attachment. */
  onMediaPress?: (message: Message) => void;
  myId?: string;
}) {
  const [showSeenText, setShowSeenText] = useState(false);
  const mine = message.isMine;
  const theme = tint ?? groupTheme('violet');
  const opaque = bubbleStyle === 'opaque';
  // Only translucent fills need this: an opaque one already blocks whatever is
  // behind it, so there is nothing to guard against.
  const backing = onWallpaper && !opaque;
  const hasCaption = message.text.trim().length > 0;
  const detectedUrl = useMemo(() => extractFirstUrl(message.text), [message.text]);

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
  ) : (
    <MessageText
      text={message.text}
      mentions={message.mentions}
      mentionEveryone={message.mentionEveryone}
      accent={theme.accent}
      memberMap={memberMap}
      onMentionPress={onMentionPress}
    />
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
  const lastTapRef = useRef<number>(0);

  const handleBubblePress = useCallback(() => {
    if (selectMode) {
      onPress?.(message);
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      if (onSwipeReply && !deleted) {
        tapFeedback();
        onSwipeReply(message);
      }
    } else {
      lastTapRef.current = now;
      onPress?.(message);
    }
  }, [selectMode, onPress, message, onSwipeReply, deleted]);

  const handleDoubleClick = useCallback(() => {
    if (selectMode || deleted || !onSwipeReply) return;
    tapFeedback();
    onSwipeReply(message);
  }, [selectMode, deleted, onSwipeReply, message]);

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
              <Text
                style={[
                  styles.author,
                  { color: message.authorColor },
                  onWallpaper && styles.textHaloOnWallpaper,
                ]}
              >
                {message.authorName}
                {!!dailyName && (
                  <Text style={styles.authorDailyName}>
                    {`  ${dailyName.emoji} ${dailyName.name}`}
                  </Text>
                )}
              </Text>
            )}

            <PressableScale
              onLongPress={deleted ? undefined : (e) => onLongPress(message, e.nativeEvent.pageY, e.nativeEvent.pageX)}
              onPress={handleBubblePress}
              {...(Platform.OS === 'web' ? { onDoubleClick: handleDoubleClick } : {})}
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
                      {
                        borderColor: `${theme.accent}8C`,
                        ...(backing ? { backgroundColor: WALLPAPER_BACKING.mine } : null),
                      },
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
                        createdAt={message.createdAt}
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
                      backing && styles.bubbleTheirsOnWallpaper,
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
                            createdAt={message.createdAt}
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

            {!deleted && (showTimestamp || message.reactions.length > 0 || message.editedAt || message.deliveryStatus) && (
              <View style={[styles.metaRow, mine && styles.metaRowMine]}>
                {mine && message.deliveryStatus === 'sending' && (
                  <View style={styles.deliverySendingWrap}>
                    <Ionicons name="time-outline" size={11} color={colors.onSurfaceVariant} />
                    <Text style={[styles.deliveryStatusText, onWallpaper && styles.metaOnWallpaper]}>
                      Sending…
                    </Text>
                  </View>
                )}

                {mine && message.deliveryStatus === 'failed' && (
                  <PressableScale
                    scaleTo={0.92}
                    haptic="light"
                    onPress={() => onRetry?.(message)}
                    style={styles.deliveryFailedWrap}
                  >
                    <Ionicons name="alert-circle" size={12} color={colors.error} />
                    <Text style={styles.deliveryFailedText}>
                      Failed · Tap to retry
                    </Text>
                  </PressableScale>
                )}

                {showTimestamp && (!mine || !message.deliveryStatus || message.deliveryStatus === 'sent') && (
                  <Text style={[styles.time, onWallpaper && styles.metaOnWallpaper]}>
                    {clockTime(message.createdAt)}
                  </Text>
                )}
                {!!message.editedAt && (
                  <Text style={[styles.editedTag, onWallpaper && styles.metaOnWallpaper]}>
                    edited
                  </Text>
                )}
                {message.reactions.map((r) => (
                  <ReactionPill key={r.emoji} reaction={r} onPress={() => onToggleReaction(message, r.emoji)} />
                ))}
              </View>
            )}

            {/* Private comments. Rendered only when this viewer is one of the
                two participants — for everyone else the count arrives as 0,
                so there is nothing here to hint that a thread even exists. */}
            {privateCommentCount > 0 && (
              <Pressable
                onPress={() => onPrivateCommentsPress?.(message)}
                hitSlop={8}
                accessibilityLabel={`${privateCommentCount} private ${
                  privateCommentCount === 1 ? 'comment' : 'comments'
                }. Open private thread.`}
              >
                <Animated.View
                  entering={FadeInDown.duration(duration.fast).reduceMotion(reduceMotion)}
                  style={[styles.privateRow, mine && styles.privateRowMine]}
                >
                  <Ionicons name="lock-closed" size={10} color={theme.accent} />
                  <Text style={[styles.privateText, { color: theme.accent }]}>
                    {privateCommentCount} private{' '}
                    {privateCommentCount === 1 ? 'comment' : 'comments'}
                  </Text>
                </Animated.View>
              </Pressable>
            )}

            {/* Seen-by row: only show readers who are neither the viewer nor the author of this message */}
            {(() => {
              const otherReaders = readers?.filter(
                (r) => (!myId || r.id !== myId) && r.id !== message.authorId
              );
              if (!otherReaders?.length) return null;
              const names = otherReaders.map((r) => r.displayName).join(', ');

              return (
                <Pressable onPress={() => setShowSeenText((prev) => !prev)} hitSlop={6}>
                  <Animated.View
                    entering={FadeInDown.duration(duration.fast).reduceMotion(reduceMotion)}
                    style={[styles.seenRow, mine && styles.seenRowMine]}
                  >
                    {showSeenText ? (
                      <Text style={[styles.seenText, onWallpaper && styles.metaOnWallpaper]}>
                        Seen by {names}
                      </Text>
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

function areReadersEqual(prev?: any[], next?: any[]) {
  if (prev === next) return true;
  if (!prev && !next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (
      prev[i].id !== next[i].id ||
      prev[i].avatarUrl !== next[i].avatarUrl ||
      prev[i].avatarEmoji !== next[i].avatarEmoji ||
      prev[i].avatarColor !== next[i].avatarColor
    ) {
      return false;
    }
  }
  return true;
}

function arePropsEqual(prev: any, next: any) {
  return (
    prev.message === next.message &&
    prev.isMessageOfTheDay === next.isMessageOfTheDay &&
    prev.isPinned === next.isPinned &&
    prev.privateCommentCount === next.privateCommentCount &&
    prev.onPrivateCommentsPress === next.onPrivateCommentsPress &&
    prev.showAuthor === next.showAuthor &&
    prev.showAvatar === next.showAvatar &&
    prev.showTimestamp === next.showTimestamp &&
    prev.dailyName?.name === next.dailyName?.name &&
    areReadersEqual(prev.readers, next.readers) &&
    prev.tint === next.tint &&
    prev.bubbleStyle === next.bubbleStyle &&
    prev.onWallpaper === next.onWallpaper &&
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
    prev.memberMap === next.memberMap &&
    prev.onMediaPress === next.onMediaPress &&
    prev.myId === next.myId
  );
}

export const MessageBubble = memo(MessageBubbleImpl, arePropsEqual);

/**
 * Dark under-layer for translucent bubbles sitting on a custom wallpaper.
 *
 * Kept translucent so the photo still reads through the bubble — the point is
 * to bound how *light* the backdrop behind the text can get, not to hide the
 * wallpaper. Own bubbles sit slightly darker because a colour tint goes on top
 * of them as well.
 */
const WALLPAPER_BACKING = {
  mine: 'rgba(10, 10, 15, 0.72)',
  theirs: 'rgba(10, 10, 15, 0.66)',
} as const;

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
  /** Deliberately quieter than the real name: it is a joke about the person,
   *  not their identity, and must never be mistaken for who actually sent
   *  the message. Inherits the row's own colour rather than the author tint
   *  so it reads as an aside. */
  authorDailyName: {
    ...typography.label,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
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
  // A 5% white wash reads as a bubble over the app's near-black background,
  // but over a bright photo it is invisible and leaves the text sitting
  // directly on the wallpaper. These darken the fill instead of lightening it,
  // which is the only way to keep white text legible over an arbitrary image.
  bubbleTheirsOnWallpaper: {
    backgroundColor: WALLPAPER_BACKING.theirs,
    borderColor: 'rgba(255, 255, 255, 0.14)',
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
  deliverySendingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deliveryStatusText: {
    ...typography.micro,
    fontSize: 11,
    color: colors.outline,
    fontStyle: 'italic',
  },
  deliveryFailedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  deliveryFailedText: {
    ...typography.micro,
    fontSize: 11,
    color: colors.error,
    fontWeight: '700',
  },
  time: { ...typography.micro, fontSize: 11, color: colors.outline },
  /*
   * The meta row (time, "edited", seen-by) sits *outside* the bubble, so the
   * bubble's dark backing does nothing for it — this text lands straight on
   * the wallpaper. At the usual muted grey it measures 1.49:1 against a bright
   * photo, i.e. invisible.
   *
   * Brightening alone isn't enough either: white on a white photo is only
   * 2.7:1. The dark halo is what actually guarantees an edge, because it is
   * drawn per-glyph regardless of what the photo does behind it — the standard
   * treatment for small text over arbitrary imagery.
   */
  textHaloOnWallpaper: {
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaOnWallpaper: {
    color: 'rgba(255, 255, 255, 0.92)',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  editedTag: { ...typography.micro, fontSize: 11, color: colors.outline, fontStyle: 'italic' },

  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    marginHorizontal: spacing.xs,
  },
  privateRowMine: { justifyContent: 'flex-end' },
  privateText: { ...typography.micro, fontSize: 10.5, fontWeight: '600' },
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
