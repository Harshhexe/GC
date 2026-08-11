export type Reaction = {
  emoji: string;
  label: string;
  count: number;
  reactedByMe: boolean;
};

export type Message = {
  id: string;
  groupId: string;
  /** Null once the sender's account has been deleted — see "Deleted User". */
  authorId: string | null;
  authorName: string;
  authorColor: string;
  authorEmoji?: string;
  isDeletedAuthor?: boolean;
  text: string;
  createdAt: string; // ISO
  reactions: Reaction[];
  isMine: boolean;
};

export type Member = {
  id: string;
  name: string;
  color: string;
  lastSeen?: string;
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
