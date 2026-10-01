import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { groupTheme, GroupTheme, usePersonalGroupTheme } from '../theme/groupThemes';
import { GlassPanel } from '../components/ui/Glass';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { PressableScale } from '../components/ui/PressableScale';
import { AIThinking } from '../components/ui/AIState';
import { useGroupDNA } from '../hooks/useGroupDNA';
import { useAppearance } from '../context/AppearanceContext';
import { DNA_DIMENSIONS } from '../lib/ai';
import { supabase } from '../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GCDNA'>;

const STANDOUT_SCORE = 70;

/** Quiet canvas that lets the group portrait and evidence carry the page. */
function DNAAtmosphericBackground({ theme }: { theme: GroupTheme }) {
  const { theme: appTheme } = useAppearance();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: appTheme.palette.bg }]} pointerEvents="none">
      <LinearGradient
        colors={[`${theme.accent}0D`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Animated 0-100% trait score bar with standout neon lighting */
function ScoreBar({
  emoji,
  label,
  score,
  index,
  accent,
  themeColors,
}: {
  emoji: string;
  label: string;
  score: number;
  index: number;
  accent: string;
  themeColors: readonly [string, string] | [string, string];
}) {
  const { theme: appTheme } = useAppearance();
  const palette = appTheme.palette;
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      100 + index * 40,
      withTiming(score, { duration: 750, easing: easing.out })
    );
  }, [score, index, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const standout = score >= STANDOUT_SCORE;

  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreHead}>
        <View style={[styles.scoreEmojiBadge, { backgroundColor: palette.surfaceHigh }]}>
          <Text style={styles.scoreEmoji}>{emoji}</Text>
        </View>
        <Text style={[styles.scoreLabel, { color: palette.onSurfaceVariant }, standout && { color: palette.onSurface, fontWeight: '700' }]}>
          {label}
        </Text>
        <View style={styles.spacer} />
        {standout && (
          <View style={[styles.standoutPill, { borderColor: `${accent}40`, backgroundColor: `${accent}18` }]}>
            <Text style={[styles.standoutPillText, { color: accent }]}>DOMINANT</Text>
          </View>
        )}
        <Text style={[styles.scoreValue, { color: palette.onSurfaceVariant }, standout && { color: accent, fontWeight: '800' }]}>
          {score}%
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: palette.surfaceHighest }]}>
        <Animated.View style={[styles.fill, fillStyle]}>
          <LinearGradient
            colors={standout ? themeColors : [palette.outline, palette.outlineVariant]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

export default function GCDNAScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const { snapshot, loading } = useGroupDNA(groupId);
  const [themeKey, setThemeKey] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('groups')
      .select('theme')
      .eq('id', groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.theme) setThemeKey(data.theme as string);
      });
  }, [groupId]);

  const { theme } = usePersonalGroupTheme(groupId, themeKey);
  const { theme: appTheme } = useAppearance();
  const palette = appTheme.palette;
  const dna = snapshot?.dna;
  const hasDNA = !!dna && dna.enoughData && !!dna.archetype;

  const handleJumpToChat = useCallback(
    (messageId?: string) => {
      if (Platform.OS === 'web') {
        navigation.navigate('Chat', { groupId, jumpToMessageId: messageId });
        return;
      }
      const state = navigation.getState();
      const previousRoute = state?.routes ? state.routes[state.routes.length - 2] : null;
      if (
        previousRoute &&
        previousRoute.name === 'Chat' &&
        (previousRoute.params as any)?.groupId === groupId
      ) {
        navigation.navigate({
          name: 'Chat',
          params: { groupId, jumpToMessageId: messageId },
          merge: true,
        });
      } else {
        navigation.replace('Chat', { groupId, jumpToMessageId: messageId });
      }
    },
    [navigation, groupId]
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.appRoot }]}>
      <DNAAtmosphericBackground theme={theme} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="GC DNA"
          subtitle={groupName}
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.centeredLoading}>
              <AIThinking tint={theme.accent} />
              <Text style={[styles.loadingText, { color: palette.onSurfaceVariant }]}>Loading your GC portrait…</Text>
            </View>
          ) : !hasDNA ? (
            /* ══════════════════════════════════════════════════════════════
               EMPTY / EVOLVING STATE
            ══════════════════════════════════════════════════════════════ */
            <Animated.View
              entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
              style={styles.evolvingWrapper}
            >
              <GlassPanel borderRadius={radius.lg} style={[styles.evolvingCard, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
                <View style={[styles.evolvingIconOrb, { backgroundColor: palette.surfaceHigh }]}>
                  <Text style={styles.evolvingEmoji}>🧬</Text>
                </View>

                <View style={[styles.evolvingBadge, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
                  <Ionicons name="sparkles" size={12} color={theme.accent} />
                  <Text style={[styles.evolvingBadgeText, { color: theme.accent }]}>Still learning</Text>
                </View>

                <Text style={[styles.evolvingTitle, { color: palette.onSurface }]}>Your GC is taking shape</Text>
                <Text style={[styles.evolvingBody, { color: palette.onSurfaceVariant }]}>
                  Keep chatting. Once there is enough conversation, your GC portrait will appear here.
                </Text>
                <Text style={[styles.evolvingSubBody, { color: palette.onSurfaceVariant }]}>
                  It refreshes each week with GC Awards.
                </Text>

                <View style={[styles.evolvingFooter, { borderTopColor: palette.border }]}>
                  <Ionicons name="time-outline" size={14} color={palette.onSurfaceVariant} />
                  <Text style={[styles.evolvingFooterText, { color: palette.onSurfaceVariant }]}>Evolves automatically every week</Text>
                </View>
              </GlassPanel>
            </Animated.View>
          ) : (
            /* ══════════════════════════════════════════════════════════════
               ACTIVE DNA DOSSIER
            ══════════════════════════════════════════════════════════════ */
            <>
              {/* 1. ARCHETYPE HERO BANNER */}
              <Animated.View
                entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
              >
                <View style={[styles.heroCard, { borderColor: palette.border, backgroundColor: palette.surfaceLow }]}>

                  {/* Archetype Label Badge */}
                  <View style={[styles.archetypePill, { borderColor: `${theme.accent}50`, backgroundColor: `${theme.accent}20` }]}>
                    <Ionicons name="finger-print" size={12} color={theme.accent} />
                    <Text style={[styles.archetypePillText, { color: theme.accent }]}>
                      Your GC archetype
                    </Text>
                  </View>

                  {/* Big Emoji Orb */}
                  <View style={[styles.heroEmojiWrap, { backgroundColor: palette.surfaceHigh }]}>
                    <Text style={styles.heroEmoji}>{dna!.archetype!.emoji}</Text>
                  </View>

                  <Text style={[styles.heroName, { color: palette.onSurface }]}>
                    {dna!.archetype!.name}
                  </Text>

                  {!!dna!.archetype!.description && (
                    <View style={[styles.heroQuoteBox, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
                      <Text style={[styles.heroDesc, { color: palette.onSurfaceVariant }]}>“{dna!.archetype!.description}”</Text>
                    </View>
                  )}
                </View>
              </Animated.View>

              {/* 2. ONE-SENTENCE SUMMARY CARD */}
              {!!dna!.oneLiner && (
                <Animated.View
                  entering={FadeInDown.delay(STAGGER_MS)
                    .duration(duration.slow)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.lg} style={[styles.oneLinerCard, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
                    <View style={styles.oneLinerHeader}>
                      <Ionicons name="sparkles" size={14} color={palette.primary} />
                      <Text style={[styles.oneLinerLabel, { color: palette.primary }]}>YOUR GC IN ONE SENTENCE</Text>
                    </View>
                    <Text style={[styles.oneLinerText, { color: palette.onSurface }]}>“{dna!.oneLiner}”</Text>
                  </GlassPanel>
                </Animated.View>
              )}

              {/* 3. DNA TRAIT BREAKDOWN */}
              <Animated.View
                entering={FadeInDown.delay(STAGGER_MS * 2)
                  .duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <GlassPanel borderRadius={radius.lg} style={[styles.card, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
                  <SectionHeader
                    icon="pulse"
                    color={theme.accent}
                    title="DNA Trait Breakdown"
                    subtitle="0–100% distribution across behavioral dimensions"
                  />

                  <View style={styles.scoreList}>
                    {DNA_DIMENSIONS.filter((d) => typeof dna!.scores[d.key] === 'number').map(
                      (d, i) => (
                        <ScoreBar
                          key={d.key}
                          emoji={d.emoji}
                          label={d.label}
                          score={dna!.scores[d.key]}
                          index={i}
                          accent={theme.accent}
                          themeColors={theme.colors}
                        />
                      )
                    )}
                  </View>
                </GlassPanel>
              </Animated.View>

              {/* 4. COMMUNICATION STYLE & STATS */}
              {!!dna!.communicationStyle.summary && (
                <Animated.View
                  entering={FadeInDown.delay(STAGGER_MS * 3)
                    .duration(duration.slow)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.lg} style={[styles.card, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
                    <SectionHeader
                      icon="chatbubbles"
                      color="#818CF8"
                      title="Communication Style"
                      subtitle="Typing habits, speed, and conversational rhythm"
                    />

                    <Text style={[styles.bodyText, { color: palette.onSurface }]}>{dna!.communicationStyle.summary}</Text>

                    <View style={styles.statGrid}>
                      <StatTile
                        icon="document-text-outline"
                        label="Avg Length"
                        value={`${dna!.communicationStyle.stats.averageMessageLength} chars`}
                        color={theme.accent}
                      />
                      <StatTile
                        icon="flash-outline"
                        label="One-Liners"
                        value={`${dna!.communicationStyle.stats.shortMessageRate}%`}
                        color="#FBBF24"
                      />
                      <StatTile
                        icon="images-outline"
                        label="Media & Memes"
                        value={`${dna!.communicationStyle.stats.mediaRate}%`}
                        color="#EC4899"
                      />
                      <StatTile
                        icon="arrow-undo-outline"
                        label="Reply Frequency"
                        value={`${dna!.communicationStyle.stats.replyRate}%`}
                        color="#38BDF8"
                      />
                    </View>
                  </GlassPanel>
                </Animated.View>
              )}

              {/* 5. WHAT DEFINES THIS GC (EVIDENCE & PROOF) */}
              {dna!.definesThisGC.length > 0 && (
                <Animated.View
                  entering={FadeInDown.delay(STAGGER_MS * 4)
                    .duration(duration.slow)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.lg} style={[styles.card, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
                    <SectionHeader
                      icon="bulb"
                      color="#38BDF8"
                      title="What Defines This GC"
                      subtitle="Key dynamics and signature habits observed"
                    />

                    <View style={styles.observationList}>
                      {dna!.definesThisGC.map((obs, i) => (
                        <View key={i} style={[styles.observationItem, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
                          <View style={styles.observationHeaderRow}>
                            <View style={[styles.obsNumberBadge, { backgroundColor: `${theme.accent}20` }]}>
                              <Text style={[styles.obsNumberText, { color: theme.accent }]}>
                                {i + 1 < 10 ? `0${i + 1}` : i + 1}
                              </Text>
                            </View>
                            <Text style={[styles.observationText, { color: palette.onSurface }]}>{obs.text}</Text>
                          </View>

                          {obs.sourceMessageIds.length > 0 && (
                            <PressableScale
                              style={[styles.receiptBtn, { borderColor: `${theme.accent}40`, backgroundColor: palette.surfaceLow }]}
                              scaleTo={0.96}
                              haptic="light"
                              onPress={() => handleJumpToChat(obs.sourceMessageIds[0])}
                            >
                              <Ionicons name="return-down-forward" size={13} color={theme.accent} />
                              <Text style={[styles.receiptText, { color: theme.accent }]}>
                                View Message Evidence ({obs.sourceMessageIds.length})
                              </Text>
                            </PressableScale>
                          )}
                        </View>
                      ))}
                    </View>
                  </GlassPanel>
                </Animated.View>
              )}

              {/* Footer Stamp */}
              <View style={styles.footnoteWrap}>
                <Ionicons name="sync" size={13} color={palette.onSurfaceVariant} />
                <Text style={[styles.footnote, { color: palette.onSurfaceVariant }]}>
                  Evolves automatically every week with GC Awards · snapshot week of {snapshot!.weekStart}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({
  icon,
  color,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle?: string;
}) {
  const { theme } = useAppearance();
  return (
    <View style={styles.sectionHeadBlock}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.palette.onSurface }]}>{title}</Text>
      </View>
      {!!subtitle && <Text style={[styles.sectionSubtitle, { color: theme.palette.onSurfaceVariant }]}>{subtitle}</Text>}
    </View>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  const { theme } = useAppearance();
  return (
    <View style={[styles.statTile, { backgroundColor: theme.palette.surfaceHigh, borderColor: theme.palette.border }]}>
      <Ionicons name={icon} size={16} color={color} style={styles.statTileIcon} />
      <Text style={[styles.statTileValue, { color: theme.palette.onSurface }]}>{value}</Text>
      <Text style={[styles.statTileLabel, { color: theme.palette.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  safe: { flex: 1 },
  scroll: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },

  centeredLoading: {
    paddingTop: spacing.xl * 3,
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },

  // Evolving State
  evolvingWrapper: {
    paddingTop: spacing.lg,
  },
  evolvingCard: {
    padding: spacing.xl,
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  evolvingIconOrb: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  evolvingIconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evolvingEmoji: {
    fontSize: 40,
  },
  evolvingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  evolvingBadgeText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  evolvingTitle: {
    ...typography.headline,
    fontSize: 24,
    fontWeight: '800',
    color: colors.onSurface,
    marginTop: 2,
  },
  evolvingBody: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'left',
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  evolvingSubBody: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#94A3B8',
    textAlign: 'left',
    lineHeight: 18,
    marginTop: 2,
  },
  evolvingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  evolvingFooterText: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
  },

  // Archetype Hero Card
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'flex-start',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surfaceLow,
  },
  archetypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: 4,
  },
  archetypePillText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroEmojiWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  heroEmojiGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 40,
  },
  heroName: {
    ...typography.headline,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'left',
  },
  heroQuoteBox: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  heroDesc: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
    textAlign: 'left',
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // One-Liner Card
  oneLinerCard: {
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  oneLinerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  oneLinerLabel: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.8,
  },
  oneLinerText: {
    ...typography.titleMd,
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.onSurface,
    lineHeight: 22,
  },

  // Common Card
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeadBlock: {
    gap: 3,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.onSurface,
  },
  sectionSubtitle: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
    marginLeft: 34,
  },

  // Score Bar
  scoreList: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  scoreRow: {
    gap: 6,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scoreEmojiBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreEmoji: {
    fontSize: 12,
  },
  scoreLabel: {
    ...typography.label,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  scoreLabelStandout: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  spacer: {
    flex: 1,
  },
  standoutPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 6,
  },
  standoutPillText: {
    ...typography.micro,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  scoreValue: {
    ...typography.label,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  bodyText: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurface,
    lineHeight: 20,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statTile: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: spacing.md,
    gap: 3,
  },
  statTileIcon: {
    marginBottom: 2,
  },
  statTileValue: {
    ...typography.title,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statTileLabel: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Observations
  observationList: {
    gap: spacing.md,
  },
  observationItem: {
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  observationHeaderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  obsNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  obsNumberText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
  },
  observationText: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurface,
    lineHeight: 20,
    flex: 1,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 30,
    marginTop: 2,
  },
  receiptText: {
    ...typography.label,
    fontSize: 11,
    fontWeight: '600',
  },

  footnoteWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.xs,
  },
  footnote: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
