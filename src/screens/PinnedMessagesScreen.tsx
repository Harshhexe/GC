import { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/EmptyState';
import { usePinnedMessages } from '../hooks/usePinnedMessages';
import { describeMedia } from '../lib/media';
import { signedImageSource, useSignedMediaUrl } from '../lib/mediaUrl';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { dayLabel, clockTime, timeAgo } from '../utils/time';
import { successFeedback } from '../utils/haptics';
import type { PinnedMessage } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PinnedMessages'>;

type Preview = { icon: keyof typeof Ionicons.glyphMap | null; label: string };

function previewFor(p: PinnedMessage): Preview {
  if (!p.exists) return { icon: null, label: 'Original message was deleted' };
  if (p.text) return { icon: null, label: p.text };
  if (p.mediaType) return describeMedia(p.mediaType, p.mediaName);
  return { icon: null, label: '…' };
}

function PinMediaThumbnail({ mediaUrl, mediaThumbUrl, isVideo }: { mediaUrl?: string | null; mediaThumbUrl?: string | null; isVideo: boolean }) {
  const signedUrl = useSignedMediaUrl(mediaUrl ?? null);
  const signedThumb = useSignedMediaUrl(mediaThumbUrl ?? null);
  const previewUri = signedThumb ?? signedUrl;

  if (!previewUri) return null;

  return (
    <View style={styles.thumbnailContainer}>
      <Image
        source={signedImageSource(previewUri, mediaThumbUrl ?? mediaUrl ?? null)}
        style={styles.thumbnailImage}
        contentFit="cover"
        transition={180}
      />
      {isVideo && (
        <View style={styles.playBadge}>
          <Ionicons name="play" size={14} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

export default function PinnedMessagesScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { session } = useAuth();
  const { pins, loading, unpin } = usePinnedMessages(groupId);
  const [canModerate, setCanModerate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user.id) return;
    supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCanModerate(data?.role === 'owner' || data?.role === 'admin');
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, session?.user.id]);

  function confirmUnpin(p: PinnedMessage) {
    const go = () => {
      successFeedback();
      unpin(p.messageId);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Unpin this message from the group?')) go();
      return;
    }
    Alert.alert('Unpin message?', 'This message will no longer appear in the pinned list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpin', style: 'destructive', onPress: go },
    ]);
  }

  function openMessage(p: PinnedMessage) {
    if (!p.exists) return;
    navigation.navigate('Chat', { groupId, jumpToMessageId: p.messageId });
  }

  return (
    <View style={styles.root}>
      <AmbientBackground tint="#F59E0B" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="Pinned Messages"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
          right={
            pins.length > 0 ? (
              <View style={styles.countBadge}>
                <Ionicons name="pin" size={12} color="#F59E0B" />
                <Text style={styles.countBadgeText}>{pins.length}</Text>
              </View>
            ) : undefined
          }
        />

        {loading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>Loading pinned moments…</Text>
          </View>
        ) : pins.length === 0 ? (
          <EmptyState
            emoji="📌"
            text="No pinned messages yet. Long press any message in the chat and select 'Pin' to save it here."
          />
        ) : (
          <FlatList
            data={pins}
            keyExtractor={(p) => p.messageId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Animated.View
                entering={FadeInDown.duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
                style={styles.heroWrap}
              >
                <GlassPanel borderRadius={radius.xl} style={styles.heroCard}>
                  <LinearGradient
                    colors={['rgba(245, 158, 11, 0.16)', 'rgba(129, 140, 248, 0.04)', 'transparent']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={styles.heroContent}>
                    <View style={styles.heroPinWrap}>
                      <Ionicons name="pin" size={24} color="#F59E0B" />
                    </View>
                    <View style={styles.heroCopy}>
                      <Text style={styles.heroTitle}>Pinned Highlights</Text>
                      <Text style={styles.heroSubtitle}>
                        Iconic moments, rules, photos, and decisions saved for everyone in this chat.
                      </Text>
                    </View>
                  </View>
                </GlassPanel>
              </Animated.View>
            }
            renderItem={({ item, index }) => {
              const preview = previewFor(item);
              const isMedia = item.mediaType === 'image' || item.mediaType === 'video';

              return (
                <Animated.View
                  entering={FadeInDown.delay(Math.min(index + 1, 8) * STAGGER_MS)
                    .duration(duration.slow)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <PressableScale scaleTo={0.98} haptic="light" onPress={() => openMessage(item)}>
                    <GlassPanel borderRadius={radius.xl} style={styles.card}>
                      {/* Author & Header Row */}
                      <View style={styles.cardHeader}>
                        <View style={styles.authorGroup}>
                          <Avatar
                            imageUrl={item.authorAvatarUrl}
                            emoji={item.authorEmoji ?? '👤'}
                            label={item.authorName}
                            size={36}
                            ringColors={[item.authorColor ?? colors.primary, colors.secondary]}
                          />
                          <View style={styles.authorMeta}>
                            <Text style={styles.authorName} numberOfLines={1}>
                              {item.exists ? item.authorName : 'Deleted message'}
                            </Text>
                            <Text style={styles.msgDate}>
                              {timeAgo(item.messageCreatedAt)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardTopActions}>
                          {canModerate && (
                            <PressableScale
                              hitSlop={8}
                              scaleTo={0.85}
                              haptic="light"
                              onPress={() => confirmUnpin(item)}
                              style={styles.unpinBtn}
                            >
                              <Ionicons name="close" size={16} color={colors.outline} />
                            </PressableScale>
                          )}
                          <View style={styles.jumpArrow}>
                            <Ionicons name="arrow-forward" size={13} color={colors.onSurfaceVariant} />
                          </View>
                        </View>
                      </View>

                      {/* Content Preview */}
                      <View style={styles.bodyWrap}>
                        {isMedia && (
                          <PinMediaThumbnail
                            mediaUrl={item.mediaUrl}
                            mediaThumbUrl={item.mediaThumbUrl}
                            isVideo={item.mediaType === 'video'}
                          />
                        )}

                        <View style={styles.textWrap}>
                          {preview.icon && !isMedia && (
                            <Ionicons name={preview.icon} size={15} color="#818CF8" />
                          )}
                          <Text
                            style={[
                              styles.previewText,
                              !item.exists && styles.previewTextDeleted,
                            ]}
                            numberOfLines={isMedia ? 2 : 4}
                          >
                            {preview.label}
                          </Text>
                        </View>
                      </View>

                      {/* Footer Provenance */}
                      <View style={styles.cardFooter}>
                        <Ionicons name="pin" size={11} color="#F59E0B" />
                        <Text style={styles.pinnedByText}>
                          Pinned by <Text style={styles.pinnedByName}>{item.pinnedByName}</Text> · {dayLabel(item.pinnedAt)}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.onSurfaceVariant },

  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  countBadgeText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },

  list: { padding: CONTAINER_MARGIN, gap: spacing.md, paddingBottom: spacing.xxl },

  // Hero Card
  heroWrap: { marginBottom: spacing.xs },
  heroCard: {
    padding: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.22)',
    backgroundColor: 'rgba(24, 20, 30, 0.85)',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroPinWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, gap: 2 },
  heroTitle: {
    ...typography.titleMd,
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  heroSubtitle: {
    ...typography.body,
    fontSize: 12.5,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },

  // Pin Card
  card: {
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    flex: 1,
  },
  authorMeta: {
    flex: 1,
    gap: 1,
  },
  authorName: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.onSurface,
  },
  msgDate: {
    ...typography.caption,
    fontSize: 11,
    color: colors.outline,
  },
  cardTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unpinBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpArrow: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bodyWrap: {
    gap: spacing.xs + 2,
  },
  thumbnailContainer: {
    width: '100%',
    height: 150,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 4,
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  playBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  previewText: {
    ...typography.body,
    fontSize: 14.5,
    color: colors.onSurface,
    lineHeight: 20,
    flex: 1,
  },
  previewTextDeleted: {
    fontStyle: 'italic',
    color: colors.outline,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  pinnedByText: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.outline,
  },
  pinnedByName: {
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
});
