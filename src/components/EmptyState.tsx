import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useAppearance } from '../context/AppearanceContext';
import { duration, easing, reduceMotion } from '../theme/motion';
import { radius, spacing, typography } from '../theme/theme';

export function EmptyState({
  emoji,
  icon,
  iconColor,
  title,
  text,
}: {
  emoji?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title?: string;
  text: string;
}) {
  const { theme } = useAppearance();
  const accent = iconColor ?? theme.palette.primary;

  return (
    <Animated.View
      entering={FadeInUp.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.container}
    >
      <View style={[styles.symbol, { backgroundColor: theme.palette.surfaceHigh, borderColor: theme.palette.border }]}>
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : <Ionicons name={icon ?? 'chatbubbles-outline'} size={27} color={accent} />}
      </View>
      {title ? <Text style={[styles.title, { color: theme.palette.onSurface }]}>{title}</Text> : null}
      <Text style={[styles.text, { color: theme.palette.onSurfaceVariant }]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  symbol: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emoji: { fontSize: 30 },
  title: { ...typography.title, fontSize: 20, textAlign: 'center' },
  text: { ...typography.body, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 310 },
});
