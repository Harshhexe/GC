import { StyleSheet, Text, View } from 'react-native';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { Avatar } from './ui/Avatar';
import { DraggableSheet } from './ui/DraggableSheet';
import type { GroupMember } from '../types';

/**
 * A quick look at a member — opened by tapping their @mention in a message.
 * Reads straight from the chat's already-loaded member list (no extra
 * profile fetch), so it opens instantly.
 */
export function MemberProfileSheet({
  visible,
  member,
  onClose,
}: {
  visible: boolean;
  member: GroupMember | null;
  onClose: () => void;
}) {
  if (!member) return null;

  return (
    <DraggableSheet visible={visible} onClose={onClose} style={styles.sheet}>
      <View style={styles.header}>
        <Avatar
          emoji={member.avatarEmoji}
          imageUrl={member.avatarUrl}
          label={member.displayName}
          size={64}
          ringColors={[member.avatarColor, member.avatarColor]}
        />
        <Text style={styles.name}>{member.displayName}</Text>
        {!!member.username && <Text style={styles.username}>@{member.username}</Text>}

        {member.role !== 'member' && (
          <View style={[styles.roleChip, member.role === 'admin' && styles.adminChip]}>
            <Text style={[styles.roleChipText, member.role === 'admin' && styles.adminChipText]}>
              {member.role.toUpperCase()}
            </Text>
          </View>
        )}
      </View>
    </DraggableSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bgElevated,
    paddingBottom: spacing.xxl + spacing.lg,
    borderColor: colors.border,
  },
  header: { alignItems: 'center', gap: 6, paddingVertical: spacing.md },
  name: { ...typography.titleMd, fontSize: 19, color: colors.onSurface, marginTop: spacing.sm },
  username: { ...typography.caption, color: colors.onSurfaceVariant },
  roleChip: {
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(208,188,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(208,188,255,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  roleChipText: { ...typography.label, fontSize: 10, color: colors.primary },
  adminChip: { backgroundColor: 'rgba(76,215,246,0.14)', borderColor: 'rgba(76,215,246,0.4)' },
  adminChipText: { color: colors.tertiary },
});
