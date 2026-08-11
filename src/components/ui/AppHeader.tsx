import { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, HIT_TARGET, radius, spacing, typography } from '../../theme/theme';
import { PressableScale } from './PressableScale';

const LOGO_TRANSPARENT = require('../../../assets/gc_app_logo-transparent.png');

/** The transparent logo image used as the header title on top bars. */
export function GCWordmark({ size = 38 }: { size?: number }) {
  return (
    <Image
      source={LOGO_TRANSPARENT}
      style={{ height: size, width: size * 1.6 }}
      resizeMode="contain"
    />
  );
}

export function HeaderIconButton({
  name,
  onPress,
  color = colors.onSurface,
  size = 22,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <PressableScale onPress={onPress} style={styles.iconButton} scaleTo={0.88} hitSlop={6}>
      <Ionicons name={name} size={size} color={color} />
    </PressableScale>
  );
}

/**
 * Shared top bar. Left/right are slots so each screen can supply its own
 * controls while the title block stays optically centred.
 */
export function AppHeader({
  title,
  subtitle,
  wordmark = false,
  left,
  right,
}: {
  title?: string;
  subtitle?: string;
  wordmark?: boolean;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.side}>{left}</View>

      <View style={styles.center}>
        {wordmark ? <GCWordmark /> : !!title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  side: { minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sideRight: { justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  wordmark: {
    fontFamily: typography.headline.fontFamily,
    color: colors.primary,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(129, 140, 248, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  title: { ...typography.title, color: colors.onSurface, textAlign: 'center' },
  subtitle: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    letterSpacing: 1,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
});
