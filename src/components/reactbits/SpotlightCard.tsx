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
 * Features an illuminated frosted glass surface, dynamic interactive glow,
 * and delicate gradient border highlights.
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
  const glowX = useSharedValue(50);
  const glowY = useSharedValue(30);
  const glowOpacity = useSharedValue(0.6);

  const handleTouch = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    glowX.value = withSpring(locationX, { damping: 15 });
    glowY.value = withSpring(locationY, { damping: 15 });
    glowOpacity.value = withTiming(1, { duration: 150 });
  };

  const handleTouchEnd = () => {
    glowOpacity.value = withTiming(0.6, { duration: 600 });
  };

  const glowStyle = useAnimatedStyle(() => {
    return {
      opacity: glowOpacity.value,
      transform: [
        { translateX: glowX.value - 120 },
        { translateY: glowY.value - 120 },
      ],
    };
  });

  const CardContent = (
    <View
      onTouchStart={handleTouch}
      onTouchEnd={handleTouchEnd}
      style={[
        styles.outerBorder,
        { borderRadius, borderColor },
        style,
      ]}
    >
      {/* Background blur & tint */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={28}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : null}

      {/* Dark frosted glass ground */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.glassGround,
          { borderRadius },
        ]}
      />

      {/* Dynamic Spotlight Glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.spotlightOrb,
          { backgroundColor: spotlightColor },
          glowStyle,
        ]}
      />

      {/* Top ambient highlight gradient */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.01)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.8 }}
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
  outerBorder: {
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(15, 18, 28, 0.65)',
  },
  glassGround: {
    backgroundColor: Platform.OS === 'web' ? 'rgba(16, 21, 33, 0.72)' : 'rgba(12, 16, 26, 0.85)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(20px)' } as any) : {}),
  },
  spotlightOrb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    filter: 'blur(45px)',
  } as any,
  contentWrap: {
    position: 'relative',
    zIndex: 2,
  },
});
