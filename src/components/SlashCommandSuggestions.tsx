import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ComposerSuggestionTile, ComposerSuggestionTray, contrastTextFor } from './ui/ComposerSuggestionTiles';
import type { SlashCommandDef, SlashCommandFeature } from '../lib/gcCommand';

const SHORT_LABELS: Record<SlashCommandFeature, string> = {
  anonymous: 'Anon',
  poll: 'Poll',
  wordy: 'Wordy',
  missed: 'Catch up',
  dna: 'GC DNA',
  tea: 'Tea',
  awards: 'Awards',
  pinned: 'Pinned',
  media: 'Media',
  clear: 'Clear chat',
};

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
    <ComposerSuggestionTray title="Quick commands">
      {(tileWidth) => commands.map((command) => (
        <ComposerSuggestionTile
          key={command.command}
          width={tileWidth}
          label={SHORT_LABELS[command.feature]}
          detail={command.command}
          visualBackgroundColor={command.color}
          visual={
            command.emoji ? (
              <Text style={styles.emoji}>{command.emoji}</Text>
            ) : command.icon ? (
              <Ionicons name={command.icon} size={18} color={contrastTextFor(command.color)} />
            ) : (
              <Text style={[styles.slash, { color: contrastTextFor(command.color) }]}>/</Text>
            )
          }
          onPress={() => onSelect(command)}
          accessibilityLabel={`${command.title}, ${command.command}`}
          accessibilityHint={command.subtitle}
        />
      ))}
    </ComposerSuggestionTray>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 18, lineHeight: 24 },
  slash: { fontSize: 21, fontWeight: '800' },
});
