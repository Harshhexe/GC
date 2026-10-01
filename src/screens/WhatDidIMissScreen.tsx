import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  colors,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { groupTheme, GroupTheme, usePersonalGroupTheme } from '../theme/groupThemes';
import {
  AuroraBackground,
  SpotlightCard,
  ShinyText,
  DecryptedText,
  AIPulsingCore,
  NeonBadge,
  ElasticTabBar,
  BentoStatBox,
} from '../components/reactbits';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton } from '../components/ui/Buttons';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { useMessages } from '../hooks/useMessages';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { usePrivateCommentsForMe } from '../hooks/usePrivateComments';
import { useGroupRecap } from '../hooks/useGroupRecap';
import { useWhatDidIMiss } from '../hooks/useWhatDidIMiss';
import { useMissedRecapHistory, type MissedRecapEntry } from '../hooks/useMissedRecapHistory';
import { useDailyRecapHistory } from '../hooks/useDailyRecapHistory';
import { useTodaysTea } from '../hooks/useTodaysTea';
import { useDailyNames } from '../hooks/useDailyNames';
import { TeaReportModal } from '../components/TeaReportModal';
import type { TeaSession } from '../hooks/useTeaSession';
import { useWeeklyAwards } from '../hooks/useWeeklyAwards';
import { GCAwardsModal } from '../components/GCAwardsModal';
import type { WeeklyAwardsResult } from '../lib/ai';
import { AIThinking, AIErrorState } from '../components/ui/AIState';
import { AIEmptyStory } from '../components/ui/AIEmptyStory';
import { DailyRecapModal } from '../components/DailyRecapModal';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clockTime, timeAgo } from '../utils/time';
import type { MissedCategory, MissedHighlight, DailyRecapResult } from '../lib/ai';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WhatDidIMiss'>;
type MissedTab = 'missed' | 'tea' | 'pulse' | 'names';

function ThemedGlowBackground({ theme }: { theme: GroupTheme }) {
  return (
    <AuroraBackground
      color1={theme.accent}
      color2={theme.colors[1] ?? '#A855F7'}
      color3="#38BDF8"
      opacity={0.34}
    />
  );
}

function Section({
  icon,
  iconColor,
  title,
  trailing,
  children,
  delay,
  onLayout,
  highlighted,
  aiGenerated,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  delay: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  highlighted?: boolean;
  /** Marks the section's contents as model-written. */
  aiGenerated?: boolean;
}) {
  return (
    <Animated.View
      onLayout={onLayout}
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      <SpotlightCard
        spotlightColor={`${iconColor}22`}
        borderColor={highlighted ? colors.yellow : 'rgba(255, 255, 255, 0.10)'}
        borderRadius={24}
        style={[
          styles.card,
          highlighted && {
            borderWidth: 1.5,
            shadowColor: colors.yellow,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: `${iconColor}22`, borderColor: `${iconColor}44`, borderWidth: 1 }]}>
            <Ionicons name={icon} size={16} color={iconColor} />
          </View>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {title}
          </Text>
          {aiGenerated && (
            <NeonBadge label="AI" color={iconColor} showDot={false} />
          )}
          <View style={styles.spacer} />
          {trailing}
        </View>
        <View style={styles.divider} />
        {children}
      </SpotlightCard>
    </Animated.View>
  );
}

/** Category → the badge the highlight wears. Kept in one place so the AI's
 *  vocabulary and the UI's can't drift apart. */
const CATEGORY_STYLE: Record<MissedCategory, { emoji: string; color: string }> = {
  tea: { emoji: '🍵', color: colors.secondary },
  plan: { emoji: '📅', color: colors.tertiary },
  info: { emoji: '📢', color: colors.primary },
  funny: { emoji: '💀', color: colors.yellow },
  convo: { emoji: '💬', color: colors.onSurfaceVariant },
  pinned: { emoji: '📌', color: colors.yellow },
  mention: { emoji: '👀', color: colors.secondary },
};

function HighlightCard({
  highlight,
  onJump,
}: {
  highlight: MissedHighlight;
  onJump: (messageId: string) => void;
}) {
  const style = CATEGORY_STYLE[highlight.category] ?? CATEGORY_STYLE.convo;
  const target = highlight.messageIds[0];

  return (
    <SpotlightCard
      spotlightColor={`${style.color}25`}
      borderColor={`${style.color}35`}
      borderRadius={18}
      style={styles.highlight}
    >
      <View style={styles.highlightInner}>
        <View style={styles.highlightHead}>
          <NeonBadge label={highlight.category.toUpperCase()} color={style.color} />
          <Text style={[styles.highlightTitle, { color: style.color }]} numberOfLines={1}>
            {highlight.title}
          </Text>
        </View>
        <Text style={styles.highlightBody}>{highlight.summary}</Text>
        {!!target && (
          <PressableScale
            style={[styles.viewMessage, { backgroundColor: `${style.color}15`, borderColor: `${style.color}35` }]}
            scaleTo={0.97}
            haptic="light"
            onPress={() => onJump(target)}
          >
            <Ionicons name="arrow-forward-circle-outline" size={15} color={style.color} />
            <Text style={[styles.viewMessageText, { color: style.color }]}>
              View message{highlight.messageIds.length > 1 ? 's' : ''}
            </Text>
          </PressableScale>
        )}
      </View>
    </SpotlightCard>
  );
}

const TEN_MINS_MS = 10 * 60 * 1000;

function formatRemainingTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function RecapTimerBadge({
  createdAt,
  now,
  accentColor,
}: {
  createdAt: string;
  now: number;
  accentColor?: string;
}) {
  const createdTime = new Date(createdAt).getTime();
  const remaining = Number.isNaN(createdTime) ? 0 : Math.max(0, TEN_MINS_MS - (now - createdTime));
  const isExpiringSoon = remaining < 2 * 60 * 1000;
  const tint = accentColor ?? '#818CF8';

  return (
    <View
      style={[
        styles.recapTimerPill,
        {
          backgroundColor: `${tint}18`,
          borderColor: `${tint}40`,
        },
        isExpiringSoon && styles.recapTimerUrgent,
      ]}
    >
      <Ionicons
        name={isExpiringSoon ? 'hourglass-outline' : 'timer-outline'}
        size={11}
        color={isExpiringSoon ? '#F87171' : tint}
      />
      <Text
        style={[
          styles.recapTimerText,
          { color: tint },
          isExpiringSoon && styles.recapTimerUrgentText,
        ]}
      >
        {formatRemainingTimer(remaining)} left
      </Text>
    </View>
  );
}

function RecapCard({
  entry,
  now,
  accentColor,
  onJump,
  isLast,
}: {
  entry: MissedRecapEntry;
  now: number;
  accentColor?: string;
  onJump: (messageId: string) => void;
  isLast: boolean;
}) {
  return (
    <SpotlightCard
      spotlightColor={`${accentColor ?? '#818CF8'}25`}
      borderColor="rgba(255, 255, 255, 0.12)"
      borderRadius={22}
      style={[styles.recapCard, isLast && styles.recapCardLast]}
    >
      <View style={styles.recapInner}>
        <View style={styles.recapCardHead}>
          <View style={styles.recapHeadInfo}>
            <Text style={styles.aiHeadline}>{entry.headline}</Text>
            <View style={styles.recapMetaRow}>
              <Text style={styles.recapTime}>{timeAgo(entry.createdAt)}</Text>
              <RecapTimerBadge createdAt={entry.createdAt} now={now} accentColor={accentColor} />
            </View>
          </View>
        </View>
        <Text style={styles.aiSummary}>{entry.summary}</Text>

        <View style={styles.highlightsStack}>
          {entry.highlights.map((h, i) => (
            <HighlightCard key={`${entry.id}-${h.category}-${i}`} highlight={h} onJump={onJump} />
          ))}
        </View>

        {entry.truncated && (
          <Text style={styles.aiFootnote}>
            You missed more than this — showing the most recent {entry.messageCount} messages.
          </Text>
        )}
      </View>
    </SpotlightCard>
  );
}

function dateRowLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function DailyRecapRow({ entry, onPress }: { entry: DailyRecapResult; onPress: () => void }) {
  return (
    <SpotlightCard
      spotlightColor="rgba(244, 114, 182, 0.2)"
      borderColor="rgba(255, 255, 255, 0.08)"
      borderRadius={16}
      onPress={onPress}
      style={styles.dailyRow}
    >
      <View style={styles.dailyRowInner}>
        <View style={styles.dailyRowDate}>
          <Text style={styles.dailyRowDateText}>{dateRowLabel(entry.date)}</Text>
        </View>
        <View style={styles.dailyRowCopy}>
          <Text style={styles.dailyRowWord}>{entry.oneWord}</Text>
          <Text style={styles.dailyRowMeta}>
            {entry.totalMessages} message{entry.totalMessages === 1 ? '' : 's'}
            {entry.userOfTheDay ? ` · ${entry.userOfTheDay.name}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.outline} />
      </View>
    </SpotlightCard>
  );
}

function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const end = new Date(`${weekEnd}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${start} – ${end}`;
}

function WeeklyAwardsRow({
  result,
  isThisWeek,
  onPress,
}: {
  result: WeeklyAwardsResult;
  isThisWeek: boolean;
  onPress: () => void;
}) {
  const topAward = result.awards[0];
  return (
    <SpotlightCard
      spotlightColor="rgba(251, 191, 36, 0.25)"
      borderColor="rgba(251, 191, 36, 0.3)"
      borderRadius={16}
      onPress={onPress}
      style={styles.awardsRow}
    >
      <View style={styles.awardsRowInner}>
        <Text style={styles.awardsRowEmoji}>
          {result.status === 'generating' ? '⏳' : result.status === 'failed' ? '💀' : '🏆'}
        </Text>
        <View style={styles.dailyRowCopy}>
          <Text style={styles.awardsRowTitle} numberOfLines={1}>
            {isThisWeek ? "This Week's Awards" : weekRangeLabel(result.weekStart, result.weekEnd)}
          </Text>
          <Text style={styles.dailyRowMeta} numberOfLines={1}>
            {result.status === 'generating'
              ? 'Judging...'
              : result.status === 'failed'
                ? 'Retrying automatically'
                : result.title ||
                  (topAward
                    ? `${topAward.emoji} ${topAward.title}: ${topAward.userName}`
                    : 'Not enough activity for awards')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.outline} />
      </View>
    </SpotlightCard>
  );
}

function StatRow({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statMeta}>{meta}</Text>
    </View>
  );
}

export default function WhatDidIMissScreen({ route, navigation }: Props) {
  const { groupId, groupName, focusSection } = route.params;
  const { profile } = useAuth();
  const { messages, loading } = useMessages(groupId);
  const { members } = useGroupMembers(groupId);
  // Private comments addressed to me within today's 24h window.
  const since24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const rawPrivateForMe = usePrivateCommentsForMe(groupId, since24h);

  const privateForMe = useMemo(() => {
    const messageMap = new Map(messages.map((m) => [m.id, m]));
    return rawPrivateForMe.filter((c) => {
      if (new Date(c.createdAt).getTime() < Date.now() - 24 * 60 * 60 * 1000) return false;
      const parentMsg = messageMap.get(c.messageId);
      if (parentMsg && parentMsg.isDeleted) return false;
      return true;
    });
  }, [rawPrivateForMe, messages]);
  const recap = useGroupRecap(
    messages,
    {
      userId: profile?.id,
      username: profile?.username,
      displayName: profile?.display_name,
    },
    members
  );
  const history = useMissedRecapHistory(groupId);
  const dailyHistory = useDailyRecapHistory(groupId);
  const todaysTea = useTodaysTea(groupId);
  const dailyNames = useDailyNames(groupId);
  const weeklyAwards = useWeeklyAwards(groupId);
  const [openDailyRecap, setOpenDailyRecap] = useState<DailyRecapResult | null>(null);
  const [openTea, setOpenTea] = useState<TeaSession | null>(null);
  const [openAwards, setOpenAwards] = useState<WeeklyAwardsResult | null>(null);
  const ai = useWhatDidIMiss(groupId);
  const [groupThemeKey, setGroupThemeKey] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('groups')
      .select('theme')
      .eq('id', groupId)
      .single()
      .then(({ data }) => {
        if (data?.theme) setGroupThemeKey(data.theme);
      });
  }, [groupId]);

  const { theme: activeTheme } = usePersonalGroupTheme(groupId, groupThemeKey);

  const [activeTab, setActiveTab] = useState<MissedTab>(
    focusSection === 'missedElevenEleven' ? 'pulse' : 'missed'
  );

  const scrollRef = useRef<ScrollView>(null);
  const elevenElevenYRef = useRef<number | null>(null);
  const [highlight1111, setHighlight1111] = useState(focusSection === 'missedElevenEleven');

  useEffect(() => {
    if (focusSection === 'missedElevenEleven') {
      setActiveTab('pulse');
      const timer = setTimeout(() => {
        if (elevenElevenYRef.current != null) {
          scrollRef.current?.scrollTo({ y: Math.max(0, elevenElevenYRef.current - 40), animated: true });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [focusSection]);

  // The AI check runs in the background against the persisted stack: it never
  // blocks or replaces what's already on screen, it only ever adds to it. A
  // fresh generation appends a row server-side (see toHistoryRow), so once the
  // check settles cleanly we just re-read the stack to pick that row up. A
  // cache hit or "nothing new" appends nothing, and the refresh is then a
  // no-op — which is the common case once you've already caught up today.
  const checkedRef = useRef(false);
  useEffect(() => {
    if (ai.loading || ai.error || checkedRef.current) return;
    checkedRef.current = true;
    history.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.loading, ai.error]);

  const [now, setNow] = useState(() => Date.now());
  const [activeRecaps, setActiveRecaps] = useState<MissedRecapEntry[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Merge unexpired history entries on mount
  useEffect(() => {
    if (history.entries.length > 0) {
      setActiveRecaps((prev) => {
        const prevIds = new Set(prev.map((e) => e.id));
        const unexpired = history.entries.filter(
          (e) => !prevIds.has(e.id) && Date.now() - new Date(e.createdAt).getTime() < TEN_MINS_MS
        );
        if (unexpired.length === 0) return prev;
        return [...prev, ...unexpired];
      });
    }
  }, [history.entries]);

  // No card is built from `ai.result` here on purpose. The server already
  // persists every genuinely fresh generation to ai_recap_history (and only a
  // fresh one — a cache hit writes nothing), so the refresh above is what puts
  // the recap on screen. Building a second card from the same response stacked
  // the identical recap twice: once client-side with a `catchup-` id, once
  // from history with its real uuid, which the merge could not recognise as
  // the same thing. It only looked correct on the *next* visit, where the
  // plain Postgres read beat the edge function and the `prev.length > 0` guard
  // suppressed the duplicate — the bug hid itself.
  //
  // Leaning on the persisted row also keeps the countdown honest: it runs from
  // when the recap was generated, not from when this screen happened to
  // render it.

  // The server's answer to "what did I miss *right now*" — but only the
  // roast (1–9 genuinely unread messages) gets shown here. A caught-up
  // result (messageCount 0) is deliberately rendered as nothing at all: the
  // AI only has something to say when there is something unread to say it
  // about, not "you're fine" as a permanent fixture on the screen.
  //
  // Independent of the recap stack below on purpose: it used to live inside
  // the same if/else chain, so any unexpired recap still on screen meant it
  // never rendered at all. Those answer different questions — this one is
  // about right now, the stack is what was already generated.
  const serverNote =
    !ai.loading && ai.result && !ai.result.hasMissedContent && ai.result.headline && ai.result.messageCount > 0
      ? { headline: ai.result.headline, summary: ai.result.summary }
      : null;

  const validEntries = activeRecaps.filter((entry) => {
    const createdTime = new Date(entry.createdAt).getTime();
    if (Number.isNaN(createdTime)) return false;
    return now - createdTime < TEN_MINS_MS;
  });

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

  const jumpTo = (messageId: string) => handleJumpToChat(messageId);

  useEffect(() => {
    // Deliberately tied to the tab being open, not to the screen mounting:
    // generation costs a model call, and most visits here are for Missed.
    if (activeTab === 'names') dailyNames.ensure();
  }, [activeTab, dailyNames]);

  const handleTabChange = (tab: MissedTab) => {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleCatchUp = async () => {
    if (ai.loading) return;
    await ai.retry();
    // Refresh alone, for the same reason as the mount path: the server has
    // already written any fresh recap to history, so adding a card from the
    // response here too stacked the same recap twice.
    await history.refresh();
  };

  return (
    <View style={styles.root}>
      <ThemedGlowBackground theme={activeTheme} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* React Bits Floating Header */}
        <View style={styles.modernTopBar}>
          <PressableScale
            style={styles.topBackCircle}
            scaleTo={0.92}
            haptic="light"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </PressableScale>

          <View style={styles.topBarCenter}>
            <Text style={styles.topBarGroupName} numberOfLines={1}>{groupName ?? 'GC'}</Text>
            <View style={styles.topBarStatusBadge}>
              <View style={[styles.topLiveDot, { backgroundColor: activeTheme.accent }]} />
              <ShinyText text="GC INTELLIGENCE" style={styles.topBarStatusText} shineColor="#FFFFFF" baseColor="rgba(255, 255, 255, 0.6)" />
            </View>
          </View>

          <Avatar
            emoji={profile?.avatar_emoji}
            imageUrl={profile?.avatar_url}
            label={profile?.display_name}
            size={38}
            ring
            ringColors={activeTheme.colors}
          />
        </View>

        {/* React Bits Elastic Segmented Tabs */}
        <ElasticTabBar
          tabs={[
            {
              id: 'missed',
              label: 'Catch Up',
              icon: 'sparkles-outline',
              badge: recap.mentions.length > 0 ? recap.mentions.length : undefined,
            },
            {
              id: 'tea',
              label: 'Stories',
              icon: 'cafe-outline',
              badge: todaysTea.sessions.length > 0 ? todaysTea.sessions.length : undefined,
            },
            {
              id: 'pulse',
              label: 'Pulse',
              icon: 'pulse-outline',
              badge: recap.missedElevenEleven.length > 0 ? recap.missedElevenEleven.length : undefined,
            },
            {
              id: 'names',
              label: 'Names',
              icon: 'pricetag-outline',
            },
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          accentColor={activeTheme.accent}
        />

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* TAB 1: MISSED (Vibe, AI Highlights & Mentions) */}
          {activeTab === 'missed' && (
            <>
              {/* React Bits AI Hero */}
              <Animated.View
                entering={FadeInDown.duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <SpotlightCard
                  spotlightColor={`${activeTheme.accent}26`}
                  borderColor="rgba(255, 255, 255, 0.12)"
                  borderRadius={26}
                  style={styles.heroCard}
                >
                  <View style={styles.heroInner}>
                    <View style={styles.heroTopRow}>
                      <AIPulsingCore accentColor={activeTheme.accent} size={46} icon="sparkles" />
                      <View style={styles.heroBadgeCol}>
                        <NeonBadge label="LIVE INTELLIGENCE" color={activeTheme.accent} />
                        <ShinyText
                          text="NEURAL DIGEST"
                          style={styles.heroShimmerText}
                          shineColor="#FFFFFF"
                          baseColor="rgba(255, 255, 255, 0.6)"
                        />
                      </View>
                    </View>

                    <View style={styles.heroTitleWrap}>
                      <DecryptedText
                        text="The Story So Far."
                        style={styles.heroTitle}
                        speed={30}
                      />
                      <Text style={styles.heroDescription}>
                        The highlights, spicy plot twists, and secret mentions from {groupName}. All in one place.
                      </Text>
                    </View>

                    {/* Bento Stat Grid */}
                    <View style={styles.bentoStatsGrid}>
                      <BentoStatBox
                        icon="at"
                        iconColor="#A78BFA"
                        value={recap.mentions.length + privateForMe.length}
                        label="Mentions"
                        sublabel="For you"
                      />
                      <BentoStatBox
                        icon="cafe"
                        iconColor="#F59E0B"
                        value={todaysTea.sessions.length}
                        label="Tea Stories"
                        sublabel="Spilled"
                      />
                      <BentoStatBox
                        icon="calendar"
                        iconColor="#F472B6"
                        value={dailyHistory.entries.length}
                        label="Daily Drops"
                        sublabel="Archive"
                      />
                      <BentoStatBox
                        icon="people"
                        iconColor="#38BDF8"
                        value={members.length}
                        label="Members"
                        sublabel="Active"
                      />
                    </View>
                  </View>
                </SpotlightCard>
              </Animated.View>

              {/* Vibe check */}
              <Animated.View
                entering={FadeInDown.delay(STAGGER_MS)
                  .duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <SpotlightCard
                  spotlightColor={`${activeTheme.accent}28`}
                  borderColor={`${activeTheme.accent}38`}
                  borderRadius={22}
                  style={styles.vibeCard}
                >
                  <View style={styles.vibeCardInner}>
                    <View style={styles.vibeLabelRow}>
                      <NeonBadge label="LIVE MOOD / TODAY" color={activeTheme.accent} />
                      <View style={[styles.moodPulseOrb, { backgroundColor: activeTheme.accent, shadowColor: activeTheme.accent }]} />
                    </View>
                    <Text style={styles.vibeValue}>{recap.vibe.label}</Text>
                    <Text style={styles.vibeDetail}>{recap.vibe.detail}</Text>
                  </View>
                </SpotlightCard>
              </Animated.View>

              {/* The recap stack */}
              <Section
                icon="sparkles"
                iconColor={activeTheme.accent}
                title="Highlights"
                aiGenerated
                delay={STAGGER_MS * 2}
                trailing={
                  <PressableScale
                    style={styles.catchUpHeaderBtnWrap}
                    scaleTo={0.92}
                    haptic="medium"
                    onPress={handleCatchUp}
                    disabled={ai.loading}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: ai.loading, busy: ai.loading }}
                    accessibilityLabel={
                      ai.loading ? 'Generating recap' : 'Catch up, regenerate the AI recap'
                    }
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  >
                    <View style={[styles.catchUpHeaderBtnGradient, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                      <Ionicons
                        name="sparkles"
                        size={12}
                        color={ai.loading ? colors.outline : '#FFFFFF'}
                      />
                      <Text
                        style={[
                          styles.catchUpHeaderBtnText,
                          ai.loading && { color: colors.outline },
                        ]}
                      >
                        {ai.loading ? 'Updating...' : 'Catch Up'}
                      </Text>
                    </View>
                  </PressableScale>
                }
              >
                {/* 1. If catching up / regenerating, new loading card appears on TOP */}
                {ai.loading && (
                  <Animated.View
                    entering={FadeInDown.duration(300).reduceMotion(reduceMotion)}
                    style={[styles.newCatchUpLoadingCard, { borderColor: `${activeTheme.accent}40` }]}
                  >
                    <AIThinking tint={activeTheme.accent} />
                    <Text style={styles.newCatchUpLoadingText}>
                      Catching up on latest messages & drama...
                    </Text>
                  </Animated.View>
                )}

                {/* 2. The current answer (Roast for 1–9 messages) */}
                {serverNote && (
                  <Animated.View
                    entering={FadeInDown.duration(300).reduceMotion(reduceMotion)}
                    style={styles.serverNote}
                  >
                    <View style={styles.roastBox}>
                      <Text style={styles.roastText}>
                        💀 {ai.result?.messageCount ?? 1} Unread Message{(ai.result?.messageCount ?? 1) === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={styles.emptyRecapHeadline}>{serverNote.headline}</Text>
                    {!!serverNote.summary && (
                      <Text style={styles.emptyMentions}>{serverNote.summary}</Text>
                    )}
                  </Animated.View>
                )}

                {/* 3. Existing / previous unexpired recaps rendered underneath */}
                {history.loading && !ai.loading ? (
                  <AIThinking tint={activeTheme.accent} />
                ) : validEntries.length > 0 ? (
                  <View style={styles.aiBody}>
                    {validEntries.map((entry, i) => (
                      <RecapCard
                        key={entry.id}
                        entry={entry}
                        now={now}
                        accentColor={activeTheme.accent}
                        onJump={jumpTo}
                        isLast={i === validEntries.length - 1}
                      />
                    ))}
                  </View>
                ) : !ai.loading && ai.error ? (
                  <AIErrorState error={ai.error} onRetry={handleCatchUp} />
                ) : !ai.loading && !serverNote ? (
                  <AIEmptyStory
                    icon="checkmark-done-outline"
                    accent={activeTheme.accent}
                    title={ai.result?.headline || "You're all caught up"}
                    description={ai.result?.summary ||
                      (history.entries.length > 0
                        ? 'Your previous recap expired. Tap Catch Up when new messages arrive.'
                        : 'No new messages to summarize right now.')}
                  />
                ) : null}
              </Section>

              {/* Mentions */}
              <Section
                icon="at"
                iconColor={colors.secondary}
                title="Mentioned You Today"
                delay={STAGGER_MS * 3}
                trailing={
                  recap.mentions.length + privateForMe.length > 0 ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>
                        {recap.mentions.length + privateForMe.length}
                      </Text>
                    </View>
                  ) : undefined
                }
              >
                {/* Private comments on your messages. Visually separated by a
                    lock so it is obvious these were never in the GC. */}
                {privateForMe.map((c) => {
                  const author = members.find((m) => m.id === c.authorId);
                  return (
                    <PressableScale
                      key={c.id}
                      style={styles.mention}
                      scaleTo={0.98}
                      haptic="light"
                      onPress={() =>
                        navigation.navigate('Chat', {
                          groupId,
                          openPrivateCommentMessageId: c.messageId,
                          privateThreadUserId: c.authorId,
                        })
                      }
                      accessibilityLabel={`Private comment from ${author?.displayName ?? 'someone'}. Open thread.`}
                    >
                      <View style={styles.mentionHead}>
                        <Avatar
                          emoji={author?.avatarEmoji}
                          imageUrl={author?.avatarUrl}
                          label={author?.displayName ?? 'Someone'}
                          size={26}
                          ring={false}
                        />
                        <Text style={[styles.mentionName, { color: colors.primary }]}>
                          {author?.displayName ?? 'Someone'}
                        </Text>
                        <View style={styles.privateTag}>
                          <Ionicons name="lock-closed" size={9} color={colors.onSurfaceVariant} />
                          <Text style={styles.privateTagText}>Private</Text>
                        </View>
                      </View>
                      <Text style={styles.mentionText} numberOfLines={3}>
                        commented on your message: "{c.text}"
                      </Text>
                    </PressableScale>
                  );
                })}

                {recap.mentions.length === 0 && privateForMe.length === 0 ? (
                  <AIEmptyStory icon="at" accent={colors.secondary} title="No mentions today" description="When someone tags you or replies privately, you'll find it here." />
                ) : (
                  recap.mentions.map((m) => (
                    <PressableScale
                      key={m.id}
                      style={styles.mention}
                      scaleTo={0.98}
                      haptic="light"
                      onPress={() => handleJumpToChat(m.id)}
                    >
                      <View style={styles.mentionHead}>
                        <Avatar
                          emoji={m.authorEmoji}
                          imageUrl={m.authorAvatarUrl}
                          label={m.authorName}
                          size={26}
                          ring={false}
                          ringColors={[m.authorColor, m.authorColor]}
                        />
                        <Text style={[styles.mentionName, { color: m.authorColor }]}>
                          {m.authorName}
                        </Text>
                        <View style={styles.spacer} />
                        <Text style={styles.mentionTime}>{clockTime(m.createdAt)}</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.outline} />
                      </View>
                      <Text style={styles.mentionText} numberOfLines={3}>
                        {m.text}
                      </Text>
                    </PressableScale>
                  ))
                )}
              </Section>
            </>
          )}

          {/* TAB 2: TEA & RECAPS (Today's Tea & Daily Recaps Archive) */}
          {activeTab === 'tea' && (
            <>
              {/* Today's Tea */}
              <Section
                icon="cafe"
                iconColor={colors.yellow}
                title="Today's Tea"
                aiGenerated
                delay={STAGGER_MS}
                trailing={
                  todaysTea.sessions.length > 0 ? (
                    <View style={[styles.countBadge, { backgroundColor: colors.yellow }]}>
                      <Text style={[styles.countBadgeText, { color: colors.bg }]}>
                        {todaysTea.sessions.length}
                      </Text>
                    </View>
                  ) : undefined
                }
              >
                {todaysTea.loading ? (
                  <AIThinking />
                ) : todaysTea.sessions.length === 0 ? (
                  <AIEmptyStory icon="cafe-outline" accent={colors.yellow} title="The kettle is quiet" description="Tea reports appear here when a session wraps up in your GC." />
                ) : (
                  <View style={styles.dailyList}>
                    {todaysTea.sessions.map((s) => (
                      <SpotlightCard
                        key={s.id}
                        spotlightColor="rgba(245, 158, 11, 0.22)"
                        borderColor="rgba(245, 158, 11, 0.28)"
                        borderRadius={16}
                        onPress={() => setOpenTea(s)}
                        style={styles.teaRow}
                      >
                        <View style={styles.teaRowInner}>
                          <Text style={styles.teaRowEmoji}>
                            {s.status === 'failed' ? '💀' : s.report && s.report.dramaLevel >= 4 ? '🔥' : '🍵'}
                          </Text>
                          <View style={styles.dailyRowCopy}>
                            <Text style={styles.teaRowTitle} numberOfLines={1}>
                              {s.status === 'completed' && s.report
                                ? s.report.title
                                : s.status === 'failed'
                                  ? 'Report failed — tap to retry'
                                  : 'Still brewing...'}
                            </Text>
                            <Text style={styles.dailyRowMeta}>
                              {s.endedAt ? clockTime(s.endedAt) : ''} · Started by {s.startedByName}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                        </View>
                      </SpotlightCard>
                    ))}
                  </View>
                )}
              </Section>

              {/* GC Awards — generated automatically every Sunday, never by
                  opening this screen. This just reads what already exists. */}
              <Section
                icon="trophy"
                iconColor={colors.yellow}
                title="GC Awards"
                aiGenerated
                delay={STAGGER_MS * 1.5}
              >
                {weeklyAwards.loading ? (
                  <AIThinking />
                ) : !weeklyAwards.thisWeek && weeklyAwards.previousWeeks.length === 0 ? (
                  <AIEmptyStory icon="trophy-outline" accent={colors.yellow} title="Ceremony is coming" description="The first awards arrive Sunday at noon, once your GC has enough to celebrate." />
                ) : (
                  <View style={styles.dailyList}>
                    {weeklyAwards.thisWeek && (
                      <WeeklyAwardsRow
                        result={weeklyAwards.thisWeek}
                        isThisWeek
                        onPress={() => setOpenAwards(weeklyAwards.thisWeek)}
                      />
                    )}
                    {weeklyAwards.previousWeeks.map((w) => (
                      <WeeklyAwardsRow
                        key={`${w.weekStart}-${w.weekEnd}`}
                        result={w}
                        isThisWeek={false}
                        onPress={() => setOpenAwards(w)}
                      />
                    ))}
                  </View>
                )}
              </Section>

              {/* Past Daily Recaps */}
              <Section
                icon="calendar"
                iconColor={colors.tertiary}
                title="Recaps Archive"
                delay={STAGGER_MS * 2}
              >
                {dailyHistory.loading ? (
                  <AIThinking />
                ) : dailyHistory.entries.length === 0 ? (
                  <AIEmptyStory icon="calendar-outline" accent={colors.tertiary} title="No recaps yet" description="Your daily stories will collect here as the group makes memories." />
                ) : (
                  <View style={styles.dailyList}>
                    {dailyHistory.entries.map((entry) => (
                      <DailyRecapRow
                        key={entry.date}
                        entry={entry}
                        onPress={() => setOpenDailyRecap(entry)}
                      />
                    ))}
                  </View>
                )}
              </Section>
            </>
          )}

          {/* TAB 3: PULSE & 11:11 (Stats & Missed 11:11 Wall) */}
          {activeTab === 'names' && (
            <Section
              icon="pricetag"
              iconColor={colors.secondary}
              title="GC Names"
              delay={STAGGER_MS}
              aiGenerated
            >
              {dailyNames.generating || (dailyNames.loading && !dailyNames.result) ? (
                <AIThinking tint={activeTheme.accent} />
              ) : dailyNames.error ? (
                <AIErrorState error={dailyNames.error} onRetry={dailyNames.retry} />
              ) : dailyNames.result && dailyNames.result.names.length > 0 ? (
                <View style={styles.namesBody}>
                  <Text style={styles.namesHeadline}>{dailyNames.result.headline}</Text>
                  {dailyNames.result.names.map((n) => {
                    const member = members.find((m) => m.id === n.userId);
                    return (
                      <PressableScale
                        key={n.userId}
                        scaleTo={n.sourceMessageIds.length ? 0.99 : 1}
                        haptic="light"
                        style={[styles.nameRow, !n.spoke && styles.nameRowQuiet]}
                        // The citation is what makes a name checkable rather
                        // than something the app just asserts about someone.
                        // A ghost has nothing to cite, so it isn't tappable.
                        disabled={!n.sourceMessageIds.length}
                        onPress={() => n.sourceMessageIds[0] && jumpTo(n.sourceMessageIds[0])}
                        accessibilityLabel={`${member?.displayName ?? 'Member'} is ${n.name}. ${n.reason}`}
                      >
                        <Avatar
                          emoji={member?.avatarEmoji ?? undefined}
                          imageUrl={member?.avatarUrl}
                          label={member?.displayName}
                          size={40}
                          ringColors={[activeTheme.accent, colors.secondary]}
                        />
                        <View style={styles.nameCopy}>
                          <Text style={styles.nameTitle}>
                            {n.emoji} {n.name}
                          </Text>
                          <Text style={styles.nameWho}>
                            {member?.displayName ?? 'Someone'}
                          </Text>
                          {!!n.reason && (
                            <Text style={styles.nameReason}>
                              {n.reason}
                            </Text>
                          )}
                        </View>
                        {n.sourceMessageIds.length > 0 && (
                          <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
                        )}
                      </PressableScale>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyRecapWrap}>
                  <Text style={styles.emptyRecapHeadline}>
                    {dailyNames.result?.headline || 'Too quiet to name anyone today.'}
                  </Text>
                  <Text style={styles.emptyMentions}>
                    Names are set once a day from the previous day's chat.
                  </Text>
                </View>
              )}
            </Section>
          )}

          {activeTab === 'pulse' && (
            <>
              {/* Stats */}
              <Section
                icon="stats-chart"
                iconColor={colors.primary}
                title="Group Stats"
                delay={STAGGER_MS}
              >
                <StatRow
                  label="TOTAL HYPE"
                  value={loading ? '—' : String(recap.totalToday)}
                  meta="messages in the last 24h"
                />
                <StatRow
                  label="TOP VIBE SETTER"
                  value={recap.topSender ? recap.topSender.name : '—'}
                  meta={
                    recap.topSender
                      ? `${recap.topSender.count} message${recap.topSender.count === 1 ? '' : 's'}`
                      : 'nobody spoke'
                  }
                />
                <StatRow
                  label="PEAK CHAOS"
                  value={recap.peakHour ? recap.peakHour.label : '—'}
                  meta={
                    recap.peakHour
                      ? `${recap.peakHour.count} message${recap.peakHour.count === 1 ? '' : 's'} that hour`
                      : 'no peak'
                  }
                />
              </Section>

              {/* 11:11 roll call */}
              <Section
                icon="sparkles-outline"
                iconColor={colors.yellow}
                title="11:11 roll call"
                delay={STAGGER_MS * 2}
                onLayout={(e) => {
                  elevenElevenYRef.current = e.nativeEvent.layout.y;
                }}
                highlighted={highlight1111}
              >
                <View style={styles.missedOverview}>
                  <View style={styles.missedOverviewIcon}>
                    <Ionicons name="moon-outline" size={19} color={colors.yellow} />
                  </View>
                  <View style={styles.missedOverviewCopy}>
                    <Text style={styles.missedOverviewEyebrow}>TODAY'S WISH WINDOW</Text>
                    <Text style={styles.missedOverviewTitle}>
                      {loading
                        ? 'Checking the group…'
                        : recap.missedElevenEleven.length === 0
                          ? 'No misses on the board'
                          : `${recap.missedElevenEleven.length} ${recap.missedElevenEleven.length === 1 ? 'person' : 'people'} missed it`}
                    </Text>
                  </View>
                  <Text style={styles.missedOverviewTime}>11:11</Text>
                </View>
                {recap.missedElevenEleven.length > 0 && (
                  <View style={styles.missedList}>
                    {recap.missedElevenEleven.map((item, index) => (
                      <View key={item.id} style={[styles.missedRow, index > 0 && styles.missedRowDivider]}>
                        <View style={styles.missedHead}>
                          <Avatar
                            emoji={item.authorEmoji}
                            imageUrl={item.authorAvatarUrl}
                            label={item.authorName}
                            size={38}
                            ring={false}
                            ringColors={[item.authorColor, item.authorColor]}
                          />
                          <View style={styles.missedAuthorInfo}>
                            <Text style={styles.missedName} numberOfLines={1}>{item.authorName}</Text>
                            <Text style={styles.missedSubtitle}>
                              {item.status === 'yapping' ? `Active at ${item.timeLabel}` : 'No wish found today'}
                            </Text>
                          </View>
                          <View style={[styles.missedStatus, item.status === 'yapping' && styles.missedStatusChatting]}>
                            <Ionicons
                              name={item.status === 'yapping' ? 'chatbubble-outline' : 'moon-outline'}
                              size={12}
                              color={item.status === 'yapping' ? colors.yellow : colors.onSurfaceVariant}
                            />
                            <Text style={[styles.missedStatusText, item.status === 'yapping' && styles.missedStatusTextChatting]}>
                              {item.status === 'yapping' ? 'Chatting' : 'No wish'}
                            </Text>
                          </View>
                        </View>
                        {item.status === 'yapping' && !!item.text && (
                          <View style={styles.missedQuoteBox}>
                            <View style={styles.missedQuoteRule} />
                            <Text style={styles.missedMessageText} numberOfLines={2}>
                              {item.text}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.missedRoast}>{item.roast}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Section>
            </>
          )}

          {/* Jump to Chat CTA */}
          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 3.5)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.ctaWrap}
          >
            <GCButton
              label="Jump to Chat"
              variant="gradient"
              icon={<Ionicons name="chatbubble" size={18} color="#FFFFFF" />}
              onPress={() => handleJumpToChat()}
            />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <TeaReportModal
        visible={openTea !== null}
        session={openTea}
        onClose={() => setOpenTea(null)}
        onJumpToMessage={(messageId) => {
          setOpenTea(null);
          handleJumpToChat(messageId);
        }}
        // Retrying from here has no live session hook; the chat screen owns
        // that. Send them there rather than silently doing nothing.
        onRetry={() => {
          setOpenTea(null);
          handleJumpToChat();
        }}
      />

      <GCAwardsModal
        visible={openAwards !== null}
        result={openAwards}
        onClose={() => setOpenAwards(null)}
        onJumpToMessage={(messageId) => {
          setOpenAwards(null);
          handleJumpToChat(messageId);
        }}
      />

      <DailyRecapModal
        visible={openDailyRecap !== null}
        recap={openDailyRecap}
        groupId={groupId}
        themeGradient={activeTheme.colors}
        onClose={() => setOpenDailyRecap(null)}
        onJumpToMessage={(messageId) => {
          setOpenDailyRecap(null);
          handleJumpToChat(messageId);
        }}
        onOpenWordy={() => {
          setOpenDailyRecap(null);
          navigation.navigate('Wordy', { groupId });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  safe: { flex: 1 },
  modernTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  topBackCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  topBarCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  topBarGroupName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  topBarStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  topLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topBarStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroCard: {
    marginBottom: spacing.xs,
    width: '100%',
  },
  heroInner: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroBadgeCol: {
    gap: 4,
  },
  heroShimmerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitleWrap: {
    gap: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 20,
  },
  bentoStatsGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  vibeCardInner: {
    padding: spacing.lg,
    gap: 6,
  },
  moodPulseOrb: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 'auto',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  teaRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    width: '100%',
  },
  awardsRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    width: '100%',
  },
  dailyRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    width: '100%',
  },
  highlightInner: {
    padding: spacing.md,
    gap: 6,
  },
  recapInner: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  highlightsStack: {
    gap: spacing.sm,
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: colors.appRoot,
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginHorizontal: CONTAINER_MARGIN,
    borderBottomWidth: 1,
    borderColor: colors.borderBright,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // 44pt minimum, less the 3px padding on the track either side.
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 3,
    borderRadius: radius.md,
    gap: 4,
  },
  tabActive: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 0,
  },
  tabText: {
    ...typography.label,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: colors.onSurface,
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: colors.primary,
  },
  tabBadgeText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  scroll: {
    padding: CONTAINER_MARGIN,
    paddingTop: spacing.lg,
    paddingBottom: spacing.section + 40,
    gap: spacing.lg,
    // Prose-heavy screen: capped and centred so paragraphs stay near the
    // 65-75 character measure instead of running the full width of a tablet
    // or the desktop shell's pane.
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  heroFacts: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroFact: { flex: 1, gap: 2 },
  heroFactValue: { fontSize: 21, fontWeight: '800', color: colors.onSurface, lineHeight: 25 },
  heroFactLabel: { ...typography.micro, fontSize: 9, letterSpacing: 0.8, color: colors.onSurfaceVariant },
  heroFactDivider: { width: 1, height: 29, backgroundColor: colors.borderBright },
  moodDot: { width: 7, height: 7, borderRadius: 4 },
  vibeCard: {
    padding: spacing.xl,
    alignItems: 'flex-start',
    gap: 5,
    borderWidth: 1,
    overflow: 'hidden',
  },
  vibeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  vibeLabel: { ...typography.label, fontSize: 11, letterSpacing: 1 },
  vibePill: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  vibeValue: {
    ...typography.headline,
    fontSize: 27,
    lineHeight: 33,
    color: colors.onSurface,
    fontWeight: '800',
    textAlign: 'left',
  },
  vibeDetail: { ...typography.caption, color: colors.onSurfaceVariant, textAlign: 'left', lineHeight: 20 },
  card: { padding: spacing.xl, backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIcon: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typography.title, fontSize: 19, color: colors.onSurface },
  spacer: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.borderBright, marginVertical: spacing.lg },
  aiBody: { gap: spacing.lg },
  aiChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginLeft: 2,
  },
  aiChipText: { ...typography.micro, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  recapCard: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  recapCardLast: { paddingBottom: 0, borderBottomWidth: 0 },
  recapCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  recapTime: { ...typography.micro, color: colors.textMuted, paddingTop: 4 },
  aiHeadline: { ...typography.title, fontSize: 20, color: colors.onSurface, flex: 1 },
  aiSummary: { ...typography.body, color: colors.onSurfaceVariant, lineHeight: 21 },
  highlight: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  highlightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  highlightEmoji: { fontSize: 15 },
  highlightTitle: { ...typography.label, fontSize: 12, flex: 1 },
  highlightBody: { ...typography.body, color: colors.onSurface, lineHeight: 20 },
  viewMessage: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  viewMessageText: { ...typography.label, fontSize: 11 },
  aiFootnote: { ...typography.micro, color: colors.textMuted, fontStyle: 'italic' },
  dailyList: {
    gap: spacing.sm,
    width: '100%',
  },
  dailyRow: {
    width: '100%',
  },
  dailyRowDate: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  dailyRowDateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  dailyRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  dailyRowWord: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  dailyRowMeta: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '500',
  },
  teaRow: {
    width: '100%',
  },
  teaRowEmoji: { fontSize: 22 },
  teaRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  awardsRow: {
    width: '100%',
  },
  awardsRowEmoji: { fontSize: 22 },
  awardsRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  statRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderBright,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: 2,
  },
  statLabel: { ...typography.label, color: colors.secondary },
  statValue: { ...typography.title, fontSize: 24, color: colors.onSurface },
  statMeta: { ...typography.micro, color: colors.textMuted },
  countBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: { ...typography.label, color: colors.onSecondary },
  privateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  privateTagText: { ...typography.micro, fontSize: 9.5, color: colors.onSurfaceVariant },
  emptyMentions: { ...typography.body, color: colors.textMuted },
  // Sits above the recap stack, so it needs its own edges rather than relying
  // on the empty state's padding.
  serverNote: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 2,
  },
  // The roast's punchline, so it lands as a line rather than as filler text.
  emptyRecapHeadline: {
    ...typography.titleMd,
    fontSize: 17,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  mention: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderBright,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  mentionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mentionName: { ...typography.label, fontSize: 13 },
  mentionTime: { ...typography.micro, color: colors.textMuted },
  mentionText: { ...typography.body, color: colors.onSurfaceVariant },
  missedOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(233, 189, 105, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233, 189, 105, 0.15)',
  },
  missedOverviewIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(233, 189, 105, 0.12)',
  },
  missedOverviewCopy: { flex: 1, minWidth: 0, gap: 3 },
  missedOverviewEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: colors.yellow },
  missedOverviewTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  missedOverviewTime: { fontSize: 16, fontWeight: '800', color: colors.yellow, letterSpacing: -0.5 },
  missedList: { marginTop: spacing.xs },
  missedRow: { paddingVertical: spacing.md, gap: spacing.sm },
  missedRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  missedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  missedAuthorInfo: { flex: 1, minWidth: 0, gap: 3 },
  missedName: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  missedSubtitle: { fontSize: 11, color: colors.textMuted },
  missedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
  },
  missedStatusChatting: { backgroundColor: 'rgba(233, 189, 105, 0.10)' },
  missedStatusText: { fontSize: 10, fontWeight: '700', color: colors.onSurfaceVariant },
  missedStatusTextChatting: { color: colors.yellow },
  missedQuoteBox: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginLeft: 46 },
  missedQuoteRule: { width: 2, borderRadius: 2, backgroundColor: 'rgba(233, 189, 105, 0.6)' },
  missedMessageText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.onSurfaceVariant },
  missedRoast: { marginLeft: 46, fontSize: 12, lineHeight: 17, fontWeight: '600', color: colors.yellow },
  roastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.25)',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  roastText: {
    ...typography.micro,
    fontSize: 11.5,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  recapHeadInfo: { flex: 1, gap: 4 },
  recapMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  recapTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.28)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  recapTimerText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#818CF8',
  },
  recapTimerUrgent: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.32)',
  },
  recapTimerUrgentText: {
    color: '#F87171',
  },
  recapTimerExpired: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  recapTimerExpiredText: {
    color: colors.outline,
    fontWeight: '500',
  },
  catchUpHeaderBtnWrap: {
    borderRadius: radius.pill,
  },
  catchUpHeaderBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  catchUpHeaderBtnText: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  newCatchUpLoadingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  newCatchUpLoadingText: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  emptyRecapWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  emptyCatchUpBtnWrap: {
    marginTop: spacing.xs,
    borderRadius: radius.pill,
  },
  emptyCatchUpBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  emptyCatchUpBtnText: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  namesBody: { gap: spacing.sm },
  namesHeadline: {
    ...typography.bodyMedium,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderBright,
  },
  nameRowQuiet: { backgroundColor: 'rgba(255, 255, 255, 0.02)', opacity: 0.75 },
  nameCopy: { flex: 1, gap: 4 },
  nameTitle: { ...typography.subheading, color: colors.onSurface, lineHeight: 21 },
  nameWho: { ...typography.micro, color: colors.onSurfaceVariant, marginTop: 1 },
  nameReason: { ...typography.micro, color: colors.onSurfaceVariant, lineHeight: 17, marginTop: 2 },
  ctaWrap: { marginTop: spacing.sm },
});
