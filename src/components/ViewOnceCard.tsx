import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import type { MessageMedia } from '../types';

/**
 * A view-once attachment before (and after) it's opened. Never renders the
 * media itself — the whole point is that a thumbnail sitting in the transcript
 * would already be the second look.
 *
 * Three states: yours (waiting, or opened by someone), theirs unopened
 * (tappable), theirs already opened (spent, inert).
 */
export function ViewOnceCard({
  media,
  isMine,
  tint,
  onPress,
  onLongPress,
}: {
  media: MessageMedia;
  isMine: boolean;
  tint: string;
  onPress: () => void;
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const noun = media.type === 'video' ? 'Video' : 'Photo';

  const consumed = isMine ? !!media.viewedByAnyone : !!media.viewed;
  const canOpen = !isMine && !media.viewed;
  const viewers = media.viewers ?? [];

  const label = isMine
    ? viewers.length > 0
      ? `Opened by ${viewers[0].name}${viewers.length > 1 ? ` +${viewers.length - 1}` : ''}`
      : `${noun} · View once`
    : media.viewed
      ? 'Opened'
      : `View once ${noun.toLowerCase()}`;

  const hint = isMine
    ? viewers.length > 0
      ? 'Media expired'
      : 'They get one look.'
    : media.viewed
      ? 'That was your one look.'
      : 'Tap to open — once.';

  return (
    <PressableScale
      style={[
        styles.card,
        { backgroundColor: consumed ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.07)' },
        consumed && styles.cardSpent,
      ]}
      scaleTo={canOpen ? 0.98 : 1}
      haptic={canOpen ? 'medium' : undefined}
      // Anything not openable is inert: no press target at all, rather than a
      // tap that silently does nothing.
      onPress={canOpen ? onPress : undefined}
      onLongPress={onLongPress}
    >
      <View style={[styles.icon, { backgroundColor: consumed ? 'rgba(255, 255, 255, 0.06)' : `${tint}26` }]}>
        <Ionicons
          name={consumed ? 'eye-off-outline' : media.type === 'video' ? 'videocam' : 'flame'}
          size={20}
          color={consumed ? colors.outline : tint}
        />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.label, consumed && styles.labelSpent]}>
          {label}
        </Text>
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
      </View>

      {/* Avatar Stack of Viewers */}
      {viewers.length > 0 ? (
        <View style={styles.viewerAvatars}>
          {viewers.slice(0, 3).map((v, i) => (
            <View
              key={v.id || i}
              style={[
                styles.avatarCircle,
                { backgroundColor: v.avatarColor || '#B98CFF', marginLeft: i > 0 ? -8 : 0 },
              ]}
            >
              {v.avatarUrl ? (
                <Image source={{ uri: v.avatarUrl }} style={styles.avatarImage} cachePolicy="memory-disk" />
              ) : (
                <Text style={styles.avatarEmoji}>{v.avatarEmoji || '👤'}</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        !consumed && (
          <View style={[styles.badge, { borderColor: `${tint}B3`, backgroundColor: `${tint}1E` }]}>
            <Text style={[styles.badgeText, { color: tint }]}>1</Text>
          </View>
        )
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 235,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  cardSpent: { backgroundColor: 'rgba(255, 255, 255, 0.02)' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2, justifyContent: 'center' },
  label: { ...typography.bodyMedium, fontSize: 14, fontWeight: '600', color: colors.onSurface },
  labelSpent: { color: colors.outline, fontStyle: 'italic', fontWeight: '400' },
  hint: { ...typography.micro, fontSize: 11.5, color: colors.onSurfaceVariant },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  badgeText: { ...typography.label, fontSize: 11, fontWeight: '700' },
  viewerAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#19192B',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEmoji: {
    fontSize: 11,
    lineHeight: 13,
  },
});
