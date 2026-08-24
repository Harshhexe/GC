import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, radius, shadows, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import {
  type MuteOption,
  type NotificationMode,
  useGroupNotificationSettings,
} from '../hooks/useGroupNotificationSettings';
import { selectFeedback } from '../utils/haptics';

type Props = {
  visible: boolean;
  groupId: string;
  groupName?: string;
  userId?: string | null;
  accentColor?: string;
  settings?: ReturnType<typeof useGroupNotificationSettings>;
  onClose: () => void;
};

const NOTIFICATION_STYLES: {
  key: NotificationMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}[] = [
  {
    key: 'all',
    icon: 'notifications',
    label: 'All messages',
    description: 'Notify for all new messages in this group',
  },
  {
    key: 'mentions_replies',
    icon: 'at',
    label: 'Mentions & replies',
    description: 'Only notify when someone mentions you, replies, or comments privately',
  },
  {
    key: 'off',
    icon: 'notifications-off',
    label: 'Off',
    description: 'Do not send normal notifications from this GC',
  },
];

const MUTE_OPTIONS: {
  key: MuteOption;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}[] = [
  {
    key: '1h',
    icon: 'time-outline',
    label: '1 hour',
    description: 'Silence normal messages for 1 hour',
  },
  {
    key: '8h',
    icon: 'moon-outline',
    label: '8 hours',
    description: 'Silence normal messages for 8 hours',
  },
  {
    key: '1w',
    icon: 'calendar-outline',
    label: '1 week',
    description: 'Silence normal messages for 7 days',
  },
  {
    key: 'indefinite',
    icon: 'infinite-outline',
    label: 'Until I turn it back on',
    description: 'Silence normal messages until manually unmuted',
  },
];

export function GroupNotificationSheet({
  visible,
  groupId,
  groupName = 'this group',
  userId,
  accentColor = colors.primary,
  settings: externalSettings,
  onClose,
}: Props) {
  const localSettings = useGroupNotificationSettings(
    externalSettings ? '' : groupId,
    externalSettings ? null : userId
  );

  const {
    mode,
    mutedUntil,
    isMuted,
    muteStatusText,
    saving,
    setNotificationMode,
    setMuteDuration,
  } = externalSettings ?? localSettings;

  const [activeMuteChoice, setActiveMuteChoice] = useState<MuteOption | null>(() =>
    mutedUntil?.startsWith('2099') ? 'indefinite' : null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleModeSelect(newMode: NotificationMode) {
    if (newMode === mode) return;
    selectFeedback();
    setError(null);
    const res = await setNotificationMode(newMode);
    if (!res.ok && res.error) {
      setError(res.error);
    }
  }

  async function handleMuteSelect(option: MuteOption) {
    selectFeedback();
    setError(null);
    if (option === 'unmute') {
      setActiveMuteChoice(null);
    } else {
      setActiveMuteChoice(option);
    }
    const res = await setMuteDuration(option);
    if (!res.ok && res.error) {
      setError(res.error);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Customize notifications for {groupName}
              </Text>
            </View>

            <PressableScale style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.onSurface} />
            </PressableScale>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Status Summary Banner */}
            <View style={[styles.summaryCard, isMuted && styles.summaryCardMuted]}>
              <LinearGradient
                colors={
                  isMuted
                    ? ['rgba(239, 68, 68, 0.12)', 'rgba(239, 68, 68, 0.03)']
                    : ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)']
                }
                style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]}
              />
              <View style={styles.summaryRow}>
                <View
                  style={[
                    styles.summaryIconWrap,
                    {
                      backgroundColor: isMuted
                        ? 'rgba(239, 68, 68, 0.18)'
                        : 'rgba(129, 140, 248, 0.15)',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      isMuted
                        ? 'volume-mute'
                        : mode === 'off'
                        ? 'notifications-off'
                        : mode === 'mentions_replies'
                        ? 'at'
                        : 'notifications'
                    }
                    size={18}
                    color={isMuted ? colors.error : accentColor}
                  />
                </View>
                <View style={styles.summaryCopy}>
                  <Text style={styles.summaryTitle}>
                    {isMuted
                      ? muteStatusText
                      : mode === 'all'
                      ? '🔔 All messages'
                      : mode === 'mentions_replies'
                      ? '@️⃣ Mentions & replies only'
                      : '🔕 Notifications off'}
                  </Text>
                  <Text style={styles.summarySub}>
                    {isMuted
                      ? 'Normal messages are silenced'
                      : mode === 'all'
                      ? 'You will receive all group notifications'
                      : mode === 'mentions_replies'
                      ? 'Only direct tags, replies & private comments will notify'
                      : 'No notifications will be sent for this chat'}
                  </Text>
                </View>

                {saving && <ActivityIndicator size="small" color={accentColor} />}
              </View>
            </View>

            {/* Quick Unmute Action Card when muted */}
            {isMuted && (
              <PressableScale
                style={[styles.quickUnmuteCard, { borderColor: `${accentColor}55` }]}
                scaleTo={0.98}
                haptic="medium"
                onPress={() => handleMuteSelect('unmute')}
              >
                <LinearGradient
                  colors={[`${accentColor}26`, `${accentColor}0A`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.quickUnmuteIcon, { backgroundColor: `${accentColor}33` }]}>
                  <Ionicons name="volume-high" size={19} color={accentColor} />
                </View>
                <View style={styles.quickUnmuteCopy}>
                  <Text style={[styles.quickUnmuteTitle, { color: accentColor }]}>
                    Unmute Notifications
                  </Text>
                  <Text style={styles.quickUnmuteSub}>
                    Resume normal alerts for this group now
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={accentColor} />
              </PressableScale>
            )}

            {/* Section 1: Notification Style */}
            <Text style={styles.sectionLabel}>NOTIFICATION STYLE</Text>
            <View style={styles.cardGroup}>
              {NOTIFICATION_STYLES.map((item, idx) => {
                const selected = mode === item.key;
                return (
                  <PressableScale
                    key={item.key}
                    scaleTo={0.98}
                    onPress={() => handleModeSelect(item.key)}
                    style={[
                      styles.optionRow,
                      idx > 0 && styles.rowDivider,
                      selected && styles.optionRowSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.optionIconWrap,
                        selected && { backgroundColor: `${accentColor}22` },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={selected ? accentColor : colors.onSurfaceVariant}
                      />
                    </View>

                    <View style={styles.optionCopy}>
                      <Text
                        style={[
                          styles.optionLabel,
                          selected && { color: colors.onSurface, fontWeight: '700' },
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.optionDesc}>{item.description}</Text>
                    </View>

                    <View
                      style={[
                        styles.radioOuter,
                        selected && { borderColor: accentColor },
                      ]}
                    >
                      {selected && (
                        <View
                          style={[
                            styles.radioInner,
                            { backgroundColor: accentColor },
                          ]}
                        />
                      )}
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* Section 2: Mute Duration Options */}
            <View style={styles.muteSectionHeader}>
              <Text style={styles.sectionLabel}>MUTE NOTIFICATIONS</Text>
            </View>

            <View style={styles.cardGroup}>
              {MUTE_OPTIONS.map((item, idx) => {
                const selected =
                  isMuted &&
                  (activeMuteChoice === item.key ||
                    (!activeMuteChoice &&
                      item.key === 'indefinite' &&
                      Boolean(mutedUntil?.startsWith('2099'))));

                return (
                  <PressableScale
                    key={item.key}
                    scaleTo={0.98}
                    onPress={() => handleMuteSelect(item.key)}
                    style={[
                      styles.optionRow,
                      idx > 0 && styles.rowDivider,
                      selected && styles.optionRowSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.optionIconWrap,
                        selected && { backgroundColor: `${accentColor}22` },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={18}
                        color={selected ? accentColor : colors.onSurfaceVariant}
                      />
                    </View>

                    <View style={styles.optionCopy}>
                      <Text
                        style={[
                          styles.optionLabel,
                          selected && { color: colors.onSurface, fontWeight: '700' },
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.optionDesc}>{item.description}</Text>
                    </View>

                    <View
                      style={[
                        styles.radioOuter,
                        selected && { borderColor: accentColor },
                      ]}
                    >
                      {selected && (
                        <View
                          style={[
                            styles.radioInner,
                            { backgroundColor: accentColor },
                          ]}
                        />
                      )}
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {!!error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.outlineVariant,
    marginTop: spacing.sm + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.headline,
    fontSize: 20,
    fontWeight: '800',
    color: colors.onSurface,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  summaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.md,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
  },
  summaryTitle: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  summarySub: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  summaryCardMuted: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  quickUnmuteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  quickUnmuteIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickUnmuteCopy: {
    flex: 1,
    gap: 2,
  },
  quickUnmuteTitle: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '700',
  },
  quickUnmuteSub: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  sectionLabel: {
    ...typography.label,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.outline,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  muteSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  cardGroup: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  optionDesc: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    fontSize: 12,
  },
});
