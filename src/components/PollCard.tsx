import { useEffect, useMemo, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { easing } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { PollVotersSheet } from './PollVotersSheet';
import type { Poll } from '../lib/polls';

/** Fills to its share of the vote with smooth animation */
function ResultBar({ pct, tint, isLeader }: { pct: number; tint: string; isLeader?: boolean }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(pct, { duration: 480, easing: easing.out });
  }, [pct, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, style]}>
        <LinearGradient
          colors={
            isLeader
              ? [tint, `${tint}CC`]
              : ['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.12)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/**
 * A poll card inside a chat message bubble.
 */
export function PollCard({
  poll,
  myVotes,
  tint,
  onVote,
  onLongPress,
}: {
  poll: Poll;
  myVotes: string[];
  tint: string;
  onVote: (optionIds: string[]) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const [staged, setStaged] = useState<string[]>(myVotes);
  const [votersOpen, setVotersOpen] = useState(false);
  useEffect(() => setStaged(myVotes), [myVotes]);

  const totalVotes = useMemo(
    () => Object.values(poll.voteCounts).reduce((a, b) => a + b, 0),
    [poll.voteCounts]
  );

  const maxVotes = useMemo(
    () => Math.max(...Object.values(poll.voteCounts), 0),
    [poll.voteCounts]
  );

  const hasVoted = myVotes.length > 0;
  const canSeeVoters = !poll.anonymous && totalVotes > 0;
  const dirty =
    poll.allowMultiple && staged.slice().sort().join() !== myVotes.slice().sort().join();

  function tap(optionId: string) {
    if (poll.allowMultiple) {
      setStaged((prev) =>
        prev.includes(optionId) ? prev.filter((o) => o !== optionId) : [...prev, optionId]
      );
      return;
    }
    onVote(myVotes.includes(optionId) ? [] : [optionId]);
  }

  return (
    <PressableScale
      style={styles.card}
      scaleTo={1}
      onLongPress={onLongPress}
      onPress={undefined}
    >
      {/* Header Badge & Question */}
      <View style={styles.header}>
        <View style={[styles.pollBadge, { backgroundColor: `${tint}18`, borderColor: `${tint}40` }]}>
          <Ionicons name="stats-chart" size={12} color={tint} />
          <Text style={[styles.pollBadgeText, { color: tint }]}>POLL</Text>
        </View>
        <Text style={styles.question}>{poll.question}</Text>
      </View>

      {/* Option Rows */}
      <View style={styles.options}>
        {poll.options.map((option) => {
          const count = poll.voteCounts[option.id] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const selected = poll.allowMultiple
            ? staged.includes(option.id)
            : myVotes.includes(option.id);
          const isLeader = totalVotes > 0 && count === maxVotes && count > 0;

          return (
            <PressableScale
              key={option.id}
              style={[
                styles.option,
                selected && {
                  borderColor: tint,
                  backgroundColor: `${tint}12`,
                },
              ]}
              scaleTo={0.98}
              haptic="light"
              onPress={() => tap(option.id)}
            >
              <View style={styles.optionRow}>
                <View
                  style={[
                    styles.radioBox,
                    selected && { borderColor: tint, backgroundColor: `${tint}25` },
                  ]}
                >
                  <Ionicons
                    name={
                      poll.allowMultiple
                        ? selected
                          ? 'checkbox'
                          : 'square-outline'
                        : selected
                          ? 'radio-button-on'
                          : 'radio-button-off'
                    }
                    size={16}
                    color={selected ? tint : '#94A3B8'}
                  />
                </View>

                <Text
                  style={[styles.optionText, selected && { color: '#FFFFFF', fontWeight: '700' }]}
                  numberOfLines={2}
                >
                  {option.text}
                </Text>

                {(hasVoted || totalVotes > 0) && (
                  <View style={styles.voteCountBadge}>
                    <Text style={[styles.optionPercent, isLeader && { color: tint, fontWeight: '800' }]}>
                      {pct}%
                    </Text>
                  </View>
                )}
              </View>

              {(hasVoted || totalVotes > 0) && (
                <ResultBar pct={pct} tint={tint} isLeader={isLeader} />
              )}
            </PressableScale>
          );
        })}
      </View>

      {/* Multi-choice Submit Action */}
      {poll.allowMultiple && dirty && (
        <PressableScale
          style={[styles.submitBtn, { backgroundColor: tint }]}
          scaleTo={0.96}
          haptic="medium"
          onPress={() => onVote(staged)}
        >
          <Text style={styles.submitBtnText}>
            {staged.length === 0 ? 'Clear vote' : 'Submit vote'}
          </Text>
        </PressableScale>
      )}

      {/* Footer Meta. Tappable only when there is something to show and the
          poll isn't anonymous — an affordance that can only ever error is
          worse than none, and `anonymous` is enforced server-side too. */}
      <PressableScale
        style={styles.footer}
        scaleTo={canSeeVoters ? 0.98 : 1}
        haptic={canSeeVoters ? 'light' : undefined}
        onPress={canSeeVoters ? () => setVotersOpen(true) : undefined}
      >
        <Ionicons name="people-outline" size={13} color="#94A3B8" />
        <Text style={styles.footerText}>
          {totalVotes === 0 ? 'No votes yet' : `${totalVotes} vote${totalVotes === 1 ? '' : 's'}`}
          {poll.allowMultiple ? ' · Multiple' : ''}
        </Text>

        {canSeeVoters && (
          <View style={styles.seeVotesRow}>
            <Text style={[styles.seeVotesText, { color: tint }]}>See votes</Text>
            <Ionicons name="chevron-forward" size={12} color={tint} />
          </View>
        )}

        {poll.anonymous && (
          <View style={styles.anonPill}>
            <Ionicons name="eye-off" size={11} color="#94A3B8" />
            <Text style={styles.anonText}>Anonymous</Text>
          </View>
        )}
      </PressableScale>

      <PollVotersSheet
        visible={votersOpen}
        poll={poll}
        tint={tint}
        onClose={() => setVotersOpen(false)}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 240,
    maxWidth: 300,
    gap: spacing.sm,
    paddingVertical: 2,
  },
  header: {
    gap: 6,
  },
  pollBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pollBadgeText: {
    ...typography.micro,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  question: {
    ...typography.title,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 21,
  },
  options: {
    gap: 7,
  },
  option: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  radioBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurface,
    flex: 1,
  },
  voteCountBadge: {
    paddingLeft: 4,
  },
  optionPercent: {
    ...typography.label,
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  barTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    marginTop: 2,
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  submitBtn: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    marginTop: 2,
  },
  submitBtnText: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
  },
  footerText: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  seeVotesRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  seeVotesText: { ...typography.micro, fontSize: 11, fontWeight: '700' },
  anonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  anonText: {
    ...typography.micro,
    fontSize: 10,
    color: '#94A3B8',
  },
});
