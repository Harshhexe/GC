import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';

export function EmptyState({
  emoji,
  icon,
  iconColor = colors.primary,
  text,
}: {
  emoji?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  text: string;
}) {
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
      { translateY: interpolate(float.value, [0, 1], [0, -8]) },
      { scale: interpolate(float.value, [0, 1], [1, 1.04]) },
    ],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.container}
    >
      <Animated.View style={floatStyle}>
        {icon ? (
          <View style={[styles.iconOrb, { borderColor: `${iconColor}33`, backgroundColor: `${iconColor}14` }]}>
            <Ionicons name={icon} size={36} color={iconColor} />
          </View>
        ) : emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : (
          <View style={[styles.iconOrb, { borderColor: `${iconColor}33`, backgroundColor: `${iconColor}14` }]}>
            <Ionicons name="chatbubbles-outline" size={36} color={iconColor} />
          </View>
        )}
      </Animated.View>
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
  iconOrb: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
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
