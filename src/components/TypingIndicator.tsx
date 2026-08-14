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
      index * 150,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: easing.inOut, reduceMotion }),
          withTiming(0, { duration: 420, easing: easing.inOut, reduceMotion })
        ),
        -1,
        true
      )
    );
  }, [index, t]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.35, 1]),
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, -4]) },
      { scale: interpolate(t.value, [0, 1], [0.85, 1.15]) },
    ],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(22).stiffness(240).reduceMotion(reduceMotion)}
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
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    paddingTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(21, 21, 34, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  text: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    fontSize: 12,
  },
});
