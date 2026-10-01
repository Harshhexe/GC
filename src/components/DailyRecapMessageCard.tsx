import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { GlassPanel } from './ui/Glass';
import type { DailyRecapResult } from '../lib/ai';

/**
 * The recap card rendered directly inside the chat feed right after midnight.
 */
export function DailyRecapMessageCard({
  recap,
  themeGradient,
  onPress,
}: {
  recap: DailyRecapResult;
  themeGradient?: readonly [string, string];
  onPress: () => void;
}) {
  const accent = themeGradient?.[0] ?? colors.primary;

  return (
    <View style={styles.wrap}>
      <PressableScale scaleTo={0.98} haptic="light" onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open daily recap: ${recap.oneWord}`}>
        <GlassPanel borderRadius={radius.xl} style={styles.card}>
          <View style={[styles.wordPill, { backgroundColor: `${accent}22`, borderColor: `${accent}66` }]}>
            <Text style={[styles.wordText, { color: accent }]}>{recap.oneWord}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Ionicons name="sparkles-outline" size={14} color={accent} />
              <Text style={styles.title}>Daily recap</Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {recap.totalMessages} messages
              {recap.userOfTheDay ? ` · ${recap.userOfTheDay.name} led the chat` : ''}
            </Text>
          </View>

          <View style={styles.arrowWrap}>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
          </View>
        </GlassPanel>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignSelf: 'stretch',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surfaceLow,
  },
  wordPill: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  wordText: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    ...typography.micro,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: 0.1,
  },
  meta: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontSize: 13,
  },
  arrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
