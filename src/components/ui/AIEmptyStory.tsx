import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../../theme/theme';

export function AIEmptyStory({ icon, accent, title, description }: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.symbol, { backgroundColor: `${accent}18`, borderColor: `${accent}44` }]}>
        <Ionicons name={icon} size={21} color={accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 7,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  symbol: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    ...typography.title,
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.onSurface,
  },
  description: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 300,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
  },
});
