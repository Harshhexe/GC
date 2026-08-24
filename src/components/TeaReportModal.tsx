import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { CONTAINER_MARGIN, colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from './ui/Glass';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import { AIThinking } from './ui/AIState';
import { GCButton } from './ui/Buttons';
import type { TeaSession } from '../hooks/useTeaSession';

const TEA_ACCENT = '#FBBF24';

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
      <Text style={styles.sectionLabel}>{label}</Text>
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
          <Text style={styles.brewingText}>GC is brewing the tea report...</Text>
        </View>
      )}

      {failed && (
        <View style={styles.stateBox}>
          <Text style={styles.failText}>
            GC's brain couldn't process the tea right now 💀
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
          <Animated.View
            entering={FadeIn.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.hero}
          >
            <Text style={styles.title}>{report.title}</Text>
            <Text style={styles.meta}>
              Started by {session.startedByName} · {report.messageCount} message
              {report.messageCount === 1 ? '' : 's'}
            </Text>
          </Animated.View>

          <Section label="THE STORY" delay={60}>
            <GlassPanel borderRadius={radius.lg} style={styles.card}>
              <Text style={styles.body}>{report.summary}</Text>
            </GlassPanel>
          </Section>

          {report.people.length > 0 && (
            <Section label="👀 PEOPLE INVOLVED" delay={120}>
              <GlassPanel borderRadius={radius.lg} style={styles.card}>
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
              </GlassPanel>
            </Section>
          )}

          {report.plotTwists.length > 0 && (
            <Section label="🔥 PLOT TWISTS" delay={180}>
              <GlassPanel borderRadius={radius.lg} style={styles.card}>
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
              </GlassPanel>
            </Section>
          )}

          <Section label="🌡️ DRAMA LEVEL" delay={240}>
            <GlassPanel borderRadius={radius.lg} style={styles.card}>
              <View style={styles.dramaRow}>
                <Text style={styles.drama}>{'🔥'.repeat(Math.min(5, Math.max(1, report.dramaLevel)))}</Text>
                <View style={styles.dramaPill}>
                  <Text style={styles.dramaMeta}>{report.dramaLevel} / 5</Text>
                </View>
              </View>
            </GlassPanel>
          </Section>

          {!!report.outcome && (
            <Section label="🏁 OUTCOME" delay={300}>
              <GlassPanel borderRadius={radius.lg} style={styles.card}>
                <Text style={styles.body}>{report.outcome}</Text>
              </GlassPanel>
            </Section>
          )}

          {report.receiptMessageIds.length > 0 && (
            <Section label="🧾 RECEIPTS" delay={360}>
              <GlassPanel borderRadius={radius.lg} style={styles.card}>
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
              </GlassPanel>
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
            <AmbientBackground variant="vivid" />

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
                  <Text style={styles.webHeaderTitle}>Tea Report</Text>
                  <Text style={styles.webHeaderSub}>Live Gossip & Group Tea</Text>
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
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        <AmbientBackground variant="vivid" />

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
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingTop: spacing.xs,
    gap: spacing.lg,
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
    maxWidth: 1040,
    maxHeight: 780,
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: '#000',
    shadowOpacity: 0.5,
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
    gap: spacing.lg,
    width: '100%',
    maxWidth: 720,
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
  section: { gap: spacing.xs },
  sectionLabel: { ...typography.label, fontSize: 11, color: colors.onSurfaceVariant, letterSpacing: 1 },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  body: { ...typography.body, color: colors.onSurface, lineHeight: 21, flexShrink: 1 },
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
});
