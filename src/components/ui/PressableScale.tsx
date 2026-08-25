import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { springSnappy } from '../../theme/motion';
import { tapFeedback, selectFeedback } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it sinks on press. Bigger elements should sink less. */
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'none';
};

/**
 * Every privilege/tappable surface in GC uses this instead of a bare Pressable, so
 * touch feedback is identical everywhere: a quick, tight dip plus a haptic.
 *
 * The dip is a spring rather than a fixed-duration curve. A timed curve has to
 * finish before it can do anything else, so a fast tap-tap-tap queues up
 * animations that arrive after the finger has already left — the press starts
 * to feel like it's reporting on the past. A spring always animates from
 * wherever the scale currently is, so an interrupted press picks up mid-dip
 * and reverses immediately, which is what makes rapid taps feel connected to
 * the hand instead of to a timeline.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic = 'light',
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      disabled={disabled}
      onPressIn={(e) => {
        // Feedback belongs on the press, not the release — waiting for
        // touch-up to acknowledge a tap is the single easiest way to make an
        // interface feel dead.
        if (disabled) return;
        scale.value = withSpring(scaleTo, springSnappy);
        if (haptic === 'light') tapFeedback();
        else if (haptic === 'medium') selectFeedback();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (disabled) return;
        scale.value = withSpring(1, springSnappy);
        onPressOut?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
