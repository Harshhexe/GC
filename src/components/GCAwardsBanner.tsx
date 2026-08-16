import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { GlassPanel } from './ui/Glass';
import type { WeeklyAwardsResult } from '../lib/ai';

const AWARD_ACCENT = colors.yellow;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * 🏆 The weekly discovery banner shown for 1 hour after weekly awards are generated.
 * Features a roasty, funny subtext and quick access to the awards ceremony modal.
 */
export function GCAwardsBanner({
  result,
  onPress,
}: {
  result: WeeklyAwardsResult | null;
  onPress: () => void;
}) {
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!result?.generatedAt || result.status === 'generating') {
      setIsExpired(false);
      return;
    }

    const genTime = new Date(result.generatedAt).getTime();
    if (Number.isNaN(genTime)) return;

    const remaining = ONE_HOUR_MS - (Date.now() - genTime);
    if (remaining <= 0) {
      setIsExpired(true);
      return;
    }

    setIsExpired(false);
    const timer = setTimeout(() => {
      setIsExpired(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, [result?.generatedAt, result?.status]);

  if (!result || isExpired) return null;

  const generating = result.status === 'generating';
  const topAward = result.awards?.[0];
  const title = generating ? '🏆 JUDGING THIS WEEK' : '🏆 GC AWARDS';

  const subtitle = generating
    ? 'Auditing the group’s mental illness... ⏳'
    : result.status === 'failed'
      ? 'The jury crashed from second-hand embarrassment 💀'
      : topAward
        ? `The receipts don't lie. ${topAward.userName} got cooked 💀`
        : "Weekly callout post dropped. Tap to see who got exposed 💀";

  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <GlassPanel borderRadius={radius.md} style={styles.container}>
        <PressableScale style={styles.tapArea} scaleTo={0.98} haptic="light" onPress={onPress}>
          <View style={styles.iconWrap}>
            <Text style={styles.trophyEmoji}>🏆</Text>
          </View>
          <View style={styles.copyArea}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
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
    borderColor: `${AWARD_ACCENT}55`,
    backgroundColor: 'rgba(48, 40, 12, 0.72)',
  },
  tapArea: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${AWARD_ACCENT}26`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyEmoji: { fontSize: 14 },
  copyArea: { flex: 1, gap: 1 },
  title: { ...typography.micro, fontWeight: '800', letterSpacing: 0.6, color: AWARD_ACCENT },
  subtitle: { ...typography.caption, color: colors.onSurface, fontSize: 12.5 },
});
