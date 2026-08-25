import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { groupTheme } from '../theme/groupThemes';
import { Avatar } from './ui/Avatar';
import { PressableScale } from './ui/PressableScale';
import type { ClaimedAwardItem } from '../screens/ExploreScreen';

/**
 * One trophy in the trophy room.
 *
 * The card this replaces rendered every award identically: the same amber
 * orb, the same amber pill, the same weight, whether the award was a genuine
 * milestone or a throwaway roast. A shelf where every trophy is the same
 * shape is not a shelf, it is a list, and the thing people actually come back
 * to read (the line of commentary explaining *why* they won) was the smallest
 * and lowest-contrast text on it.
 *
 * Three changes carry the redesign:
 *
 * 1. The award title is the hero. It was 16px, smaller than the surrounding
 *    chrome, which put the page furniture above the content. It is now the
 *    largest thing on the card.
 * 2. The commentary is the payoff, not a footnote. It gets real size, a warm
 *    ground, and a quote mark, because it is the sentence people screenshot.
 * 3. Gold is scarce. Applying the same amber to all of them spent the colour
 *    on nothing. Only the medal keeps it, and the group keeps its own theme
 *    accent, so two awards from different chats no longer look identical.
 */

/**
 * Podium metals. Rendered as a numbered badge rather than the 🥇🥈🥉 emoji,
 * which collapse into illegible specks at badge size on every platform.
 */
const PODIUM = [
  { ring: '#FBBF24', fill: '#4A3407', wash: 'rgba(251, 191, 36, 0.085)' },
  { ring: '#CBD5E1', fill: '#33383F', wash: 'rgba(203, 213, 225, 0.06)' },
  { ring: '#D97757', fill: '#40260F', wash: 'rgba(217, 119, 87, 0.07)' },
] as const;

export function AwardCard({
  item,
  /** Position in the list. The first three get medal treatment. */
  rank,
  onPress,
}: {
  item: ClaimedAwardItem;
  rank: number;
  onPress: () => void;
}) {
  const theme = groupTheme(item.groupThemeKey);
  const isPodium = rank < 3;

  return (
    <PressableScale style={styles.wrap} scaleTo={0.985} haptic="light" onPress={onPress}>
      <View style={styles.card}>
        {/*
          A single warm wash behind the top of the card rather than a border
          around the whole thing. It reads as light falling on the medal,
          which is what makes the card feel lit rather than outlined.
        */}
        <LinearGradient
          colors={
            isPodium
              ? [PODIUM[rank].wash, 'transparent']
              : ['rgba(255, 255, 255, 0.035)', 'transparent']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0.55, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.body}>
          {/* Medal + award emoji, stacked so the emoji reads as the trophy
              itself and the medal as the placing. */}
          <View style={styles.medalCol}>
            <View style={[styles.orb, isPodium && { borderColor: PODIUM[rank].ring + '88' }]}>
              <Text style={styles.orbEmoji}>{item.award.emoji}</Text>
            </View>
            {/* Sits on the orb's edge the way a placing sits on a medal,
                rather than floating underneath it in dead space. */}
            <View
              style={[
                styles.rankBadge,
                isPodium
                  ? { backgroundColor: PODIUM[rank].fill, borderColor: PODIUM[rank].ring }
                  : styles.rankBadgePlain,
              ]}
            >
              <Text
                style={[
                  styles.rankText,
                  isPodium ? { color: PODIUM[rank].ring } : { color: colors.textMuted },
                ]}
              >
                {rank + 1}
              </Text>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={2}>
              {item.award.title}
            </Text>

            {/* The measurable fact behind the award, when there is one. Set
                in tabular figures so a column of these lines up. */}
            {!!item.award.value && (
              <Text
                style={[
                  styles.value,
                  isPodium ? { color: PODIUM[rank].ring } : styles.valuePlain,
                ]}
                numberOfLines={1}
              >
                {item.award.value}
              </Text>
            )}

            {/*
              Why they won. This is the line people screenshot and send back
              to the group, so it gets the room a punchline needs instead of
              the caption treatment it had.
            */}
            {!!item.award.reason && (
              <View
                style={[
                  styles.quote,
                  { borderLeftColor: isPodium ? PODIUM[rank].ring + '66' : 'rgba(255,255,255,0.14)' },
                ]}
              >
                <Text style={styles.quoteText}>{item.award.reason}</Text>
              </View>
            )}

            {/* Where it came from. Carries the group's own accent so two
                awards from different chats are distinguishable at a glance. */}
            <View style={styles.footer}>
              <View style={styles.source}>
                <Avatar
                  imageUrl={item.groupAvatarUrl}
                  label={item.groupName}
                  size={18}
                  ringColors={theme.colors}
                />
                <Text style={[styles.sourceName, { color: theme.accent }]} numberOfLines={1}>
                  {item.groupName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.outline} />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.028)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.35,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
    }),
  },
  body: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },

  medalCol: { width: 52, height: 52 },
  orb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  orbEmoji: { fontSize: 25 },
  rankBadge: {
    position: 'absolute',
    bottom: -3,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  rankBadgePlain: {
    backgroundColor: '#1A1B22',
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  rankText: {
    ...typography.micro,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  content: { flex: 1, gap: 7 },
  title: {
    ...typography.title,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.onSurface,
  },
  /* Colour comes from the card's metal so the ring, the quote rule and the
     figure all agree; a gold number on a silver card was the one place the
     tiering broke. */
  value: {
    ...typography.micro,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  /* Off the podium the value is information, not a decoration. */
  valuePlain: { color: colors.textMuted, fontWeight: '600' },

  quote: {
    borderLeftWidth: 2,
    paddingLeft: spacing.md - 2,
    paddingVertical: 1,
    marginTop: 3,
    marginBottom: 1,
  },
  quoteText: {
    ...typography.body,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurfaceVariant,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  source: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  sourceName: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
});
