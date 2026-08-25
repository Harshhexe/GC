import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { GCButton } from './ui/Buttons';
import { DraggableSheet } from './ui/DraggableSheet';
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
    <DraggableSheet visible={visible} onClose={onClose} style={styles.sheet}>
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
    </DraggableSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bgElevated,
    paddingBottom: spacing.xxl + spacing.lg,
    borderColor: colors.border,
    gap: spacing.md,
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
