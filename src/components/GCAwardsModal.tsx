import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, typography, glass, shadows } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from './ui/Avatar';
import { PressableScale } from './ui/PressableScale';
import { AIThinking } from './ui/AIState';
import { GCButton } from './ui/Buttons';
import type { Award, AwardType, WeeklyAwardsResult } from '../lib/ai';

type AwardTheme = {
  title: string;
  emoji: string;
  tag: string;
  color: string;
  gradient: readonly [string, string];
  glowColor: string;
  borderColor: string;
  bgTint: string;
  valueIcon: keyof typeof Ionicons.glyphMap;
};

const AWARD_THEMES: Record<string, AwardTheme> = {
  professional_yapper: {
    title: 'Professional Yapper',
    emoji: '🗣️',
    tag: '#1 YAPPER',
    color: '#F59E0B',
    gradient: ['#F59E0B', '#D97706'],
    glowColor: 'rgba(245, 158, 11, 0.4)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
    bgTint: 'rgba(245, 158, 11, 0.1)',
    valueIcon: 'chatbubble-ellipses',
  },
  professional_lurker: {
    title: 'Professional Lurker',
    emoji: '👻',
    tag: 'STEALTH 100',
    color: '#A78BFA',
    gradient: ['#818CF8', '#6366F1'],
    glowColor: 'rgba(129, 140, 248, 0.35)',
    borderColor: 'rgba(167, 139, 250, 0.45)',
    bgTint: 'rgba(129, 140, 248, 0.1)',
    valueIcon: 'eye-off',
  },
  most_unhinged: {
    title: 'Most Unhinged',
    emoji: '💀',
    tag: 'ZERO FILTER',
    color: '#F472B6',
    gradient: ['#F43F5E', '#DB2777'],
    glowColor: 'rgba(244, 114, 182, 0.35)',
    borderColor: 'rgba(244, 114, 182, 0.45)',
    bgTint: 'rgba(244, 114, 182, 0.1)',
    valueIcon: 'flame',
  },
  drama_starter: {
    title: 'Drama Starter',
    emoji: '🍵',
    tag: 'CHIEF INSTIGATOR',
    color: '#34D399',
    gradient: ['#10B981', '#059669'],
    glowColor: 'rgba(52, 211, 153, 0.35)',
    borderColor: 'rgba(52, 211, 153, 0.45)',
    bgTint: 'rgba(16, 185, 129, 0.1)',
    valueIcon: 'cafe',
  },
  fastest_reply: {
    title: 'Fastest Reply',
    emoji: '⚡',
    tag: 'LIGHTNING REFLEXES',
    color: '#38BDF8',
    gradient: ['#38BDF8', '#0284C7'],
    glowColor: 'rgba(56, 189, 248, 0.35)',
    borderColor: 'rgba(56, 189, 248, 0.45)',
    bgTint: 'rgba(56, 189, 248, 0.1)',
    valueIcon: 'flash',
  },
  message_of_week: {
    title: 'Message of the Week',
    emoji: '🏆',
    tag: 'HALL OF FAME',
    color: '#FBBF24',
    gradient: ['#FBBF24', '#F59E0B'],
    glowColor: 'rgba(251, 191, 36, 0.45)',
    borderColor: 'rgba(251, 191, 36, 0.55)',
    bgTint: 'rgba(251, 191, 36, 0.12)',
    valueIcon: 'trophy',
  },
};

const DEFAULT_THEME: AwardTheme = {
  title: 'GC Award',
  emoji: '🏆',
  tag: 'AWARD WINNER',
  color: colors.yellow,
  gradient: ['#FBBF24', '#F59E0B'],
  glowColor: 'rgba(251, 191, 36, 0.35)',
  borderColor: 'rgba(251, 191, 36, 0.4)',
  bgTint: 'rgba(251, 191, 36, 0.1)',
  valueIcon: 'ribbon',
};

function dateLabel(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Atmospheric golden background with ultra-soft blurred glowing mesh blobs at the corners.
 */
function GoldenAwardsBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.goldenBgRoot]} pointerEvents="none">
      {/* Deep Obsidian-Gold Base Gradient */}
      <LinearGradient
        colors={['#161208', '#0F0C05', '#080602']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Grand Golden Spotlight */}
      <LinearGradient
        colors={['rgba(253, 224, 71, 0.28)', 'rgba(245, 158, 11, 0.12)', 'rgba(8, 6, 2, 0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
        style={styles.topSpotlight}
      />

      {/* Corner Glowing Mesh Blobs */}
      {/* Top-Left Corner Blob */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={['#FDE047', '#F59E0B', 'rgba(217, 119, 6, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      {/* Top-Right Corner Blob */}
      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={['#FBBF24', '#D97706', 'rgba(180, 83, 9, 0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      {/* Bottom-Left Corner Blob */}
      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['#EAB308', '#B45309', 'rgba(146, 64, 14, 0)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      {/* Bottom-Right Corner Blob */}
      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={['#F59E0B', '#D97706', 'rgba(180, 83, 9, 0)']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      {/* Center Mid-Atmosphere Warm Blob */}
      <View style={[styles.cornerBlob, styles.blobCenter]}>
        <LinearGradient
          colors={['rgba(251, 191, 36, 0.16)', 'rgba(217, 119, 6, 0.04)', 'transparent']}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      {/* Deep Blur View diffusing all corner blobs into dreamy golden glows */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 95}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />

      {/* Top Sheen & Subtle Dark Vignette */}
      <LinearGradient
        colors={['rgba(253, 224, 71, 0.08)', 'transparent', 'rgba(5, 4, 1, 0.55)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function AwardCard({
  award,
  index,
  onJump,
}: {
  award: Award;
  index: number;
  onJump: (messageId: string) => void;
}) {
  const theme = AWARD_THEMES[award.type] ?? {
    ...DEFAULT_THEME,
    title: award.title || DEFAULT_THEME.title,
    emoji: award.emoji || DEFAULT_THEME.emoji,
  };

  const hasReceipts = award.sourceMessageIds && award.sourceMessageIds.length > 0;
  const isAnonymous = !award.userId && award.userName === 'someone';

  return (
    <Animated.View
      entering={FadeInDown.delay(70 * index)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
      style={styles.cardContainer}
    >
      <View
        style={[
          styles.card,
          {
            borderColor: theme.borderColor,
            backgroundColor: 'rgba(24, 19, 10, 0.78)',
          },
        ]}
      >
        {Platform.OS !== 'web' && (
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        )}

        {/* Top Gradient Shimmer Bar */}
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardAccentBar}
        />

        {/* Ambient Top Glow */}
        <View style={[styles.cardGlowCircle, { backgroundColor: theme.glowColor }]} />

        {/* Header Eyebrow & Tag */}
        <View style={styles.cardHeader}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryEmoji}>{award.emoji || theme.emoji}</Text>
            <Text style={[styles.categoryTitle, { color: theme.color }]}>
              {(award.title || theme.title).toUpperCase()}
            </Text>
          </View>

          <View style={[styles.tagPill, { backgroundColor: theme.bgTint, borderColor: theme.borderColor }]}>
            <Text style={[styles.tagPillText, { color: theme.color }]}>{theme.tag}</Text>
          </View>
        </View>

        {/* Winner Hero Section */}
        <View style={styles.winnerRow}>
          {!isAnonymous ? (
            <Avatar
              emoji={award.userAvatarEmoji ?? undefined}
              imageUrl={award.userAvatarUrl}
              label={award.userName}
              size={52}
              ring={true}
              ringColors={[
                award.userAvatarColor ?? theme.color,
                theme.gradient[1] ?? theme.color,
              ]}
            />
          ) : (
            <View style={[styles.anonAvatar, { borderColor: theme.borderColor }]}>
              <Ionicons name="person" size={24} color={colors.onSurfaceVariant} />
            </View>
          )}

          <View style={styles.winnerMeta}>
            <Text style={styles.winnerName} numberOfLines={1}>
              {award.userName}
            </Text>
            {!!award.value && (
              <View style={styles.metricPill}>
                <Ionicons name={theme.valueIcon} size={13} color={theme.color} />
                <Text style={styles.metricText}>{award.value}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Citation / AI Verdict */}
        <View style={styles.reasonBox}>
          <View style={[styles.reasonQuoteLine, { backgroundColor: theme.color }]} />
          <Text style={styles.reasonText}>{award.reason}</Text>
        </View>

        {/* View Receipt Button */}
        {hasReceipts && (
          <PressableScale
            style={[styles.receiptBtn, { borderColor: theme.borderColor, backgroundColor: theme.bgTint }]}
            scaleTo={0.97}
            haptic="light"
            onPress={() => onJump(award.sourceMessageIds[0])}
          >
            <View style={styles.receiptContent}>
              <Ionicons name="document-text-outline" size={14} color={theme.color} />
              <Text style={[styles.receiptText, { color: theme.color }]}>
                View receipt{award.sourceMessageIds.length > 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={theme.color} />
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * 🏆 The GC Awards report — a Wrapped-style luxury ceremony card per category.
 * Featuring a rich golden background, blurred corner glowing mesh blobs, safe header navigation,
 * and distinct neo-glass trophy cards.
 */
export function GCAwardsModal({
  visible,
  result,
  onClose,
  onJumpToMessage,
}: {
  visible: boolean;
  result: WeeklyAwardsResult | null;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}) {
  const insets = useSafeAreaInsets();

  if (!result) return null;

  const generating = result.status === 'generating';
  const failed = result.status === 'failed';

  function jump(messageId: string) {
    onClose();
    onJumpToMessage(messageId);
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
        {/* Rich Golden Background with Blurred Corner Blobs */}
        <GoldenAwardsBackground />

        {/* Safe Top Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }]}>
          <View style={styles.headerBadge}>
            <LinearGradient
              colors={['rgba(253, 224, 71, 0.35)', 'rgba(245, 158, 11, 0.18)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerBadgeGradient}
            >
              <Ionicons name="trophy" size={14} color="#FDE047" />
              <Text style={styles.headerBadgeText}>GC AWARDS</Text>
            </LinearGradient>
          </View>

          <PressableScale
            style={styles.closeBtn}
            scaleTo={0.88}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </PressableScale>
        </View>

        {/* Scrollable Awards Ceremony Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom + 36, 52) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Ceremony Hero */}
          <Animated.View
            entering={FadeIn.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.hero}
          >
            {/* Glowing Trophy Crest */}
            <View style={styles.crestWrapper}>
              <LinearGradient
                colors={['#FDE047', '#F59E0B', '#D97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.crestBorder}
              >
                <View style={styles.crestInner}>
                  <Text style={styles.crestEmoji}>🏆</Text>
                </View>
              </LinearGradient>
              <View style={styles.crestBackGlow} />
            </View>

            <Text style={styles.ceremonyEyebrow}>WEEKLY WRAPPED & HONORS</Text>
            <Text style={styles.dateRange}>
              {dateLabel(result.weekStart)} — {dateLabel(result.weekEnd)}
            </Text>

            {!generating && !failed && (
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Ionicons name="chatbubbles" size={13} color={colors.primary} />
                  <Text style={styles.statPillText}>
                    {result.messageCount.toLocaleString()} messages judged
                  </Text>
                </View>
                <View style={styles.statPill}>
                  <Ionicons name="ribbon" size={13} color="#FBBF24" />
                  <Text style={styles.statPillText}>
                    {result.awards.length} title{result.awards.length === 1 ? '' : 's'} awarded
                  </Text>
                </View>
              </View>
            )}

            {!generating && !failed && result.awards.length > 0 && (
              <Text style={styles.heroSubtitle}>
                The receipts have been audited. The verdicts are final. 💀
              </Text>
            )}
          </Animated.View>

          {/* GC AI's overall take on the week — separate from any one
              category, the way a Tea Report's title sits above its receipts. */}
          {!generating && !failed && !!result.title && (
            <Animated.View
              entering={FadeInDown.delay(40)
                .duration(duration.slow)
                .easing(easing.out)
                .reduceMotion(reduceMotion)}
              style={styles.verdictCard}
            >
              <View style={styles.verdictHead}>
                <Ionicons name="sparkles" size={13} color="#FDE047" />
                <Text style={styles.verdictEyebrow}>GC AI'S VERDICT</Text>
              </View>
              <Text style={styles.verdictTitle}>{result.title}</Text>
              {!!result.summary && <Text style={styles.verdictSummary}>{result.summary}</Text>}
            </Animated.View>
          )}

          {/* Generating State */}
          {generating && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={styles.stateBox}
            >
              <AIThinking tint="#FBBF24" />
              <Text style={styles.stateTitle}>Judging This Week's Chaos...</Text>
              <Text style={styles.stateSubtitle}>
                Tallying messages, calculating reply speeds, and uncovering the spiciest moments.
              </Text>
            </Animated.View>
          )}

          {/* Failed State */}
          {failed && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={styles.stateBox}
            >
              <View style={styles.errorIconWrap}>
                <Ionicons name="skull-outline" size={32} color={colors.error} />
              </View>
              <Text style={styles.stateTitle}>Jury Deliberation Error 💀</Text>
              <Text style={styles.stateSubtitle}>
                GC AI could not finalize the verdicts this week. It will automatically retry on the next schedule!
              </Text>
            </Animated.View>
          )}

          {/* Empty Activity State */}
          {!generating && !failed && result.awards.length === 0 && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={styles.stateBox}
            >
              <View style={styles.quietIconWrap}>
                <Ionicons name="moon-outline" size={32} color={colors.outline} />
              </View>
              <Text style={styles.stateTitle}>Quiet Week in the GC</Text>
              <Text style={styles.stateSubtitle}>
                Not enough happened to hand out trophies. Be louder this week to unlock next Sunday at noon! 🏆
              </Text>
            </Animated.View>
          )}

          {/* Award Cards List */}
          {!generating &&
            !failed &&
            result.awards.map((award, i) => (
              <AwardCard
                key={`${award.type}-${i}`}
                award={award}
                index={i}
                onJump={jump}
              />
            ))}

          {/* Ceremony Footer */}
          {!generating && !failed && result.awards.length > 0 && (
            <Animated.View
              entering={FadeInUp.delay(result.awards.length * 70 + 80)
                .duration(duration.page)
                .reduceMotion(reduceMotion)}
              style={styles.footerWrap}
            >
              <View style={styles.footerCard}>
                <Ionicons name="calendar-outline" size={16} color={colors.onSurfaceVariant} />
                <Text style={styles.footerNote}>
                  Awards refresh automatically every Sunday at noon.
                </Text>
              </View>

              <GCButton
                label="Close Awards"
                variant="ghost"
                onPress={onClose}
                style={styles.doneBtn}
              />
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0B04',
  },
  goldenBgRoot: {
    backgroundColor: '#0E0B04',
    overflow: 'hidden',
  },
  topSpotlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 460,
  },
  cornerBlob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.9,
  },
  blobFill: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  blobTopLeft: {
    top: -80,
    left: -80,
    width: 290,
    height: 290,
  },
  blobTopRight: {
    top: -70,
    right: -70,
    width: 270,
    height: 270,
  },
  blobBottomLeft: {
    bottom: -80,
    left: -70,
    width: 270,
    height: 270,
  },
  blobBottomRight: {
    bottom: -90,
    right: -80,
    width: 310,
    height: 310,
  },
  blobCenter: {
    top: '28%',
    left: '12%',
    width: 330,
    height: 330,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    zIndex: 10,
  },
  headerBadge: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.45)',
  },
  headerBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBadgeText: {
    ...typography.label,
    fontSize: 11,
    color: '#FDE047',
    letterSpacing: 1,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  crestWrapper: {
    marginBottom: spacing.xs,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestBorder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  crestInner: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    backgroundColor: '#1E170A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestEmoji: {
    fontSize: 32,
  },
  crestBackGlow: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(251, 191, 36, 0.35)',
    top: 0,
    left: 0,
    zIndex: -1,
  },
  ceremonyEyebrow: {
    ...typography.label,
    fontSize: 11,
    color: '#FDE047',
    letterSpacing: 1.4,
  },
  dateRange: {
    ...typography.headline,
    fontSize: 26,
    lineHeight: 32,
    color: colors.onSurface,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.caption,
    color: 'rgba(243, 244, 246, 0.75)',
    textAlign: 'center',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.25)',
  },
  statPillText: {
    ...typography.micro,
    color: colors.onSurface,
    fontWeight: '600',
  },
  verdictCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.22)',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  verdictHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verdictEyebrow: {
    ...typography.label,
    fontSize: 10,
    color: '#FDE047',
    letterSpacing: 1,
  },
  verdictTitle: {
    ...typography.titleMd,
    fontSize: 18,
    color: colors.onSurface,
  },
  verdictSummary: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurfaceVariant,
  },

  // State Boxes
  stateBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.section,
    paddingHorizontal: spacing.xl,
  },
  stateTitle: {
    ...typography.titleMd,
    color: colors.onSurface,
    textAlign: 'center',
  },
  stateSubtitle: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  quietIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  // Award Card
  cardContainer: {
    width: '100%',
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  cardGlowCircle: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 110,
    height: 110,
    borderRadius: 55,
    opacity: 0.22,
    pointerEvents: 'none',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  categoryEmoji: {
    fontSize: 17,
  },
  categoryTitle: {
    ...typography.label,
    fontSize: 13,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  tagPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tagPillText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  anonAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerMeta: {
    flex: 1,
    gap: 4,
  },
  winnerName: {
    ...typography.titleMd,
    fontSize: 19,
    color: colors.onSurface,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  metricText: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  reasonQuoteLine: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  reasonText: {
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.onSurface,
    flex: 1,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  receiptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  receiptText: {
    ...typography.label,
    fontSize: 12,
    letterSpacing: 0.4,
    fontWeight: '600',
  },

  // Footer
  footerWrap: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.15)',
  },
  footerNote: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  doneBtn: {
    width: '100%',
  },
});
