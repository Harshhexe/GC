import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';

/**
 * Opened by the composer's "+" — what to attach.
 */
export function AttachmentSheet({
  visible,
  onCamera,
  onLibrary,
  onDocument,
  onGif,
  onSticker,
  onStartTea,
  teaActive,
  onClose,
  onClosed,
}: {
  visible: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onDocument: () => void;
  onGif: () => void;
  onSticker: () => void;
  /** Omitted where Tea doesn't apply. */
  onStartTea?: () => void;
  /** A Tea is already live in this GC — the row explains rather than offers. */
  teaActive?: boolean;
  onClose: () => void;
  /**
   * Fires once the modal is *fully* dismissed (iOS `Modal.onDismiss`).
   * Launching a native picker while this modal is still animating away makes
   * UIKit refuse the presentation — the picker never appears and its promise
   * never settles, which reads as the app freezing. The caller waits for this
   * before opening anything native.
   */
  onClosed?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={onClosed}
    >
      <View style={styles.sheetAnchor}>
        <Animated.View
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            {Platform.OS !== 'web' && (
              <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
            )}
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          exiting={SlideOutDown.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          style={styles.sheet}
        >
          <View style={styles.grabber} />

          <View style={styles.row}>
            <Option icon="camera" label="Camera" color={colors.tertiary} onPress={onCamera} />
            <Option icon="images" label="Photos & Videos" color={colors.primary} onPress={onLibrary} />
            <Option icon="document-attach" label="Document" color={colors.secondary} onPress={onDocument} />
            <GifOption onPress={onGif} />
            <Option icon="happy" label="Sticker" color={colors.secondary} onPress={onSticker} />
          </View>

          {!!onStartTea && (
            <>
              <View style={styles.divider} />
              <PressableScale
                style={[styles.teaRow, teaActive && styles.teaRowDisabled]}
                scaleTo={teaActive ? 1 : 0.98}
                haptic={teaActive ? undefined : 'medium'}
                disabled={teaActive}
                onPress={onStartTea}
              >
                <View style={styles.teaIcon}>
                  <Text style={styles.teaEmoji}>🍵</Text>
                </View>
                <View style={styles.teaCopy}>
                  <Text style={styles.teaLabel}>
                    {teaActive ? 'Tea is already going on' : 'Start Tea'}
                  </Text>
                  <Text style={styles.teaMeta}>
                    {teaActive
                      ? 'One tea at a time — end it to start another'
                      : 'Record a tea session and get a report after'}
                  </Text>
                </View>
                {!teaActive && (
                  <Ionicons name="chevron-forward" size={18} color={colors.outline} />
                )}
              </PressableScale>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function Option({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.option} scaleTo={0.94} haptic="medium" onPress={onPress}>
      <View style={[styles.optionIcon, { backgroundColor: `${color}26`, borderColor: `${color}4D` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </PressableScale>
  );
}

/** Same tile shape as the other options, but with the "GIF" wordmark instead
 *  of an icon — that's the more recognizable affordance for this one. */
function GifOption({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale style={styles.option} scaleTo={0.94} haptic="medium" onPress={onPress}>
      <View style={[styles.optionIcon, { backgroundColor: `${colors.yellow}26`, borderColor: `${colors.yellow}4D` }]}>
        <Text style={[styles.gifWordmark, { color: colors.yellow }]}>GIF</Text>
      </View>
      <Text style={styles.optionLabel}>GIF</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + spacing.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderBright,
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  teaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.30)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  teaRowDisabled: { opacity: 0.55 },
  teaIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teaEmoji: { fontSize: 20 },
  teaCopy: { flex: 1, gap: 2 },
  teaLabel: { ...typography.titleMd, fontSize: 16, color: colors.onSurface },
  teaMeta: { ...typography.micro, color: colors.onSurfaceVariant },
  // Sized for five tiles in one row — the row's own space-around distributes
  // whatever width remains as gaps, so this only needs to leave enough room
  // for that on the narrowest supported screen (343px usable on an SE).
  option: { alignItems: 'center', gap: spacing.xs + 2, width: 60 },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionLabel: { ...typography.caption, fontSize: 10.5, color: colors.onSurface, textAlign: 'center' },
  gifWordmark: {
    ...typography.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 14,
  },
});
