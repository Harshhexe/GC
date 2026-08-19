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
  hideBaseBackground,
  hideEdgeGlows,
  style,
}: {
  variant?: 'default' | 'vivid';
  tint?: string;
  hideBaseBackground?: boolean;
  /**
   * Drop the top glow and bottom vignette so whatever is behind shows through
   * edge to edge.
   *
   * For the installed PWA: `viewport-fit=cover` puts the page under the status
   * bar and home indicator, so these two bands land right on the safe-area
   * strips — the top one reads as frosted glass and the bottom one as a solid
   * block in a different shade than the chat wallpaper.
   */
  hideEdgeGlows?: boolean;
  style?: any;
}) {
  const glow = tint ?? '#6366F1';
  const strength = variant === 'vivid' ? 0.14 : 0.09;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.base,
        hideBaseBackground && { backgroundColor: 'transparent' },
        style,
        { pointerEvents: 'none' },
      ]}
    >
      {/* Top glow, coloured by the active theme */}
      {!hideEdgeGlows && (
      <View style={styles.topGlow}>
        <LinearGradient
          colors={[tinted(glow, strength), tinted(glow, 0)]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      )}

      {/* Bottom vignette to seat the dock and composer */}
      {!hideEdgeGlows && (
      <View style={styles.bottomGlow}>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(5, 5, 10, 0.6)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  bottomGlow: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 240 },
});
