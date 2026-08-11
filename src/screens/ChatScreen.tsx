import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import {
  HIT_TARGET,
  colors,
  glass,
  gradients,
  radius,
  shadows,
  spacing,
  typography,
} from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { copy, pick } from '../theme/copy';
import { MessageBubble } from '../components/MessageBubble';
import { ReactionPicker } from '../components/ReactionPicker';
import { EmptyState } from '../components/EmptyState';
import { TypingIndicator } from '../components/TypingIndicator';
import { AfterHoursBanner } from '../components/AfterHoursBanner';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { PressableScale } from '../components/ui/PressableScale';
import { Chip } from '../components/ui/Glass';
import { HeaderIconButton } from '../components/ui/AppHeader';
import { groupTheme } from '../theme/groupThemes';
import { useMessages } from '../hooks/useMessages';
import { useReadReceipts, useReadersByMessage } from '../hooks/useReadReceipts';
import { useTyping } from '../hooks/useTyping';
import { useAfterHours } from '../hooks/useAfterHours';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { markGroupRead } from '../lib/readState';
import { dayLabel } from '../utils/time';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

/** A message earns 🏆 only if it's clearly ahead — a lone 1-react message
 *  isn't "message of the day", it's just a message. */
const MOTD_MIN_REACTIONS = 3;

/** Lets the web fallback locate the divider to scroll to. */
const UNREAD_DIVIDER_ID = 'gc-unread-divider';

export default function ChatScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { groupId } = route.params;
  const { profile, session } = useAuth();
  const { messages, loading, sendMessage, toggleReaction } = useMessages(groupId);
  const { typingNames, notifyTyping } = useTyping(
    groupId,
    session?.user.id ?? '',
    profile?.display_name ?? 'someone'
  );
  const { afterHours, now } = useAfterHours();

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const scrollToBottom = () => {
      if (flatListRef.current && messages.length > 0) {
        flatListRef.current.scrollToEnd({ animated: true });
      }
    };

    const onShow = () => {
      setIsKeyboardOpen(true);
      // Only follow the keyboard down to the newest message if that's where
      // the user already was. Reading history shouldn't get yanked to the
      // bottom just because the composer took focus.
      if (!nearBottomRef.current) return;
      scrollToBottom();
      setTimeout(scrollToBottom, 120);
    };

    const showSub1 = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow
    );
    const showSub2 = Keyboard.addListener('keyboardDidShow', onShow);

    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardOpen(false);
        setTimeout(scrollToBottom, 100);
      }
    );

    return () => {
      showSub1.remove();
      showSub2.remove();
      hideSub.remove();
    };
  }, [messages.length]);

  const isFocused = useIsFocused();
  const flatListRef = useRef<FlatList>(null);
  const initialScrollDone = useRef(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  /** Whether the transcript is scrolled near the newest message. */
  const nearBottomRef = useRef(true);
  /** True until the opening scroll position has stabilised. */
  const settlingRef = useRef(true);
  /** Which group we've already run the opening scroll for. */
  const positionedForGroup = useRef<string | null>(null);

  // How many messages were unread when this screen opened. Taken from the
  // chat list rather than re-read here: opening the chat immediately stamps
  // `last_read_at`, so anything reading that column would race its own write
  // and the divider would flicker or vanish. Frozen for the whole visit so the
  // divider stays put while you read.
  const [openedWithUnread] = useState(() => route.params.unreadCount ?? 0);

  // Reading the chat is what clears the badge: stamp on open, and again on each
  // new message so a conversation you're actively watching never piles up
  // unread. Gated on focus so messages arriving while you're off in Group Info
  // still count as missed.
  useEffect(() => {
    if (!isFocused) return;
    markGroupRead(groupId, session?.user.id);
  }, [isFocused, groupId, session?.user.id, messages.length]);

  /** Walk back from the newest message to find where the unread run begins. */
  const firstUnreadIndex = useMemo(() => {
    if (openedWithUnread <= 0 || messages.length === 0) return -1;
    let seen = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].isMine) continue;
      seen += 1;
      if (seen === openedWithUnread) return i;
    }
    return -1;
  }, [messages, openedWithUnread]);

  const unreadCount = firstUnreadIndex >= 0 ? openedWithUnread : 0;

  const readers = useReadReceipts(groupId, session?.user.id);
  const readersByMessage = useReadersByMessage(messages, readers);

  const [groupInfo, setGroupInfo] = useState<{
    name: string;
    emoji: string;
    memberCount: number;
    theme: string | null;
  } | null>(null);

  const theme = groupTheme(groupInfo?.theme);
  const [draft, setDraft] = useState('');
  const [pickerForMessage, setPickerForMessage] = useState<string | null>(null);

  /**
   * Opening position: land on the first thing you haven't seen, or at the
   * bottom when you're already caught up.
   *
   * Driven from both an effect and onContentSizeChange because the two race —
   * rows are variable height and aren't measured until drawn, so a single
   * one-shot scroll on mount lands at the wrong offset (or nowhere). The ref
   * makes it idempotent: whichever fires first with real content wins.
   */
  // Read through refs so the retry timers below always use current values
  // instead of whatever was captured when the sequence started.
  const firstUnreadRef = useRef(firstUnreadIndex);
  firstUnreadRef.current = firstUnreadIndex;

  const positionInitial = useCallback(() => {
    const list = flatListRef.current;
    if (!list || !settlingRef.current) return;
    initialScrollDone.current = true;

    if (firstUnreadRef.current > 0) {
      list.scrollToIndex({ index: firstUnreadRef.current, viewPosition: 0.18, animated: false });
    } else {
      list.scrollToEnd({ animated: false });
    }

    // react-native-web's FlatList ignores scrollToEnd/scrollToIndex entirely —
    // it doesn't throw, it just doesn't move — so drive the underlying DOM
    // node instead. Native handles the calls above correctly.
    if (Platform.OS !== 'web') return;
    const node = list.getScrollableNode?.() as HTMLElement | undefined;
    if (!node || typeof node.scrollTop !== 'number') return;

    if (firstUnreadRef.current > 0) {
      const divider = document.getElementById(UNREAD_DIVIDER_ID);
      if (divider) {
        // Measure against the scroller rather than using offsetTop — the
        // divider's offsetParent isn't the scrolling node, so offsetTop is
        // relative to the wrong box.
        const delta =
          divider.getBoundingClientRect().top - node.getBoundingClientRect().top;
        node.scrollTop = Math.max(0, node.scrollTop + delta - node.clientHeight * 0.18);
        return;
      }
    }
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    // Wait for the list to actually exist — while `loading` is true the
    // FlatList isn't rendered at all, so the ref is null and every jump is a
    // silent no-op.
    if (loading || messages.length === 0) return;
    if (positionedForGroup.current === groupId) return;
    positionedForGroup.current = groupId;
    settlingRef.current = true;

    // Rows are variable height and keep growing as fonts and emoji resolve, so
    // one jump lands short. Re-assert across a short settle window, then hand
    // control back to the user.
    // Virtualisation mounts rows in windows, so every jump reveals more content
    // below and the previous "end" stops being the end. Re-assert on a tick
    // until the target position holds steady twice in a row, with a hard cap so
    // this can never spin forever.
    let stable = 0;
    let elapsed = 0;
    let lastTarget = -1;

    const tick = () => {
      positionInitial();
      const node = flatListRef.current?.getScrollableNode?.() as HTMLElement | undefined;
      const target =
        node && typeof node.scrollHeight === 'number' ? node.scrollHeight : -1;

      stable = target === lastTarget ? stable + 1 : 0;
      lastTarget = target;
      elapsed += 110;

      if (stable >= 2 || elapsed > 2500) {
        clearInterval(timer);
        settlingRef.current = false;
      }
    };

    positionInitial();
    const timer = setInterval(tick, 110);

    return () => {
      clearInterval(timer);
      settlingRef.current = false;
    };
  }, [loading, messages.length, groupId, positionInitial]);

  const [emptyText] = useState(() => pick(copy.emptyChat));
  const [loadingText] = useState(() => pick(copy.loading));

  const motdId = useMemo(() => {
    let bestId: string | null = null;
    let bestCount = MOTD_MIN_REACTIONS - 1;
    for (const m of messages) {
      const total = m.reactions.reduce((sum, r) => sum + r.count, 0);
      if (total > bestCount) {
        bestCount = total;
        bestId = m.id;
      }
    }
    return bestId;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    async function loadGroup() {
      const [{ data: group }, { count }] = await Promise.all([
        supabase.from('groups').select('name, emoji, theme').eq('id', groupId).single(),
        supabase
          .from('group_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('group_id', groupId),
      ]);
      if (!cancelled && group) {
        setGroupInfo({
          name: group.name,
          emoji: group.emoji,
          memberCount: count ?? 0,
          theme: group.theme,
        });
      }
    }
    loadGroup();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function handleSend() {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft('');
  }

  const canSend = draft.trim().length > 0;

  return (
    <View style={styles.root}>
      <AmbientBackground tint={theme.accent} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} color={theme.accent} />

          <PressableScale
            style={styles.headerTitle}
            scaleTo={0.98}
            onPress={() => navigation.navigate('GroupInfo', { groupId })}
          >
            <Text style={styles.headerName} numberOfLines={1}>
              {groupInfo?.emoji} {groupInfo?.name ?? 'GC'}
            </Text>
            <Text style={styles.headerMeta}>
              {groupInfo?.memberCount ?? 0} Members
              {typingNames.length > 0 ? ` • ${typingNames.length} cooking` : ''}
            </Text>
          </PressableScale>

          <PressableScale
            style={[
              styles.missedButton,
              { borderColor: `${theme.accent}66`, backgroundColor: `${theme.accent}24` },
            ]}
            scaleTo={0.90}
            haptic="medium"
            hitSlop={8}
            onPress={() =>
              navigation.navigate('WhatDidIMiss', { groupId, groupName: groupInfo?.name })
            }
          >
            <Ionicons name="sparkles" size={16} color={theme.accent} />
          </PressableScale>

          <HeaderIconButton
            name="information-circle-outline"
            onPress={() => navigation.navigate('GroupInfo', { groupId })}
          />
        </View>

        {afterHours && <AfterHoursBanner now={now} />}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <EmptyState emoji="⏳" text={loadingText} />
          ) : messages.length === 0 ? (
            <EmptyState emoji="🦗" text={emptyText} />
          ) : (
            <View style={styles.flex}>
              <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              // `interactive` is the iOS drag-the-keyboard-down gesture;
              // Android only supports dismissing once a drag starts.
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              // On web the virtualised window never expands: RNW's FlatList
              // ignores scrollToEnd/scrollToIndex, and scrolling the DOM node
              // directly doesn't feed VirtualizedList's offset tracking — so it
              // keeps rendering only the first window and the newest messages
              // never mount. Rendering the whole (already fully-fetched)
              // transcript there makes scroll position deterministic.
              initialNumToRender={
                Platform.OS === 'web' ? Math.max(messages.length, 20) : 25
              }
              windowSize={Platform.OS === 'web' ? 51 : 21}
              maxToRenderPerBatch={20}
              onScroll={(e) => {
                if (settlingRef.current) return;
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
                nearBottomRef.current = distanceToBottom < 120;
                
                if (distanceToBottom > 350) {
                  setShowScrollDown(true);
                } else {
                  setShowScrollDown(false);
                }
              }}
              scrollEventThrottle={64}
              // Variable-height rows aren't measured until drawn, so a jump to
              // an off-screen index can miss; retry once the list has settled.
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({
                    index,
                    viewPosition: 0.18,
                    animated: false,
                  });
                }, 120);
              }}
              onContentSizeChange={() => {
                if (settlingRef.current) {
                  positionInitial();
                  return;
                }
                // Only follow new messages when the user is already at the
                // bottom — otherwise reading history would keep getting yanked.
                if (nearBottomRef.current) {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              }}
              renderItem={({ item, index }) => {
                const prev = index > 0 ? messages[index - 1] : null;
                const next = index < messages.length - 1 ? messages[index + 1] : null;
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(item.createdAt);
                const showAuthor = newDay || !prev || prev.authorId !== item.authorId;

                const nextIsNewDay = next ? dayLabel(item.createdAt) !== dayLabel(next.createdAt) : true;
                const showAvatar = nextIsNewDay || !next || next.authorId !== item.authorId;

                const isFollowedWithinOneMin =
                  next &&
                  next.authorId === item.authorId &&
                  new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime() < 60000;
                const showTimestamp = !isFollowedWithinOneMin;

                return (
                  <>
                    {newDay && (
                      <View style={styles.dayRow}>
                        <Chip style={styles.dayChip}>
                          <Text style={styles.dayText}>{dayLabel(item.createdAt)}</Text>
                        </Chip>
                      </View>
                    )}

                    {index === firstUnreadIndex && unreadCount > 0 && (
                      <View nativeID={UNREAD_DIVIDER_ID} style={styles.unreadRow}>
                        <View style={[styles.unreadLine, { backgroundColor: `${theme.accent}66` }]} />
                        <Text style={[styles.unreadText, { color: theme.accent }]}>
                          {unreadCount} unread message{unreadCount === 1 ? '' : 's'}
                        </Text>
                        <View style={[styles.unreadLine, { backgroundColor: `${theme.accent}66` }]} />
                      </View>
                    )}
                    <MessageBubble
                      message={item}
                      isMessageOfTheDay={item.id === motdId}
                      showAuthor={showAuthor}
                      showAvatar={showAvatar}
                      showTimestamp={showTimestamp}
                      readers={readersByMessage.get(item.id)}
                      tint={theme}
                      onLongPress={() => setPickerForMessage(item.id)}
                      onToggleReaction={(emoji) => toggleReaction(item.id, emoji)}
                    />
                  </>
                );
              }}
            />
            {showScrollDown && (
              <Animated.View
                entering={FadeIn.duration(duration.fast)}
                exiting={FadeOut.duration(duration.fast)}
                style={styles.scrollDownWrap}
              >
                <PressableScale
                  style={styles.scrollDownButton}
                  scaleTo={0.9}
                  haptic="light"
                  onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
                >
                  <Ionicons name="chevron-down" size={20} color={colors.onSurface} />
                </PressableScale>
              </Animated.View>
            )}
          </View>
          )}

          <TypingIndicator names={typingNames} />

          <Animated.View
            entering={FadeIn.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
            style={[
              styles.composerWrap,
              { paddingBottom: isKeyboardOpen ? spacing.xs : Math.max(insets.bottom, spacing.xs) },
            ]}
          >
            <View style={styles.composer}>
              <PressableScale
                style={styles.plusButton}
                scaleTo={0.85}
                haptic="medium"
                onPress={() => setPickerForMessage(messages[messages.length - 1]?.id ?? null)}
              >
                <Ionicons name="add" size={24} color={colors.onSurfaceVariant} />
              </PressableScale>

              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  if (t.trim()) notifyTyping();
                }}
                placeholder="Say something..."
                placeholderTextColor={colors.outline}
                multiline
              />

              <PressableScale
                style={styles.sendWrap}
                scaleTo={0.85}
                haptic="medium"
                onPress={handleSend}
                disabled={!canSend}
              >
                <LinearGradient
                  colors={canSend ? theme.colors : [colors.surfaceHigh, colors.surfaceHigh]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.sendButton,
                    canSend && shadows.glow,
                    canSend && { shadowColor: theme.accent },
                  ]}
                >
                  <Ionicons name="send" size={18} color={canSend ? '#FFFFFF' : colors.outline} />
                </LinearGradient>
              </PressableScale>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ReactionPicker
        visible={pickerForMessage !== null}
        onClose={() => setPickerForMessage(null)}
        onSelect={(emoji, label) => {
          if (pickerForMessage) toggleReaction(pickerForMessage, emoji, label);
          setPickerForMessage(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
    gap: spacing.xs,
  },
  headerTitle: { flex: 1, paddingHorizontal: spacing.xs },
  headerName: { ...typography.title, fontSize: 20, color: colors.onSurface },
  headerMeta: { ...typography.micro, color: colors.onSurfaceVariant, marginTop: 2 },
  missedButton: {
    width: HIT_TARGET - 6,
    height: HIT_TARGET - 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
  list: { paddingVertical: spacing.xl },
  dayRow: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: spacing.md,
  },
  dayChip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  dayText: { ...typography.label, color: colors.onSurfaceVariant, fontSize: 11 },

  unreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  unreadLine: { flex: 1, height: 1 },
  unreadText: { ...typography.label, fontSize: 11 },
  composerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: 'rgba(19, 19, 29, 0.95)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.onSurface,
    maxHeight: 110,
    paddingVertical: spacing.sm,
  },
  sendWrap: { borderRadius: radius.pill },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollDownWrap: {
    position: 'absolute',
    bottom: 12,
    right: spacing.lg,
    zIndex: 50,
  },
  scrollDownButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30, 30, 42, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
