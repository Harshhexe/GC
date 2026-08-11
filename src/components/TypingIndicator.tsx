import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { typingText } from '../theme/copy';

function Dot({ index }: { index: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      index * 140,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 380, easing: easing.inOut, reduceMotion }),
          withTiming(0, { duration: 380, easing: easing.inOut, reduceMotion })
        ),
        -1,
        false
      )
    );
  }, [index, t]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.3, 1]),
    transform: [{ translateY: interpolate(t.value, [0, 1], [0, -3]) }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
      exiting={FadeOutDown.duration(duration.fast).reduceMotion(reduceMotion)}
      style={styles.container}
    >
      <View style={styles.pill}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <Dot key={i} index={i} />
          ))}
        </View>
        <Text style={styles.text}>{typingText(names)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  text: { ...typography.micro, color: colors.textSecondary },
});
