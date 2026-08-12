import { useMemo } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { reactionCatalog } from '../data/reactions';
import { PressableScale } from './ui/PressableScale';
import { selectFeedback } from '../utils/haptics';

/** Reactions people actually reach for most — the rest live behind "+". */
const QUICK_REACTIONS = reactionCatalog.slice(0, 6);

export type MessageActionTarget = {
  id: string;
  authorName: string;
  text: string;
  isMine: boolean;
  /** Owner/admin moderation rights, independent of authorship. */
  canModerate: boolean;
};

/** Where the long-pressed bubble was, so the menu opens right next to it
 *  instead of sliding up from the bottom of the screen. */
export type MessageActionAnchor = {
  /** Screen-space Y of the touch that triggered the long-press. */
  y: number;
  /** Which side the bubble sits on — the menu hugs the same side. */
  mine: boolean;
};

/**
 * iOS-style contextual menu: a quick-reaction bar and an action list open
 * right where you pressed, instead of a bottom-sheet drawer. What's offered
 * depends on who's looking — mirrors the same eligibility rules as before,
 * the server (RLS + the edit trigger) is still what enforces them for real.
 */
export function MessageActionSheet({
  visible,
  target,
  anchor,
  onQuickReact,
  onMoreReactions,
  onReply,
  onCopy,
  onShare,
  onEdit,
  onDelete,
  onSelect,
  onClose,
}: {
  visible: boolean;
  target: MessageActionTarget | null;
  anchor: MessageActionAnchor | null;
  onQuickReact: (emoji: string, label: string) => void;
  onMoreReactions: () => void;
  onReply: () => void;
  onCopy: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onClose: () => void;
}) {
  const layout = useMemo(() => {
    if (!anchor) return null;
    const screenHeight = Dimensions.get('window').height;
    const estimatedHeight = 330;
    
    const invert = anchor.y + estimatedHeight > screenHeight - 40;
    
    const top = invert ? undefined : Math.max(anchor.y - 46, 56);
    const bottom = invert ? Math.max(screenHeight - anchor.y - 16, 20) : undefined;
    
    const alignItems: 'flex-end' | 'flex-start' = anchor.mine ? 'flex-end' : 'flex-start';
    return { top, bottom, alignItems, invert };
  }, [anchor]);

  if (!target || !layout) return null;

  const canDelete = target.isMine || target.canModerate;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            {Platform.OS !== 'web' && (
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            )}
          </Pressable>
        </Animated.View>

        <View 
          style={[
            styles.stack, 
            { 
              top: layout.top, 
              bottom: layout.bottom,
              alignItems: layout.alignItems,
              flexDirection: layout.invert ? 'column-reverse' : 'column'
            }
          ]} 
          pointerEvents="box-none"
        >
          <Animated.View
            entering={ZoomIn.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
            exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
            style={styles.reactionBar}
          >
            {Platform.OS !== 'web' && (
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.reactionBarInner}>
              {QUICK_REACTIONS.map((r) => (
                <PressableScale
                  key={r.emoji}
                  style={styles.emojiItem}
                  scaleTo={1.25}
                  haptic="medium"
                  onPress={() => {
                    selectFeedback();
                    onQuickReact(r.emoji, r.label);
                  }}
                >
                  <Text style={styles.emojiText}>{r.emoji}</Text>
                </PressableScale>
              ))}
              <PressableScale style={styles.moreButton} scaleTo={1.15} haptic="light" onPress={onMoreReactions}>
                <Ionicons name="add" size={18} color={colors.onSurfaceVariant} />
              </PressableScale>
            </View>
          </Animated.View>

          <Animated.View
            entering={ZoomIn.duration(duration.base).delay(20).easing(easing.out).reduceMotion(reduceMotion)}
            exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
            style={styles.previewCard}
          >
            {Platform.OS !== 'web' && (
              <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <Text style={styles.previewAuthor} numberOfLines={1}>
              {target.isMine ? 'You' : target.authorName}
            </Text>
            <Text style={styles.previewText} numberOfLines={3}>
              {target.text}
            </Text>
          </Animated.View>

          <Animated.View
            entering={ZoomIn.duration(duration.base).delay(40).easing(easing.out).reduceMotion(reduceMotion)}
            exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
            style={styles.menu}
          >
            {Platform.OS !== 'web' && (
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.menuInner}>
              <MenuRow icon="arrow-undo-outline" label="Reply" onPress={onReply} />
              <Divider />
              <MenuRow icon="copy-outline" label="Copy" onPress={onCopy} />
              <Divider />
              <MenuRow icon="share-outline" label="Share" onPress={onShare} />
              {target.isMine && (
                <>
                  <Divider />
                  <MenuRow icon="pencil-outline" label="Edit" onPress={onEdit} />
                </>
              )}
              <Divider />
              <MenuRow icon="checkmark-circle-outline" label="Select" onPress={onSelect} />
              {canDelete && (
                <>
                  <Divider />
                  <MenuRow icon="trash-outline" label="Delete" onPress={onDelete} destructive />
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableScale style={styles.row} scaleTo={0.98} haptic="medium" onPress={onPress}>
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      <Ionicons name={icon} size={17} color={destructive ? colors.error : colors.onSurface} />
    </PressableScale>
  );
}

const MENU_WIDTH = 232;

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  stack: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm + 2,
  },

  reactionBar: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22, 22, 34, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  reactionBarInner: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  emojiItem: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 2,
  },

  previewCard: {
    maxWidth: MENU_WIDTH + 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(28, 28, 42, 0.85)',
    borderWidth: 1,
    borderColor: glass.stroke,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
  },
  previewAuthor: { ...typography.label, fontSize: 10, color: colors.onSurfaceVariant, marginBottom: 2 },
  previewText: { ...typography.body, fontSize: 14, color: colors.onSurface },

  menu: {
    width: MENU_WIDTH,
    borderRadius: radius.md + 2,
    backgroundColor: 'rgba(30, 30, 44, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuInner: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  rowLabel: { ...typography.bodyMedium, fontSize: 15.5, color: colors.onSurface },
  rowLabelDestructive: { color: colors.error },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
});
