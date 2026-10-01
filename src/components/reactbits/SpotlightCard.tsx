import React from 'react';
import {
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { PressableScale } from '../ui/PressableScale';

interface SpotlightCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  spotlightColor?: string;
  borderColor?: string;
  borderRadius?: number;
  onPress?: () => void;
  disabled?: boolean;
}

/**
 * SpotlightCard inspired by React Bits Spotlight Card.
 * Clean, high-end frosted glass with native BlurView, delicate specular top sheen,
 * and illuminated perimeter border.
 */
export function SpotlightCard({
  children,
  style,
  spotlightColor = 'rgba(129, 140, 248, 0.22)',
  borderColor = 'rgba(255, 255, 255, 0.12)',
  borderRadius = 22,
  onPress,
  disabled = false,
}: SpotlightCardProps) {
  const glowX = useSharedValue(60);
  const glowY = useSharedValue(40);
  const glowOpacity = useSharedValue(0.5);

  const handleTouch = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    glowX.value = withSpring(locationX, { damping: 18 });
    glowY.value = withSpring(locationY, { damping: 18 });
    glowOpacity.value = withTiming(0.9, { duration: 150 });
  };

  const handleTouchEnd = () => {
    glowOpacity.value = withTiming(0.5, { duration: 500 });
  };

  const webGlowStyle = useAnimatedStyle(() => {
    if (Platform.OS !== 'web') return {};
    return {
      opacity: glowOpacity.value,
      background: `radial-gradient(280px circle at ${glowX.value}px ${glowY.value}px, ${spotlightColor}, transparent 70%)`,
    } as any;
  });

  const CardContent = (
    <View
      onTouchStart={handleTouch}
      onTouchEnd={handleTouchEnd}
      style={[
        styles.cardRoot,
        { borderRadius, borderColor },
        style,
      ]}
    >
      {/* Native dynamic blur for frosted glass on iOS/Android */}
      {Platform.OS !== 'web' ? (
        <BlurView
          intensity={32}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : null}

      {/* Dark frosted glass background tint */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.glassGround,
          { borderRadius },
        ]}
      />

      {/* Web-only radial spotlight */}
      {Platform.OS === 'web' && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius },
            webGlowStyle,
          ]}
        />
      )}

      {/* Top delicate specular sheen */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.015)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        pointerEvents="none"
      />

      {/* Inner Children Content */}
      <View style={styles.contentWrap}>
        {children}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        scaleTo={0.97}
        haptic="light"
      >
        {CardContent}
      </PressableScale>
    );
  }

  return CardContent;
}

const styles = StyleSheet.create({
  cardRoot: {
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(15, 19, 29, 0.72)',
  },
  glassGround: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(16, 21, 33, 0.75)' : 'rgba(14, 18, 28, 0.45)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px)' } as any) : {}),
  },
  contentWrap: {
    position: 'relative',
    zIndex: 2,
  },
});
