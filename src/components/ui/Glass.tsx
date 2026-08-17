import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, glass, radius } from '../../theme/theme';

/**
 * Frosted Glass Panel:
 * Clean blurred opacity aesthetic (iOS / VisionOS style) with smooth backdrop blur,
 * refined 1px border stroke, and zero glossy reflection noise.
 */
export function GlassPanel({
  children,
  style,
  borderRadius = radius.lg,
  tone = 'neutral',
  intensity = 35,
  blur = false,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  tone?: 'neutral' | 'primary' | 'secondary' | 'tertiary';
  intensity?: number;
  sheen?: boolean;
  blur?: boolean;
}) {
  const strokeColor =
    tone === 'primary'
      ? 'rgba(129, 140, 248, 0.25)'
      : tone === 'secondary'
        ? 'rgba(244, 114, 182, 0.25)'
        : tone === 'tertiary'
          ? 'rgba(56, 189, 248, 0.25)'
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
      {blur && Platform.OS !== 'web' && (
        <BlurView
          intensity={intensity}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
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
      ? 'rgba(129, 140, 248, 0.12)'
      : tone === 'secondary'
        ? 'rgba(244, 114, 182, 0.12)'
        : tone === 'tertiary'
          ? 'rgba(56, 189, 248, 0.12)'
          : glass.fill;
  const border =
    tone === 'primary'
      ? 'rgba(129, 140, 248, 0.25)'
      : tone === 'secondary'
        ? 'rgba(244, 114, 182, 0.25)'
        : tone === 'tertiary'
          ? 'rgba(56, 189, 248, 0.25)'
          : glass.stroke;

  return <View style={[styles.chip, { backgroundColor: bg, borderColor: border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderWidth: glass.borderWidth,
    backgroundColor: glass.fill,
  },
  panelWeb: {
    backgroundColor: 'rgba(20, 20, 32, 0.80)',
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
});
