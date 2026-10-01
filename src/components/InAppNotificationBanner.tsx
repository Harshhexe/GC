import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { Avatar } from './ui/Avatar';
import { colors, radius, spacing, typography } from '../theme/theme';
import { useAppearance } from '../context/AppearanceContext';

export type InAppNotificationData = {
  id: string;
  type?: 'message' | '11_11' | 'tea_started' | 'awards' | 'group_stats';
  groupId?: string;
  messageId?: string;
  title: string;
  body: string;
  groupName?: string;
  groupEmoji?: string;
  groupAvatarUrl?: string | null;
  authorName?: string;
  authorEmoji?: string | null;
  authorColor?: string | null;
  authorAvatarUrl?: string | null;
  isMention?: boolean;
  oneWord?: string;
};

type Props = {
  onTap: (target: { groupId: string; messageId?: string }) => void;
  activeGroupId?: string | null;
};

export function InAppNotificationBanner({ onTap, activeGroupId }: Props) {
  const { theme } = useAppearance();
  const palette = theme.palette;
  const insets = useSafeAreaInsets();
  const [currentNotif, setCurrentNotif] = useState<InAppNotificationData | null>(null);
  const translateY = useSharedValue(-180);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideBanner = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    translateY.value = withTiming(-180, { duration: 250 }, (finished) => {
      if (finished) {
        runOnJS(setCurrentNotif)(null);
      }
    });
  }, [translateY]);

  const showNotification = useCallback(
    (notif: InAppNotificationData) => {
      // Don't show banner if user is currently inside this chat
      if (notif.groupId && notif.groupId === activeGroupId) {
        return;
      }

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      setCurrentNotif(notif);
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 120,
        mass: 0.8,
      });

      // Auto dismiss after 4.5 seconds
      hideTimerRef.current = setTimeout(() => {
        hideBanner();
      }, 4500);
    },
    [activeGroupId, hideBanner, translateY]
  );

  useEffect(() => {
    // Listen for notifications received while app is in foreground
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      try {
        const content = notification.request.content;
        const data = (content.data || {}) as Record<string, any>;
        const title = content.title || 'GC';
        const body = content.body || '';

        showNotification({
          id: notification.request.identifier,
          type: data.type || 'message',
          groupId: data.groupId,
          messageId: data.messageId,
          title,
          body,
          groupName: data.groupName,
          groupEmoji: data.groupEmoji,
          groupAvatarUrl: data.groupAvatarUrl,
          authorName: data.authorName,
          authorEmoji: data.authorEmoji,
          authorColor: data.authorColor,
          authorAvatarUrl: data.authorAvatarUrl,
          isMention: title.includes('mentioned you'),
        });
      } catch (e) {
        console.warn('[InAppNotification] error parsing incoming notification:', e);
      }
    });

    return () => {
      sub.remove();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showNotification]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!currentNotif) return null;

  const isTea = currentNotif.type === 'tea_started';
  const is1111 = currentNotif.type === '11_11';
  const isAwards = currentNotif.type === 'awards';
  const isStats = currentNotif.type === 'group_stats';

  const handlePress = () => {
    const gid = currentNotif.groupId;
    const mid = currentNotif.messageId;
    hideBanner();
    if (gid) {
      onTap({ groupId: gid, messageId: mid });
    }
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { top: insets.top > 0 ? insets.top + 6 : 14 },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[
          styles.container,
          isTea && styles.containerTea,
          is1111 && styles.container1111,
          isAwards && styles.containerAwards,
          isStats && styles.containerStats,
          currentNotif.isMention && styles.containerMention,
          { backgroundColor: palette.surfaceLow, borderColor: palette.border },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${currentNotif.groupName || currentNotif.title}. ${currentNotif.body}`}
      >
        {/* Top Accent Strip */}
        <View
          style={[
            styles.accentBar,
            isTea && { backgroundColor: '#10B981' },
            is1111 && { backgroundColor: '#FBBF24' },
            isAwards && { backgroundColor: '#F59E0B' },
            isStats && { backgroundColor: '#38BDF8' },
            currentNotif.isMention && { backgroundColor: '#F472B6' },
          ]}
        />

        <View style={styles.contentRow}>
          {/* Avatar / Icon */}
          <View style={styles.avatarWrap}>
            {is1111 ? (
              <View style={[styles.specialIconBox, { backgroundColor: '#2E2208', borderColor: '#FBBF24' }]}>
                <Text style={{ fontSize: 20 }}>✨</Text>
              </View>
            ) : isTea ? (
              <View style={[styles.specialIconBox, { backgroundColor: '#0A2518', borderColor: '#10B981' }]}>
                <Text style={{ fontSize: 20 }}>🍵</Text>
              </View>
            ) : isAwards ? (
              <View style={[styles.specialIconBox, { backgroundColor: '#2E2208', borderColor: '#F59E0B' }]}>
                <Text style={{ fontSize: 20 }}>🏆</Text>
              </View>
            ) : isStats ? (
              <View style={[styles.specialIconBox, { backgroundColor: '#0C2033', borderColor: '#38BDF8' }]}>
                <Text style={{ fontSize: 20 }}>📊</Text>
              </View>
            ) : currentNotif.authorAvatarUrl ? (
              <Avatar
                imageUrl={currentNotif.authorAvatarUrl}
                emoji={currentNotif.authorEmoji || '👤'}
                label={currentNotif.authorName || 'GC'}
                size={40}
                ringColors={[currentNotif.authorColor || colors.primary, colors.secondary]}
              />
            ) : currentNotif.groupAvatarUrl ? (
              <Avatar
                imageUrl={currentNotif.groupAvatarUrl}
                emoji={currentNotif.groupEmoji || '💬'}
                label={currentNotif.groupName || 'GC'}
                size={40}
                ringColors={[colors.primary, colors.secondary]}
              />
            ) : currentNotif.groupEmoji ? (
              <View style={[styles.groupEmojiBox, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
                <Text style={{ fontSize: 20 }}>{currentNotif.groupEmoji}</Text>
              </View>
            ) : (
              <Avatar
                imageUrl={currentNotif.authorAvatarUrl}
                emoji={currentNotif.authorEmoji || '👤'}
                label={currentNotif.authorName || 'GC'}
                size={40}
                ringColors={[currentNotif.authorColor || colors.primary, colors.secondary]}
              />
            )}
          </View>

          {/* Copy Area */}
          <View style={styles.copyArea}>
            <View style={styles.headerLine}>
              <Text style={[styles.groupTitle, { color: palette.onSurface }]} numberOfLines={1}>
                {currentNotif.groupName || currentNotif.title}
              </Text>
              {currentNotif.isMention ? (
                <View style={styles.mentionBadge}>
                  <Text style={styles.mentionBadgeText}>@mention</Text>
                </View>
              ) : isTea ? (
                <View style={[styles.mentionBadge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                  <Text style={[styles.mentionBadgeText, { color: '#10B981' }]}>Tea Live</Text>
                </View>
              ) : is1111 ? (
                <View style={[styles.mentionBadge, { backgroundColor: 'rgba(251, 191, 36, 0.2)' }]}>
                  <Text style={[styles.mentionBadgeText, { color: '#FBBF24' }]}>11:11</Text>
                </View>
              ) : isStats ? (
                <View style={[styles.mentionBadge, { backgroundColor: 'rgba(56, 189, 248, 0.2)' }]}>
                  <Text style={[styles.mentionBadgeText, { color: '#38BDF8' }]}>Stats Live</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.bodyText, { color: palette.onSurfaceVariant }]} numberOfLines={2}>
              {currentNotif.body}
            </Text>
          </View>

          {/* Dismiss Button */}
          <Pressable
            style={styles.closeBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            onPress={(e) => {
              e.stopPropagation();
              hideBanner();
            }}
          >
            <Ionicons name="close" size={16} color={palette.onSurfaceVariant} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 99999,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  containerTea: {
    borderColor: colors.border,
  },
  container1111: {
    borderColor: colors.border,
  },
  containerAwards: {
    borderColor: colors.border,
  },
  containerStats: {
    borderColor: colors.border,
  },
  containerMention: {
    borderColor: colors.border,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    marginTop: 2,
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupEmojiBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#1E1B2E',
    borderWidth: 1,
    borderColor: '#373256',
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyArea: {
    flex: 1,
    gap: 3,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  mentionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(244, 114, 182, 0.2)',
  },
  mentionBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: '#F472B6',
  },
  bodyText: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#CBD5E1',
    lineHeight: 16,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
