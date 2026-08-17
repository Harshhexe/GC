import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, typography, fontFamily } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from './ui/Glass';
import { Avatar } from './ui/Avatar';
import { GCButton } from './ui/Buttons';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import { supabase } from '../lib/supabase';
import type { DailyRecapResult } from '../lib/ai';
import type { WordleGroupResult, WordleState } from '../hooks/useWordle';

function StatCard({
  icon,
  iconColor,
  label,
  children,
  delay,
  onPress,
  accentBorderColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  children: React.ReactNode;
  delay: number;
  onPress?: () => void;
  accentBorderColor?: string;
}) {
  const content = (
    <GlassPanel
      borderRadius={radius.xl}
      style={[
        styles.card,
        !!accentBorderColor && { borderColor: accentBorderColor },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardIconWrap, { backgroundColor: `${iconColor}22` }]}>
          <Ionicons name={icon} size={15} color={iconColor} />
        </View>
        <Text style={[styles.cardLabel, { color: iconColor }]}>{label}</Text>
        {!!onPress && (
          <View style={styles.jumpPill}>
            <Text style={styles.jumpText}>Play / Jump</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </GlassPanel>
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      {onPress ? (
        <PressableScale scaleTo={0.98} haptic="light" onPress={onPress}>
          {content}
        </PressableScale>
      ) : (
        content
      )}
    </Animated.View>
  );
}

/**
 * Full-screen "Wrapped"-style reveal for yesterday's recap.
 * Uses background blur, chat-themed word gradients, and safe header spacing.
 */
export function DailyRecapModal({
  visible,
  recap,
  groupId,
  themeGradient,
  onClose,
  onJumpToMessage,
  onOpenWordy,
  onOpenWordle,
}: {
  visible: boolean;
  recap: DailyRecapResult | null;
  groupId?: string;
  themeGradient?: readonly [string, string];
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  onOpenWordy?: () => void;
  onOpenWordle?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [wordleState, setWordleState] = useState<WordleState | null>(null);
  const [wordleTop3, setWordleTop3] = useState<WordleGroupResult[]>([]);

  useEffect(() => {
    if (!visible || !recap?.date) return;
    const targetDate = recap.date;

    supabase.rpc('wordle_for_date', { p_date: targetDate }).then(({ data }) => {
      if (data) setWordleState(data as WordleState);
      else setWordleState(null);
    });

    if (groupId) {
      supabase
        .rpc('wordle_group_results', { p_group_id: groupId, p_date: targetDate })
        .then(({ data }) => {
          if (data) {
            const results = (data as WordleGroupResult[])
              .filter((r) => r.solved)
              .sort((a, b) => a.attempts - b.attempts)
              .slice(0, 3);
            setWordleTop3(results);
          } else {
            setWordleTop3([]);
          }
        });
    }
  }, [visible, recap?.date, groupId]);

  if (!recap) return null;

  const dateLabel = new Date(`${recap.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const gradientColors: readonly [string, string] = themeGradient
    ? [themeGradient[0], themeGradient[1]]
    : ['#8B5CF6', '#EC4899'];

  function jump(messageId: string) {
    onClose();
    onJumpToMessage(messageId);
  }

  function handleWordyPress() {
    onClose();
    if (onOpenWordy) onOpenWordy();
    else onOpenWordle?.();
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        <AmbientBackground variant="vivid" />

        {/* Safe Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }]}>
          <View style={styles.wrappedBadge}>
            <Ionicons name="sparkles" size={14} color="#FFD166" />
            <Text style={styles.wrappedBadgeText}>DAILY WRAPPED</Text>
          </View>

          <PressableScale
            style={styles.closeBtn}
            scaleTo={0.88}
            hitSlop={12}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </PressableScale>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom + 30, 48) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero: Word of the Day */}
          <Animated.View
            entering={FadeIn.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.hero}
          >
            <Text style={styles.dateLabel}>{dateLabel.toUpperCase()}</Text>

            <View style={styles.wordWrapper}>
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.wordChip}
              >
                <Text style={styles.wordText}>{recap.oneWord}</Text>
              </LinearGradient>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.statPill}>
                <Ionicons name="chatbubbles" size={13} color={colors.primary} />
                <Text style={styles.totalText}>
                  {recap.totalMessages} message{recap.totalMessages === 1 ? '' : 's'} recorded
                </Text>
              </View>
            </View>

            {recap.truncated && (
              <Text style={styles.truncatedNote}>
                It was a wild day — this recap covers the loudest highlights!
              </Text>
            )}
          </Animated.View>

          {/* User of the Day */}
          {recap.userOfTheDay && (
            <StatCard
              icon="flame"
              iconColor="#FF6B6B"
              label="👑 USER OF THE DAY"
              delay={80}
              accentBorderColor="rgba(255, 107, 107, 0.4)"
            >
              <View style={styles.personRow}>
                <Avatar
                  emoji={recap.userOfTheDay.avatarEmoji ?? undefined}
                  imageUrl={recap.userOfTheDay.avatarUrl}
                  label={recap.userOfTheDay.name}
                  size={52}
                  ring={true}
                  ringColors={[
                    recap.userOfTheDay.avatarColor ?? colors.secondary,
                    colors.primary,
                  ]}
                />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{recap.userOfTheDay.name}</Text>
                  <Text style={styles.personMeta}>
                    <Text style={styles.personBold}>{recap.userOfTheDay.messageCount}</Text> messages • undisputed yapper
                  </Text>
                </View>
                <View style={styles.yapperBadge}>
                  <Text style={styles.yapperBadgeText}>#1 YAPPER</Text>
                </View>
              </View>
            </StatCard>
          )}

          {/* Today's Wordy Word & Top 3 Guessers */}
          <StatCard
            icon="grid"
            iconColor="#10B981"
            label="🎯 TODAY'S WORDY"
            delay={140}
            onPress={onOpenWordy || onOpenWordle ? handleWordyPress : undefined}
            accentBorderColor="rgba(16, 185, 129, 0.4)"
          >
            {/* Wordy Target Word */}
            <View style={styles.wordleWordRow}>
              <View style={styles.wordleWordLeft}>
                <Text style={styles.wordleWordLabel}>TODAY'S WORD</Text>
                {wordleState?.finished && wordleState?.answer ? (
                  <View style={styles.wordleAnswerBox}>
                    {wordleState.answer
                      .toUpperCase()
                      .split('')
                      .map((char, ci) => (
                        <View key={ci} style={styles.wordleLetterTile}>
                          <Text style={styles.wordleLetterText}>{char}</Text>
                        </View>
                      ))}
                  </View>
                ) : (
                  <View style={styles.wordleUnsolvedBox}>
                    <Ionicons name="lock-closed" size={13} color="#10B981" />
                    <Text style={styles.wordleUnsolvedText}>
                      {wordleState?.solved ? 'SOLVED ✨' : 'PLAY TO REVEAL'}
                    </Text>
                  </View>
                )}
              </View>

              {(!!onOpenWordy || !!onOpenWordle) && (
                <PressableScale
                  style={styles.playWordleBtn}
                  scaleTo={0.92}
                  haptic="medium"
                  onPress={handleWordyPress}
                >
                  <Text style={styles.playWordleText}>Play 🟩</Text>
                </PressableScale>
              )}
            </View>

            {/* Top 3 Guessers List */}
            <View style={styles.guessersList}>
              <Text style={styles.guessersSectionTitle}>TOP 3 GUESSERS IN GC</Text>
              {wordleTop3.length === 0 ? (
                <View style={styles.emptyGuessers}>
                  <Text style={styles.emptyGuessersEmoji}>☕</Text>
                  <Text style={styles.emptyGuessersText}>
                    No one has solved today's Wordy yet. Be #1!
                  </Text>
                </View>
              ) : (
                wordleTop3.map((guesser, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                  return (
                    <View key={guesser.user_id} style={styles.guesserRow}>
                      <Text style={styles.guesserMedal}>{medal}</Text>
                      <Avatar
                        emoji={guesser.avatar_emoji ?? undefined}
                        imageUrl={guesser.avatar_url}
                        label={guesser.display_name}
                        size={36}
                        ring={true}
                        ringColors={[guesser.avatar_color ?? '#10B981', '#10B981']}
                      />
                      <View style={styles.guesserCopy}>
                        <Text style={styles.guesserName} numberOfLines={1}>
                          {guesser.display_name}
                        </Text>
                        <Text style={styles.guesserMeta}>
                          Solved in{' '}
                          <Text style={styles.guesserAttemptsHighlight}>
                            {guesser.attempts}/6
                          </Text>{' '}
                          attempts
                        </Text>
                      </View>
                      <View style={styles.miniPattern}>
                        {guesser.patterns.slice(-1)[0] && (
                          <Text style={styles.miniPatternText}>
                            {guesser.patterns
                              .slice(-1)[0]
                              .split('')
                              .map((m) => (m === 'g' ? '🟩' : m === 'y' ? '🟨' : '⬛'))
                              .join('')}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </StatCard>

          {/* Message of the Day */}
          {recap.messageOfTheDay && (
            <StatCard
              icon="trophy"
              iconColor={colors.yellow}
              label="🏆 MESSAGE OF THE DAY"
              delay={200}
              onPress={() => jump(recap.messageOfTheDay!.messageId)}
              accentBorderColor="rgba(255, 209, 102, 0.4)"
            >
              <View style={styles.quoteWrapper}>
                <Ionicons name="chatbox-ellipses" size={18} color={colors.yellow} style={styles.quoteIcon} />
                <Text style={styles.quoteText} numberOfLines={4}>
                  "{recap.messageOfTheDay.text}"
                </Text>
              </View>
              <View style={styles.quoteFooter}>
                <Text style={styles.quoteAuthor}>— {recap.messageOfTheDay.sender}</Text>
                <View style={styles.reactionPill}>
                  <Ionicons name="heart" size={12} color="#FF6B6B" />
                  <Text style={styles.reactionCount}>
                    {recap.messageOfTheDay.reactionCount} reaction{recap.messageOfTheDay.reactionCount === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </StatCard>
          )}

          {/* Best Tea */}
          {recap.bestTea && (
            <StatCard
              icon="cafe"
              iconColor="#34D399"
              label="☕ THE BIGGEST TEA"
              delay={240}
              onPress={() => jump(recap.bestTea!.messageId)}
              accentBorderColor="rgba(52, 211, 153, 0.4)"
            >
              <Text style={styles.captionText}>{recap.bestTea.caption}</Text>
            </StatCard>
          )}

          {/* Most Unhinged */}
          {recap.mostUnhinged && (
            <StatCard
              icon="skull"
              iconColor="#F472B6"
              label="💀 PEAK UNHINGED MOMENT"
              delay={280}
              onPress={() => jump(recap.mostUnhinged!.messageId)}
              accentBorderColor="rgba(244, 114, 182, 0.4)"
            >
              <Text style={styles.captionText}>{recap.mostUnhinged.caption}</Text>
            </StatCard>
          )}

          {!recap.userOfTheDay &&
            !recap.messageOfTheDay &&
            !recap.bestTea &&
            !recap.mostUnhinged && (
              <View style={styles.quietBox}>
                <Ionicons name="moon" size={32} color={colors.outline} />
                <Text style={styles.quietText}>
                  Genuinely quiet day. Nobody spilled tea or caused chaos.
                </Text>
              </View>
            )}

          {/* Back to Chat Button */}
          <Animated.View
            entering={FadeInDown.delay(340).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.ctaWrap}
          >
            <GCButton
              label="Back to Chat"
              variant="gradient"
              icon={<Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
              onPress={onClose}
            />
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    zIndex: 20,
  },
  wrappedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  wrappedBadgeText: {
    ...typography.label,
    fontSize: 12,
    color: '#FFD166',
    letterSpacing: 1,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dateLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
    fontSize: 13,
  },
  wordWrapper: {
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    marginVertical: spacing.xs,
  },
  wordChip: {
    paddingHorizontal: spacing.xxl + 4,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  wordText: {
    ...typography.hero,
    fontSize: 40,
    color: '#FFFFFF',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  totalText: {
    ...typography.caption,
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  truncatedNote: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    fontSize: 12,
    maxWidth: 280,
  },

  // Stat Card
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(25, 20, 38, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    ...typography.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    flex: 1,
  },
  jumpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  jumpText: {
    ...typography.micro,
    color: colors.primary,
    fontWeight: '700',
  },
  cardBody: {
    gap: spacing.sm,
  },

  // User of the Day
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  personCopy: {
    flex: 1,
    gap: 2,
  },
  personName: {
    ...typography.title,
    fontSize: 18,
    color: colors.onSurface,
  },
  personMeta: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontSize: 13,
  },
  personBold: {
    color: colors.onSurface,
    fontWeight: '700',
  },
  yapperBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  yapperBadgeText: {
    ...typography.micro,
    color: '#FF6B6B',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // Today's Wordle Card Elements
  wordleWordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  wordleWordLeft: {
    gap: 6,
  },
  wordleWordLabel: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  wordleAnswerBox: {
    flexDirection: 'row',
    gap: 4,
  },
  wordleLetterTile: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordleLetterText: {
    fontFamily: fontFamily.displayBold,
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  wordleUnsolvedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  wordleUnsolvedText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    color: '#10B981',
    fontWeight: '800',
  },
  playWordleBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  playWordleText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
  },

  // Guessers List
  guessersList: {
    gap: 8,
    paddingTop: 4,
  },
  guessersSectionTitle: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  emptyGuessers: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
  },
  emptyGuessersEmoji: {
    fontSize: 22,
  },
  emptyGuessersText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  guesserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  guesserMedal: {
    fontSize: 18,
  },
  guesserCopy: {
    flex: 1,
    gap: 2,
  },
  guesserName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guesserMeta: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
  },
  guesserAttemptsHighlight: {
    color: '#10B981',
    fontWeight: '800',
  },
  miniPattern: {
    alignItems: 'flex-end',
  },
  miniPatternText: {
    fontSize: 10,
    letterSpacing: -1,
  },

  // Message of the Day
  quoteWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  quoteIcon: {
    marginTop: 2,
  },
  quoteText: {
    ...typography.body,
    color: colors.onSurface,
    fontSize: 14.5,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 20,
  },
  quoteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  quoteAuthor: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  reactionCount: {
    ...typography.micro,
    color: '#FF6B6B',
    fontWeight: '700',
  },

  // Captions
  captionText: {
    ...typography.body,
    color: colors.onSurface,
    fontSize: 14,
    lineHeight: 20,
  },

  quietBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  quietText: {
    ...typography.body,
    color: colors.outline,
    textAlign: 'center',
    maxWidth: 260,
  },
  ctaWrap: {
    paddingTop: spacing.xs,
  },
});
