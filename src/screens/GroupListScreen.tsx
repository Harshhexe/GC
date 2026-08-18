import { useCallback, useEffect, useState, memo } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  glass,
  gradients,
  radius,
  shadows,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { groupTheme, GroupTheme } from '../theme/groupThemes';
import { setBadgeCount } from '../lib/push';
import { EmptyState } from '../components/EmptyState';
import { PressableScale } from '../components/ui/PressableScale';
import { GlassPanel } from '../components/ui/Glass';
import { Avatar } from '../components/ui/Avatar';
import { timeAgo } from '../utils/time';
import { Group } from '../types';
import { useGroups } from '../hooks/useGroups';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../context/AuthContext';
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
const APP_LOGO_TRANSPARENT = require('../../assets/gc_app_logo-transparent.png');

/** Deep moody atmospheric glow background for Group List */
function GroupListAtmosphericBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Obsidian Dark Base */}
      <LinearGradient
        colors={['#0C0A14', '#06050A', '#030206']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Atmosphere Spotlight */}
      <LinearGradient
        colors={['rgba(139, 92, 246, 0.16)', 'rgba(99, 102, 241, 0.06)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topSpotlight}
      />

      {/* Subtle Corner Ambient Glows */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.25)', 'rgba(236, 72, 153, 0.10)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={['rgba(76, 215, 246, 0.16)', 'rgba(99, 102, 241, 0.10)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['rgba(251, 113, 133, 0.14)', 'rgba(139, 92, 246, 0.10)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.18)', 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      {/* Velvety Smooth Dark Blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 95}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle Ambient Sheen & Dark Vignette */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.02)', 'transparent', 'rgba(3, 2, 6, 0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
  theme: GroupTheme,
  onOpenChat: () => void,
  onCatchUp: () => void
): {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  gradient: readonly [string, string];
  glowStyle: object;
  onPress: () => void;
} {
  const dead = isDeadChat(group);

  // 1. Live Tea in progress
  if (group.hasActiveTea) {
    return {
      icon: 'cafe-outline',
      label: 'Live Tea',
      gradient: ['#10B981', '#059669'],
      glowStyle: shadows.glowCyan,
      onPress: onOpenChat,
    };
  }

  // 2. Fresh weekly awards available
  if (group.hasRecentAwards) {
    return {
      icon: 'trophy-outline',
      label: 'GC Awards',
      gradient: ['#F59E0B', '#D97706'],
      glowStyle: shadows.glow,
      onPress: onCatchUp,
    };
  }

  // 3. Popping off — large unread message burst (20+ messages)
  if (group.unreadCount >= 20) {
    return {
      icon: 'flame-outline',
      label: 'Popping Off',
      gradient: ['#F43F5E', '#BE185D'],
      glowStyle: shadows.glowPink,
      onPress: onCatchUp,
    };
  }

  // 4. Unread messages needing catch-up
  if (group.unreadCount > 0) {
    return {
      icon: 'sparkles-outline',
      label: `Catch Up (${group.unreadCount})`,
      gradient: theme.colors,
      glowStyle: shadows.glow,
      onPress: onCatchUp,
    };
  }

  // 5. Dead chat needing a revive
  if (dead) {
    return {
      icon: 'pulse-outline',
      label: 'Revive Chat',
      gradient: ['#374151', '#1F2937'],
      glowStyle: {},
      onPress: onOpenChat,
    };
  }

  // 6. Default all caught up state
  return {
    icon: 'sparkles-outline',
    label: 'Catch Up',
    gradient: theme.colors,
    glowStyle: shadows.glow,
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
  const theme = groupTheme(group.theme);
  // These three handlers are passed the same stable reference for every row
  // (bound in the parent with useCallback), so this memo() actually holds —
  // wrapping them here per-group keeps getLiveBadgeConfig's zero-arg contract
  // without breaking that stability up the tree.
  const handleOpen = useCallback(() => onOpen(group), [onOpen, group]);
  const handleCatchUp = useCallback(() => onCatchUp(group), [onCatchUp, group]);
  const handleCrew = useCallback(() => onCrew(group), [onCrew, group]);
  const badge = getLiveBadgeConfig(group, theme, handleOpen, handleCatchUp);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * STAGGER_MS)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
      style={styles.cardWrap}
    >
      <GlassPanel borderRadius={radius.lg}>
        <PressableScale style={styles.cardTop} scaleTo={0.985} onPress={handleOpen}>
          <Avatar
            imageUrl={dead ? undefined : group.avatarUrl}
            label={group.name}
            ringColors={theme.colors}
            size={56}
            status={dead ? 'offline' : 'online'}
          />

          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.groupName} numberOfLines={1}>
                {group.name}
              </Text>
              {!!group.lastMessageAt && (
                <Text style={[styles.time, { color: theme.accent }]}>
                  {timeAgo(group.lastMessageAt)}
                </Text>
              )}
            </View>

            <View style={styles.cardMessageRow}>
              <Text style={[styles.lastMessage, dead && styles.lastMessageDead]} numberOfLines={2}>
                {dead ? (
                  'Chat has been quiet for a while'
                ) : group.lastMessage ? (
                  <>
                    {!!group.lastMessageAuthor && (
                      <Text style={styles.lastMessageAuthor}>{group.lastMessageAuthor}: </Text>
                    )}
                    {group.lastMessage}
                  </>
                ) : (
                  'No messages yet'
                )}
              </Text>
              {group.unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                  <Text style={styles.badgeText}>
                    {group.unreadCount > 99 ? '99+' : group.unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </PressableScale>

        {/* Action Row with Dynamic Live Pill Badge and Crew Button */}
        <View style={styles.actionRow}>
          <PressableScale style={styles.dynamicBadgeWrap} haptic="medium" scaleTo={0.94} onPress={badge.onPress}>
            <LinearGradient
              colors={badge.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.dynamicBadgeButton, badge.glowStyle]}
            >
              <Ionicons name={badge.icon} size={14} color="#FFFFFF" />
              <Text style={styles.dynamicBadgeText}>{badge.label}</Text>
            </LinearGradient>
          </PressableScale>

          <PressableScale
            style={[
              styles.crewButton,
              { backgroundColor: `${theme.accent}14`, borderColor: `${theme.accent}33` },
            ]}
            scaleTo={0.94}
            onPress={handleCrew}
          >
            <Ionicons name="people-outline" size={14} color={theme.accent} />
            <Text style={[styles.crewText, { color: theme.accent }]}>{group.memberCount}</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.accent} />
          </PressableScale>
        </View>
      </GlassPanel>
    </Animated.View>
  );
});

export default function GroupListScreen({ navigation }: Props) {
  const { session, profile } = useAuth();
  const { groups, loading, refetch } = useGroups();
  const { unreadCount: unreadNotifications } = useNotifications(session?.user?.id);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

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
    <View style={styles.root}>
      <GroupListAtmosphericBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Modern Top Header Bar */}
        <View style={styles.topBar}>
          <PressableScale scaleTo={0.94} style={styles.appLogoButton}>
            <Image
              source={APP_LOGO_TRANSPARENT}
              style={styles.headerAppLogo}
              contentFit="contain"
            />
          </PressableScale>

          <View style={styles.headerRight}>
            <PressableScale
              style={styles.bellButton}
              scaleTo={0.88}
              hitSlop={6}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.onSurface} />
              {unreadNotifications > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </Text>
                </View>
              )}
            </PressableScale>

            <PressableScale
              scaleTo={0.9}
              onPress={() => navigation.navigate('Profile')}
              style={styles.profileAvatarButton}
            >
              <Avatar
                imageUrl={profile?.avatar_url}
                label={profile?.display_name ?? 'Me'}
                ringColors={gradients.brandSoft}
                size={34}
              />
            </PressableScale>
          </View>
        </View>

        {/* Hero Title Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroRow}>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroTitle}>Chats</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>
                  {groups.length} {groups.length === 1 ? 'group' : 'groups'}
                </Text>
              </View>
            </View>

            <PressableScale
              scaleTo={0.92}
              haptic="medium"
              onPress={() => navigation.navigate('AddGC', { mode: 'create' })}
            >
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.newGCBtn}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.newGCBtnText}>New GC</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        </View>

        {loading ? (
          <EmptyState icon="hourglass-outline" text="Loading your group chats..." iconColor={colors.primary} />
        ) : groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="chatbubbles-outline"
              text="No group chats yet. Tap + New GC above to get started!"
              iconColor={colors.primary}
            />
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            renderItem={renderGroupItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
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
  root: { flex: 1, backgroundColor: '#07060B' },
  safe: { flex: 1 },
  glowBgRoot: { backgroundColor: '#07060B', overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -70, left: -70, width: 280, height: 280, opacity: 0.75 },
  blobTopRight: { top: -60, right: -60, width: 270, height: 270, opacity: 0.7 },
  blobBottomLeft: { bottom: -70, left: -60, width: 280, height: 280, opacity: 0.65 },
  blobBottomRight: { bottom: -80, right: -70, width: 290, height: 290, opacity: 0.7 },
  blobCenterAnimated: { top: '15%', left: '15%', width: 280, height: 280 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: CONTAINER_MARGIN,
    height: 48,
    position: 'relative',
  },
  appLogoButton: {
    position: 'absolute',
    left: -10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  headerAppLogo: {
    width: 120,
    height: 56,
    transform: [{ scale: 1.25 }],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginLeft: 'auto',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
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
  profileAvatarButton: {
    marginLeft: 2,
  },
  heroSection: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm + 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTextCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  heroTitle: {
    ...typography.headline,
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  countPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  countPillText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  newGCBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
    ...shadows.glow,
  },
  newGCBtnText: {
    ...typography.label,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  list: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.xs,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.md,
  },
  cardWrap: { width: '100%' },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardCopy: { flex: 1, gap: 4 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  groupName: { ...typography.title, fontSize: 17, fontWeight: '700', color: colors.onSurface, flex: 1 },
  time: { ...typography.caption, fontSize: 11.5, fontWeight: '600' },
  cardMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  lastMessage: { ...typography.body, fontSize: 13.5, color: colors.onSurfaceVariant, flex: 1 },
  lastMessageDead: { color: colors.outline },
  lastMessageAuthor: { fontWeight: '600', color: colors.onSurface },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.micro, fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  dynamicBadgeWrap: { borderRadius: radius.pill },
  dynamicBadgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  dynamicBadgeText: { ...typography.label, fontSize: 12, color: '#FFFFFF', fontWeight: '700' },
  crewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  crewText: { ...typography.label, fontSize: 12, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyAction: { marginTop: spacing.md, width: '100%', maxWidth: 260 },
});
