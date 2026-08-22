import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GroupTheme, groupTheme } from '../theme/groupThemes';
import { clockTime } from '../utils/time';
import { PressableScale } from './ui/PressableScale';
import { Avatar } from './ui/Avatar';
import { WebModalCard } from './ui/WebModalCard';
import { usePrivateComments } from '../hooks/usePrivateComments';
import { sendPrivateComment, type PrivateComment } from '../lib/privateComments';
import type { GroupMember } from '../types';

/**
 * The private side-conversation attached to one group message.
 *
 * Kept visually distinct from the transcript — a darker sheet, a lock in the
 * header, and the original message quoted at the top — so it never reads as
 * "just another chat". The privacy line is stated in words rather than implied
 * by an icon alone, because being wrong about who can see this is the one
 * mistake in the feature that actually costs the user something.
 */
export function PrivateCommentThread({
  visible,
  onClose,
  groupId,
  messageId,
  messageText,
  messageAuthorId,
  messageAuthorName,
  members,
  myId,
  tint,
  /** Preselect a thread — used when arriving from a notification. */
  initialThreadUserId,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  messageId: string | null;
  messageText: string;
  messageAuthorId: string | null;
  messageAuthorName: string;
  members: GroupMember[];
  myId: string;
  tint?: GroupTheme;
  initialThreadUserId?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = tint ?? groupTheme('violet');
  const { threads, loading } = usePrivateComments(visible ? messageId : null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedThread, setPickedThread] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const iAmAuthor = !!messageAuthorId && messageAuthorId === myId;

  // Whose conversation this is. For anyone but the message's author there is
  // only ever one, so it resolves itself; the author may hold several and
  // picks from the list below.
  const activeThreadUserId = useMemo(() => {
    if (!iAmAuthor) return myId;
    if (pickedThread) return pickedThread;
    if (initialThreadUserId) return initialThreadUserId;
    return threads.length === 1 ? threads[0].threadUserId : null;
  }, [iAmAuthor, myId, pickedThread, initialThreadUserId, threads]);

  useEffect(() => {
    if (!visible) {
      setDraft('');
      setError(null);
      setPickedThread(null);
    }
  }, [visible]);

  const activeComments = useMemo(
    () => threads.find((t) => t.threadUserId === activeThreadUserId)?.comments ?? [],
    [threads, activeThreadUserId]
  );

  const nameFor = (userId: string) =>
    userId === myId ? 'You' : members.find((m) => m.id === userId)?.displayName ?? 'Someone';

  const counterpartId = iAmAuthor ? activeThreadUserId : messageAuthorId;
  const counterpartName = counterpartId ? nameFor(counterpartId) : messageAuthorName;

  async function submit() {
    if (!messageId || !draft.trim() || sending) return;
    // The author replying must name the counterpart; everyone else has theirs
    // derived server-side regardless of what is sent.
    const recipientId = iAmAuthor ? activeThreadUserId : messageAuthorId;
    if (!recipientId) return;
    setSending(true);
    setError(null);
    const { error: err } = await sendPrivateComment({
      groupId,
      messageId,
      authorId: myId,
      recipientId,
      text: draft,
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  const canSend = draft.trim().length > 0 && !sending && !!activeThreadUserId;

  const content = (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? spacing.md : Math.max(insets.top, spacing.md) }]}>
        <View style={[styles.lockBadge, { backgroundColor: `${theme.accent}1F`, borderColor: `${theme.accent}44` }]}>
          <Ionicons name="lock-closed" size={13} color={theme.accent} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Private comments</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {counterpartId
              ? `Only you and ${counterpartName} can see this`
              : 'Pick a conversation below'}
          </Text>
        </View>
        <PressableScale
          style={styles.closeBtn}
          scaleTo={0.9}
          hitSlop={10}
          onPress={onClose}
          accessibilityLabel="Close private comments"
        >
          <Ionicons name="close" size={20} color={colors.onSurface} />
        </PressableScale>
      </View>

      {/* The message this whole thread hangs off */}
      <View style={[styles.quote, { borderLeftColor: theme.accent }]}>
        <Text style={styles.quoteWho} numberOfLines={1}>
          On {messageAuthorName}'s message
        </Text>
        <Text style={styles.quoteText} numberOfLines={3}>
          {messageText || 'Message unavailable'}
        </Text>
      </View>

      {/* The message author can hold one thread per person who commented. */}
      {iAmAuthor && threads.length > 1 && (
        <View style={styles.threadPicker}>
          {threads.map((t) => {
            const active = t.threadUserId === activeThreadUserId;
            const member = members.find((m) => m.id === t.threadUserId);
            return (
              <PressableScale
                key={t.threadUserId}
                style={[
                  styles.threadChip,
                  active && { backgroundColor: `${theme.accent}22`, borderColor: `${theme.accent}66` },
                ]}
                scaleTo={0.96}
                haptic="light"
                onPress={() => setPickedThread(t.threadUserId)}
                accessibilityLabel={`Open thread with ${member?.displayName ?? 'member'}`}
              >
                <Avatar
                  imageUrl={member?.avatarUrl}
                  emoji={member?.avatarEmoji}
                  label={member?.displayName ?? '?'}
                  size={18}
                />
                <Text style={[styles.threadChipText, active && { color: colors.onSurface }]} numberOfLines={1}>
                  {member?.displayName ?? 'Someone'}
                </Text>
                <View style={styles.threadCount}>
                  <Text style={styles.threadCountText}>{t.comments.length}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      )}

      {/* Thread */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : !activeThreadUserId ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Choose whose comments to read.</Text>
        </View>
      ) : activeComments.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.outline} />
          <Text style={styles.emptyTitle}>No comments yet</Text>
          <Text style={styles.emptyText}>
            Say something only {counterpartName} will see.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={activeComments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <CommentBubble comment={item} mine={item.authorId === myId} name={nameFor(item.authorId)} theme={theme} />
          )}
        />
      )}

      {/* Composer */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!!error && (
          <Animated.View entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)} style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}
        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Platform.OS === 'web' ? spacing.md : Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed" size={11} color={colors.onSurfaceVariant} />
            <Text style={styles.privacyNoteText} numberOfLines={1}>
              {counterpartId
                ? `Only you and ${counterpartName} can see this`
                : 'Private to you and one other person'}
            </Text>
          </View>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={activeThreadUserId ? 'Write a private comment...' : 'Pick a conversation first'}
              placeholderTextColor={colors.outline}
              editable={!!activeThreadUserId}
              multiline
              accessibilityLabel="Private comment text"
            />
            <PressableScale
              style={[
                styles.sendBtn,
                { backgroundColor: canSend ? theme.accent : colors.surfaceHigh },
              ]}
              scaleTo={0.9}
              haptic="medium"
              disabled={!canSend}
              onPress={submit}
              accessibilityLabel="Send private comment"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={16} color={canSend ? '#FFFFFF' : colors.outline} />
              )}
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <WebModalCard visible={visible} onClose={onClose}>
        {content}
      </WebModalCard>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

function CommentBubble({
  comment,
  mine,
  name,
  theme,
}: {
  comment: PrivateComment;
  mine: boolean;
  name: string;
  theme: GroupTheme;
}) {
  const deleted = !!comment.deletedAt;
  return (
    <Animated.View
      entering={FadeInDown.duration(duration.fast).easing(easing.out).reduceMotion(reduceMotion)}
      style={[styles.bubbleRow, mine && styles.bubbleRowMine]}
    >
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: `${theme.accent}26`, borderColor: `${theme.accent}44` }
            : { backgroundColor: colors.surfaceHigh, borderColor: colors.outlineVariant },
        ]}
      >
        {!mine && <Text style={[styles.bubbleName, { color: theme.accent }]}>{name}</Text>}
        <Text style={[styles.bubbleText, deleted && styles.bubbleDeleted]}>
          {deleted ? 'This comment was deleted' : comment.text}
        </Text>
        <View style={styles.bubbleMetaRow}>
          <Text style={styles.bubbleMeta}>{clockTime(comment.createdAt)}</Text>
          {!!comment.editedAt && !deleted && <Text style={styles.bubbleMeta}>· edited</Text>}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.bgElevated },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  lockBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerCopy: { flex: 1 },
  headerTitle: { ...typography.titleMd, fontSize: 15.5, color: colors.onSurface },
  headerSub: { ...typography.micro, fontSize: 11.5, color: colors.onSurfaceVariant, marginTop: 1 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  quote: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingLeft: spacing.sm,
    paddingVertical: 2,
    borderLeftWidth: 2.5,
  },
  quoteWho: { ...typography.micro, fontSize: 10.5, color: colors.onSurfaceVariant, marginBottom: 2 },
  quoteText: { ...typography.body, fontSize: 13, color: colors.onSurface, opacity: 0.85 },

  threadPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  threadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceHigh,
  },
  threadChipText: { ...typography.micro, fontSize: 11.5, color: colors.onSurfaceVariant, maxWidth: 110 },
  threadCount: {
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
  },
  threadCountText: { ...typography.micro, fontSize: 10, color: colors.onSurface },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.xl },
  emptyTitle: { ...typography.bodyMedium, fontSize: 14, color: colors.onSurface, marginTop: 4 },
  emptyText: { ...typography.body, fontSize: 12.5, color: colors.onSurfaceVariant, textAlign: 'center' },

  list: { padding: spacing.lg, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  bubbleName: { ...typography.micro, fontSize: 11, fontWeight: '700' },
  bubbleText: { ...typography.body, fontSize: 14, color: colors.onSurface },
  bubbleDeleted: { fontStyle: 'italic', color: colors.onSurfaceVariant },
  bubbleMetaRow: { flexDirection: 'row', gap: 4, alignSelf: 'flex-end' },
  bubbleMeta: { ...typography.micro, fontSize: 10, color: colors.onSurfaceVariant },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: 4,
  },
  errorText: { ...typography.micro, fontSize: 11.5, color: colors.error, flex: 1 },

  composerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    gap: 6,
  },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privacyNoteText: { ...typography.micro, fontSize: 10.5, color: colors.onSurfaceVariant, flex: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 14,
    color: colors.onSurface,
    maxHeight: 96,
    paddingVertical: Platform.OS === 'web' ? 6 : spacing.xs,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
