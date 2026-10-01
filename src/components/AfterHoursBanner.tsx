import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { afterHoursText } from '../theme/copy';

export function AfterHoursBanner({ now }: { now: Date }) {
  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <View style={styles.container}>
        <View style={styles.moonDot} />
        <View style={styles.copy}>
          <Text style={styles.title}>After dark</Text>
          <Text style={styles.subtitle}>{afterHoursText(now)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLow,
  },
  moonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  copy: { gap: 2 },
  title: { ...typography.label, color: colors.onSurface },
  subtitle: { ...typography.micro, color: colors.textFaint },
});
