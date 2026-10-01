import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, fontFamily, radius, typography } from '../../theme/theme';
import { duration, easing, reduceMotion } from '../../theme/motion';

type Props = {
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  description?: string;
  edition?: string;
  footer?: ReactNode;
  compact?: boolean;
};

/** A native-safe take on React Bits' staggered Animated Content reveal. */
export function AIStoryHero({ accent, icon, eyebrow, title, description, edition, footer, compact }: Props) {
  return (
    <Animated.View
      entering={FadeInDown.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
      style={[styles.cover, compact && styles.compact]}
    >
      <LinearGradient
        colors={[`${accent}30`, `${accent}0D`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.orbitOuter, { borderColor: `${accent}24` }]} pointerEvents="none" />
      <View style={[styles.orbitInner, { borderColor: `${accent}28` }]} pointerEvents="none" />
      <View style={[styles.topRule, { backgroundColor: accent }]} pointerEvents="none" />

      <Animated.View entering={FadeInDown.delay(45).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)} style={styles.topRow}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.iconBox, { backgroundColor: `${accent}1B`, borderColor: `${accent}4D` }]}>
            <Ionicons name={icon} size={15} color={accent} />
          </View>
          <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
        </View>
        {!!edition && <Text style={styles.edition}>{edition}</Text>}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(110).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)} style={styles.copy}>
        <Text style={[styles.title, compact && styles.compactTitle]} accessibilityRole="header">{title}</Text>
        {!!description && <Text style={styles.description}>{description}</Text>}
      </Animated.View>

      {!!footer && (
        <Animated.View entering={FadeInDown.delay(170).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)} style={styles.footer}>
          <View style={[styles.footerLine, { backgroundColor: `${accent}42` }]} />
          {footer}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    minHeight: 228,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderBright,
    backgroundColor: '#171D25',
    overflow: 'hidden',
    padding: 22,
    justifyContent: 'space-between',
    gap: 28,
  },
  compact: { minHeight: 194, gap: 20 },
  topRule: { position: 'absolute', left: 22, top: 0, width: 66, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  orbitOuter: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1, right: -95, top: 30 },
  orbitInner: { position: 'absolute', width: 154, height: 154, borderRadius: 77, borderWidth: 1, right: -57, top: 68 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  iconBox: { width: 29, height: 29, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...typography.label, fontSize: 10, letterSpacing: 1.5, fontWeight: '800', flexShrink: 1 },
  edition: { ...typography.micro, fontSize: 10, color: colors.onSurfaceVariant, letterSpacing: 0.8 },
  copy: { gap: 8, maxWidth: 560 },
  title: { fontFamily: fontFamily.display, fontSize: 37, lineHeight: 41, letterSpacing: -1.15, color: colors.onSurface },
  compactTitle: { fontSize: 32, lineHeight: 36 },
  description: { ...typography.body, fontSize: 13, lineHeight: 20, color: colors.onSurfaceVariant, maxWidth: 420 },
  footer: { gap: 11 },
  footerLine: { height: 1, width: '100%' },
});
