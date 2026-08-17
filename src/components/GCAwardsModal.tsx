import React, { useEffect } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
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
  sticker_of_week: {
    title: 'Sticker of the Week',
    emoji: '🏷️',
    tag: 'ON REPEAT',
    color: '#2DD4BF',
    gradient: ['#2DD4BF', '#0D9488'],
    glowColor: 'rgba(45, 212, 191, 0.35)',
    borderColor: 'rgba(45, 212, 191, 0.45)',
    bgTint: 'rgba(45, 212, 191, 0.1)',
    valueIcon: 'happy',
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
 * Atmospheric golden background with silky smooth diffused ambient glows (zero blob artifacts).
 */
function GoldenAwardsBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.goldenBgRoot]} pointerEvents="none">
      {/* Deep Obsidian-Gold Base Gradient */}
      <LinearGradient
        colors={['#141006', '#0C0A04', '#050402']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Grand Golden Atmospheric Glow */}
      <LinearGradient
        colors={['rgba(253, 224, 71, 0.18)', 'rgba(245, 158, 11, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.topSpotlight}
      />

      {/* Top-Left Ambient Gold Wash */}
      <LinearGradient
        colors={['rgba(251, 191, 36, 0.10)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top-Right Amber Accent Wash */}
      <LinearGradient
        colors={['rgba(245, 158, 11, 0.08)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Center Warm Ambient Bloom */}
      <LinearGradient
        colors={['transparent', 'rgba(251, 191, 36, 0.05)', 'transparent']}
        start={{ x: 0.5, y: 0.25 }}
        end={{ x: 0.5, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Bottom Grounding Vignette */}
      <LinearGradient
        colors={['transparent', 'rgba(5, 4, 2, 0.65)']}
        start={{ x: 0.5, y: 0.6 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * 👑 Grand Centerpiece Champion Card for Member of the Week / Professional Yapper (most messages).
 * Features a prominent Big PFP, dramatic "Yapper Award goes to ___" announcement,
 * champion crown badge, and AI audit verdict.
 */
function YapperChampionCard({
  award,
  onJump,
}: {
  award: Award;
  onJump: (messageId: string) => void;
}) {
  const hasReceipts = award.sourceMessageIds && award.sourceMessageIds.length > 0;
  const isAnonymous = !award.userId && award.userName === 'someone';

  // 1. Floating Crown Loop Animation
  const crownFloat = useSharedValue(0);
  // 2. Avatar Gentle Breathing Loop Animation
  const avatarBreath = useSharedValue(0);
  // 3. Member of the Week Badge Sheen Loop Animation
  const badgePulse = useSharedValue(0);

  useEffect(() => {
    crownFloat.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: easing.inOut, reduceMotion }),
        withTiming(0, { duration: 1300, easing: easing.inOut, reduceMotion })
      ),
      -1,
      true
    );

    avatarBreath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: easing.inOut, reduceMotion }),
        withTiming(0, { duration: 1800, easing: easing.inOut, reduceMotion })
      ),
      -1,
      true
    );

    badgePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: easing.inOut, reduceMotion }),
        withTiming(0, { duration: 1600, easing: easing.inOut, reduceMotion })
      ),
      -1,
      true
    );
  }, []);

  const crownAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(crownFloat.value, [0, 1], [0, -6]) },
      { rotate: `${interpolate(crownFloat.value, [0, 1], [-3, 3])}deg` },
      { scale: interpolate(crownFloat.value, [0, 1], [1, 1.08]) },
    ],
  }));

  const avatarAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(avatarBreath.value, [0, 1], [1, 1.035]) },
    ],
  }));

  const avatarGlowAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(avatarBreath.value, [0, 1], [0.3, 0.6]),
    transform: [{ scale: interpolate(avatarBreath.value, [0, 1], [0.98, 1.08]) }],
  }));

  const badgeAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(badgePulse.value, [0, 1], [1, 1.025]) },
    ],
    opacity: interpolate(badgePulse.value, [0, 1], [0.92, 1]),
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(20)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
      style={styles.cardContainer}
    >
      <View style={styles.yapperCard}>
        {Platform.OS !== 'web' && (
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        )}

        {/* Soft Golden Ambient Glow inside the box */}
        <LinearGradient
          colors={['rgba(253, 224, 71, 0.20)', 'rgba(245, 158, 11, 0.08)', 'rgba(20, 15, 5, 0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top Gold Shimmer Bar */}
        <LinearGradient
          colors={['#FDE047', '#F59E0B', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.yapperAccentBar}
        />

        {/* Member of the Week Crown Eyebrow Banner (Looping Subtle Pulse) */}
        <Animated.View style={[styles.yapperCrownBanner, badgeAnimStyle]}>
          <LinearGradient
            colors={['rgba(253, 224, 71, 0.30)', 'rgba(245, 158, 11, 0.15)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.yapperCrownBannerGrad}
          >
            <Ionicons name="trophy" size={13} color="#FDE047" />
            <Text style={styles.yapperCrownBannerText}>MEMBER OF THE WEEK</Text>
            <View style={styles.yapperTagPill}>
              <Text style={styles.yapperTagText}>#1 YAPPER</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Centerpiece Hero Big PFP (Looping Breathing + Floating Crown) */}
        <View style={styles.yapperAvatarSection}>
          <View style={styles.yapperAvatarWrapper}>
            {/* Breathing Golden Aura */}
            <Animated.View style={[styles.yapperAvatarAura, avatarGlowAnimStyle]} pointerEvents="none" />

            <Animated.View style={avatarAnimStyle}>
              {!isAnonymous ? (
                <Avatar
                  emoji={award.userAvatarEmoji ?? undefined}
                  imageUrl={award.userAvatarUrl}
                  label={award.userName}
                  size={88}
                  ring={true}
                  ringColors={['#FDE047', '#F59E0B', '#D97706']}
                />
              ) : (
                <View style={styles.yapperAnonAvatar}>
                  <Ionicons name="person" size={42} color="#FDE047" />
                </View>
              )}
            </Animated.View>

            {/* Floating Crown Badge (Looping Bobbing Animation) */}
            <Animated.View style={[styles.yapperFloatingCrown, crownAnimStyle]}>
              <Text style={styles.yapperCrownEmoji}>👑</Text>
            </Animated.View>
          </View>

          {/* "Yapper Award goes to ___" Typography */}
          <View style={styles.yapperAnnouncement}>
            <Text style={styles.yapperGoesToText}>Yapper Award goes to</Text>
            <Text style={styles.yapperWinnerName} numberOfLines={2}>
              {award.userName}
            </Text>

            {!!award.value && (
              <View style={styles.yapperMetricPill}>
                <Ionicons name="chatbubbles" size={13} color="#FDE047" />
                <Text style={styles.yapperMetricText}>{award.value}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Citation / AI Roast Verdict */}
        <View style={styles.yapperReasonBox}>
          <View style={styles.yapperReasonHead}>
            <Ionicons name="sparkles" size={12} color="#FDE047" />
            <Text style={styles.yapperReasonEyebrow}>AI AUDIT VERDICT</Text>
          </View>
          <Text style={styles.yapperReasonText}>{award.reason}</Text>
        </View>

        {/* View Receipts Button */}
        {hasReceipts && (
          <PressableScale
            style={styles.yapperReceiptBtn}
            scaleTo={0.97}
            haptic="light"
            onPress={() => onJump(award.sourceMessageIds[0])}
          >
            <View style={styles.receiptContent}>
              <Ionicons name="document-text-outline" size={14} color="#FDE047" />
              <Text style={styles.yapperReceiptText}>
                View receipt{award.sourceMessageIds.length > 1 ? 's' : ''} ({award.sourceMessageIds.length})
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#FDE047" />
          </PressableScale>
        )}
      </View>
    </Animated.View>
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
          {award.imageUrl ? (
            // Sticker of the Week is the one award whose subject is an object
            // rather than a member, so the sticker takes the avatar's slot and
            // the person named below is whoever sent it most.
            <View style={[styles.stickerFrame, { borderColor: theme.borderColor }]}>
              <Image
                source={award.imageUrl}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={140}
              />
            </View>
          ) : !isAnonymous ? (
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

  // Sort awards so the grand Member of the Week / Professional Yapper is prominently first
  const sortedAwards = [...result.awards].sort((a, b) => {
    const aIsYapper = a.type === 'professional_yapper' || a.title.toLowerCase().includes('yapper');
    const bIsYapper = b.type === 'professional_yapper' || b.title.toLowerCase().includes('yapper');
    if (aIsYapper && !bIsYapper) return -1;
    if (!aIsYapper && bIsYapper) return 1;
    return 0;
  });

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
              <AIThinking tint="#FDE047" />
              <Text style={styles.stateSubtitle}>
                The jury is calculating who yapped the most and who started the drama...
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
            sortedAwards.map((award, i) => {
              const isYapper =
                award.type === 'professional_yapper' ||
                award.title.toLowerCase().includes('yapper');

              if (isYapper) {
                return (
                  <YapperChampionCard
                    key={`${award.type}-${i}`}
                    award={award}
                    onJump={jump}
                  />
                );
              }

              return (
                <AwardCard
                  key={`${award.type}-${i}`}
                  award={award}
                  index={i}
                  onJump={jump}
                />
              );
            })}

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
  },
  blobFill: {
    flex: 1,
    borderRadius: 999,
  },
  blobTopLeft: {
    top: -60,
    left: -60,
    width: 260,
    height: 260,
    opacity: 0.7,
  },
  blobTopRight: {
    top: -50,
    right: -50,
    width: 250,
    height: 250,
    opacity: 0.65,
  },
  blobBottomLeft: {
    bottom: -60,
    left: -50,
    width: 260,
    height: 260,
    opacity: 0.6,
  },
  blobBottomRight: {
    bottom: -70,
    right: -60,
    width: 280,
    height: 280,
    opacity: 0.65,
  },
  blobCenter: {
    top: '35%',
    left: '20%',
    width: 240,
    height: 240,
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
    zIndex: 10,
  },
  headerBadge: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  headerBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.45)',
  },
  headerBadgeText: {
    ...typography.label,
    fontSize: 11,
    color: '#FDE047',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  crestWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  crestBorder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: '#1E1608',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestEmoji: {
    fontSize: 30,
  },
  crestBackGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(245, 158, 11, 0.35)',
    zIndex: -1,
  },
  ceremonyEyebrow: {
    ...typography.micro,
    fontSize: 11,
    color: '#FDE047',
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  dateRange: {
    ...typography.caption,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  heroSubtitle: {
    ...typography.caption,
    fontSize: 13,
    color: colors.onSurfaceVariant,
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

  // Grand Yapper Champion Card
  yapperCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 224, 71, 0.55)',
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(24, 18, 7, 0.85)',
  },
  yapperAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  yapperCrownBanner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  yapperCrownBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.5)',
  },
  yapperCrownBannerText: {
    ...typography.label,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FDE047',
    letterSpacing: 1,
  },
  yapperTagPill: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  yapperTagText: {
    ...typography.micro,
    fontSize: 9,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  yapperAvatarSection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  yapperAvatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  yapperAvatarAura: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(245, 158, 11, 0.40)',
  },
  yapperAnonAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    borderColor: '#FDE047',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yapperFloatingCrown: {
    position: 'absolute',
    top: -10,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1608',
    borderWidth: 1.5,
    borderColor: '#FDE047',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  yapperCrownEmoji: {
    fontSize: 16,
  },
  yapperAnnouncement: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  yapperGoesToText: {
    ...typography.caption,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FDE047',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  yapperWinnerName: {
    ...typography.headline,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  yapperMetricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(253, 224, 71, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  yapperMetricText: {
    ...typography.label,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FDE047',
  },
  yapperReasonBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.22)',
    gap: 6,
  },
  yapperReasonHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yapperReasonEyebrow: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
    color: '#FDE047',
    letterSpacing: 0.8,
  },
  yapperReasonText: {
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: '#F5F5F7',
  },
  yapperReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(253, 224, 71, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.4)',
  },
  yapperReceiptText: {
    ...typography.label,
    fontSize: 13,
    letterSpacing: 0.4,
    fontWeight: '700',
    color: '#FDE047',
  },

  // Category Award Card
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
  stickerFrame: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
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
