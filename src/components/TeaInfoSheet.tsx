import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GCButton } from './ui/Buttons';
import { clockTime } from '../utils/time';
import type { TeaSession } from '../hooks/useTeaSession';

/**
 * What's showing while Tea is live: who started it, when, and — for the
 * starter or a moderator — the way to end it.
 *
 * The End Tea action is hidden for everyone else, but that's presentation
 * only; `end_tea` re-checks the same rule in the database.
 */
export function TeaInfoSheet({
  visible,
  session,
  canEnd,
  onEndTea,
  onClose,
}: {
  visible: boolean;
  session: TeaSession | null;
  canEnd: boolean;
  onEndTea: () => void;
  onClose: () => void;
}) {
  if (!session) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.anchor}>
        <Animated.View
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            {Platform.OS !== 'web' && (
              <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
            )}
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          exiting={SlideOutDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          style={styles.sheet}
        >
          <View style={styles.grabber} />

          <Text style={styles.title}>🍵 Tea is going on</Text>
          <Text style={styles.meta}>
            Started by {session.startedByName} · {clockTime(session.startedAt)}
          </Text>

          <View style={styles.note}>
            <Ionicons name="chatbubbles-outline" size={16} color={colors.onSurfaceVariant} />
            <Text style={styles.noteText}>
              Everyone can chat normally. Everything sent while Tea is on goes into the
              Tea Report.
            </Text>
          </View>

          {canEnd ? (
            <GCButton
              label="End Tea"
              variant="danger"
              icon={<Ionicons name="stop-circle-outline" size={18} color={colors.error} />}
              onPress={onEndTea}
            />
          ) : (
            <Text style={styles.cannotEnd}>
              Only {session.startedByName} or an admin can end this one.
            </Text>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + spacing.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderBright,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, fontSize: 22, color: colors.onSurface },
  meta: { ...typography.caption, color: colors.onSurfaceVariant },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: { ...typography.caption, color: colors.onSurfaceVariant, flex: 1, lineHeight: 18 },
  cannotEnd: { ...typography.caption, color: colors.outline, textAlign: 'center' },
});
