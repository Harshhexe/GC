import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|co|dev|app|ai|me)\b[^\s]*)/i);
  if (!match) return null;
  let url = match[0];
  if (url.endsWith('.') || url.endsWith(',') || url.endsWith(')')) {
    url = url.slice(0, -1);
  }
  return url.toLowerCase().startsWith('http') ? url : `https://${url}`;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreviewCard({
  url,
  accentColor,
}: {
  url: string;
  accentColor: string;
}) {
  const domain = extractDomain(url);
  const [imgError, setImgError] = useState(false);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  async function handlePress() {
    try {
      const fullUrl = url.toLowerCase().startsWith('http') ? url : `https://${url}`;
      await Linking.openURL(fullUrl);
    } catch {
      // openURL fallback
    }
  }

  return (
    <PressableScale
      style={[styles.card, { borderColor: `${accentColor}40` }]}
      scaleTo={0.97}
      haptic="light"
      onPress={handlePress}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${accentColor}20` }]}>
        {!imgError ? (
          <Image
            source={faviconUrl}
            style={styles.favicon}
            contentFit="contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <Ionicons name="link" size={17} color={accentColor} />
        )}
      </View>
      <View style={styles.copyArea}>
        <Text style={[styles.domainText, { color: accentColor }]} numberOfLines={1}>
          {domain}
        </Text>
        <Text style={styles.urlText} numberOfLines={1}>
          {url}
        </Text>
      </View>
      <Ionicons name="open-outline" size={14} color={colors.onSurfaceVariant} style={styles.openIcon} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  favicon: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  copyArea: {
    flex: 1,
    gap: 1,
  },
  domainText: {
    ...typography.label,
    fontSize: 12,
    fontWeight: '700',
  },
  urlText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  openIcon: {
    marginLeft: 2,
  },
});
