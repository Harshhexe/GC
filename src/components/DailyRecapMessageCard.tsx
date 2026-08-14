import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const gradientColors: readonly [string, string] = themeGradient
    ? [themeGradient[0], themeGradient[1]]
    : ['#8B5CF6', '#EC4899'];

  return (
    <View style={styles.wrap}>
      <PressableScale scaleTo={0.98} haptic="light" onPress={onPress}>
        <GlassPanel borderRadius={radius.xl} style={styles.card}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.wordPill}
          >
            <Text style={styles.wordText}>{recap.oneWord}</Text>
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Ionicons name="sparkles" size={12} color="#FFD166" />
              <Text style={styles.title}>DAILY WRAPPED</Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {recap.totalMessages} messages
              {recap.userOfTheDay ? ` • 👑 ${recap.userOfTheDay.name} carried` : ''}
            </Text>
          </View>

          <View style={styles.arrowWrap}>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
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
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(25, 20, 38, 0.75)',
  },
  wordPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  wordText: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
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
    color: '#FFD166',
    letterSpacing: 0.8,
  },
  meta: {
    ...typography.caption,
    color: colors.onSurface,
    fontSize: 13,
  },
  arrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
