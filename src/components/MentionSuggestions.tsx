import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, glass, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { Avatar } from './ui/Avatar';
import { PressableScale } from './ui/PressableScale';
import type { GroupMember } from '../types';

/**
 * The @mention picker — floats directly above the composer rather than
 * pushing it around, and closes itself the instant its `visible` prop goes
 * false (driven entirely by whether an active @query exists; see ChatScreen).
 */
export function MentionSuggestions({
  visible,
  members,
  showEveryone,
  showGC,
  accentColor,
  onSelectMember,
  onSelectEveryone,
  onSelectGC,
}: {
  visible: boolean;
  members: GroupMember[];
  /** Show the "@everyone" row above the member list. */
  showEveryone: boolean;
  /** Show the "@gc" AI row. Not a member — it routes the message to the AI
   *  instead of mentioning anyone. */
  showGC?: boolean;
  accentColor: string;
  onSelectMember: (member: GroupMember) => void;
  onSelectEveryone: () => void;
  onSelectGC?: () => void;
}) {
  if (!visible || (members.length === 0 && !showEveryone && !showGC)) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
      exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
      style={styles.wrap}
    >
      {Platform.OS !== 'web' && <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />}
      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        ListHeaderComponent={
          showGC || showEveryone ? (
            <View>
              {/* GC sits at the top: it's the only row that does something
                  other than mention a person, and it's what someone typing
                  "@g" is usually reaching for. */}
              {showGC && !!onSelectGC && (
                <PressableScale style={styles.row} scaleTo={0.98} haptic="light" onPress={onSelectGC}>
                  <View style={[styles.everyoneIcon, { backgroundColor: `${accentColor}26` }]}>
                    <Ionicons name="sparkles" size={17} color={accentColor} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName}>gc</Text>
                    <Text style={styles.rowMeta}>Ask GC AI anything about this chat</Text>
                  </View>
                </PressableScale>
              )}
              {showEveryone && (
                <PressableScale style={styles.row} scaleTo={0.98} haptic="light" onPress={onSelectEveryone}>
                  <View style={[styles.everyoneIcon, { backgroundColor: `${accentColor}26` }]}>
                    <Ionicons name="megaphone" size={18} color={accentColor} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName}>everyone</Text>
                    <Text style={styles.rowMeta}>Notify the whole GC</Text>
                  </View>
                </PressableScale>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <PressableScale style={styles.row} scaleTo={0.98} haptic="light" onPress={() => onSelectMember(item)}>
            <Avatar
              emoji={item.avatarEmoji}
              imageUrl={item.avatarUrl}
              label={item.displayName}
              size={34}
              ringColors={[item.avatarColor, accentColor]}
            />
            <View style={styles.rowCopy}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.displayName}
              </Text>
              {!!item.username && (
                <Text style={styles.rowMeta} numberOfLines={1}>
                  @{item.username}
                </Text>
              )}
            </View>
          </PressableScale>
        )}
      />
    </Animated.View>
  );
}

const MAX_HEIGHT = 220;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: spacing.xs + 2,
    maxHeight: MAX_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: '#151421',
    borderWidth: 1.5,
    borderColor: '#2D2A45',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  list: { maxHeight: MAX_HEIGHT },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowCopy: { flex: 1, gap: 1 },
  rowName: { ...typography.bodyMedium, fontSize: 14.5, color: colors.onSurface },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.onSurfaceVariant },
  everyoneIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
