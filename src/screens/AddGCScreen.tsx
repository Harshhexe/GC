import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  fontFamily,
  glass,
  gradients,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GROUP_THEMES, GroupThemeKey, groupTheme } from '../theme/groupThemes';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton, LightFieldShell } from '../components/ui/Buttons';
import { AppHeader } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { InviteCodeCard } from '../components/InviteCodeCard';
import { supabase } from '../lib/supabase';
import { uploadGroupAvatar } from '../lib/uploadAvatar';
import { useAuth } from '../context/AuthContext';
import { successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'AddGC'>,
  NativeStackScreenProps<RootStackParamList>
>;

const CODE_LENGTH = 6;
const EMOJI_OPTIONS = ['💬', '🏝️', '📚', '🔥', '💀', '🍵', '🎬', '🎮', '👾', '🪩', '🍕', '🧃'];
const STEPS = ['Name', 'Picture', 'Theme', 'Share'] as const;

function normaliseCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** Four-segment progress rail across the top of the wizard. */
function StepRail({ step }: { step: number }) {
  return (
    <View style={styles.rail}>
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <View key={label} style={styles.railItem}>
            <View
              style={[styles.railBar, (done || active) && styles.railBarOn, active && styles.railBarActive]}
            />
            <Text style={[styles.railLabel, active && styles.railLabelActive]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function AddGCScreen({ navigation, route }: Props) {
  const { session, profile } = useAuth();
  const [mode, setMode] = useState<'create' | 'join'>(route.params?.mode ?? 'create');

  // The empty chat list links here with a mode already chosen. This is a tab,
  // so it stays mounted between visits — without this it would keep whichever
  // mode was last used instead of the one just asked for.
  const requestedMode = route.params?.mode;
  useEffect(() => {
    if (requestedMode) setMode(requestedMode);
  }, [requestedMode]);

  // ── create wizard ──────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; ext: string } | null>(null);
  const [theme, setTheme] = useState<GroupThemeKey>('violet');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; code: string } | null>(null);

  // ── join ───────────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const activeTheme = groupTheme(theme);

  function resetWizard() {
    setStep(0);
    setName('');
    setEmoji(EMOJI_OPTIONS[0]);
    setPhoto(null);
    setTheme('violet');
    setCreated(null);
    setCreateError(null);
  }

  async function pickPhoto() {
    setCreateError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setCreateError('Photo access is off — allow it in Settings, or pick an emoji instead.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    const ext = asset.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    setPhoto({ uri: asset.uri, base64: asset.base64!, ext });
  }

  async function handleCreate() {
    if (!session?.user || busy) return;
    setBusy(true);
    setCreateError(null);

    // Upload only now — bailing out mid-wizard shouldn't leave orphan files.
    let avatarUrl: string | null = null;
    if (photo) {
      const { url, error } = await uploadGroupAvatar(photo.base64, session.user.id, photo.ext);
      if (error) {
        setBusy(false);
        setCreateError(`Couldn't upload that photo: ${error}`);
        return;
      }
      avatarUrl = url;
    }

    const { data: group, error } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        emoji,
        avatar_url: avatarUrl,
        theme,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error || !group) {
      setBusy(false);
      setCreateError(error?.message ?? 'Something went wrong. Blame the Wi-Fi.');
      return;
    }

    await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id, role: 'owner' });
    setBusy(false);
    successFeedback();
    setCreated({ id: group.id, name: group.name, code: group.invite_code });
    setStep(3);
  }

  async function handleJoin() {
    if (code.length !== CODE_LENGTH || joining) return;
    setJoining(true);
    setJoinError(null);

    const { data, error } = await supabase.rpc('join_group_with_code', { _code: code });
    setJoining(false);

    if (error) {
      setJoinError(error.message.replace(/^.*?:\s*/, ''));
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.group_id) {
      setJoinError('No GC found with that code.');
      return;
    }
    successFeedback();
    setCode('');
    navigation.navigate('Chat', { groupId: result.group_id });
  }

  const preview = (size: number) => (
    <Avatar
      emoji={emoji}
      imageUrl={photo?.uri}
      size={size}
      ringColors={activeTheme.colors}
      glow
    />
  );

  return (
    <View style={styles.root}>
      <AmbientBackground variant="vivid" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          wordmark
          right={<Avatar emoji={profile?.avatar_emoji} imageUrl={profile?.avatar_url} label={profile?.display_name} size={36} />}
        />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Mode switch — hidden once the wizard is under way so there's
                one obvious path forward. */}
            {step === 0 && !created && (
              <Animated.View entering={FadeIn.reduceMotion(reduceMotion)} style={styles.segment}>
                {(['create', 'join'] as const).map((m) => (
                  <PressableScale
                    key={m}
                    style={[styles.segmentBtn, mode === m && styles.segmentBtnActive]}
                    scaleTo={0.97}
                    onPress={() => setMode(m)}
                  >
                    <Ionicons
                      name={m === 'create' ? 'sparkles' : 'key-outline'}
                      size={15}
                      color={mode === m ? colors.onPrimary : colors.onSurfaceVariant}
                    />
                    <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                      {m === 'create' ? 'Create' : 'Join'}
                    </Text>
                  </PressableScale>
                ))}
              </Animated.View>
            )}

            {mode === 'join' && step === 0 && !created ? (
              /* ── JOIN ─────────────────────────────────────────────── */
              <Animated.View
                entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
              >
                <GlassPanel borderRadius={radius.xl} tone="tertiary" style={styles.card}>
                  <Text style={styles.stepEyebrow}>JOIN A VIBE</Text>
                  <Text style={styles.stepTitle}>Got a code?</Text>
                  <Text style={styles.stepHelp}>
                    Six characters from whoever made the GC.
                  </Text>

                  <LightFieldShell style={styles.codeField}>
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      placeholder="ENTER CODE"
                      placeholderTextColor={colors.outline}
                      value={code}
                      onChangeText={(t) => {
                        setCode(normaliseCode(t));
                        setJoinError(null);
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={CODE_LENGTH}
                    />
                  </LightFieldShell>

                  <View style={styles.dots}>
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                      <View key={i} style={[styles.dot, i < code.length && styles.dotFilledCyan]} />
                    ))}
                  </View>

                  {!!joinError && (
                    <Animated.Text entering={FadeIn.reduceMotion(reduceMotion)} style={styles.error}>
                      {joinError}
                    </Animated.Text>
                  )}

                  <GCButton
                    label={joining ? 'letting you in…' : 'Join the GC'}
                    variant="cyan"
                    disabled={code.length !== CODE_LENGTH || joining}
                    onPress={handleJoin}
                  />
                </GlassPanel>
              </Animated.View>
            ) : (
              /* ── CREATE WIZARD ───────────────────────────────────── */
              <>
                <StepRail step={step} />

                <Animated.View
                  key={step}
                  entering={FadeInRight.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
                  exiting={FadeOutLeft.duration(duration.fast).reduceMotion(reduceMotion)}
                >
                  <GlassPanel borderRadius={radius.xl} tone="primary" style={styles.card}>
                    {/* Step 1 — name */}
                    {step === 0 && (
                      <>
                        <Text style={styles.stepEyebrow}>STEP 1 OF 4</Text>
                        <Text style={styles.stepTitle}>Name your GC</Text>
                        <Text style={styles.stepHelp}>
                          You can be normal about this. You won't be.
                        </Text>
                        <LightFieldShell style={styles.field}>
                          <TextInput
                            style={styles.input}
                            placeholder="the goa plan"
                            placeholderTextColor={colors.outline}
                            value={name}
                            onChangeText={(t) => {
                              setName(t);
                              setCreateError(null);
                            }}
                            maxLength={40}
                          />
                        </LightFieldShell>
                        <Text style={styles.counter}>{name.length}/40</Text>
                      </>
                    )}

                    {/* Step 2 — picture */}
                    {step === 1 && (
                      <>
                        <Text style={styles.stepEyebrow}>STEP 2 OF 4</Text>
                        <Text style={styles.stepTitle}>Give it a face</Text>
                        <Text style={styles.stepHelp}>Upload a photo, or pick an emoji.</Text>

                        <View style={styles.previewRow}>{preview(96)}</View>

                        <View style={styles.photoRow}>
                          <PressableScale
                            style={styles.photoButton}
                            haptic="medium"
                            onPress={pickPhoto}
                          >
                            <Ionicons name="image-outline" size={18} color={colors.primary} />
                            <Text style={styles.photoText}>
                              {photo ? 'Change photo' : 'Upload photo'}
                            </Text>
                          </PressableScale>

                          {photo && (
                            <PressableScale
                              style={styles.clearButton}
                              scaleTo={0.9}
                              onPress={() => setPhoto(null)}
                            >
                              <Ionicons name="close" size={16} color={colors.error} />
                            </PressableScale>
                          )}
                        </View>

                        <Text style={styles.orLabel}>OR PICK AN EMOJI</Text>
                        <View style={styles.emojiGrid}>
                          {EMOJI_OPTIONS.map((e) => (
                            <PressableScale
                              key={e}
                              scaleTo={0.85}
                              haptic="medium"
                              onPress={() => {
                                setEmoji(e);
                                setPhoto(null);
                              }}
                              style={[
                                styles.emojiChip,
                                !photo && emoji === e && styles.emojiChipActive,
                              ]}
                            >
                              <Text style={styles.emojiText}>{e}</Text>
                            </PressableScale>
                          ))}
                        </View>
                      </>
                    )}

                    {/* Step 3 — theme */}
                    {step === 2 && (
                      <>
                        <Text style={styles.stepEyebrow}>STEP 3 OF 4</Text>
                        <Text style={styles.stepTitle}>Pick a vibe</Text>
                        <Text style={styles.stepHelp}>
                          Colours this GC everywhere it shows up.
                        </Text>

                        <View style={styles.previewRow}>
                          {preview(88)}
                          <Text style={styles.previewName} numberOfLines={1}>
                            {name.trim() || 'your GC'}
                          </Text>
                        </View>

                        <View style={styles.themeGrid}>
                          {GROUP_THEMES.map((t) => (
                            <PressableScale
                              key={t.key}
                              scaleTo={0.92}
                              haptic="medium"
                              onPress={() => setTheme(t.key)}
                              style={[
                                styles.themeChip,
                                theme === t.key && {
                                  borderColor: t.accent,
                                  backgroundColor: `${t.accent}1F`,
                                },
                              ]}
                            >
                              <LinearGradient
                                colors={t.colors}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.themeSwatch}
                              />
                              <Text
                                style={[
                                  styles.themeName,
                                  theme === t.key && { color: t.accent },
                                ]}
                              >
                                {t.name}
                              </Text>
                              {theme === t.key && (
                                <Ionicons name="checkmark-circle" size={16} color={t.accent} />
                              )}
                            </PressableScale>
                          ))}
                        </View>
                      </>
                    )}

                    {/* Step 4 — code & share */}
                    {step === 3 && created && (
                      <>
                        <Text style={styles.stepEyebrow}>STEP 4 OF 4</Text>
                        <Text style={styles.stepTitle}>It's alive 🎉</Text>
                        <Text style={styles.stepHelp}>Share the code so the squad can get in.</Text>

                        <View style={styles.previewRow}>
                          {preview(88)}
                          <Text style={styles.previewName} numberOfLines={1}>
                            {created.name}
                          </Text>
                        </View>

                        <View style={styles.codeBlock}>
                          <InviteCodeCard code={created.code} groupName={created.name} />
                        </View>
                      </>
                    )}

                    {!!createError && (
                      <Animated.Text
                        entering={FadeIn.reduceMotion(reduceMotion)}
                        style={styles.error}
                      >
                        {createError}
                      </Animated.Text>
                    )}
                  </GlassPanel>
                </Animated.View>

                {/* Footer controls */}
                <View style={styles.footer}>
                  {step === 3 && created ? (
                    <>
                      <GCButton
                        label="Open the GC"
                        variant="gradient"
                        onPress={() => {
                          const id = created.id;
                          resetWizard();
                          navigation.navigate('Chat', { groupId: id });
                        }}
                      />
                      <PressableScale
                        style={styles.linkButton}
                        scaleTo={0.97}
                        onPress={resetWizard}
                      >
                        <Text style={styles.linkText}>make another one</Text>
                      </PressableScale>
                    </>
                  ) : (
                    <View style={styles.footerRow}>
                      {step > 0 && (
                        <PressableScale
                          style={styles.backButton}
                          scaleTo={0.94}
                          onPress={() => setStep((s) => s - 1)}
                        >
                          <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
                          <Text style={styles.backText}>Back</Text>
                        </PressableScale>
                      )}

                      <View style={styles.footerGrow}>
                        {step < 2 ? (
                          <GCButton
                            label="Next"
                            variant="primary"
                            disabled={step === 0 && !name.trim()}
                            onPress={() => setStep((s) => s + 1)}
                            icon={
                              <Ionicons
                                name="arrow-forward"
                                size={18}
                                color={step === 0 && !name.trim() ? colors.outline : colors.onPrimary}
                              />
                            }
                          />
                        ) : (
                          <GCButton
                            label={busy ? 'summoning…' : 'Create GC'}
                            variant="gradient"
                            disabled={busy}
                            onPress={handleCreate}
                            icon={<Ionicons name="sparkles" size={18} color="#FFFFFF" />}
                          />
                        )}
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.lg,
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.pill,
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { ...typography.label, fontSize: 13, color: colors.onSurfaceVariant },
  segmentTextActive: { color: colors.onPrimary },

  rail: { flexDirection: 'row', gap: spacing.sm },
  railItem: { flex: 1, gap: 6 },
  railBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  railBarOn: { backgroundColor: colors.primaryContainer },
  railBarActive: { backgroundColor: colors.primary },
  railLabel: { ...typography.micro, fontSize: 10, color: colors.outline },
  railLabelActive: { color: colors.primary, fontFamily: typography.label.fontFamily },

  card: { padding: spacing.xl, gap: spacing.sm },
  stepEyebrow: { ...typography.label, color: colors.primary },
  stepTitle: { ...typography.headline, fontSize: 28, color: colors.onSurface },
  stepHelp: { ...typography.body, color: colors.onSurfaceVariant, marginBottom: spacing.sm },

  field: { marginTop: spacing.sm },
  input: {
    flex: 1,
    height: 52,
    fontFamily: fontFamily.bodyBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.onSurface,
    paddingTop: 0,
    paddingBottom: 0,
    paddingVertical: 0,
    marginTop: 0,
    marginBottom: 0,
    marginVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  counter: { ...typography.micro, color: colors.outline, alignSelf: 'flex-end' },

  previewRow: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  previewName: { ...typography.title, fontSize: 20, color: colors.onSurface },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(208,188,255,0.4)',
    backgroundColor: 'rgba(208,188,255,0.10)',
    paddingVertical: 13,
  },
  photoText: { ...typography.bodyMedium, color: colors.primary },
  clearButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,180,171,0.4)',
  },

  orLabel: {
    ...typography.label,
    fontSize: 10,
    color: colors.outline,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  emojiChip: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  emojiChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(208,188,255,0.18)' },
  emojiText: { fontSize: 24 },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '48%',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  themeSwatch: { width: 24, height: 24, borderRadius: 12 },
  themeName: { ...typography.caption, color: colors.onSurfaceVariant, flex: 1 },

  codeBlock: { marginTop: spacing.sm },

  codeField: { marginTop: spacing.md, paddingHorizontal: spacing.md },
  codeInput: {
    letterSpacing: 4,
    fontFamily: typography.headline.fontFamily,
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
    color: colors.onSurface,
    height: 52,
    paddingTop: 0,
    paddingBottom: 0,
    paddingVertical: 0,
    marginTop: 0,
    marginBottom: 0,
    marginVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  dots: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'center', marginVertical: spacing.sm },
  dot: { width: 22, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.16)' },
  dotFilledCyan: { backgroundColor: colors.tertiary },

  error: { ...typography.caption, color: colors.error, marginTop: spacing.sm },

  footer: { gap: spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerGrow: { flex: 1 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: glass.borderWidth,
    borderColor: glass.stroke,
  },
  backText: { ...typography.bodyMedium, color: colors.onSurface },
  linkButton: { alignSelf: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.onSurfaceVariant },
});
