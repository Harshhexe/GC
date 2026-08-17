import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
import { CONTAINER_MARGIN, colors, glass, gradients, radius, spacing, typography } from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from '../components/ui/Avatar';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { useAuth } from '../context/AuthContext';
import { successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

/** Deep moody atmospheric glow background for Welcome Screen */
function WelcomeAtmosphericBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      <LinearGradient
        colors={['#0C0A14', '#06050A', '#030206']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={['rgba(139, 92, 246, 0.22)', 'rgba(236, 72, 153, 0.10)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topSpotlight}
      />

      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.35)', 'rgba(236, 72, 153, 0.16)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={['rgba(76, 215, 246, 0.22)', 'rgba(99, 102, 241, 0.15)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['rgba(251, 113, 133, 0.18)', 'rgba(139, 92, 246, 0.14)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.24)', 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 95}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={['rgba(255, 255, 255, 0.02)', 'transparent', 'rgba(3, 2, 6, 0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function WelcomeScreen({ navigation }: Props) {
  const { profile, clearJustSignedUp } = useAuth();

  const avatarScale = useSharedValue(0.4);
  const glow = useSharedValue(0);

  useEffect(() => {
    successFeedback();
    avatarScale.value = withDelay(120, withSpring(1, { damping: 11, stiffness: 140 }));
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
    opacity: interpolate(glow.value, [0, 1], [0.2, 0.55]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.9, 1.2]) }],
  }));

  function enterApp() {
    clearJustSignedUp();
    navigation.replace('MainTabs');
  }

  const name = profile?.display_name ?? 'there';

  return (
    <View style={styles.root}>
      <WelcomeAtmosphericBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Avatar Hero */}
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.avatarGlow, glowStyle]} />
            <Animated.View style={avatarStyle}>
              <Avatar
                imageUrl={profile?.avatar_url}
                label={profile?.display_name}
                size={120}
                ringColors={gradients.brand}
                glow
              />
            </Animated.View>
          </View>

          {/* Welcome Copy */}
          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 2)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.copy}
          >
            <View style={styles.welcomeBadge}>
              <Ionicons name="sparkles" size={13} color="#FBBF24" />
              <Text style={styles.welcomeBadgeText}>ACCOUNT READY</Text>
            </View>
            <Text style={styles.title}>Welcome, {name}!</Text>
            <Text style={styles.subtitle}>
              You're all set. Start a fresh group chat or join your friends with an invite code.
            </Text>
          </Animated.View>

          {/* Feature Highlight Cards */}
          <Animated.View
            entering={FadeIn.delay(STAGGER_MS * 4).duration(duration.slow).reduceMotion(reduceMotion)}
            style={styles.hintsCard}
          >
            <GlassPanel borderRadius={radius.xl} style={styles.hintsPanel}>
              <Hint icon="add-circle" color="#A78BFA" title="Create a Group" text="Name your GC and share the 6-character code" />
              <View style={styles.hintDivider} />
              <Hint icon="key" color="#22D3EE" title="Join with Code" text="Hop into a friend's GC instantly" />
            </GlassPanel>
          </Animated.View>
        </View>

        {/* Action Button */}
        <Animated.View
          entering={FadeInDown.delay(STAGGER_MS * 5)
            .duration(duration.slow)
            .easing(easing.out)
            .reduceMotion(reduceMotion)}
          style={styles.footer}
        >
          <PressableScale
            style={styles.ctaBtnWrap}
            scaleTo={0.96}
            haptic="medium"
            onPress={enterApp}
          >
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaBtnGradient}
            >
              <Text style={styles.ctaBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </LinearGradient>
          </PressableScale>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function Hint({
  icon,
  color,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.hintRow}>
      <View style={[styles.hintIcon, { backgroundColor: `${color}18`, borderColor: `${color}35` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.hintCopy}>
        <Text style={styles.hintTitle}>{title}</Text>
        <Text style={styles.hintText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07060B' },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    gap: spacing.lg,
  },

  // Glow Background
  glowBgRoot: { backgroundColor: '#07060B', overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -70, left: -70, width: 280, height: 280, opacity: 0.75 },
  blobTopRight: { top: -60, right: -60, width: 270, height: 270, opacity: 0.7 },
  blobBottomLeft: { bottom: -70, left: -60, width: 280, height: 280, opacity: 0.65 },
  blobBottomRight: { bottom: -80, right: -70, width: 290, height: 290, opacity: 0.7 },

  avatarWrap: { alignItems: 'center', justifyContent: 'center' },
  avatarGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(168, 85, 247, 0.35)',
  },
  welcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.30)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  welcomeBadgeText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.8,
  },
  copy: { alignItems: 'center', gap: 8 },
  title: {
    ...typography.headline,
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },

  hintsCard: { width: '100%', paddingHorizontal: spacing.xs },
  hintsPanel: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hintDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  hintIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  hintCopy: { flex: 1, gap: 2 },
  hintTitle: { ...typography.title, fontSize: 14.5, fontWeight: '700', color: '#FFFFFF' },
  hintText: { ...typography.caption, fontSize: 12, color: '#94A3B8' },

  footer: { paddingHorizontal: CONTAINER_MARGIN, paddingBottom: spacing.lg },
  ctaBtnWrap: { borderRadius: radius.pill },
  ctaBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  ctaBtnText: { ...typography.label, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
