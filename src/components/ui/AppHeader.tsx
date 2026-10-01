import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIT_TARGET, fontFamily, radius, spacing, typography } from '../../theme/theme';
import { PressableScale } from './PressableScale';
import { APP_THEMES, useAppearance } from '../../context/AppearanceContext';

/** A crisp typographic wordmark keeps the small navigation header legible. */
export function GCWordmark({ size = 25 }: { size?: number }) {
  const { theme } = useAppearance();
  return <Text style={[styles.wordmark, { color: theme.palette.onSurface, fontSize: size, lineHeight: size + 3 }]}>GC<Text style={{ color: theme.palette.primary }}>.</Text></Text>;
}

export function HeaderIconButton({
  name,
  onPress,
  color,
  size = 22,
  accessibilityLabel,
  tone,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  size?: number;
  accessibilityLabel?: string;
  tone?: 'dark';
}) {
  const { theme } = useAppearance();
  const palette = tone === 'dark' ? APP_THEMES.genz.palette : theme.palette;
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.iconButton, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}
      scaleTo={0.92}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel ?? name.replace(/-outline$/, '').replace(/-/g, ' ')}
    >
      <Ionicons name={name} size={size} color={color ?? palette.onSurface} />
    </PressableScale>
  );
}

/**
 * Shared top bar. Left/right are slots so each screen can supply its own
 * controls while the title block stays anchored in the same reading column.
 */
export function AppHeader({
  title,
  subtitle,
  wordmark = false,
  left,
  right,
  tone,
}: {
  title?: string;
  subtitle?: string;
  wordmark?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  tone?: 'dark';
}) {
  const { theme } = useAppearance();
  const palette = tone === 'dark' ? APP_THEMES.genz.palette : theme.palette;
  return (
    <View style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surfaceLow }]}>
      {left ? <View style={styles.side}>{left}</View> : null}

      <View style={styles.center}>
        {wordmark ? <GCWordmark /> : !!title && <Text style={[styles.title, { color: palette.onSurface }]} numberOfLines={1}>{title}</Text>}
        {!!subtitle && (
          <Text style={[styles.subtitle, { color: palette.onSurfaceVariant }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {right ? <View style={[styles.side, styles.sideRight]}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.sm,
    minHeight: 64,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sideRight: { justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  wordmark: {
    fontFamily: fontFamily.displayBold,
    letterSpacing: -1.2,
  },
  title: { fontFamily: fontFamily.bodySemi, fontSize: 18, lineHeight: 24, letterSpacing: -0.35 },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  iconButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
