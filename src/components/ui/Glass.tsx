import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, gradients, radius } from '../../theme/theme';

/**
 * The Glass Stack from the design spec:
 *   mesh background → translucent fill → 1.5px stroke → colour glow.
 *
 * BlurView is native-only here; on web the fill is composited a little more
 * opaque instead, because backdrop blur over an animated mesh is expensive
 * and reads muddy in the browser preview.
 */
export function GlassPanel({
  children,
  style,
  borderRadius = radius.lg,
  tone = 'neutral',
  intensity = 24,
  sheen = true,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  tone?: 'neutral' | 'primary' | 'secondary' | 'tertiary';
  intensity?: number;
  sheen?: boolean;
}) {
  const strokeColor =
    tone === 'primary'
      ? 'rgba(208, 188, 255, 0.35)'
      : tone === 'secondary'
        ? 'rgba(255, 176, 205, 0.35)'
        : tone === 'tertiary'
          ? 'rgba(76, 215, 246, 0.35)'
          : glass.stroke;

  return (
    <View
      style={[
        styles.panel,
        { borderRadius, borderColor: strokeColor },
        Platform.OS === 'web' && styles.panelWeb,
        style,
      ]}
    >
      {Platform.OS !== 'web' && (
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={gradients.glassPanel}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />
      {sheen && (
        <LinearGradient
          colors={gradients.sheen}
          style={[styles.sheen, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius, pointerEvents: 'none' }]}
        />
      )}
      {children}
    </View>
  );
}

/** Small pill-shaped chip: eyebrow labels, status tags, date separators. */
export function Chip({
  children,
  style,
  tone = 'neutral',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'neutral' | 'primary' | 'secondary' | 'tertiary';
}) {
  const bg =
    tone === 'primary'
      ? 'rgba(208, 188, 255, 0.16)'
      : tone === 'secondary'
        ? 'rgba(255, 176, 205, 0.18)'
        : tone === 'tertiary'
          ? 'rgba(76, 215, 246, 0.16)'
          : glass.fill;
  const border =
    tone === 'primary'
      ? 'rgba(208, 188, 255, 0.4)'
      : tone === 'secondary'
        ? 'rgba(255, 176, 205, 0.4)'
        : tone === 'tertiary'
          ? 'rgba(76, 215, 246, 0.4)'
          : glass.stroke;

  return <View style={[styles.chip, { backgroundColor: bg, borderColor: border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderWidth: glass.borderWidth,
    backgroundColor: glass.fill,
  },
  panelWeb: { backgroundColor: 'rgba(45, 40, 58, 0.55)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
});
