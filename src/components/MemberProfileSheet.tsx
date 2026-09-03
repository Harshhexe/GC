import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { Avatar } from './ui/Avatar';
import { GlassPanel } from './ui/Glass';
import { PressableScale } from './ui/PressableScale';
import { DraggableSheet } from './ui/DraggableSheet';
import { successFeedback } from '../utils/haptics';
import type { GroupMember } from '../types';

/**
 * A rich, stunning preview of a member — opened by tapping their @mention in a message.
 * Displays large glowing avatar, role identity, copyable username, and instant actions.
 */
export function MemberProfileSheet({
  visible,
  member,
  onClose,
  onMention,
  onSearchMessages,
}: {
  visible: boolean;
  member: GroupMember | null;
  onClose: () => void;
  onMention?: (member: GroupMember) => void;
  onSearchMessages?: (member: GroupMember) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!member) return null;

  const roleLabel =
    member.role === 'owner' ? 'OWNER' : member.role === 'admin' ? 'ADMIN' : 'MEMBER';
  const roleColor =
    member.role === 'owner' ? '#FBBF24' : member.role === 'admin' ? '#38BDF8' : '#818CF8';
  const roleBg =
    member.role === 'owner'
      ? 'rgba(251, 191, 36, 0.14)'
      : member.role === 'admin'
      ? 'rgba(56, 189, 248, 0.14)'
      : 'rgba(129, 140, 248, 0.12)';
  const roleBorder =
    member.role === 'owner'
      ? 'rgba(251, 191, 36, 0.35)'
      : member.role === 'admin'
      ? 'rgba(56, 189, 248, 0.35)'
      : 'rgba(129, 140, 248, 0.28)';

  async function handleCopyUsername() {
    if (!member?.username) return;
    successFeedback();
    await Clipboard.setStringAsync(`@${member.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleMentionPress() {
    if (!member) return;
    successFeedback();
    onClose();
    onMention?.(member);
  }

  function handleSearchPress() {
    if (!member) return;
    successFeedback();
    onClose();
    onSearchMessages?.(member);
  }

  return (
    <DraggableSheet visible={visible} onClose={onClose} style={styles.sheet}>
      <View style={styles.container}>
        {/* Glowing Background Radial */}
        <View style={styles.haloWrap} pointerEvents="none">
          <LinearGradient
            colors={[`${member.avatarColor || '#818CF8'}26`, 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 0.9 }}
          />
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <Avatar
            emoji={member.avatarEmoji}
            imageUrl={member.avatarUrl}
            label={member.displayName}
            size={76}
            ringColors={[member.avatarColor || colors.primary, colors.secondary]}
          />

          <View style={styles.nameBlock}>
            <Text style={styles.displayName}>{member.displayName}</Text>
            {!!member.username && (
              <PressableScale
                style={styles.usernamePill}
                scaleTo={0.95}
                haptic="light"
                onPress={handleCopyUsername}
              >
                <Text style={styles.usernameText}>@{member.username}</Text>
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={12}
                  color={copied ? '#34D399' : colors.outline}
                />
              </PressableScale>
            )}
          </View>

          {/* Role Badge */}
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: roleBg, borderColor: roleBorder },
            ]}
          >
            <Ionicons
              name={
                member.role === 'owner'
                  ? 'ribbon'
                  : member.role === 'admin'
                  ? 'shield-checkmark'
                  : 'person'
              }
              size={11}
              color={roleColor}
            />
            <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionRow}>
          <PressableScale
            scaleTo={0.96}
            haptic="medium"
            style={styles.actionCard}
            onPress={handleMentionPress}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(129, 140, 248, 0.15)' }]}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#818CF8" />
            </View>
            <Text style={styles.actionCardLabel}>Mention in Chat</Text>
          </PressableScale>

          <PressableScale
            scaleTo={0.96}
            haptic="light"
            style={styles.actionCard}
            onPress={handleCopyUsername}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(52, 211, 153, 0.15)' }]}>
              <Ionicons name={copied ? 'checkmark' : 'copy'} size={18} color={copied ? '#34D399' : '#34D399'} />
            </View>
            <Text style={styles.actionCardLabel}>{copied ? 'Copied!' : 'Copy @handle'}</Text>
          </PressableScale>

          {onSearchMessages && (
            <PressableScale
              scaleTo={0.96}
              haptic="light"
              style={styles.actionCard}
              onPress={handleSearchPress}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(251, 191, 36, 0.15)' }]}>
                <Ionicons name="search" size={18} color="#FBBF24" />
              </View>
              <Text style={styles.actionCardLabel}>Messages</Text>
            </PressableScale>
          )}
        </View>

        {/* Identity Context Card */}
        <GlassPanel borderRadius={radius.lg} style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="people-outline" size={15} color={colors.onSurfaceVariant} />
              <Text style={styles.infoLabel}>Chat Status</Text>
            </View>
            <Text style={styles.infoVal}>Active Member</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="shield-outline" size={15} color={colors.onSurfaceVariant} />
              <Text style={styles.infoLabel}>Role Permissions</Text>
            </View>
            <Text style={styles.infoVal}>
              {member.role === 'owner'
                ? 'Full GC Control'
                : member.role === 'admin'
                ? 'Manage Chat & Pins'
                : 'Standard Member'}
            </Text>
          </View>
        </GlassPanel>
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
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.lg,
    position: 'relative',
  },
  haloWrap: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    height: 180,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },

  // Avatar & Identity
  avatarSection: {
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingTop: spacing.sm,
  },
  nameBlock: {
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  displayName: {
    ...typography.titleMd,
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
  },
  usernamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  usernameText: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    marginTop: 2,
  },
  roleText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardLabel: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.onSurface,
  },

  // Info Card
  infoCard: {
    padding: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  infoLabel: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.onSurfaceVariant,
  },
  infoVal: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.onSurface,
  },
  infoDivider: {
    height: 1,
    backgroundColor: glass.stroke,
  },
});
