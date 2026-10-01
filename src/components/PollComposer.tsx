import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, fontFamily, radius, spacing, typography } from '../theme/theme';
import { duration, reduceMotion } from '../theme/motion';
import { groupTheme, GroupTheme } from '../theme/groupThemes';
import { PressableScale } from './ui/PressableScale';
import { GCButton } from './ui/Buttons';
import { GlassPanel } from './ui/Glass';
import { WebModalCard } from './ui/WebModalCard';
import { DismissibleModalPage } from './ui/DismissibleModalPage';
import { MAX_OPTIONS, MIN_OPTIONS, normalizeDraft, type PollDraft } from '../lib/polls';

function ThemedGlowBackground({ theme }: { theme: GroupTheme }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <LinearGradient
        colors={[`${theme.accent}0D`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function PollComposer({
  visible,
  initial,
  theme,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  /** Pre-filled when @gc drafted it; undefined for a blank poll. */
  initial?: PollDraft | null;
  /** Active group theme for background and accents */
  theme?: GroupTheme;
  onClose: () => void;
  onSubmit: (draft: PollDraft) => void;
  submitting?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const activeTheme = theme ?? groupTheme(null);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuestion(initial?.question ?? '');
    setOptions(initial?.options?.length ? [...initial.options] : ['', '']);
    setAllowMultiple(initial?.allowMultiple ?? false);
    setAnonymous(initial?.anonymous ?? false);
    setError(null);
  }, [visible, initial]);

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  }

  function removeOption(index: number) {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    const draft: PollDraft = { question, options, allowMultiple, anonymous };
    const result = normalizeDraft(draft);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onSubmit(result.draft);
  }

  const content = (
    <View style={styles.root}>
      <ThemedGlowBackground theme={activeTheme} />

        <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 6, 18) }]}>
          <PressableScale
            style={styles.closeBtn}
            scaleTo={0.88}
            hitSlop={8}
            onPress={onClose}
            disabled={submitting}
          >
            <Ionicons name="close" size={20} color={colors.onSurface} />
          </PressableScale>

          <View style={styles.topBarTitleBlock}>
            <Text style={styles.pollLogoText}>{initial ? 'Review poll' : 'Create poll'}</Text>
          </View>

          <PressableScale
            style={styles.topSendBtn}
            scaleTo={0.92}
            haptic="medium"
            disabled={submitting}
            onPress={submit}
          >
            <Text style={styles.topSendText}>{submitting ? '...' : 'Done'}</Text>
          </PressableScale>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom + 60, 80) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* AI Note if drafted */}
            {!!initial && (
              <Animated.View
                entering={FadeIn.duration(duration.fast)}
                style={[
                  styles.aiNote,
                  { borderColor: `${activeTheme.accent}40`, backgroundColor: `${activeTheme.accent}15` },
                ]}
              >
                <View
                  style={[
                    styles.aiNoteIconWrap,
                    { backgroundColor: `${activeTheme.accent}25` },
                  ]}
                >
                  <Ionicons name="sparkles" size={14} color={activeTheme.accent} />
                </View>
                <Text style={styles.aiNoteText}>
                  GC drafted this poll. Review the question and options before sending.
                </Text>
              </Animated.View>
            )}

            {/* 1. QUESTION SECTION */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="help-circle" size={14} color={activeTheme.accent} />
                <Text style={styles.sectionLabel}>Question</Text>
                <View style={styles.spacer} />
                <Text style={styles.charCounter}>{question.length}/300</Text>
              </View>

              <View style={styles.questionInputContainer}>
                <TextInput
                  value={question}
                  onChangeText={setQuestion}
                  placeholder="Ask a question..."
                  placeholderTextColor="#64748B"
                  style={styles.questionInput}
                  multiline
                  maxLength={300}
                  textAlignVertical="center"
                />
              </View>
            </View>

            {/* 2. OPTIONS SECTION */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="list" size={14} color={activeTheme.accent} />
                <Text style={styles.sectionLabel}>Options</Text>
                <View style={styles.spacer} />
                <Text style={styles.charCounter}>
                  {options.length}/{MAX_OPTIONS}
                </Text>
              </View>

              <View style={styles.optionsList}>
                {options.map((option, i) => (
                  <Animated.View
                    key={i}
                    entering={FadeInDown.duration(200).reduceMotion(reduceMotion)}
                    style={styles.optionRow}
                  >
                    <View
                      style={[
                        styles.optionNumberBadge,
                        {
                          backgroundColor: `${activeTheme.accent}15`,
                          borderColor: `${activeTheme.accent}35`,
                        },
                      ]}
                    >
                      <Text style={[styles.optionNumberText, { color: activeTheme.accent }]}>
                        {i + 1 < 10 ? `0${i + 1}` : i + 1}
                      </Text>
                    </View>

                    <TextInput
                      value={option}
                      onChangeText={(v) => setOption(i, v)}
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor="#64748B"
                      style={styles.optionInput}
                      maxLength={100}
                      textAlignVertical="center"
                    />

                    {options.length > MIN_OPTIONS && (
                      <PressableScale
                        style={styles.removeOptionBtn}
                        hitSlop={8}
                        scaleTo={0.85}
                        onPress={() => removeOption(i)}
                      >
                        <Ionicons name="close-circle" size={20} color="#64748B" />
                      </PressableScale>
                    )}
                  </Animated.View>
                ))}
              </View>

              {options.length < MAX_OPTIONS && (
                <PressableScale
                  style={[styles.addOptionBtn, { borderColor: `${activeTheme.accent}45` }]}
                  scaleTo={0.97}
                  haptic="light"
                  onPress={addOption}
                >
                  <LinearGradient
                    colors={[`${activeTheme.accent}18`, `${activeTheme.colors[1]}08`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.addOptionGradient}
                  >
                    <Ionicons name="add-circle" size={18} color={activeTheme.accent} />
                    <Text style={[styles.addOptionText, { color: activeTheme.accent }]}>
                      Add Another Option
                    </Text>
                  </LinearGradient>
                </PressableScale>
              )}
            </View>

            {/* 3. SETTINGS SECTION */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="settings-sharp" size={14} color={activeTheme.accent} />
                <Text style={styles.sectionLabel}>SETTINGS</Text>
              </View>

              <GlassPanel borderRadius={radius.lg} style={styles.settingsCard}>
                <View style={styles.settingRow}>
                  <View
                    style={[
                      styles.settingIconWrap,
                      { backgroundColor: `${activeTheme.accent}18` },
                    ]}
                  >
                    <Ionicons name="checkbox" size={18} color={activeTheme.accent} />
                  </View>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Multiple Answers</Text>
                    <Text style={styles.settingHint}>Members can vote for multiple options</Text>
                  </View>
                  <Switch
                    value={allowMultiple}
                    onValueChange={setAllowMultiple}
                    trackColor={{ false: 'rgba(255, 255, 255, 0.12)', true: activeTheme.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.settingDivider} />

                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(244, 63, 94, 0.15)' }]}>
                    <Ionicons name="eye-off" size={18} color="#FB7185" />
                  </View>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Anonymous Voting</Text>
                    <Text style={styles.settingHint}>Hide member identities from poll results</Text>
                  </View>
                  <Switch
                    value={anonymous}
                    onValueChange={setAnonymous}
                    trackColor={{ false: 'rgba(255, 255, 255, 0.12)', true: '#FB7185' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </GlassPanel>
            </View>

            {/* Error Message */}
            {!!error && (
              <Animated.View entering={FadeIn.duration(120)} style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* Submit Button */}
            <View style={styles.submitWrap}>
              <GCButton
                label={submitting ? 'Sending poll…' : 'Send poll to GC'}
                variant="primary"
                disabled={submitting}
                onPress={submit}
                icon={<Ionicons name="send" size={17} color="#FFFFFF" />}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
  );

  if (Platform.OS === 'web') {
    return (
      <WebModalCard visible={visible} onClose={onClose}>
        {content}
      </WebModalCard>
    );
  }

  return (
    <DismissibleModalPage visible={visible} onClose={onClose}>
      {content}
    </DismissibleModalPage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appRoot },
  flex: { flex: 1 },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceLow,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topBarTitleBlock: {
    alignItems: 'center',
  },
  pollLogoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pollLogoText: {
    ...typography.titleMd,
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  topSendBtn: {
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSendText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  body: {
    padding: spacing.lg,
    gap: spacing.lg,
  },

  aiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  aiNoteIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiNoteText: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.onSurfaceVariant,
    flex: 1,
    lineHeight: 18,
  },

  section: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  spacer: { flex: 1 },
  charCounter: {
    ...typography.micro,
    fontSize: 10.5,
    color: '#64748B',
  },

  // Question Input (Vertical Centering & Clean Typography)
  questionInputContainer: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: 56,
    justifyContent: 'center',
  },
  questionInput: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15.5,
    color: colors.onSurface,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },

  // Option Rows
  optionsList: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionNumberText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '800',
  },
  optionInput: {
    fontFamily: fontFamily.body,
    flex: 1,
    height: 48,
    fontSize: 14.5,
    color: colors.onSurface,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  removeOptionBtn: {
    padding: 4,
  },

  addOptionBtn: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 2,
  },
  addOptionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  addOptionText: {
    ...typography.bodyMedium,
    fontSize: 13.5,
    fontWeight: '700',
  },

  // Settings
  settingsCard: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCopy: {
    flex: 1,
    gap: 1,
  },
  settingLabel: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  settingHint: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.onSurfaceVariant,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.30)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#F87171',
    fontWeight: '600',
    flex: 1,
  },

  submitWrap: {
    marginTop: spacing.sm,
  },
});
