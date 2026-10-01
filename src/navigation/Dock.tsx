import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { useAuth } from '../context/AuthContext';
import { useAppearance } from '../context/AppearanceContext';
import { useWebBottomInset } from '../hooks/useWebBottomInset';
import { timingBase } from '../theme/motion';
import { colors, fontFamily } from '../theme/theme';
import { selectFeedback } from '../utils/haptics';

type TabDefinition = {
  label: string;
  active: keyof typeof Ionicons.glyphMap;
  idle: keyof typeof Ionicons.glyphMap;
};

const TABS: Record<string, TabDefinition> = {
  GroupList: { label: 'Chats', active: 'chatbubbles', idle: 'chatbubbles-outline' },
  AddGC: { label: 'Create', active: 'add-circle', idle: 'add-circle-outline' },
  Explore: { label: 'Awards', active: 'trophy', idle: 'trophy-outline' },
  Profile: { label: 'Profile', active: 'person', idle: 'person-outline' },
};

function DockItem({
  name,
  focused,
  onPress,
  avatar,
}: {
  name: string;
  focused: boolean;
  onPress: () => void;
  avatar?: { imageUrl?: string | null; label?: string | null };
}) {
  const { theme } = useAppearance();
  const tab = TABS[name] ?? TABS.GroupList;
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, timingBase);
  }, [focused, progress]);

  const iconMotion = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * progress.value }, { scale: 1 + progress.value * 0.06 }],
  }));

  const selectedColor = name === 'Explore' ? colors.yellow : theme.palette.primary;
  const iconColor = focused ? selectedColor : theme.palette.onSurfaceVariant;

  return (
    <PressableScale
      style={styles.item}
      scaleTo={0.94}
      haptic="none"
      onPress={() => {
        if (!focused) selectFeedback();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: focused }}
    >
      <Animated.View style={[styles.iconWrap, iconMotion]}>
        {avatar ? (
          <Avatar imageUrl={avatar.imageUrl} label={avatar.label ?? 'Me'} size={25} ring={focused} />
        ) : (
          <Ionicons name={focused ? tab.active : tab.idle} size={23} color={iconColor} />
        )}
      </Animated.View>
      <Text style={[styles.label, { color: focused ? theme.palette.onSurface : theme.palette.onSurfaceVariant }]}>
        {tab.label}
      </Text>
      {focused && <View style={[styles.activeMark, { backgroundColor: selectedColor }]} />}
    </PressableScale>
  );
}

/** A stable navigation shelf with a visible label for every destination. */
export default function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { theme } = useAppearance();
  const webBottomInset = useWebBottomInset();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.palette.surfaceLow,
          borderTopColor: theme.palette.border,
          paddingBottom: Math.max(insets.bottom, webBottomInset, 8),
        },
      ]}
    >
      <View style={styles.items}>
        {state.routes.map((route, index) => (
          <DockItem
            key={route.key}
            name={route.name}
            focused={state.index === index}
            avatar={route.name === 'Profile' ? { imageUrl: profile?.avatar_url, label: profile?.display_name } : undefined}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  items: { height: 68, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 12 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 44 },
  iconWrap: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 0.1 },
  activeMark: { position: 'absolute', top: 0, width: 20, height: 2, borderRadius: 1 },
});
