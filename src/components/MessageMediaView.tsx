import { GestureResponderEvent, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { formatFileSize } from '../lib/media';
import { PressableScale } from './ui/PressableScale';
import type { MessageMedia } from '../types';

const MAX_WIDTH = 230;
const MAX_HEIGHT = 300;
const MIN_HEIGHT = 140;

function boxFor(media: MessageMedia) {
  if (!media.width || !media.height) return { width: MAX_WIDTH, height: MIN_HEIGHT };
  const ratio = media.width / media.height;
  let width = MAX_WIDTH;
  let height = width / ratio;
  if (height > MAX_HEIGHT) {
    height = MAX_HEIGHT;
    width = height * ratio;
  }
  if (height < MIN_HEIGHT) height = MIN_HEIGHT;
  return { width, height };
}

function formatDuration(ms: number | null) {
  if (!ms) return null;
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Renders whatever a message is carrying — inline image/gif, a tappable
 *  video card, or a document card. Lives inside the bubble, above the
 *  caption text (if any). */
export function MessageMediaView({
  media,
  onPress,
  onLongPress,
}: {
  media: MessageMedia;
  onPress: () => void;
  /** So long-pressing the media itself still opens the message action menu,
   *  anchored at the real touch position. */
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  if (media.type === 'file') {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        scaleTo={0.98}
        haptic="light"
        style={styles.fileCard}
      >
        <View style={styles.fileIcon}>
          <Ionicons name="document-text" size={22} color={colors.primary} />
        </View>
        <View style={styles.fileCopy}>
          <Text style={styles.fileName} numberOfLines={1}>
            {media.name || 'Document'}
          </Text>
          {media.size != null && <Text style={styles.fileMeta}>{formatFileSize(media.size)}</Text>}
        </View>
        <Ionicons name="download-outline" size={18} color={colors.onSurfaceVariant} />
      </PressableScale>
    );
  }

  const box = boxFor(media);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.98}
      haptic="light"
      style={[styles.mediaBox, { width: box.width, height: box.height }]}
    >
      <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {media.type === 'video' && (
        <View style={styles.videoOverlay}>
          <View style={styles.playCircle}>
            <Ionicons name="play" size={22} color="#FFFFFF" />
          </View>
          {!!formatDuration(media.durationMs) && (
            <View style={styles.durationChip}>
              <Text style={styles.durationText}>{formatDuration(media.durationMs)}</Text>
            </View>
          )}
        </View>
      )}
      {media.type === 'gif' && (
        <View style={styles.gifChip}>
          <Text style={styles.gifChipText}>GIF</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  mediaBox: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChip: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { ...typography.micro, fontSize: 10, color: '#FFFFFF' },
  gifChip: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gifChipText: { ...typography.label, fontSize: 9, color: '#FFFFFF' },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    minWidth: 200,
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCopy: { flex: 1, gap: 1 },
  fileName: { ...typography.bodyMedium, fontSize: 13.5, color: colors.onSurface },
  fileMeta: { ...typography.micro, fontSize: 11, color: colors.onSurfaceVariant },
});
