import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from './ui/Glass';
import { Avatar } from './ui/Avatar';
import { GCButton } from './ui/Buttons';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import type { DailyRecapResult } from '../lib/ai';

function StatCard({
  icon,
  iconColor,
  label,
  children,
  delay,
  onPress,
  accentBorderColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  children: React.ReactNode;
  delay: number;
  onPress?: () => void;
  accentBorderColor?: string;
}) {
  const content = (
    <GlassPanel
      borderRadius={radius.xl}
      style={[
        styles.card,
        !!accentBorderColor && { borderColor: accentBorderColor },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardIconWrap, { backgroundColor: `${iconColor}22` }]}>
          <Ionicons name={icon} size={15} color={iconColor} />
        </View>
        <Text style={[styles.cardLabel, { color: iconColor }]}>{label}</Text>
        {!!onPress && (
          <View style={styles.jumpPill}>
            <Text style={styles.jumpText}>Jump</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </GlassPanel>
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      {onPress ? (
        <PressableScale scaleTo={0.98} haptic="light" onPress={onPress}>
          {content}
        </PressableScale>
      ) : (
        content
      )}
    </Animated.View>
  );
}

/**
 * Full-screen "Wrapped"-style reveal for yesterday's recap.
 * Uses background blur, chat-themed word gradients, and safe header spacing.
 */
export function DailyRecapModal({
  visible,
  recap,
  themeGradient,
  onClose,
  onJumpToMessage,
}: {
  visible: boolean;
  recap: DailyRecapResult | null;
  themeGradient?: readonly [string, string];
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}) {
  const insets = useSafeAreaInsets();

  if (!recap) return null;

  const dateLabel = new Date(`${recap.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const gradientColors: readonly [string, string] = themeGradient
    ? [themeGradient[0], themeGradient[1]]
    : ['#8B5CF6', '#EC4899'];

  function jump(messageId: string) {
    onClose();
    onJumpToMessage(messageId);
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
          <View style={styles.wrappedBadge}>
            <Ionicons name="sparkles" size={14} color="#FFD166" />
            <Text style={styles.wrappedBadgeText}>DAILY WRAPPED</Text>
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
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom + 30, 48) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero: Word of the Day */}
          <Animated.View
            entering={FadeIn.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.hero}
          >
            <Text style={styles.dateLabel}>{dateLabel.toUpperCase()}</Text>

            <View style={styles.wordWrapper}>
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.wordChip}
              >
                <Text style={styles.wordText}>{recap.oneWord}</Text>
              </LinearGradient>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.statPill}>
                <Ionicons name="chatbubbles" size={13} color={colors.primary} />
                <Text style={styles.totalText}>
                  {recap.totalMessages} message{recap.totalMessages === 1 ? '' : 's'} recorded
                </Text>
              </View>
            </View>

            {recap.truncated && (
              <Text style={styles.truncatedNote}>
                It was a wild day — this recap covers the loudest highlights!
              </Text>
            )}
          </Animated.View>

          {/* User of the Day */}
          {recap.userOfTheDay && (
            <StatCard
              icon="flame"
              iconColor="#FF6B6B"
              label="👑 USER OF THE DAY"
              delay={80}
              accentBorderColor="rgba(255, 107, 107, 0.4)"
            >
              <View style={styles.personRow}>
                <Avatar
                  emoji={recap.userOfTheDay.avatarEmoji ?? undefined}
                  imageUrl={recap.userOfTheDay.avatarUrl}
                  label={recap.userOfTheDay.name}
                  size={52}
                  ring={true}
                  ringColors={[
                    recap.userOfTheDay.avatarColor ?? colors.secondary,
                    colors.primary,
                  ]}
                />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{recap.userOfTheDay.name}</Text>
                  <Text style={styles.personMeta}>
                    <Text style={styles.personBold}>{recap.userOfTheDay.messageCount}</Text> messages • undisputed yapper
                  </Text>
                </View>
                <View style={styles.yapperBadge}>
                  <Text style={styles.yapperBadgeText}>#1 YAPPER</Text>
                </View>
              </View>
            </StatCard>
          )}

          {/* Message of the Day */}
          {recap.messageOfTheDay && (
            <StatCard
              icon="trophy"
              iconColor={colors.yellow}
              label="🏆 MESSAGE OF THE DAY"
              delay={140}
              onPress={() => jump(recap.messageOfTheDay!.messageId)}
              accentBorderColor="rgba(255, 209, 102, 0.4)"
            >
              <View style={styles.quoteWrapper}>
                <Ionicons name="chatbox-ellipses" size={18} color={colors.yellow} style={styles.quoteIcon} />
                <Text style={styles.quoteText} numberOfLines={4}>
                  "{recap.messageOfTheDay.text}"
                </Text>
              </View>
              <View style={styles.quoteFooter}>
                <Text style={styles.quoteAuthor}>— {recap.messageOfTheDay.sender}</Text>
                <View style={styles.reactionPill}>
                  <Ionicons name="heart" size={12} color="#FF6B6B" />
                  <Text style={styles.reactionCount}>
                    {recap.messageOfTheDay.reactionCount} reaction{recap.messageOfTheDay.reactionCount === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </StatCard>
          )}

          {/* Best Tea */}
          {recap.bestTea && (
            <StatCard
              icon="cafe"
              iconColor="#34D399"
              label="☕ THE BIGGEST TEA"
              delay={200}
              onPress={() => jump(recap.bestTea!.messageId)}
              accentBorderColor="rgba(52, 211, 153, 0.4)"
            >
              <Text style={styles.captionText}>{recap.bestTea.caption}</Text>
            </StatCard>
          )}

          {/* Most Unhinged */}
          {recap.mostUnhinged && (
            <StatCard
              icon="skull"
              iconColor="#F472B6"
              label="💀 PEAK UNHINGED MOMENT"
              delay={260}
              onPress={() => jump(recap.mostUnhinged!.messageId)}
              accentBorderColor="rgba(244, 114, 182, 0.4)"
            >
              <Text style={styles.captionText}>{recap.mostUnhinged.caption}</Text>
            </StatCard>
          )}

          {!recap.userOfTheDay &&
            !recap.messageOfTheDay &&
            !recap.bestTea &&
            !recap.mostUnhinged && (
              <View style={styles.quietBox}>
                <Ionicons name="moon" size={32} color={colors.outline} />
                <Text style={styles.quietText}>
                  Genuinely quiet day. Nobody spilled tea or caused chaos.
                </Text>
              </View>
            )}

          {/* Back to Chat Button */}
          <Animated.View
            entering={FadeInDown.delay(320).duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.ctaWrap}
          >
            <GCButton
              label="Back to Chat"
              variant="gradient"
              icon={<Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
              onPress={onClose}
            />
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    zIndex: 20,
  },
  wrappedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  wrappedBadgeText: {
    ...typography.micro,
    fontWeight: '800',
    color: '#FFD166',
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
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dateLabel: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  wordWrapper: {
    marginVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  wordChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordText: {
    ...typography.displayXl,
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  totalText: {
    ...typography.caption,
    color: colors.onSurface,
    fontWeight: '600',
  },
  truncatedNote: {
    ...typography.micro,
    color: colors.outline,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: 2,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    ...typography.label,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.5,
  },
  cardBody: {
    gap: spacing.sm,
  },
  jumpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  jumpText: {
    ...typography.micro,
    color: colors.primary,
    fontWeight: '700',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  personCopy: {
    flex: 1,
    gap: 3,
  },
  personName: {
    ...typography.title,
    fontSize: 18,
    color: colors.onSurface,
  },
  personMeta: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontSize: 13,
  },
  personBold: {
    fontWeight: '700',
    color: '#FF6B6B',
  },
  yapperBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  yapperBadgeText: {
    ...typography.micro,
    color: '#FF6B6B',
    fontWeight: '800',
  },
  quoteWrapper: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quoteIcon: {
    marginTop: 2,
  },
  quoteText: {
    ...typography.body,
    fontSize: 15,
    color: colors.onSurface,
    fontStyle: 'italic',
    lineHeight: 22,
    flex: 1,
  },
  quoteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  quoteAuthor: {
    ...typography.label,
    fontSize: 12,
    color: colors.outline,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  reactionCount: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  captionText: {
    ...typography.body,
    fontSize: 15,
    color: colors.onSurface,
    lineHeight: 22,
  },
  quietBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  quietText: {
    ...typography.body,
    color: colors.outline,
    textAlign: 'center',
    maxWidth: 240,
  },
  ctaWrap: {
    marginTop: spacing.sm,
  },
});
