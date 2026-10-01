import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface AIPulsingCoreProps {
  accentColor?: string;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * AIPulsingCore inspired by React Bits Glowing Orb / Neural Core.
 * Concentric animated pulsing rings with radiant gradient energy.
 */
export function AIPulsingCore({
  accentColor = '#818CF8',
  size = 54,
  icon = 'sparkles',
}: AIPulsingCoreProps) {
  const pulse1 = useSharedValue(1);
  const pulse2 = useSharedValue(1);
  const pulse3 = useSharedValue(1);

  useEffect(() => {
    pulse1.value = withRepeat(
      withTiming(1.35, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    pulse2.value = withRepeat(
      withTiming(1.65, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    pulse3.value = withRepeat(
      withTiming(2.1, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse1, pulse2, pulse3]);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse1.value }],
    opacity: 0.35 / pulse1.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse2.value }],
    opacity: 0.2 / pulse2.value,
  }));

  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse3.value }],
    opacity: 0.12 / pulse3.value,
  }));

  return (
    <View style={[styles.container, { width: size * 2.2, height: size * 2.2 }]}>
      {/* Outer Ethereal Ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 1.8,
            height: size * 1.8,
            borderColor: accentColor,
          },
          ring3Style,
        ]}
      />

      {/* Mid Harmonic Ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderColor: accentColor,
          },
          ring2Style,
        ]}
      />

      {/* Inner Energy Wave */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 1.15,
            height: size * 1.15,
            borderColor: '#FFFFFF',
          },
          ring1Style,
        ]}
      />

      {/* Central Radiant Orb */}
      <LinearGradient
        colors={[accentColor, '#4F46E5', '#1E1B4B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.core,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: accentColor,
          },
        ]}
      >
        <Ionicons name={icon} size={size * 0.46} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1.5,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 18,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
});
