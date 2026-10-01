import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AuroraProps {
  color1?: string;
  color2?: string;
  color3?: string;
  opacity?: number;
}

/**
 * AuroraBackground inspired by React Bits Aurora / Ambient Mesh.
 * Softly drifting luminous light blobs combined with native BlurView
 * for true, silky-smooth cosmic ambient atmosphere.
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
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    trans2.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    scale.value = withRepeat(
      withTiming(1.15, { duration: 10000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [trans1, trans2, scale]);

  const orb1Style = useAnimatedStyle(() => {
    const translateX = -40 + trans1.value * 90;
    const translateY = -30 + trans2.value * 60;
    return {
      transform: [{ translateX }, { translateY }, { scale: scale.value }],
    };
  });

  const orb2Style = useAnimatedStyle(() => {
    const translateX = 40 - trans2.value * 80;
    const translateY = 20 - trans1.value * 70;
    return {
      transform: [{ translateX }, { translateY }, { scale: 1.1 - scale.value * 0.1 }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Deep dark base ground */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07090E' }]} />

      {/* Primary Aurora Blob */}
      <Animated.View style={[styles.blobContainer, { top: -80, left: -60 }, orb1Style]}>
        <LinearGradient
          colors={[color1, color2, `${color2}40`, 'rgba(0,0,0,0)']}
          locations={[0, 0.4, 0.75, 1]}
          style={[styles.blob, { width: SCREEN_WIDTH * 1.25, height: SCREEN_WIDTH * 1.25, opacity }]}
          start={{ x: 0.3, y: 0.3 }}
          end={{ x: 0.8, y: 0.8 }}
        />
      </Animated.View>

      {/* Secondary Aurora Blob */}
      <Animated.View style={[styles.blobContainer, { top: 100, right: -70 }, orb2Style]}>
        <LinearGradient
          colors={[color3, color1, `${color1}35`, 'rgba(0,0,0,0)']}
          locations={[0, 0.4, 0.75, 1]}
          style={[styles.blob, { width: SCREEN_WIDTH * 1.1, height: SCREEN_WIDTH * 1.1, opacity: opacity * 0.9 }]}
          start={{ x: 0.7, y: 0.3 }}
          end={{ x: 0.2, y: 0.8 }}
        />
      </Animated.View>

      {/* Native dynamic blur layer to dissolve orbs into pure liquid glow */}
      {Platform.OS !== 'web' ? (
        <BlurView
          intensity={Platform.OS === 'ios' ? 95 : 50}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backdropFilter: 'blur(75px)', WebkitBackdropFilter: 'blur(75px)' } as any,
          ]}
        />
      )}

      {/* Vignette overlay for depth and text contrast */}
      <LinearGradient
        colors={['rgba(7, 9, 14, 0.1)', 'rgba(7, 9, 14, 0.4)', 'rgba(7, 9, 14, 0.92)']}
        locations={[0, 0.5, 1]}
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
