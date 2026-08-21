import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
// expo-image for the same reason as the transcript: a grid of remote photos
// is exactly where a real disk cache earns its keep.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { signedUrlFor, useSignedMediaUrl } from '../lib/mediaUrl';
import { useVideoPoster } from '../hooks/useVideoPoster';
import { supabase } from '../lib/supabase';
import { formatFileSize } from '../lib/media';
import { dayLabel, clockTime } from '../utils/time';
import type { MediaType, MessageMedia } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MediaLinksFiles'>;

type Tab = 'media' | 'links' | 'files';

type MediaRow = {
  id: string;
  authorId: string | null;
  createdAt: string;
  media: MessageMedia;
};

type LinkRow = {
  messageId: string;
  authorId: string | null;
  createdAt: string;
  url: string;
  domain: string;
  text: string;
};

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|co|dev|app|ai|me)\b[^\s]*)/gi;

function domainFor(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** One cell of the media grid. Its own component so the poster fallback for
 *  older videos can be a hook rather than work repeated per render. */
function GridTile({ item, onPress }: { item: MediaRow; onPress: () => void }) {
  const isVideo = item.media.type === 'video';
  const signedUrl = useSignedMediaUrl(item.media.url);
  const signedThumb = useSignedMediaUrl(item.media.thumbUrl);
  const derivedPoster = useVideoPoster(isVideo && !item.media.thumbUrl ? signedUrl : null);
  const previewUri = isVideo ? signedThumb ?? derivedPoster : signedUrl;

  return (
    <PressableScale scaleTo={0.95} style={styles.gridItem} onPress={onPress}>
      {!!previewUri && (
        <Image
          source={previewUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          recyclingKey={item.id}
        />
      )}
      {isVideo && (
        <View style={styles.gridPlay}>
          <Ionicons name="play" size={16} color="#FFFFFF" />
        </View>
      )}
    </PressableScale>
  );
}

export default function MediaLinksFilesScreen({ route, navigation }: Props) {
  const { groupId, initialTab } = route.params;
  const { members } = useGroupMembers(groupId);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'media');
  const [loading, setLoading] = useState(true);
  const [mediaRows, setMediaRows] = useState<MediaRow[]>([]);
  const [linkRows, setLinkRows] = useState<LinkRow[]>([]);
  const [fileRows, setFileRows] = useState<MediaRow[]>([]);
  const [viewingMedia, setViewingMedia] = useState<MediaRow | null>(null);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.displayName])), [members]);
  const nameFor = (id: string | null) => (id ? nameById.get(id) ?? 'someone' : 'Deleted User');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: mediaMsgs }, { data: fileMsgs }, { data: linkMsgs }] = await Promise.all([
        supabase
          .from('messages')
          .select(
            'id, author_id, created_at, media_url, media_thumb_url, media_type, media_mime, media_name, media_size, media_width, media_height, media_duration_ms'
          )
          .eq('group_id', groupId)
          .eq('is_deleted', false)
          .in('media_type', ['image', 'gif', 'video'])
          // A view-once photo listed here would be permanently re-viewable,
          // which is exactly the thing it promises not to be.
          .eq('media_view_once', false)
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('messages')
          .select('id, author_id, created_at, media_url, media_mime, media_name, media_size')
          .eq('group_id', groupId)
          .eq('is_deleted', false)
          .eq('media_type', 'file')
          .order('created_at', { ascending: false })
          .limit(150),
        // Coarse server-side prefilter — only messages that could plausibly
        // contain a link get pulled down; the real URL_RE match happens
        // client-side just on this much smaller set.
        supabase
          .from('messages')
          .select('id, author_id, created_at, text')
          .eq('group_id', groupId)
          .eq('is_deleted', false)
          .or('text.ilike.%http%,text.ilike.%www.%,text.ilike.%.com%,text.ilike.%.org%,text.ilike.%.io%')
          .order('created_at', { ascending: false })
          .limit(150),
      ]);

      if (cancelled) return;

      setMediaRows(
        (mediaMsgs ?? []).map((r) => ({
          id: r.id,
          authorId: r.author_id,
          createdAt: r.created_at,
          media: {
            url: r.media_url!,
            thumbUrl: r.media_thumb_url,
            type: r.media_type as MediaType,
            mime: r.media_mime ?? '',
            name: r.media_name,
            size: r.media_size,
            width: r.media_width,
            height: r.media_height,
            durationMs: r.media_duration_ms,
          },
        }))
      );

      setFileRows(
        (fileMsgs ?? []).map((r) => ({
          id: r.id,
          authorId: r.author_id,
          createdAt: r.created_at,
          media: {
            url: r.media_url!,
            type: 'file',
            mime: r.media_mime ?? '',
            name: r.media_name,
            size: r.media_size,
            width: null,
            height: null,
            durationMs: null,
          },
        }))
      );

      const links: LinkRow[] = [];
      for (const row of linkMsgs ?? []) {
        const matches = row.text.match(URL_RE);
        if (!matches) continue;
        for (const rawUrl of matches) {
          const url = rawUrl.toLowerCase().startsWith('http') ? rawUrl : `https://${rawUrl}`;
          links.push({
            messageId: row.id,
            authorId: row.author_id,
            createdAt: row.created_at,
            url,
            domain: domainFor(url),
            text: row.text,
          });
        }
      }
      setLinkRows(links);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function jumpToMessage(messageId: string) {
    setViewingMedia(null);
    navigation.navigate('Chat', { groupId, jumpToMessageId: messageId });
  }

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="Media, Links & Files"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
        />

        <View style={styles.tabRow}>
          {(['media', 'links', 'files'] as Tab[]).map((t) => (
            <PressableScale
              key={t}
              scaleTo={0.96}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'media' ? 'Media' : t === 'links' ? 'Links' : 'Files'}
              </Text>
            </PressableScale>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>loading…</Text>
          </View>
        ) : tab === 'media' ? (
          mediaRows.length === 0 ? (
            <EmptyState emoji="📸" text="No memories here yet." />
          ) : (
            <FlatList
              key="media-list"
              data={mediaRows}
              keyExtractor={(r) => r.id}
              numColumns={3}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <GridTile item={item} onPress={() => setViewingMedia(item)} />
              )}
            />
          )
        ) : tab === 'links' ? (
          linkRows.length === 0 ? (
            <EmptyState emoji="🔗" text="No links have been dropped yet." />
          ) : (
            <FlatList
              key="links-list"
              data={linkRows}
              keyExtractor={(r, i) => `${r.messageId}-${i}`}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <GlassPanel borderRadius={radius.lg} style={styles.rowCard}>
                  <PressableScale
                    style={styles.rowCardTap}
                    scaleTo={0.98}
                    onPress={() => Linking.openURL(item.url).catch(() => {})}
                  >
                    <View style={styles.linkIcon}>
                      <Ionicons name="link" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowDomain} numberOfLines={1}>
                        {item.domain}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        Shared by {nameFor(item.authorId)} · {dayLabel(item.createdAt)}
                      </Text>
                    </View>
                  </PressableScale>
                  <PressableScale
                    hitSlop={8}
                    scaleTo={0.85}
                    onPress={() => jumpToMessage(item.messageId)}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.onSurfaceVariant} />
                  </PressableScale>
                </GlassPanel>
              )}
            />
          )
        ) : fileRows.length === 0 ? (
          <EmptyState emoji="📄" text="No files here." />
        ) : (
          <FlatList
            key="files-list"
            data={fileRows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <GlassPanel borderRadius={radius.lg} style={styles.rowCard}>
                <PressableScale
                  style={styles.rowCardTap}
                  scaleTo={0.98}
                  onPress={() => {
                    // Handing the raw URL to the browser 400s now that the
                    // bucket is private — sign it first, then open.
                    signedUrlFor(item.media.url).then((u) => {
                      if (u) Linking.openURL(u).catch(() => {});
                    });
                  }}
                >
                  <View style={styles.linkIcon}>
                    <Ionicons name="document-text" size={18} color={colors.secondary} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowDomain} numberOfLines={1}>
                      {item.media.name || 'Document'}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.media.size != null ? `${formatFileSize(item.media.size)} · ` : ''}
                      Shared by {nameFor(item.authorId)} · {dayLabel(item.createdAt)}
                    </Text>
                  </View>
                </PressableScale>
                <PressableScale hitSlop={8} scaleTo={0.85} onPress={() => jumpToMessage(item.id)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.onSurfaceVariant} />
                </PressableScale>
              </GlassPanel>
            )}
          />
        )}
      </SafeAreaView>

      <MediaViewerModal
        media={viewingMedia?.media ?? null}
        onClose={() => setViewingMedia(null)}
        onJumpToMessage={viewingMedia ? () => jumpToMessage(viewingMedia.id) : undefined}
      />
    </View>
  );
}

const GRID_GAP = 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.onSurfaceVariant },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: CONTAINER_MARGIN,
    paddingBottom: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  tabActive: { backgroundColor: 'rgba(208, 188, 255, 0.14)', borderColor: 'rgba(208, 188, 255, 0.4)' },
  tabText: { ...typography.label, fontSize: 13, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.primary },
  grid: { paddingHorizontal: CONTAINER_MARGIN - GRID_GAP, paddingBottom: spacing.xxl },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: GRID_GAP,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  gridPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  list: { padding: CONTAINER_MARGIN, gap: spacing.sm + 2 },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowCardTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 1 },
  rowDomain: { ...typography.bodyMedium, fontSize: 14, color: colors.onSurface },
  rowSub: { ...typography.caption, fontSize: 11.5, color: colors.outline },
});
