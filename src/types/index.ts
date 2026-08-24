import type { DailyRecapResult } from '../lib/ai';
import type { GCCommandEntry } from '../hooks/useGCCommands';

export type Reaction = {
  emoji: string;
  label: string;
  count: number;
  reactedByMe: boolean;
};

/** What kind of content the message is, for the reply-preview icon/label and
 *  for choosing how MessageBubble renders it. */
export type MessageKind = 'text' | 'image' | 'video' | 'gif' | 'file' | 'voice' | 'sticker' | 'poll';

export type MediaType = 'image' | 'video' | 'gif' | 'file' | 'voice' | 'sticker';

/** A user-created sticker: a photo with baked-in text, stored once and
 *  reusable across every chat — sending it just points a message at it. */
export type Sticker = {
  id: string;
  createdBy: string | null;
  imageUrl: string;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type MediaViewerProfile = {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  avatarUrl?: string | null;
};

/** A message's attachment. A message can be media-only (empty `text`) or
 *  carry both — media plus a caption. */
export type MessageMedia = {
  url: string;
  /** Burn-after-reading: each recipient may open it exactly once. */
  viewOnce?: boolean;
  /** Whether *this* viewer has already used their one look. */
  viewed?: boolean;
  /** Anyone has opened it — what the sender sees on their own bubble. */
  viewedByAnyone?: boolean;
  /** Profiles of members who opened this view-once attachment. */
  viewers?: MediaViewerProfile[];
  /** Videos only: a poster frame grabbed from the clip at send time. An
   *  <Image> pointed at a video URL renders nothing, so this is what a bubble
   *  and the media grid actually draw. */
  thumbUrl?: string | null;
  type: MediaType;
  mime: string;
  /** Original filename — mainly for documents, where it's the only label. */
  name: string | null;
  /** Bytes. */
  size: number | null;
  /** Image/video pixel dimensions, so the bubble can reserve the right
   *  aspect ratio before the asset has loaded (no layout jump). */
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

/** Denormalized snapshot of the message being replied to — a pointer plus
 *  just enough to render the quote, not a duplicate of the original. */
export type ReplyPreview = {
  messageId: string;
  authorId: string | null;
  authorName: string;
  text: string;
  kind: MessageKind;
  /** True when the target couldn't be resolved (deleted, or not loaded). */
  isDeleted: boolean;
};

/** A structured pointer to a mentioned member. `username` is the mention
 *  *token* as inserted and rendered — this app uses the member's display
 *  name (e.g. "Harsh Dhiman"), snapshotted at send time; `userId` is the
 *  real, stable identity notifications and profile taps resolve against. */
export type Mention = {
  userId: string;
  username: string;
};

export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';

export type Message = {
  id: string;
  groupId: string;
  /** Null once the sender's account has been deleted — see "Deleted User". */
  authorId: string | null;
  authorName: string;
  authorColor: string;
  authorEmoji?: string;
  authorAvatarUrl?: string | null;
  /** Sent with /anon — the message genuinely has no author, and the sender is
   *  recorded only in a table no client can read. */
  isAnonymous?: boolean;
  isDeletedAuthor?: boolean;
  text: string;
  kind: MessageKind;
  createdAt: string; // ISO
  editedAt?: string | null;
  isDeleted?: boolean;
  /** True when a moderator deleted someone else's message, rather than the
   *  author deleting their own — the bubble says "Deleted by admin". */
  deletedByAdmin?: boolean;
  replyToMessageId?: string | null;
  replyPreview?: ReplyPreview | null;
  mentions: Mention[];
  mentionEveryone: boolean;
  media: MessageMedia | null;
  /** Set only when `media.type === 'sticker'` — the sticker being pointed
   *  at, so a long-press can favorite the underlying sticker rather than
   *  just this one send of it. */
  stickerId?: string | null;
  /** Set when this message carries a poll. Like `stickerId`, the message
   *  points at the poll rather than embedding it, so votes changing never
   *  rewrites the transcript. */
  pollId?: string | null;
  reactions: Reaction[];
  isMine: boolean;
  /** Delivery status for optimistic sending and offline queuing */
  deliveryStatus?: MessageDeliveryStatus;
  /** Unique client message identifier for deduplication */
  clientMessageId?: string;
  /**
   * Set only on the synthetic "daily recap" entry ChatScreen weaves into the
   * message array at its chronological slot (right after midnight) so it
   * scrolls and ages out of view exactly like a real message — never present
   * on anything that actually round-trips through Supabase.
   */
  isDailyRecapCard?: true;
  dailyRecapData?: DailyRecapResult;
  /**
   * Set only on the synthetic entries carrying an @gc exchange, woven into
   * the feed the same way — local to this session, never persisted, and never
   * present on anything that came from Supabase.
   */
  gcCommandEntry?: GCCommandEntry;
  /**
   * Present when this real, persisted message is a GC AI answer someone
   * shared into the chat. The sender is the member who shared it — this only
   * changes how the bubble renders, so replies, reactions, pins and deletion
   * all behave like any other message.
   */
  aiShare?: AIShare;
};

export type AIShare = {
  question: string;
  answer: string;
  /** Ids the answer cited, already validated server-side when generated. */
  sourceMessageIds: string[];
};

export type Member = {
  id: string;
  name: string;
  color: string;
  lastSeen?: string;
};

/** A group member as seen by the mention picker / member profile sheet. */
export type GroupMember = {
  id: string;
  displayName: string;
  username: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
};

/** A pinned pointer joined against its live message/pinner — never a copy of
 *  the message itself. `exists` is false once the original was deleted. */
export type PinnedMessage = {
  messageId: string;
  pinnedBy: string | null;
  pinnedByName: string;
  pinnedAt: string;
  exists: boolean;
  authorName: string;
  text: string;
  mediaType: MediaType | null;
  mediaName: string | null;
  messageCreatedAt: string;
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  lastMessage?: string;
  lastMessageAt?: string;
  /** Display name of whoever sent the last message — "You" for your own. */
  lastMessageAuthor?: string;
  lastMessageAuthorId?: string;
  /** Uploaded group picture; falls back to `emoji` when absent. */
  avatarUrl?: string | null;
  /** Key into GROUP_THEMES — drives this GC's accent colours. */
  theme?: string | null;
  unreadCount: number;
  /** True when a Tea session is currently active/brewing in this group */
  hasActiveTea?: boolean;
  /** True when weekly awards were generated recently for this group */
  hasRecentAwards?: boolean;
};
