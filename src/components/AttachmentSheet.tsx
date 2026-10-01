import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAppearance } from '../context/AppearanceContext';
import { fontFamily, radius, spacing, colors } from '../theme/theme';
import { duration, easing, STAGGER_MS, reduceMotion } from '../theme/motion';
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
 * Opened by the composer's "+". Native uses a draggable sheet; web keeps
 * the actions in a small menu anchored beside the composer.
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
  const { theme } = useAppearance();
  const palette = theme.palette;
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, onClose]);

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

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View style={styles.webOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close attachment menu"
        />
        <Animated.View
          entering={FadeInUp.duration(duration.fast).reduceMotion(reduceMotion)}
          style={[styles.webMenu, { backgroundColor: palette.surfaceLow, borderColor: palette.borderBright }]}
        >
          <View style={styles.webHeader}>
            <View>
              <Text style={[styles.webTitle, { color: palette.onSurface }]}>Add to chat</Text>
              <Text style={[styles.webSubtitle, { color: palette.onSurfaceVariant }]}>Choose what to share</Text>
            </View>
            <PressableScale
              style={[styles.webClose, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close attachment menu"
            >
              <Ionicons name="close" size={17} color={palette.onSurfaceVariant} />
            </PressableScale>
          </View>
          <View style={styles.webGrid}>
            {actions.map((action) => (
              <WebAction key={action.id} action={action} />
            ))}
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Add to chat</Text>
        <Text style={styles.headerSubtitle}>Share something with your GC</Text>
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

function WebAction({ action }: { action: AttachmentAction }) {
  const { theme } = useAppearance();
  const palette = theme.palette;
  return (
    <PressableScale
      style={[styles.webAction, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }, action.disabled && styles.boxDisabled]}
      scaleTo={action.disabled ? 1 : 0.97}
      disabled={action.disabled}
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View style={[styles.webIcon, { backgroundColor: `${action.color}20` }]}>
        <ActionGlyph action={action} size={18} />
      </View>
      <Text style={[styles.webActionLabel, { color: palette.onSurface }]} numberOfLines={1}>{action.label}</Text>
      {action.badge && <Text style={[styles.webBadge, { color: action.color }]}>{action.badge}</Text>}
    </PressableScale>
  );
}

function ActionGlyph({ action, size }: { action: AttachmentAction; size: number }) {
  if (action.emoji) return <Text style={{ fontSize: size, lineHeight: size + 4 }}>{action.emoji}</Text>;
  if (action.isGif) return <Text style={[styles.gifWordmark, { color: action.color }]}>GIF</Text>;
  if (action.icon) return <Ionicons name={action.icon} size={size} color={action.color} />;
  return null;
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
          { backgroundColor: colors.surfaceHigh },
        ]}
      >
        <ActionGlyph action={action} size={22} />
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
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  webMenu: {
    position: 'absolute',
    bottom: 72,
    left: 12,
    right: 12,
    maxWidth: 372,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  webTitle: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    fontWeight: '700',
  },
  webSubtitle: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  webClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 7,
  },
  webAction: {
    width: '49%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  webIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webActionLabel: {
    flex: 1,
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
  },
  webBadge: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 8,
  },
  header: {
    alignItems: 'flex-start',
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
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    gap: spacing.xs + 2,
  },
  boxDisabled: {
    opacity: 0.5,
  },
  iconOrb: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.onSurface,
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
