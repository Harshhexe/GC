import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  fontFamily,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from '../components/ui/PressableScale';
import { GCButton } from '../components/ui/Buttons';
import { AIStoryHero } from '../components/ui/AIStoryHero';
import { AwardCard } from '../components/AwardCard';
import { useAuth } from '../context/AuthContext';
import { useAppearance } from '../context/AppearanceContext';
import { supabase } from '../lib/supabase';
import { selectFeedback } from '../utils/haptics';
import type { Award } from '../lib/ai';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Explore'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ClaimedAwardItem = {
  id: string;
  award: Award;
  groupId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  groupEmoji: string;
  groupThemeKey: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string | null;
  ceremonyTitle: string | null;
};

/** The floating top bar's own height, above the safe-area inset. */
const HEADER_HEIGHT = 56;

/** Where the big hero identity hands over to the compact header one. */
const HANDOVER_START = 120;
const HANDOVER_END = 190;

/** The awards page has a warm cue, while content surfaces stay consistent. */
function AwardsAuroraBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  const { theme } = useAppearance();
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdropRoot, { backgroundColor: theme.palette.bg }, style]} pointerEvents="none">
      <LinearGradient
        colors={[theme.palette.bg, theme.palette.appChrome]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={theme.isDark ? ['rgba(233, 189, 105, 0.08)', 'transparent'] : ['rgba(233,189,105,0.035)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backdropSpotlight}
      />

    </Animated.View>
  );
}

/** A compact award counter also opens the ceremony guide. */
function AuroraTrophyHero({
  onPress,
}: {
  onPress: () => void;
}) {
  const { theme } = useAppearance();
  return (
    <PressableScale
      style={[styles.heroWrap, { backgroundColor: theme.palette.surfaceLow, borderColor: theme.palette.border }]}
      scaleTo={0.98}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="How GC Awards work"
    >
      <View style={styles.heroSymbol}>
        <Ionicons name="information-circle-outline" size={22} color={colors.yellow} />
      </View>
      <View style={styles.heroMetric}>
        <Text style={[styles.heroMetricValue, { color: theme.palette.onSurface }]}>How awards work</Text>
        <Text style={[styles.heroMetricLabel, { color: theme.palette.onSurfaceVariant }]}>A new ceremony every Sunday</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={theme.palette.onSurfaceVariant} />
    </PressableScale>
  );
}

function SectionLabel({ text }: { text: string }) {
  const { theme } = useAppearance();
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabelText, { color: theme.palette.onSurface }]} accessibilityRole="header">
        {text}
      </Text>
    </View>
  );
}

const POPULAR_AWARDS_GUIDE = [
  { emoji: '🗣️', title: 'Professional Yapper', desc: 'Sent the absolute most messages and kept the chat alive 24/7.' },
  { emoji: '💀', title: 'Most Unhinged', desc: 'Dropped the wildest, most unpredictable and out-of-pocket messages.' },
  { emoji: '🌙', title: 'Night Owl', desc: 'Cooked messages deep past 2 AM while everyone else was asleep.' },
  { emoji: '🍵', title: 'Drama Starter', desc: 'Sparked the hottest gossip, drama, and heated debate in the group.' },
  { emoji: '⚡', title: 'Fastest Reply', desc: 'Responded in mere seconds before anyone else could even open the app.' },
  { emoji: '👻', title: 'Professional Lurker', desc: 'Read every single piece of tea and drama without typing a word.' },
];

export default function ExploreScreen({ navigation }: Props) {
  const { theme } = useAppearance();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [claimedAwards, setClaimedAwards] = useState<ClaimedAwardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [guideModalVisible, setGuideModalVisible] = useState(false);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const backdropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, 500], [0, -70], Extrapolation.CLAMP) },
    ],
  }));

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(scrollY.value, [-150, 0], [1.06, 1], Extrapolation.CLAMP) }],
  }));

  const headerTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 70], [1, 0], Extrapolation.CLAMP),
  }));

  const headerIdentityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HANDOVER_START, HANDOVER_END], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [HANDOVER_START, HANDOVER_END],
          [10, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const headerChromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [30, 110], [0, 1], Extrapolation.CLAMP),
  }));

  async function loadAwards() {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data: rows, error } = await supabase
        .from('group_weekly_awards')
        .select(`
          id,
          group_id,
          week_start,
          week_end,
          status,
          awards,
          title,
          summary,
          generated_at,
          groups:group_id (
            id,
            name,
            emoji,
            avatar_url,
            theme
          )
        `)
        .eq('status', 'completed')
        .order('week_end', { ascending: false });

      if (error) throw error;

      const currentWeekByGroup = new Map<string, string>();
      for (const row of rows ?? []) {
        if (!currentWeekByGroup.has(row.group_id)) {
          currentWeekByGroup.set(row.group_id, row.week_end);
        }
      }

      const claimed: ClaimedAwardItem[] = [];
      const myId = profile.id;
      const myName = (profile.display_name ?? '').trim().toLowerCase();
      const myUsername = (profile.username ?? '').trim().toLowerCase();

      for (const row of rows ?? []) {
        if (currentWeekByGroup.get(row.group_id) !== row.week_end) continue;

        const groupData = Array.isArray(row.groups) ? row.groups[0] : row.groups;
        const groupName = groupData?.name ?? 'Group Chat';
        const groupAvatarUrl = groupData?.avatar_url ?? null;
        const groupEmoji = groupData?.emoji ?? '💬';
        const groupThemeKey = groupData?.theme ?? 'violet';
        const awardList = Array.isArray(row.awards) ? (row.awards as Award[]) : [];

        awardList.forEach((award, index) => {
          const isMine =
            (award.userId && award.userId === myId) ||
            (award.userName &&
              (award.userName.trim().toLowerCase() === myName ||
                award.userName.trim().toLowerCase() === myUsername));

          if (isMine) {
            claimed.push({
              id: `${row.id}-${award.type}-${index}`,
              award,
              groupId: row.group_id,
              groupName,
              groupAvatarUrl,
              groupEmoji,
              groupThemeKey,
              weekStart: row.week_start,
              weekEnd: row.week_end,
              generatedAt: row.generated_at,
              ceremonyTitle: row.title,
            });
          }
        });
      }

      setClaimedAwards(claimed);
    } catch (err) {
      console.error('Error loading claimed awards:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAwards();
  }, [profile?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    selectFeedback();
    loadAwards();
  };

  const groupFilters = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    claimedAwards.forEach((a) => {
      if (!map.has(a.groupId)) {
        map.set(a.groupId, { id: a.groupId, name: a.groupName });
      }
    });
    return Array.from(map.values());
  }, [claimedAwards]);

  const filteredAwards = useMemo(() => {
    if (selectedGroupFilter === 'all') return claimedAwards;
    return claimedAwards.filter((a) => a.groupId === selectedGroupFilter);
  }, [claimedAwards, selectedGroupFilter]);

  const currentWeekLabel = useMemo(() => {
    if (filteredAwards.length === 0) return null;
    const ends = filteredAwards.map((a) => a.weekEnd).filter(Boolean).sort();
    const newest = ends[ends.length - 1];
    if (!newest) return null;
    const start = filteredAwards.find((a) => a.weekEnd === newest)?.weekStart;
    const fmt = (d: string): string | null => {
      const parsed = new Date(d);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    const endLabel = fmt(newest);
    if (!endLabel) return null;
    const startLabel = start ? fmt(start) : null;
    return startLabel ? `${startLabel} to ${endLabel}` : endLabel;
  }, [filteredAwards]);

  const headerOffset = insets.top + HEADER_HEIGHT;

  return (
    <View style={[styles.root, { backgroundColor: theme.palette.bg }]}>
      <AwardsAuroraBackdrop style={backdropStyle} />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerOffset + spacing.md, paddingBottom: DOCK_HEIGHT + spacing.xxl + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#F59E0B"
            colors={['#F59E0B']}
            progressBackgroundColor={colors.surface}
            progressViewOffset={headerOffset}
          />
        }
      >
        {/* 1. Hero identity */}
        <Animated.View
          entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
        >
          <Animated.View style={[styles.hero, heroStyle]}>
            <AIStoryHero
              accent="#E9BD69"
              icon="trophy-outline"
              eyebrow="THE TROPHY ROOM"
              edition="GC / HONORS"
              title="The people make the story."
              description={currentWeekLabel
                ? `The titles you hold across your GCs · ${currentWeekLabel}`
                : 'The titles you earn with your people, updated each Sunday.'}
              footer={
                <View style={styles.heroCountRow}>
                  <Text style={styles.heroCount}>{claimedAwards.length}</Text>
                  <Text style={styles.heroCountLabel}>{claimedAwards.length === 1 ? 'CURRENT TITLE' : 'CURRENT TITLES'}</Text>
                </View>
              }
            />
            <AuroraTrophyHero
              onPress={() => {
                selectFeedback();
                setGuideModalVisible(true);
              }}
            />
          </Animated.View>
        </Animated.View>

        {/* Section Header & Filters */}
        <View style={styles.sectionDivider}>
          <SectionLabel text="Current titles" />
        </View>

        {/* GC Filter Chips (if in multiple GCs) */}
        {groupFilters.length > 1 && (
          <View style={styles.filterChipsRow}>
            <PressableScale
              scaleTo={0.94}
              onPress={() => {
                selectFeedback();
                setSelectedGroupFilter('all');
              }}
              style={[
                styles.filterChip,
                selectedGroupFilter === 'all' && styles.filterChipActive,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedGroupFilter === 'all' }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedGroupFilter === 'all' && styles.filterChipTextActive,
                ]}
              >
                All ({claimedAwards.length})
              </Text>
            </PressableScale>

            {groupFilters.map((g) => {
              const count = claimedAwards.filter((a) => a.groupId === g.id).length;
              const isSelected = selectedGroupFilter === g.id;
              return (
                <PressableScale
                  key={g.id}
                  scaleTo={0.94}
                  onPress={() => {
                    selectFeedback();
                    setSelectedGroupFilter(g.id);
                  }}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive,
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {g.name} ({count})
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        )}

        {/* Award Cards List or Empty State */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#F59E0B" />
            <Text style={[styles.loadingText, { color: theme.palette.onSurfaceVariant }]}>Loading awards…</Text>
          </View>
        ) : filteredAwards.length === 0 ? (
          <Animated.View
            entering={FadeInDown.delay(100)
              .duration(duration.base)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.emptyContainer}
          >
            <View style={styles.emptyIconOrb}>
              <Ionicons name="trophy-outline" size={36} color="#F59E0B" />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.palette.onSurface }]}>Nothing claimed this week</Text>
            <Text style={[styles.emptySubtitle, { color: theme.palette.onSurfaceVariant }]}>
              Awards are given every Sunday from the moments your group shares. Keep the conversation going.
            </Text>
            <GCButton
              label="Back to chats"
              full={false}
              style={styles.emptyCTA}
              onPress={() => navigation.navigate('GroupList')}
            />
          </Animated.View>
        ) : (
          <View style={styles.cardsContainer}>
            {filteredAwards.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInDown.delay(index * 50 + 50)
                  .duration(duration.base)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <AwardCard
                  item={item}
                  rank={index}
                  onPress={() => navigation.navigate('Chat', { groupId: item.groupId })}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.ScrollView>

      {/* Floating Top Bar with Title at Top & Question Mark Ceremony Guide Button */}
      <View style={[styles.headerWrap, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerChromeStyle]} pointerEvents="none">
          {Platform.OS !== 'web' && (
            <BlurView
              intensity={24}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={[styles.headerChromeFill, { backgroundColor: theme.palette.surfaceLow }]} />
          <View style={[styles.headerHairline, { backgroundColor: theme.palette.border }]} />
        </Animated.View>

        <View style={styles.headerBar} pointerEvents="box-none">
          <Animated.Text
            style={[styles.headerTitle, { color: theme.palette.onSurface }, headerTitleStyle]}
            numberOfLines={1}
            pointerEvents="none"
          >
            Awards
          </Animated.Text>

          <Animated.View style={[styles.headerIdentity, headerIdentityStyle]} pointerEvents="none">
            <View style={styles.headerIdentityIcon}>
              <Ionicons name="trophy" size={16} color="#FBBF24" />
            </View>
            <View style={styles.headerIdentityCopy}>
              <Text style={[styles.headerIdentityName, { color: theme.palette.onSurface }]} numberOfLines={1}>
                Claimed Awards
              </Text>
              <Text style={[styles.headerIdentityHandle, { color: theme.palette.onSurfaceVariant }]} numberOfLines={1}>
                {claimedAwards.length} {claimedAwards.length === 1 ? 'title held' : 'titles held'}
              </Text>
            </View>
          </Animated.View>

          {/* Question mark icon button for Ceremony Guide */}
          <PressableScale
            style={[styles.headerHelpBtn, { backgroundColor: theme.palette.surfaceHigh, borderColor: theme.palette.border }]}
            scaleTo={0.88}
            haptic="light"
            onPress={() => {
              selectFeedback();
              setGuideModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Ceremony guide and how awards work"
          >
            <Ionicons name="help-circle-outline" size={23} color="#FBBF24" />
          </PressableScale>
        </View>
      </View>

      {/* Ceremony Guide Modal */}
      <Modal
        visible={guideModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGuideModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <PressableScale
            style={StyleSheet.absoluteFill}
            scaleTo={1}
            onPress={() => setGuideModalVisible(false)}
          >
            <View style={StyleSheet.absoluteFill} />
          </PressableScale>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIconWrap}>
                <Ionicons name="trophy" size={20} color="#FBBF24" />
              </View>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>How GC Awards Work</Text>
                <Text style={styles.modalSub}>Weekly honors, roasts & trophies</Text>
              </View>
              <PressableScale
                style={styles.modalCloseBtn}
                scaleTo={0.88}
                onPress={() => setGuideModalVisible(false)}
              >
                <Ionicons name="close" size={18} color={colors.onSurface} />
              </PressableScale>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.guideBlock}>
                <Text style={styles.guideSectionTitle}>🏆 The Sunday Ceremony</Text>
                <Text style={styles.guideSectionBody}>
                  Every Sunday at midnight, GC AI judges all messages across the week to crown the champions, roasters, and icons of the group. Every member sees the exact same shared honors!
                </Text>
              </View>

              <View style={styles.guideBlock}>
                <Text style={styles.guideSectionTitle}>✨ Popular Award Categories</Text>
                <View style={styles.guideList}>
                  {POPULAR_AWARDS_GUIDE.map((cat, i) => (
                    <View key={i} style={styles.guideListItem}>
                      <Text style={styles.guideEmoji}>{cat.emoji}</Text>
                      <View style={styles.guideTextWrap}>
                        <Text style={styles.guideItemTitle}>{cat.title}</Text>
                        <Text style={styles.guideItemDesc}>{cat.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: CONTAINER_MARGIN,
    gap: spacing.lg,
  },

  // Backdrop
  backdropRoot: { backgroundColor: colors.bg, overflow: 'hidden' },
  backdropSpotlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },

  // Floating Top Bar Handover
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  headerChromeFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 16, 21, 0.94)',
  },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  headerBar: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  headerTitle: {
    ...typography.title,
    color: colors.onSurface,
    textAlign: 'left',
  },
  headerIdentity: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  headerIdentityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIdentityCopy: { maxWidth: 190 },
  headerIdentityName: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  headerIdentityHandle: {
    ...typography.micro,
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '600',
  },
  headerHelpBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero and section hierarchy
  hero: { alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.lg },
  heroCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  heroCount: { fontFamily: fontFamily.display, fontSize: 25, lineHeight: 29, color: colors.onSurface },
  heroCountLabel: { ...typography.micro, fontSize: 10, letterSpacing: 1, color: colors.onSurfaceVariant },
  heroEyebrow: { ...typography.label, color: colors.yellow, letterSpacing: 1.1 },
  mainTitle: { ...typography.headline, fontSize: 42, lineHeight: 48, color: colors.onSurface },
  subtitle: { ...typography.body, fontSize: 14, lineHeight: 21, color: colors.onSurfaceVariant, maxWidth: 440 },
  heroWrap: {
    width: '100%',
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroSymbol: {
    width: 39,
    height: 39,
    borderRadius: radius.md,
    backgroundColor: 'rgba(233,189,105,0.11)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetric: { flex: 1, gap: 1 },
  heroMetricValue: { fontFamily: fontFamily.bodySemi, fontSize: 14, lineHeight: 19, color: colors.onSurface },
  heroMetricLabel: { ...typography.caption, fontSize: 12, color: colors.onSurfaceVariant },
  sectionDivider: { marginTop: spacing.lg },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center' },
  sectionLabelText: { fontFamily: fontFamily.bodySemi, fontSize: 18, lineHeight: 24, color: colors.onSurface },

  // Filter Chips
  filterChipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginTop: -spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 13,
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(233, 189, 105, 0.45)',
  },
  filterChipText: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  filterChipTextActive: {
    color: colors.yellow,
    fontWeight: '700',
  },

  // Cards Container
  cardsContainer: {
    gap: spacing.md,
  },

  // Loading & Empty
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceLow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconOrb: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: 'rgba(233, 189, 105, 0.11)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    fontWeight: '800',
    color: colors.onSurface,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCTA: {
    marginTop: spacing.xs,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surfaceLow,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outline,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(233, 189, 105, 0.11)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderCopy: {
    flex: 1,
  },
  modalTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
  },
  modalSub: {
    ...typography.micro,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: CONTAINER_MARGIN,
  },
  guideBlock: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  guideSectionTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  guideSectionBody: {
    ...typography.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },
  guideList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  guideListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideEmoji: {
    fontSize: 24,
  },
  guideTextWrap: {
    flex: 1,
    gap: 2,
  },
  guideItemTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.onSurface,
  },
  guideItemDesc: {
    ...typography.micro,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
    lineHeight: 16,
  },
});
