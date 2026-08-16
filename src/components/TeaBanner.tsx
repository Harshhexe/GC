import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { GlassPanel } from './ui/Glass';
import type { TeaSession } from '../hooks/useTeaSession';

/**
 * The persistent Tea strip at the top of the chat.
 *
 * Sits in the same header slot as PinnedBanner (above the message list, not
 * inside it) so it stays put while the conversation scrolls underneath —
 * which is the point: while Tea is on, it should never leave the screen.
 */
export function TeaBanner({
  session,
  onPress,
}: {
  session: TeaSession | null;
  onPress: () => void;
}) {
  const pulse = useSharedValue(0);
  const isActive = session?.status === 'active';

  useEffect(() => {
    if (!isActive) return;
    // Only while Tea is live — a report banner shouldn't breathe at you.
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: easing.inOut, reduceMotion }),
      -1,
      true
    );
  }, [isActive, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: isActive ? interpolate(pulse.value, [0, 1], [0.55, 1]) : 1,
  }));

  if (!session) return null;

  const generating = session.status === 'generating';
  const failed = session.status === 'failed';

  const accent = isActive || generating ? '#FBBF24' : failed ? colors.error : colors.secondary;

  const title = isActive
    ? '🍵 TEA IS GOING ON'
    : generating
      ? '🍵 BREWING THE REPORT'
      : failed
        ? '🍵 TEA REPORT'
        : '🍵 TEA REPORT';

  const subtitle = isActive
    ? `Started by ${session.startedByName} · Tap to view`
    : generating
      ? 'GC is reading the whole thing...'
      : failed
        ? "Couldn't brew it — tap to retry"
        : 'Tap to see what happened 👀';

  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <GlassPanel borderRadius={radius.md} style={[styles.container, { borderColor: `${accent}55` }]}>
        <PressableScale style={styles.tapArea} scaleTo={0.98} haptic="light" onPress={onPress}>
          <Animated.View style={[styles.iconWrap, { backgroundColor: `${accent}26` }, pulseStyle]}>
            <Text style={styles.teaEmoji}>🍵</Text>
          </Animated.View>
          <View style={styles.copyArea}>
            <Text style={[styles.title, { color: accent }]}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.outline} />
        </PressableScale>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.md, marginTop: spacing.xs, marginBottom: spacing.xs },
  container: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    backgroundColor: 'rgba(48, 32, 12, 0.72)',
  },
  tapArea: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teaEmoji: { fontSize: 14 },
  copyArea: { flex: 1, gap: 1 },
  title: { ...typography.micro, fontWeight: '800', letterSpacing: 0.6 },
  subtitle: { ...typography.caption, color: colors.onSurface, fontSize: 12.5 },
});
