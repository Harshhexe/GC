import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
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
  const isActive = session?.status === 'active';

  if (!session) return null;

  const generating = session.status === 'generating';
  const failed = session.status === 'failed';

  const accent = isActive || generating ? '#FBBF24' : failed ? colors.error : colors.secondary;

  const title = isActive
    ? 'Tea is live'
    : generating
      ? 'Making the Tea report'
      : failed
        ? 'Tea report'
        : 'Tea report';

  const subtitle = isActive
    ? `Started by ${session.startedByName} · Tap to view`
    : generating
      ? 'GC is putting the conversation together…'
      : failed
        ? "Couldn't brew it — tap to retry"
        : 'Open the report';

  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <GlassPanel borderRadius={radius.md} style={styles.container}>
        <PressableScale style={styles.tapArea} scaleTo={0.98} haptic="light" onPress={onPress}>
          <View style={[styles.iconWrap, { backgroundColor: `${accent}16` }]}>
            <Text style={styles.teaEmoji}>🍵</Text>
          </View>
          <View style={styles.copyArea}>
            <Text style={styles.title}>{title}</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLow,
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
  title: { ...typography.label, fontSize: 13, fontWeight: '700', color: colors.onSurface },
  subtitle: { ...typography.caption, color: colors.onSurface, fontSize: 12.5 },
});
