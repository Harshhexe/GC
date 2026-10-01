import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AuroraProps {
  color1?: string;
  color2?: string;
  color3?: string;
  opacity?: number;
}

/**
 * AuroraBackground inspired by React Bits Aurora / Ambient Mesh.
 * Softly drifting, pulsing luminous light blobs that give deep space warmth
 * without obstructing readability.
 */
export function AuroraBackground({
  color1 = '#818CF8', // Indigo/violet
  color2 = '#C084FC', // Purple/magenta
  color3 = '#38BDF8', // Cyan/sky
  opacity = 0.28,
}: AuroraProps) {
  const trans1 = useSharedValue(0);
  const trans2 = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    trans1.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    trans2.value = withRepeat(
      withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    scale.value = withRepeat(
      withTiming(1.2, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [trans1, trans2, scale]);

  const orb1Style = useAnimatedStyle(() => {
    const translateX = -60 + trans1.value * 120;
    const translateY = -40 + trans2.value * 80;
    return {
      transform: [{ translateX }, { translateY }, { scale: scale.value }],
    };
  });

  const orb2Style = useAnimatedStyle(() => {
    const translateX = 60 - trans2.value * 100;
    const translateY = 20 - trans1.value * 90;
    return {
      transform: [{ translateX }, { translateY }, { scale: 1.15 - scale.value * 0.15 }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07090E' }]} />

      {/* Primary Aurora Blob */}
      <Animated.View style={[styles.blobContainer, { top: -100, left: -60 }, orb1Style]}>
        <LinearGradient
          colors={[color1, color2, 'transparent']}
          style={[styles.blob, { width: SCREEN_WIDTH * 1.1, height: SCREEN_WIDTH * 1.1, opacity }]}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.8, y: 0.8 }}
        />
      </Animated.View>

      {/* Secondary Aurora Blob */}
      <Animated.View style={[styles.blobContainer, { top: 120, right: -80 }, orb2Style]}>
        <LinearGradient
          colors={[color3, color1, 'transparent']}
          style={[styles.blob, { width: SCREEN_WIDTH * 0.95, height: SCREEN_WIDTH * 0.95, opacity: opacity * 0.85 }]}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.9 }}
        />
      </Animated.View>

      {/* Vignette overlay for depth */}
      <LinearGradient
        colors={['transparent', 'rgba(7, 9, 14, 0.45)', 'rgba(7, 9, 14, 0.92)']}
        locations={[0, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  blobContainer: {
    position: 'absolute',
  },
  blob: {
    borderRadius: 9999,
  },
});
