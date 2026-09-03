import React, { useMemo, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useNotifications, NotificationItem } from '../hooks/useNotifications';
import { timeAgo } from '../utils/time';
import { successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

type NotificationFilter = 'all' | 'mention' | 'private_comment' | 'mention_everyone';

const FILTERS: { id: NotificationFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'All', icon: 'sparkles-outline' },
  { id: 'mention', label: 'Mentions', icon: 'at-outline' },
  { id: 'private_comment', label: 'Comments', icon: 'lock-closed-outline' },
  { id: 'mention_everyone', label: 'Announcements', icon: 'megaphone-outline' },
];

export default function NotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications(session?.user.id);
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const mentions = useMemo(
    () =>
      items.filter(
        (n) =>
          n.kind === 'mention' ||
          n.kind === 'mention_everyone' ||
          n.kind === 'private_comment'
      ),
    [items]
  );

  const filteredMentions = useMemo(() => {
    if (filter === 'all') return mentions;
    return mentions.filter((n) => n.kind === filter);
  }, [mentions, filter]);

  function handleMarkAllRead() {
    successFeedback();
    markAllRead();
  }

  function openNotification(n: NotificationItem) {
    if (!n.groupId) return;
    markRead(n.id);

    const state = navigation.getState();
    const previousRoute = state?.routes ? state.routes[state.routes.length - 2] : null;

    if (
      previousRoute &&
      previousRoute.name === 'Chat' &&
      (previousRoute.params as any)?.groupId === n.groupId
    ) {
      navigation.navigate({
        name: 'Chat',
        params: { groupId: n.groupId, jumpToMessageId: n.messageId },
        merge: true,
      });
    } else if (Platform.OS === 'web') {
      navigation.navigate('Chat', { groupId: n.groupId, jumpToMessageId: n.messageId });
    } else {
      navigation.replace('Chat', { groupId: n.groupId, jumpToMessageId: n.messageId });
    }
  }

  return (
    <View style={styles.root}>
      <AmbientBackground tint="#818CF8" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.webContainer}>
          <AppHeader
            title="Mentions & Activity"
            left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
            right={
              unreadCount > 0 ? (
                <PressableScale
                  scaleTo={0.92}
                  haptic="light"
                  onPress={handleMarkAllRead}
                  style={styles.markAllBtn}
                >
                  <Ionicons name="checkmark-done" size={15} color="#818CF8" />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </PressableScale>
              ) : undefined
            }
          />

          {/* Filter Pills */}
          {mentions.length > 0 && (
            <View style={styles.filterRow}>
              {FILTERS.map((f) => {
                const count =
                  f.id === 'all'
                    ? mentions.length
                    : mentions.filter((n) => n.kind === f.id).length;
                if (count === 0 && f.id !== 'all') return null;
                const isActive = filter === f.id;

                return (
                  <PressableScale
                    key={f.id}
                    scaleTo={0.94}
                    haptic="light"
                    onPress={() => setFilter(f.id)}
                    style={[
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                    ]}
                  >
                    <Ionicons
                      name={f.icon}
                      size={13}
                      color={isActive ? '#FFFFFF' : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {f.label} ({count})
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          )}

          {loading ? (
            <EmptyState emoji="⏳" text="Catching up on mentions..." />
          ) : filteredMentions.length === 0 ? (
            <EmptyState
              emoji="✨"
              text={
                filter === 'all'
                  ? "No mentions yet. You're all caught up!"
                  : `No ${filter.replace('_', ' ')}s found.`
              }
            />
          ) : (
            <FlatList
              data={filteredMentions}
              keyExtractor={(n) => n.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const isUnread = !item.readAt;
                const isComment = item.kind === 'private_comment';
                const isEveryone = item.kind === 'mention_everyone';

                return (
                  <Animated.View
                    entering={FadeInDown.delay(Math.min(index, 7) * STAGGER_MS)
                      .duration(duration.slow)
                      .easing(easing.out)
                      .reduceMotion(reduceMotion)}
                  >
                    <PressableScale
                      style={[styles.row, isUnread && styles.rowUnread]}
                      scaleTo={0.98}
                      haptic="light"
                      onPress={() => openNotification(item)}
                    >
                      {isUnread && (
                        <LinearGradient
                          colors={['rgba(129, 140, 248, 0.14)', 'rgba(99, 102, 241, 0.03)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
                          pointerEvents="none"
                        />
                      )}

                      {isUnread && <View style={styles.unreadDot} />}

                      {isComment ? (
                        <View style={styles.commentAvatarWrap}>
                          <Ionicons name="lock-closed" size={18} color="#A78BFA" />
                        </View>
                      ) : isEveryone ? (
                        <View style={styles.everyoneIcon}>
                          <Ionicons name="megaphone" size={18} color="#818CF8" />
                        </View>
                      ) : (
                        <Avatar
                          imageUrl={item.actorAvatarUrl}
                          emoji={item.actorEmoji}
                          label={item.actorName}
                          size={46}
                          ringColors={[item.actorColor || '#818CF8', colors.secondary]}
                        />
                      )}

                      <View style={styles.copy}>
                        <View style={styles.headerRow}>
                          <Text style={styles.actorName} numberOfLines={1}>
                            {isComment
                              ? item.actorName
                              : isEveryone
                              ? 'Everyone'
                              : item.actorName}
                          </Text>

                          {!!item.groupName && (
                            <View style={styles.groupBadge}>
                              <Ionicons name="chatbubbles-outline" size={10} color="#818CF8" />
                              <Text style={styles.groupBadgeText} numberOfLines={1}>
                                {item.groupName}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.label}>
                          {isComment
                            ? 'commented privately on your message'
                            : isEveryone
                            ? 'notified everyone in the group'
                            : 'mentioned you in a message'}
                        </Text>

                        {/* Quoted Bubble Snippet */}
                        <View style={styles.snippetBubble}>
                          <Text style={styles.snippet} numberOfLines={2}>
                            {item.messageDeleted
                              ? 'Original message was deleted'
                              : item.messageText || 'Sent media'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.metaCol}>
                        <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                        <View style={styles.jumpPill}>
                          <Ionicons name="arrow-forward" size={12} color="#818CF8" />
                        </View>
                      </View>
                    </PressableScale>
                  </Animated.View>
                );
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, minHeight: 0 },
  webContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    minHeight: 0,
  },

  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.28)',
  },
  markAllText: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#818CF8',
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  list: {
    padding: CONTAINER_MARGIN,
    gap: spacing.sm + 2,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md + 1,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    position: 'relative',
  },
  rowUnread: {
    backgroundColor: 'rgba(21, 20, 36, 0.95)',
    borderColor: 'rgba(129, 140, 248, 0.40)',
  },
  unreadDot: {
    position: 'absolute',
    left: 8,
    top: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#818CF8',
  },

  everyoneIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(129, 140, 248, 0.35)',
  },
  commentAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },

  copy: {
    flex: 1,
    gap: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  actorName: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.onSurface,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  groupBadgeText: {
    ...typography.caption,
    fontSize: 10.5,
    fontWeight: '600',
    color: '#A5B4FC',
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  snippetBubble: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderLeftWidth: 2,
    borderLeftColor: '#818CF8',
  },
  snippet: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#E2E8F0',
    lineHeight: 18,
  },

  metaCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 46,
    gap: 8,
  },
  time: {
    ...typography.micro,
    fontSize: 11,
    color: colors.outline,
  },
  jumpPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
});
