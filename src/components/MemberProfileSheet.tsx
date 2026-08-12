import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from './ui/Avatar';
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
        </Animated.View>
      </View>
    </Modal>
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
    paddingBottom: spacing.xxl + spacing.lg,
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
