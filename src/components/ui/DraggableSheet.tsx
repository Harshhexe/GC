import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,

  Extrapolation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../../theme/theme';
import { reduceMotion } from '../../theme/motion';
import { selectFeedback } from '../../utils/haptics';
import { project, rubberband, dismissSpring } from '../../utils/gesturePhysics';

/**
 * A bottom sheet you can actually grab.
 *
 * Every sheet in GC used to render a grabber pill that did nothing: the sheet
 * slid up on a fixed 240ms curve and could only be dismissed by tapping the
 * backdrop. A handle that looks draggable but isn't is the exact thing that
 * makes an interface feel like software instead of an object, so this replaces
 * it with real direct manipulation:
 *
 * - The sheet tracks the finger 1:1 while dragging, from wherever it currently
 *   is — so it can be caught mid-flight and reversed without waiting for the
 *   open animation to land.
 * - Dragging up past the top meets progressive rubber-band resistance rather
 *   than a hard stop, which reads as "responsive, but there's nothing more
 *   here" instead of "frozen".
 * - On release the resting point is *projected* from the throw velocity (the
 *   same exponential-decay model scroll deceleration uses), so a fast flick
 *   dismisses from halfway up while a slow drag to the same place settles
 *   back. The decision follows the gesture's intent, not just where the
 *   finger happened to stop.
 * - That release velocity is handed to the spring, so there is no visible seam
 *   between "dragging" and "animating" — the motion continues at the speed the
 *   finger was already moving.
 * - The backdrop dims continuously with the drag rather than only at the end,
 *   so the sheet reports its state the whole way through the gesture.
 */

/** Past this much of the sheet's height, let go and it goes. */
const DISMISS_FRACTION = 0.5;
/** A deliberate downward flick dismisses regardless of distance travelled. */
const DISMISS_VELOCITY = 800;

export function DraggableSheet({
  visible,
  onClose,
  onClosed,
  children,
  style,
  /** Hides the grabber for sheets that supply their own header affordance. */
  showGrabber = true,
  /** Dim + blur the content behind the sheet. */
  backdrop = true,
  /**
   * Confine the drag to the grabber instead of the whole sheet.
   *
   * Required for any sheet whose body scrolls. A pan across the whole surface
   * and a scrolling list are the same gesture, so the two would compete for
   * every downward swipe and the loser would drop frames mid-drag. Restricting
   * the drag to the handle keeps both gestures unambiguous and is the same
   * split iOS uses for a sheet with a list inside it.
   */
  dragHandleOnly = false,
}: {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  showGrabber?: boolean;
  backdrop?: boolean;
  dragHandleOnly?: boolean;
}) {
  const translateY = useSharedValue(0);
  const [height, setHeight] = useState(0);
  // Until the sheet has been measured, a drag has no scale to work against, so
  // gestures stay inert for the one frame before layout lands.
  const measured = height > 0;

  // Animate in from below once we know how tall the sheet is. Starting from
  // the measured height rather than a guess means the sheet never jumps.
  useEffect(() => {
    if (!visible || !measured) return;
    translateY.value = height;
    translateY.value = withSpring(0, { ...dismissSpring, reduceMotion });
  }, [visible, measured, height, translateY]);

  const close = useCallback(() => {
    onClose();
    onClosed?.();
  }, [onClose, onClosed]);

  /** Slide out under its own power, then tell the parent to unmount us. */
  const dismiss = useCallback(
    (velocity: number) => {
      translateY.value = withSpring(
        height || 400,
        { ...dismissSpring, velocity, reduceMotion },
        (finished) => {
          if (finished) runOnJS(close)();
        }
      );
    },
    [height, translateY, close]
  );

  const settle = useCallback(
    (velocity: number) => {
      translateY.value = withSpring(0, { ...dismissSpring, velocity, reduceMotion });
    },
    [translateY]
  );

  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(measured)
    // Let a vertical intent declare itself before the sheet commits to moving,
    // so a horizontal swipe or a tap inside the sheet is never stolen.
    .activeOffsetY([-12, 12])
    .failOffsetX([-24, 24])
    .onStart(() => {
      // Start from where the sheet actually is on screen, not from its target.
      // This is what lets an in-flight sheet be caught and redirected without
      // the jump you get from starting at the logical value.
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      translateY.value =
        next < 0
          ? // Above the top there is nothing more to show, so resist instead
            // of tracking — the sheet gives, but less and less.
            rubberband(next, height)
          : next;
    })
    .onEnd((e) => {
      const projected = translateY.value + project(e.velocityY);
      const flungDown = e.velocityY > DISMISS_VELOCITY;
      const past = projected > height * DISMISS_FRACTION;

      if (flungDown || past) {
        runOnJS(selectFeedback)();
        runOnJS(dismiss)(e.velocityY);
      } else {
        runOnJS(settle)(e.velocityY);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // The backdrop reports the drag continuously — the sheet is never a binary
  // "open or closed" while a finger is on it.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: measured
      ? interpolate(translateY.value, [0, height], [1, 0], Extrapolation.CLAMP)
      : 1,
  }));

  const body = (
    <View style={styles.anchor}>
      {backdrop && (
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
            {Platform.OS !== 'web' && (
              <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
            )}
          </Pressable>
        </Animated.View>
      )}

      <Wrap enabled={!dragHandleOnly} gesture={pan}>
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[styles.sheet, style, sheetStyle]}
        >
          {showGrabber && (
            <Wrap enabled={dragHandleOnly} gesture={pan}>
              <View style={styles.grabberHit}>
                <View style={styles.grabber} />
              </View>
            </Wrap>
          )}
          {children}
        </Animated.View>
      </Wrap>
    </View>
  );

  // RN's Modal portals to document.body on web, escaping the desktop shell's
  // layout and covering the whole browser window. Render as a confined overlay
  // there instead — same as the sheets this replaces.
  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <View style={styles.webOverlay} pointerEvents="box-none">
        {body}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Gestures need their own root inside a Modal — it renders into a
          separate view tree that the app's root provider doesn't reach. */}
      <GestureHandlerRootView style={styles.flex}>{body}</GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Attaches the pan to exactly one of the sheet or its handle, so the drag has
 * a single owner rather than two detectors racing for the same touch.
 */
function Wrap({
  enabled,
  gesture,
  children,
}: {
  enabled: boolean;
  gesture: ReturnType<typeof Gesture.Pan>;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  webOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(5, 5, 10, 0.75)' },
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
  /**
   * The visual grabber is 4px tall, far below a usable touch target, so the
   * hit area around it is padded out to a comfortable one. The thing you can
   * see and the thing you can grab are not the same size on purpose.
   */
  grabberHit: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
});
