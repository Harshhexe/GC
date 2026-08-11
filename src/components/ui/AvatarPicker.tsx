import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, glass, radius, spacing, typography } from '../../theme/theme';
import { duration, reduceMotion } from '../../theme/motion';
import { Avatar } from './Avatar';
import { PressableScale } from './PressableScale';

export const AVATAR_EMOJIS = [
  '🦝', '💀', '🍵', '🔥', '👻', '🐸', '🦋', '🍿',
  '🐙', '🌚', '🧃', '🪩', '🎧', '🍄', '👾', '🫠',
];

export const AVATAR_COLORS = [
  '#d0bcff', '#ffb0cd', '#4cd7f6', '#84CC16', '#FBBF24', '#FB7185', '#818CF8',
];

/**
 * Profile picture chooser: a photo from the library, or an emoji + colour.
 * The two are exclusive — picking one clears the other — so there's never any
 * ambiguity about what the avatar will actually be.
 */
export function AvatarPicker({
  emoji,
  color,
  photoUri,
  onPickEmoji,
  onPickColor,
  onPickPhoto,
  onClearPhoto,
  label,
}: {
  emoji: string;
  color: string;
  photoUri?: string | null;
  onPickEmoji: (emoji: string) => void;
  onPickColor: (color: string) => void;
  onPickPhoto: () => void;
  onClearPhoto: () => void;
  label?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.previewRow}>
        <View>
          <Avatar
            emoji={emoji}
            imageUrl={photoUri}
            label={label}
            size={88}
            ringColors={[color, color]}
            glow
          />
          <PressableScale
            style={styles.cameraBadge}
            scaleTo={0.85}
            haptic="medium"
            onPress={photoUri ? onClearPhoto : onPickPhoto}
          >
            <LinearGradient
              colors={photoUri ? ['#5A5566', '#3A3542'] : [color, color]}
              style={styles.cameraFill}
            >
              <Ionicons
                name={photoUri ? 'close' : 'camera'}
                size={15}
                color={photoUri ? colors.onSurface : '#1B1424'}
              />
            </LinearGradient>
          </PressableScale>
        </View>

        <View style={styles.previewCopy}>
          <Text style={styles.previewTitle}>Your face</Text>
          <Text style={styles.previewHelp}>
            {photoUri ? 'Nice. Tap ✕ to go back to emoji.' : 'Upload a photo, or pick an emoji.'}
          </Text>
          <PressableScale style={styles.uploadButton} scaleTo={0.96} onPress={onPickPhoto}>
            <Ionicons name="image-outline" size={15} color={colors.primary} />
            <Text style={styles.uploadText}>{photoUri ? 'Change photo' : 'Upload photo'}</Text>
          </PressableScale>
        </View>
      </View>

      {!photoUri && (
        <Animated.View entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {AVATAR_EMOJIS.map((e) => (
              <PressableScale
                key={e}
                scaleTo={0.85}
                haptic="medium"
                onPress={() => onPickEmoji(e)}
                style={[styles.emojiChip, emoji === e && { borderColor: color, backgroundColor: `${color}24` }]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </PressableScale>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {AVATAR_COLORS.map((c) => (
              <PressableScale
                key={c}
                scaleTo={0.82}
                haptic="medium"
                onPress={() => onPickColor(c)}
                style={[styles.colorChip, color === c && styles.colorChipActive]}
              >
                <View style={[styles.colorDot, { backgroundColor: c }]} />
                {color === c && <Ionicons name="checkmark" size={13} color="#1B1424" style={styles.colorTick} />}
              </PressableScale>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  previewCopy: { flex: 1, gap: 3 },
  previewTitle: { ...typography.titleMd, fontSize: 17, color: colors.onSurface },
  previewHelp: { ...typography.micro, color: colors.onSurfaceVariant, lineHeight: 16 },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(208,188,255,0.4)',
    backgroundColor: 'rgba(208,188,255,0.10)',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  uploadText: { ...typography.micro, color: colors.primary },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, borderRadius: radius.pill },
  cameraFill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  strip: { gap: spacing.sm, paddingVertical: 4, paddingRight: spacing.sm },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: glass.stroke,
  },
  emojiText: { fontSize: 21 },
  colorChip: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  colorChipActive: { borderColor: 'rgba(255,255,255,0.55)' },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorTick: { position: 'absolute' },
});
