import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';

export function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  // Slow float so an empty screen doesn't read as a failed load.
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: easing.inOut, reduceMotion }),
        withTiming(0, { duration: 2200, easing: easing.inOut, reduceMotion })
      ),
      -1,
      false
    );
  }, [float]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(float.value, [0, 1], [0, -10]) },
      { scale: interpolate(float.value, [0, 1], [1, 1.05]) },
    ],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.container}
    >
      <Animated.Text style={[styles.emoji, floatStyle]}>{emoji}</Animated.Text>
      <View style={styles.glow} />
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emoji: { fontSize: 52 },
  glow: {
    width: 90,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accentGlow,
    opacity: 0.22,
    marginTop: -spacing.sm,
  },
  text: {
    ...typography.subheading,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
