import React from 'react';
import { StyleSheet, Text, View, TextStyle } from 'react-native';

interface NeonBadgeProps {
  label: string;
  color?: string;
  showDot?: boolean;
  style?: TextStyle;
}

/**
 * NeonBadge inspired by React Bits futuristic cyber status pills.
 */
export function NeonBadge({
  label,
  color = '#818CF8',
  showDot = true,
  style,
}: NeonBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
      {showDot && <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />}
      <Text style={[styles.text, { color }, style]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  text: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
