import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { GlassPanel } from './ui/Glass';
import { aiErrorMessage } from '../lib/ai';
import type { GCCommandEntry } from '../hooks/useGCCommands';

const THINKING_LINES = [
  'Gathering the lore...',
  'Reading the chaos...',
  'Connecting the dots...',
  'Checking the receipts...',
  'Cooking...',
];

function Thinking({ accent }: { accent: string }) {
  const [line, setLine] = useState(THINKING_LINES[0]);

  useEffect(() => {
    let i = 0;
    // Slow enough to actually read — a label that flips faster than you can
    // finish it reads as a glitch rather than progress.
    const timer = setInterval(() => {
      i = (i + 1) % THINKING_LINES.length;
      setLine(THINKING_LINES[i]);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <Animated.Text key={line} entering={FadeIn.duration(duration.fast)} style={[styles.thinking, { color: accent }]}>
      {line}
    </Animated.Text>
  );
}

/**
 * An @gc exchange in the chat feed.
 *
 * Deliberately not a MessageBubble: this isn't a member speaking, and styling
 * it like one would invite the group to read AI output as something a person
 * said. It's full-width, badged, and has no avatar/reactions/reply affordances
 * — the visual grammar says "system", not "member".
 */
export function GCAIMessage({
  entry,
  accent,
  onViewSources,
  onJumpToMessage,
  onRetry,
  onSendToGC,
  shared,
}: {
  entry: GCCommandEntry;
  accent: string;
  /** Given the ids to walk through; ChatScreen owns the actual jumping. */
  onViewSources: (entry: GCCommandEntry) => void;
  onJumpToMessage: (messageId: string) => void;
  onRetry: (entryId: string) => void;
  onSendToGC: (entry: GCCommandEntry) => void;
  /** Already shared — the button becomes a confirmation so it can't be
   *  double-posted by someone tapping again to check it worked. */
  shared: boolean;
}) {
  const sourceCount = entry.result?.sourceMessageIds.length ?? 0;

  return (
    <View style={styles.wrap}>
      {/* The message this was asked about, when they swiped to reply first —
          without it, "explain this" would be an answer with no visible
          subject. Tappable, since the quoted preview is a snippet. */}
      {!!entry.replyTo && (
        <PressableScale
          style={[styles.quoteRow, { borderLeftColor: accent }]}
          scaleTo={0.98}
          haptic="light"
          onPress={() => onJumpToMessage(entry.replyTo!.id)}
        >
          <Text style={[styles.quoteAuthor, { color: accent }]} numberOfLines={1}>
            {entry.replyTo.authorName}
          </Text>
          <Text style={styles.quoteText} numberOfLines={1}>
            {entry.replyTo.preview}
          </Text>
        </PressableScale>
      )}

      {/* The question, echoed back small — it never became a real message, so
          without this the answer would float with nothing it replies to. */}
      <View style={styles.askRow}>
        <Ionicons name="return-down-forward" size={13} color={colors.outline} />
        <Text style={styles.askText} numberOfLines={2}>
          {entry.question || 'asked GC something'}
        </Text>
      </View>

      <GlassPanel borderRadius={radius.lg} style={[styles.card, { borderColor: `${accent}44` }]}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
            <Ionicons name="sparkles" size={11} color={accent} />
            <Text style={[styles.badgeText, { color: accent }]}>GC AI</Text>
          </View>
        </View>

        {entry.status === 'loading' && <Thinking accent={accent} />}

        {entry.status === 'error' && (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>
              {/* Copy comes from the error *code*, never the server's message —
                  no provider text can reach a user this way. */}
              {aiErrorMessage(entry.error)}
            </Text>
            {entry.error?.retryable !== false && (
              <PressableScale
                style={[styles.retryBtn, { borderColor: `${accent}55` }]}
                scaleTo={0.96}
                haptic="light"
                onPress={() => onRetry(entry.id)}
              >
                <Ionicons name="refresh" size={13} color={accent} />
                <Text style={[styles.retryText, { color: accent }]}>Try again</Text>
              </PressableScale>
            )}
          </View>
        )}

        {entry.status === 'done' && !!entry.result && (
          <Animated.View
            entering={FadeIn.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.answerBlock}
          >
            <Text style={styles.answerText}>{entry.result.text}</Text>

            <View style={styles.actionRow}>
              {sourceCount > 0 && (
                <PressableScale
                  style={styles.sourceBtn}
                  scaleTo={0.97}
                  haptic="light"
                  onPress={() => onViewSources(entry)}
                >
                  <Ionicons name="arrow-forward-circle-outline" size={15} color={accent} />
                  <Text style={[styles.sourceText, { color: accent }]}>
                    {sourceCount === 1 ? 'View message' : `View ${sourceCount} messages`}
                  </Text>
                </PressableScale>
              )}

              {/* Only this member can see the answer until they choose to
                  share it — it was built from their view of the chat. */}
              {shared ? (
                <View style={styles.sourceBtn}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.outline} />
                  <Text style={[styles.sourceText, { color: colors.outline }]}>Sent to GC</Text>
                </View>
              ) : (
                <PressableScale
                  style={styles.sourceBtn}
                  scaleTo={0.97}
                  haptic="medium"
                  onPress={() => onSendToGC(entry)}
                >
                  <Ionicons name="send" size={13} color={accent} />
                  <Text style={[styles.sourceText, { color: accent }]}>Send to GC</Text>
                </PressableScale>
              )}
            </View>
          </Animated.View>
        )}
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, gap: 4 },
  quoteRow: {
    borderLeftWidth: 2.5,
    paddingLeft: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.xs,
    gap: 1,
  },
  quoteAuthor: { ...typography.micro, fontWeight: '700', fontSize: 11 },
  quoteText: { ...typography.micro, color: colors.onSurfaceVariant, fontSize: 11.5 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: spacing.xs },
  askText: { ...typography.micro, color: colors.outline, flex: 1, fontStyle: 'italic' },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    backgroundColor: 'rgba(25, 20, 38, 0.75)',
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { ...typography.micro, fontWeight: '800', letterSpacing: 0.6, fontSize: 10 },
  thinking: { ...typography.body, fontSize: 14, fontStyle: 'italic' },
  answerBlock: { gap: spacing.sm },
  answerText: { ...typography.body, color: colors.onSurface, lineHeight: 21 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
  sourceBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  sourceText: { ...typography.label, fontSize: 11 },
  errorBlock: { gap: spacing.sm, alignItems: 'flex-start' },
  errorText: { ...typography.body, color: colors.onSurfaceVariant },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryText: { ...typography.label, fontSize: 11 },
});
