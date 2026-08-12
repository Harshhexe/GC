import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { describeMedia } from '../lib/media';
import type { MessageKind } from '../types';

function snippetFor(text: string, kind: MessageKind) {
  if (kind !== 'text') {
    const meta = describeMedia(kind, text);
    // For a document the "label" IS the filename, so there's nothing to
    // append; media with a real caption shows both.
    const label = kind === 'file' ? meta.label : `${meta.label}${text ? ` — ${text}` : ''}`;
    return { icon: meta.icon, label };
  }
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const truncated = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  return { icon: null, label: truncated };
}

/**
 * The quoted-message strip used both above the composer (reply mode) and
 * inside a sent bubble (the reply itself). Same visual language everywhere —
 * a coloured rail, sender name, one-line snippet — so a reply always reads
 * the same regardless of where it's rendered.
 */
export function MessageQuotePreview({
  authorName,
  text,
  kind,
  isDeleted,
  accentColor,
  isMine,
  onPress,
  onClose,
  compact = false,
}: {
  authorName: string;
  text: string;
  kind: MessageKind;
  isDeleted?: boolean;
  accentColor: string;
  /** Was the *original* message sent by the current user. */
  isMine?: boolean;
  /** Bubble variant: tap to jump to the original. */
  onPress?: () => void;
  /** Composer variant: X to cancel reply mode. */
  onClose?: () => void;
  /** Slightly tighter — used inside a bubble rather than above the composer. */
  compact?: boolean;
}) {
  const snippet = isDeleted ? null : snippetFor(text, kind);

  const content = (
    <View style={[styles.row, compact && styles.rowCompact, { borderLeftColor: accentColor }]}>
      <View style={styles.copy}>
        {!isDeleted && (
          <View style={styles.headerRow}>
            <Ionicons name="arrow-undo" size={11} color={accentColor} style={styles.replyIcon} />
            <Text style={[styles.author, { color: accentColor }]} numberOfLines={1}>
              {isMine ? 'You' : authorName}
            </Text>
          </View>
        )}
        {isDeleted ? (
          <Text style={styles.deletedText}>Original message was deleted</Text>
        ) : (
          <View style={styles.snippetRow}>
            {snippet?.icon && (
              <Ionicons name={snippet.icon} size={13} color={colors.onSurfaceVariant} style={styles.snippetIcon} />
            )}
            <Text style={styles.snippetText} numberOfLines={1}>
              {snippet?.label || '…'}
            </Text>
          </View>
        )}
      </View>

      {onClose && (
        <Pressable hitSlop={8} onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableScale scaleTo={0.98} haptic="light" onPress={onPress}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  rowCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 5,
    paddingVertical: 6,
  },
  // flexShrink (not flex:1 / flexBasis:0) so this contributes its real content
  // width when the parent bubble is sizing itself to content — a flexBasis:0
  // child is excluded from that measurement entirely and collapses to ~0.
  copy: { flexShrink: 1, gap: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyIcon: { marginTop: -1 },
  author: { ...typography.label, fontSize: 11 },
  snippetRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  snippetIcon: { marginTop: -1 },
  snippetText: { ...typography.caption, fontSize: 12.5, color: colors.onSurfaceVariant, flexShrink: 1 },
  deletedText: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.outline,
    fontStyle: 'italic',
  },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
});
