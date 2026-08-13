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
      {/* Big Centered PFP */}
      <View style={styles.avatarCenterWrapper}>
        <PressableScale
          scaleTo={0.95}
          haptic="medium"
          onPress={onPickPhoto}
          style={styles.avatarPressable}
        >
          <Avatar
            emoji={emoji}
            imageUrl={photoUri}
            label={label}
            size={104}
            ringColors={[color, color]}
            glow
          />
          {/* Edit icon badge on bottom-left */}
          <View style={styles.editBadgeBottomLeft}>
            <LinearGradient
              colors={photoUri ? ['#5A5566', '#3A3542'] : [color, color]}
              style={styles.editBadgeFill}
            >
              <Ionicons
                name={photoUri ? 'close' : 'pencil'}
                size={16}
                color={photoUri ? colors.onSurface : '#1B1424'}
              />
            </LinearGradient>
          </View>
        </PressableScale>

        {/* Upload / Remove Photo Button */}
        <PressableScale
          style={styles.photoActionButton}
          scaleTo={0.96}
          onPress={photoUri ? onClearPhoto : onPickPhoto}
        >
          <Ionicons
            name={photoUri ? 'close-circle-outline' : 'image-outline'}
            size={16}
            color={colors.primary}
          />
          <Text style={styles.photoActionText}>
            {photoUri ? 'Remove Custom Photo' : 'Upload Custom Photo'}
          </Text>
        </PressableScale>
      </View>

      {!photoUri && (
        <Animated.View entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)} style={styles.selectorSection}>
          <Text style={styles.sectionTitle}>CHOOSE EMOJI</Text>
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
                style={[styles.emojiChip, emoji === e && { borderColor: color, backgroundColor: `${color}28` }]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </PressableScale>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>RING COLOR</Text>
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
  container: { gap: spacing.md, alignItems: 'center' },
  avatarCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: spacing.xs,
  },
  avatarPressable: {
    position: 'relative',
  },
  editBadgeBottomLeft: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    borderRadius: radius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  editBadgeFill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
  photoActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(208,188,255,0.3)',
    backgroundColor: 'rgba(208,188,255,0.08)',
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  photoActionText: { ...typography.micro, color: colors.primary, fontWeight: '600' },
  selectorSection: { width: '100%', gap: 6, marginTop: 4 },
  sectionTitle: {
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.onSurfaceVariant,
    marginLeft: 4,
    marginTop: 6,
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
  colorChipActive: { borderColor: 'rgba(255,255,255,0.65)' },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  colorTick: { position: 'absolute' },
});
