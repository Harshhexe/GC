import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, radius, shadows, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { reactionCatalog } from '../data/reactions';
import { PressableScale } from './ui/PressableScale';
import { selectFeedback } from '../utils/haptics';

export function ReactionPicker({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (emoji: string, label: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.anchor}>
        <Animated.View
          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            {Platform.OS !== 'web' && (
              <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
            )}
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={ZoomIn.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
          exiting={ZoomOut.duration(duration.fast).reduceMotion(reduceMotion)}
          style={styles.tapbackBar}
        >
          {Platform.OS !== 'web' && (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <View style={styles.barInner}>
            {reactionCatalog.map((r) => (
              <PressableScale
                key={r.emoji}
                style={styles.emojiItem}
                scaleTo={1.3}
                haptic="medium"
                onPress={() => {
                  selectFeedback();
                  onSelect(r.emoji, r.label);
                }}
              >
                <Text style={styles.emojiText}>{r.emoji}</Text>
              </PressableScale>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 12, 0.70)',
  },
  tapbackBar: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22, 22, 34, 0.90)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxWidth: 340,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  barInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingVertical: 2,
  },
  emojiItem: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  emojiText: {
    fontSize: 26,
  },
});
