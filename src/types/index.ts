export type Reaction = {
  emoji: string;
  label: string;
  count: number;
  reactedByMe: boolean;
};

/** What kind of content the message is, for the reply-preview icon/label and
 *  for choosing how MessageBubble renders it. 'voice' isn't sendable yet
 *  (no recorder built), kept here so replies won't need a rework once it is. */
export type MessageKind = 'text' | 'image' | 'video' | 'gif' | 'file' | 'voice';

export type MediaType = 'image' | 'video' | 'gif' | 'file';

/** A message's attachment. A message can be media-only (empty `text`) or
 *  carry both — media plus a caption. */
export type MessageMedia = {
  url: string;
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

export type Message = {
  id: string;
  groupId: string;
  /** Null once the sender's account has been deleted — see "Deleted User". */
  authorId: string | null;
  authorName: string;
  authorColor: string;
  authorEmoji?: string;
  authorAvatarUrl?: string | null;
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
  reactions: Reaction[];
  isMine: boolean;
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
};
