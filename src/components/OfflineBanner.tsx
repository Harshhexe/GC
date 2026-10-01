import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { reduceMotion } from '../theme/motion';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { selectFeedback } from '../utils/haptics';

type Props = {
  isOnline: boolean;
  isReconnecting?: boolean;
  onRetry?: () => void;
};

export function OfflineBanner({ isOnline, isReconnecting = false, onRetry }: Props) {
  if (isOnline && !isReconnecting) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(260).reduceMotion(reduceMotion)}
      exiting={SlideOutUp.duration(220)}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          {isReconnecting ? (
            <ActivityIndicator size="small" color="#FBBF24" />
          ) : (
            <Ionicons name="cloud-offline" size={16} color="#F87171" />
          )}
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>
            {isReconnecting ? 'Reconnecting…' : "You're offline"}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {isReconnecting
              ? 'Attempting to restore live connection'
              : 'Messages will send automatically when online'}
          </Text>
        </View>

        {onRetry && !isReconnecting && (
          <PressableScale
            scaleTo={0.92}
            haptic="medium"
            onPress={() => {
              selectFeedback();
              onRetry();
            }}
            style={styles.retryBtn}
          >
            <Ionicons name="refresh" size={13} color={colors.onSurface} />
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceLow,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.label,
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.onSurface,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
  retryText: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.onSurface,
  },
});
