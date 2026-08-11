import { Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/theme';

const LOGO = require('../../../assets/gc_app_logo-transparent.png');

/**
 * The GC transparent logo brand component.
 */
export function GCLogo({
  size = 120,
  height,
  glow = true,
  style,
}: {
  size?: number;
  height?: number;
  glow?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const h = height ?? size * 0.75;
  const w = size;

  return (
    <View style={[styles.wrap, glow && styles.glow]}>
      <Image
        source={LOGO}
        style={[{ width: w, height: h }, style]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    shadowColor: colors.primaryContainer,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
