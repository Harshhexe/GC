import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from './ui/Avatar';
import { PressableScale } from './ui/PressableScale';
import { fetchPollVoters, type Poll, type PollVoter } from '../lib/polls';

/**
 * Who voted for what, on a non-anonymous poll.
 *
 * Loaded on open rather than alongside the poll: most polls are never opened
 * this way, and voter identities are the one part of a poll that shouldn't be
 * sitting in memory on every device that merely rendered the card.
 *
 * The caller only mounts this for non-anonymous polls, and `poll_voters`
 * refuses anonymous ones server-side regardless — the flag is enforced in two
 * places because a UI-only guard would make `anonymous` a decoration.
 */
export function PollVotersSheet({
  visible,
  poll,
  tint,
  onClose,
}: {
  visible: boolean;
  poll: Poll | null;
  tint: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [voters, setVoters] = useState<Record<string, PollVoter[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !poll) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPollVoters(poll.id).then(({ voters: v, error: e }) => {
      if (cancelled) return;
      setVoters(v);
      setError(e);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, poll]);

  if (!poll) return null;

  const total = Object.values(poll.voteCounts).reduce((a, b) => a + b, 0);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.anchor}>
        <Animated.View
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          exiting={SlideOutDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Ionicons name="people" size={16} color={tint} />
            <Text style={styles.title} numberOfLines={2}>
              {poll.question}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {total} vote{total === 1 ? '' : 's'}
          </Text>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={tint} />
            </View>
          ) : error ? (
            <Text style={styles.error}>Couldn't load who voted.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {poll.options.map((option) => {
                const list = voters[option.id] ?? [];
                return (
                  <View key={option.id} style={styles.optionBlock}>
                    <View style={styles.optionHead}>
                      <Text style={styles.optionText} numberOfLines={1}>
                        {option.text}
                      </Text>
                      <Text style={styles.optionCount}>{list.length}</Text>
                    </View>

                    {list.length === 0 ? (
                      <Text style={styles.noVoters}>No votes</Text>
                    ) : (
                      list.map((v) => (
                        <View key={v.userId} style={styles.voterRow}>
                          <Avatar
                            emoji={v.avatarEmoji ?? undefined}
                            imageUrl={v.avatarUrl}
                            label={v.name}
                            size={28}
                            ringColors={[v.avatarColor ?? tint, tint]}
                          />
                          <Text style={styles.voterName} numberOfLines={1}>
                            {v.name}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <PressableScale style={styles.doneBtn} scaleTo={0.97} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </PressableScale>
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
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '78%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderBright,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  title: { ...typography.titleMd, fontSize: 16, color: colors.onSurface, flex: 1 },
  subtitle: {
    ...typography.micro,
    fontSize: 11,
    color: colors.outline,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  centered: { paddingVertical: spacing.xl, alignItems: 'center' },
  error: { ...typography.body, fontSize: 13.5, color: colors.error, paddingVertical: spacing.md },
  list: { paddingBottom: spacing.md, gap: spacing.md },
  optionBlock: { gap: 6 },
  optionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    paddingBottom: 5,
  },
  optionText: { ...typography.bodyMedium, fontSize: 14, color: colors.onSurface, flex: 1 },
  optionCount: { ...typography.label, fontSize: 12, color: colors.onSurfaceVariant },
  noVoters: { ...typography.micro, fontSize: 11.5, color: colors.outline, paddingVertical: 2 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  voterName: { ...typography.body, fontSize: 14, color: colors.onSurface, flex: 1 },
  doneBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  doneText: { ...typography.bodyMedium, fontSize: 14.5, color: colors.onSurface },
});
