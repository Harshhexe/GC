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
  WhatDidIMiss: { groupId: string; groupName?: string };
  Notifications: undefined;
};
