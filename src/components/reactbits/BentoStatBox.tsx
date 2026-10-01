import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SpotlightCard } from './SpotlightCard';

interface BentoStatBoxProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  value: string | number;
  label: string;
  sublabel?: string;
  onPress?: () => void;
}

/**
 * BentoStatBox inspired by React Bits Bento Grid item.
 */
export function BentoStatBox({
  icon,
  iconColor,
  value,
  label,
  sublabel,
  onPress,
}: BentoStatBoxProps) {
  return (
    <SpotlightCard
      spotlightColor={`${iconColor}22`}
      borderColor="rgba(255, 255, 255, 0.08)"
      borderRadius={18}
      onPress={onPress}
      style={styles.container}
    >
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${iconColor}18`, borderColor: `${iconColor}35` }]}>
            <Ionicons name={icon} size={15} color={iconColor} />
          </View>
          <Text style={[styles.valueText, { color: '#FFFFFF' }]}>{value}</Text>
        </View>
        <Text style={styles.labelText}>{label}</Text>
        {sublabel && <Text style={styles.sublabelText}>{sublabel}</Text>}
      </View>
    </SpotlightCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 100,
  },
  inner: {
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  valueText: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sublabelText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
  },
});
