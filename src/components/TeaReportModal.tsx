import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import {
  AuroraBackground,
  SpotlightCard,
  ShinyText,
  DecryptedText,
  NeonBadge,
  AIPulsingCore,
  BentoStatBox,
} from './reactbits';
import { GlassPanel } from './ui/Glass';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import { AIThinking } from './ui/AIState';
import { AIStoryHero } from './ui/AIStoryHero';
import { GCButton } from './ui/Buttons';
import type { TeaSession } from '../hooks/useTeaSession';

const TEA_ACCENT = colors.yellow;

function Section({
  label,
  children,
  delay,
}: {
  label: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
      style={styles.section}
    >
      <View style={styles.sectionHeading}>
        <NeonBadge label={label.toUpperCase()} color={TEA_ACCENT} />
      </View>
      {children}
    </Animated.View>
  );
}

/**
 * The Tea Report — what the session actually was.
 *
 * Every claim that names a message offers a receipt, and tapping one closes
 * this and jumps the chat to that message through the existing
 * jumpToMessage, rather than building a second way to navigate to a message.
 */
export function TeaReportModal({
  visible,
  session,
  onClose,
  onJumpToMessage,
  onRetry,
}: {
  visible: boolean;
  session: TeaSession | null;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();

  if (!session) return null;

  const report = session.report;
  const generating = session.status === 'generating';
  const failed = session.status === 'failed';

  function jump(messageId: string) {
    onClose();
    onJumpToMessage(messageId);
  }

  const modalBody = (
    <>
      {generating && (
        <View style={styles.stateBox}>
          <AIThinking tint={TEA_ACCENT} />
          <Text style={styles.brewingText}>Preparing the Tea report…</Text>
        </View>
      )}

      {failed && (
        <View style={styles.stateBox}>
          <Text style={styles.failText}>
            The report isn't available right now.
          </Text>
          <GCButton
            label="Try again"
            variant="ghost"
            full={false}
            icon={<Ionicons name="refresh" size={16} color={colors.primary} />}
            onPress={() => {
              onRetry();
              onClose();
            }}
          />
        </View>
      )}

      {!!report && !generating && !failed && (
        <>
          <SpotlightCard
            spotlightColor="rgba(245, 158, 11, 0.28)"
            borderColor="rgba(245, 158, 11, 0.35)"
            borderRadius={26}
            style={styles.heroCard}
          >
            <View style={styles.teaHeroInner}>
              <View style={styles.teaHeroTopRow}>
                <AIPulsingCore accentColor={TEA_ACCENT} size={46} icon="cafe" />
                <View style={styles.teaHeroBadgeCol}>
                  <NeonBadge label="TODAY'S TEA" color={TEA_ACCENT} />
                  <ShinyText
                    text="LIVE DRAMA REPORT"
                    style={styles.teaHeroShimmer}
                    shineColor="#FFFFFF"
                    baseColor="rgba(253, 224, 71, 0.7)"
                  />
                </View>
              </View>

              <View style={styles.teaHeroTitleWrap}>
                <DecryptedText
                  text={report.title}
                  style={styles.teaHeroTitle}
                  speed={28}
                />
                <Text style={styles.teaHeroDesc}>
                  The conversation, condensed into the spicy moments that mattered.
                </Text>
              </View>

              <View style={styles.teaBentoRow}>
                <BentoStatBox
                  icon="person"
                  iconColor="#F59E0B"
                  value={session.startedByName}
                  label="Spilled By"
                  sublabel="Host"
                />
                <BentoStatBox
                  icon="chatbubble-ellipses"
                  iconColor="#EF4444"
                  value={report.messageCount}
                  label="Messages"
                  sublabel="In session"
                />
                <BentoStatBox
                  icon="people"
                  iconColor="#10B981"
                  value={report.people.length}
                  label="Cast"
                  sublabel="Involved"
                />
              </View>
            </View>
          </SpotlightCard>

          <Section label="The story" delay={60}>
            <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.18)" borderColor="rgba(255, 255, 255, 0.10)" borderRadius={20} style={styles.card}>
              <Text style={styles.body}>{report.summary}</Text>
            </SpotlightCard>
          </Section>

          {report.people.length > 0 && (
            <Section label="People involved" delay={120}>
              <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.18)" borderColor="rgba(255, 255, 255, 0.10)" borderRadius={20} style={styles.card}>
                {report.people.map((p, i) => (
                  <View
                    key={`${p.name}-${i}`}
                    style={[
                      styles.personRow,
                      i < report.people.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>{p.name}</Text>
                      <Text style={styles.personRole}>{p.role}</Text>
                    </View>
                    {p.messageIds.length > 0 && (
                      <PressableScale
                        style={styles.personJumpBtn}
                        scaleTo={0.95}
                        haptic="light"
                        onPress={() => jump(p.messageIds[0])}
                      >
                        <Ionicons name="arrow-forward-circle-outline" size={20} color={TEA_ACCENT} />
                      </PressableScale>
                    )}
                  </View>
                ))}
              </SpotlightCard>
            </Section>
          )}

          {report.plotTwists.length > 0 && (
            <Section label="Key moments" delay={180}>
              <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.18)" borderColor="rgba(255, 255, 255, 0.10)" borderRadius={20} style={styles.card}>
                {report.plotTwists.map((t, i) => (
                  <View
                    key={i}
                    style={[
                      styles.twistRow,
                      i < report.plotTwists.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View style={styles.twistIndexPill}>
                      <Text style={styles.twistIndex}>{i + 1}</Text>
                    </View>
                    <View style={styles.twistCopy}>
                      <Text style={styles.body}>{t.text}</Text>
                      {t.messageIds.length > 0 && (
                        <PressableScale
                          style={styles.receiptBtn}
                          scaleTo={0.97}
                          haptic="light"
                          onPress={() => jump(t.messageIds[0])}
                        >
                          <Ionicons name="receipt-outline" size={13} color={TEA_ACCENT} />
                          <Text style={styles.receiptText}>View receipt</Text>
                        </PressableScale>
                      )}
                    </View>
                  </View>
                ))}
              </SpotlightCard>
            </Section>
          )}

          <Section label="Intensity" delay={240}>
            <SpotlightCard spotlightColor="rgba(239, 68, 68, 0.22)" borderColor="rgba(239, 68, 68, 0.35)" borderRadius={20} style={styles.card}>
              <View style={styles.dramaRow}>
                <Text style={styles.drama}>{'🔥'.repeat(Math.min(5, Math.max(1, report.dramaLevel)))}</Text>
                <View style={styles.dramaPill}>
                  <Text style={styles.dramaMeta}>{report.dramaLevel} / 5</Text>
                </View>
              </View>
            </SpotlightCard>
          </Section>

          {!!report.outcome && (
            <Section label="Outcome" delay={300}>
              <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.18)" borderColor="rgba(255, 255, 255, 0.10)" borderRadius={20} style={styles.card}>
                <Text style={styles.body}>{report.outcome}</Text>
              </SpotlightCard>
            </Section>
          )}

          {report.receiptMessageIds.length > 0 && (
            <Section label="Messages" delay={360}>
              <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.18)" borderColor="rgba(255, 255, 255, 0.10)" borderRadius={20} style={styles.card}>
                <View style={styles.receiptList}>
                  {report.receiptMessageIds.map((id, i) => (
                    <PressableScale
                      key={id}
                      style={styles.receiptChip}
                      scaleTo={0.96}
                      haptic="light"
                      onPress={() => jump(id)}
                    >
                      <Ionicons name="open-outline" size={13} color={TEA_ACCENT} />
                      <Text style={styles.receiptText}>Receipt {i + 1}</Text>
                    </PressableScale>
                  ))}
                </View>
              </SpotlightCard>
            </Section>
          )}

          {/* Back to Chat Button */}
          <Animated.View
            entering={FadeInDown.delay(420).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.ctaWrap}
          >
            <GCButton
              label="Back to Chat"
              variant="gradient"
              icon={<Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
              onPress={onClose}
            />
          </Animated.View>
        </>
      )}
    </>
  );

  // Web rendering: Centered floating card with What I Missed desktop styling
  if (Platform.OS === 'web') {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.webModalLayer}>
          <Pressable style={styles.webBackdrop} onPress={onClose} />

          <View style={styles.webCard}>
            <AuroraBackground color1="#F59E0B" color2="#EF4444" color3="#10B981" opacity={0.34} />

            {/* Web Header */}
            <View style={styles.webHeader}>
              <View style={styles.webHeaderLeft}>
                <PressableScale
                  style={styles.closeBtn}
                  scaleTo={0.9}
                  onPress={onClose}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </PressableScale>
                <View style={styles.webHeaderTitles}>
                  <Text style={styles.webHeaderTitle}>Today's Tea</Text>
                  <Text style={styles.webHeaderSub}>The story behind the conversation</Text>
                </View>
              </View>

              <View style={styles.teaBadge}>
                <Ionicons name="cafe" size={14} color={TEA_ACCENT} />
                <Text style={styles.teaBadgeText}>TEA REPORT</Text>
              </View>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.webScroll}
              showsVerticalScrollIndicator={false}
            >
              {modalBody}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <AuroraBackground color1="#F59E0B" color2="#EF4444" color3="#10B981" opacity={0.34} />

        {/* Safe Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }]}>
          <View style={styles.teaBadge}>
            <Ionicons name="cafe" size={14} color={TEA_ACCENT} />
            <Text style={styles.teaBadgeText}>TEA REPORT</Text>
          </View>

          <PressableScale
            style={styles.closeBtn}
            scaleTo={0.88}
            hitSlop={12}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </PressableScale>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom + 30, 48) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {modalBody}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingBottom: spacing.sm,
    zIndex: 20,
  },
  teaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251, 191, 36, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  teaBadgeText: {
    ...typography.micro,
    fontWeight: '800',
    color: TEA_ACCENT,
    letterSpacing: 1,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0,
    shadowRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.xs,
    gap: spacing.xl,
  },
  webModalLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 1000,
  },
  webBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  webCard: {
    width: '100%',
    maxWidth: 800,
    maxHeight: 820,
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.appRoot,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 10,
  },
  webHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  webHeaderTitles: {
    gap: 2,
  },
  webHeaderTitle: {
    ...typography.headline,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  webHeaderSub: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  webScroll: {
    padding: CONTAINER_MARGIN,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 20,
    gap: spacing.xl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  stateBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.section },
  brewingText: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center' },
  failText: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center' },
  hero: { gap: spacing.xs, paddingVertical: spacing.sm },
  title: {
    ...typography.displayXl,
    fontSize: 26,
    lineHeight: 32,
    color: colors.onSurface,
    fontWeight: '800',
    flexShrink: 1,
  },
  meta: { ...typography.caption, color: colors.onSurfaceVariant },
  heroDetails: { flexDirection: 'row', gap: 22, flexWrap: 'wrap' },
  heroDetail: { ...typography.micro, fontSize: 10, letterSpacing: 0.8, color: colors.onSurfaceVariant },
  heroDetailValue: { color: colors.onSurface, fontWeight: '800' },
  section: { gap: spacing.sm },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionMark: { width: 13, height: 2, backgroundColor: TEA_ACCENT, borderRadius: 1 },
  sectionLabel: { ...typography.label, fontSize: 11, color: colors.onSurfaceVariant, letterSpacing: 1, textTransform: 'uppercase' },
  card: {
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderBright,
    backgroundColor: colors.surfaceLow,
  },
  body: { ...typography.body, color: colors.onSurface, lineHeight: 25, flexShrink: 1 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowDivider: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  personCopy: { flex: 1, gap: 2, flexShrink: 1 },
  personName: { ...typography.titleMd, fontSize: 16, color: colors.onSurface },
  personRole: { ...typography.caption, color: colors.onSurfaceVariant, flexShrink: 1 },
  personJumpBtn: { padding: 4 },
  twistRow: { flexDirection: 'row', gap: spacing.md },
  twistIndexPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  twistIndex: { ...typography.label, fontSize: 12, color: TEA_ACCENT, fontWeight: '800' },
  twistCopy: { flex: 1, gap: spacing.sm, flexShrink: 1 },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251, 191, 36, 0.10)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  receiptText: { ...typography.label, fontSize: 11, color: TEA_ACCENT },
  dramaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drama: { fontSize: 24, letterSpacing: 2 },
  dramaPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dramaMeta: { ...typography.label, fontSize: 12, color: colors.onSurfaceVariant },
  receiptList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  receiptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: `${TEA_ACCENT}55`,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ctaWrap: {
    marginTop: spacing.sm,
  },
  heroCard: {
    padding: spacing.lg,
    overflow: 'hidden',
  },
  teaHeroInner: {
    gap: spacing.md,
  },
  teaHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  teaHeroBadgeCol: {
    gap: 3,
  },
  teaHeroShimmer: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  teaHeroTitleWrap: {
    gap: 6,
  },
  teaHeroTitle: {
    ...typography.displayXl,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  teaHeroDesc: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceVariant,
  },
  teaBentoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
