import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Progressive linear blur header background.
 *
 * Starts at 100% frosted glass blur and high contrast scrim at the top (status bar),
 * and smoothly dissolves linearly into 0% blur (pure transparent) at the bottom.
 *
 * On Web: uses native CSS -webkit-mask-image with backdrop-filter.
 * On Native (iOS/Android): uses stacked multi-tier BlurView slices paired with
 * a linear alpha gradient for a seamless, cool, and modern floating glass effect.
 */
export function LinearBlurHeader() {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.webLinearBlur]}
      >
        <LinearGradient
          colors={[
            'rgba(6, 8, 14, 0.88)',
            'rgba(6, 8, 14, 0.65)',
            'rgba(6, 8, 14, 0.32)',
            'rgba(6, 8, 14, 0.08)',
            'transparent',
          ]}
          locations={[0, 0.35, 0.65, 0.88, 1.0]}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Tier 1: Full-height subtle base blur */}
      <BlurView
        intensity={20}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />

      {/* Tier 2: Upper 85% mid blur */}
      <View style={[styles.slice, { height: '85%' }]}>
        <BlurView
          intensity={25}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Tier 3: Upper 60% stronger blur */}
      <View style={[styles.slice, { height: '60%' }]}>
        <BlurView
          intensity={35}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Tier 4: Top 38% maximum 100% frosted blur behind the status bar */}
      <View style={[styles.slice, { height: '38%' }]}>
        <BlurView
          intensity={40}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Progressive tonal gradient: 100% dark scrim at top, 100% transparent at bottom */}
      <LinearGradient
        colors={[
          'rgba(6, 8, 14, 0.88)',
          'rgba(6, 8, 14, 0.65)',
          'rgba(6, 8, 14, 0.32)',
          'rgba(6, 8, 14, 0.08)',
          'transparent',
        ]}
        locations={[0, 0.35, 0.65, 0.88, 1.0]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slice: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  webLinearBlur: {
    backdropFilter: 'blur(28px) saturate(170%)',
    WebkitBackdropFilter: 'blur(28px) saturate(170%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)',
  } as any,
});
