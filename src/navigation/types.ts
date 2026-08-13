export type TabParamList = {
  GroupList: undefined;
  AddGC: undefined;
  Explore: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
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
