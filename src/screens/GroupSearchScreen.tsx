import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { HeaderIconButton } from '../components/ui/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { supabase } from '../lib/supabase';
import { describeMedia } from '../lib/media';
import { dayLabel, clockTime } from '../utils/time';
import type { MediaType } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupSearch'>;

type ResultRow = {
  id: string;
  authorId: string | null;
  authorName: string;
  text: string;
  createdAt: string;
  mediaType: MediaType | null;
  mediaName: string | null;
};

/** Escapes ILIKE wildcards so a search for "50%" or "a_b" doesn't behave
 *  like a pattern — and strips characters that would break PostgREST's
 *  comma-separated `.or()` filter syntax. */
function sanitizeQuery(q: string) {
  return q.trim().replace(/[%_,()]/g, ' ').trim();
}

const MIN_CHARS = 2;
const RESULT_LIMIT = 60;

export default function GroupSearchScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { members } = useGroupMembers(groupId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.displayName])), [members]);

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

      // Sender-name matches resolve against the (small, already-loaded)
      // member list rather than a join — a name is embedded as plain text
      // in the mention system anyway, so this alone also naturally covers
      // most "search mentions" cases.
      const matchingAuthorIds = members
        .filter((m) => m.displayName.toLowerCase().includes(clean.toLowerCase()))
        .map((m) => m.id);

      const orParts = [`text.ilike.%${clean}%`, `media_name.ilike.%${clean}%`];
      if (matchingAuthorIds.length > 0) orParts.push(`author_id.in.(${matchingAuthorIds.join(',')})`);

      // Server-side query scoped to this group only — never pulls the whole
      // chat history client-side just to filter it.
      const { data } = await supabase
        .from('messages')
        .select('id, author_id, text, created_at, media_type, media_name')
        .eq('group_id', groupId)
        .eq('is_deleted', false)
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(RESULT_LIMIT);

      if (myRequest !== requestId.current) return; // a newer keystroke superseded this
      setResults(
        (data ?? []).map((r) => ({
          id: r.id,
          authorId: r.author_id,
          authorName: r.author_id ? nameById.get(r.author_id) ?? 'someone' : 'Deleted User',
          text: r.text,
          createdAt: r.created_at,
          mediaType: r.media_type as MediaType | null,
          mediaName: r.media_name,
        }))
      );
      setSearching(false);
      setSearched(true);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, groupId, members, nameById]);

  function openResult(id: string) {
    navigation.navigate('Chat', { groupId, jumpToMessageId: id });
  }

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={16} color={colors.onSurfaceVariant} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search messages..."
              placeholderTextColor={colors.onSurfaceVariant}
              style={styles.input}
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>

        {sanitizeQuery(query).length < MIN_CHARS ? (
          <EmptyState emoji="🔎" text="Search this GC by text, sender, or filename." />
        ) : searched && results.length === 0 && !searching ? (
          <EmptyState emoji="🔎" text="Nothing found." />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const mediaLabel = item.mediaType ? describeMedia(item.mediaType, item.mediaName) : null;
              return (
                <Animated.View
                  entering={FadeInDown.delay(Math.min(index, 8) * 20)
                    .duration(duration.base)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <PressableScale scaleTo={0.98} onPress={() => openResult(item.id)}>
                    <GlassPanel borderRadius={radius.lg} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.author} numberOfLines={1}>
                          {item.authorName}
                        </Text>
                        <Text style={styles.time}>
                          {dayLabel(item.createdAt)}, {clockTime(item.createdAt)}
                        </Text>
                      </View>
                      <View style={styles.previewRow}>
                        {mediaLabel && (
                          <Ionicons name={mediaLabel.icon} size={13} color={colors.onSurfaceVariant} />
                        )}
                        <Text style={styles.previewText} numberOfLines={2}>
                          {item.text || mediaLabel?.label || '…'}
                        </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.stroke,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  input: { flex: 1, ...typography.body, fontSize: 15, color: colors.onSurface, paddingVertical: 0 },
  list: { padding: CONTAINER_MARGIN, gap: spacing.sm + 2 },
  card: { padding: spacing.md + 2, gap: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  author: { ...typography.bodyMedium, fontSize: 14, color: colors.onSurface, flexShrink: 1 },
  time: { ...typography.caption, fontSize: 11, color: colors.outline },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewText: { ...typography.body, fontSize: 13.5, color: colors.onSurfaceVariant, flexShrink: 1 },
});
