import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { afterHoursText } from '../theme/copy';

export function AfterHoursBanner({ now }: { now: Date }) {
  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      <LinearGradient
        colors={gradients.night}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.moonDot} />
        <View style={styles.copy}>
          <Text style={styles.title}>🌚 GC AFTER DARK</Text>
          <Text style={styles.subtitle}>{afterHoursText(now)}</Text>
        </View>
      </LinearGradient>
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
    borderColor: '#332F5E',
  },
  moonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8FA2FF',
    shadowColor: '#8FA2FF',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  copy: { gap: 2 },
  title: { ...typography.label, color: '#A9B6FF' },
  subtitle: { ...typography.micro, color: colors.textFaint },
});
