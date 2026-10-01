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
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { reduceMotion } from '../theme/motion';
import { radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { useAppearance } from '../context/AppearanceContext';

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
    icon: 'sparkles-outline' as const,
    color: '#818CF8',
    title: 'Modern Linear Blur Header',
    desc: 'New chat header with progressive linear glass blur, centered group avatar, title badge, and quick AI access.',
  },
  {
    icon: 'color-palette-outline' as const,
    color: '#38BDF8',
    title: 'A fresh look across GC',
    desc: 'Chats, group details, Awards, Create, and Profile share clearer layouts and easier-to-read surfaces.',
  },
  {
    icon: 'people-outline' as const,
    color: '#F472B6',
    title: 'Find people and commands faster',
    desc: 'Mentions show profile photos and member colors in a compact scrolling grid, with matching quick commands above the composer.',
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
  const { theme } = useAppearance();
  const palette = theme.palette;
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
        <Animated.View entering={FadeInUp.duration(300).reduceMotion(reduceMotion)} style={[styles.card, { backgroundColor: palette.surfaceLow, borderColor: palette.border }]}>
          <View style={[styles.accentBar, { backgroundColor: palette.primary }]} />

          {/* Badge Icon */}
          <View style={[styles.iconCircle, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
            <Ionicons name={isWhatsNew ? 'sparkles-outline' : 'arrow-up-circle-outline'} size={25} color={palette.primary} />
          </View>

          {/* Title & Subtitle */}
          <Text style={[styles.title, { color: palette.onSurface }]}>
            {isWhatsNew ? "What's new in GC" : 'Update available'}
          </Text>
          <Text style={[styles.subtitle, { color: palette.onSurfaceVariant }]}>
            {isWhatsNew
              ? 'A few things that will feel better today.'
              : 'A new version of GC is ready to install.'}
          </Text>

          {/* If Pre-Update: Show dynamic release note from EAS Update */}
          {!isWhatsNew && (
            <View style={[styles.preUpdateNoteCard, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
              <Ionicons name="sparkles-outline" size={16} color={palette.primary} />
              <Text style={[styles.preUpdateNoteText, { color: palette.onSurfaceVariant }]}>
                {updateMessage || 'Includes the latest improvements to GC.'}
              </Text>
            </View>
          )}

          {/* If Post-Update: Show full changelog */}
          {isWhatsNew && (
            <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
              <View style={[styles.featuresBox, { backgroundColor: palette.surfaceHigh, borderColor: palette.border }]}>
                {CHANGELOG_ITEMS.map((item, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <View style={[styles.featureBullet, { backgroundColor: `${item.color}22` }]}>
                      <Ionicons name={item.icon} size={15} color={item.color} />
                    </View>
                    <View style={styles.featureCopy}>
                      <Text style={[styles.featureTitle, { color: palette.onSurface }]}>{item.title}</Text>
                      <Text style={[styles.featureDesc, { color: palette.onSurfaceVariant }]}>{item.desc}</Text>
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
                style={[styles.updateBtn, { backgroundColor: palette.primary }]}
                scaleTo={0.97}
                onPress={onDismiss}
              >
                <View style={styles.btnContent}>
                  <Ionicons name="checkmark" size={18} color={palette.onPrimary} />
                  <Text style={[styles.btnText, { color: palette.onPrimary }]}>Continue</Text>
                </View>
              </PressableScale>
            ) : (
              <>
                <PressableScale
                  style={[styles.updateBtn, { backgroundColor: palette.primary }, isDownloading && styles.updateBtnDisabled]}
                  scaleTo={0.97}
                  disabled={isDownloading}
                  onPress={onUpdate}
                >
                  {isDownloading ? (
                    <View style={styles.btnContent}>
                      <ActivityIndicator size="small" color={palette.onPrimary} />
                      <Text style={[styles.btnText, { color: palette.onPrimary }]}>Updating…</Text>
                    </View>
                  ) : (
                    <View style={styles.btnContent}>
                      <Ionicons name="refresh" size={18} color={palette.onPrimary} />
                      <Text style={[styles.btnText, { color: palette.onPrimary }]}>Update and restart</Text>
                    </View>
                  )}
                </PressableScale>

                {!isDownloading && (
                  <PressableScale style={styles.laterBtn} scaleTo={0.97} onPress={onDismiss}>
                    <Text style={[styles.laterText, { color: palette.onSurfaceVariant }]}>Maybe later</Text>
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
    backgroundColor: 'rgba(4, 6, 10, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: '#151A21',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
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
    fontSize: 13.5,
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
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    width: '100%',
  },
  preUpdateNoteText: {
    ...typography.bodyMedium,
    fontSize: 13.5,
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
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  featureDesc: {
    ...typography.caption,
    fontSize: 12.5,
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
    minHeight: 48,
    borderRadius: radius.md,
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
    minHeight: 44,
  },
  laterText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
