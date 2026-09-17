import { Platform, StyleSheet, Text, View, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { fontFamily, radius, spacing, colors, shadows } from '../theme/theme';
import { duration, easing, STAGGER_MS, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { DraggableSheet } from './ui/DraggableSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMNS = 4;
const BOX_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS;

export type AttachmentAction = {
  id: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  isGif?: boolean;
  color: string;
  badge?: string;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * Opened by the composer's "+" — 8 quick action boxes.
 *
 * The boxes replay their staggered entrance every time the sheet opens by
 * remounting (the row key is derived from `visible`), which works on both
 * native (DraggableSheet keeps its children mounted inside a Modal) and web
 * (DraggableSheet unmounts children entirely).
 */
export function AttachmentSheet({
  visible,
  onCamera,
  onLibrary,
  onDocument,
  onGif,
  onSticker,
  onPoll,
  onWordy,
  onWordle,
  onStartTea,
  teaActive,
  onClose,
  onClosed,
}: {
  visible: boolean;
  onCamera?: () => void;
  onLibrary: () => void;
  onDocument: () => void;
  onGif: () => void;
  onSticker: () => void;
  onPoll?: () => void;
  onWordy?: () => void;
  onWordle?: () => void;
  onStartTea?: () => void;
  teaActive?: boolean;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const actions: AttachmentAction[] = [
    {
      id: 'photos',
      label: 'Photos',
      icon: 'images',
      color: '#818CF8',
      onPress: () => {
        onClose();
        onLibrary();
      },
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: 'camera',
      color: '#38BDF8',
      onPress: () => {
        onClose();
        onCamera?.();
      },
    },
    {
      id: 'document',
      label: 'Document',
      icon: 'document-text',
      color: '#A855F7',
      onPress: () => {
        onClose();
        onDocument();
      },
    },
    {
      id: 'gif',
      label: 'GIF',
      isGif: true,
      color: '#F59E0B',
      onPress: () => {
        onClose();
        onGif();
      },
    },
    {
      id: 'sticker',
      label: 'Stickers',
      icon: 'happy',
      color: '#EC4899',
      onPress: () => {
        onClose();
        onSticker();
      },
    },
    {
      id: 'poll',
      label: 'Poll',
      icon: 'stats-chart',
      color: '#06B6D4',
      onPress: () => {
        onClose();
        onPoll?.();
      },
    },
    {
      id: 'wordy',
      label: 'Wordy',
      emoji: '🟩',
      color: '#10B981',
      onPress: () => {
        onClose();
        if (onWordy) onWordy();
        else onWordle?.();
      },
    },
    {
      id: 'tea',
      label: 'Tea',
      emoji: '🍵',
      color: '#14B8A6',
      badge: teaActive ? 'LIVE' : undefined,
      disabled: teaActive,
      onPress: () => {
        onClose();
        onStartTea?.();
      },
    },
  ];

  const stateKey = visible ? 'open' : 'closed';

  return (
    <DraggableSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attach</Text>
        <Text style={styles.headerSubtitle}>Share media, files & more</Text>
      </View>

      <View style={styles.grid}>
        {actions.map((action, index) => (
          <Animated.View
            key={`${action.id}-${stateKey}`}
            entering={FadeInDown.delay(Math.min(index, 7) * STAGGER_MS)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.cell}
          >
            <ActionBox action={action} />
          </Animated.View>
        ))}
      </View>
    </DraggableSheet>
  );
}

function ActionBox({ action }: { action: AttachmentAction }) {
  return (
    <PressableScale
      style={[styles.box, action.disabled && styles.boxDisabled]}
      scaleTo={action.disabled ? 1 : 0.93}
      haptic={action.disabled ? undefined : 'medium'}
      disabled={action.disabled}
      onPress={action.onPress}
    >
      <View
        style={[
          styles.iconOrb,
          {
            backgroundColor: `${action.color}1F`,
            borderColor: `${action.color}4D`,
            shadowColor: action.color,
            shadowOpacity: 0.35,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
        ]}
      >
        {action.emoji ? (
          <Text style={styles.emojiText}>{action.emoji}</Text>
        ) : action.isGif ? (
          <Text style={[styles.gifWordmark, { color: action.color }]}>GIF</Text>
        ) : action.icon ? (
          <Ionicons name={action.icon} size={22} color={action.color} />
        ) : null}
      </View>

      <Text style={styles.boxLabel} numberOfLines={1}>
        {action.label}
      </Text>

      {action.badge && (
        <View style={[styles.badge, { backgroundColor: action.color }]}>
          <Text style={styles.badgeText}>{action.badge}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: 2,
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.2,
  },
  cell: {
    width: '23%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  box: {
    aspectRatio: 0.95,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    gap: spacing.xs + 2,
    ...shadows.soft,
  },
  boxDisabled: {
    opacity: 0.5,
  },
  iconOrb: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    elevation: 3,
  },
  emojiText: {
    fontSize: 20,
  },
  gifWordmark: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  boxLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11.5,
    color: '#E2E8F0',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});