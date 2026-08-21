import { useState, useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, gradients, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from '../components/ui/Avatar';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { useAuth } from '../context/AuthContext';
import { selectFeedback, successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

type FeatureTourStep = {
  id: string;
  tag: string;
  tagColor: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: readonly [string, string];
  accent: string;
  headline: string;
  description: string;
  howTo: string[];
  mockup: {
    title: string;
    body: string;
    tag: string;
    tagColor: string;
  };
};

const TOUR_STEPS: FeatureTourStep[] = [
  {
    id: 'commands_ai',
    tag: 'CORE AI POWER',
    tagColor: '#818CF8',
    title: 'Slash Commands & @gc AI',
    icon: 'flash',
    iconBg: ['#6366F1', '#8B5CF6'],
    accent: '#818CF8',
    headline: 'AI built right into the conversation',
    description:
      'Supercharge your chats without leaving the keyboard. Mention @gc or type / commands to interact with GC AI instantly.',
    howTo: [
      'Type "/" to open quick commands: /summarize, /poll, /roast, /topic',
      'Type "@gc" followed by your question (e.g. "@gc who was loudest today?")',
      'Long press any message to ask @gc to explain, fact-check, or roast it',
    ],
    mockup: {
      title: '@gc AI in Chat',
      body: 'Bro really asked who was loudest... checking the logs 📊',
      tag: '⚡ Instant AI',
      tagColor: '#818CF8',
    },
  },
  {
    id: 'tea_mode',
    tag: 'LIVE SESSIONS',
    tagColor: '#10B981',
    title: 'Spill the Tea ☕',
    icon: 'cafe',
    iconBg: ['#059669', '#10B981'],
    accent: '#10B981',
    headline: '10-minute live drama & gossip mode',
    description:
      'Got hot gossip? Tap Tea Mode to transform the chat with an amber glow and live timer. When Tea ends, GC AI generates an exclusive Tea Report!',
    howTo: [
      'Tap the ☕ cup icon in the chat header to ignite Tea Mode',
      'The entire chat turns amber with a live 10-minute countdown',
      'When time expires, receive an automatic AI Tea Report summary',
    ],
    mockup: {
      title: 'Tea Session Active 🍵',
      body: 'Timer: 09:42 left — Spill everything before the clock runs out!',
      tag: '🔥 10-min Live Spill',
      tagColor: '#10B981',
    },
  },
  {
    id: 'awards',
    tag: 'WEEKLY PODIUMS',
    tagColor: '#F59E0B',
    title: 'Weekly GC Awards 🏆',
    icon: 'trophy',
    iconBg: ['#D97706', '#F59E0B'],
    accent: '#F59E0B',
    headline: 'Automatic Sunday night glory',
    description:
      'Every Sunday night, GC AI reads the week\'s chaos and crowns the winners with custom podium animations and awards.',
    howTo: [
      'Chat MVP, Best Tea Spiller, Biggest Yapper & Unhinged Member',
      'Tap "Awards & Achievements" in Profile or Explore tab',
      'Share podium highlights directly with your friends',
    ],
    mockup: {
      title: 'Sunday Night Drop 🏆',
      body: '🥇 MVP of the Week crowned with 842 messages!',
      tag: '👑 Weekly Podium',
      tagColor: '#F59E0B',
    },
  },
  {
    id: 'stats_dna',
    tag: 'GROUP ANALYTICS',
    tagColor: '#22D3EE',
    title: 'Group Stats & GC DNA 🧬',
    icon: 'stats-chart',
    iconBg: ['#0891B2', '#06B6D4'],
    accent: '#22D3EE',
    headline: 'Your chat’s personality & vibe meter',
    description:
      'GC analyzes your group’s messages to calculate your unique GC DNA, chaotic vs chill meters, inside jokes, and daily one-word stats.',
    howTo: [
      'Tap the Group Header → Group DNA in any chat',
      'Discover your group archetype (e.g. "The 3 AM Degenerates")',
      'Get daily group stats with today\'s one-word vibe summary',
    ],
    mockup: {
      title: 'GC DNA Personality 🧬',
      body: 'Archetype: 88% Chaotic Unhinged • Today: "YAPFEST"',
      tag: '📊 Vibe Meter',
      tagColor: '#22D3EE',
    },
  },
  {
    id: 'ai_polls',
    tag: 'INTERACTIVE',
    tagColor: '#EC4899',
    title: 'Instant AI Polls 🗳️',
    icon: 'bar-chart',
    iconBg: ['#DB2777', '#EC4899'],
    accent: '#EC4899',
    headline: 'Settle group debates in seconds',
    description:
      'Create animated voting polls in one tap. Let AI draft hilarious poll questions or create custom options for food, meetups, and plans.',
    howTo: [
      'Type "/poll" in composer or tap "+" → Polls',
      'Ask @gc "make a poll about where we should eat"',
      'Vote with real-time percentage bars and haptic feedback',
    ],
    mockup: {
      title: 'Group Poll Live 🗳️',
      body: 'Where are we eating tonight? • 12 votes cast so far',
      tag: '🗳️ Live Voting',
      tagColor: '#EC4899',
    },
  },
  {
    id: 'eleven_eleven',
    tag: 'GROUP RITUAL',
    tagColor: '#FBBF24',
    title: '11:11 Make a Wish ✨',
    icon: 'sparkles',
    iconBg: ['#B45309', '#F59E0B'],
    accent: '#FBBF24',
    headline: 'Daily wishing ritual with friends',
    description:
      'At 11:11 AM and 11:11 PM, GC triggers special glowing notifications and celebration animations so everyone drops their wishes together.',
    howTo: [
      'Receive local push notifications at exactly 11:11 AM & PM',
      'Drop your wish in chat during the 60-second magic window',
      'Watch celebratory glowing sparkles light up the chat',
    ],
    mockup: {
      title: '11:11 Magic Window ✨',
      body: 'It\'s 11:11 — drop your wishes in the group now!',
      tag: '🪄 11:11 AM & PM',
      tagColor: '#FBBF24',
    },
  },
  {
    id: 'what_i_missed',
    tag: 'SMART RECAP',
    tagColor: '#A855F7',
    title: 'What Did I Miss? 🧠',
    icon: 'bulb',
    iconBg: ['#7E22CE', '#A855F7'],
    accent: '#A855F7',
    headline: 'Instant AI summary of the conversation',
    description:
      'Coming back after hours or days away? Tap the AI button to get a hilarious, bulletproof recap of other members\' messages with citations and drama highlights.',
    howTo: [
      'Tap the ✨ AI button in the top bar of any chat',
      'View categorized highlights: Drama, Plans, Info, & Jokes',
      'Tap any highlight to jump directly to that message in history',
    ],
    mockup: {
      title: 'What Did I Miss 🧠',
      body: 'Summary: The Goa trip got cancelled again & 3 memes dropped 💀',
      tag: '⚡ Smart Catch-Up',
      tagColor: '#A855F7',
    },
  },
  {
    id: 'personal_themes',
    tag: 'CUSTOMIZATION',
    tagColor: '#FB7185',
    title: 'Personal Chat Themes 🎨',
    icon: 'color-palette',
    iconBg: ['#E11D48', '#FB7185'],
    accent: '#FB7185',
    headline: 'Your chat, your personal aesthetic',
    description:
      'Everyone can style any group chat with their favorite color palette (Violet, Bubblegum, Cyan, Sunset, Lime, Midnight). Only changes the view for you!',
    howTo: [
      'Open any chat → tap group header → Chat Theme',
      'Pick any of the 6 curated neon gradients',
      'Stored locally on your device without affecting other members',
    ],
    mockup: {
      title: 'Personal Theme Engine 🌈',
      body: 'Cyan Glow theme active on this chat for your view',
      tag: '🎨 6 Color Vibes',
      tagColor: '#FB7185',
    },
  },
];

/** Deep moody atmospheric glow background for Welcome Screen (zero blob artifacts) */
function WelcomeAtmosphericBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      <LinearGradient
        colors={['#0C0A14', '#06050A', colors.appChrome]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={['rgba(139, 92, 246, 0.18)', 'rgba(236, 72, 153, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.topSpotlight}
      />

      <LinearGradient
        colors={['rgba(139, 92, 246, 0.12)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={['rgba(76, 215, 246, 0.08)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={['transparent', 'rgba(139, 92, 246, 0.05)', 'transparent']}
        start={{ x: 0.5, y: 0.25 }}
        end={{ x: 0.5, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={['transparent', 'rgba(3, 2, 6, 0.65)']}
        start={{ x: 0.5, y: 0.6 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function WelcomeScreen({ navigation }: Props) {
  const { profile, clearJustSignedUp } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  const avatarScale = useSharedValue(0.4);
  const glow = useSharedValue(0);

  useEffect(() => {
    successFeedback();
    avatarScale.value = withDelay(120, withSpring(1, { damping: 11, stiffness: 140 }));
    glow.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: easing.inOut, reduceMotion }),
          withTiming(0, { duration: 1600, easing: easing.inOut, reduceMotion })
        ),
        -1,
        false
      )
    );
  }, [avatarScale, glow]);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.2, 0.55]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.9, 1.2]) }],
  }));

  function enterApp() {
    successFeedback();
    clearJustSignedUp();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('MainTabs');
    }
  }

  function handleNext() {
    selectFeedback();
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      enterApp();
    }
  }

  function handlePrev() {
    selectFeedback();
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  const name = profile?.display_name ?? 'there';
  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <View style={styles.root}>
      <WelcomeAtmosphericBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarMiniWrap}>
              <Animated.View style={[styles.avatarMiniGlow, glowStyle]} />
              <Animated.View style={avatarStyle}>
                <Avatar
                  imageUrl={profile?.avatar_url}
                  label={profile?.display_name}
                  size={36}
                  ringColors={gradients.brand}
                />
              </Animated.View>
            </View>
            <View style={styles.headerTitles}>
              <Text style={styles.welcomeUser} numberOfLines={1}>
                Welcome, {name}!
              </Text>
              <Text style={styles.stepProgressText}>
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </Text>
            </View>
          </View>

          <PressableScale
            scaleTo={0.92}
            haptic="light"
            onPress={enterApp}
            style={styles.skipBtn}
          >
            <Text style={styles.skipBtnText}>Skip Tour</Text>
            <Ionicons name="close" size={14} color="#94A3B8" />
          </PressableScale>
        </View>

        {/* Step Progress Bar */}
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` },
            ]}
          />
        </View>

        {/* Center Feature Card Scrollable Area */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={`step-${step.id}`}
            entering={FadeInRight.duration(240).easing(easing.out)}
            exiting={FadeOutLeft.duration(180)}
            style={styles.cardWrapper}
          >
            <GlassPanel borderRadius={radius.xxl} style={styles.featureCard}>
              {/* Feature Icon Header */}
              <View style={styles.featureHeaderRow}>
                <LinearGradient
                  colors={step.iconBg}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.featureIconBox, { shadowColor: step.accent }]}
                >
                  <Ionicons name={step.icon} size={28} color="#FFFFFF" />
                </LinearGradient>

                <View style={styles.featureHeaderInfo}>
                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: `${step.tagColor}18`,
                        borderColor: `${step.tagColor}40`,
                      },
                    ]}
                  >
                    <Text style={[styles.tagBadgeText, { color: step.tagColor }]}>
                      {step.tag}
                    </Text>
                  </View>
                  <Text style={styles.featureTitle}>{step.title}</Text>
                </View>
              </View>

              {/* Headline */}
              <Text style={styles.featureHeadline}>{step.headline}</Text>

              {/* Description */}
              <Text style={styles.featureDescription}>{step.description}</Text>

              {/* How to Use Section */}
              <View style={styles.howToBlock}>
                <Text style={styles.howToLabel}>HOW TO USE</Text>
                <View style={styles.howToList}>
                  {step.howTo.map((item, idx) => (
                    <View key={idx} style={styles.howToItem}>
                      <View style={[styles.howToBullet, { backgroundColor: `${step.accent}24`, borderColor: step.accent }]}>
                        <Text style={[styles.howToBulletText, { color: step.accent }]}>
                          {idx + 1}
                        </Text>
                      </View>
                      <Text style={styles.howToText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Live Preview Mockup Box */}
              {step.mockup && (
                <View style={styles.mockupBox}>
                  <View style={styles.mockupTopRow}>
                    <Text style={styles.mockupSender}>{step.mockup.title}</Text>
                    <View
                      style={[
                        styles.mockupTag,
                        {
                          backgroundColor: `${step.mockup.tagColor}22`,
                          borderColor: `${step.mockup.tagColor}45`,
                        },
                      ]}
                    >
                      <Text style={[styles.mockupTagText, { color: step.mockup.tagColor }]}>
                        {step.mockup.tag}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.mockupBody}>{step.mockup.body}</Text>
                </View>
              )}
            </GlassPanel>
          </Animated.View>
        </ScrollView>

        {/* Bottom Navigation Controls */}
        <View style={styles.bottomBar}>
          {/* Step Dots */}
          <View style={styles.dotsRow}>
            {TOUR_STEPS.map((_, i) => (
              <PressableScale
                key={i}
                scaleTo={0.85}
                haptic="light"
                onPress={() => {
                  selectFeedback();
                  setCurrentStep(i);
                }}
              >
                <View
                  style={[
                    styles.dot,
                    i === currentStep && [styles.dotActive, { backgroundColor: step.accent }],
                  ]}
                />
              </PressableScale>
            ))}
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionsRow}>
            {currentStep > 0 ? (
              <PressableScale
                style={styles.prevBtn}
                scaleTo={0.94}
                haptic="light"
                onPress={handlePrev}
              >
                <Ionicons name="arrow-back" size={18} color="#94A3B8" />
                <Text style={styles.prevBtnText}>Back</Text>
              </PressableScale>
            ) : (
              <View style={{ width: 80 }} />
            )}

            <PressableScale
              style={[styles.nextBtnWrap, isLast && styles.nextBtnWrapLast]}
              scaleTo={0.96}
              haptic="medium"
              onPress={handleNext}
            >
              <LinearGradient
                colors={isLast ? gradients.brand : [step.accent, '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.nextBtnGradient}
              >
                <Text style={styles.nextBtnText}>
                  {isLast ? "Let's Cook 🚀" : 'Next Feature'}
                </Text>
                <Ionicons
                  name={isLast ? 'rocket' : 'arrow-forward'}
                  size={16}
                  color="#FFFFFF"
                />
              </LinearGradient>
            </PressableScale>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  safe: { flex: 1 },

  // Glow Background
  glowBgRoot: { backgroundColor: colors.appRoot, overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },

  // Header Bar
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  avatarMiniWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniGlow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(168, 85, 247, 0.35)',
  },
  headerTitles: {
    gap: 1,
  },
  welcomeUser: {
    ...typography.headline,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stepProgressText: {
    ...typography.caption,
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  skipBtnText: {
    ...typography.caption,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // Progress Bar
  progressBarBg: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#818CF8',
  },

  // Scroll Content
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  cardWrapper: {
    width: '100%',
  },
  featureCard: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(20, 18, 30, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },

  // Feature Header
  featureHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureIconBox: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  featureHeaderInfo: {
    flex: 1,
    gap: 4,
  },
  tagBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tagBadgeText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  featureTitle: {
    ...typography.headline,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  featureHeadline: {
    ...typography.bodyLg,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#F1F5F9',
    lineHeight: 22,
  },
  featureDescription: {
    ...typography.body,
    fontSize: 13.5,
    color: '#94A3B8',
    lineHeight: 20,
  },

  // How to Block
  howToBlock: {
    gap: spacing.xs + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  howToLabel: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
  },
  howToList: {
    gap: 8,
  },
  howToItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  howToBullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 1,
  },
  howToBulletText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '800',
  },
  howToText: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#CBD5E1',
    lineHeight: 18,
    flex: 1,
  },

  // Mockup Box
  mockupBox: {
    backgroundColor: '#0F0E18',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 4,
  },
  mockupTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mockupSender: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mockupTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  mockupTagText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
  },
  mockupBody: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },

  // Bottom Bar
  bottomBar: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(7, 6, 11, 0.95)',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  dotActive: {
    width: 22,
    height: 7,
    borderRadius: 3.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  prevBtnText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  nextBtnWrap: {
    flex: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  nextBtnWrapLast: {
    shadowColor: '#EC4899',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  nextBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  nextBtnText: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

