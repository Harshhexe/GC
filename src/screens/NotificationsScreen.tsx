import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useNotifications, NotificationItem } from '../hooks/useNotifications';
import { timeAgo } from '../utils/time';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const { items, loading, markRead } = useNotifications(session?.user.id);

  // Filter strictly to mentions
  const mentions = items.filter(
    (n) => n.kind === 'mention' || n.kind === 'mention_everyone'
  );

  function openNotification(n: NotificationItem) {
    markRead(n.id);
    navigation.navigate('Chat', { groupId: n.groupId, jumpToMessageId: n.messageId });
  }

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="Mentions"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
        />

        {loading ? (
          <EmptyState emoji="⏳" text="catching up..." />
        ) : mentions.length === 0 ? (
          <EmptyState emoji="✨" text="no mentions yet. you're all caught up!" />
        ) : (
          <FlatList
            data={mentions}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 8) * STAGGER_MS)
                  .duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <PressableScale
                  style={[styles.row, !item.readAt && styles.rowUnread]}
                  scaleTo={0.98}
                  onPress={() => openNotification(item)}
                >
                  {!item.readAt && <View style={styles.unreadDot} />}

                  {item.kind === 'mention_everyone' ? (
                    <View style={styles.everyoneIcon}>
                      <Ionicons name="megaphone" size={18} color={colors.primary} />
                    </View>
                  ) : (
                    <Avatar
                      imageUrl={item.actorAvatarUrl}
                      emoji={item.actorEmoji}
                      label={item.actorName}
                      size={42}
                      ringColors={[item.actorColor, colors.secondary]}
                    />
                  )}

                  <View style={styles.copy}>
                    <View style={styles.headerRow}>
                      <Text style={styles.actorName} numberOfLines={1}>
                        {item.kind === 'mention_everyone' ? 'Everyone' : item.actorName}
                      </Text>
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText} numberOfLines={1}>
                          {item.groupName}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.label}>
                      {item.kind === 'mention_everyone'
                        ? 'notified everyone in the group'
                        : 'mentioned you in a message'}
                    </Text>

                    <Text style={styles.snippet} numberOfLines={2}>
                      {item.messageDeleted
                        ? 'Original message was deleted'
                        : item.messageText || 'Sent media'}
                    </Text>
                  </View>

                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </PressableScale>
              </Animated.View>
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
  list: { padding: CONTAINER_MARGIN, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#13121D', // Solid dark card
    borderWidth: 1,
    borderColor: '#26243A',
  },
  rowUnread: {
    backgroundColor: '#1A1828',
    borderColor: 'rgba(129, 140, 248, 0.4)',
  },
  unreadDot: {
    position: 'absolute',
    left: 8,
    top: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  everyoneIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actorName: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.onSurface,
  },
  groupBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  groupBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#A5B4FC',
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  snippet: {
    ...typography.caption,
    fontSize: 13,
    color: '#E2E8F0',
    marginTop: 2,
    lineHeight: 17,
  },
  time: {
    ...typography.micro,
    fontSize: 11,
    color: colors.outline,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
