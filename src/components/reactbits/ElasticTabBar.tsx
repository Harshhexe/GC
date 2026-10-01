import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { PressableScale } from '../ui/PressableScale';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string | number;
}

interface ElasticTabBarProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  accentColor?: string;
}

/**
 * ElasticTabBar inspired by React Bits Dock / Elastic Tabs.
 * Floating frosted glass segmented navigation with neon active illumination.
 */
export function ElasticTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  accentColor = '#818CF8',
}: ElasticTabBarProps<T>) {
  return (
    <View style={styles.outerContainer}>
      <View style={styles.track}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={StyleSheet.absoluteFill} />

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <PressableScale
              key={tab.id}
              scaleTo={0.94}
              haptic="light"
              onPress={() => onTabChange(tab.id)}
              style={[
                styles.tabButton,
                isActive && [
                  styles.activeTabButton,
                  {
                    backgroundColor: `${accentColor}26`,
                    borderColor: `${accentColor}55`,
                    shadowColor: accentColor,
                  },
                ],
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.55)'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isActive
                    ? [styles.activeTabLabel, { color: '#FFFFFF' }]
                    : styles.inactiveTabLabel,
                ]}
              >
                {tab.label}
              </Text>
              {tab.badge != null && Number(tab.badge) > 0 && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isActive ? accentColor : 'rgba(255, 255, 255, 0.2)',
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 38, 0.72)',
    borderRadius: 9999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeTabButton: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 3,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  activeTabLabel: {
    fontWeight: '700',
  },
  inactiveTabLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9999,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
