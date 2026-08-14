import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { GlassPanel } from './ui/Glass';

type Props = {
  isWishTime: boolean;
  secondsRemaining: number;
  isTimesUp: boolean;
  onPressWish?: () => void;
  onPressTimesUp: () => void;
  onDismissTimesUp: () => void;
};

export function ElevenElevenBanner({
  isWishTime,
  secondsRemaining,
  isTimesUp,
  onPressWish,
  onPressTimesUp,
  onDismissTimesUp,
}: Props) {
  if (!isWishTime && !isTimesUp) return null;

  const secondsStr = String(secondsRemaining).padStart(2, '0');

  if (isWishTime) {
    return (
      <Animated.View
        entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
        exiting={FadeOutUp.duration(duration.fast).reduceMotion(reduceMotion)}
        style={styles.wrap}
      >
        <GlassPanel
          borderRadius={radius.md}
          style={[styles.container, styles.wishContainer]}
        >
          <PressableScale
            style={styles.tapArea}
            scaleTo={0.98}
            onPress={onPressWish}
          >
            <View style={styles.wishIconWrap}>
              <Ionicons name="sparkles" size={16} color="#FFD166" />
            </View>
            <View style={styles.copyArea}>
              <View style={styles.headerRow}>
                <Text style={styles.wishTitle}>11:11 MAKE A WISH</Text>
              </View>
              <Text style={styles.wishSubtitle} numberOfLines={1}>
                Portal open • make your wish now!
              </Text>
            </View>
            <View style={styles.timerPill}>
              <Ionicons name="timer-outline" size={13} color="#FFD166" />
              <Text style={styles.timerText}>00:{secondsStr}</Text>
            </View>
          </PressableScale>
        </GlassPanel>
      </Animated.View>
    );
  }

  // isTimesUp state
  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      exiting={FadeOutUp.duration(duration.fast).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <GlassPanel
        borderRadius={radius.md}
        style={[styles.container, styles.timesUpContainer]}
      >
        <PressableScale
          style={styles.tapArea}
          scaleTo={0.98}
          onPress={onPressTimesUp}
        >
          <View style={styles.timesUpIconWrap}>
            <Ionicons name="alarm-outline" size={16} color="#FF6B6B" />
          </View>
          <View style={styles.copyArea}>
            <View style={styles.headerRow}>
              <Text style={styles.timesUpTitle}>TIME'S UP! WHO MISSED?</Text>
            </View>
            <Text style={styles.timesUpSubtitle} numberOfLines={1}>
              Tap to see who was yapping at 11:11 💀
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.outline} />
        </PressableScale>

        <PressableScale
          hitSlop={8}
          scaleTo={0.85}
          onPress={onDismissTimesUp}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
        </PressableScale>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  wishContainer: {
    borderColor: 'rgba(255, 209, 102, 0.45)',
    backgroundColor: 'rgba(38, 30, 18, 0.75)',
  },
  timesUpContainer: {
    borderColor: 'rgba(255, 107, 107, 0.35)',
    backgroundColor: 'rgba(36, 20, 24, 0.75)',
  },
  tapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  wishIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 209, 102, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timesUpIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyArea: {
    flex: 1,
    gap: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wishTitle: {
    ...typography.micro,
    fontWeight: '700',
    color: '#FFD166',
    letterSpacing: 0.5,
  },
  wishSubtitle: {
    ...typography.caption,
    color: colors.onSurface,
    fontSize: 12,
  },
  timesUpTitle: {
    ...typography.micro,
    fontWeight: '700',
    color: '#FF6B6B',
    letterSpacing: 0.5,
  },
  timesUpSubtitle: {
    ...typography.caption,
    color: colors.onSurface,
    fontSize: 12,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 209, 102, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  timerText: {
    ...typography.micro,
    fontWeight: '700',
    color: '#FFD166',
  },
  closeBtn: {
    padding: 4,
    marginLeft: spacing.xs,
  },
});
