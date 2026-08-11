import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/theme';

/** Turn a hex accent into a low-alpha rgba so the glow stays atmospheric. */
function tinted(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function AmbientBackground({
  variant = 'default',
  /** A group's accent colour, so each GC tints its own screen. */
  tint,
}: {
  variant?: 'default' | 'vivid';
  tint?: string;
}) {
  const glow = tint ?? '#6366F1';
  const strength = variant === 'vivid' ? 0.14 : 0.09;

  return (
    <View style={[StyleSheet.absoluteFill, styles.base, { pointerEvents: 'none' }]}>
      {/* Top glow, coloured by the active theme */}
      <View style={styles.topGlow}>
        <LinearGradient
          colors={[tinted(glow, strength), tinted(glow, 0)]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Bottom vignette to seat the dock and composer */}
      <View style={styles.bottomGlow}>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(5, 5, 10, 0.6)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  bottomGlow: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 240 },
});
