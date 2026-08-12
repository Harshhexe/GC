import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, glass, gradients, radius, shadows, spacing, typography } from '../theme/theme';
import { reduceMotion, springBouncy, timingFast } from '../theme/motion';
import { PressableScale } from '../components/ui/PressableScale';
import { selectFeedback } from '../utils/haptics';

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  GroupList: { on: 'chatbubble', off: 'chatbubble-outline', label: 'Chat' },
  AddGC: { on: 'add-circle', off: 'add-circle-outline', label: 'Create' },
  Explore: { on: 'compass', off: 'compass-outline', label: 'Explore' },
  Profile: { on: 'settings', off: 'settings-outline', label: 'Profile' },
};

function DockItem({
  routeName,
  focused,
  onPress,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
}) {
  const icon = ICONS[routeName] ?? { on: 'ellipse', off: 'ellipse-outline', label: routeName };
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = focused ? withTiming(1, timingFast) : withTiming(0, timingFast);
  }, [focused, active]);

  // The active tab lifts into a glowing pill; the label fades in under it.
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [
      { scale: interpolate(active.value, [0, 1], [0.5, 1]) },
    ],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(active.value, [0, 1], [0, -2]) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(active.value, [0, 1], [0.55, 1]),
  }));

  return (
    <PressableScale
      style={styles.item}
      scaleTo={0.88}
      haptic="none"
      onPress={() => {
        if (!focused) selectFeedback();
        onPress();
      }}
    >
      <View style={styles.iconSlot}>
        <Animated.View style={[StyleSheet.absoluteFill, bubbleStyle]}>
          <LinearGradient
            colors={gradients.cta}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, shadows.glow]}
          />
        </Animated.View>
        <Animated.View style={iconStyle}>
          <Ionicons
            name={focused ? icon.on : icon.off}
            size={focused ? 23 : 22}
            color={focused ? '#FFFFFF' : colors.outline}
          />
        </Animated.View>
      </View>
      <Animated.Text
        style={[styles.label, focused && styles.labelActive, labelStyle]}
        numberOfLines={1}
      >
        {icon.label}
      </Animated.Text>
    </PressableScale>
  );
}

/** Floating glass dock. Sits above the content rather than docking to the
 *  screen edge, per the design — screens pad their scroll content to clear it. */
export default function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md), pointerEvents: 'box-none' }]}
    >
      <View style={styles.dock}>
        {Platform.OS !== 'web' && (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={[styles.dockFill, { pointerEvents: 'none' }]} />
        <LinearGradient colors={gradients.sheen} style={[styles.dockSheen, { pointerEvents: 'none' }]} />

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          return (
            <DockItem
              key={route.key}
              routeName={route.name}
              focused={focused}
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
    paddingHorizontal: spacing.lg,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: glass.borderWidth,
    borderColor: glass.stroke,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
    ...shadows.soft,
  },
  dockFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12, 12, 18, 0.88)' },
  dockSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 40 },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  iconSlot: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { flex: 1, borderRadius: radius.pill },
  label: { ...typography.micro, fontSize: 11, color: colors.outline },
  labelActive: { color: colors.primary, fontFamily: typography.label.fontFamily },
});
