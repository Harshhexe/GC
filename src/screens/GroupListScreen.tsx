import { useCallback, useState, memo } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { copy, pick } from '../theme/copy';
import { EmptyState } from '../components/EmptyState';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { PressableScale } from '../components/ui/PressableScale';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton } from '../components/ui/Buttons';
import { Avatar } from '../components/ui/Avatar';
import { AppHeader } from '../components/ui/AppHeader';
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
const GROUP_LIST_BG = require('../../assets/GroupListBG.png');

function isDeadChat(group: Group) {
  if (!group.lastMessageAt) return false;
  return Date.now() - new Date(group.lastMessageAt).getTime() > DEAD_CHAT_MS;
}

/**
 * Evaluates the real-time activity state of the GC to build the dynamic live pill badge.
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
      icon: 'cafe',
      label: 'Live Tea',
      gradient: ['#10B981', '#059669'],
      glowStyle: shadows.glowCyan,
      onPress: onOpenChat,
    };
  }

  // 2. Fresh weekly awards available
  if (group.hasRecentAwards) {
    return {
      icon: 'trophy',
      label: 'GC Awards',
      gradient: ['#F59E0B', '#D97706'],
      glowStyle: shadows.glow,
      onPress: onCatchUp,
    };
  }

  // 3. Popping off — large unread message burst (20+ messages)
  if (group.unreadCount >= 20) {
    return {
      icon: 'flame',
      label: 'Popping Off',
      gradient: ['#F43F5E', '#BE185D'],
      glowStyle: shadows.glowPink,
      onPress: onCatchUp,
    };
  }

  // 4. Unread messages needing catch-up
  if (group.unreadCount > 0) {
    return {
      icon: 'sparkles',
      label: `Catch Up (${group.unreadCount})`,
      gradient: theme.colors,
      glowStyle: shadows.glow,
      onPress: onCatchUp,
    };
  }

  // 5. Dead chat needing a revive
  if (dead) {
    return {
      icon: 'skull-outline',
      label: 'Revive Chat',
      gradient: ['#374151', '#1F2937'],
      glowStyle: {},
      onPress: onOpenChat,
    };
  }

  // 6. Default all caught up state
  return {
    icon: 'sparkles',
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
  onOpen: () => void;
  onCatchUp: () => void;
  onCrew: () => void;
}) {
  const dead = isDeadChat(group);
  const theme = groupTheme(group.theme);
  const badge = getLiveBadgeConfig(group, theme, onOpen, onCatchUp);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * STAGGER_MS)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
      style={styles.cardWrap}
    >
      <GlassPanel borderRadius={radius.lg}>
        <PressableScale style={styles.cardTop} scaleTo={0.985} onPress={onOpen}>
          <Avatar
            emoji={dead ? '🪦' : group.emoji}
            imageUrl={dead ? undefined : group.avatarUrl}
            ringColors={theme.colors}
            size={58}
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
                  copy.deadChat
                ) : group.lastMessage ? (
                  <>
                    {!!group.lastMessageAuthor && (
                      <Text style={styles.lastMessageAuthor}>{group.lastMessageAuthor}: </Text>
                    )}
                    {group.lastMessage}
                  </>
                ) : (
                  'nothing yet. suspicious.'
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

        {/* Action Row with Dynamic Live Pulse Badge and Crew Button */}
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
              { backgroundColor: `${theme.accent}1A`, borderColor: `${theme.accent}4D` },
            ]}
            scaleTo={0.94}
            onPress={onCrew}
          >
            <Ionicons name="people" size={15} color={theme.accent} />
            <Text style={[styles.crewText, { color: theme.accent }]}>{group.memberCount}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.accent} />
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

  const [emptyText] = useState(() => pick(copy.emptyGroups));
  const [loadingText] = useState(() => pick(copy.loadingGroups));

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const renderGroupItem = useCallback(
    ({ item, index }: { item: Group; index: number }) => (
      <GroupCard
        group={item}
        index={index}
        onOpen={() =>
          navigation.navigate('Chat', {
            groupId: item.id,
            unreadCount: item.unreadCount,
          })
        }
        onCatchUp={() =>
          navigation.navigate('WhatDidIMiss', { groupId: item.id, groupName: item.name })
        }
        onCrew={() => navigation.navigate('GroupInfo', { groupId: item.id })}
      />
    ),
    [navigation]
  );

  return (
    <View style={styles.root}>
      <Image
        source={GROUP_LIST_BG}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <AmbientBackground hideBaseBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="GC"
          subtitle="group chat with personality"
          right={
            <View style={styles.headerRight}>
              <PressableScale
                style={styles.bellButton}
                scaleTo={0.88}
                hitSlop={6}
                onPress={() => navigation.navigate('Notifications')}
              >
                <Ionicons name="notifications-outline" size={21} color={colors.onSurface} />
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
                  emoji={profile?.avatar_emoji ?? '😎'}
                  imageUrl={profile?.avatar_url}
                  label={profile?.display_name ?? 'Me'}
                  size={32}
                />
              </PressableScale>
            </View>
          }
        />

        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Your GCs</Text>
          <Text style={styles.heroGreeting}>
            hey {profile?.display_name ? profile.display_name.split(' ')[0] : 'friend'} 👋
          </Text>
        </View>

        {loading ? (
          <EmptyState emoji="⏳" text={loadingText} />
        ) : groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState emoji="🦗" text={emptyText} />
            <GCButton
              label="Create a GC"
              onPress={() => navigation.navigate('AddGC', { mode: 'create' })}
              variant="gradient"
              neo
              style={styles.emptyAction}
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
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
    paddingBottom: spacing.sm,
    gap: 2,
  },
  heroTitle: {
    ...typography.headline,
    fontSize: 28,
    color: colors.onSurface,
  },
  heroGreeting: {
    ...typography.caption,
    fontSize: 14,
    color: colors.onSurfaceVariant,
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
  groupName: { ...typography.title, fontSize: 18, color: colors.onSurface, flex: 1 },
  time: { ...typography.caption, fontSize: 12, fontWeight: '600' },
  cardMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  lastMessage: { ...typography.body, fontSize: 14, color: colors.onSurfaceVariant, flex: 1 },
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  dynamicBadgeText: { ...typography.label, fontSize: 12.5, color: '#FFFFFF', fontWeight: '700' },
  crewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(208, 188, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.30)',
  },
  crewText: { ...typography.label, fontSize: 12.5, color: colors.primary, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyAction: { marginTop: spacing.md, width: '100%', maxWidth: 260 },
});
