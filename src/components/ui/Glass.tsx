import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, glass, radius } from '../../theme/theme';
import { useAppearance } from '../../context/AppearanceContext';

/** The shared content surface. Blur is reserved for the few overlays that need it. */
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
  const { theme } = useAppearance();
  const isLight = !theme.isDark;
  const strokeColor =
    tone === 'primary'
      ? `${theme.palette.primary}40`
      : tone === 'secondary'
        ? `${theme.palette.secondary}40`
        : tone === 'tertiary'
          ? `${theme.palette.tertiary}40`
          : theme.palette.border;

  return (
    <View
      style={[
        styles.panel,
        { borderRadius, borderColor: strokeColor },
        { backgroundColor: blur && Platform.OS !== 'web' ? theme.glass.fill : theme.palette.surfaceLow },
        style,
      ]}
    >
      {blur && Platform.OS !== 'web' && (
        <BlurView
          intensity={intensity}
          tint={isLight ? 'light' : 'dark'}
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
  const { theme } = useAppearance();
  const bg =
    tone === 'primary'
      ? `${theme.palette.primary}1F`
      : tone === 'secondary'
        ? `${theme.palette.secondary}1F`
        : tone === 'tertiary'
          ? `${theme.palette.tertiary}1F`
          : theme.palette.surfaceHigh;
  const border =
    tone === 'primary'
      ? `${theme.palette.primary}40`
      : tone === 'secondary'
        ? `${theme.palette.secondary}40`
        : tone === 'tertiary'
          ? `${theme.palette.tertiary}40`
          : theme.palette.border;

  return <View style={[styles.chip, { backgroundColor: bg, borderColor: border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderWidth: glass.borderWidth,
    backgroundColor: glass.fill,
  },
  chip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
});
