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

function label(n: NotificationItem) {
  return n.kind === 'mention_everyone'
    ? `${n.actorName} notified everyone in ${n.groupName}`
    : `${n.actorName} mentioned you in ${n.groupName}`;
}

export default function NotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const { items, loading, markRead } = useNotifications(session?.user.id);

  function openNotification(n: NotificationItem) {
    markRead(n.id);
    navigation.navigate('Chat', { groupId: n.groupId, jumpToMessageId: n.messageId });
  }

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="Notifications"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
        />

        {loading ? (
          <EmptyState emoji="⏳" text="catching up..." />
        ) : items.length === 0 ? (
          <EmptyState emoji="🔔" text="nothing yet. peaceful, actually." />
        ) : (
          <FlatList
            data={items}
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
                      emoji={item.actorEmoji}
                      label={item.actorName}
                      size={40}
                      ringColors={[item.actorColor, colors.secondary]}
                    />
                  )}
                  <View style={styles.copy}>
                    <Text style={styles.label}>{label(item)}</Text>
                    <Text style={styles.snippet} numberOfLines={1}>
                      {item.messageDeleted ? 'Original message was deleted' : item.messageText}
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
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  rowUnread: {
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
    borderColor: 'rgba(129, 140, 248, 0.24)',
  },
  unreadDot: {
    position: 'absolute',
    left: 6,
    top: '50%',
    marginTop: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  everyoneIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
  copy: { flex: 1, gap: 2 },
  label: { ...typography.bodyMedium, fontSize: 14.5, color: colors.onSurface },
  snippet: { ...typography.caption, fontSize: 12.5, color: colors.onSurfaceVariant },
  time: { ...typography.micro, fontSize: 11, color: colors.outline, alignSelf: 'flex-start' },
});
