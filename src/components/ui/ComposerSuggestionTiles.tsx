import { ReactNode, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAppearance } from '../../context/AppearanceContext';
import { duration, reduceMotion } from '../../theme/motion';
import { PressableScale } from './PressableScale';

const PANEL_PADDING = 8;
const TILE_GAP = 6;

export function contrastTextFor(background: string) {
  const hex = background.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.35 ? '#10131B' : '#FFFFFF';
}

type SuggestionTrayProps = {
  title?: string;
  children: (tileWidth: number) => ReactNode;
};

/** A small, vertically scrollable grid that leaves the conversation visible. */
export function ComposerSuggestionTray({ title, children }: SuggestionTrayProps) {
  const { theme } = useAppearance();
  const palette = theme.palette;
  const [width, setWidth] = useState(360);
  const columns = width < 340 ? 3 : width < 510 ? 4 : width < 700 ? 5 : 6;
  const tileWidth = Math.max(76, Math.floor((width - PANEL_PADDING * 2 - TILE_GAP * (columns - 1) - 4) / columns));

  function measure(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  }

  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
      onLayout={measure}
      style={[styles.tray, { maxHeight: title ? 198 : 182, backgroundColor: palette.surfaceLow, borderColor: palette.borderBright }]}
    >
      {!!title && <Text style={[styles.trayTitle, { color: palette.onSurfaceVariant }]}>{title}</Text>}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {children(tileWidth)}
      </ScrollView>
    </Animated.View>
  );
}

type SuggestionTileProps = {
  width: number;
  label: string;
  detail?: string;
  visual: ReactNode;
  visualBackgroundColor?: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
};

export function ComposerSuggestionTile({
  width,
  label,
  detail,
  visual,
  visualBackgroundColor,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: SuggestionTileProps) {
  const { theme } = useAppearance();
  const palette = theme.palette;
  const [focused, setFocused] = useState(false);
  const visualSize = 36;

  return (
    <PressableScale
      style={[
        styles.tile,
        { width, height: 78, backgroundColor: palette.surfaceHigh, borderColor: focused ? palette.primary : palette.border },
      ]}
      scaleTo={0.96}
      haptic="light"
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setFocused(true)}
      onHoverOut={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View style={[styles.visual, { width: visualSize, height: visualSize, borderRadius: visualSize / 2, backgroundColor: visualBackgroundColor || palette.primaryContainer }]}>
        {visual}
      </View>
      <Text style={[styles.label, { color: palette.onSurface }]} numberOfLines={1}>
        {label}
      </Text>
      {!!detail && <Text style={[styles.detail, { color: palette.onSurfaceVariant }]} numberOfLines={1}>{detail}</Text>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tray: {
    width: '100%',
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  trayTitle: {
    paddingHorizontal: PANEL_PADDING + 2,
    paddingTop: 7,
    paddingBottom: 0,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scroll: { flexGrow: 0 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
    padding: PANEL_PADDING,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  visual: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    maxWidth: '100%',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
  detail: {
    maxWidth: '100%',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
    textAlign: 'center',
  },
});
