import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';

type Props = {
  visible: boolean;
  isDownloading: boolean;
  error: string | null;
  updateMessage?: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
};

const CHANGELOG_ITEMS = [
  {
    icon: 'notifications-outline' as const,
    color: '#818CF8',
    title: 'Per-Group Notification Controls & Mute',
    desc: 'Customize notifications per GC (All messages, Mentions & replies only, or Off) and set flexible mute timers (1h, 8h, 1w, or Indefinite).',
  },
  {
    icon: 'at-outline' as const,
    color: '#F472B6',
    title: 'Translucent Mentions & /anon Pills',
    desc: 'Chic interactive glass pills for @members, @everyone, and anonymous mode with one-tap removal.',
  },
  {
    icon: 'camera-outline' as const,
    color: '#10B981',
    title: 'Dynamic Composer Controls',
    desc: 'Camera and mic automatically hide while typing to maximize space and cleanly return when empty.',
  },
  {
    icon: 'eye-off-outline' as const,
    color: '#38BDF8',
    title: 'View Once Photos on Mobile & Web',
    desc: 'Self-destructing media with single-view protections and hardware screenshot safeguards.',
  },
  {
    icon: 'sparkles-outline' as const,
    color: '#FFD166',
    title: 'Real-time Avatar Read Receipts',
    desc: 'Instant last-seen avatar indicators under messages without duplicate badges.',
  },
];

export function AppUpdateModal({
  visible,
  isDownloading,
  error,
  updateMessage,
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
            A new version of GC is ready to install with fresh features and improvements.
          </Text>

          {/* Dynamic Release Note if provided via OTA */}
          {updateMessage && (
            <View style={styles.buildNoteBox}>
              <Ionicons name="sparkles" size={13} color="#818CF8" />
              <Text style={styles.buildNoteText} numberOfLines={2}>
                {updateMessage}
              </Text>
            </View>
          )}

          {/* Actual Changelog Section */}
          <View style={styles.changelogHeader}>
            <Text style={styles.changelogHeaderText}>WHAT'S NEW IN THIS UPDATE</Text>
          </View>

          <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.featuresBox}>
              {CHANGELOG_ITEMS.map((item, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <View style={[styles.featureBullet, { backgroundColor: `${item.color}22` }]}>
                    <Ionicons name={item.icon} size={15} color={item.color} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <Text style={styles.featureDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

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
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: '#12111D',
    borderRadius: radius.xxl,
    borderWidth: 1.5,
    borderColor: '#2B2844',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#3D385E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  iconEmoji: {
    fontSize: 26,
  },
  title: {
    ...typography.headline,
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
  buildNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: spacing.sm,
  },
  buildNoteText: {
    ...typography.micro,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#C7D2FE',
  },
  changelogHeader: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  changelogHeaderText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  changelogScroll: {
    width: '100%',
    maxHeight: 250,
    marginVertical: spacing.xs,
  },
  featuresBox: {
    width: '100%',
    backgroundColor: '#181626',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#26233B',
    padding: spacing.md,
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  featureBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  featureCopy: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  featureDesc: {
    ...typography.caption,
    fontSize: 11.5,
    color: '#94A3B8',
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
  },
  errorText: {
    ...typography.caption,
    fontSize: 12,
    color: '#F87171',
    flex: 1,
  },
  actionColumn: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  updateBtn: {
    width: '100%',
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  updateBtnDisabled: {
    opacity: 0.75,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    ...typography.label,
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  laterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  laterText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
