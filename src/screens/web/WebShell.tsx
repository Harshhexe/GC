import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { useAuth } from '../../context/AuthContext';
import { useGroups } from '../../hooks/useGroups';
import { useWebNotifications } from '../../hooks/useWebNotifications';
import { useWebNotificationSetup } from '../../hooks/useWebNotificationSetup';
import { setWebTitleBadge } from '../../lib/webNotifications';
import { PressableScale } from '../../components/ui/PressableScale';
import GroupListScreen from '../GroupListScreen';
import ChatScreen from '../ChatScreen';
import AddGCScreen from '../AddGCScreen';
import ExploreScreen from '../ExploreScreen';
import ProfileScreen from '../ProfileScreen';
import GroupInfoScreen from '../GroupInfoScreen';
import WhatDidIMissScreen from '../WhatDidIMissScreen';
import GCDNAScreen from '../GCDNAScreen';
import PinnedMessagesScreen from '../PinnedMessagesScreen';
import MediaLinksFilesScreen from '../MediaLinksFilesScreen';
import GroupSearchScreen from '../GroupSearchScreen';
import WordyScreen from '../WordyScreen';
import NotificationsScreen from '../NotificationsScreen';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MainTabs'>;

const RAIL_WIDTH = 76;
const SIDEBAR_WIDTH = 380;

/**
 * Screens that should open *inside* the main pane rather than as a
 * full-screen route over the whole shell.
 *
 * Without this they push onto the root stack and cover the sidebar and rail
 * too, which on desktop reads as the app navigating away from itself — the
 * chat list just vanishes. Everything here is group-scoped detail that
 * belongs beside the list, not instead of it.
 */
const PANE_SCREENS = [
  'GroupInfo',
  'WhatDidIMiss',
  'GCDNA',
  'PinnedMessages',
  'MediaLinksFiles',
  'GroupSearch',
  'Wordy',
  'Notifications',
] as const;

type PaneScreenName = (typeof PANE_SCREENS)[number];

/**
 * The subset that opens as a centred modal over the whole shell rather than
 * filling the chat pane.
 *
 * These are things you *consult* and dismiss — a recap, a personality card, a
 * word game — not places you navigate to and stay. Replacing the transcript
 * with them loses your place in the conversation for no reason; floating them
 * over it keeps the chat visible behind, which is also what makes the
 * dismissal obvious.
 */
const MODAL_SCREENS: readonly PaneScreenName[] = ['WhatDidIMiss', 'GCDNA', 'Wordy', 'Notifications'];

type Tab = 'chats' | 'create' | 'awards' | 'profile';

const TABS: { id: Tab; on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'chats', on: 'chatbubble', off: 'chatbubble-outline', label: 'Chats' },
  { id: 'create', on: 'add-circle', off: 'add-circle-outline', label: 'Create' },
  { id: 'awards', on: 'trophy', off: 'trophy-outline', label: 'Awards' },
  { id: 'profile', on: 'settings', off: 'settings-outline', label: 'Profile' },
];

/**
 * The WhatsApp Web-style desktop layout: icon rail, list sidebar, content pane.
 *
 * Reuses every existing screen verbatim rather than reimplementing them for
 * desktop. That is the whole design — one implementation, two arrangements.
 * A second copy of the transcript would mean every future poll, sticker and
 * read-receipt fix has to land twice.
 *
 * Rendered *inside* the navigator as a screen, not above it, because the
 * screens use useFocusEffect/useIsFocused. Outside a navigator those throw;
 * inside, they resolve against this shell's own focus, which is correct —
 * the panes are visible exactly when the shell is.
 */
export default function WebShell({ navigation, route }: Props) {
  const { session } = useAuth();
  const { groups } = useGroups();
  const [tab, setTab] = useState<Tab>('chats');

  // The whole Chat param set, not just the id. `unreadCount` is what seeds
  // ChatScreen's openedWithUnread — which draws the "N unread messages"
  // divider AND is what it scrolls to on open. Passing only groupId silently
  // disabled both.
  const [selected, setSelected] = useState<{
    groupId: string;
    unreadCount?: number;
    jumpToMessageId?: string;
  } | null>(null);
  const selectedGroupId = selected?.groupId ?? null;

  // A detail screen open inside the main pane (Group Info, Wordy, DNA…).
  // Single-depth rather than a stack: these are all reached from the chat,
  // and desktop has no gesture that would make a deeper history legible.
  const [paneScreen, setPaneScreen] = useState<{
    name: PaneScreenName;
    params: Record<string, unknown>;
  } | null>(null);

  const { permission } = useWebNotificationSetup(session?.user.id);

  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const totalUnread = useMemo(
    () => groups.reduce((sum, g) => sum + (g.unreadCount ?? 0), 0),
    [groups]
  );

  // The web stand-in for an app-icon badge.
  useEffect(() => {
    setWebTitleBadge(totalUnread);
  }, [totalUnread]);

  const openGroup = useCallback((groupId: string, unreadCount?: number) => {
    setTab('chats');
    setPaneScreen(null);
    setSelected({ groupId, unreadCount });
  }, []);

  useWebNotifications(session?.user.id, groupIds, selectedGroupId, openGroup);

  // A Web Push notification clicked while the app was already open focuses
  // this tab and the service worker hands the target group over via
  // postMessage — focus() alone can't carry a navigation.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'gc-open-group' && event.data.groupId) {
        openGroup(event.data.groupId);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [openGroup]);

  // Clicked from a closed tab: the service worker opened a fresh window at
  // `/?openGroup=<id>` instead (no existing tab to postMessage into). Read it
  // once on load, then strip it so a later refresh doesn't reopen the group.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('openGroup');
    if (groupId) {
      openGroup(groupId);
      params.delete('openGroup');
      const next = params.toString();
      window.history.replaceState(null, '', next ? `?${next}` : window.location.pathname);
    }
    // Once, on mount — not keyed on openGroup identity, which is itself
    // stable anyway (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Navigation shim for the panes.
   *
   * `navigate('Chat', …)` must swap the right-hand pane, not push a
   * full-screen route over everything. Params are forwarded verbatim so the
   * pane behaves exactly like a pushed route. Every other destination
   * (GroupInfo, Wordy, GCDNA…) still goes to the real navigator untouched.
   */
  const paneNavigation = useMemo(
    () =>
      ({
        ...navigation,
        navigate: (name: string, params?: Record<string, unknown>) => {
          if (PANE_SCREENS.includes(name as PaneScreenName)) {
            // Opens beside the chat list instead of over it.
            setPaneScreen({ name: name as PaneScreenName, params: params ?? {} });
            return;
          }
          if (name === 'Chat' && typeof params?.groupId === 'string') {
            setTab('chats');
            setPaneScreen(null);
            setSelected({
              groupId: params.groupId,
              unreadCount:
                typeof params.unreadCount === 'number' ? params.unreadCount : undefined,
              jumpToMessageId:
                typeof params.jumpToMessageId === 'string' ? params.jumpToMessageId : undefined,
            });
            return;
          }
          (navigation as unknown as { navigate: (n: string, p?: unknown) => void }).navigate(
            name,
            params
          );
        },
        // Back inside a pane returns to the chat list rather than leaving the
        // shell — there is nowhere "back" to go on desktop.
        goBack: () => {
          if (paneScreen) setPaneScreen(null);
          else if (tab !== 'chats') setTab('chats');
          else setSelected(null);
        },
      }) as unknown as Props['navigation'],
    [navigation, tab, paneScreen]
  );

  // ChatScreen reads everything from route.params and never calls useRoute(),
  // so a synthetic route is all it needs.
  const chatRoute = useMemo(
    () =>
      selected
        ? ({
            key: `web-chat-${selected.groupId}`,
            name: 'Chat',
            params: {
              groupId: selected.groupId,
              unreadCount: selected.unreadCount,
              jumpToMessageId: selected.jumpToMessageId,
            },
          } as unknown as never)
        : null,
    [selected]
  );

  const isModalScreen = !!paneScreen && MODAL_SCREENS.includes(paneScreen.name);

  /** Renders whichever detail screen is open in the pane. */
  function PaneScreen() {
    if (!paneScreen) return null;
    const p = { navigation: paneNavigation as never, route: { key: `pane-${paneScreen.name}`, name: paneScreen.name, params: paneScreen.params } as never };
    switch (paneScreen.name) {
      case 'GroupInfo':
        return <GroupInfoScreen {...p} />;
      case 'WhatDidIMiss':
        return <WhatDidIMissScreen {...p} />;
      case 'GCDNA':
        return <GCDNAScreen {...p} />;
      case 'PinnedMessages':
        return <PinnedMessagesScreen {...p} />;
      case 'MediaLinksFiles':
        return <MediaLinksFilesScreen {...p} />;
      case 'GroupSearch':
        return <GroupSearchScreen {...p} />;
      case 'Wordy':
        return <WordyScreen {...p} />;
      case 'Notifications':
        return <NotificationsScreen {...p} />;
      default:
        return null;
    }
  }

  return (
    <View style={styles.shellRoot}>
      <View style={styles.root}>
      {/* Icon rail — the desktop counterpart of the mobile Dock. */}
      <View style={styles.rail}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <PressableScale
              key={t.id}
              style={[styles.railItem, active && styles.railItemActive]}
              scaleTo={0.92}
              onPress={() => setTab(t.id)}
            >
              <Ionicons
                name={active ? t.on : t.off}
                size={21}
                color={active ? colors.primary : colors.onSurfaceVariant}
              />
              <Text style={[styles.railLabel, active && { color: colors.primary }]}>{t.label}</Text>
              {t.id === 'chats' && totalUnread > 0 && (
                <View style={styles.railBadge}>
                  <Text style={styles.railBadgeText}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </Text>
                </View>
              )}
            </PressableScale>
          );
        })}
      </View>

      {/* Sidebar — always the chat list, so switching tabs never loses your
          place in the conversation list. The notification permission banner
          lives inside GroupListScreen itself now, not here — that's the
          component mobile web and an installed iOS PWA actually render
          (neither ever mounts WebShell), so putting it there instead of here
          covers every web entry point from one place. */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarBody}>
          <GroupListScreen navigation={paneNavigation as never} route={route as never} />
        </View>
      </View>

      <View style={styles.divider} />

      {/* Main pane */}
      <View style={styles.mainPane}>
        {paneScreen && !isModalScreen ? (
          <PaneScreen />
        ) : tab === 'create' ? (
          <AddGCScreen navigation={paneNavigation as never} route={route as never} />
        ) : tab === 'awards' ? (
          <ExploreScreen navigation={paneNavigation as never} route={route as never} />
        ) : tab === 'profile' ? (
          <ProfileScreen navigation={paneNavigation as never} route={route as never} />
        ) : selected && chatRoute ? (
          <ChatScreen
            // Remounts on switch so per-chat state (draft, unread divider,
            // scroll position) resets the way it does on mobile navigation.
            key={selected.groupId}
            navigation={paneNavigation as never}
            route={chatRoute}
          />
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={44} color={colors.outline} />
            </View>
            <Text style={styles.emptyTitle}>GC for Web</Text>
            <Text style={styles.emptyBody}>
              Pick a GC on the left to start reading. Everything stays in sync with your phone.
            </Text>
            <Text style={styles.emptyHint}>Enter sends · Shift+Enter for a new line</Text>
            {permission === 'granted' && (
              <View style={styles.emptyPill}>
                <Ionicons name="notifications" size={12} color={colors.primary} />
                <Text style={styles.emptyPillText}>Notifications on</Text>
              </View>
            )}
          </View>
        )}
      </View>
      </View>

      {/* Centred modal for the consult-and-dismiss screens. Rendered after
          the columns so it paints above the rail and sidebar too — the point
          is that the chat stays visible behind it. */}
      {isModalScreen && (
        <View style={styles.modalLayer}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPaneScreen(null)}
            // Backdrop only. Without this the press would also fire for taps
            // landing on the card itself, closing it on every interaction.
          />
          {/* No close button of our own: every one of these screens already
              renders a back arrow, and goBack() resolves to closing the
              modal. Adding a second affordance put an × directly on top of
              the profile avatar in their headers. */}
          <View style={styles.modalCard}>
            <View style={styles.modalBody}>
              <PaneScreen />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shellRoot: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },

  modalLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalCard: {
    width: '100%',
    // Capped so it reads as a dialog on a wide monitor instead of a
    // near-fullscreen sheet, but still takes the height it can get.
    maxWidth: 1040,
    maxHeight: 780,
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
  },
  modalBody: { flex: 1 },

  rail: {
    width: RAIL_WIDTH,
    backgroundColor: colors.surfaceLow,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant,
    paddingTop: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  railItem: {
    width: RAIL_WIDTH - 16,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 3,
  },
  railItemActive: { backgroundColor: 'rgba(129,140,248,0.12)' },
  railLabel: { ...typography.micro, fontSize: 10, color: colors.onSurfaceVariant },
  railBadge: {
    position: 'absolute',
    top: 4,
    right: 12,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBadgeText: { ...typography.micro, fontSize: 9.5, color: '#FFFFFF', fontWeight: '700' },

  sidebar: { width: SIDEBAR_WIDTH, backgroundColor: colors.bg },
  sidebarBody: { flex: 1 },
  divider: { width: 1, backgroundColor: colors.outlineVariant },
  mainPane: { flex: 1, backgroundColor: colors.bg },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 92,
    height: 92,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.title, fontSize: 22, color: colors.onSurface },
  emptyBody: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 21,
  },
  emptyHint: { ...typography.micro, fontSize: 11, color: colors.outline, marginTop: 2 },
  emptyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(129,140,248,0.12)',
  },
  emptyPillText: { ...typography.micro, fontSize: 11, color: colors.primary },
});
