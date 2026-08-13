import { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, glass, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { usePinnedMessages } from '../hooks/usePinnedMessages';
import { describeMedia } from '../lib/media';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { dayLabel, clockTime } from '../utils/time';
import type { PinnedMessage } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PinnedMessages'>;

type Preview = { icon: keyof typeof Ionicons.glyphMap | null; label: string };

function previewFor(p: PinnedMessage): Preview {
  if (!p.exists) return { icon: null, label: 'Original message deleted' };
  if (p.text) return { icon: null, label: p.text };
  if (p.mediaType) return describeMedia(p.mediaType, p.mediaName);
  return { icon: null, label: '…' };
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
    const go = () => unpin(p.messageId);
    if (Platform.OS === 'web') {
      if (window.confirm('Unpin this message?')) go();
      return;
    }
    Alert.alert('Unpin this message?', undefined, [
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
      <AmbientBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="Pinned Messages"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
        />

        {loading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>loading…</Text>
          </View>
        ) : pins.length === 0 ? (
          <EmptyState emoji="📌" text="Nothing pinned yet." />
        ) : (
          <FlatList
            data={pins}
            keyExtractor={(p) => p.messageId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const preview = previewFor(item);
              return (
                <Animated.View
                  entering={FadeInDown.delay(Math.min(index, 6) * STAGGER_MS)
                    .duration(duration.slow)
                    .easing(easing.out)
                    .reduceMotion(reduceMotion)}
                >
                  <PressableScale scaleTo={0.98} onPress={() => openMessage(item)}>
                    <GlassPanel borderRadius={radius.lg} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.author} numberOfLines={1}>
                          {item.exists ? item.authorName : 'Deleted message'}
                        </Text>
                        {canModerate && (
                          <PressableScale
                            hitSlop={8}
                            scaleTo={0.85}
                            onPress={() => confirmUnpin(item)}
                          >
                            <Ionicons name="close-circle" size={18} color={colors.outline} />
                          </PressableScale>
                        )}
                      </View>

                      <View style={styles.previewRow}>
                        {preview.icon && (
                          <Ionicons name={preview.icon} size={14} color={colors.onSurfaceVariant} />
                        )}
                        <Text
                          style={[styles.previewText, !item.exists && styles.previewTextDeleted]}
                          numberOfLines={2}
                        >
                          {preview.label}
                        </Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Ionicons name="pin" size={11} color={colors.primary} />
                        <Text style={styles.metaText}>
                          Pinned by {item.pinnedByName} · {dayLabel(item.pinnedAt)}, {clockTime(item.pinnedAt)}
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
  list: { padding: CONTAINER_MARGIN, gap: spacing.md },
  card: { padding: spacing.lg, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { ...typography.bodyMedium, fontSize: 15, color: colors.onSurface, flexShrink: 1 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewText: { ...typography.body, fontSize: 14, color: colors.onSurfaceVariant, flexShrink: 1 },
  previewTextDeleted: { fontStyle: 'italic', color: colors.outline },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { ...typography.caption, fontSize: 11.5, color: colors.outline },
});
