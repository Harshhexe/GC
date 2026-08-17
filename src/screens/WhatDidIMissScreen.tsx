import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
import { groupTheme, GroupTheme } from '../theme/groupThemes';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton } from '../components/ui/Buttons';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { useMessages } from '../hooks/useMessages';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { useGroupRecap } from '../hooks/useGroupRecap';
import { useWhatDidIMiss } from '../hooks/useWhatDidIMiss';
import { useMissedRecapHistory, type MissedRecapEntry } from '../hooks/useMissedRecapHistory';
import { useDailyRecapHistory } from '../hooks/useDailyRecapHistory';
import { useTodaysTea } from '../hooks/useTodaysTea';
import { TeaReportModal } from '../components/TeaReportModal';
import type { TeaSession } from '../hooks/useTeaSession';
import { useWeeklyAwards } from '../hooks/useWeeklyAwards';
import { GCAwardsModal } from '../components/GCAwardsModal';
import type { WeeklyAwardsResult } from '../lib/ai';
import { AIThinking, AIErrorState } from '../components/ui/AIState';
import { DailyRecapModal } from '../components/DailyRecapModal';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clockTime, timeAgo } from '../utils/time';
import type { MissedCategory, MissedHighlight, DailyRecapResult } from '../lib/ai';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WhatDidIMiss'>;
type MissedTab = 'missed' | 'tea' | 'pulse';

const TABS: { id: MissedTab; label: string }[] = [
  { id: 'missed', label: 'Missed' },
  { id: 'tea', label: 'Tea' },
  { id: 'pulse', label: 'Stats' },
];

/**
 * Atmospheric glowing background tailored to the group's theme palette.
 * Features a deep dark base, smooth diffused ambient gradients (zero blob artifacts on Android).
 */
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
        colors={[`${c1}2E`, `${c2}18`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.topSpotlight}
      />

      {/* Top-Left Ambient Diffused Wash */}
      <LinearGradient
        colors={[`${c1}20`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top-Right Ambient Diffused Wash */}
      <LinearGradient
        colors={[`${accent}1A`, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Center Subtle Atmosphere */}
      <LinearGradient
        colors={['transparent', `${c2}10`, 'transparent']}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Sheen & Subtle Dark Vignette */}
      <LinearGradient
        colors={[`${c1}14`, 'transparent', 'rgba(5, 5, 8, 0.5)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  delay: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  highlighted?: boolean;
}) {
  return (
    <Animated.View
      onLayout={onLayout}
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      <GlassPanel
        borderRadius={radius.lg}
        style={[
          styles.card,
          highlighted && {
            borderColor: colors.yellow,
            borderWidth: 1.5,
            shadowColor: colors.yellow,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <Ionicons name={icon} size={18} color={iconColor} />
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={styles.spacer} />
          {trailing}
        </View>
        <View style={styles.divider} />
        {children}
      </GlassPanel>
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
  // The server drops any highlight whose citations didn't survive validation,
  // so a card on screen always has at least one real message to jump to.
  const target = highlight.messageIds[0];

  return (
    <View style={[styles.highlight, { borderColor: `${style.color}44` }]}>
      <View style={styles.highlightHead}>
        <Text style={styles.highlightEmoji}>{style.emoji}</Text>
        <Text style={[styles.highlightTitle, { color: style.color }]}>
          {highlight.title.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.highlightBody}>{highlight.summary}</Text>
      {!!target && (
        <PressableScale
          style={styles.viewMessage}
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
    <View style={[styles.recapCard, isLast && styles.recapCardLast]}>
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

      {entry.highlights.map((h, i) => (
        <HighlightCard key={`${entry.id}-${h.category}-${i}`} highlight={h} onJump={onJump} />
      ))}

      {/* Said out loud rather than hidden — a recap of part of a range
          shouldn't look like a recap of all of it. */}
      {entry.truncated && (
        <Text style={styles.aiFootnote}>
          You missed more than this — showing the most recent {entry.messageCount} messages.
        </Text>
      )}
    </View>
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
    <PressableScale style={styles.dailyRow} scaleTo={0.98} haptic="light" onPress={onPress}>
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
    </PressableScale>
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
    <PressableScale style={styles.awardsRow} scaleTo={0.98} haptic="light" onPress={onPress}>
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
              : // GC's own headline for the week beats a generic "top award"
                // line — it's the thing the AI actually wants said about the week.
                result.title ||
                (topAward
                  ? `${topAward.emoji} ${topAward.title}: ${topAward.userName}`
                  : 'Not enough activity for awards')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.outline} />
    </PressableScale>
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

  const activeTheme = groupTheme(groupThemeKey);

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
      const state = navigation.getState();
      const previousRoute = state.routes[state.routes.length - 2];
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
        <AppHeader
          wordmark
          subtitle={groupName}
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
          right={<Avatar emoji={profile?.avatar_emoji} imageUrl={profile?.avatar_url} label={profile?.display_name} size={36} />}
        />

        {/* Compact Hero */}
        <Animated.View
          entering={FadeInDown.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>What I Missed</Text>
          <Text style={styles.heroSub}>
            Recap of the chaos while you were AFK.
          </Text>
        </Animated.View>

        {/* Segmented Control Track */}
        <View style={styles.tabTrack}>
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            let badgeCount: string | undefined;
            if (t.id === 'missed' && recap.mentions.length > 0) {
              badgeCount = String(recap.mentions.length);
            } else if (t.id === 'tea' && todaysTea.sessions.length > 0) {
              badgeCount = String(todaysTea.sessions.length);
            } else if (t.id === 'pulse' && recap.missedElevenEleven.length > 0) {
              badgeCount = String(recap.missedElevenEleven.length);
            }

            return (
              <PressableScale
                key={t.id}
                scaleTo={0.97}
                haptic="light"
                onPress={() => handleTabChange(t.id)}
                style={[styles.tab, isActive && styles.tabActive]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {t.label}
                </Text>
                {!!badgeCount && (
                  <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                      {badgeCount}
                    </Text>
                  </View>
                )}
              </PressableScale>
            );
          })}
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* TAB 1: MISSED (Vibe, AI Highlights & Mentions) */}
          {activeTab === 'missed' && (
            <>
              {/* Vibe check */}
              <Animated.View
                entering={FadeInDown.delay(STAGGER_MS)
                  .duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <GlassPanel borderRadius={radius.lg} style={styles.vibeCard}>
                  <Text style={styles.vibeLabel}>DAILY VIBE CHECK</Text>
                  <View style={styles.vibePill}>
                    <Text style={styles.vibeValue}>{recap.vibe.label}</Text>
                  </View>
                  <Text style={styles.vibeDetail}>{recap.vibe.detail}</Text>
                </GlassPanel>
              </Animated.View>

              {/* The recap stack */}
              <Section
                icon="sparkles"
                iconColor={activeTheme.accent}
                title="What You Missed"
                delay={STAGGER_MS * 2}
                trailing={
                  <PressableScale
                    style={styles.catchUpHeaderBtnWrap}
                    scaleTo={0.92}
                    haptic="medium"
                    onPress={handleCatchUp}
                    disabled={ai.loading}
                  >
                    <LinearGradient
                      colors={
                        ai.loading
                          ? ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']
                          : activeTheme.colors
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.catchUpHeaderBtnGradient,
                        !ai.loading && {
                          borderColor: glass.strokeBright,
                        },
                      ]}
                    >
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
                    </LinearGradient>
                  </PressableScale>
                }
              >
                {/* 1. If catching up / regenerating, new loading card appears on TOP */}
                {ai.loading && (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={[styles.newCatchUpLoadingCard, { borderColor: `${activeTheme.accent}40` }]}
                  >
                    <AIThinking tint={activeTheme.accent} />
                    <Text style={styles.newCatchUpLoadingText}>
                      Catching up on latest messages & drama...
                    </Text>
                  </Animated.View>
                )}

                {/* 2. The current answer, above the stack and outside the
                    branch chain below — with unexpired recaps on screen the
                    chain would otherwise pick the stack and never show it. */}
                {serverNote && (
                  <Animated.View
                    entering={FadeInDown.duration(300).reduceMotion(reduceMotion)}
                    style={styles.serverNote}
                  >
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
                ) : !ai.loading ? (
                  !serverNote ? (
                    <View style={styles.emptyRecapWrap}>
                      <Text style={styles.emptyMentions}>
                        {history.entries.length > 0
                          ? 'Previous recap expired (10m limit). Tap Catch Up above to generate a fresh one! ✨'
                          : "Nothing missed yet. Tap Catch Up above to see what's new! ✨"}
                      </Text>
                    </View>
                  ) : null
                ) : null}
              </Section>

              {/* Mentions */}
              <Section
                icon="at"
                iconColor={colors.secondary}
                title="Mentioned You Today"
                delay={STAGGER_MS * 3}
                trailing={
                  recap.mentions.length > 0 ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{recap.mentions.length}</Text>
                    </View>
                  ) : undefined
                }
              >
                {recap.mentions.length === 0 ? (
                  <Text style={styles.emptyMentions}>
                    Nobody @'d you today. Free of obligations, free of relevance.
                  </Text>
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
                  <Text style={styles.emptyMentions}>
                    Nothing has happened yet... unfortunately. 😔
                  </Text>
                ) : (
                  <View style={styles.dailyList}>
                    {todaysTea.sessions.map((s) => (
                      <PressableScale
                        key={s.id}
                        style={styles.teaRow}
                        scaleTo={0.98}
                        haptic="light"
                        onPress={() => setOpenTea(s)}
                      >
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
                      </PressableScale>
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
                delay={STAGGER_MS * 1.5}
              >
                {weeklyAwards.loading ? (
                  <AIThinking />
                ) : !weeklyAwards.thisWeek && weeklyAwards.previousWeeks.length === 0 ? (
                  <Text style={styles.emptyMentions}>
                    First awards land this Sunday at noon. Behave until then. 🏆
                  </Text>
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
                  <Text style={styles.emptyMentions}>
                    No daily recaps yet — check back after the day's first one lands.
                  </Text>
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

              {/* Who Missed 11:11 */}
              <Section
                icon="alarm-outline"
                iconColor={colors.yellow}
                title="Who Missed 11:11 Today"
                delay={STAGGER_MS * 2}
                onLayout={(e) => {
                  elevenElevenYRef.current = e.nativeEvent.layout.y;
                }}
                highlighted={highlight1111}
                trailing={
                  recap.missedElevenEleven.length > 0 ? (
                    <View style={[styles.countBadge, { backgroundColor: colors.yellow }]}>
                      <Text style={[styles.countBadgeText, { color: colors.bg }]}>
                        {recap.missedElevenEleven.length}
                      </Text>
                    </View>
                  ) : undefined
                }
              >
                {recap.missedElevenEleven.length === 0 ? (
                  <Text style={styles.emptyMentions}>
                    Everyone made a wish at 11:11 today! ✨ Pure perfection.
                  </Text>
                ) : (
                  recap.missedElevenEleven.map((item) => (
                    <View key={item.id} style={styles.missedCard}>
                      <View style={styles.missedHead}>
                        <Avatar
                          emoji={item.authorEmoji}
                          imageUrl={item.authorAvatarUrl}
                          label={item.authorName}
                          size={32}
                          ring={false}
                          ringColors={[item.authorColor, item.authorColor]}
                        />
                        <View style={styles.missedAuthorInfo}>
                          <Text style={[styles.mentionName, { color: item.authorColor }]}>
                            {item.authorName}
                          </Text>
                          <Text style={styles.missedSubtitle}>
                            {item.status === 'yapping'
                              ? `Too busy typing at ${item.timeLabel} today`
                              : `Didn't make a wish today 💤`}
                          </Text>
                        </View>
                        <View style={styles.spacer} />
                        <View
                          style={[
                            styles.timeTag,
                            item.status === 'silent' && {
                              backgroundColor: 'rgba(255, 107, 107, 0.15)',
                              borderColor: 'rgba(255, 107, 107, 0.35)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.timeTagText,
                              item.status === 'silent' && { color: '#FF6B6B' },
                            ]}
                          >
                            {item.status === 'yapping' ? item.timeLabel : 'MISSED'}
                          </Text>
                        </View>
                      </View>
                      {item.status === 'yapping' && !!item.text && (
                        <View style={styles.missedQuoteBox}>
                          <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.yellow} />
                          <Text style={styles.missedMessageText} numberOfLines={2}>
                            "{item.text}"
                          </Text>
                        </View>
                      )}
                      <View style={styles.roastBox}>
                        <Ionicons name="flame" size={13} color="#FF6B6B" />
                        <Text style={styles.roastText}>{item.roast}</Text>
                      </View>
                    </View>
                  ))
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
  root: { flex: 1, backgroundColor: '#07060B' },
  glowBgRoot: {
    backgroundColor: '#07060B',
    overflow: 'hidden',
  },
  topSpotlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
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
    width: 270,
    height: 270,
    opacity: 0.75,
  },
  blobTopRight: {
    top: -50,
    right: -50,
    width: 260,
    height: 260,
    opacity: 0.7,
  },
  blobBottomLeft: {
    bottom: -60,
    left: -50,
    width: 270,
    height: 270,
    opacity: 0.65,
  },
  blobBottomRight: {
    bottom: -70,
    right: -60,
    width: 290,
    height: 290,
    opacity: 0.7,
  },
  blobCenter: {
    top: '35%',
    left: '20%',
    width: 250,
    height: 250,
    opacity: 0.55,
  },
  safe: { flex: 1 },
  hero: { alignItems: 'center', gap: 4, paddingVertical: spacing.sm, paddingHorizontal: CONTAINER_MARGIN },
  heroTitle: {
    ...typography.title,
    fontSize: 24,
    color: colors.onSurface,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSub: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.pill,
    padding: 3,
    marginHorizontal: CONTAINER_MARGIN,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    gap: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tabText: {
    ...typography.label,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: '#FFFFFF',
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
  scroll: { padding: CONTAINER_MARGIN, paddingTop: spacing.xs, paddingBottom: spacing.section + 40, gap: spacing.lg },
  vibeCard: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  vibeLabel: { ...typography.label, fontSize: 11, color: colors.tertiary, letterSpacing: 1 },
  vibePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
  },
  vibeValue: { ...typography.titleMd, fontSize: 17, color: colors.onSurface, textAlign: 'center' },
  vibeDetail: { ...typography.micro, color: colors.outline, textAlign: 'center' },
  card: { padding: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.title, fontSize: 18, color: colors.onSurface },
  spacer: { flex: 1 },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.06)', marginVertical: spacing.md },
  aiBody: { gap: spacing.lg },
  recapCard: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  recapCardLast: { paddingBottom: 0, borderBottomWidth: 0 },
  recapCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  recapTime: { ...typography.micro, color: colors.outline, paddingTop: 4 },
  aiHeadline: { ...typography.title, fontSize: 20, color: colors.onSurface, flex: 1 },
  aiSummary: { ...typography.body, color: colors.onSurfaceVariant, lineHeight: 21 },
  highlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  highlightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  highlightEmoji: { fontSize: 15 },
  highlightTitle: { ...typography.label, fontSize: 12, flex: 1 },
  highlightBody: { ...typography.body, color: colors.onSurface, lineHeight: 20 },
  viewMessage: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  viewMessageText: { ...typography.label, fontSize: 11 },
  aiFootnote: { ...typography.micro, color: colors.outline, fontStyle: 'italic' },
  dailyList: { gap: spacing.sm },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: spacing.md,
  },
  dailyRowDate: {
    backgroundColor: `${colors.tertiary}1A`,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${colors.tertiary}33`,
  },
  dailyRowDateText: { ...typography.label, fontSize: 11, color: colors.tertiary },
  dailyRowCopy: { flex: 1, gap: 1 },
  dailyRowWord: { ...typography.bodyMedium, color: colors.onSurface, textTransform: 'lowercase' },
  dailyRowMeta: { ...typography.micro, color: colors.onSurfaceVariant },
  teaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.18)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  teaRowEmoji: { fontSize: 20 },
  teaRowTitle: { ...typography.bodyMedium, color: colors.onSurface },
  awardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.18)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  awardsRowEmoji: { fontSize: 20 },
  awardsRowTitle: { ...typography.bodyMedium, color: colors.onSurface },
  statRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 2,
  },
  statLabel: { ...typography.label, color: colors.secondary },
  statValue: { ...typography.title, fontSize: 24, color: colors.onSurface },
  statMeta: { ...typography.micro, color: colors.outline },
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
  emptyMentions: { ...typography.body, color: colors.outline },
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  mentionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mentionName: { ...typography.label, fontSize: 13 },
  mentionTime: { ...typography.micro, color: colors.outline },
  mentionText: { ...typography.body, color: colors.onSurfaceVariant },
  missedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
  },
  missedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  missedAuthorInfo: { flex: 1, gap: 1 },
  missedSubtitle: { ...typography.micro, fontSize: 11, color: colors.onSurfaceVariant },
  timeTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  timeTagText: { ...typography.label, fontSize: 10.5, color: colors.yellow },
  missedQuoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 10,
    borderRadius: radius.sm,
  },
  missedMessageText: {
    ...typography.body,
    fontSize: 13,
    color: colors.onSurface,
    fontStyle: 'italic',
    flex: 1,
  },
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
  ctaWrap: { marginTop: spacing.sm },
});
