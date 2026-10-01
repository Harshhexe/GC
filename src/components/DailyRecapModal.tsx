import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, fontFamily, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from './ui/Glass';
import { Avatar } from './ui/Avatar';
import { GCButton } from './ui/Buttons';
import { PressableScale } from './ui/PressableScale';
import { AIStoryHero } from './ui/AIStoryHero';
import {
  AuroraBackground,
  SpotlightCard,
  ShinyText,
  DecryptedText,
  NeonBadge,
  AIPulsingCore,
  BentoStatBox,
} from './reactbits';
import { supabase } from '../lib/supabase';
import type { DailyRecapResult } from '../lib/ai';
import type { WordleGroupResult, WordleState } from '../hooks/useWordle';

/** A quiet tint keeps the group's identity without competing with the recap. */
function ThemedGlowBackground({ colors: gradientColors }: { colors: readonly [string, string] }) {
  const [c1] = gradientColors;
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      <LinearGradient
        colors={[`${c1}10`, colors.appRoot, colors.appRoot]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

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
    <SpotlightCard
      spotlightColor={`${iconColor}2a`}
      borderColor={accentBorderColor || 'rgba(255, 255, 255, 0.12)'}
      borderRadius={22}
      style={styles.card}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardIconWrap, { backgroundColor: `${iconColor}22` }]}>
          <Ionicons name={icon} size={15} color={iconColor} />
        </View>
        <Text style={[styles.cardLabel, { color: iconColor }]}>{label}</Text>
        {!!onPress && (
          <View style={styles.jumpPill}>
            <Text style={styles.jumpText}>View message</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </SpotlightCard>
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
 * Full-screen / Centered Wrapped-style reveal for daily stats & recap.
 * On Web: Displays as a sleek centered modal dialog matching What I Missed.
 * On Mobile: Full-screen Wrapped experience with ambient blur.
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

  const isWeb = Platform.OS === 'web';

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
            const results = (data as WordleGroupResult[]).sort((a, b) => {
              if (a.solved !== b.solved) return a.solved ? -1 : 1;
              return a.attempts - b.attempts;
            });
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

  const modalBody = (
    <>
      <SpotlightCard
        spotlightColor={`${gradientColors[0]}44`}
        borderColor={`${gradientColors[0]}55`}
        borderRadius={26}
        style={styles.heroCard}
      >
        <View style={styles.recapHeroInner}>
          <View style={styles.recapHeroTopRow}>
            <AIPulsingCore accentColor={gradientColors[0]} size={46} icon="sparkles" />
            <View style={styles.recapHeroBadgeCol}>
              <NeonBadge label="THE DAILY RECAP" color={gradientColors[0]} />
              <ShinyText
                text="AI INTELLIGENCE REPORT • DAY / 01"
                style={styles.recapHeroShimmer}
                shineColor="#FFFFFF"
                baseColor="rgba(255, 255, 255, 0.65)"
              />
            </View>
          </View>

          <View style={styles.recapHeroTitleWrap}>
            <DecryptedText
              text={recap.oneWord.toUpperCase()}
              style={styles.recapHeroTitle}
              speed={32}
            />
            <Text style={styles.recapHeroDesc}>
              {recap.truncated
                ? 'A busy day, distilled to its most important moments.'
                : 'One day in your GC, remembered in a few good moments.'}
            </Text>
          </View>

          <View style={styles.recapBentoRow}>
            <BentoStatBox
              icon="calendar"
              iconColor={gradientColors[0]}
              value={dateLabel.split(',')[0]}
              label="Day"
              sublabel={dateLabel.split(',')[1]?.trim() || 'Today'}
            />
            <BentoStatBox
              icon="chatbubble-ellipses"
              iconColor={gradientColors[1]}
              value={recap.totalMessages}
              label="Messages"
              sublabel="Activity"
            />
            <BentoStatBox
              icon={recap.userOfTheDay ? 'flame' : 'sparkles'}
              iconColor="#F59E0B"
              value={recap.userOfTheDay?.name || 'All Active'}
              label="Top Contributor"
              sublabel={recap.userOfTheDay ? `${recap.userOfTheDay.messageCount} msgs` : 'Squad'}
            />
          </View>
        </View>
      </SpotlightCard>

      {/* User of the Day */}
      {recap.userOfTheDay && (
        <StatCard
          icon="flame"
          iconColor="#FF6B6B"
          label="Most active"
          delay={80}
          accentBorderColor="rgba(255, 107, 107, 0.2)"
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

        {/* Leaderboard & Guessers List */}
        <View style={styles.guessersList}>
          <Text style={styles.guessersSectionTitle}>GC WORDY LEADERBOARD</Text>
          {wordleTop3.length === 0 ? (
            <View style={styles.emptyGuessers}>
              <Text style={styles.emptyGuessersEmoji}>☕</Text>
              <Text style={styles.emptyGuessersText}>
                No one has played today's Wordy yet. Be #1!
              </Text>
            </View>
          ) : (
            wordleTop3.map((guesser, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
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
                      {guesser.solved ? (
                        <>
                          Solved in{' '}
                          <Text style={styles.guesserAttemptsHighlight}>
                            {guesser.attempts}/6
                          </Text>{' '}
                          attempts
                        </>
                      ) : (
                        <Text style={{ color: colors.onSurfaceVariant }}>
                          {guesser.attempts}/6 attempts
                        </Text>
                      )}
                    </Text>
                  </View>
                  <View style={styles.miniPattern}>
                    {guesser.patterns.map((p, pIdx) => (
                      <Text key={pIdx} style={styles.miniPatternText}>
                        {p
                          .split('')
                          .map((m) => (m === 'g' ? '🟩' : m === 'y' ? '🟨' : '⬛'))
                          .join('')}
                      </Text>
                    ))}
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
    </>
  );

  // Web rendering: Centered floating card with What I Missed desktop styling
  if (isWeb) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.webModalLayer}>
          <Pressable style={styles.webBackdrop} onPress={onClose} />

          <View style={styles.webCard}>
            <AuroraBackground color1={gradientColors[0]} color2={gradientColors[1]} color3="#06B6D4" opacity={0.34} />

            {/* Web Header */}
            <View style={styles.webHeader}>
              <View style={styles.webHeaderLeft}>
                <PressableScale
                  style={styles.closeBtn}
                  scaleTo={0.9}
                  onPress={onClose}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </PressableScale>
                <View style={styles.webHeaderTitles}>
                  <Text style={styles.webHeaderTitle}>Daily Recap</Text>
                  <Text style={styles.webHeaderSub}>{dateLabel}</Text>
                </View>
              </View>

              <View style={styles.wrappedBadge}>
                <Ionicons name="sparkles" size={13} color="#FFD166" />
                <Text style={styles.wrappedBadgeText}>DAILY WRAPPED</Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.webScroll}
              showsVerticalScrollIndicator={false}
            >
              {modalBody}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // Mobile rendering: Full-screen Wrapped presentation
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <AuroraBackground color1={gradientColors[0]} color2={gradientColors[1]} color3="#06B6D4" opacity={0.34} />

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
          {modalBody}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },

  // Glowing Ambient Background
  glowBgRoot: { backgroundColor: colors.appRoot, overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 440 },

  // Web Modal Layer
  webModalLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  webBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  webCard: {
    width: '100%',
    maxWidth: 760,
    height: '88%',
    maxHeight: 820,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.appRoot,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 18 },
    elevation: 24,
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 10,
    backgroundColor: '#151A21',
  },
  webHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  webHeaderTitles: {
    gap: 2,
  },
  webHeaderTitle: {
    ...typography.title,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  webHeaderSub: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
  },
  webScroll: {
    padding: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // Mobile Header
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
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
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
    borderRadius: radius.xxl,
    shadowOpacity: 0,
    marginVertical: spacing.xs,
  },
  wordChip: {
    paddingHorizontal: spacing.xxl + 4,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  wordText: {
    ...typography.hero,
    fontSize: 40,
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

  heroDetails: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  heroDetail: { ...typography.micro, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, color: colors.onSurface },

  // Stat Card
  card: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.borderBright,
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
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  guesserMedal: {
    fontSize: 17,
    width: 24,
    textAlign: 'center',
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
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  guesserAttemptsHighlight: {
    color: '#10B981',
    fontWeight: '700',
  },
  miniPattern: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  miniPatternText: {
    fontSize: 8.5,
    lineHeight: 10.5,
    letterSpacing: 0.5,
  },

  // Message of the Day Quote
  quoteWrapper: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  quoteIcon: {
    marginTop: 2,
  },
  quoteText: {
    ...typography.body,
    fontSize: 15,
    fontStyle: 'italic',
    color: '#FFFFFF',
    lineHeight: 22,
    flex: 1,
  },
  quoteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  quoteAuthor: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.yellow,
    fontSize: 13,
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
    fontSize: 11,
    color: '#FF6B6B',
    fontWeight: '700',
  },

  // Caption text
  captionText: {
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: '#E2E8F0',
  },

  quietBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  quietText: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
  },

  ctaWrap: {
    marginTop: spacing.md,
  },
  heroCard: {
    padding: spacing.lg,
    overflow: 'hidden',
  },
  recapHeroInner: {
    gap: spacing.md,
  },
  recapHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recapHeroBadgeCol: {
    gap: 3,
  },
  recapHeroShimmer: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  recapHeroTitleWrap: {
    gap: 6,
  },
  recapHeroTitle: {
    ...typography.displayXl,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  recapHeroDesc: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceVariant,
  },
  recapBentoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
