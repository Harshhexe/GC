import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
import { MessageActionAnchor, MessageActionSheet } from '../components/MessageActionSheet';
import { MessageQuotePreview } from '../components/MessageQuotePreview';
import { MentionSuggestions } from '../components/MentionSuggestions';
import { MemberProfileSheet } from '../components/MemberProfileSheet';
import { AttachmentSheet } from '../components/AttachmentSheet';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { EmptyState } from '../components/EmptyState';
import { TypingIndicator } from '../components/TypingIndicator';
import { AfterHoursBanner } from '../components/AfterHoursBanner';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { PressableScale } from '../components/ui/PressableScale';
import { Chip } from '../components/ui/Glass';
import { HeaderIconButton } from '../components/ui/AppHeader';
import { groupTheme } from '../theme/groupThemes';
import { useMessages } from '../hooks/useMessages';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { useReadReceipts, useReadersByMessage } from '../hooks/useReadReceipts';
import { useTyping } from '../hooks/useTyping';
import { useAfterHours } from '../hooks/useAfterHours';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { markGroupRead } from '../lib/readState';
import { dayLabel } from '../utils/time';
import {
  EVERYONE_TOKEN,
  deriveMentionsFromText,
  filterMembersForQuery,
  findActiveMentionQuery,
  insertMentionToken,
} from '../lib/mentions';
import {
  formatFileSize,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
  type PendingAttachment,
  type PickResult,
} from '../lib/media';
import { uploadMessageMedia } from '../lib/uploadMessageMedia';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { GroupMember, Mention, Message, MessageMedia } from '../types';

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
  const { messages, loading, sendMessage, editMessage, deleteMessage, toggleReaction } =
    useMessages(groupId);
  const { members: groupMembers } = useGroupMembers(groupId);
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
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const canModerate = myRole === 'owner' || myRole === 'admin';

  // Recomputing this on every render would hand MessageBubble a brand-new
  // `tint` object every time the composer draft changes, which — even with
  // memo() — would force every visible bubble to re-render on each keystroke.
  const theme = useMemo(() => groupTheme(groupInfo?.theme), [groupInfo?.theme]);
  const [draft, setDraft] = useState('');
  const [pickerForMessage, setPickerForMessage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Reply / edit composer modes — mutually exclusive, driven by the message
  // action sheet or a right-swipe on a bubble.
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageActionAnchor | null>(null);

  // @mentions — `selection` tracks the composer's cursor so an active "@query"
  // can be detected as you type; `mentionCandidates` accumulates every member
  // ever inserted via the picker this compose/edit session (keyed by id, so
  // re-picking someone doesn't duplicate them) — the *final* mentions sent
  // are derived from whichever of these still appear in the text, so manually
  // deleting an "@Name " drops it same as never having picked them.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [composerFocused, setComposerFocused] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState<Map<string, Mention>>(new Map());
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  // Tapping a suggestion blurs the composer (closing the picker) an instant
  // before the tap's onPress fires — the classic web autocomplete race.
  // Debouncing the blur gives that tap time to land before we actually hide.
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attachments — pick now, upload only at send time (so backing out costs
  // nothing) . `uploading` guards against a double-send while the request is
  // in flight; the attachment survives an upload failure so retrying doesn't
  // mean re-picking.
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MessageMedia | null>(null);

  // Select mode: a lightweight multi-select overlay entered via the action
  // sheet's "Select" item.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Briefly pulses the target bubble after "jump to original" lands.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user.id) return;
    supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMyRole((data?.role as typeof myRole) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, session?.user.id]);

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

  async function handleSend() {
    if (uploading) return;
    if (!draft.trim() && !pendingAttachment) return;
    const { mentions, mentionEveryone } = deriveMentionsFromText(draft, [...mentionCandidates.values()]);

    if (editingMessage) {
      // Edits never touch media — the attachment picker is disabled while
      // editing, so pendingAttachment can't be set here anyway.
      editMessage(editingMessage.id, draft, mentions, mentionEveryone);
      setEditingMessage(null);
      setDraft('');
      setMentionCandidates(new Map());
      setSelection(undefined);
      return;
    }

    if (pendingAttachment) {
      setUploading(true);
      setAttachError(null);
      const { url, error } = await uploadMessageMedia(groupId, pendingAttachment);
      setUploading(false);
      if (!url) {
        setAttachError(error ?? 'Upload failed — try again.');
        return; // keep draft + attachment so the user can just retry
      }
      const media: MessageMedia = {
        url,
        type: pendingAttachment.type,
        mime: pendingAttachment.mime,
        name: pendingAttachment.name,
        size: pendingAttachment.size,
        width: pendingAttachment.width,
        height: pendingAttachment.height,
        durationMs: pendingAttachment.durationMs,
      };
      sendMessage(draft, replyTo?.id ?? null, mentions, mentionEveryone, media);
      setPendingAttachment(null);
    } else {
      sendMessage(draft, replyTo?.id ?? null, mentions, mentionEveryone);
    }

    setReplyTo(null);
    setDraft('');
    setMentionCandidates(new Map());
    setSelection(undefined);
  }

  const canSend = draft.trim().length > 0 || !!pendingAttachment;

  function openAttachmentSheet() {
    if (editingMessage) return; // can't add media to an edit
    setAttachmentSheetVisible(true);
  }

  async function handlePicked(picker: () => Promise<PickResult | null>) {
    setAttachmentSheetVisible(false);
    const result = await picker();
    if (!result) return; // user cancelled
    if (result.error) {
      setAttachError(result.error);
      return;
    }
    setAttachError(null);
    setPendingAttachment(result.attachment);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const handleMediaPress = useCallback((message: Message) => {
    if (!message.media) return;
    if (message.media.type === 'file') {
      Linking.openURL(message.media.url).catch(() => { });
      return;
    }
    setViewingMedia(message.media);
  }, []);

  // The @query currently under the cursor, if any — null closes the picker.
  const activeMentionQuery = useMemo(
    () => (composerFocused ? findActiveMentionQuery(draft, selection?.start ?? draft.length) : null),
    [composerFocused, draft, selection]
  );

  const mentionMatches = useMemo(
    () =>
      activeMentionQuery
        ? filterMembersForQuery(groupMembers, activeMentionQuery.query, session?.user.id)
        : [],
    [activeMentionQuery, groupMembers, session?.user.id]
  );

  const showEveryoneOption = !!(
    activeMentionQuery &&
    canModerate &&
    EVERYONE_TOKEN.startsWith(activeMentionQuery.query.toLowerCase())
  );

  const applyMentionInsert = useCallback(
    (token: string, candidate?: Mention) => {
      if (!activeMentionQuery) return;
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      const { text, cursor } = insertMentionToken(draft, activeMentionQuery, token);
      setDraft(text);
      setSelection({ start: cursor, end: cursor });
      if (candidate) {
        setMentionCandidates((prev) => {
          const next = new Map(prev);
          next.set(candidate.userId, candidate);
          return next;
        });
      }
      // The tap that selected this already blurred the input on web — bring
      // focus straight back so typing continues without a second tap.
      inputRef.current?.focus();
    },
    [activeMentionQuery, draft]
  );

  const selectMentionMember = useCallback(
    (member: GroupMember) => applyMentionInsert(member.displayName, { userId: member.id, username: member.displayName }),
    [applyMentionInsert]
  );

  const selectMentionEveryone = useCallback(
    () => applyMentionInsert(EVERYONE_TOKEN),
    [applyMentionInsert]
  );

  const canDeleteMessage = useCallback(
    (m: Message) => m.isMine || canModerate,
    [canModerate]
  );

  // Everything below is useCallback'd with minimal, stable dependencies (state
  // setters are guaranteed stable by React) so the *same* function reference
  // survives a composer keystroke. Passed straight through as MessageBubble
  // props — combined with memo() there, that's what keeps typing from
  // re-rendering the whole visible message list.
  const startReply = useCallback((message: Message) => {
    setEditingMessage(null);
    setReplyTo(message);
    setActionTarget(null);
    setActionAnchor(null);
    setMentionCandidates(new Map());
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const startEdit = useCallback((message: Message) => {
    setReplyTo(null);
    setEditingMessage(message);
    setDraft(message.text);
    setActionTarget(null);
    setActionAnchor(null);
    // Seed from the message's existing mentions so re-editing without
    // touching the mention text keeps them — deriveMentionsFromText() at
    // save time is what actually drops anything the user deletes.
    setMentionCandidates(new Map(message.mentions.map((m) => [m.userId, m])));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const copyMessage = useCallback(async (message: Message) => {
    await Clipboard.setStringAsync(message.text);
    setActionTarget(null);
    setActionAnchor(null);
  }, []);

  const shareMessage = useCallback(async (message: Message) => {
    setActionTarget(null);
    setActionAnchor(null);
    try {
      await Share.share({ message: message.text });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }, []);

  const confirmDeleteMessage = useCallback(
    (message: Message) => {
      setActionTarget(null);
      setActionAnchor(null);
      const go = () => deleteMessage(message.id);
      if (Platform.OS === 'web') {
        if (window.confirm('Delete this message? This cannot be undone.')) go();
        return;
      }
      Alert.alert('Delete this message?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    },
    [deleteMessage]
  );

  const enterSelectMode = useCallback((message: Message) => {
    setActionTarget(null);
    setActionAnchor(null);
    setSelectMode(true);
    setSelectedIds(new Set([message.id]));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const copySelected = useCallback(async () => {
    const chosen = messages
      .filter((m) => selectedIds.has(m.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const text = chosen.map((m) => `${m.authorName}: ${m.isDeleted ? '[deleted]' : m.text}`).join('\n');
    await Clipboard.setStringAsync(text);
    exitSelectMode();
  }, [messages, selectedIds, exitSelectMode]);

  const deleteSelected = useCallback(() => {
    const chosen = messages.filter((m) => selectedIds.has(m.id) && !m.isDeleted);
    const go = () => {
      chosen.forEach((m) => deleteMessage(m.id));
      exitSelectMode();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${chosen.length} message${chosen.length === 1 ? '' : 's'}?`)) go();
      return;
    }
    Alert.alert(`Delete ${chosen.length} message${chosen.length === 1 ? '' : 's'}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  }, [messages, selectedIds, deleteMessage, exitSelectMode]);

  const jumpToMessage = useCallback(
    (id: string | undefined | null) => {
      if (!id) return;
      const index = messages.findIndex((m) => m.id === id);
      if (index < 0) return; // not currently loaded — nothing to jump to yet
      flatListRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true });
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setHighlightedId(id);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1000);
    },
    [messages]
  );

  // Arriving here from a notification tap — wait for the initial scroll
  // position to settle (same race as the unread-divider landing above) before
  // jumping, otherwise the two fight over where the list ends up.
  const pendingJumpId = useRef(route.params.jumpToMessageId ?? null);
  useEffect(() => {
    if (!pendingJumpId.current || loading || messages.length === 0) return;
    const id = pendingJumpId.current;
    let elapsed = 0;
    const tick = () => {
      elapsed += 110;
      if (!settlingRef.current || elapsed > 3000) {
        clearInterval(timer);
        pendingJumpId.current = null;
        jumpToMessage(id);
      }
    };
    const timer = setInterval(tick, 110);
    return () => clearInterval(timer);
  }, [loading, messages.length, jumpToMessage]);

  // ── Stable per-row callbacks handed to every MessageBubble ───────────────
  const handleLongPress = useCallback((message: Message, pageY: number) => {
    setActionTarget(message);
    setActionAnchor({ y: pageY, mine: message.isMine });
  }, []);

  const handleBubblePress = useCallback(
    (message: Message) => {
      if (selectMode) toggleSelected(message.id);
    },
    [selectMode, toggleSelected]
  );

  const handleToggleReaction = useCallback(
    (message: Message, emoji: string) => toggleReaction(message.id, emoji),
    [toggleReaction]
  );

  const handleSwipeReply = useCallback((message: Message) => startReply(message), [startReply]);

  const handleQuotePress = useCallback(
    (message: Message) => jumpToMessage(message.replyToMessageId),
    [jumpToMessage]
  );

  const handleMentionPress = useCallback((userId: string) => setViewingProfileId(userId), []);

  return (
    <View style={styles.root}>
      <AmbientBackground tint={theme.accent} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {selectMode ? (
          <View style={styles.header}>
            <HeaderIconButton name="close" onPress={exitSelectMode} />
            <View style={styles.headerTitle}>
              <Text style={styles.headerName}>
                {selectedIds.size} selected
              </Text>
            </View>
          </View>
        ) : (
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
        )}

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
                        highlighted={item.id === highlightedId}
                        selectMode={selectMode}
                        selected={selectedIds.has(item.id)}
                        onLongPress={handleLongPress}
                        onPress={selectMode ? handleBubblePress : undefined}
                        onToggleReaction={handleToggleReaction}
                        onSwipeReply={item.isDeleted ? undefined : handleSwipeReply}
                        onQuotePress={
                          item.replyPreview && !item.replyPreview.isDeleted ? handleQuotePress : undefined
                        }
                        onMentionPress={selectMode ? undefined : handleMentionPress}
                        onMediaPress={handleMediaPress}
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
            {(replyTo || editingMessage) && (
              <Animated.View
                entering={SlideInDown.duration(duration.fast).easing(easing.out).reduceMotion(reduceMotion)}
                style={styles.composerPreviewWrap}
              >
                {editingMessage ? (
                  <View style={[styles.editRow, { borderLeftColor: theme.accent }]}>
                    <View style={styles.editCopy}>
                      <View style={styles.editHeaderRow}>
                        <Ionicons name="pencil" size={11} color={theme.accent} />
                        <Text style={[styles.editLabel, { color: theme.accent }]}>Editing message</Text>
                      </View>
                      <Text style={styles.editSnippet} numberOfLines={1}>
                        {editingMessage.text}
                      </Text>
                    </View>
                    <PressableScale
                      hitSlop={8}
                      style={styles.composerPreviewClose}
                      onPress={() => {
                        setEditingMessage(null);
                        setDraft('');
                        setMentionCandidates(new Map());
                      }}
                    >
                      <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
                    </PressableScale>
                  </View>
                ) : (
                  replyTo && (
                    <MessageQuotePreview
                      accentColor={theme.accent}
                      authorName={replyTo.authorName}
                      text={replyTo.text}
                      kind={replyTo.kind}
                      isDeleted={!!replyTo.isDeleted}
                      isMine={replyTo.isMine}
                      onClose={() => setReplyTo(null)}
                    />
                  )
                )}
              </Animated.View>
            )}

            {pendingAttachment && (
              <Animated.View
                entering={SlideInDown.duration(duration.fast).easing(easing.out).reduceMotion(reduceMotion)}
                style={styles.attachmentPreviewWrap}
              >
                <View style={styles.attachmentPreviewRow}>
                  {pendingAttachment.type === 'image' || pendingAttachment.type === 'gif' ? (
                    <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentThumb} />
                  ) : (
                    <View style={styles.attachmentThumbIcon}>
                      <Ionicons
                        name={pendingAttachment.type === 'video' ? 'videocam' : 'document-text'}
                        size={20}
                        color={theme.accent}
                      />
                    </View>
                  )}
                  <View style={styles.attachmentCopy}>
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {pendingAttachment.name || (pendingAttachment.type === 'video' ? 'Video' : 'Photo')}
                    </Text>
                    <Text style={styles.attachmentMeta}>{formatFileSize(pendingAttachment.size)}</Text>
                  </View>
                  {uploading ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <PressableScale
                      hitSlop={8}
                      style={styles.composerPreviewClose}
                      onPress={() => setPendingAttachment(null)}
                    >
                      <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
                    </PressableScale>
                  )}
                </View>
              </Animated.View>
            )}

            {attachError && (
              <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.attachErrorRow}>
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.attachErrorText}>{attachError}</Text>
              </Animated.View>
            )}

            <MentionSuggestions
              visible={!!activeMentionQuery}
              members={mentionMatches}
              showEveryone={showEveryoneOption}
              accentColor={theme.accent}
              onSelectMember={selectMentionMember}
              onSelectEveryone={selectMentionEveryone}
            />

            <View style={styles.composer}>
              <PressableScale
                style={styles.plusButton}
                scaleTo={0.85}
                haptic="medium"
                disabled={!!editingMessage}
                onPress={openAttachmentSheet}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color={editingMessage ? colors.outline : colors.onSurfaceVariant}
                />
              </PressableScale>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  if (t.trim()) notifyTyping();
                }}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                selection={selection}
                onFocus={() => {
                  if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                  setComposerFocused(true);
                }}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => setComposerFocused(false), 150);
                }}
                placeholder={editingMessage ? 'Edit your message...' : 'Say something...'}
                placeholderTextColor={colors.outline}
                multiline
              />

              <PressableScale
                style={styles.sendWrap}
                scaleTo={0.85}
                haptic="medium"
                onPress={handleSend}
                disabled={!canSend || uploading}
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
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name={editingMessage ? 'checkmark' : 'send'}
                      size={18}
                      color={canSend ? '#FFFFFF' : colors.outline}
                    />
                  )}
                </LinearGradient>
              </PressableScale>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {selectMode && selectedIds.size > 0 && (
        <Animated.View
          entering={SlideInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
        >
          <PressableScale style={styles.selectBarButton} scaleTo={0.95} haptic="light" onPress={copySelected}>
            <Ionicons name="copy-outline" size={18} color={colors.onSurface} />
            <Text style={styles.selectBarLabel}>Copy</Text>
          </PressableScale>
          {[...selectedIds].every((id) => {
            const m = messages.find((msg) => msg.id === id);
            return m && canDeleteMessage(m) && !m.isDeleted;
          }) && (
              <PressableScale
                style={styles.selectBarButton}
                scaleTo={0.95}
                haptic="medium"
                onPress={deleteSelected}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.selectBarLabel, { color: colors.error }]}>Delete</Text>
              </PressableScale>
            )}
        </Animated.View>
      )}

      <ReactionPicker
        visible={pickerForMessage !== null}
        onClose={() => setPickerForMessage(null)}
        onSelect={(emoji, label) => {
          if (pickerForMessage) toggleReaction(pickerForMessage, emoji, label);
          setPickerForMessage(null);
        }}
      />

      <MessageActionSheet
        visible={actionTarget !== null}
        target={
          actionTarget && {
            id: actionTarget.id,
            authorName: actionTarget.authorName,
            text: actionTarget.text,
            isMine: actionTarget.isMine,
            canModerate,
          }
        }
        anchor={actionAnchor}
        onQuickReact={(emoji, label) => {
          if (actionTarget) toggleReaction(actionTarget.id, emoji, label);
          setActionTarget(null);
          setActionAnchor(null);
        }}
        onMoreReactions={() => {
          if (actionTarget) setPickerForMessage(actionTarget.id);
          setActionTarget(null);
          setActionAnchor(null);
        }}
        onReply={() => actionTarget && startReply(actionTarget)}
        onCopy={() => actionTarget && copyMessage(actionTarget)}
        onShare={() => actionTarget && shareMessage(actionTarget)}
        onEdit={() => actionTarget && startEdit(actionTarget)}
        onDelete={() => actionTarget && confirmDeleteMessage(actionTarget)}
        onSelect={() => actionTarget && enterSelectMode(actionTarget)}
        onClose={() => {
          setActionTarget(null);
          setActionAnchor(null);
        }}
      />

      <MemberProfileSheet
        visible={viewingProfileId !== null}
        member={groupMembers.find((m) => m.id === viewingProfileId) ?? null}
        onClose={() => setViewingProfileId(null)}
      />

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onCamera={() => handlePicked(pickFromCamera)}
        onLibrary={() => handlePicked(pickFromLibrary)}
        onDocument={() => handlePicked(pickDocument)}
        onClose={() => setAttachmentSheetVisible(false)}
      />

      <MediaViewerModal media={viewingMedia} onClose={() => setViewingMedia(null)} />
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
  composerWrap: {
    position: 'relative',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  composerPreviewWrap: { marginBottom: spacing.xs },
  attachmentPreviewWrap: { marginBottom: spacing.xs },
  attachmentPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  attachmentThumb: { width: 40, height: 40, borderRadius: radius.sm },
  attachmentThumbIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentCopy: { flex: 1, gap: 1 },
  attachmentName: { ...typography.bodyMedium, fontSize: 13.5, color: colors.onSurface },
  attachmentMeta: { ...typography.micro, fontSize: 11, color: colors.onSurfaceVariant },
  attachErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  attachErrorText: { ...typography.caption, fontSize: 12.5, color: colors.error, flexShrink: 1 },
  composerPreviewClose: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  editCopy: { flex: 1, gap: 1 },
  editHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLabel: { ...typography.label, fontSize: 11 },
  editSnippet: { ...typography.caption, fontSize: 12.5, color: colors.onSurfaceVariant },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(12, 12, 18, 0.96)',
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
  },
  selectBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  selectBarLabel: { ...typography.bodyMedium, fontSize: 14, color: colors.onSurface },
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
