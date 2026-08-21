import React from 'react';
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

  // Mentions plus private comments — both are "someone addressed you
  // directly", which is what this screen is for.
  const mentions = items.filter(
    (n) =>
      n.kind === 'mention' || n.kind === 'mention_everyone' || n.kind === 'private_comment'
  );

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
      // In WebShell paneNavigation, navigate('Chat') seamlessly selects the 2-pane chat
      navigation.navigate('Chat', { groupId: n.groupId, jumpToMessageId: n.messageId });
    } else {
      navigation.replace('Chat', { groupId: n.groupId, jumpToMessageId: n.messageId });
    }
  }

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.webContainer}>
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
                    {!item.readAt && (
                      <LinearGradient
                        colors={['rgba(129, 140, 248, 0.12)', 'rgba(99, 102, 241, 0.03)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
                        pointerEvents="none"
                      />
                    )}

                    {!item.readAt && <View style={styles.unreadDot} />}

                    {item.kind === 'private_comment' ? (
                      <Ionicons name="lock-closed" size={14} color={colors.primary} />
                    ) : item.kind === 'mention_everyone' ? (
                      <View style={styles.everyoneIcon}>
                        <Ionicons name="megaphone" size={18} color="#818CF8" />
                      </View>
                    ) : (
                      <Avatar
                        imageUrl={item.actorAvatarUrl}
                        emoji={item.actorEmoji}
                        label={item.actorName}
                        size={44}
                        ringColors={[item.actorColor, colors.secondary]}
                      />
                    )}

                    <View style={styles.copy}>
                      <View style={styles.headerRow}>
                        <Text style={styles.actorName} numberOfLines={1}>
                          {item.kind === 'private_comment'
                            ? item.actorName
                            : item.kind === 'mention_everyone'
                              ? 'Everyone'
                              : item.actorName}
                        </Text>
                        <View style={styles.groupBadge}>
                          <Text style={styles.groupBadgeText} numberOfLines={1}>
                            {item.groupName}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.label}>
                        {item.kind === 'private_comment'
                          ? ' commented privately on your message'
                          : item.kind === 'mention_everyone'
                          ? 'notified everyone in the group'
                          : 'mentioned you in a message'}
                      </Text>

                      <Text style={styles.snippet} numberOfLines={2}>
                        {item.messageDeleted
                          ? 'Original message was deleted'
                          : item.messageText || 'Sent media'}
                      </Text>
                    </View>

                    <View style={styles.metaCol}>
                      <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                      <View style={styles.jumpPill}>
                        <Ionicons name="arrow-forward" size={12} color="#818CF8" />
                      </View>
                    </View>
                  </PressableScale>
                </Animated.View>
              )}
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
  list: {
    padding: CONTAINER_MARGIN,
    gap: spacing.sm + 2,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#13121D', // Solid dark card
    borderWidth: 1,
    borderColor: '#26243A',
    overflow: 'hidden',
  },
  rowUnread: {
    backgroundColor: '#161426',
    borderColor: 'rgba(129, 140, 248, 0.45)',
  },
  unreadDot: {
    position: 'absolute',
    left: 7,
    top: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#818CF8',
  },
  everyoneIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(129, 140, 248, 0.35)',
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
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
    marginTop: 3,
    lineHeight: 18,
  },
  metaCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    minHeight: 44,
    gap: 6,
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
