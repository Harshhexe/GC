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

/** The code, big and monospaced-ish, with copy + share. Used after creating a
 *  GC and again any time a member wants to pull the code back up. */
export function InviteCodeCard({ code, groupName }: { code: string; groupName?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    successFeedback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleShare() {
    await Share.share({
      message: groupName
        ? `join "${groupName}" on GC — code: ${code}`
        : `join my GC — code: ${code}`,
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

      <View style={styles.actions}>
        <PressableScale style={styles.action} haptic="medium" onPress={handleCopy}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? colors.green : colors.textPrimary}
          />
          <Text style={[styles.actionText, copied && styles.actionTextDone]}>
            {copied ? 'copied' : 'copy'}
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
          send it to the group. they tap "join" and paste it.
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
