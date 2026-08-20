import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, fontFamily, radius, spacing } from '../theme/theme';
import { duration, reduceMotion } from '../theme/motion';

export function DropZoneOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
      exiting={FadeOut.duration(duration.fast).reduceMotion(reduceMotion)}
      style={styles.overlay}
      pointerEvents="none"
    >
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.20)', 'rgba(236, 72, 153, 0.12)', 'rgba(15, 15, 25, 0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
        />
        <View style={styles.dashedBorder}>
          <View style={styles.iconCircle}>
            <LinearGradient
              colors={['#8B5CF6', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="cloud-upload" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Drop media to send</Text>
          <Text style={styles.subtitle}>Photos, videos, GIFs, or documents</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 5, 10, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: spacing.xl,
  },
  card: {
    width: '90%',
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: 10,
    backgroundColor: '#0F131E',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 20,
  },
  dashedBorder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: radius.lg + 2,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontFamily: fontFamily.displayBold,
    fontSize: 20,
    color: colors.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
});
