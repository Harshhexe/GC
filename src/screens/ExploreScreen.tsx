import { useEffect, useState, useMemo } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from '../components/ui/Glass';
import { AppHeader } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { AwardCard } from '../components/AwardCard';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { groupTheme } from '../theme/groupThemes';
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

/** Golden moody ambient background with high blur for Awards Trophy Room */
function GoldenAtmosphericBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Obsidian Dark Base */}
      <LinearGradient
        colors={['#0E0C16', colors.appRoot, colors.appChrome]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Golden Spotlight */}
      <LinearGradient
        colors={['rgba(245, 158, 11, 0.18)', 'rgba(217, 119, 6, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topSpotlight}
      />

      {/* Atmospheric Glowing Mesh Blobs */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={['rgba(245, 158, 11, 0.28)', 'rgba(236, 72, 153, 0.14)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.24)', 'rgba(245, 158, 11, 0.12)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['rgba(251, 113, 133, 0.16)', 'rgba(139, 92, 246, 0.14)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={['rgba(245, 158, 11, 0.20)', 'transparent']}
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

      {/* Subtle Vignette */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.02)', 'transparent', 'rgba(3, 2, 6, 0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function formatAwardDate(dateStr: string | null, weekEndStr?: string | null): string {
  const target = dateStr || weekEndStr;
  if (!target) return 'Sunday';
  try {
    const d = new Date(target);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return target;
  }
}

export default function ExploreScreen({ navigation }: Props) {
  const { profile } = useAuth();
  const [claimedAwards, setClaimedAwards] = useState<ClaimedAwardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

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

      /*
       * Only the newest ceremony per group survives.
       *
       * The awards a group hands out are for one week, and the moment that
       * group holds its next ceremony the previous week's titles stop being
       * current. Expiry is scoped per group rather than globally because the
       * groups run on their own schedules: a quiet chat that has not held a
       * ceremony in a fortnight should still show the last titles it actually
       * awarded, instead of being blanked because a busier chat moved on.
       *
       * Rows arrive newest-week-first, so the first week_end seen for a group
       * is that group's current one and every older row is dropped.
       */
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
        // Superseded by a newer ceremony in this same group.
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
    loadAwards();
  };

  // Extract distinct groups for filter tabs
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

  const uniqueGCsCount = useMemo(() => {
    const set = new Set(claimedAwards.map((a) => a.groupId));
    return set.size;
  }, [claimedAwards]);

  /**
   * The week the visible titles belong to. Taken from the awards themselves
   * rather than from today's date, because a group that has not run a
   * ceremony in a while is still showing an older week and the label has to
   * say so honestly instead of claiming to be the current calendar week.
   */
  const currentWeekLabel = useMemo(() => {
    if (filteredAwards.length === 0) return null;
    const ends = filteredAwards.map((a) => a.weekEnd).filter(Boolean).sort();
    const newest = ends[ends.length - 1];
    if (!newest) return null;
    const start = filteredAwards.find((a) => a.weekEnd === newest)?.weekStart;
    // An unparseable date does not throw here — toLocaleDateString happily
    // returns the string "Invalid Date" — so the guard has to be explicit or
    // a malformed row renders as "from Invalid Date to Invalid Date".
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

  const renderAwardCard = ({ item, index }: { item: ClaimedAwardItem; index: number }) => (
    <Animated.View
      entering={FadeInDown.delay(index * 50 + 80)
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
  );

  return (
    <View style={styles.root}>
      <GoldenAtmosphericBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          wordmark
          right={
            <Avatar
              imageUrl={profile?.avatar_url}
              label={profile?.display_name ?? 'Me'}
              size={34}
            />
          }
        />

        <FlatList
          data={filteredAwards}
          keyExtractor={(item) => item.id}
          renderItem={renderAwardCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F59E0B"
              colors={['#F59E0B']}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Screen Title */}
              <View style={styles.titleBlock}>
                <View style={styles.titleBadge}>
                  <Ionicons name="trophy" size={13} color="#FBBF24" />
                  <Text style={styles.titleBadgeText}>THIS WEEK</Text>
                </View>
                <Text style={styles.mainTitle}>This Week's Claimed Awards</Text>
                <Text style={styles.subtitle}>
                  {currentWeekLabel
                    ? `Titles you hold right now, from ${currentWeekLabel}. They hand over when the next ceremony runs.`
                    : 'Titles you hold right now. They hand over when the next ceremony runs.'}
                </Text>
              </View>

              {/* Showcase Summary Card */}
              <GlassPanel borderRadius={radius.xl} style={styles.showcaseCard}>
                <View style={styles.showcaseStatsRow}>
                  <View style={styles.showcaseStatItem}>
                    <View style={styles.trophyIconWrap}>
                      <Ionicons name="trophy" size={24} color="#FBBF24" />
                    </View>
                    <View>
                      <Text style={styles.showcaseStatValue}>{claimedAwards.length}</Text>
                      <Text style={styles.showcaseStatLabel}>TITLES HELD</Text>
                    </View>
                  </View>

                  <View style={styles.showcaseDivider} />

                  <View style={styles.showcaseStatItem}>
                    <View style={[styles.trophyIconWrap, { backgroundColor: 'rgba(139, 92, 246, 0.15)', borderColor: 'rgba(139, 92, 246, 0.35)' }]}>
                      <Ionicons name="people" size={22} color="#A78BFA" />
                    </View>
                    <View>
                      <Text style={styles.showcaseStatValue}>{uniqueGCsCount}</Text>
                      <Text style={styles.showcaseStatLabel}>GCS</Text>
                    </View>
                  </View>
                </View>

                {claimedAwards.length > 0 && (
                  <View style={styles.showcaseFooter}>
                    <Ionicons name="sparkles" size={13} color="#FBBF24" />
                    <Text style={styles.showcaseFooterText}>
                      Top title: <Text style={styles.showcaseFooterStrong}>{claimedAwards[0].award.title}</Text> {claimedAwards[0].award.emoji}
                    </Text>
                  </View>
                )}
              </GlassPanel>

              {/* GC Filter Chips (if multiple GCs) */}
              {groupFilters.length > 1 && (
                <View style={styles.filterChipsRow}>
                  <PressableScale
                    scaleTo={0.94}
                    onPress={() => setSelectedGroupFilter('all')}
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
                        onPress={() => setSelectedGroupFilter(g.id)}
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
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconOrb}>
                  <Ionicons name="hourglass-outline" size={32} color="#F59E0B" />
                </View>
                <Text style={styles.emptyTitle}>Loading your trophies...</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconOrb}>
                  <Ionicons name="trophy-outline" size={36} color="#F59E0B" />
                </View>
                <Text style={styles.emptyTitle}>Nothing claimed this week</Text>
                <Text style={styles.emptySubtitle}>
                  Titles reset every ceremony. Yap, start some drama, or drop
                  unhinged takes in your group chats to claim one in Sunday's GC Awards.
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
              </View>
            )
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  safe: { flex: 1 },
  listContent: {
    padding: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.md,
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

  // Header Block
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  titleBlock: {
    gap: 6,
    paddingTop: spacing.xs,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.30)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  titleBadgeText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.8,
  },
  mainTitle: {
    ...typography.headline,
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },

  // Showcase Stats Card
  showcaseCard: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  showcaseStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  showcaseStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trophyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseStatValue: {
    ...typography.headline,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  showcaseStatLabel: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  showcaseDivider: {
    width: 1,
    height: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: spacing.sm,
  },
  showcaseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  showcaseFooterStrong: { color: colors.onSurface, fontWeight: '700' },
  showcaseFooterText: {
    ...typography.micro,
    fontSize: 11.5,
    color: '#94A3B8',
  },

  // Filter Chips
  filterChipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(245, 158, 11, 0.40)',
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

  // Award Card

  // From GC Source Pill

  // Reason Box

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyIconOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.headline,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 18,
  },
  emptyCTA: {
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  emptyCTAGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  emptyCTAText: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
