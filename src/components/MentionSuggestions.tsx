import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAppearance } from '../context/AppearanceContext';
import { ComposerSuggestionTile, ComposerSuggestionTray, contrastTextFor } from './ui/ComposerSuggestionTiles';
import type { GroupMember } from '../types';

/** The @mention picker keeps the same placement and filtering as the composer. */
export function MentionSuggestions({
  visible,
  members,
  showEveryone,
  showGC,
  onSelectMember,
  onSelectEveryone,
  onSelectGC,
}: {
  visible: boolean;
  members: GroupMember[];
  showEveryone: boolean;
  showGC?: boolean;
  onSelectMember: (member: GroupMember) => void;
  onSelectEveryone: () => void;
  onSelectGC?: () => void;
}) {
  const { theme } = useAppearance();
  if (!visible || (members.length === 0 && !showEveryone && !showGC)) return null;

  return (
    <ComposerSuggestionTray>
      {(tileWidth) => (
        <>
          {showGC && !!onSelectGC && (
            <ComposerSuggestionTile
              width={tileWidth}
              label="GC AI"
              visualBackgroundColor={theme.palette.tertiaryContainer}
              visual={<Ionicons name="sparkles" size={18} color={theme.palette.onTertiary} />}
              onPress={onSelectGC}
              accessibilityLabel="Mention GC AI"
              accessibilityHint="Ask GC AI about this conversation"
            />
          )}
          {showEveryone && (
            <ComposerSuggestionTile
              width={tileWidth}
              label="Everyone"
              visualBackgroundColor={theme.palette.secondaryContainer}
              visual={<Ionicons name="people" size={18} color={theme.palette.onSecondary} />}
              onPress={onSelectEveryone}
              accessibilityLabel="Mention everyone"
              accessibilityHint="Notify everyone in this GC"
            />
          )}
          {members.map((member) => (
            <ComposerSuggestionTile
              key={member.id}
              width={tileWidth}
              label={member.displayName}
              visualBackgroundColor={member.avatarColor || theme.palette.primaryContainer}
              visual={
                member.avatarUrl ? (
                  <Image source={member.avatarUrl} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                ) : member.avatarEmoji ? (
                  <Text style={styles.emoji}>{member.avatarEmoji}</Text>
                ) : (
                  <Text style={[styles.initial, { color: contrastTextFor(member.avatarColor || theme.palette.primaryContainer) }]}>{member.displayName.trim().charAt(0).toUpperCase() || '?'}</Text>
                )
              }
              onPress={() => onSelectMember(member)}
              accessibilityLabel={`Mention ${member.displayName}`}
              accessibilityHint={member.username ? `Username @${member.username}` : undefined}
            />
          ))}
        </>
      )}
    </ComposerSuggestionTray>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 18, lineHeight: 24 },
  initial: { fontSize: 18, fontWeight: '800' },
});
