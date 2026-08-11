import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
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
import { groupTheme } from '../theme/groupThemes';
import { copy, pick } from '../theme/copy';
import { EmptyState } from '../components/EmptyState';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { PressableScale } from '../components/ui/PressableScale';
import { GlassPanel } from '../components/ui/Glass';
import { Avatar } from '../components/ui/Avatar';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { timeAgo } from '../utils/time';
import { Group } from '../types';
import { useGroups } from '../hooks/useGroups';
import { useAfterHours } from '../hooks/useAfterHours';
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

function isDeadChat(group: Group) {
  if (!group.lastMessageAt) return false;
  return Date.now() - new Date(group.lastMessageAt).getTime() > DEAD_CHAT_MS;
}

function GroupCard({
  group,
  index,
  onOpen,
  onSummary,
  onCrew,
}: {
  group: Group;
  index: number;
  onOpen: () => void;
  onSummary: () => void;
  onCrew: () => void;
}) {
  const dead = isDeadChat(group);

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
            ringColors={groupTheme(group.theme).colors}
            size={58}
            status={dead ? 'offline' : 'online'}
          />

          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.groupName} numberOfLines={1}>
                {group.name}
              </Text>
              {!!group.lastMessageAt && (
                <Text style={styles.time}>{timeAgo(group.lastMessageAt)}</Text>
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
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {group.unreadCount > 99 ? '99+' : group.unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </PressableScale>

        <View style={styles.actionRow}>
          <PressableScale style={styles.summaryWrap} haptic="medium" onPress={onSummary}>
            <LinearGradient
              colors={gradients.cta}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.summaryButton, shadows.glow]}
            >
              <Ionicons name="stats-chart" size={15} color="#FFFFFF" />
              <Text style={styles.summaryText}>Summary</Text>
            </LinearGradient>
          </PressableScale>

          <PressableScale style={styles.crewButton} scaleTo={0.94} onPress={onCrew}>
            <Ionicons name="people" size={15} color={colors.primary} />
            <Text style={styles.crewText}>{group.memberCount}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.outline} />
          </PressableScale>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

export default function GroupListScreen({ navigation }: Props) {
  const { groups, loading, refetch } = useGroups();
  const { profile } = useAuth();
  const { afterHours } = useAfterHours();

  const [emptyText] = useState(() => pick(copy.emptyGroups));
  const [loadingText] = useState(() => pick(copy.loadingGroups));

  // Coming back from a chat means a badge just got cleared server-side, and
  // that write produces no realtime event of its own — so re-pull on focus.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          wordmark
          right={
            <PressableScale scaleTo={0.9} onPress={() => navigation.navigate('Profile')}>
              <Avatar
                emoji={profile?.avatar_emoji}
                imageUrl={profile?.avatar_url}
                label={profile?.display_name}
                size={38}
                status="online"
              />
            </PressableScale>
          }
        />

        <Animated.View
          entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
          style={styles.titleBlock}
        >
          <Text style={styles.title}>Your GCs</Text>
          <Text style={styles.subtitle}>
            {afterHours
              ? 'you should be asleep 🌚'
              : profile
                ? `hey ${profile.display_name} 👋`
                : 'where the group chat has a life of its own'}
          </Text>
        </Animated.View>

        {loading ? (
          <EmptyState emoji="⏳" text={loadingText} />
        ) : groups.length === 0 ? (
          <EmptyState emoji="👻" text={emptyText} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <GroupCard
                group={item}
                index={index}
                onOpen={() =>
                  navigation.navigate('Chat', {
                    groupId: item.id,
                    unreadCount: item.unreadCount,
                  })
                }
                onSummary={() =>
                  navigation.navigate('WhatDidIMiss', { groupId: item.id, groupName: item.name })
                }
                onCrew={() => navigation.navigate('GroupInfo', { groupId: item.id })}
              />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  titleBlock: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  title: { ...typography.headline, color: colors.onSurface },
  subtitle: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: 4 },
  list: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.lg,
  },
  cardWrap: { borderRadius: radius.lg },
  cardTop: { flexDirection: 'row', gap: spacing.lg, padding: spacing.lg, alignItems: 'center' },
  cardCopy: { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupName: { ...typography.title, color: colors.onSurface, flex: 1 },
  time: { ...typography.micro, color: colors.primary },
  cardMessageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lastMessage: { ...typography.body, color: colors.onSurfaceVariant, flex: 1 },
  lastMessageAuthor: { fontFamily: typography.label.fontFamily, color: colors.onSurface },
  lastMessageDead: { color: colors.outline, fontStyle: 'italic' },
  badge: {
    minWidth: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: { ...typography.label, fontSize: 13, color: colors.onSecondary },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryWrap: { borderRadius: radius.pill },
  summaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  summaryText: { ...typography.label, fontSize: 13, color: '#FFFFFF' },
  crewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(208, 188, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.30)',
  },
  crewText: { ...typography.label, fontSize: 13, color: colors.primary },
});
