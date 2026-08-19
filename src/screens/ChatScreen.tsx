import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewToken,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
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
import { GifPicker } from '../components/GifPicker';
import type { GifResult } from '../lib/giphy';
import { StickerPicker } from '../components/StickerPicker';
import { StickerCreator } from '../components/StickerCreator';
import { useStickers } from '../hooks/useStickers';
import type { Sticker } from '../types';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { EmptyState } from '../components/EmptyState';
import { TypingIndicator } from '../components/TypingIndicator';
import { PinnedBanner } from '../components/PinnedBanner';
import { ElevenElevenBanner } from '../components/ElevenElevenBanner';
import { DailyRecapMessageCard } from '../components/DailyRecapMessageCard';
import { DailyRecapModal } from '../components/DailyRecapModal';
import { GCAIMessage } from '../components/GCAIMessage';
import { TeaBanner } from '../components/TeaBanner';
import { TeaInfoSheet } from '../components/TeaInfoSheet';
import { TeaReportModal } from '../components/TeaReportModal';
import { useTeaSession, type TeaSession } from '../hooks/useTeaSession';
import { GCAwardsBanner } from '../components/GCAwardsBanner';
import { GCAwardsModal } from '../components/GCAwardsModal';
import { useWeeklyAwards } from '../hooks/useWeeklyAwards';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { PressableScale } from '../components/ui/PressableScale';
import { Chip } from '../components/ui/Glass';
import { HeaderIconButton } from '../components/ui/AppHeader';
import { TEA_THEME, groupTheme, usePersonalGroupTheme } from '../theme/groupThemes';
import { useMessages } from '../hooks/useMessages';
import { useWebKeyboardOpen } from '../hooks/useWebKeyboardOpen';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { useReadReceipts, useReadersByMessage } from '../hooks/useReadReceipts';
import { usePinnedMessages } from '../hooks/usePinnedMessages';
import { useTyping } from '../hooks/useTyping';
import { useElevenEleven } from '../hooks/useElevenEleven';
import { useDailyRecap } from '../hooks/useDailyRecap';
import { useGCCommands, type GCCommandEntry } from '../hooks/useGCCommands';
import {
  GC_TOKEN,
  filterSlashCommands,
  findActiveSlashQuery,
  matchesGCQuery,
  matchesWordyIntent,
  parseGCCommand,
  parseSlashCommand,
  matchesPollIntent,
  type SlashCommandDef,
} from '../lib/gcCommand';
import {
  invokeGCAI,
  aiErrorMessage,
  type PollDraftResult,
} from '../lib/ai';
import { SlashCommandSuggestions } from '../components/SlashCommandSuggestions';
import { describeMedia } from '../lib/media';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { markGroupRead } from '../lib/readState';
import { setActiveGroup } from '../lib/push';
import { useIsDesktopWeb } from '../hooks/useResponsiveLayout';
import { PollComposer } from '../components/PollComposer';
import { usePolls } from '../hooks/usePolls';
import { createPoll, type PollDraft } from '../lib/polls';
import { dayLabel } from '../utils/time';
import { successFeedback, warningFeedback } from '../utils/haptics';
import {
  EVERYONE_TOKEN,
  deriveMentionsFromText,
  filterMembersForQuery,
  findActiveMentionQuery,
  insertMentionToken,
} from '../lib/mentions';
import {
  downloadMediaToDevice,
  pickDocument,
  pickFromCamera,
  pickFromLibrary,
  type PendingAttachment,
  type PickResult,
} from '../lib/media';
import {
  SAVED_PILL_DURATION_MS,
  getDownloadedIds,
  markDownloaded,
} from '../lib/downloadedMedia';
import { uploadMessageMedia } from '../lib/uploadMessageMedia';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { GroupMember, Mention, Message, MessageMedia } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

/** A message earns 🏆 only if it's clearly ahead — a lone 1-react message
 *  isn't "message of the day", it's just a message. */
const MOTD_MIN_REACTIONS = 3;

/** Lets the web fallback locate the divider to scroll to. */
const UNREAD_DIVIDER_ID = 'gc-unread-divider';

const CHAT_BG = require('../../assets/ChatBG.png');

export default function ChatScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isDesktopWeb = useIsDesktopWeb();
  const { groupId } = route.params;
  const { profile, session } = useAuth();
  const {
    messages,
    loading,
    hasMore,
    loadingMore,
    fetchOlderMessages,
    loadUntilMessage,
    sendMessage,
    editMessage,
    deleteMessage,
    hideMessage,
    clearChatForMe,
    reloadMessages,
    markMediaViewed,
    toggleReaction,
  } = useMessages(groupId, {
    initialLimit: (route.params.unreadCount ?? 0) > 0 ? (route.params.unreadCount ?? 0) + 15 : undefined,
  });
  const { members: groupMembers } = useGroupMembers(groupId);
  const { typingNames, notifyTyping } = useTyping(
    groupId,
    session?.user.id ?? '',
    profile?.display_name ?? 'someone'
  );
  const elevenEleven = useElevenEleven();
  const {
    recap: dailyRecap,
    showInline: showDailyRecapInline,
    boundary: dailyRecapBoundary,
  } = useDailyRecap(groupId);
  const [dailyRecapOpen, setDailyRecapOpen] = useState(false);
  const gcCommands = useGCCommands(groupId);

  const keyboard = useAnimatedKeyboard();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  // The web half of the same signal — RN's Keyboard events never fire there.
  const webKeyboardOpen = useWebKeyboardOpen();
  const keyboardOpen = isKeyboardOpen || webKeyboardOpen;

  useEffect(() => {
    const onShow = () => {
      setIsKeyboardOpen(true);
      if (!showScrollDownRef.current) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
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
      }
    );

    return () => {
      showSub1.remove();
      showSub2.remove();
      hideSub.remove();
    };
  }, [messages.length]);

  const animatedComposerStyle = useAnimatedStyle(() => {
    if (Platform.OS === 'android') {
      const kbHeight = keyboard.height.value;
      return {
        paddingBottom: kbHeight > 0 ? kbHeight : Math.max(insets.bottom, spacing.xs),
      };
    }
    return {
      paddingBottom: keyboardOpen ? spacing.xs : Math.max(insets.bottom, spacing.xs),
    };
  }, [keyboardOpen, insets.bottom]);

  const isFocused = useIsFocused();
  const flatListRef = useRef<FlatList>(null);
  const initialScrollDone = useRef(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const showScrollDownRef = useRef(false);

  // How many messages were unread when this screen opened.
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
    // If openedWithUnread exceeded the count of loaded messages from others,
    // point to the oldest loaded message so the divider still renders and positions.
    return seen > 0 ? 0 : -1;
  }, [messages, openedWithUnread]);

  const unreadCount = firstUnreadIndex >= 0 ? openedWithUnread : 0;
  const firstUnreadId =
    unreadCount > 0 && firstUnreadIndex >= 0 ? messages[firstUnreadIndex]?.id : null;

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // The recap, as a message-shaped entry sorted into its real chronological
  // slot (right after midnight) rather than pinned to either end — that's
  // what makes it scroll and age out of view exactly like a real message
  // instead of behaving like a fixed header. Built fresh each time `messages`
  // changes so its position among genuinely new arrivals stays correct.
  const dailyRecapItem: Message | null = useMemo(() => {
    if (!showDailyRecapInline || !dailyRecap || !dailyRecapBoundary) return null;
    return {
      id: `daily-recap-${groupId}-${dailyRecap.date}`,
      groupId,
      authorId: null,
      authorName: 'GC AI',
      authorColor: colors.tertiary,
      text: '',
      kind: 'text',
      // The exact local-midnight boundary the recap covers up to — sorts it
      // as if sent the moment the day ended, after everything from that day
      // and before anything from today.
      createdAt: dailyRecapBoundary,
      mentions: [],
      mentionEveryone: false,
      media: null,
      reactions: [],
      isMine: false,
      isDailyRecapCard: true,
      dailyRecapData: dailyRecap,
    };
  }, [showDailyRecapInline, dailyRecap, dailyRecapBoundary, groupId]);

  // @gc exchanges, shaped as feed entries. Local to this session — they were
  // never sent to the group, so they exist only here (see useGCCommands).
  const gcCommandItems: Message[] = useMemo(
    () =>
      gcCommands.entries.map((entry) => ({
        id: entry.id,
        groupId,
        authorId: null,
        authorName: 'GC AI',
        authorColor: colors.primary,
        text: '',
        kind: 'text' as const,
        createdAt: entry.createdAt,
        mentions: [],
        mentionEveryone: false,
        media: null,
        reactions: [],
        isMine: false,
        gcCommandEntry: entry,
      })),
    [gcCommands.entries, groupId]
  );

  const invertedMessages = useMemo(() => {
    const extras = [...gcCommandItems, ...(dailyRecapItem ? [dailyRecapItem] : [])];
    if (extras.length === 0) return [...messages].reverse();
    const merged = [...messages, ...extras].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return merged.reverse();
  }, [messages, dailyRecapItem, gcCommandItems]);

  // Scroll to unread divider on initial open if there are unread messages.
  // Looked up by id rather than derived arithmetically — `invertedMessages`
  // is not always a plain reversal of `messages` (the recap card can sit
  // between them), so an index computed from `messages.length` alone would
  // land one short whenever the card falls before the unread boundary.
  useEffect(() => {
    if (loading || messages.length === 0) return;
    if (initialScrollDone.current) return;

    if (firstUnreadId) {
      const invIndex = invertedMessages.findIndex((m) => m.id === firstUnreadId);
      if (invIndex > 0) {
        initialScrollDone.current = true;

        const performScroll = () => {
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            const el =
              document.getElementById(UNREAD_DIVIDER_ID) ||
              document.getElementById(`msg-${firstUnreadId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'auto', block: 'center' });
              return;
            }
          }

          try {
            flatListRef.current?.scrollToIndex({
              index: invIndex,
              viewPosition: 0.3,
              animated: false,
            });
          } catch {
            // onScrollToIndexFailed handles measuring fallback
          }
        };

        requestAnimationFrame(performScroll);
        setTimeout(performScroll, 50);
        setTimeout(performScroll, 200);
      }
    }
  }, [loading, messages.length, firstUnreadId, invertedMessages]);

  useEffect(() => {
    initialScrollDone.current = false;
  }, [groupId]);

  const readers = useReadReceipts(groupId, session?.user.id);
  const readersByMessage = useReadersByMessage(messages, readers);

  // Which of this device's messages have already been saved — purely local,
  // loaded once so the "Saved" pill survives navigating away and back.
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    getDownloadedIds().then(setDownloadedIds);
  }, []);
  const { pins, pin: pinMessage, unpin: unpinMessage } = usePinnedMessages(groupId);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.messageId)), [pins]);
  const bannerPins = useMemo(() => {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    return pins.filter((p) => now - new Date(p.pinnedAt).getTime() <= TWENTY_FOUR_HOURS);
  }, [pins]);

  const [groupInfo, setGroupInfo] = useState<{
    name: string;
    emoji: string;
    memberCount: number;
    theme: string | null;
  } | null>(null);
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const canModerate = myRole === 'owner' || myRole === 'admin';

  const tea = useTeaSession(groupId, { userId: session?.user.id, canModerate });
  const [teaInfoOpen, setTeaInfoOpen] = useState(false);
  const [teaReportOpen, setTeaReportOpen] = useState(false);
  const [teaReportSession, setTeaReportSession] = useState<TeaSession | null>(null);

  const weeklyAwards = useWeeklyAwards(groupId);
  const [awardsOpen, setAwardsOpen] = useState(false);

  const { theme: personalTheme } = usePersonalGroupTheme(groupId, groupInfo?.theme);

  // Tea swaps the whole chat's accent by swapping this one object — every
  // themed component downstream already reads from it, so nothing else has to
  // know Tea Mode exists. When not in Tea, each member views their personal chat theme.
  const theme = useMemo(
    () => (tea.isActive ? TEA_THEME : personalTheme),
    [tea.isActive, personalTheme]
  );
  const [draft, setDraft] = useState('');
  const [pickerForMessage, setPickerForMessage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Enter-to-send on desktop web.
  //
  // A document-level keydown listener that identifies the composer by its
  // placeholder, rather than TextInput's onKeyPress or a ref-attached
  // listener. Both were tried and neither fired: react-native-web's synthetic
  // onKeyPress doesn't emit for Enter on a multiline input, and the TextInput
  // ref is RNW's hybrid handle (focus/blur/measure), not reliably the
  // underlying <textarea>, so addEventListener on it silently no-ops.
  //
  // Gated on isDesktopWeb, not Platform.OS === 'web': a phone browser has an
  // on-screen keyboard whose return key should still insert a line break,
  // exactly like the native app.
  //
  // handleSend is reached through a ref so this binds once rather than
  // re-attaching on every keystroke (handleSend closes over `draft`).
  const handleSendRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!isDesktopWeb || typeof document === 'undefined') return;

    const COMPOSER_PLACEHOLDERS = ['Cook Something...', 'Edit your message...'];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      // IME composition: Enter is committing a candidate, not sending.
      if (e.isComposing) return;

      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== 'TEXTAREA') return;
      const placeholder = target.getAttribute('placeholder') ?? '';
      if (!COMPOSER_PLACEHOLDERS.includes(placeholder)) return;

      e.preventDefault();
      handleSendRef.current();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isDesktopWeb]);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageActionAnchor | null>(null);

  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [composerFocused, setComposerFocused] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState<Map<string, Mention>>(new Map());
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [stickerCreatorVisible, setStickerCreatorVisible] = useState(false);
  const [pollComposerVisible, setPollComposerVisible] = useState(false);
  // Pre-fills the composer when @gc drafted the poll. Null for a blank one.
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [draftingPoll, setDraftingPoll] = useState(false);
  const { polls, myVotes: myPollVotes, vote: votePoll } = usePolls(groupId);
  const { favoriteIds: favoriteStickerIds, toggleFavorite: toggleStickerFavorite } = useStickers();
  const pendingPickerRef = useRef<(() => Promise<PickResult | null>) | null>(null);
  const pickerLaunchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [pendingViewOnce, setPendingViewOnce] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [viewingMessage, setViewingMessage] = useState<Message | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const [emptyText] = useState(() => pick(copy.emptyChat));
  const [loadingText] = useState(() => pick(copy.loading));

  const motdId = useMemo(() => {
    let bestId: string | null = null;
    let bestCount = MOTD_MIN_REACTIONS - 1;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    for (const m of messages) {
      const createdAtTime = new Date(m.createdAt).getTime();
      if (createdAtTime < startOfToday) continue; // Resets after 12:00 AM midnight

      const total = m.reactions.reduce((sum, r) => sum + r.count, 0);
      if (total > bestCount) {
        bestCount = total;
        bestId = m.id;
      }
    }
    return bestId;
  }, [messages]);

  const loadGroup = useCallback(async () => {
    if (!groupId) return;
    const [{ data: group }, { count }] = await Promise.all([
      supabase.from('groups').select('name, emoji, theme').eq('id', groupId).single(),
      supabase
        .from('group_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('group_id', groupId),
    ]);
    if (group) {
      setGroupInfo({
        name: group.name,
        emoji: group.emoji,
        memberCount: count ?? 0,
        theme: group.theme,
      });
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();

    // Subscribe to realtime updates on this group row (theme, name, emoji changes)
    const channelId = `group-info-${groupId}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
        (payload) => {
          if (payload.new) {
            setGroupInfo((prev) =>
              prev
                ? {
                  ...prev,
                  name: payload.new.name ?? prev.name,
                  emoji: payload.new.emoji ?? prev.emoji,
                  theme: payload.new.theme ?? prev.theme,
                }
                : null
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, loadGroup]);

  // Re-fetch group info & messages whenever ChatScreen gains focus (e.g. popping back from GroupInfoScreen)
  useFocusEffect(
    useCallback(() => {
      loadGroup();
      tea.refresh();
      reloadMessages();
    }, [loadGroup, tea.refresh, reloadMessages])
  );

  // A push banner for the conversation already open on screen is noise — the
  // message is arriving live in the transcript behind it. Cleared on blur so
  // leaving the chat restores normal delivery.
  useFocusEffect(
    useCallback(() => {
      setActiveGroup(groupId);
      return () => setActiveGroup(null);
    }, [groupId])
  );

  const confirmClearChat = useCallback(() => {
    const title = 'Clear this chat?';
    const message =
      'Messages in this chat will be cleared for you only. Other members will still see them.';
    const go = async () => {
      warningFeedback();
      const { error } = await clearChatForMe();
      if (error) {
        Alert.alert('Error', error);
      } else {
        successFeedback();
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) go();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear for Me', style: 'destructive', onPress: go },
    ]);
  }, [clearChatForMe]);

  // Refreshed every render so the keydown listener above always calls the
  // current closure (handleSend captures `draft`).
  handleSendRef.current = () => { void handleSend(); };

  async function handleSend() {
    if (uploading) return;
    if (!draft.trim() && !pendingAttachment) return;

    // @gc is intercepted before anything else: it never becomes a group
    // message, so none of the send paths below should see it. Editing is
    // excluded because an edit targets an existing real message — there is
    // nothing to reroute.
    // Checked before @gc and before anything is sent: a slash command is a
    // navigation, not a message, so it must never reach the transcript.
    const slash = editingMessage ? null : parseSlashCommand(draft);
    if (slash) {
      setDraft('');
      switch (slash.feature) {
        case 'wordy':
          navigation.navigate('Wordy', { groupId });
          break;
        case 'poll':
          openPollComposer(null);
          break;
        case 'missed':
          navigation.navigate('WhatDidIMiss', { groupId, groupName: groupInfo?.name });
          break;
        case 'dna':
          navigation.navigate('GCDNA', { groupId, groupName: groupInfo?.name });
          break;
        case 'tea':
          confirmStartTea();
          break;
        case 'awards':
          (navigation as any).navigate('MainTabs', { screen: 'Explore' });
          break;
        case 'pinned':
          navigation.navigate('PinnedMessages', { groupId });
          break;
        case 'media':
          navigation.navigate('MediaLinksFiles', { groupId });
          break;
        case 'clear':
          confirmClearChat();
          break;
      }
      return;
    }

    const gcCommand = editingMessage ? null : parseGCCommand(draft);
    // "@gc wordy" is a navigation, not a question. Handled before the AI
    // call so it costs nothing — and so the model is never asked to play,
    // which it would happily fake a board for.
    if (gcCommand && matchesWordyIntent(gcCommand.question)) {
      setDraft('');
      setReplyTo(null);
      navigation.navigate('Wordy', { groupId });
      return;
    }
    // "@gc make a poll ..." drafts rather than answers. The draft opens in
    // the normal poll editor and is created by the normal poll API only once
    // the user presses send — the AI never posts to the group itself.
    if (gcCommand && matchesPollIntent(gcCommand.question)) {
      const request = gcCommand.question;
      setDraft('');
      setDraftingPoll(true);
      const response = await invokeGCAI<PollDraftResult>(groupId, 'poll_draft', { request });
      setDraftingPoll(false);

      if (!response.ok) {
        Alert.alert('GC AI', aiErrorMessage(response.error));
        return;
      }
      if (response.result.needsClarification) {
        // Opening an empty editor beats inventing a poll nobody asked for.
        Alert.alert('Need a bit more', response.result.clarification);
        openPollComposer(null);
        return;
      }
      openPollComposer({
        question: response.result.question,
        options: response.result.options,
        allowMultiple: response.result.allowMultiple,
        anonymous: false,
      });
      return;
    }

    if (gcCommand) {
      // Swiping to reply and then asking @gc means "about this message" — the
      // reply is the subject, so it anchors the context server-side instead
      // of being dropped along with the unsent draft.
      const gcReplyTo = replyTo
        ? {
            id: replyTo.id,
            authorName: replyTo.authorName,
            preview: replyTo.text || describeMedia(replyTo.media?.type ?? 'file').label,
          }
        : undefined;

      // A bare "@gc" on its own is nothing to ask — unless it's replying to
      // something, in which case pointing at a message and saying nothing
      // clearly means "explain this one".
      const question = gcCommand.question || (gcReplyTo ? 'explain this message' : '');
      if (!question) return;

      gcCommands.ask(question, gcReplyTo);
      setDraft('');
      setMentionCandidates(new Map());
      setSelection(undefined);
      setReplyTo(null);
      // Jump to the newest entry the same way sending a message does.
      requestAnimationFrame(() =>
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
      );
      return;
    }

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
      setUploadProgress(0);
      setAttachError(null);
      const { url, thumbUrl, error } = await uploadMessageMedia(
        groupId,
        pendingAttachment,
        setUploadProgress
      );
      setUploading(false);
      if (!url) {
        setAttachError(error ?? 'Upload failed — try again.');
        return; // keep draft + attachment so the user can just retry
      }
      const media: MessageMedia = {
        url,
        thumbUrl,
        type: pendingAttachment.type,
        mime: pendingAttachment.mime,
        name: pendingAttachment.name,
        size: pendingAttachment.size,
        width: pendingAttachment.width,
        height: pendingAttachment.height,
        durationMs: pendingAttachment.durationMs,
        viewOnce: pendingViewOnce,
      };
      sendMessage(draft, replyTo?.id ?? null, mentions, mentionEveryone, media);
      setPendingAttachment(null);
      setPendingViewOnce(false);
    } else {
      sendMessage(draft, replyTo?.id ?? null, mentions, mentionEveryone);
    }

    setReplyTo(null);
    setDraft('');
    setMentionCandidates(new Map());
    setSelection(undefined);
  }

  const sendMediaDirectly = useCallback(async (attachment: PendingAttachment) => {
    setUploading(true);
    setUploadProgress(0);
    setAttachError(null);
    const { url, thumbUrl, error } = await uploadMessageMedia(
      groupId,
      attachment,
      setUploadProgress
    );
    setUploading(false);
    if (!url) {
      setAttachError(error ?? 'Upload failed — try again.');
      return;
    }
    const media: MessageMedia = {
      url,
      thumbUrl,
      type: attachment.type,
      mime: attachment.mime,
      name: attachment.name,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
      durationMs: attachment.durationMs,
      viewOnce: false,
    };
    sendMessage('', replyTo?.id ?? null, [], false, media);
    setReplyTo(null);
  }, [groupId, replyTo, sendMessage]);

  const canSend = draft.trim().length > 0 || !!pendingAttachment;

  function openAttachmentSheet() {
    if (editingMessage) return; // can't add media to an edit
    setAttachmentSheetVisible(true);
  }

  function openGifPicker() {
    setAttachmentSheetVisible(false);
    setGifPickerVisible(true);
  }

  /**
   * A GIF never goes through the upload pipeline — it's already hosted on
   * Giphy's CDN, so this skips straight to the same insert every other media
   * message ends at, reusing the current draft as caption and the same
   * post-send cleanup `handleSend` does for its own media branch.
   */
  function sendGif(gif: GifResult) {
    setGifPickerVisible(false);

    const { mentions, mentionEveryone } = deriveMentionsFromText(draft, [
      ...mentionCandidates.values(),
    ]);

    sendMessage(draft, replyTo?.id ?? null, mentions, mentionEveryone, {
      url: gif.url,
      type: 'gif',
      mime: 'image/gif',
      name: null,
      size: gif.size,
      width: gif.width,
      height: gif.height,
      durationMs: null,
    });

    setReplyTo(null);
    setDraft('');
    setMentionCandidates(new Map());
    setSelection(undefined);
  }

  function openStickerPicker() {
    setAttachmentSheetVisible(false);
    setStickerPickerVisible(true);
  }

  /** Closes the tray before opening the creator — never both at once. Two
   *  RN `Modal`s presented simultaneously (the creator used to be nested
   *  inside the tray's own Modal) froze touch handling entirely. */
  function openStickerCreator() {
    setStickerPickerVisible(false);
    setStickerCreatorVisible(true);
  }

  /** Opens the poll editor. Closes the attachment sheet first — two RN
   *  Modals presented at once freeze touch handling, the same trap the
   *  sticker creator hit. */
  function openPollComposer(draft: PollDraft | null = null) {
    setAttachmentSheetVisible(false);
    setPollDraft(draft);
    setPollComposerVisible(true);
  }

  /**
   * Creates the poll, then the message that carries it.
   *
   * Order matters: the poll must exist before the message can point at it.
   * Both creation routes (📊 button and @gc draft) land here, so an AI poll
   * is created by exactly the same code as a hand-made one.
   */
  async function handleCreatePoll(draft: PollDraft) {
    if (creatingPoll) return;
    setCreatingPoll(true);
    try {
      const { poll, error } = await createPoll(groupId, session?.user.id ?? '', draft);
      if (!poll) {
        Alert.alert("Couldn't create the poll", error ?? 'Try again.');
        return;
      }

      await sendMessage(
        '',
        replyTo?.id ?? null,
        [],
        false,
        null,
        null,
        null,
        poll.id
      );
      setReplyTo(null);
      setPollComposerVisible(false);
      setPollDraft(null);
      // polls.message_id is filled by the messages_link_poll trigger. Doing
      // it here would race: the message is inserted, then arrives back over
      // realtime, so there is nothing to find yet at this point.
    } finally {
      setCreatingPoll(false);
    }
  }

  /** Same shape as sendGif — a sticker is already a saved, hosted image
   *  (rendered once at creation time), so this points a message straight at
   *  it rather than going through the upload pipeline. */
  function sendSticker(sticker: Sticker) {
    setStickerPickerVisible(false);

    const { mentions, mentionEveryone } = deriveMentionsFromText(draft, [
      ...mentionCandidates.values(),
    ]);

    sendMessage(
      draft,
      replyTo?.id ?? null,
      mentions,
      mentionEveryone,
      {
        url: sticker.imageUrl,
        type: 'sticker',
        // Read off the URL rather than hardcoded: the renderer switched from
        // PNG to JPEG (PNG's deflate pass was the bulk of the render cost),
        // and stickers made before that switch are still PNGs.
        mime: sticker.imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg',
        name: null,
        size: null,
        width: sticker.width,
        height: sticker.height,
        durationMs: null,
      },
      null,
      sticker.id
    );

    setReplyTo(null);
    setDraft('');
    setMentionCandidates(new Map());
    setSelection(undefined);
  }

  /** Starting Tea changes the room for everyone, so it never happens on one
   *  stray tap — same two-step the destructive actions use. */
  function confirmStartTea() {
    setAttachmentSheetVisible(false);
    const title = '🍵 Start Tea?';
    const body =
      'Start a tea session in this GC. Everything said during the session will be included in the Tea Report.';

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${body}`)) tea.startTea();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start Tea', onPress: () => tea.startTea() },
    ]);
  }

  function confirmEndTea() {
    setTeaInfoOpen(false);
    const title = '🍵 End the tea?';
    const body =
      'GC will close this Tea session and generate a Tea Report from the conversation.';

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${body}`)) tea.endTea();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Tea', style: 'destructive', onPress: () => tea.endTea() },
    ]);
  }

  /** The banner means different things at different points in the lifecycle:
   *  live Tea opens the info sheet, a finished one opens its report. */
  function handleTeaBannerPress() {
    if (tea.isActive) {
      setTeaInfoOpen(true);
    } else {
      if (tea.session) setTeaReportSession(tea.session);
      setTeaReportOpen(true);
    }
  }

  /**
   * Picking is a two-step dance on purpose. Opening a native picker (or the
   * permission prompt that precedes it) while the attachment sheet is still
   * animating away makes iOS refuse the presentation: the picker never shows
   * and its promise never settles, so the app looks frozen. So we only record
   * *which* picker was chosen, close the sheet, and wait for the modal to
   * report that it's fully gone before touching anything native.
   */
  function choosePicker(picker: () => Promise<PickResult | null>) {
    pendingPickerRef.current = picker;
    setAttachmentSheetVisible(false);
    if (pickerLaunchTimer.current) clearTimeout(pickerLaunchTimer.current);
    // Always schedule a fallback timer so iOS never gets stuck waiting for Modal.onDismiss
    pickerLaunchTimer.current = setTimeout(launchPendingPicker, Platform.OS === 'ios' ? 150 : 50);
  }

  useEffect(
    () => () => {
      if (pickerLaunchTimer.current) clearTimeout(pickerLaunchTimer.current);
    },
    []
  );

  function launchPendingPicker() {
    if (pickerLaunchTimer.current) {
      clearTimeout(pickerLaunchTimer.current);
      pickerLaunchTimer.current = null;
    }
    const picker = pendingPickerRef.current;
    pendingPickerRef.current = null;
    // Nothing pending means the sheet was dismissed by tapping outside.
    if (picker) handlePicked(picker);
  }

  async function handlePicked(picker: () => Promise<PickResult | null>) {
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
    if (Platform.OS === 'web' && message.media.viewOnce) {
      Alert.alert(
        'Open in Mobile App 🔒',
        'View-once photos and videos can only be opened on the GC mobile app to protect privacy and prevent screenshots.'
      );
      return;
    }
    setViewingMessage(message);
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

  // The /slash command query currently under cursor, if any
  const activeSlashQuery = useMemo(
    () => (composerFocused ? findActiveSlashQuery(draft, selection?.start ?? draft.length) : null),
    [composerFocused, draft, selection]
  );

  const slashMatches = useMemo(
    () => (activeSlashQuery ? filterSlashCommands(activeSlashQuery.query) : []),
    [activeSlashQuery]
  );

  const handleSelectSlashCommand = useCallback(
    (cmd: SlashCommandDef) => {
      setDraft('');
      if (inputRef.current) inputRef.current.blur();

      switch (cmd.feature) {
        case 'wordy':
          navigation.navigate('Wordy', { groupId });
          break;
        case 'poll':
          openPollComposer(null);
          break;
        case 'missed':
          navigation.navigate('WhatDidIMiss', { groupId, groupName: groupInfo?.name });
          break;
        case 'dna':
          navigation.navigate('GCDNA', { groupId, groupName: groupInfo?.name });
          break;
        case 'tea':
          confirmStartTea();
          break;
        case 'awards':
          (navigation as any).navigate('MainTabs', { screen: 'Explore' });
          break;
        case 'pinned':
          navigation.navigate('PinnedMessages', { groupId });
          break;
        case 'media':
          navigation.navigate('MediaLinksFiles', { groupId });
          break;
        case 'clear':
          confirmClearChat();
          break;
      }
    },
    [groupId, groupInfo?.name, navigation, confirmStartTea, confirmClearChat]
  );

  const showEveryoneOption = !!(
    activeMentionQuery &&
    EVERYONE_TOKEN.startsWith(activeMentionQuery.query.toLowerCase())
  );

  // GC gets a row in the same picker, but is not a member: selecting it
  // inserts a plain token and records no mention candidate, so it can never
  // be resolved into a user id or notify anyone.
  const showGCOption = !!(activeMentionQuery && matchesGCQuery(activeMentionQuery.query));

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

  // No candidate passed: @gc is not a member, so deriveMentionsFromText must
  // never turn it into a mention.
  const selectMentionGC = useCallback(
    () => applyMentionInsert(GC_TOKEN),
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

  const downloadCurrentTarget = useCallback(async (message: Message) => {
    setActionTarget(null);
    setActionAnchor(null);
    if (!message.media?.url) return;
    const { error } = await downloadMediaToDevice(message.media.url);
    if (error) {
      Alert.alert("Couldn't save", error);
      return;
    }
    const updated = await markDownloaded(message.id);
    setDownloadedIds(updated);

    // Auto-dismiss the "Saved" pill after 30 seconds
    setTimeout(() => {
      setDownloadedIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }, SAVED_PILL_DURATION_MS);
  }, []);

  const pinCurrentTarget = useCallback(
    (message: Message) => {
      setActionTarget(null);
      setActionAnchor(null);
      if (!session?.user.id) return;
      pinMessage(message.id, session.user.id);
    },
    [pinMessage, session?.user.id]
  );

  const unpinCurrentTarget = useCallback(
    (message: Message) => {
      setActionTarget(null);
      setActionAnchor(null);
      unpinMessage(message.id);
    },
    [unpinMessage]
  );

  const confirmDeleteForEveryone = useCallback(
    (message: Message) => {
      setActionTarget(null);
      setActionAnchor(null);
      const go = () => {
        warningFeedback();
        deleteMessage(message.id);
      };
      // Deleting someone else's message is a moderator action, so say so
      // rather than letting it read like deleting your own.
      const body = message.isMine
        ? 'This removes it for everyone in the GC.'
        : `This removes ${message.authorName}'s message for everyone, and the GC will see it was deleted by an admin.`;
      if (Platform.OS === 'web') {
        if (window.confirm(`Delete for everyone? ${body}`)) go();
        return;
      }
      Alert.alert('Delete for everyone?', body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    },
    [deleteMessage]
  );

  /** A hide that didn't stick puts the message straight back on screen, which
   *  looks like the tap did nothing. Say what happened instead. */
  const notifyHideFailed = useCallback((reason: string) => {
    const body = `Couldn't hide that message — ${reason}`;
    if (Platform.OS === 'web') window.alert(body);
    else Alert.alert('Delete for me failed', body);
  }, []);

  const confirmDeleteForMe = useCallback(
    (message: Message) => {
      setActionTarget(null);
      setActionAnchor(null);
      const go = async () => {
        warningFeedback();
        const { error } = await hideMessage(message.id);
        if (error) notifyHideFailed(error);
      };
      const body = 'It stays visible for everyone else in the GC.';
      if (Platform.OS === 'web') {
        if (window.confirm(`Delete for me? ${body}`)) go();
        return;
      }
      Alert.alert('Delete for me?', body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    },
    [hideMessage, notifyHideFailed]
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

  const deleteSelectedForEveryone = useCallback(() => {
    const chosen = messages.filter((m) => selectedIds.has(m.id) && !m.isDeleted);
    if (chosen.length === 0) return;
    const go = () => {
      warningFeedback();
      chosen.forEach((m) => deleteMessage(m.id));
      exitSelectMode();
    };
    const title = `Delete ${chosen.length} message${chosen.length === 1 ? '' : 's'} for everyone?`;
    const body = 'This cannot be undone.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title} ${body}`)) go();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  }, [messages, selectedIds, deleteMessage, exitSelectMode]);

  const deleteSelectedForMe = useCallback(() => {
    const chosen = messages.filter((m) => selectedIds.has(m.id));
    if (chosen.length === 0) return;
    const go = async () => {
      warningFeedback();
      exitSelectMode();
      const results = await Promise.all(chosen.map((m) => hideMessage(m.id)));
      // One message is enough — a failure here is almost always the same
      // cause for every row in the batch.
      const failure = results.find((r) => r.error);
      if (failure?.error) notifyHideFailed(failure.error);
    };
    const title = `Delete ${chosen.length} message${chosen.length === 1 ? '' : 's'} for me?`;
    const body = 'They stay visible for everyone else in the GC.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title} ${body}`)) go();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  }, [messages, selectedIds, hideMessage, exitSelectMode, notifyHideFailed]);

  const jumpToMessage = useCallback(
    async (id: string | undefined | null) => {
      if (!id) return;

      let index = invertedMessages.findIndex((m) => m.id === id);
      if (index < 0) {
        const loaded = await loadUntilMessage(id);
        if (!loaded) return;
        await new Promise((resolve) => setTimeout(resolve, 80));
        index = messagesRef.current.slice().reverse().findIndex((m) => m.id === id);
      }

      if (index >= 0) {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const el = document.getElementById(`msg-${id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        const doScroll = () => {
          try {
            flatListRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true });
          } catch {}
        };
        doScroll();
        setTimeout(doScroll, 120);
        setTimeout(doScroll, 300);

        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        setHighlightedId(id);
        highlightTimer.current = setTimeout(() => setHighlightedId(null), 2500);
      }
    },
    [invertedMessages, loadUntilMessage]
  );

  useEffect(() => {
    const jumpId = route.params.jumpToMessageId;
    if (!jumpId || loading) return;
    navigation.setParams({ jumpToMessageId: undefined });
    const timer = setTimeout(() => {
      jumpToMessage(jumpId);
    }, 150);
    return () => clearTimeout(timer);
  }, [route.params.jumpToMessageId, loading, jumpToMessage, navigation]);

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

  // Which source message each @gc answer is currently pointing at. Tapping
  // "View N messages" walks through them one per tap and wraps — the same
  // advance-on-tap pattern PinnedBanner already uses for multiple pins,
  // rather than a second navigation UI.
  const gcSourceCursor = useRef(new Map<string, number>());

  // Which @gc answers this member has already posted into the chat. Local to
  // the session, like the entries themselves — it only guards the button from
  // being tapped twice, and the shared message itself is the real record.
  const [sharedGCEntryIds, setSharedGCEntryIds] = useState<Set<string>>(new Set());

  /**
   * Posts an @gc exchange into the group as a real message.
   *
   * Sent as an ordinary message carrying the AI payload, with the original
   * reply preserved as a real `reply_to_message_id` — so the existing reply
   * system renders the quoted message and no second linking mechanism is
   * needed. `text` holds a readable fallback so group-list previews, search
   * and notifications keep working without special-casing.
   */
  const handleSendGCToChat = useCallback(
    (entry: GCCommandEntry) => {
      if (!entry.result || sharedGCEntryIds.has(entry.id)) return;

      sendMessage(
        `🤖 ${entry.question} — ${entry.result.text}`,
        entry.replyTo?.id ?? null,
        [],
        false,
        null,
        {
          question: entry.question,
          answer: entry.result.text,
          sourceMessageIds: entry.result.sourceMessageIds,
        }
      );

      setSharedGCEntryIds((prev) => new Set(prev).add(entry.id));
      requestAnimationFrame(() =>
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
      );
    },
    [sendMessage, sharedGCEntryIds]
  );

  const handleViewGCSources = useCallback(
    (entry: GCCommandEntry) => {
      const ids = entry.result?.sourceMessageIds ?? [];
      if (ids.length === 0) return;
      const at = gcSourceCursor.current.get(entry.id) ?? 0;
      gcSourceCursor.current.set(entry.id, (at + 1) % ids.length);
      jumpToMessage(ids[at % ids.length]);
    },
    [jumpToMessage]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const olderMsg = index < invertedMessages.length - 1 ? invertedMessages[index + 1] : null;
      const newerMsg = index > 0 ? invertedMessages[index - 1] : null;

      const newDay = !olderMsg || dayLabel(olderMsg.createdAt) !== dayLabel(item.createdAt);
      const showAuthor = newDay || !olderMsg || olderMsg.authorId !== item.authorId;

      const nextIsNewDay = newerMsg ? dayLabel(item.createdAt) !== dayLabel(newerMsg.createdAt) : true;
      const showAvatar = nextIsNewDay || !newerMsg || newerMsg.authorId !== item.authorId;

      const isFollowedWithinOneMin =
        newerMsg &&
        newerMsg.authorId === item.authorId &&
        new Date(newerMsg.createdAt).getTime() - new Date(item.createdAt).getTime() < 60000;
      const showTimestamp = !isFollowedWithinOneMin;

      const isFirstUnread = item.id === firstUnreadId;

      // An @gc exchange. Like the recap card it's a real array entry so it
      // scrolls with the conversation, but it never went through Supabase and
      // has none of the state MessageBubble expects.
      if (item.gcCommandEntry) {
        return (
          <View nativeID={`msg-${item.id}`}>
            {newDay && (
              <View style={styles.dayRow}>
                <Chip style={styles.dayChip}>
                  <Text style={styles.dayText}>{dayLabel(item.createdAt)}</Text>
                </Chip>
              </View>
            )}
            <GCAIMessage
              entry={item.gcCommandEntry}
              accent={theme.accent}
              onViewSources={handleViewGCSources}
              onJumpToMessage={jumpToMessage}
              onRetry={gcCommands.retry}
              onSendToGC={handleSendGCToChat}
              shared={sharedGCEntryIds.has(item.gcCommandEntry.id)}
            />
          </View>
        );
      }

      // The recap card is a real entry in the array (so it scrolls and ages
      // like one), but it never went through Supabase — no reactions, no
      // reply state, none of what MessageBubble expects. Short-circuit before
      // any of that.
      if (item.isDailyRecapCard && item.dailyRecapData) {
        return (
          <View nativeID={`msg-${item.id}`}>
            {newDay && (
              <View style={styles.dayRow}>
                <Chip style={styles.dayChip}>
                  <Text style={styles.dayText}>{dayLabel(item.createdAt)}</Text>
                </Chip>
              </View>
            )}
            <DailyRecapMessageCard
              recap={item.dailyRecapData}
              themeGradient={theme.colors}
              onPress={() => setDailyRecapOpen(true)}
            />
          </View>
        );
      }

      return (
        <View nativeID={`msg-${item.id}`}>
          {newDay && (
            <View style={styles.dayRow}>
              <Chip style={styles.dayChip}>
                <Text style={styles.dayText}>{dayLabel(item.createdAt)}</Text>
              </Chip>
            </View>
          )}

          {isFirstUnread && unreadCount > 0 && (
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
            isPinned={pinnedIds.has(item.id)}
            showAuthor={showAuthor}
            showAvatar={showAvatar}
            showTimestamp={showTimestamp}
            readers={readersByMessage.get(item.id)}
            tint={theme}
            highlighted={item.id === highlightedId}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            downloaded={!!item.media?.url && downloadedIds.has(item.id)}
            poll={item.pollId ? polls.get(item.pollId) : undefined}
            myPollVotes={item.pollId ? myPollVotes.get(item.pollId) : undefined}
            onPollVote={votePoll}
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
        </View>
      );
    },
  [
    invertedMessages,
    firstUnreadId,
    unreadCount,
    theme,
    motdId,
    pinnedIds,
    readersByMessage,
    downloadedIds,
    polls,
    myPollVotes,
    votePoll,
    highlightedId,
    selectMode,
    selectedIds,
    handleLongPress,
    handleBubblePress,
    handleToggleReaction,
    handleSwipeReply,
    handleQuotePress,
    handleMentionPress,
    handleMediaPress,
    handleViewGCSources,
    gcCommands.retry,
    jumpToMessage,
    handleSendGCToChat,
    sharedGCEntryIds,
  ]
  );

  return (
    <View style={styles.root}>
      <Image
        source={CHAT_BG}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <AmbientBackground tint={theme.accent} hideBaseBackground />
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
                { backgroundColor: `${theme.accent}1A`, borderColor: `${theme.accent}4D` },
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
          </View>
        )}

        <ElevenElevenBanner
          isWishTime={elevenEleven.isWishTime}
          secondsRemaining={elevenEleven.secondsRemaining}
          isTimesUp={elevenEleven.isTimesUp}
          onPressWish={() => {
            setDraft('11:11 ✨ ');
            inputRef.current?.focus();
          }}
          onPressTimesUp={() => {
            navigation.navigate('WhatDidIMiss', {
              groupId,
              groupName: groupInfo?.name,
              focusSection: 'missedElevenEleven',
            });
          }}
          onDismissTimesUp={elevenEleven.dismissTimesUp}
        />

        <TeaBanner session={tea.session} onPress={handleTeaBannerPress} />

        <GCAwardsBanner result={weeklyAwards.thisWeek} onPress={() => setAwardsOpen(true)} />

        <PinnedBanner
          pins={bannerPins}
          accentColor={theme.accent}
          onPressPin={(pin) => jumpToMessage(pin.messageId)}
          onPressViewAll={() => navigation.navigate('PinnedMessages', { groupId })}
        />

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
                inverted
                data={invertedMessages}
                keyExtractor={(m) => m.id}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={Math.max(20, Math.min(100, (openedWithUnread ?? 0) + 10))}
                maxToRenderPerBatch={10}
                windowSize={7}
                updateCellsBatchingPeriod={40}
                removeClippedSubviews={Platform.OS === 'android'}
                onEndReached={() => {
                  if (hasMore && !loadingMore) {
                    fetchOlderMessages();
                  }
                }}
                onEndReachedThreshold={0.4}
                ListFooterComponent={
                  loadingMore ? (
                    <View style={styles.historyLoader}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={styles.historyLoaderText}>Loading earlier messages...</Text>
                    </View>
                  ) : null
                }
                onScroll={(e) => {
                  const y = e.nativeEvent.contentOffset.y;
                  const shouldShow = y > 300;
                  if (shouldShow !== showScrollDownRef.current) {
                    showScrollDownRef.current = shouldShow;
                    setShowScrollDown(shouldShow);
                  }
                }}
                scrollEventThrottle={32}
                onScrollToIndexFailed={({ index, highestMeasuredFrameIndex }) => {
                  flatListRef.current?.scrollToIndex({
                    index: Math.max(0, Math.min(index, highestMeasuredFrameIndex)),
                    animated: false,
                  });
                  setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                      index,
                      viewPosition: 0.35,
                      animated: false,
                    });
                  }, 50);
                }}
                renderItem={renderItem}
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
                    onPress={() => {
                      showScrollDownRef.current = false;
                      setShowScrollDown(false);
                      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                    }}
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
              animatedComposerStyle,
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
                      style={[styles.composerPreviewClose, { backgroundColor: `${theme.accent}26` }]}
                      onPress={() => {
                        setEditingMessage(null);
                        setDraft('');
                        setMentionCandidates(new Map());
                      }}
                    >
                      <Ionicons name="close" size={16} color={theme.accent} />
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
                <AttachmentPreview
                  attachment={pendingAttachment}
                  viewOnce={pendingViewOnce}
                  onToggleViewOnce={() => setPendingViewOnce((v) => !v)}
                  uploading={uploading}
                  progress={uploadProgress}
                  accentColor={theme.accent}
                  onRemove={() => {
                    setPendingAttachment(null);
                    setPendingViewOnce(false);
                  }}
                />
              </Animated.View>
            )}

            {attachError && (
              <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.attachErrorRow}>
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.attachErrorText}>{attachError}</Text>
              </Animated.View>
            )}

            <SlashCommandSuggestions
              visible={!!activeSlashQuery}
              commands={slashMatches}
              onSelect={handleSelectSlashCommand}
            />

            <MentionSuggestions
              visible={!!activeMentionQuery}
              members={mentionMatches}
              showEveryone={showEveryoneOption}
              showGC={showGCOption}
              accentColor={theme.accent}
              onSelectMember={selectMentionMember}
              onSelectEveryone={selectMentionEveryone}
              onSelectGC={selectMentionGC}
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

              {!isRecordingVoice && (
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
                placeholder={editingMessage ? 'Edit your message...' : 'Cook Something...'}
                placeholderTextColor={colors.outline}
                multiline
              />
              )}
              {isRecordingVoice && <View style={styles.input} />}

              {/* The mic takes the send button's place when there's nothing
                  to send — the same slot, so the composer never grows a
                  fourth control, and the swap itself signals which action is
                  live. Hidden while editing, where a voice note makes no
                  sense. */}
              {!canSend && !editingMessage ? (
                <VoiceRecorder
                  accentColor={theme.accent}
                  disabled={uploading}
                  uploading={uploading}
                  onRecorded={(attachment) => {
                    sendMediaDirectly(attachment);
                  }}
                  onError={setAttachError}
                  onRecordingChange={setIsRecordingVoice}
                />
              ) : (
                <Animated.View entering={FadeIn.duration(160).reduceMotion(reduceMotion)}>
                  <PressableScale
                    style={styles.sendWrap}
                    scaleTo={0.88}
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
                </Animated.View>
              )}
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
            <Ionicons name="copy-outline" size={16} color={colors.onSurface} />
            <Text style={styles.selectBarLabel} numberOfLines={1}>Copy</Text>
          </PressableScale>

          <PressableScale
            style={styles.selectBarButton}
            scaleTo={0.95}
            haptic="medium"
            onPress={deleteSelectedForMe}
          >
            <Ionicons name="eye-off-outline" size={16} color={colors.onSurface} />
            <Text style={styles.selectBarLabel} numberOfLines={1}>Delete for me</Text>
          </PressableScale>

          {[...selectedIds].every((id) => {
            const m = messages.find((msg) => msg.id === id);
            return m && canDeleteMessage(m) && !m.isDeleted;
          }) && (
              <PressableScale
                style={styles.selectBarButton}
                scaleTo={0.95}
                haptic="medium"
                onPress={deleteSelectedForEveryone}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[styles.selectBarLabel, { color: colors.error }]} numberOfLines={1}>Delete for all</Text>
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
            isPinned: pinnedIds.has(actionTarget.id),
            media: actionTarget.media,
            stickerId: actionTarget.stickerId,
            stickerFavorited: actionTarget.stickerId ? favoriteStickerIds.has(actionTarget.stickerId) : false,
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
        onDeleteForEveryone={() => actionTarget && confirmDeleteForEveryone(actionTarget)}
        onDeleteForMe={() => actionTarget && confirmDeleteForMe(actionTarget)}
        onSelect={() => actionTarget && enterSelectMode(actionTarget)}
        onDownload={() => actionTarget && downloadCurrentTarget(actionTarget)}
        onPin={() => actionTarget && pinCurrentTarget(actionTarget)}
        onUnpin={() => actionTarget && unpinCurrentTarget(actionTarget)}
        onToggleStickerFavorite={() => {
          if (actionTarget?.stickerId) toggleStickerFavorite(actionTarget.stickerId);
          setActionTarget(null);
          setActionAnchor(null);
        }}
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
        onCamera={() => choosePicker(pickFromCamera)}
        onLibrary={() => choosePicker(pickFromLibrary)}
        onDocument={() => choosePicker(pickDocument)}
        onGif={openGifPicker}
        onSticker={openStickerPicker}
        onPoll={() => openPollComposer(null)}
        onWordy={() => navigation.navigate('Wordy', { groupId })}
        onStartTea={confirmStartTea}
        teaActive={tea.isActive}
        onClose={() => setAttachmentSheetVisible(false)}
        onClosed={launchPendingPicker}
      />

      <GifPicker
        visible={gifPickerVisible}
        onClose={() => setGifPickerVisible(false)}
        onSelect={sendGif}
      />

      <StickerPicker
        visible={stickerPickerVisible}
        onClose={() => setStickerPickerVisible(false)}
        onSelect={sendSticker}
        onCreateNew={openStickerCreator}
      />

      <PollComposer
        visible={pollComposerVisible}
        initial={pollDraft}
        theme={theme}
        submitting={creatingPoll}
        onClose={() => {
          setPollComposerVisible(false);
          setPollDraft(null);
        }}
        onSubmit={handleCreatePoll}
      />

      <StickerCreator
        visible={stickerCreatorVisible}
        onClose={() => setStickerCreatorVisible(false)}
        onCreated={(sticker) => {
          setStickerCreatorVisible(false);
          sendSticker(sticker);
        }}
      />

      <MediaViewerModal
        media={viewingMessage?.media ?? null}
        onClose={() => {
          const target = viewingMessage;
          setViewingMessage(null);
          if (target?.media?.viewOnce && !target.media.viewed && !target.isMine) {
            markMediaViewed(target.id);
          }
        }}
        onReply={() => {
          const target = viewingMessage;
          setViewingMessage(null);
          if (target) startReply(target);
        }}
      />

      <DailyRecapModal
        visible={dailyRecapOpen}
        recap={dailyRecap}
        groupId={groupId}
        themeGradient={theme.colors}
        onClose={() => setDailyRecapOpen(false)}
        onJumpToMessage={jumpToMessage}
        onOpenWordy={() => navigation.navigate('Wordy', { groupId })}
      />

      <TeaInfoSheet
        visible={teaInfoOpen}
        session={tea.session}
        canEnd={tea.canEnd}
        onEndTea={confirmEndTea}
        onClose={() => setTeaInfoOpen(false)}
      />

      <TeaReportModal
        visible={teaReportOpen}
        session={tea.session ?? teaReportSession}
        onClose={() => setTeaReportOpen(false)}
        onJumpToMessage={jumpToMessage}
        onRetry={tea.retryReport}
      />

      <GCAwardsModal
        visible={awardsOpen}
        result={weeklyAwards.thisWeek}
        onClose={() => setAwardsOpen(false)}
        onJumpToMessage={jumpToMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, minHeight: 0 },
  flex: { flex: 1, minHeight: 0 },
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
    alignItems: 'center',
    gap: spacing.xs + 2,
    justifyContent: 'space-evenly',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(12, 12, 18, 0.96)',
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
  },
  selectBarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  selectBarLabel: { ...typography.bodyMedium, fontSize: 12, color: colors.onSurface },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  historyLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  historyLoaderText: {
    ...typography.micro,
    color: colors.outline,
  },
});
