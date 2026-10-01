import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/EmptyState';
import { useAppearance } from '../context/AppearanceContext';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { supabase } from '../lib/supabase';
import { describeMedia } from '../lib/media';
import { signedImageSource, useSignedMediaUrl } from '../lib/mediaUrl';
import { dayLabel, clockTime } from '../utils/time';
import type { MediaType } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupSearch'>;

type SearchFilter = 'all' | 'media' | 'links' | 'files';

type ResultRow = {
  id: string;
  authorId: string | null;
  text: string;
  createdAt: string;
  mediaType: MediaType | null;
  mediaName: string | null;
  mediaUrl: string | null;
  mediaThumbUrl: string | null;
};

const FILTERS: { id: SearchFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'All', icon: 'chatbubble-ellipses-outline' },
  { id: 'media', label: 'Media', icon: 'images-outline' },
  { id: 'links', label: 'Links', icon: 'link-outline' },
  { id: 'files', label: 'Files', icon: 'document-text-outline' },
];

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|co|dev|app|ai|me)\b[^\s]*)/i;

function sanitizeQuery(q: string) {
  return q.trim().replace(/[%_,()]/g, ' ').trim();
}

function escapeRegex(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function HighlightedText({
  text,
  query,
  style,
  numberOfLines = 2,
}: {
  text: string;
  query: string;
  style?: any;
  numberOfLines?: number;
}) {
  const clean = sanitizeQuery(query);
  if (!clean || clean.length < 2 || !text) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  try {
    const parts = text.split(new RegExp(`(${escapeRegex(clean)})`, 'gi'));
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {parts.map((part, i) =>
          part.toLowerCase() === clean.toLowerCase() ? (
            <Text key={i} style={styles.highlightBadge}>
              {part}
            </Text>
          ) : (
            part
          )
        )}
      </Text>
    );
  } catch {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
}

function ResultThumbnail({ url, thumbUrl, isVideo }: { url: string | null; thumbUrl: string | null; isVideo: boolean }) {
  const signedUrl = useSignedMediaUrl(url);
  const signedThumb = useSignedMediaUrl(thumbUrl);
  const previewUri = signedThumb ?? signedUrl;

  if (!previewUri) return null;

  return (
    <View style={styles.thumbWrapper}>
      <Image
        source={signedImageSource(previewUri, thumbUrl ?? url)}
        style={styles.thumbImage}
        contentFit="cover"
        transition={150}
      />
      {isVideo && (
        <View style={styles.playIconOverlay}>
          <Ionicons name="play" size={10} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const MIN_CHARS = 2;
const RESULT_LIMIT = 80;

export default function GroupSearchScreen({ route, navigation }: Props) {
  const { theme } = useAppearance();
  const palette = theme.palette;
  const { groupId } = route.params;
  const { members } = useGroupMembers(groupId);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  useEffect(() => {
    const clean = sanitizeQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (clean.length < MIN_CHARS) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const myRequest = ++requestId.current;

      const matchingAuthorIds = members
        .filter((m) => m.displayName.toLowerCase().includes(clean.toLowerCase()))
        .map((m) => m.id);

      const orParts = [`text.ilike.%${clean}%`, `media_name.ilike.%${clean}%`];
      if (matchingAuthorIds.length > 0) {
        orParts.push(`author_id.in.(${matchingAuthorIds.join(',')})`);
      }

      const { data } = await supabase
        .from('messages')
        .select('id, author_id, text, created_at, media_type, media_name, media_url, media_thumb_url')
        .eq('group_id', groupId)
        .eq('is_deleted', false)
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(RESULT_LIMIT);

      if (myRequest !== requestId.current) return;

      setResults(
        (data ?? []).map((r) => ({
          id: r.id,
          authorId: r.author_id,
          text: r.text,
          createdAt: r.created_at,
          mediaType: r.media_type as MediaType | null,
          mediaName: r.media_name,
          mediaUrl: r.media_url,
          mediaThumbUrl: r.media_thumb_url,
        }))
      );
      setSearching(false);
      setSearched(true);
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, groupId, members]);

  const filteredResults = useMemo(() => {
    if (filter === 'all') return results;
    if (filter === 'media') {
      return results.filter((r) => r.mediaType === 'image' || r.mediaType === 'video');
    }
    if (filter === 'links') {
      return results.filter((r) => URL_REGEX.test(r.text));
    }
    if (filter === 'files') {
      return results.filter((r) => r.mediaType === 'file' || (!r.mediaType && r.mediaName));
    }
    return results;
  }, [results, filter]);

  function openResult(id: string) {
    navigation.navigate('Chat', { groupId, jumpToMessageId: id });
  }

  const cleanQuery = sanitizeQuery(query);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AmbientBackground tint={palette.bg} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Search Header */}
        <View style={[styles.header, { backgroundColor: palette.surfaceLow, borderBottomColor: palette.border }]}>
          <HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />
          <View style={[styles.inputWrap, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
            <Ionicons name="search" size={17} color={palette.primary} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search this GC"
              placeholderTextColor={palette.textMuted}
              style={[styles.input, { color: palette.onSurface }]}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searching && <ActivityIndicator size="small" color={colors.primary} />}
            {!!query && !searching && (
              <PressableScale hitSlop={8} onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={17} color={colors.outline} />
              </PressableScale>
            )}
          </View>
        </View>

        {/* Filter Pills */}
        <View style={[styles.filterRow, { borderBottomColor: palette.border }]}>
          {FILTERS.map((f) => {
            const isActive = filter === f.id;
            return (
              <PressableScale
                key={f.id}
                scaleTo={0.95}
                haptic="light"
                onPress={() => setFilter(f.id)}
                style={[
                  styles.filterPill,
                  { backgroundColor: palette.surfaceLow, borderColor: palette.border },
                  isActive && [styles.filterPillActive, { backgroundColor: palette.surfaceHigh, borderColor: palette.primary }],
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={f.icon}
                  size={13}
                  color={isActive ? palette.onSurface : palette.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.filterPillText,
                    isActive && styles.filterPillTextActive,
                    { color: isActive ? palette.onSurface : palette.onSurfaceVariant },
                  ]}
                >
                  {f.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {/* Results / Empty / Suggestions */}
        {cleanQuery.length < MIN_CHARS ? (
          <View style={styles.suggestionContainer}>
            <View style={styles.suggestionHero}>
              <View style={[styles.searchIconRing, { backgroundColor: palette.surfaceHigh }]}>
                <Ionicons name="search" size={24} color={palette.primary} />
              </View>
              <Text style={[styles.suggestionTitle, { color: palette.onSurface }]}>Find it in the conversation</Text>
              <Text style={[styles.suggestionSub, { color: palette.onSurfaceVariant }]}>
                Find conversations by keywords, member names, shared links, or document filenames.
              </Text>
            </View>

            <View style={styles.quickChipsWrap}>
              <Text style={[styles.quickChipsTitle, { color: palette.onSurfaceVariant }]}>Quick searches</Text>
              <View style={styles.chipGrid}>
                {['Photos', 'Links', 'PDF', 'Pinned', 'Voice'].map((chip) => (
                  <PressableScale
                    key={chip}
                    scaleTo={0.94}
                    haptic="light"
                    onPress={() => setQuery(chip)}
                    style={[styles.presetChip, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}
                  >
                    <Ionicons name="search-outline" size={12} color={palette.onSurfaceVariant} />
                    <Text style={[styles.presetChipText, { color: palette.onSurface }]}>{chip}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          </View>
        ) : searched && filteredResults.length === 0 && !searching ? (
          <EmptyState
            emoji="🔎"
            title="No results"
            text={`No results found for "${query}" in this category.`}
          />
        ) : (
          <FlatList
            data={filteredResults}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const member = item.authorId ? memberById.get(item.authorId) : undefined;
              const authorName = member?.displayName ?? (item.authorId ? 'Someone' : 'Deleted User');
              const mediaLabel = item.mediaType ? describeMedia(item.mediaType, item.mediaName) : null;
              const hasMediaThumb = item.mediaType === 'image' || item.mediaType === 'video';

              return (
                <Animated.View
                  entering={FadeInDown.delay(Math.min(index, 6) * 20)
                    .duration(duration.base)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <PressableScale scaleTo={0.98} haptic="light" onPress={() => openResult(item.id)}>
                    <GlassPanel borderRadius={radius.lg} style={[styles.card, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
                      <View style={styles.cardHeader}>
                        <View style={styles.authorRow}>
                          <Avatar
                            imageUrl={member?.avatarUrl}
                            emoji={member?.avatarEmoji ?? '👤'}
                            label={authorName}
                            size={28}
                            ringColors={[member?.avatarColor ?? colors.primary, colors.secondary]}
                          />
                          <Text style={[styles.author, { color: palette.onSurface }]} numberOfLines={1}>
                            {authorName}
                          </Text>
                        </View>
                        <Text style={[styles.time, { color: palette.textMuted }]}>
                          {dayLabel(item.createdAt)}, {clockTime(item.createdAt)}
                        </Text>
                      </View>

                      <View style={styles.contentRow}>
                        <View style={styles.textColumn}>
                          {mediaLabel && (
                            <View style={styles.mediaLabelPill}>
                              <Ionicons name={mediaLabel.icon ?? 'document'} size={12} color={colors.primary} />
                              <Text style={[styles.mediaLabelText, { color: palette.onSurfaceVariant }]} numberOfLines={1}>
                                {mediaLabel.label}
                              </Text>
                            </View>
                          )}

                          {!!item.text && (
                            <HighlightedText
                              text={item.text}
                              query={query}
                              style={[styles.snippetText, { color: palette.onSurface }]}
                              numberOfLines={3}
                            />
                          )}
                        </View>

                        {hasMediaThumb && (
                          <ResultThumbnail
                            url={item.mediaUrl}
                            thumbUrl={item.mediaThumbUrl}
                            isVideo={item.mediaType === 'video'}
                          />
                        )}
                      </View>
                    </GlassPanel>
                  </PressableScale>
                </Animated.View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  // Search Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceLow,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontSize: 14.5,
    color: colors.onSurface,
    paddingVertical: 0,
  },

  // Filter Row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.primary,
  },
  filterPillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  filterPillTextActive: {
    color: colors.onSurface,
    fontWeight: '700',
  },

  // Suggestions
  suggestionContainer: {
    padding: CONTAINER_MARGIN,
    gap: spacing.xl,
    paddingTop: spacing.xl,
  },
  suggestionHero: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  searchIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  suggestionTitle: {
    ...typography.titleMd,
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
  },
  suggestionSub: {
    ...typography.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'left',
    lineHeight: 18,
    maxWidth: 320,
  },
  quickChipsWrap: {
    gap: spacing.sm,
  },
  quickChipsTitle: {
    ...typography.micro,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipText: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.onSurface,
  },

  // List & Cards
  list: {
    padding: CONTAINER_MARGIN,
    gap: spacing.sm + 2,
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.md,
    gap: spacing.xs + 2,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  author: {
    ...typography.bodyMedium,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.onSurface,
    flexShrink: 1,
  },
  time: {
    ...typography.caption,
    fontSize: 11,
    color: colors.outline,
  },

  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  mediaLabelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignSelf: 'flex-start',
  },
  mediaLabelText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  snippetText: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },
  highlightBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.28)',
    color: '#FBBF24',
    fontWeight: '700',
  },

  thumbWrapper: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  playIconOverlay: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
