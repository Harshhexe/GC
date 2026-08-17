import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, radius, spacing, typography, gradients } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';

type Props = {
  visible: boolean;
  isDownloading: boolean;
  error: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
};

export function AppUpdateModal({
  visible,
  isDownloading,
  error,
  onUpdate,
  onDismiss,
}: Props) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        {/* Dark Backing */}
        <View style={StyleSheet.absoluteFill} />

        <Animated.View entering={FadeInUp.duration(300)} style={styles.card}>
          {/* Top Accent Strip */}
          <LinearGradient
            colors={['#818CF8', '#C084FC', '#F472B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentBar}
          />

          {/* Badge Icon */}
          <View style={styles.iconCircle}>
            <LinearGradient
              colors={['#1E1B2E', '#161426']}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.iconEmoji}>🚀</Text>
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.title}>Update Available!</Text>
          <Text style={styles.subtitle}>
            A fresh version of GC is ready with the newest features, UI polish, and performance upgrades.
          </Text>

          {/* Feature Highlights */}
          <View style={styles.featuresBox}>
            <View style={styles.featureRow}>
              <View style={[styles.featureBullet, { backgroundColor: 'rgba(129, 140, 248, 0.2)' }]}>
                <Ionicons name="flash" size={14} color="#818CF8" />
              </View>
              <Text style={styles.featureText}>Instant Over-The-Air Installation</Text>
            </View>

            <View style={styles.featureRow}>
              <View style={[styles.featureBullet, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <Ionicons name="sparkles" size={14} color="#10B981" />
              </View>
              <Text style={styles.featureText}>Latest UI & Animation Polishes</Text>
            </View>

            <View style={styles.featureRow}>
              <View style={[styles.featureBullet, { backgroundColor: 'rgba(244, 114, 182, 0.2)' }]}>
                <Ionicons name="shield-checkmark" size={14} color="#F472B6" />
              </View>
              <Text style={styles.featureText}>Performance & Stability Improvements</Text>
            </View>
          </View>

          {/* Error notice if any */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#F87171" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionColumn}>
            <PressableScale
              style={[styles.updateBtn, isDownloading && styles.updateBtnDisabled]}
              scaleTo={0.97}
              disabled={isDownloading}
              onPress={onUpdate}
            >
              <LinearGradient
                colors={isDownloading ? ['#312E4A', '#242238'] : ['#6366F1', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {isDownloading ? (
                <View style={styles.btnContent}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.btnText}>Updating & Restarting...</Text>
                </View>
              ) : (
                <View style={styles.btnContent}>
                  <Ionicons name="refresh" size={18} color="#FFFFFF" />
                  <Text style={styles.btnText}>Update & Restart Now</Text>
                </View>
              )}
            </PressableScale>

            {!isDownloading && (
              <PressableScale style={styles.laterBtn} scaleTo={0.97} onPress={onDismiss}>
                <Text style={styles.laterText}>Remind Me Later</Text>
              </PressableScale>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#12111D', // Solid dark card (NO glassmorphic blur)
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: '#2B2844',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.55,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#3D385E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  iconEmoji: {
    fontSize: 30,
  },
  title: {
    ...typography.headline,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 13.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 19,
    paddingHorizontal: spacing.xs,
  },
  featuresBox: {
    width: '100%',
    backgroundColor: '#181626',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#26233B',
    padding: spacing.md,
    marginTop: spacing.md + 4,
    gap: spacing.sm + 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  featureBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#E2E8F0',
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
  },
  errorText: {
    ...typography.caption,
    fontSize: 12,
    color: '#FCA5A5',
    flex: 1,
  },
  actionColumn: {
    width: '100%',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  updateBtn: {
    width: '100%',
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  updateBtnDisabled: {
    opacity: 0.7,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  laterBtn: {
    width: '100%',
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
