import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { reduceMotion } from '../../theme/motion';
import { selectFeedback } from '../../utils/haptics';
import { project, rubberband, dismissSpring } from '../../utils/gesturePhysics';

/**
 * A full-screen modal page you can swipe down to close.
 *
 * The counterpart to DraggableSheet, for the surfaces that are pages rather
 * than sheets — the GIF and sticker pickers, the poll composer, a comment
 * thread. Those used RN's `animationType="slide"`, which is driven by the OS
 * on a fixed curve: it cannot be interrupted, cannot be reversed, and offers
 * no way out but the Cancel button. Same physics as the sheet, applied to a
 * surface that happens to fill the screen:
 *
 * - Drags track the finger 1:1 downward and rubber-band upward.
 * - Release projects the throw and decides on where the gesture was *heading*,
 *   so a flick dismisses from anywhere while a slow drag settles back.
 * - The release velocity is handed to the spring, so the page keeps moving at
 *   the speed the finger left it at.
 * - A drag can catch the page mid-entrance and take it straight back down.
 *
 * `gestureEnabled` exists because not every full-screen page should be
 * swipeable: a camera mid-recording must not be dismissible by a stray
 * downward swipe, and a form with unsaved input wants to ask first.
 */

/** Past this fraction of the screen, let go and it goes. */
const DISMISS_FRACTION = 0.35;
/** A deliberate downward flick dismisses regardless of distance travelled. */
const DISMISS_VELOCITY = 900;

export function DismissibleModalPage({
  visible,
  onClose,
  children,
  /**
   * Turn the swipe off where dismissing by accident would cost something —
   * an in-progress recording, an unsaved draft.
   */
  gestureEnabled = true,
  statusBarTranslucent = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  gestureEnabled?: boolean;
  statusBarTranslucent?: boolean;
}) {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const startY = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = height;
      translateY.value = withSpring(0, { ...dismissSpring, reduceMotion });
    }
  }, [visible, height, translateY]);

  const finish = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  const dismiss = useCallback(
    (velocity: number) => {
      translateY.value = withSpring(
        height,
        { ...dismissSpring, velocity, reduceMotion },
        (finished) => {
          if (finished) runOnJS(finish)();
        }
      );
    },
    [height, translateY, finish]
  );

  const settle = useCallback(
    (velocity: number) => {
      translateY.value = withSpring(0, { ...dismissSpring, velocity, reduceMotion });
    },
    [translateY]
  );

  const pan = Gesture.Pan()
    .enabled(gestureEnabled)
    // A page is mostly scrollable content, so the swipe has to clear a
    // deliberate vertical threshold before it takes the touch from a list.
    .activeOffsetY([-20, 20])
    .failOffsetX([-24, 24])
    .onStart(() => {
      // Start from the live on-screen position so an in-flight page can be
      // caught and sent back down without jumping to its target first.
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      translateY.value = next < 0 ? rubberband(next, height) : next;
    })
    .onEnd((e) => {
      const projected = translateY.value + project(e.velocityY);
      if (e.velocityY > DISMISS_VELOCITY || projected > height * DISMISS_FRACTION) {
        runOnJS(selectFeedback)();
        runOnJS(dismiss)(e.velocityY);
      } else {
        runOnJS(settle)(e.velocityY);
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // On web the page is presented by the caller's own shell (WebModalCard or a
  // confined overlay), so there is nothing here to animate or dismiss.
  if (Platform.OS === 'web') return <>{children}</>;

  return (
    <Modal
      visible={visible || mounted}
      transparent
      // The OS slide is replaced entirely — it is the thing that could not be
      // interrupted, so leaving it on would fight the gesture.
      animationType="none"
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onClose}
    >
      {/* Gestures need their own root inside a Modal — it renders into a
          separate view tree the app's root provider doesn't reach. */}
      <GestureHandlerRootView style={styles.flex}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.flex, pageStyle]}>{children}</Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
