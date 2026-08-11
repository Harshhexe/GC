import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from './ui/Avatar';
import { PressableScale } from './ui/PressableScale';

export type MemberActionTarget = {
  id: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * Owner/admin-only member actions. What's offered depends on both who's
 * looking (the RLS policies enforce this server-side too — this is just the
 * UI reflecting what will actually succeed):
 *   - Admins can remove ordinary members, never other admins or the owner.
 *   - Only the owner can promote/demote admins.
 */
export function MemberActionSheet({
  visible,
  target,
  myRole,
  onMakeAdmin,
  onRemoveAdmin,
  onRemoveMember,
  onClose,
}: {
  visible: boolean;
  target: MemberActionTarget | null;
  myRole: 'owner' | 'admin' | 'member' | null;
  onMakeAdmin: () => void;
  onRemoveAdmin: () => void;
  onRemoveMember: () => void;
  onClose: () => void;
}) {
  if (!target) return null;

  const iAmOwner = myRole === 'owner';
  const canRemove = (myRole === 'owner' || myRole === 'admin') && target.role !== 'owner';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.sheetAnchor}>
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

          <View style={styles.header}>
            <Avatar
              emoji={target.avatarEmoji}
              label={target.displayName}
              size={44}
              ringColors={[target.avatarColor, target.avatarColor]}
            />
            <View style={styles.headerCopy}>
              <Text style={styles.headerName}>{target.displayName}</Text>
              <Text style={styles.headerRole}>
                {target.role === 'admin' ? 'Admin' : 'Member'}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            {iAmOwner && target.role === 'member' && (
              <ActionRow
                icon="shield-checkmark-outline"
                color={colors.primary}
                label="Make Admin"
                onPress={onMakeAdmin}
              />
            )}
            {iAmOwner && target.role === 'admin' && (
              <ActionRow
                icon="shield-outline"
                color={colors.onSurfaceVariant}
                label="Remove Admin"
                onPress={onRemoveAdmin}
              />
            )}
            {canRemove && (
              <ActionRow
                icon="exit-outline"
                color={colors.error}
                label="Remove from GC"
                onPress={onRemoveMember}
                destructive
              />
            )}
            {!canRemove && !(iAmOwner && target.role !== 'owner') && (
              <Text style={styles.noneText}>Nothing to do here.</Text>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  color,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableScale style={styles.row} scaleTo={0.98} haptic="medium" onPress={onPress}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderBright,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: glass.stroke,
  },
  headerCopy: { gap: 2 },
  headerName: { ...typography.titleMd, fontSize: 17, color: colors.onSurface },
  headerRole: { ...typography.micro, color: colors.onSurfaceVariant },
  actions: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowLabel: { ...typography.bodyMedium, color: colors.onSurface },
  noneText: { ...typography.caption, color: colors.outline, textAlign: 'center', padding: spacing.md },
});
