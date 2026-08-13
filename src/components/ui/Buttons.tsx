import { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, gradients, radius, shadows, spacing, typography } from '../../theme/theme';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'gradient' | 'cyan' | 'ghost' | 'danger';

/**
 * The one button in the app. `neo` adds the Neo-Brutalist hard offset shadow
 * used on the loudest actions (Copy Code, Invite Friends).
 */
export function GCButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  neo = false,
  style,
  textStyle,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ReactNode;
  /** Trailing icon. A forward arrow belongs after the label, not before it —
   *  "→ Continue" reads like a back button. */
  iconRight?: ReactNode;
  disabled?: boolean;
  neo?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  full?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      {icon}
      <Text style={[styles.label, variantText[variant], disabled && styles.labelDisabled, textStyle]}>
        {label}
      </Text>
      {iconRight}
    </View>
  );

  const body =
    variant === 'gradient' ? (
      <LinearGradient
        colors={disabled ? [colors.surfaceHigh, colors.surfaceHigh] : gradients.cta}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, full && styles.full]}
      >
        {content}
      </LinearGradient>
    ) : (
      <View
        style={[
          styles.base,
          full && styles.full,
          variantBg[variant],
          disabled && styles.disabled,
        ]}
      >
        {content}
      </View>
    );

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="medium"
      scaleTo={0.96}
      style={[
        styles.wrap,
        neo && !disabled && shadows.hard,
        !neo && !disabled && variantGlow[variant],
        style,
      ]}
    >
      {body}
    </PressableScale>
  );
}

const variantBg: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primaryContainer },
  gradient: {},
  cyan: { backgroundColor: colors.tertiaryContainer },
  ghost: { backgroundColor: glass.fill, borderWidth: glass.borderWidth, borderColor: glass.strokeBright },
  danger: { backgroundColor: 'transparent', borderWidth: glass.borderWidth, borderColor: 'rgba(255, 180, 171, 0.4)' },
};

const variantText: Record<Variant, TextStyle> = {
  primary: { color: colors.onPrimary },
  gradient: { color: '#FFFFFF' },
  cyan: { color: '#00323B' },
  ghost: { color: colors.onSurface },
  danger: { color: colors.error },
};

const variantGlow: Record<Variant, ViewStyle> = {
  primary: shadows.glow,
  gradient: shadows.glow,
  cyan: shadows.glowCyan,
  ghost: {},
  danger: {},
};

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.pill },
  base: {
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { ...typography.titleMd, fontSize: 17 },
  labelDisabled: { color: colors.outline },
  disabled: { backgroundColor: colors.surfaceHigh },
});

/** White pill input shell from the create/join and login designs. */
export function LightFieldShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[lightStyles.field, style]}>{children}</View>;
}

const lightStyles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 0,
    height: 54,
    minHeight: 54,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});
