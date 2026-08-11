import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, easing, reduceMotion } from '../../theme/motion';
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
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic = 'light',
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
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, { duration: duration.instant, easing: easing.out, reduceMotion });
        if (haptic === 'light') tapFeedback();
        else if (haptic === 'medium') selectFeedback();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: duration.fast, easing: easing.out, reduceMotion });
        onPressOut?.(e);
      }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
