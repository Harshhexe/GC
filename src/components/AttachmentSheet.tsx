import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';

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
  onPasteImage,
  hasClipboardImage,
  onClose,
  onClosed,
}: {
  visible: boolean;
  onCamera: () => void;
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
  onPasteImage?: () => void;
  hasClipboardImage?: boolean;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const actions: AttachmentAction[] = [
    {
      id: 'camera',
      label: 'Camera',
      icon: 'camera',
      color: '#06B6D4',
      onPress: () => {
        onClose();
        onCamera();
      },
    },
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

  const content = (
    <View style={styles.sheetAnchor}>
      <Animated.View
        entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
        exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          {Platform.OS !== 'web' && (
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          )}
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
        exiting={SlideOutDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
        style={styles.sheet}
      >
        {/* Top grabber */}
        <View style={styles.grabber} />

        {hasClipboardImage && onPasteImage && (
          <PressableScale
            style={styles.pasteBanner}
            scaleTo={0.97}
            haptic="medium"
            onPress={() => {
              onClose();
              onPasteImage();
            }}
          >
            <View style={styles.pasteBannerLeft}>
              <View style={styles.pasteIconOrb}>
                <Ionicons name="clipboard" size={16} color="#818CF8" />
              </View>
              <Text style={styles.pasteBannerText}>Paste copied image</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.4)" />
          </PressableScale>
        )}

        {/* 8 Action Boxes Grid (2 rows x 4 columns) */}
        <View style={styles.grid}>
          {actions.map((item) => (
            <ActionBox key={item.id} action={item} />
          ))}
        </View>
      </Animated.View>
    </View>
  );

  // RN's Modal portals to document.body on web, escaping the desktop shell's
  // rail/sidebar/pane layout and covering the whole browser window instead of
  // just the chat pane. Render as a plain overlay confined to this screen instead.
  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View style={styles.webOverlay} pointerEvents="box-none">
        {content}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={onClosed}
    >
      {content}
    </Modal>
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
  webOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
  backdrop: { flex: 1, backgroundColor: 'rgba(5, 5, 10, 0.75)' },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0F131E',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm + 2,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl + 8 : spacing.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },

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
  pasteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(99, 102, 241, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
  },
  pasteBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pasteIconOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(99, 102, 241, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteBannerText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13.5,
    color: '#FFFFFF',
  },
});
