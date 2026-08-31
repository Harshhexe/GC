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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing as ReaEasing,
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  fontFamily,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from '../components/ui/PressableScale';
import { Avatar } from '../components/ui/Avatar';
import { AwardCard } from '../components/AwardCard';
import { useAuth } from '../context/AuthContext';
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

const TROPHY_HERO_SIZE = 104;
const RING_SIZE = 120;
const HALO_SIZE = 148;

/**
 * 🌌 Deep obsidian & golden ambient background matching ProfileScreen's aurora language.
 */
function AwardsAuroraBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdropRoot, style]} pointerEvents="none">
      <LinearGradient
        colors={['#130E07', '#0A0810', '#040306']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Overhead golden trophy spotlight, centred on where the trophy hero sits. */}
      <LinearGradient
        colors={['rgba(245, 158, 11, 0.22)', 'rgba(236, 72, 153, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backdropSpotlight}
      />

      {/* Ambient glowing mesh accents */}
      <LinearGradient
        colors={['rgba(245, 158, 11, 0.16)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(168, 85, 247, 0.12)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.25, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />

      {/* High-intensity dark blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 70 : 85}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />

      {/* Vignette — keeps cards and medals popping with high contrast. */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.75)']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * 🏆 Grand Hero Trophy Crest with spinning Aurora gradient sweep.
 */
function AuroraTrophyHero({
  count,
  userAvatarUrl,
  userDisplayName,
  onPress,
}: {
  count: number;
  userAvatarUrl?: string | null;
  userDisplayName?: string;
  onPress: () => void;
}) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(360, { duration: 8000, easing: ReaEasing.linear, reduceMotion }),
      -1,
      false
    );
  }, [spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  return (
    <PressableScale
      style={styles.heroWrap}
      scaleTo={0.95}
      haptic="medium"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View Awards Ceremony Guide"
    >
      <View style={styles.heroHalo} pointerEvents="none">
        <LinearGradient
          colors={['rgba(245, 158, 11, 0.32)', 'rgba(236, 72, 153, 0.14)', 'transparent']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.ringClip} pointerEvents="none">
        <Animated.View style={[styles.ringSweep, spinStyle]}>
          <LinearGradient
            colors={['#FBBF24', '#F472B6', '#818CF8', '#FBBF24']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={styles.ringHole} />
      </View>

      <View style={styles.trophyOrbInner}>
        {userAvatarUrl ? (
          <Avatar
            imageUrl={userAvatarUrl}
            label={userDisplayName ?? 'Me'}
            size={TROPHY_HERO_SIZE - 8}
            ring={false}
          />
        ) : (
          <LinearGradient
            colors={['#2A1F08', '#140E03']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.trophyIconFill}
          >
            <Text style={styles.trophyHeroEmoji}>🏆</Text>
          </LinearGradient>
        )}
      </View>

      <View style={styles.trophyCrownBadge}>
        <Ionicons name="sparkles" size={13} color="#FBBF24" />
        <Text style={styles.trophyCrownText}>{count > 0 ? `${count} Active` : 'Ceremony'}</Text>
      </View>
    </PressableScale>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabelText} accessibilityRole="header">
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
    <View style={styles.root}>
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
            <AuroraTrophyHero
              count={claimedAwards.length}
              userAvatarUrl={profile?.avatar_url}
              userDisplayName={profile?.display_name}
              onPress={() => {
                selectFeedback();
                setGuideModalVisible(true);
              }}
            />

            <Text style={styles.mainTitle} numberOfLines={2}>
              Claimed Awards
            </Text>

            <View style={styles.heroMetaRow}>
              <View style={styles.trophyChip}>
                <Ionicons name="trophy" size={12} color="#FBBF24" />
                <Text style={styles.trophyChipText}>
                  {claimedAwards.length} {claimedAwards.length === 1 ? 'TITLE HELD' : 'TITLES HELD'}
                </Text>
              </View>
            </View>

            <Text style={styles.subtitle}>
              {currentWeekLabel
                ? `Honors and titles you hold right now (${currentWeekLabel}). They hand over when the next Sunday ceremony runs.`
                : 'Honors and titles you hold right now across your chats. They hand over when the next Sunday ceremony runs.'}
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Section Header & Filters */}
        <View style={styles.sectionDivider}>
          <SectionLabel text="YOUR TROPHY ROOM" />
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
            <Text style={styles.loadingText}>Polishing your trophies…</Text>
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
            <Text style={styles.emptyTitle}>Nothing claimed this week</Text>
            <Text style={styles.emptySubtitle}>
              Titles reset every Sunday ceremony. Yap, start some drama, or drop unhinged takes in your group chats to claim honors in the next GC Awards!
            </Text>
            <PressableScale
              style={styles.emptyCTA}
              scaleTo={0.95}
              haptic="medium"
              onPress={() => navigation.navigate('GroupList')}
            >
              <LinearGradient
                colors={['#F59E0B', '#D97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyCTAGradient}
              >
                <Ionicons name="chatbubbles" size={17} color="#FFFFFF" />
                <Text style={styles.emptyCTAText}>Jump into Chats</Text>
              </LinearGradient>
            </PressableScale>
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
              intensity={40}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.headerChromeFill} />
          <View style={styles.headerHairline} />
        </Animated.View>

        <View style={styles.headerBar} pointerEvents="box-none">
          <Animated.Text
            style={[styles.headerTitle, headerTitleStyle]}
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
              <Text style={styles.headerIdentityName} numberOfLines={1}>
                Claimed Awards
              </Text>
              <Text style={styles.headerIdentityHandle} numberOfLines={1}>
                {claimedAwards.length} {claimedAwards.length === 1 ? 'title held' : 'titles held'}
              </Text>
            </View>
          </Animated.View>

          {/* Question mark icon button for Ceremony Guide */}
          <PressableScale
            style={styles.headerHelpBtn}
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
  root: { flex: 1, backgroundColor: '#040306' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: CONTAINER_MARGIN,
    gap: spacing.lg,
  },

  // Backdrop
  backdropRoot: { backgroundColor: '#040306', overflow: 'hidden' },
  backdropSpotlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
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
    backgroundColor: 'rgba(10, 8, 16, 0.72)',
  },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  headerBar: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  headerTitle: {
    ...typography.title,
    color: colors.onSurface,
    textAlign: 'center',
  },
  headerIdentity: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero Section
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroHalo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    overflow: 'hidden',
  },
  ringClip: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSweep: {
    width: RING_SIZE * 1.5,
    height: RING_SIZE * 1.5,
  },
  ringHole: {
    position: 'absolute',
    width: RING_SIZE - 6,
    height: RING_SIZE - 6,
    borderRadius: (RING_SIZE - 6) / 2,
    backgroundColor: '#0A0810',
  },
  trophyOrbInner: {
    width: TROPHY_HERO_SIZE,
    height: TROPHY_HERO_SIZE,
    borderRadius: TROPHY_HERO_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1408',
  },
  trophyIconFill: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyHeroEmoji: {
    fontSize: 48,
  },
  trophyCrownBadge: {
    position: 'absolute',
    bottom: -6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(20, 16, 8, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.50)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  trophyCrownText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.4,
  },

  // Titles
  mainTitle: {
    ...typography.headline,
    fontSize: 32,
    lineHeight: 38,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  trophyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  trophyChipText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: '#FBBF24',
  },
  subtitle: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 19,
  },

  // Section Headers
  sectionDivider: {
    marginTop: spacing.xs,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionLabelText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },

  // Filter Chips
  filterChipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginTop: -spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  filterChipText: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#FBBF24',
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
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyIconOrb: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCTA: {
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  emptyCTAGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  emptyCTAText: {
    ...typography.label,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F0B18',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    gap: spacing.sm,
  },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
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
    color: '#FFFFFF',
  },
  modalSub: {
    ...typography.micro,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#FFFFFF',
  },
  guideItemDesc: {
    ...typography.micro,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
    lineHeight: 16,
  },
});
