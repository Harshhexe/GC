import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  GroupList: undefined;
  /** `mode` lets the empty chat list drop you straight onto the right tab of
   *  the create/join screen instead of always landing on "create". */
  /** `code` arrives from an invite link and pre-fills the join field, so a
   *  tapped invite needs no typing. Always paired with `mode: 'join'`. */
  AddGC: { mode?: 'create' | 'join'; code?: string } | undefined;
  Explore: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  /** Shown once, right after sign-up — see `justSignedUp` in AuthContext. */
  Welcome: undefined;
  /** Params are passed through to the tab navigator so a deep link can land on
   *  a specific tab — an invite link opens AddGC with its code already in. */
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  /** `unreadCount` comes from the chat list so the transcript can place its
   *  "unread" divider without re-reading a stamp it is about to overwrite. */
  Chat: {
    groupId: string;
    unreadCount?: number;
    jumpToMessageId?: string;
    /** Arrive with a private comment thread already open — used by the
     *  notification tap and by What Did I Miss, which should land the user in
     *  the private context rather than the public transcript. */
    openPrivateCommentMessageId?: string;
    privateThreadUserId?: string;
  };
  GroupInfo: { groupId: string };
  /** Custom instructions — per-group memories the AI can reference. */
  GroupInstructions: { groupId: string };
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
