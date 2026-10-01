import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useAppearance } from '../../context/AppearanceContext';

const CHAT_DOODLE = require('../../../assets/ChatBG.png');

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A quiet, group-tinted canvas that keeps messages as the focus. */
export function ChatBackground({ colors }: { colors?: readonly [string, string] | null }) {
  const { theme } = useAppearance();
  const accent = colors?.[0] ?? theme.palette.primary;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.palette.bg }]} pointerEvents="none">
      <LinearGradient
        colors={[withAlpha(accent, 0.09), 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={CHAT_DOODLE}
        style={[StyleSheet.absoluteFill, styles.doodle]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  doodle: { opacity: 0.055 },
});
