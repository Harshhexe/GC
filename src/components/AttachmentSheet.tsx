import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, radius, spacing } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { DraggableSheet } from './ui/DraggableSheet';

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
  /** A Tea is already live in this GC */
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

  return (
    <DraggableSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      {/* 8 Action Boxes Grid (2 rows x 4 columns) */}
      <View style={styles.grid}>
        {actions.map((item) => (
          <ActionBox key={item.id} action={item} />
        ))}
      </View>
    </DraggableSheet>
  );
}

function ActionBox({ action }: { action: AttachmentAction }) {
  return (
    <PressableScale
      style={[styles.box, action.disabled && styles.boxDisabled]}
      scaleTo={action.disabled ? 1 : 0.94}
      haptic={action.disabled ? undefined : 'medium'}
      disabled={action.disabled}
      onPress={action.onPress}
    >
      {/* Icon/Emoji Circle */}
      <View
        style={[
          styles.iconOrb,
          {
            backgroundColor: `${action.color}1C`,
            borderColor: `${action.color}45`,
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

      {/* Label */}
      <Text style={styles.boxLabel} numberOfLines={1}>
        {action.label}
      </Text>

      {/* Live / Status Badge if any */}
      {action.badge && (
        <View style={[styles.badge, { backgroundColor: action.color }]}>
          <Text style={styles.badgeText}>{action.badge}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // 4 columns x 2 rows
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },

  // Each Box Card
  box: {
    width: '23%',
    aspectRatio: 0.95,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  boxDisabled: {
    opacity: 0.5,
  },
  iconOrb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    paddingHorizontal: 5,
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
