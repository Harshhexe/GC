import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { groupTheme, GroupTheme, usePersonalGroupTheme } from '../theme/groupThemes';
import { GlassPanel } from '../components/ui/Glass';
import { Avatar } from '../components/ui/Avatar';
import { GCButton } from '../components/ui/Buttons';
import { PressableScale } from '../components/ui/PressableScale';
import {
  MAX_ATTEMPTS,
  WORD_LENGTH,
  keyboardStateFrom,
  useWordle,
  type WordleMark,
} from '../hooks/useWordle';
import { supabase } from '../lib/supabase';
import { selectFeedback, successFeedback, warningFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Wordy'>;

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const MARK_GRADIENTS: Record<WordleMark, [string, string]> = {
  g: ['#10B981', '#059669'], // Green
  y: ['#F59E0B', '#D97706'], // Amber
  x: ['#334155', '#1E293B'], // Dark grey
};

const MARK_BORDERS: Record<WordleMark, string> = {
  g: '#34D399',
  y: '#FBBF24',
  x: '#475569',
};

/** Themed atmospheric background matching What I Missed and Group Theme */
function ThemedGlowBackground({ theme }: { theme: GroupTheme }) {
  const [c1, c2] = theme.colors;
  const accent = theme.accent;

  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Dark Base Gradient */}
      <LinearGradient
        colors={['#100E17', '#0A0910', '#050508']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Atmospheric Theme Spotlight */}
      <LinearGradient
        colors={[`${c1}36`, `${c2}1C`, 'rgba(5, 5, 8, 0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.topSpotlight}
      />

      {/* Corner Glowing Mesh Blobs */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={[c1, c2, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={[c2, accent, 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={[accent, c1, 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={[c2, c1, 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobCenter]}>
        <LinearGradient
          colors={[`${c1}2E`, `${c2}14`, 'transparent']}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <BlurView
        intensity={Platform.OS === 'ios' ? 75 : 90}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={[`${c1}18`, 'transparent', 'rgba(5, 5, 8, 0.45)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** One Wordy Board Cell with flip & pop animations */
function Cell({
  letter,
  mark,
  filled,
}: {
  letter: string;
  mark?: WordleMark;
  filled: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (filled && !mark) {
      scale.value = withSequence(
        withTiming(1.12, { duration: 60 }),
        withTiming(1, { duration: 60 })
      );
    }
  }, [filled, mark, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const gradientColors = mark ? MARK_GRADIENTS[mark] : null;
  const borderColor = mark ? MARK_BORDERS[mark] : filled ? '#94A3B8' : 'rgba(255, 255, 255, 0.14)';

  return (
    <Animated.View
      style={[
        styles.cell,
        animatedStyle,
        {
          borderColor,
          backgroundColor: mark ? undefined : 'rgba(255, 255, 255, 0.04)',
        },
      ]}
    >
      {gradientColors && (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Text style={[styles.cellText, mark && styles.cellTextScored]}>{letter}</Text>
    </Animated.View>
  );
}

/** Interactive Keyboard Key */
function Key({
  label,
  mark,
  wide,
  onPress,
}: {
  label: string;
  mark?: WordleMark;
  wide?: boolean;
  onPress: () => void;
}) {
  const gradientColors = mark ? MARK_GRADIENTS[mark] : null;

  return (
    <PressableScale
      style={[
        styles.key,
        wide && styles.keyWide,
        {
          backgroundColor: mark ? undefined : 'rgba(255, 255, 255, 0.10)',
          borderColor: mark ? MARK_BORDERS[mark] : 'rgba(255, 255, 255, 0.08)',
        },
      ]}
      scaleTo={0.90}
      haptic="light"
      onPress={onPress}
    >
      {gradientColors && (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {label === 'BACK' ? (
        <Ionicons name="backspace-outline" size={19} color="#FFFFFF" />
      ) : label === 'ENTER' ? (
        <Ionicons name="return-down-back" size={20} color="#FFFFFF" />
      ) : (
        <Text style={[styles.keyText, wide && styles.keyTextWide]}>{label}</Text>
      )}
    </PressableScale>
  );
}

export default function WordyScreen({ route, navigation }: Props) {
  const groupId = route.params?.groupId;
  const { state, stats, groupResults, loading, submitting, submitGuess } = useWordle(groupId);
  const [themeKey, setThemeKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    supabase
      .from('groups')
      .select('theme')
      .eq('id', groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.theme) setThemeKey(data.theme as string);
      });
  }, [groupId]);

  const { theme: activeTheme } = usePersonalGroupTheme(groupId ?? '', themeKey);
  const finished = state?.finished ?? false;
  const attempts = useMemo(() => state?.attempts ?? [], [state]);
  const keyboard = useMemo(() => keyboardStateFrom(attempts), [attempts]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const onKey = useCallback(
    (key: string) => {
      if (finished || submitting) return;
      if (key === 'BACK') {
        setDraft((d) => d.slice(0, -1));
        return;
      }
      if (key === 'ENTER') return;
      if (draft.length < WORD_LENGTH) {
        selectFeedback();
        setDraft((d) => d + key);
      }
    },
    [draft.length, finished, submitting]
  );

  const onEnter = useCallback(async () => {
    if (finished || submitting) return;
    if (draft.length !== WORD_LENGTH) {
      setToast('Needs 5 letters');
      warningFeedback();
      return;
    }
    const rejection = await submitGuess(draft);
    if (rejection === 'not_a_word') {
      setToast('Not in word list 😭');
      warningFeedback();
      return;
    }
    if (rejection) {
      setToast(rejection === 'finished' ? "You're done for today" : 'Something went wrong');
      warningFeedback();
      return;
    }
    setDraft('');
    successFeedback();
  }, [draft, finished, submitting, submitGuess]);

  const handleShare = useCallback(async () => {
    if (!state) return;
    const score = state.solved ? `${state.attemptCount}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
    const patternEmojis = attempts
      .map((a) =>
        a.result
          .split('')
          .map((m) => (m === 'g' ? '🟩' : m === 'y' ? '🟨' : '⬛'))
          .join('')
      )
      .join('\n');

    const shareText = `GC Wordy ${state.puzzleDate ?? ''} ${score}\n\n${patternEmojis}`;
    await Clipboard.setStringAsync(shareText);
    setCopied(true);
    successFeedback();
    setTimeout(() => setCopied(false), 2500);
  }, [state, attempts]);

  // Rows: submitted guesses, then the in-progress row, then empty ones.
  const rows = useMemo(() => {
    const out: { letters: string; marks?: string }[] = attempts.map((a) => ({
      letters: a.guess.toUpperCase(),
      marks: a.result,
    }));
    if (!finished && out.length < MAX_ATTEMPTS) out.push({ letters: draft });
    while (out.length < MAX_ATTEMPTS) out.push({ letters: '' });
    return out;
  }, [attempts, draft, finished]);

  const winRate =
    stats && stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  return (
    <View style={styles.root}>
      <ThemedGlowBackground theme={activeTheme} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Custom Frosted Top Navigation Bar */}
        <View style={styles.topBar}>
          <PressableScale
            style={styles.backButton}
            scaleTo={0.88}
            hitSlop={8}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </PressableScale>

          <View style={styles.topBarTitleBlock}>
            <View
              style={[
                styles.wordyLogoBadge,
                {
                  backgroundColor: `${activeTheme.accent}18`,
                  borderColor: `${activeTheme.accent}45`,
                },
              ]}
            >
              <Text style={styles.wordyLogoEmoji}>🟩</Text>
              <Text style={[styles.wordyLogoText, { color: activeTheme.accent }]}>
                DAILY WORDY
              </Text>
            </View>
            {!!state?.puzzleDate && (
              <Text style={styles.topBarSubtitle}>{state.puzzleDate}</Text>
            )}
          </View>

          <View style={styles.topBarRightDummy} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centeredLoading}>
              <Text style={styles.muted}>Loading today's word...</Text>
            </View>
          ) : (
            <>
              {/* Toast Feedback */}
              {!!toast && (
                <Animated.View entering={FadeIn.duration(140)} style={styles.toast}>
                  <Ionicons name="alert-circle" size={15} color="#FBBF24" />
                  <Text style={styles.toastText}>{toast}</Text>
                </Animated.View>
              )}

              {/* 5x6 Board Grid */}
              <View style={styles.board}>
                {rows.map((row, r) => (
                  <View key={r} style={styles.row}>
                    {Array.from({ length: WORD_LENGTH }).map((_, c) => (
                      <Cell
                        key={c}
                        letter={row.letters[c] ?? ''}
                        mark={row.marks ? (row.marks[c] as WordleMark) : undefined}
                        filled={!!row.letters[c]}
                      />
                    ))}
                  </View>
                ))}
              </View>

              {/* Game Finished Outcome Banner */}
              {finished && (
                <Animated.View
                  entering={FadeInDown.duration(duration.slow).reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.xl} style={styles.outcome}>
                    <View
                      style={[
                        styles.outcomeIconOrb,
                        { backgroundColor: state?.solved ? `${activeTheme.accent}25` : 'rgba(239, 68, 68, 0.20)' },
                      ]}
                    >
                      <Text style={styles.outcomeEmoji}>{state?.solved ? '🏆' : '💀'}</Text>
                    </View>

                    <Text style={styles.outcomeTitle}>
                      {state?.solved ? 'BRILLIANT!' : 'BETTER LUCK TOMORROW'}
                    </Text>

                    {state?.solved ? (
                      <Text style={styles.outcomeSub}>
                        Solved in{' '}
                        <Text style={[styles.highlightText, { color: activeTheme.accent }]}>
                          {state.attemptCount} / {MAX_ATTEMPTS}
                        </Text>{' '}
                        attempts
                      </Text>
                    ) : (
                      <Text style={styles.outcomeSub}>
                        The word was{' '}
                        <Text style={styles.answerWord}>{state?.answer?.toUpperCase()}</Text>
                      </Text>
                    )}

                    <View style={styles.shareBtnWrap}>
                      <GCButton
                        label={copied ? 'Pattern Copied! ✨' : 'Share Result with GC'}
                        variant="gradient"
                        icon={<Ionicons name={copied ? 'checkmark' : 'share-social'} size={18} color="#FFFFFF" />}
                        onPress={handleShare}
                      />
                    </View>

                    <Text style={styles.outcomeHint}>Next puzzle unlocks at midnight ✨</Text>
                  </GlassPanel>
                </Animated.View>
              )}

              {/* On-screen tactile keyboard */}
              {!finished && (
                <View style={styles.keyboard}>
                  {KEY_ROWS.map((rowKeys, i) => (
                    <View key={i} style={styles.keyRow}>
                      {i === 2 && <Key label="ENTER" wide onPress={onEnter} />}
                      {rowKeys.split('').map((k) => (
                        <Key key={k} label={k} mark={keyboard[k]} onPress={() => onKey(k)} />
                      ))}
                      {i === 2 && <Key label="BACK" wide onPress={() => onKey('BACK')} />}
                    </View>
                  ))}
                </View>
              )}

              {/* Stats Card */}
              {!!stats && (
                <Animated.View
                  entering={FadeInDown.delay(STAGGER_MS)
                    .duration(duration.slow)
                    .reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.lg} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="bar-chart" size={15} color={activeTheme.accent} />
                      <Text style={styles.cardTitle}>YOUR RECORD</Text>
                    </View>

                    <View style={styles.statsRow}>
                      <Stat label="Played" value={String(stats.gamesPlayed)} />
                      <Stat label="Win %" value={`${winRate}%`} />
                      <Stat label="Streak 🔥" value={String(stats.currentStreak)} />
                      <Stat label="Best 🏆" value={String(stats.bestStreak)} />
                    </View>

                    {stats.gamesWon > 0 && (
                      <View style={styles.dist}>
                        <Text style={styles.distTitle}>GUESS DISTRIBUTION</Text>
                        {[1, 2, 3, 4, 5, 6].map((n) => {
                          const count = stats.guessDistribution[String(n)] ?? 0;
                          const pct = stats.gamesWon > 0 ? (count / stats.gamesWon) * 100 : 0;
                          return (
                            <View key={n} style={styles.distRow}>
                              <Text style={styles.distNum}>{n}</Text>
                              <View style={styles.distBarTrack}>
                                <LinearGradient
                                  colors={count > 0 ? activeTheme.colors : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={[styles.distBar, { width: `${Math.max(pct, count > 0 ? 8 : 4)}%` }]}
                                />
                              </View>
                              <Text style={styles.distCount}>{count}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </GlassPanel>
                </Animated.View>
              )}

              {/* Group Today's Leaderboard */}
              {!!groupId && (
                <Animated.View
                  entering={FadeInDown.delay(STAGGER_MS * 2)
                    .duration(duration.slow)
                    .reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.lg} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="people" size={16} color={activeTheme.accent} />
                      <Text style={styles.cardTitle}>THE GC TODAY</Text>
                    </View>

                    {groupResults.length === 0 ? (
                      <View style={styles.emptyLeaderboard}>
                        <Text style={styles.emptyLeaderboardEmoji}>☕</Text>
                        <Text style={styles.muted}>Nobody in the group has played yet today.</Text>
                        <Text style={styles.mutedSub}>Be the first to solve it and set the pace!</Text>
                      </View>
                    ) : (
                      groupResults.map((r, i) => (
                        <View key={r.user_id} style={styles.memberRow}>
                          <Avatar
                            emoji={r.avatar_emoji ?? undefined}
                            imageUrl={r.avatar_url}
                            label={r.display_name}
                            size={38}
                            ringColors={[r.avatar_color ?? activeTheme.accent, activeTheme.accent]}
                          />
                          <View style={styles.memberCopy}>
                            <Text style={styles.memberName} numberOfLines={1}>
                              {r.display_name}
                            </Text>
                            <View style={styles.attemptBadge}>
                              <Text style={[styles.memberMeta, r.solved && { color: activeTheme.accent, fontWeight: '700' }]}>
                                {r.solved ? `Solved in ${r.attempts}/6` : `${r.attempts}/6 · in progress`}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.patternWrap}>
                            {r.patterns.map((p, pi) => (
                              <Text key={pi} style={styles.pattern}>
                                {p
                                  .split('')
                                  .map((m) => (m === 'g' ? '🟩' : m === 'y' ? '🟨' : '⬜'))
                                  .join('')}
                              </Text>
                            ))}
                          </View>
                        </View>
                      ))
                    )}
                  </GlassPanel>
                </Animated.View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  safe: { flex: 1 },

  // Glowing Ambient Mesh Background
  glowBgRoot: { backgroundColor: colors.appRoot, overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -60, left: -60, width: 280, height: 280, opacity: 0.75 },
  blobTopRight: { top: -50, right: -50, width: 270, height: 270, opacity: 0.7 },
  blobBottomLeft: { bottom: -70, left: -60, width: 280, height: 280, opacity: 0.65 },
  blobBottomRight: { bottom: -80, right: -70, width: 290, height: 290, opacity: 0.7 },
  blobCenter: { top: '35%', left: '15%', width: 260, height: 260, opacity: 0.5 },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CONTAINER_MARGIN,
    height: 48,
    marginBottom: spacing.xs,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleBlock: {
    alignItems: 'center',
    gap: 2,
  },
  wordyLogoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  wordyLogoEmoji: {
    fontSize: 12,
  },
  wordyLogoText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  topBarSubtitle: {
    ...typography.caption,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  topBarRightDummy: {
    width: 38,
  },

  scroll: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  centeredLoading: {
    paddingTop: spacing.xl * 3,
    alignItems: 'center',
  },
  muted: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  mutedSub: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
  },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  toastText: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Board
  board: {
    gap: 7,
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: 7,
  },
  cell: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellText: {
    ...typography.title,
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cellTextScored: {
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Outcome
  outcome: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  outcomeIconOrb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  outcomeEmoji: {
    fontSize: 32,
  },
  outcomeTitle: {
    ...typography.headline,
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  outcomeSub: {
    ...typography.body,
    fontSize: 14.5,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  highlightText: {
    fontWeight: '800',
  },
  answerWord: {
    ...typography.title,
    fontSize: 17,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 1.5,
  },
  shareBtnWrap: {
    width: '100%',
    marginTop: spacing.sm,
  },
  outcomeHint: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  // Keyboard
  keyboard: {
    gap: 7,
    paddingTop: spacing.xs,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  key: {
    minWidth: 32,
    flex: 1,
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  keyWide: {
    flex: 1.6,
  },
  keyText: {
    ...typography.bodyMedium,
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  keyTextWide: {
    fontSize: 11.5,
    letterSpacing: 0.6,
  },

  // Card
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.onSurfaceVariant,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  stat: {
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    ...typography.title,
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  statLabel: {
    ...typography.micro,
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },

  dist: {
    gap: 6,
    marginTop: spacing.xs,
  },
  distTitle: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 2,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  distNum: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    width: 12,
  },
  distBarTrack: {
    flex: 1,
    height: 18,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  distBar: {
    height: '100%',
    borderRadius: 4,
  },
  distCount: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    width: 18,
    textAlign: 'right',
  },

  // Leaderboard
  emptyLeaderboard: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
  },
  emptyLeaderboardEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  memberCopy: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attemptBadge: {
    alignSelf: 'flex-start',
  },
  memberMeta: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
  },
  patternWrap: {
    alignItems: 'flex-end',
    gap: 1,
  },
  pattern: {
    fontSize: 10,
    lineHeight: 12,
  },
});
