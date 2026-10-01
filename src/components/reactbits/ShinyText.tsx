import React, { useEffect } from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';

interface ShinyTextProps {
  text: string;
  style?: TextStyle;
  baseColor?: string;
  shineColor?: string;
  duration?: number;
}

/**
 * ShinyText inspired by React Bits Shiny Text.
 * Produces an iridescent, luminous shimmering text effect.
 */
export function ShinyText({
  text,
  style,
  baseColor = 'rgba(255, 255, 255, 0.65)',
  shineColor = '#FFFFFF',
  duration = 2400,
}: ShinyTextProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration }),
      -1,
      true
    );
  }, [progress, duration]);

  const animatedStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [baseColor, shineColor, baseColor]
    );
    return { color };
  });

  return (
    <Animated.Text style={[styles.defaultText, style, animatedStyle]}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  defaultText: {
    letterSpacing: 0.3,
  },
});
