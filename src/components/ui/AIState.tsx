import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { easing, reduceMotion } from '../../theme/motion';
import { GCButton } from './Buttons';
import { aiErrorMessage, type AIError } from '../../lib/ai';

/**
 * Shared loading and error states for every AI feature.
 *
 * Centralised so all nine planned features read in one voice, and so the
 * error copy stays keyed to error *codes* rather than to whatever text a
 * provider happened to return.
 */

export function AIThinking({ tint = colors.primary }: { tint?: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: easing.inOut, reduceMotion }),
      -1,
      true
    );

  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.1]) }],
  }));

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.center}>
      <Animated.View style={[styles.orb, { backgroundColor: `${tint}1C`, borderColor: `${tint}55` }, dotStyle]}>
        <Ionicons name="sparkles-outline" size={21} color={tint} />
      </Animated.View>
      <Text style={[styles.statusLabel, { color: tint }]}>GC AI / IN PROGRESS</Text>
      <Text style={styles.thinkingText}>Putting the pieces together…</Text>
      <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, { backgroundColor: tint }, dotStyle]} /></View>
    </Animated.View>
  );
}

/**
 * Error state. A retry button appears only when the server said the failure
 * is retryable — offering one on "you're not in this GC" would be a lie.
 */
export function AIErrorState({
  error,
  onRetry,
}: {
  error: AIError | null;
  onRetry?: () => void;
}) {
  return (
    <Animated.View entering={FadeIn} style={styles.center}>
      <View style={styles.errorIcon}>
        <Ionicons name="cloud-offline-outline" size={24} color={colors.onSurfaceVariant} />
      </View>
      <Text style={styles.errorText}>{aiErrorMessage(error)}</Text>
      {!!onRetry && error?.retryable && (
        <GCButton label="Try again" variant="ghost" full={false} onPress={onRetry} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  orb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thinkingText: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  statusLabel: { ...typography.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '800' },
  progressTrack: { width: 112, height: 2, backgroundColor: colors.borderBright, borderRadius: 1, overflow: 'hidden' },
  progressFill: { width: 54, height: 2, borderRadius: 1 },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  errorText: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
});
