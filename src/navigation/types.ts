export type TabParamList = {
  GroupList: undefined;
  /** `mode` lets the empty chat list drop you straight onto the right tab of
   *  the create/join screen instead of always landing on "create". */
  AddGC: { mode?: 'create' | 'join' } | undefined;
  Explore: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  /** Shown once, right after sign-up — see `justSignedUp` in AuthContext. */
  Welcome: undefined;
  MainTabs: undefined;
  /** `unreadCount` comes from the chat list so the transcript can place its
   *  "unread" divider without re-reading a stamp it is about to overwrite. */
  Chat: { groupId: string; unreadCount?: number; jumpToMessageId?: string };
  GroupInfo: { groupId: string };
  PinnedMessages: { groupId: string };
  GroupSearch: { groupId: string };
  MediaLinksFiles: { groupId: string; initialTab?: 'media' | 'links' | 'files' };
  WhatDidIMiss: { groupId: string; groupName?: string; focusSection?: 'missedElevenEleven' | string };
  /** 🧬 The group's AI-generated personality. Read-only — there is no
   *  regenerate path; it updates itself with the weekly GC Awards. */
  GCDNA: { groupId: string; groupName?: string };
  /** 🎯 Daily Wordy. `groupId` scopes the leaderboard to that GC; the
   *  puzzle itself is global and identical for everyone that day. */
  Wordy: { groupId?: string } | undefined;
  Notifications: undefined;
};
