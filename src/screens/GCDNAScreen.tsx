import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { groupTheme, GroupTheme, usePersonalGroupTheme } from '../theme/groupThemes';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { AIThinking } from '../components/ui/AIState';
import { useGroupDNA } from '../hooks/useGroupDNA';
import { DNA_DIMENSIONS } from '../lib/ai';
import { supabase } from '../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GCDNA'>;

const STANDOUT_SCORE = 70;

/** Dynamic atmospheric glow background tinted with the active group theme */
function DNAAtmosphericBackground({ theme }: { theme: GroupTheme }) {
  const [c1, c2] = theme.colors;
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Obsidian Dark Base */}
      <LinearGradient
        colors={['#0E0C16', colors.appRoot, colors.appChrome]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Atmosphere Spotlight */}
      <LinearGradient
        colors={[`${c1}35`, `${c2}18`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
        style={styles.topSpotlight}
      />

      {/* 4-Corner Luminous Glowing Blobs */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={[`${c1}45`, `${c2}20`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={[`${c2}35`, 'rgba(76, 215, 246, 0.15)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['rgba(251, 113, 133, 0.18)', `${c1}20`, 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={[`${c2}30`, 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      {/* High-intensity dark blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 95}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle Ambient Sheen */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.02)', 'transparent', 'rgba(3, 2, 6, 0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
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
        <View style={styles.scoreEmojiBadge}>
          <Text style={styles.scoreEmoji}>{emoji}</Text>
        </View>
        <Text style={[styles.scoreLabel, standout && styles.scoreLabelStandout]}>
          {label}
        </Text>
        <View style={styles.spacer} />
        {standout && (
          <View style={[styles.standoutPill, { borderColor: `${accent}40`, backgroundColor: `${accent}18` }]}>
            <Text style={[styles.standoutPillText, { color: accent }]}>DOMINANT</Text>
          </View>
        )}
        <Text style={[styles.scoreValue, standout && { color: accent, fontWeight: '800' }]}>
          {score}%
        </Text>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]}>
          <LinearGradient
            colors={standout ? themeColors : ['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.12)']}
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

  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1800, easing: easing.inOut }),
        withTiming(1.0, { duration: 1800, easing: easing.inOut })
      ),
      -1,
      true
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

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
    <View style={styles.root}>
      <DNAAtmosphericBackground theme={theme} />
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
            <Text style={styles.topBarTitle}>GC DNA</Text>
            {!!groupName && (
              <View style={styles.groupNamePill}>
                <Text style={styles.groupNamePillText} numberOfLines={1}>
                  {groupName}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.topBarRightDummy} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.centeredLoading}>
              <AIThinking tint={theme.accent} />
              <Text style={styles.loadingText}>Sequencing GC psychological profile...</Text>
            </View>
          ) : !hasDNA ? (
            /* ══════════════════════════════════════════════════════════════
               EMPTY / EVOLVING STATE
            ══════════════════════════════════════════════════════════════ */
            <Animated.View
              entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
              style={styles.evolvingWrapper}
            >
              <GlassPanel borderRadius={radius.xl} style={styles.evolvingCard}>
                <Animated.View style={[styles.evolvingIconOrb, pulseStyle]}>
                  <LinearGradient
                    colors={theme.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.evolvingIconGradient}
                  >
                    <Text style={styles.evolvingEmoji}>🧬</Text>
                  </LinearGradient>
                </Animated.View>

                <View style={styles.evolvingBadge}>
                  <Ionicons name="sparkles" size={12} color={theme.accent} />
                  <Text style={[styles.evolvingBadgeText, { color: theme.accent }]}>DNA SEQUENCING</Text>
                </View>

                <Text style={styles.evolvingTitle}>Still Evolving...</Text>
                <Text style={styles.evolvingBody}>
                  The AI needs a few more messages to accurately synthesize your group's psychological archetype.
                </Text>
                <Text style={styles.evolvingSubBody}>
                  Keep chatting, sending voice notes, and causing chaos — your GC DNA updates weekly with GC Awards!
                </Text>

                <View style={styles.evolvingFooter}>
                  <Ionicons name="time-outline" size={14} color="#94A3B8" />
                  <Text style={styles.evolvingFooterText}>Evolves automatically every week</Text>
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
                <View style={[styles.heroCard, { borderColor: `${theme.accent}45` }]}>
                  {Platform.OS !== 'web' && (
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient
                    colors={[`${theme.accent}24`, 'rgba(255, 255, 255, 0.02)']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Archetype Label Badge */}
                  <View style={[styles.archetypePill, { borderColor: `${theme.accent}50`, backgroundColor: `${theme.accent}20` }]}>
                    <Ionicons name="finger-print" size={12} color={theme.accent} />
                    <Text style={[styles.archetypePillText, { color: theme.accent }]}>
                      GC ARCHETYPE
                    </Text>
                  </View>

                  {/* Big Emoji Orb */}
                  <Animated.View style={[styles.heroEmojiWrap, pulseStyle]}>
                    <LinearGradient
                      colors={theme.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroEmojiGradient}
                    >
                      <Text style={styles.heroEmoji}>{dna!.archetype!.emoji}</Text>
                    </LinearGradient>
                  </Animated.View>

                  <Text style={[styles.heroName, { color: '#FFFFFF' }]}>
                    {dna!.archetype!.name.toUpperCase()}
                  </Text>

                  {!!dna!.archetype!.description && (
                    <View style={styles.heroQuoteBox}>
                      <Text style={styles.heroDesc}>“{dna!.archetype!.description}”</Text>
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
                  <GlassPanel borderRadius={radius.lg} style={styles.oneLinerCard}>
                    <View style={styles.oneLinerHeader}>
                      <Ionicons name="sparkles" size={14} color="#FBBF24" />
                      <Text style={styles.oneLinerLabel}>YOUR GC IN ONE SENTENCE</Text>
                    </View>
                    <Text style={styles.oneLinerText}>“{dna!.oneLiner}”</Text>
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
                <GlassPanel borderRadius={radius.lg} style={styles.card}>
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
                  <GlassPanel borderRadius={radius.lg} style={styles.card}>
                    <SectionHeader
                      icon="chatbubbles"
                      color="#818CF8"
                      title="Communication Style"
                      subtitle="Typing habits, speed, and conversational rhythm"
                    />

                    <Text style={styles.bodyText}>{dna!.communicationStyle.summary}</Text>

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
                  <GlassPanel borderRadius={radius.lg} style={styles.card}>
                    <SectionHeader
                      icon="bulb"
                      color="#38BDF8"
                      title="What Defines This GC"
                      subtitle="Key dynamics and signature habits observed"
                    />

                    <View style={styles.observationList}>
                      {dna!.definesThisGC.map((obs, i) => (
                        <View key={i} style={styles.observationItem}>
                          <View style={styles.observationHeaderRow}>
                            <View style={[styles.obsNumberBadge, { backgroundColor: `${theme.accent}20` }]}>
                              <Text style={[styles.obsNumberText, { color: theme.accent }]}>
                                {i + 1 < 10 ? `0${i + 1}` : i + 1}
                              </Text>
                            </View>
                            <Text style={styles.observationText}>{obs.text}</Text>
                          </View>

                          {obs.sourceMessageIds.length > 0 && (
                            <PressableScale
                              style={[styles.receiptBtn, { borderColor: `${theme.accent}40` }]}
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
                <Ionicons name="sync" size={13} color="#94A3B8" />
                <Text style={styles.footnote}>
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
  return (
    <View style={styles.sectionHeadBlock}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
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
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={16} color={color} style={styles.statTileIcon} />
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
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

  // Glow Background
  glowBgRoot: { backgroundColor: colors.appRoot, overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -70, left: -70, width: 280, height: 280, opacity: 0.75 },
  blobTopRight: { top: -60, right: -60, width: 270, height: 270, opacity: 0.7 },
  blobBottomLeft: { bottom: -70, left: -60, width: 280, height: 280, opacity: 0.65 },
  blobBottomRight: { bottom: -80, right: -70, width: 290, height: 290, opacity: 0.7 },

  // Top Bar
  topBar: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
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
    gap: 3,
  },
  topBarTitle: {
    ...typography.title,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  groupNamePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
  },
  groupNamePillText: {
    ...typography.micro,
    fontSize: 10.5,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  topBarRightDummy: {
    width: 38,
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
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  evolvingIconOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
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
    color: '#FFFFFF',
    marginTop: 2,
  },
  evolvingBody: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  evolvingSubBody: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#94A3B8',
    textAlign: 'center',
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
    borderRadius: radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  archetypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
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
    textAlign: 'center',
  },
  heroQuoteBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  heroDesc: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // One-Liner Card
  oneLinerCard: {
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: 'rgba(251, 191, 36, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
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
    color: '#FFFFFF',
    lineHeight: 22,
  },

  // Common Card
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    ...typography.caption,
    fontSize: 11.5,
    color: '#94A3B8',
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
