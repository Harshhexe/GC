import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PressableScale } from '../components/ui/PressableScale';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../context/AuthContext';
import { selectFeedback } from '../utils/haptics';

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  GroupList: { on: 'chatbubble', off: 'chatbubble-outline', label: 'Chat' },
  AddGC: { on: 'add-circle', off: 'add-circle-outline', label: 'Create' },
  Explore: { on: 'trophy', off: 'trophy-outline', label: 'Awards' },
  Profile: { on: 'person', off: 'person-outline', label: 'Profile' },
};

const ITEM_WIDTH = 76;

function SpotlightDockItem({
  routeName,
  focused,
  onPress,
  activeIndex,
  position,
  avatar,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
  activeIndex: number;
  position: number;
  /** Rendered in place of the icon — the Profile tab shows you, not a cog. */
  avatar?: { imageUrl?: string | null; label?: string | null };
}) {
  const icon = ICONS[routeName] ?? { on: 'ellipse', off: 'ellipse-outline', label: routeName };
  const distance = Math.abs(activeIndex - position);
  const spotlightOpacity = focused ? 1 : Math.max(0, 1 - distance * 0.6);

  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  }, [focused, active]);

  const spotlightStyle = useAnimatedStyle(() => ({
    opacity: withTiming(spotlightOpacity, { duration: 300 }),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(active.value, [0, 1], [1, 1.25]) }],
  }));

  return (
    <PressableScale
      style={styles.item}
      scaleTo={0.92}
      haptic="none"
      onPress={() => {
        if (!focused) selectFeedback();
        onPress();
      }}
    >
      {/* Spotlight beam background */}
      <Animated.View style={[styles.spotlightWrapper, spotlightStyle]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.40)', 'rgba(255, 255, 255, 0.10)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.spotlightBeam}
        />
      </Animated.View>

      <Animated.View style={[iconStyle, !focused && avatar ? styles.avatarDimmed : null]}>
        {avatar ? (
          <Avatar
            imageUrl={avatar.imageUrl}
            label={avatar.label ?? 'Me'}
            size={30}
            ring={focused}
          />
        ) : (
          <Ionicons
            name={focused ? icon.on : icon.off}
            size={28}
            color={focused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)'}
          />
        )}
      </Animated.View>
    </PressableScale>
  );
}

/**
 * Floating Spotlight Navigation Dock
 * Replaces app dock with rounded, floated spotlight dock design keeping all original items.
 */
export default function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const activeIndex = state.index;

  const indicatorPos = useSharedValue(activeIndex * ITEM_WIDTH);

  useEffect(() => {
    indicatorPos.value = withTiming(activeIndex * ITEM_WIDTH, {
      duration: 350,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [activeIndex, indicatorPos]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPos.value }],
  }));

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dock}>
        {/* Top active indicator line */}
        <Animated.View style={[styles.indicatorContainer, indicatorStyle]} pointerEvents="none">
          <View style={styles.indicator} />
        </Animated.View>

        {/* Dock Items */}
        {state.routes.map((route, index) => {
          const focused = activeIndex === index;
          return (
            <SpotlightDockItem
              key={route.key}
              routeName={route.name}
              focused={focused}
              position={index}
              activeIndex={activeIndex}
              avatar={
                route.name === 'Profile'
                  ? { imageUrl: profile?.avatar_url, label: profile?.display_name }
                  : undefined
              }
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25, 25, 43, 0.9)',
    borderRadius: 9999, // Floating & rounded shape
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 68,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 18,
  },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 16,
    width: ITEM_WIDTH,
    alignItems: 'center',
    zIndex: 10,
  },
  indicator: {
    width: 48,
    height: 3,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  item: {
    width: ITEM_WIDTH,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarDimmed: { opacity: 0.55 },
  spotlightWrapper: {
    position: 'absolute',
    top: 0,
    width: 52,
    height: 54,
    alignItems: 'center',
    overflow: 'hidden',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  spotlightBeam: {
    width: 48,
    height: 60,
    borderRadius: 24,
  },
});
