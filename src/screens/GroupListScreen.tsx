import { useCallback, useEffect, useState, memo } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  fontFamily,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { usePersonalGroupTheme } from '../theme/groupThemes';
import { setBadgeCount } from '../lib/push';
import { EmptyState } from '../components/EmptyState';
import { PressableScale } from '../components/ui/PressableScale';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton } from '../components/ui/Buttons';
import { GCWordmark } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { timeAgo } from '../utils/time';
import { Group } from '../types';
import { useGroups } from '../hooks/useGroups';
import { useNotifications } from '../hooks/useNotifications';
import { useWebNotificationSetup } from '../hooks/useWebNotificationSetup';
import { useAuth } from '../context/AuthContext';
import { useAppearance } from '../context/AppearanceContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'GroupList'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DEAD_CHAT_MS = 1000 * 60 * 60 * 24;
/** A quiet canvas behind the list; individual GC colours stay on their cards. */
function GroupListAtmosphericBackground() {
  const { theme } = useAppearance();
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot, { backgroundColor: theme.palette.bg }]} pointerEvents="none">
      <LinearGradient
        colors={[theme.palette.bg, theme.palette.bg, theme.palette.appChrome]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[`${theme.palette.primary}${theme.isDark ? '14' : '0B'}`, `${theme.palette.primary}05`, 'transparent']}
        locations={[0, 0.43, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cornerWash}
      />
      <View style={[styles.fineArc, { borderColor: `${theme.palette.primary}${theme.isDark ? '16' : '13'}` }]} />
    </View>
  );
}

function isDeadChat(group: Group) {
  if (!group.lastMessageAt) return false;
  return Date.now() - new Date(group.lastMessageAt).getTime() > DEAD_CHAT_MS;
}

/**
 * Evaluates the real-time activity state of the GC to build the dynamic live pill badge without emojis.
 */
function getLiveBadgeConfig(
  group: Group,
  onOpenChat: () => void,
  onCatchUp: () => void
): {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
} {
  const dead = isDeadChat(group);

  // 1. Live Tea in progress
  if (group.hasActiveTea) {
    return {
      icon: 'cafe-outline',
      label: 'Live Tea',
      onPress: onOpenChat,
    };
  }

  // 2. Fresh weekly awards available
  if (group.hasRecentAwards) {
    return {
      icon: 'trophy-outline',
      label: 'GC Awards',
      onPress: onCatchUp,
    };
  }

  // 3. Popping off — large unread message burst (20+ messages)
  if (group.unreadCount >= 20) {
    return {
      icon: 'flame-outline',
      label: 'Popping Off',
      onPress: onCatchUp,
    };
  }

  // 4. Unread messages needing catch-up
  if (group.unreadCount > 0) {
    return {
      icon: 'sparkles-outline',
      label: `Catch Up (${group.unreadCount})`,
      onPress: onCatchUp,
    };
  }

  // 5. Dead chat needing a revive
  if (dead) {
    return {
      icon: 'pulse-outline',
      label: 'Revive Chat',
      onPress: onOpenChat,
    };
  }

  // 6. Default all caught up state
  return {
    icon: 'sparkles-outline',
    label: 'Catch Up',
    onPress: onCatchUp,
  };
}

const GroupCard = memo(function GroupCardImpl({
  group,
  index,
  onOpen,
  onCatchUp,
  onCrew,
}: {
  group: Group;
  index: number;
  onOpen: (group: Group) => void;
  onCatchUp: (group: Group) => void;
  onCrew: (group: Group) => void;
}) {
  const dead = isDeadChat(group);
  const unread = group.unreadCount > 0;
  const { theme } = usePersonalGroupTheme(group.id, group.theme);
  const { theme: appTheme } = useAppearance();
  // These three handlers are passed the same stable reference for every row
  // (bound in the parent with useCallback), so this memo() actually holds —
  // wrapping them here per-group keeps getLiveBadgeConfig's zero-arg contract
  // without breaking that stability up the tree.
  const handleOpen = useCallback(() => onOpen(group), [onOpen, group]);
  const handleCatchUp = useCallback(() => onCatchUp(group), [onCatchUp, group]);
  const handleCrew = useCallback(() => onCrew(group), [onCrew, group]);
  const badge = getLiveBadgeConfig(group, handleOpen, handleCatchUp);

  return (
    <Animated.View
      // Capped: this is a virtualized list, so a row mounting at index 40
      // would otherwise sit invisible for 40 × STAGGER_MS after you scrolled
      // to it. The stagger is only meant to dress the first screenful.
      entering={FadeInDown.delay(Math.min(index, 6) * STAGGER_MS)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
      style={styles.cardWrap}
    >
      <GlassPanel
        borderRadius={radius.lg}
        style={[styles.themedCard, { backgroundColor: appTheme.palette.surfaceLow, borderColor: unread ? `${theme.accent}66` : appTheme.palette.border }]}
      >
        <PressableScale
          style={styles.cardTop}
          scaleTo={0.985}
          onPress={handleOpen}
          accessibilityLabel={`Open ${group.name}`}
        >
          <Avatar
            imageUrl={dead ? undefined : group.avatarUrl}
            label={group.name}
            ringColors={theme.colors}
            size={52}
            glow={false}
            status={dead ? 'offline' : 'online'}
          />

          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              <Text
                style={[styles.groupName, unread && styles.groupNameUnread, { color: appTheme.palette.onSurface }]}
                numberOfLines={1}
              >
                {group.name}
              </Text>
              {!!group.lastMessageAt && (
                <Text style={[styles.time, { color: appTheme.palette.textMuted }]}>
                  {timeAgo(group.lastMessageAt)}
                </Text>
              )}
            </View>

            <View style={styles.cardMessageRow}>
              <Text
                style={[
                  styles.lastMessage,
                  unread && styles.lastMessageUnread,
                  dead && styles.lastMessageDead,
                  { color: unread ? appTheme.palette.onSurfaceVariant : appTheme.palette.textMuted },
                ]}
                numberOfLines={1}
              >
                {dead ? (
                  'Chat has been quiet for a while'
                ) : group.lastMessage ? (
                  <>
                    {!!group.lastMessageAuthor && (
                      <Text style={[styles.lastMessageAuthor, { color: appTheme.palette.onSurface }]}>{group.lastMessageAuthor}: </Text>
                    )}
                    {group.lastMessage}
                  </>
                ) : (
                  'No messages yet'
                )}
              </Text>
              {group.unreadCount > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.accent },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: appTheme.palette.onPrimary }]}>
                    {group.unreadCount > 99 ? '99+' : group.unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </PressableScale>

        <View style={[styles.actionRow, { borderTopColor: appTheme.palette.border }]}>
          <PressableScale
            style={styles.dynamicBadgeWrap}
            scaleTo={0.97}
            onPress={badge.onPress}
            accessibilityLabel={`${badge.label} in ${group.name}`}
          >
            <Ionicons name={badge.icon} size={15} color={unread ? theme.accent : appTheme.palette.onSurfaceVariant} />
            <Text style={[styles.dynamicBadgeText, { color: unread ? theme.accent : appTheme.palette.onSurfaceVariant }]}>{badge.label}</Text>
            <Ionicons name="arrow-forward" size={14} color={unread ? theme.accent : appTheme.palette.onSurfaceVariant} />
          </PressableScale>

          <PressableScale
            style={styles.crewButton}
            scaleTo={0.97}
            onPress={handleCrew}
            accessibilityLabel={`View ${group.memberCount} members in ${group.name}`}
          >
            <Ionicons name="people-outline" size={15} color={appTheme.palette.onSurfaceVariant} />
            <Text style={[styles.crewText, { color: appTheme.palette.onSurfaceVariant }]}>{group.memberCount}</Text>
          </PressableScale>
        </View>
      </GlassPanel>
    </Animated.View>
  );
});

/**
 * Placeholder rows shown while the list loads.
 *
 * Preferred over a centred spinner because it occupies the same space the real
 * cards will, so the screen doesn't jump when data lands, and it communicates
 * "a list is coming" rather than "something is happening".
 */
function GroupCardSkeleton({ index }: { index: number }) {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      // reduceMotion is passed through: this loops indefinitely, which is
      // exactly the kind of motion people disable it for.
      withTiming(1, { duration: 900, easing: easing.inOut, reduceMotion }),
      -1,
      true
    );
  }, [pulse]);

  const shimmer = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[styles.cardWrap, shimmer]}
      // Decorative only: screen readers get the one status message below.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <GlassPanel borderRadius={radius.xl} style={styles.skeletonCard}>
        <View style={styles.cardTop}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.cardCopy}>
            <View style={[styles.skeletonLine, { width: index % 2 ? '46%' : '62%' }]} />
            <View style={[styles.skeletonLine, styles.skeletonLineThin, { width: '86%' }]} />
          </View>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

export default function GroupListScreen({ navigation }: Props) {
  const { theme } = useAppearance();
  const { session } = useAuth();
  const { groups, loading, refetch } = useGroups();
  const { unreadCount: unreadNotifications } = useNotifications(session?.user?.id);
  // Lives here rather than only in WebShell: this screen is what mobile web
  // and an installed iOS PWA actually render (both are phone-width, so
  // WebShell — gated to desktop width — never mounts for them at all). This
  // is the one place common to every web entry point.
  const { permission, enableNotifications } = useWebNotificationSetup(session?.user.id);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Pulling to refresh is the gesture people already try on a chat list; the
  // data layer was only ever refreshed on focus before.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const totalUnread = groups.reduce((sum, g) => sum + g.unreadCount, 0);
  useEffect(() => {
    setBadgeCount(totalUnread);
  }, [totalUnread]);

  // Bound once per navigation identity (essentially forever) rather than
  // fresh per row per render — GroupCard's memo() only holds if the handlers
  // it receives are referentially stable across re-renders.
  const handleOpenGroup = useCallback(
    (group: Group) => navigation.navigate('Chat', { groupId: group.id, unreadCount: group.unreadCount }),
    [navigation]
  );
  const handleCatchUpGroup = useCallback(
    (group: Group) => navigation.navigate('WhatDidIMiss', { groupId: group.id, groupName: group.name }),
    [navigation]
  );
  const handleCrewGroup = useCallback(
    (group: Group) => navigation.navigate('GroupInfo', { groupId: group.id }),
    [navigation]
  );

  const renderGroupItem = useCallback(
    ({ item, index }: { item: Group; index: number }) => (
      <GroupCard
        group={item}
        index={index}
        onOpen={handleOpenGroup}
        onCatchUp={handleCatchUpGroup}
        onCrew={handleCrewGroup}
      />
    ),
    [handleOpenGroup, handleCatchUpGroup, handleCrewGroup]
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.palette.bg }]}>
      <GroupListAtmosphericBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <GCWordmark />

          <View style={styles.headerRight}>
            <PressableScale
              style={[styles.bellButton, { backgroundColor: theme.palette.surfaceLow, borderColor: theme.palette.border }]}
              scaleTo={0.88}
              hitSlop={6}
              onPress={() => navigation.navigate('Notifications')}
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={20} color={theme.palette.onSurface} />
              {unreadNotifications > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </Text>
                </View>
              )}
            </PressableScale>
          </View>
        </View>

        <View style={styles.heroSection}>
          <View style={styles.heroRow}>
            <Text style={[styles.heroTitle, { color: theme.palette.onSurface }]}>Your GCs</Text>
            <Text style={[styles.countPillText, { color: theme.palette.onSurfaceVariant }]}>
              {groups.length} {groups.length === 1 ? 'group' : 'groups'}
            </Text>
          </View>
          <Text style={[styles.heroSubtitle, { color: theme.palette.onSurfaceVariant }]}>The conversations that keep you close.</Text>
        </View>

        {Platform.OS === 'web' && permission === 'default' && (
          <PressableScale style={styles.permBanner} scaleTo={0.99} onPress={enableNotifications}>
            <Ionicons name="notifications-outline" size={15} color={colors.primary} />
            <Text style={styles.permText}>Turn on notifications</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.outline} />
          </PressableScale>
        )}

        {loading ? (
          <View style={styles.list} accessibilityLabel="Loading your group chats">
            {[0, 1, 2, 3].map((i) => (
              <GroupCardSkeleton key={i} index={i} />
            ))}
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="chatbubbles-outline"
              title="Your chats start here"
              text="Create a GC for your people, or join one with an invite."
              iconColor={colors.primary}
            />
            <GCButton label="Create or join a GC" onPress={() => navigation.navigate('AddGC')} style={styles.emptyAction} />
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            renderItem={renderGroupItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.surface}
              />
            }
            removeClippedSubviews={Platform.OS !== 'web'}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={9}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  safe: { flex: 1, minHeight: 0 },
  glowBgRoot: { backgroundColor: colors.appRoot, overflow: 'hidden' },
  cornerWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },
  fineArc: {
    position: 'absolute',
    top: -210,
    right: -215,
    width: 430,
    height: 430,
    borderRadius: 215,
    borderWidth: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CONTAINER_MARGIN,
    height: 64,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginLeft: 'auto',
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 17,
    height: 17,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  bellBadgeText: { ...typography.micro, fontSize: 9, color: '#FFFFFF', fontWeight: '700' },
  heroSection: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTitle: {
    ...typography.headline,
    fontSize: 32,
    color: colors.onSurface,
  },
  heroSubtitle: { ...typography.body, fontSize: 14, color: colors.onSurfaceVariant },
  countPillText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  list: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: 0,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: 10,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: CONTAINER_MARGIN,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  permText: { ...typography.bodyMedium, fontSize: 13, color: colors.onSurface, flex: 1 },
  cardWrap: { width: '100%' },
  skeletonCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: colors.surfaceLow,
    overflow: 'hidden',
  },
  skeletonAvatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  skeletonLine: {
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  skeletonLineThin: { height: 10, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  themedCard: { borderWidth: 1, overflow: 'hidden', backgroundColor: colors.surfaceLow },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardCopy: { flex: 1, gap: 4 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  groupName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 16,
    lineHeight: 22,
    color: colors.onSurface,
    flex: 1,
  },
  groupNameUnread: { color: colors.onSurface },
  time: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  cardMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  lastMessage: { ...typography.body, fontSize: 13.5, color: colors.textMuted, flex: 1 },
  lastMessageUnread: { color: colors.onSurfaceVariant },
  lastMessageDead: { color: colors.outline },
  lastMessageAuthor: { fontWeight: '600', color: colors.onSurface },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.micro, fontSize: 11, color: colors.appChrome, fontWeight: '800' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  dynamicBadgeWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  dynamicBadgeText: { ...typography.caption, fontSize: 12 },
  crewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingLeft: spacing.sm,
  },
  crewText: { ...typography.caption, fontSize: 12, color: colors.onSurfaceVariant },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyAction: { marginTop: spacing.md, marginBottom: DOCK_HEIGHT + spacing.lg, width: '100%', maxWidth: 260 },
});
