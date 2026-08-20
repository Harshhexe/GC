import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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

/**
 * Gold is the Awards identity — it reads as a trophy before you've parsed the
 * shape, which is the whole point of a 28px icon in a dock.
 */
const GOLD = '#FFD76A';
const GOLD_DEEP = '#F0A81C';

type DockIcon = {
  on: keyof typeof Ionicons.glyphMap;
  off: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Drives the beam, the halo, the indicator and the dock's outer glow. */
  accent: string;
  accentDeep: string;
  /** Tabs that keep their colour when unfocused — gold is worth advertising. */
  alwaysTinted?: boolean;
};

const ICONS: Record<string, DockIcon> = {
  GroupList: { on: 'chatbubble', off: 'chatbubble-outline', label: 'Chat', accent: '#A5B4FC', accentDeep: '#6366F1' },
  AddGC: { on: 'add-circle', off: 'add-circle-outline', label: 'Create', accent: '#F9A8D4', accentDeep: '#DB2777' },
  Explore: { on: 'trophy', off: 'trophy-outline', label: 'Awards', accent: GOLD, accentDeep: GOLD_DEEP, alwaysTinted: true },
  Profile: { on: 'person', off: 'person-outline', label: 'Profile', accent: '#A5B4FC', accentDeep: '#818CF8' },
};

const FALLBACK_ICON: DockIcon = {
  on: 'ellipse',
  off: 'ellipse-outline',
  label: '',
  accent: '#FFFFFF',
  accentDeep: '#818CF8',
};

const ITEM_WIDTH = 76;

/** `#RRGGBB` → `rgba()`, so one accent token can drive solid and washed fills. */
function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function SpotlightDockItem({
  routeName,
  focused,
  onPress,
  avatar,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
  /** Rendered in place of the icon — the Profile tab shows you, not a cog. */
  avatar?: { imageUrl?: string | null; label?: string | null };
}) {
  const icon = ICONS[routeName] ?? { ...FALLBACK_ICON, label: routeName };

  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  }, [focused, active]);

  // One soft circular pool behind the active icon. An earlier version also lit
  // the neighbours by distance and drew a rectangular beam above each item;
  // both showed as hard-edged blobs on web, where the gradient has no blur to
  // hide its bounds. The halo is round, clipped and only ever on the focused
  // tab, so there is nothing to leak.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: interpolate(active.value, [0, 1], [0.7, 1]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(active.value, [0, 1], [1, 1.16]) },
      { translateY: interpolate(active.value, [0, 1], [0, -1]) },
    ],
  }));

  const iconColor = focused
    ? icon.accent
    : icon.alwaysTinted
      ? alpha(icon.accent, 0.55)
      : 'rgba(255, 255, 255, 0.45)';

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
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none">
        <LinearGradient
          colors={[alpha(icon.accent, 0.30), alpha(icon.accentDeep, 0.10)]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={styles.haloFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          iconStyle,
          // Native only: on web a View shadow is a *box* shadow, so this drew a
          // dark square behind the icon instead of a glow.
          focused && Platform.OS !== 'web' ? { shadowColor: icon.accent, ...styles.iconGlow } : null,
          !focused && avatar ? styles.avatarDimmed : null,
        ]}
      >
        {avatar ? (
          <Avatar
            imageUrl={avatar.imageUrl}
            label={avatar.label ?? 'Me'}
            size={30}
            ring={focused}
          />
        ) : (
          <Ionicons name={focused ? icon.on : icon.off} size={26} color={iconColor} />
        )}
      </Animated.View>
    </PressableScale>
  );
}

/**
 * Floating Spotlight Navigation Dock
 *
 * A blurred glass pill that floats over the screen, with a per-tab accent that
 * runs through everything at once: the indicator line, the light beam, the halo
 * under the icon and the dock's own outer glow. Awards is gold end to end.
 */
export default function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const activeIndex = state.index;
  const activeIcon = ICONS[state.routes[activeIndex]?.name ?? ''] ?? FALLBACK_ICON;

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
        { paddingBottom: Math.max(insets.bottom, 20) },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dockShadow}>
        {/* Gradient hairline: a 1px padded frame around the glass body, which
            catches light along the top edge the way a real bezel would. */}
        <LinearGradient
          colors={[alpha(activeIcon.accent, 0.32), 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.dockBorder}
        >
          <View style={styles.dock}>
            {/* Frosted body. iOS/Android get a real blur; on web the fallback
                tint below carries it, since backdrop-filter behind a scrolling
                list is expensive enough to drop frames. */}
            {Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, styles.webFill]} />
            ) : (
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <View style={[StyleSheet.absoluteFill, styles.tint]} />
            <LinearGradient
              colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.18)']}
              style={StyleSheet.absoluteFill}
            />

            {/* Top active indicator line */}
            <Animated.View style={[styles.indicatorContainer, indicatorStyle]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', activeIcon.accent, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.indicator, { shadowColor: activeIcon.accent }]}
              />
            </Animated.View>

            {/* Dock Items */}
            {state.routes.map((route, index) => {
              const focused = activeIndex === index;
              return (
                <SpotlightDockItem
                  key={route.key}
                  routeName={route.name}
                  focused={focused}
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
        </LinearGradient>
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
  dockShadow: {
    borderRadius: 9999,
    // Plain black drop shadow. Tinting it with the active accent read as a
    // coloured ring around the pill on web rather than as depth.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 20,
  },
  dockBorder: {
    borderRadius: 9999,
    padding: 1,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 66,
    position: 'relative',
    // Clips the blur, the sheen and every beam to the pill.
    overflow: 'hidden',
  },
  tint: { backgroundColor: 'rgba(16, 16, 30, 0.62)' },
  webFill: { backgroundColor: 'rgba(18, 18, 32, 0.92)' },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 16,
    width: ITEM_WIDTH,
    alignItems: 'center',
    zIndex: 10,
  },
  indicator: {
    width: 52,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
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
  iconGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
  },
  avatarDimmed: { opacity: 0.55 },
  halo: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloFill: { width: 44, height: 44, borderRadius: 22 },
});
