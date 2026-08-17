import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import type { SlashCommandDef } from '../lib/gcCommand';

export function SlashCommandSuggestions({
  visible,
  commands,
  onSelect,
}: {
  visible: boolean;
  commands: SlashCommandDef[];
  onSelect: (cmd: SlashCommandDef) => void;
}) {
  if (!visible || commands.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
      exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      {Platform.OS !== 'web' && (
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      )}

      <View style={styles.header}>
        <Ionicons name="flash" size={13} color={colors.accent} />
        <Text style={styles.headerTitle}>QUICK COMMANDS</Text>
      </View>

      <FlatList
        data={commands}
        keyExtractor={(c) => c.command}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <PressableScale
            style={styles.row}
            scaleTo={0.98}
            haptic="light"
            onPress={() => onSelect(item)}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: `${item.color}20`, borderColor: `${item.color}40` },
              ]}
            >
              {item.emoji ? (
                <Text style={styles.emoji}>{item.emoji}</Text>
              ) : item.icon ? (
                <Ionicons name={item.icon} size={18} color={item.color} />
              ) : (
                <Text style={[styles.commandPrefix, { color: item.color }]}>/</Text>
              )}
            </View>

            <View style={styles.rowCopy}>
              <View style={styles.titleRow}>
                <Text style={styles.rowName}>{item.title}</Text>
                <View style={[styles.commandBadge, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                  <Text style={[styles.commandText, { color: item.color }]}>{item.command}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
          </PressableScale>
        )}
      />
    </Animated.View>
  );
}

const MAX_HEIGHT = 280;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: spacing.sm,
    maxHeight: MAX_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18, 16, 26, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.onSurfaceVariant,
  },
  list: { maxHeight: MAX_HEIGHT - 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emoji: {
    fontSize: 18,
  },
  commandPrefix: {
    fontSize: 16,
    fontWeight: '900',
  },
  rowCopy: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    ...typography.bodyMedium,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.onSurface,
  },
  commandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  commandText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '700',
  },
  rowMeta: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
});
