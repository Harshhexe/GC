import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, gradients, radius, spacing, typography } from '../theme/theme';
import { duration, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { successFeedback } from '../utils/haptics';
import { inviteLinkFor, inviteMessageFor } from '../lib/inviteLink';

/** The code, big and monospaced-ish, with copy + share. Used after creating a
 *  GC and again any time a member wants to pull the code back up. */
export function InviteCodeCard({ code, groupName }: { code: string; groupName?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // The link, not the bare code. Someone who copies this is about to paste it
    // to a friend, and a link is one tap for them where a code is five steps.
    await Clipboard.setStringAsync(inviteLinkFor(code));
    successFeedback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleShare() {
    await Share.share({
      message: inviteMessageFor(code, groupName ?? 'my GC'),
    }).catch(() => {});
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>invite code</Text>

      <View style={styles.codeBox}>
        <LinearGradient
          colors={gradients.sheen}
          style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
        />
        <Text style={styles.code}>{code}</Text>
      </View>

      {/* The link is shown as well as the code so "copy link" and "share" are
          not silently acting on something the screen never displayed. */}
      <Text style={styles.link} numberOfLines={1} ellipsizeMode="tail">
        {inviteLinkFor(code)}
      </Text>

      <View style={styles.actions}>
        <PressableScale style={styles.action} haptic="medium" onPress={handleCopy}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? colors.green : colors.textPrimary}
          />
          <Text style={[styles.actionText, copied && styles.actionTextDone]}>
            {copied ? 'link copied' : 'copy link'}
          </Text>
        </PressableScale>

        <PressableScale style={styles.action} haptic="medium" onPress={handleShare}>
          <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
          <Text style={styles.actionText}>share</Text>
        </PressableScale>
      </View>

      {copied && (
        <Animated.Text
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          style={styles.hint}
        >
          send it to anyone. the link drops them straight into this GC.
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignItems: 'center' },
  label: { ...typography.label, color: colors.textFaint },
  codeBox: {
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    overflow: 'hidden',
  },
  code: {
    fontFamily: typography.title.fontFamily,
    fontSize: 34,
    letterSpacing: 8,
    color: colors.textPrimary,
    textAlign: 'center',
    // letterSpacing adds trailing space after the last glyph; pull it back so
    // the code stays optically centred in the box.
    marginRight: -8,
  },
  link: {
    ...typography.micro,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  actionText: { ...typography.caption, color: colors.textPrimary },
  actionTextDone: { color: colors.green },
  hint: { ...typography.micro, color: colors.textFaint, textAlign: 'center' },
});
