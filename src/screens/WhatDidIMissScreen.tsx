import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useMessages } from '../hooks/useMessages';
import { useGroupRecap } from '../hooks/useGroupRecap';
import { useAuth } from '../context/AuthContext';
import { clockTime } from '../utils/time';
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      <GlassPanel borderRadius={radius.lg} style={styles.card}>
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
  const { groupId, groupName } = route.params;
  const { profile } = useAuth();
  const { messages, loading } = useMessages(groupId);
  const recap = useGroupRecap(messages, {
    username: profile?.username,
    displayName: profile?.display_name,
  });

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

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

          {/* Key takeaways — the one part that genuinely needs a model. */}
          <Section
            icon="list"
            iconColor={colors.secondary}
            title="Key Takeaways"
            delay={STAGGER_MS * 2}
          >
            <View style={styles.pendingRow}>
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              <View style={styles.pendingCopy}>
                <Text style={styles.pendingTitle}>AI recap not switched on yet</Text>
                <Text style={styles.pendingMeta}>
                  Summarising the actual storyline needs the OpenAI key — that's Phase 4.
                  Everything else on this screen is counted from real messages.
                </Text>
              </View>
            </View>
            {recap.longestMessage && (
              <View style={styles.takeaway}>
                <Ionicons name="flash" size={18} color={colors.primary} />
                <View style={styles.takeawayCopy}>
                  <Text style={styles.takeawayTitle} numberOfLines={2}>
                    {recap.longestMessage.text}
                  </Text>
                  <Text style={styles.takeawayMeta}>
                    longest message · {recap.longestMessage.authorName}
                  </Text>
                </View>
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
            title="Mentioned You"
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
                Nobody @'d you. Free of obligations, free of relevance.
              </Text>
            ) : (
              recap.mentions.map((m) => (
                <View key={m.id} style={styles.mention}>
                  <View style={styles.mentionHead}>
                    <Avatar
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
                  </View>
                  <Text style={styles.mentionText} numberOfLines={3}>
                    {m.text}
                  </Text>
                </View>
              ))
            )}
          </Section>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 5)
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
  pendingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(208,188,255,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(208,188,255,0.25)',
    padding: spacing.md,
  },
  pendingCopy: { flex: 1, gap: 3 },
  pendingTitle: { ...typography.bodyMedium, color: colors.onSurface },
  pendingMeta: { ...typography.micro, color: colors.onSurfaceVariant, lineHeight: 17 },
  takeaway: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  takeawayCopy: { flex: 1, gap: 3 },
  takeawayTitle: { ...typography.body, color: colors.onSurface },
  takeawayMeta: { ...typography.micro, color: colors.outline },
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
  ctaWrap: { marginTop: spacing.sm },
});
