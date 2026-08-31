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
import { reduceMotion } from '../theme/motion';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';

type Props = {
  visible: boolean;
  type?: 'available' | 'whats_new';
  isDownloading?: boolean;
  error?: string | null;
  updateMessage?: string | null;
  onUpdate?: () => void;
  onDismiss: () => void;
};

const CHANGELOG_ITEMS = [
  {
    icon: 'person-circle-outline' as const,
    color: '#818CF8',
    title: 'A Brand New Profile Screen',
    desc: 'Your profile now opens on a full hero: a live aurora ring around your picture, your stats counting up, and a tap-to-copy handle. Quick actions became a grid, and the top bar swaps in your name as you scroll.',
  },
  {
    icon: 'notifications-outline' as const,
    color: '#38BDF8',
    title: 'Message Notifications Arrive Instantly',
    desc: 'Group messages used to sit in Android\u2019s battery queue and land about a minute late. They are now sent as high priority, so a message shows up when it is sent.',
  },
  {
    icon: 'sparkles-outline' as const,
    color: '#FBBF24',
    title: '11:11 Reminder Lands In Time',
    desc: 'The wish reminder now arrives just before 11:11 instead of just after it, so the 60-second window is still open when you open the app.',
  },
  {
    icon: 'add-circle-outline' as const,
    color: '#10B981',
    title: 'Run More Than One GC',
    desc: 'Your first GC is free. Need another, pay once and the slot is yours to keep, reuse, and free up again by deleting a GC. Joining other people\u2019s GCs stays unlimited and free.',
  },
];

export function AppUpdateModal({
  visible,
  type = 'available',
  isDownloading = false,
  error = null,
  updateMessage,
  onUpdate,
  onDismiss,
}: Props) {
  if (!visible) return null;

  const isWhatsNew = type === 'whats_new';

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

        <Animated.View entering={FadeInUp.duration(300).reduceMotion(reduceMotion)} style={styles.card}>
          {/* Top Accent Strip */}
          <LinearGradient
            colors={isWhatsNew ? ['#10B981', '#38BDF8', '#818CF8'] : ['#818CF8', '#C084FC', '#F472B6']}
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
            <Text style={styles.iconEmoji}>{isWhatsNew ? '✨' : '🚀'}</Text>
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.title}>
            {isWhatsNew ? "What's New in GC" : 'Update Available!'}
          </Text>
          <Text style={styles.subtitle}>
            {isWhatsNew
              ? "Here's what just dropped in this latest version:"
              : 'A new version of GC is ready to install with fresh features and improvements.'}
          </Text>

          {/* If Pre-Update: Show dynamic release note from EAS Update */}
          {!isWhatsNew && (
            <View style={styles.preUpdateNoteCard}>
              <Ionicons name="sparkles" size={16} color="#818CF8" />
              <Text style={styles.preUpdateNoteText}>
                {updateMessage || 'Includes the latest features, improvements, and performance boosts.'}
              </Text>
            </View>
          )}

          {/* If Post-Update: Show full changelog */}
          {isWhatsNew && (
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
          )}

          {/* Error notice if any */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#F87171" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionColumn}>
            {isWhatsNew ? (
              <PressableScale
                style={styles.updateBtn}
                scaleTo={0.97}
                onPress={onDismiss}
              >
                <LinearGradient
                  colors={['#10B981', '#38BDF8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.btnContent}>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.btnText}>Let's Go! 🚀</Text>
                </View>
              </PressableScale>
            ) : (
              <>
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
              </>
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
  preUpdateNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    width: '100%',
  },
  preUpdateNoteText: {
    ...typography.bodyMedium,
    fontSize: 13,
    color: '#E0E7FF',
    flex: 1,
    lineHeight: 18,
  },
  changelogScroll: {
    width: '100%',
    maxHeight: 270,
    marginTop: spacing.md,
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
