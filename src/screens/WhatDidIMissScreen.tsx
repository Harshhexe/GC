import { ReactNode, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { AmbientBackground } from '../components/ui/AmbientBackground';
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
import { AIThinking, AIErrorState } from '../components/ui/AIState';
import { DailyRecapModal } from '../components/DailyRecapModal';
import { useAuth } from '../context/AuthContext';
import { clockTime, timeAgo } from '../utils/time';
import type { MissedCategory, MissedHighlight, DailyRecapResult } from '../lib/ai';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WhatDidIMiss'>;

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

function RecapCard({
  entry,
  onJump,
  isLast,
}: {
  entry: MissedRecapEntry;
  onJump: (messageId: string) => void;
  isLast: boolean;
}) {
  return (
    <View style={[styles.recapCard, isLast && styles.recapCardLast]}>
      <View style={styles.recapCardHead}>
        <Text style={styles.aiHeadline}>{entry.headline}</Text>
        <Text style={styles.recapTime}>{timeAgo(entry.createdAt)}</Text>
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
  const [openDailyRecap, setOpenDailyRecap] = useState<DailyRecapResult | null>(null);
  const ai = useWhatDidIMiss(groupId);

  const scrollRef = useRef<ScrollView>(null);
  const elevenElevenYRef = useRef<number | null>(null);
  const [highlight1111, setHighlight1111] = useState(focusSection === 'missedElevenEleven');

  useEffect(() => {
    if (focusSection === 'missedElevenEleven') {
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

  const jumpTo = (messageId: string) =>
    navigation.navigate('Chat', { groupId, jumpToMessageId: messageId });

  return (
    <View style={styles.root}>
      <AmbientBackground variant="vivid" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          wordmark
          subtitle={groupName}
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
          right={<Avatar emoji={profile?.avatar_emoji} imageUrl={profile?.avatar_url} label={profile?.display_name} size={36} />}
        />

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View
            entering={FadeInDown.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.hero}
          >
            <Text style={styles.heroTitle}>What I{'\n'}Missed</Text>
            <Text style={styles.heroSub}>
              Here's the recap of the chaos while you were AFK.
            </Text>
          </Animated.View>

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

          {/* The recap stack — every distinct thing you've missed today,
              newest first. Old cards never disappear just because a new one
              showed up; they age out after 24h on the server. */}
          <Section
            icon="sparkles"
            iconColor={colors.primary}
            title="What You Missed"
            delay={STAGGER_MS * 2}
            trailing={
              // A quiet "checking" pulse rather than the full thinking state —
              // there's already content on screen, this shouldn't feel like a
              // reload of it.
              ai.loading ? <Ionicons name="sync" size={14} color={colors.outline} /> : undefined
            }
          >
            {history.loading ? (
              <AIThinking />
            ) : history.entries.length > 0 ? (
              <View style={styles.aiBody}>
                {history.entries.map((entry, i) => (
                  <RecapCard
                    key={entry.id}
                    entry={entry}
                    onJump={jumpTo}
                    isLast={i === history.entries.length - 1}
                  />
                ))}
              </View>
            ) : ai.loading ? (
              <AIThinking />
            ) : ai.error ? (
              <AIErrorState error={ai.error} onRetry={ai.retry} />
            ) : (
              <Text style={styles.emptyMentions}>
                Nothing missed in the last 24h. You're all caught up.
              </Text>
            )}
          </Section>

          {/* Every day this group has had a recap for, not just today's —
              the chat-feed card disappears after an hour, this is where a
              day's recap lives permanently. */}
          <Section
            icon="calendar"
            iconColor={colors.tertiary}
            title="Recaps"
            delay={STAGGER_MS * 2.5}
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

          {/* Stats */}
          <Section
            icon="stats-chart"
            iconColor={colors.primary}
            title="Group Stats"
            delay={STAGGER_MS * 3}
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

          {/* Mentions */}
          <Section
            icon="at"
            iconColor={colors.secondary}
            title="Mentioned You Today"
            delay={STAGGER_MS * 4}
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
                  onPress={() => navigation.navigate('Chat', { groupId, jumpToMessageId: m.id })}
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

          {/* Who Missed 11:11 */}
          <Section
            icon="alarm-outline"
            iconColor={colors.yellow}
            title="Who Missed 11:11 Today"
            delay={STAGGER_MS * 4.5}
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

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 5.5)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.ctaWrap}
          >
            <GCButton
              label="Jump to Chat"
              variant="gradient"
              icon={<Ionicons name="chatbubble" size={18} color="#FFFFFF" />}
              onPress={() => navigation.navigate('Chat', { groupId })}
            />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <DailyRecapModal
        visible={openDailyRecap !== null}
        recap={openDailyRecap}
        onClose={() => setOpenDailyRecap(null)}
        onJumpToMessage={(messageId) => {
          setOpenDailyRecap(null);
          navigation.navigate('Chat', { groupId, jumpToMessageId: messageId });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { padding: CONTAINER_MARGIN, paddingBottom: spacing.section + 40, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  heroTitle: {
    ...typography.displayXl,
    color: colors.onSurface,
    textAlign: 'center',
  },
  heroSub: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  vibeCard: { padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  vibeLabel: { ...typography.label, color: colors.tertiary },
  vibePill: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderWidth: 1,
    borderColor: glass.stroke,
    width: '100%',
  },
  vibeValue: { ...typography.titleMd, color: colors.onSurface, textAlign: 'center' },
  vibeDetail: { ...typography.micro, color: colors.outline },
  card: { padding: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.title, fontSize: 20, color: colors.onSurface },
  spacer: { flex: 1 },
  divider: { height: 1, backgroundColor: glass.stroke, marginVertical: spacing.md },
  aiBody: { gap: spacing.lg },
  recapCard: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: glass.stroke,
  },
  recapCardLast: { paddingBottom: 0, borderBottomWidth: 0 },
  recapCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  recapTime: { ...typography.micro, color: colors.outline, paddingTop: 4 },
  aiHeadline: { ...typography.title, fontSize: 22, color: colors.onSurface, flex: 1 },
  aiSummary: { ...typography.body, color: colors.onSurfaceVariant, lineHeight: 21 },
  highlight: {
    backgroundColor: 'rgba(0,0,0,0.22)',
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
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dailyRowDate: {
    backgroundColor: `${colors.tertiary}1F`,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dailyRowDateText: { ...typography.label, fontSize: 11, color: colors.tertiary },
  dailyRowCopy: { flex: 1, gap: 1 },
  dailyRowWord: { ...typography.bodyMedium, color: colors.onSurface, textTransform: 'lowercase' },
  dailyRowMeta: { ...typography.micro, color: colors.onSurfaceVariant },
  statRow: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.md,
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
  mention: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  mentionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mentionName: { ...typography.label, fontSize: 13 },
  mentionTime: { ...typography.micro, color: colors.outline },
  mentionText: { ...typography.body, color: colors.onSurfaceVariant },
  missedCard: {
    backgroundColor: 'rgba(0,0,0,0.22)',
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
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
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
    borderColor: 'rgba(255, 107, 107, 0.3)',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  roastText: {
    ...typography.micro,
    fontSize: 11.5,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  ctaWrap: { marginTop: spacing.sm },
});
