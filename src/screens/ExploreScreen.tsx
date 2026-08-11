import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel, Chip } from '../components/ui/Glass';
import { AppHeader } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { useGroups } from '../hooks/useGroups';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Explore'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Features from the GC concept doc that aren't built yet. Listed honestly as
 *  "not yet" rather than rendered as if they work. */
const ROADMAP: { emoji: string; title: string; detail: string; phase: string }[] = [
  { emoji: '🧠', title: 'AI recaps', detail: 'real "what did I miss" summaries', phase: 'Phase 4' },
  { emoji: '🍵', title: 'Tea Mode', detail: 'auto-detect when tea is being spilled', phase: 'Phase 5' },
  { emoji: '🧬', title: 'GC DNA', detail: '37% chaos, 29% gossip, 5% productivity', phase: 'Phase 5' },
  { emoji: '🏆', title: 'GC Awards', detail: 'weekly yapper / lurker / menace awards', phase: 'Phase 5' },
  { emoji: '⚖️', title: 'GC Court', detail: 'put your friends on trial', phase: 'Phase 6' },
  { emoji: '📊', title: 'GC Wrapped', detail: 'your year in group chat', phase: 'Phase 6' },
];

export default function ExploreScreen({ navigation }: Props) {
  const { groups } = useGroups({ realtime: false });
  const { profile } = useAuth();

  const liveGroups = groups.filter((g) => !!g.lastMessage).length;

  return (
    <View style={styles.root}>
      <AmbientBackground variant="vivid" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          wordmark
          right={<Avatar emoji={profile?.avatar_emoji} imageUrl={profile?.avatar_url} label={profile?.display_name} size={38} />}
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View
            entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.titleBlock}
          >
            <Text style={styles.title}>Explore</Text>
            <Text style={styles.subtitle}>What this GC is turning into.</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
          >
            <GlassPanel borderRadius={radius.lg} style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{groups.length}</Text>
                  <Text style={styles.summaryLabel}>GCS JOINED</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.tertiary }]}>{liveGroups}</Text>
                  <Text style={styles.summaryLabel}>ACTUALLY ALIVE</Text>
                </View>
              </View>

              <PressableScale
                style={styles.cta}
                scaleTo={0.97}
                haptic="medium"
                onPress={() => navigation.navigate('AddGC')}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.ctaText}>start or join another one</Text>
              </PressableScale>
            </GlassPanel>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 2)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.roadmapBlock}
          >
            <Text style={styles.sectionTitle}>Coming to the GC</Text>
            <Text style={styles.sectionNote}>
              None of these are live yet — they're the next builds, not features hiding somewhere.
            </Text>

            {ROADMAP.map((item, i) => (
              <Animated.View
                key={item.title}
                entering={FadeInDown.delay(STAGGER_MS * 3 + i * 40)
                  .duration(duration.slow)
                  .easing(easing.out)
                  .reduceMotion(reduceMotion)}
              >
                <GlassPanel borderRadius={radius.lg} style={styles.roadmapRow} sheen={false}>
                  <Text style={styles.roadmapEmoji}>{item.emoji}</Text>
                  <View style={styles.roadmapCopy}>
                    <Text style={styles.roadmapTitle}>{item.title}</Text>
                    <Text style={styles.roadmapDetail}>{item.detail}</Text>
                  </View>
                  <Chip tone="primary">
                    <Text style={styles.phaseText}>{item.phase}</Text>
                  </Chip>
                </GlassPanel>
              </Animated.View>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: {
    padding: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.xl,
  },
  titleBlock: { paddingTop: spacing.md },
  title: { ...typography.headline, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant, marginTop: 4 },
  summaryCard: { padding: spacing.xl, gap: spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { ...typography.headline, fontSize: 34, color: colors.primary },
  summaryLabel: { ...typography.label, fontSize: 10, color: colors.onSurfaceVariant },
  summaryDivider: { width: 1, height: 44, backgroundColor: glass.stroke },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(208,188,255,0.35)',
    backgroundColor: 'rgba(208,188,255,0.10)',
    paddingVertical: spacing.md,
  },
  ctaText: { ...typography.caption, color: colors.primary },
  roadmapBlock: { gap: spacing.md },
  sectionTitle: { ...typography.headline, fontSize: 24, color: colors.onSurface },
  sectionNote: {
    ...typography.caption,
    color: colors.outline,
    marginBottom: spacing.sm,
    lineHeight: 19,
  },
  roadmapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  roadmapEmoji: { fontSize: 26 },
  roadmapCopy: { flex: 1, gap: 2 },
  roadmapTitle: { ...typography.titleMd, fontSize: 17, color: colors.onSurface },
  roadmapDetail: { ...typography.micro, color: colors.onSurfaceVariant },
  phaseText: { ...typography.label, fontSize: 10, color: colors.primary },
});
