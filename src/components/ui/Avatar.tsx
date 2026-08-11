import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, typography } from '../../theme/theme';

type Status = 'online' | 'offline' | 'listening' | null;

const statusColor: Record<Exclude<Status, null>, string> = {
  online: colors.tertiary,
  offline: colors.outline,
  listening: colors.secondary,
};

/**
 * Circular avatar with a gradient ring. Avatars are identity markers in this
 * design, so the ring is always drawn — the status dot is what varies.
 */
export function Avatar({
  emoji,
  imageUrl,
  label,
  size = 44,
  ring = true,
  ringColors,
  status = null,
  glow = false,
}: {
  emoji?: string;
  /** A real picture wins over the emoji when both are set. */
  imageUrl?: string | null;
  /** Falls back to the first letter when there's no emoji. */
  label?: string;
  size?: number;
  ring?: boolean;
  ringColors?: readonly [string, string, ...string[]];
  status?: Status;
  glow?: boolean;
}) {
  const ringWidth = ring ? Math.max(2, size * 0.05) : 0;
  const inner = size - ringWidth * 2;
  const dot = Math.max(9, size * 0.24);

  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={ringColors ?? gradients.brandSoft}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, padding: ringWidth },
          glow && styles.glow,
        ]}
      >
        <View
          style={[
            styles.inner,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: inner, height: inner, borderRadius: inner / 2 }}
              resizeMode="cover"
            />
          ) : emoji ? (
            <Text style={{ fontSize: inner * 0.5 }}>{emoji}</Text>
          ) : (
            // Letter fallback needs an explicit colour — the default text
            // colour is near-black and vanishes against the dark inner disc.
            <Text style={[styles.initial, { fontSize: inner * 0.42 }]}>
              {label ? label.trim().charAt(0).toUpperCase() : '?'}
            </Text>
          )}
        </View>
      </LinearGradient>

      {status && (
        <View
          style={[
            styles.status,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: statusColor[status],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    shadowColor: colors.secondary,
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  inner: {
    backgroundColor: colors.surfaceLowest,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { color: colors.onSurface, fontFamily: typography.label.fontFamily },
  status: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});

export const AVATAR_RADIUS = radius.pill;
