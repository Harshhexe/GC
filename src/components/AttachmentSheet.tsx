import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';

/**
 * Opened by the composer's "+" — what to attach. Three real options: the
 * OS doesn't have a separate "gif" picker, gifs just come through the
 * library or a document as a regular image file.
 */
export function AttachmentSheet({
  visible,
  onCamera,
  onLibrary,
  onDocument,
  onClose,
  onClosed,
}: {
  visible: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onDocument: () => void;
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
          </View>
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
  option: { alignItems: 'center', gap: spacing.sm, width: 96 },
  optionIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionLabel: { ...typography.caption, fontSize: 12.5, color: colors.onSurface, textAlign: 'center' },
});
