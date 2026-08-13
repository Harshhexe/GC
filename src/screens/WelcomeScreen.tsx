import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { Avatar } from '../components/ui/Avatar';
import { GCButton } from '../components/ui/Buttons';
import { useAuth } from '../context/AuthContext';
import { successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

/**
 * The beat between "account created" and the app itself. Signing up otherwise
 * drops you straight into an empty chat list, which reads as though something
 * failed — this gives the moment somewhere to land, and points at the only
 * two things a brand-new account can actually do next.
 */
export default function WelcomeScreen({ navigation }: Props) {
  const { profile, clearJustSignedUp } = useAuth();

  const avatarScale = useSharedValue(0.4);
  const glow = useSharedValue(0);

  useEffect(() => {
    successFeedback();
    avatarScale.value = withDelay(120, withSpring(1, { damping: 11, stiffness: 140 }));
    // A slow breath under the avatar rather than a one-shot pop, so the screen
    // still feels alive while they read.
    glow.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: easing.inOut, reduceMotion }),
          withTiming(0, { duration: 1600, easing: easing.inOut, reduceMotion })
        ),
        -1,
        false
      )
    );
  }, [avatarScale, glow]);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.18, 0.42]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.9, 1.15]) }],
  }));

  /** Handing control back to the app: the flag is what keeps this screen the
   *  initial route, so it has to be cleared as we leave or a later remount
   *  would land here again. */
  function enterApp() {
    clearJustSignedUp();
    navigation.replace('MainTabs');
  }

  const name = profile?.display_name ?? 'you';

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.avatarGlow, glowStyle]} />
            <Animated.View style={avatarStyle}>
              <Avatar
                emoji={profile?.avatar_emoji}
                imageUrl={profile?.avatar_url}
                label={profile?.display_name}
                size={132}
                ringColors={[profile?.avatar_color ?? colors.primary, colors.secondary]}
                glow
              />
            </Animated.View>
          </View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 2)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.copy}
          >
            <Text style={styles.title}>welcome, {name}</Text>
            <Text style={styles.subtitle}>
              you're in. GC is nothing without a group chat though — start one, or hop into a
              friend's.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(STAGGER_MS * 4).duration(duration.slow).reduceMotion(reduceMotion)}
            style={styles.hints}
          >
            <Hint icon="add-circle-outline" text="Create a GC and share the code" />
            <Hint icon="key-outline" text="Or join one with a 6-character code" />
          </Animated.View>
        </View>

        <Animated.View
          entering={FadeInDown.delay(STAGGER_MS * 5)
            .duration(duration.slow)
            .easing(easing.out)
            .reduceMotion(reduceMotion)}
          style={styles.footer}
        >
          <GCButton
            label="Let's go"
            variant="gradient"
            neo
            onPress={enterApp}
            icon={<Ionicons name="arrow-forward" size={19} color="#FFFFFF" />}
          />
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function Hint({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.hintRow}>
      <View style={styles.hintIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.hintText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    gap: spacing.xl,
  },
  avatarWrap: { alignItems: 'center', justifyContent: 'center' },
  avatarGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: radius.pill,
    backgroundColor: colors.accentGlow,
  },
  copy: { alignItems: 'center', gap: spacing.sm },
  title: { ...typography.headline, fontSize: 32, color: colors.onSurface, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  hints: { gap: spacing.md, alignSelf: 'stretch', paddingHorizontal: spacing.md },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hintIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(208, 188, 255, 0.12)',
  },
  hintText: { ...typography.caption, fontSize: 13.5, color: colors.onSurfaceVariant, flexShrink: 1 },
  footer: { paddingHorizontal: CONTAINER_MARGIN, paddingBottom: spacing.lg },
});
