import { useEffect, useState, useRef } from 'react';
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
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  fontFamily,
  glass,
  gradients,
  radius,
  shadows,
  spacing,
  typography,
} from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { GROUP_THEMES, GroupThemeKey, groupTheme, GroupTheme } from '../theme/groupThemes';
import { GlassPanel } from '../components/ui/Glass';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { useIsDesktopWeb } from '../hooks/useResponsiveLayout';
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
import { useWebKeyboardInset } from '../hooks/useWebKeyboardOpen';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'AddGC'>,
  NativeStackScreenProps<RootStackParamList>
>;

const CODE_LENGTH = 6;

function normaliseCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** Dynamic multi-layered ambient glow background tied to selected theme (zero blob artifacts) */
function ThemedGlowBackground({ theme }: { theme: GroupTheme }) {
  const [c1, c2] = theme.colors;

  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Dark Base */}
      <LinearGradient
        colors={['#0F0D15', '#08070C', '#050508']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Atmosphere Spotlight */}
      <LinearGradient
        colors={[`${c1}24`, `${c2}10`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.topSpotlight}
      />

      {/* Top-Left Ambient Wash */}
      <LinearGradient
        colors={[`${c1}14`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top-Right Secondary Accent Wash */}
      <LinearGradient
        colors={[`${c2}10`, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Center Subtle Tint */}
      <LinearGradient
        colors={['transparent', `${c1}08`, 'transparent']}
        start={{ x: 0.5, y: 0.25 }}
        end={{ x: 0.5, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Bottom Grounding Vignette */}
      <LinearGradient
        colors={['transparent', 'rgba(5, 5, 8, 0.65)']}
        start={{ x: 0.5, y: 0.6 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function AddGCScreen({ navigation, route }: Props) {
  const webKeyboardInset = useWebKeyboardInset();
  const { session, profile } = useAuth();
  const isDesktopWeb = useIsDesktopWeb();
  const [mode, setMode] = useState<'create' | 'join'>(route.params?.mode ?? 'create');

  const requestedMode = route.params?.mode;
  useEffect(() => {
    if (requestedMode) setMode(requestedMode);
  }, [requestedMode]);

  // ── Create State ──────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string; ext: string } | null>(null);
  const [theme, setTheme] = useState<GroupThemeKey>('violet');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; code: string } | null>(null);

  // ── Join State ────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const codeInputRef = useRef<TextInput>(null);

  const activeTheme = groupTheme(theme);

  function resetWizard() {
    setName('');
    setPhoto(null);
    setTheme('violet');
    setCreated(null);
    setCreateError(null);
  }

  async function pickPhoto() {
    setCreateError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setCreateError('Photo access is required — allow it in Settings to choose a group photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    const ext = asset.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    setPhoto({ uri: asset.uri, base64: asset.base64!, ext });
  }

  async function handleCreate() {
    if (!session?.user || busy || !name.trim()) return;
    setBusy(true);
    setCreateError(null);

    let avatarUrl: string | null = null;
    if (photo) {
      const { url, error } = await uploadGroupAvatar(photo.base64, session.user.id, photo.ext);
      if (error) {
        setBusy(false);
        setCreateError(`Couldn't upload photo: ${error}`);
        return;
      }
      avatarUrl = url;
    }

    const { data: group, error } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        avatar_url: avatarUrl,
        theme,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error || !group) {
      setBusy(false);
      setCreateError(error?.message ?? 'Failed to create group. Please try again.');
      return;
    }

    await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id, role: 'owner' });
    setBusy(false);
    successFeedback();
    setCreated({ id: group.id, name: group.name, code: group.invite_code });
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
      setJoinError('No group found with that invite code.');
      return;
    }
    successFeedback();
    setCode('');
    navigation.navigate('Chat', { groupId: result.group_id });
  }

  return (
    <View style={styles.root}>
      <ThemedGlowBackground theme={activeTheme} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          wordmark
          // No back arrow on the desktop shell: Create is a rail tab, not a
          // pushed route, so there is nowhere for "back" to go.
          left={
            isDesktopWeb ? undefined : (
              <HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />
            )
          }
          right={
            <Avatar
              imageUrl={profile?.avatar_url}
              label={profile?.display_name ?? 'Me'}
              ringColors={gradients.brandSoft}
              size={34}
            />
          }
        />

        <KeyboardAvoidingView
          // On web the app root is never resized by the keyboard, and
          // KeyboardAvoidingView has no keyboard events to react to there, so
          // the covered strip is added as padding by hand. 0 when closed, so
          // the resting layout is untouched.
          style={[styles.flex, Platform.OS === 'web' && { paddingBottom: webKeyboardInset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Mode Switcher Segment (WhatsApp / Modern Messenger Style) */}
            {!created && (
              <Animated.View entering={FadeIn.reduceMotion(reduceMotion)} style={styles.segmentTrack}>
                <PressableScale
                  style={[styles.segmentBtn, mode === 'create' && styles.segmentBtnActive]}
                  scaleTo={0.97}
                  onPress={() => setMode('create')}
                >
                  <Ionicons
                    name="add-circle"
                    size={16}
                    color={mode === 'create' ? '#FFFFFF' : colors.onSurfaceVariant}
                  />
                  <Text style={[styles.segmentText, mode === 'create' && styles.segmentTextActive]}>
                    New Group
                  </Text>
                </PressableScale>

                <PressableScale
                  style={[styles.segmentBtn, mode === 'join' && styles.segmentBtnActive]}
                  scaleTo={0.97}
                  onPress={() => {
                    setMode('join');
                    setTimeout(() => codeInputRef.current?.focus(), 150);
                  }}
                >
                  <Ionicons
                    name="key"
                    size={15}
                    color={mode === 'join' ? '#FFFFFF' : colors.onSurfaceVariant}
                  />
                  <Text style={[styles.segmentText, mode === 'join' && styles.segmentTextActive]}>
                    Join with Code
                  </Text>
                </PressableScale>
              </Animated.View>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODE 1: SUCCESS / GROUP CREATED
            ═══════════════════════════════════════════════════════════════ */}
            {created ? (
              <Animated.View
                entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
                style={styles.createdCardWrap}
              >
                <GlassPanel borderRadius={radius.xl} style={styles.createdCard}>
                  <View style={styles.createdBadgeRow}>
                    <View style={[styles.celebrationBadge, { backgroundColor: `${activeTheme.accent}20` }]}>
                      <Ionicons name="sparkles" size={24} color={activeTheme.accent} />
                    </View>
                    <Text style={styles.createdHeadline}>Group Created!</Text>
                    <Text style={styles.createdSubtext}>
                      Your GC is live. Share the invite code with your squad.
                    </Text>
                  </View>

                  <View style={styles.createdAvatarWrap}>
                    <Avatar
                      imageUrl={photo?.uri}
                      label={created.name}
                      size={90}
                      ringColors={activeTheme.colors}
                      glow
                    />
                    <Text style={styles.createdGroupName} numberOfLines={1}>
                      {created.name}
                    </Text>
                  </View>

                  <View style={styles.codeBlock}>
                    <InviteCodeCard code={created.code} groupName={created.name} />
                  </View>

                  <View style={styles.createdActions}>
                    <PressableScale
                      style={styles.openChatBtnWrap}
                      scaleTo={0.96}
                      haptic="medium"
                      onPress={() => {
                        const id = created.id;
                        resetWizard();
                        navigation.navigate('Chat', { groupId: id });
                      }}
                    >
                      <LinearGradient
                        colors={activeTheme.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.openChatBtnGradient}
                      >
                        <Ionicons name="chatbubbles" size={18} color="#FFFFFF" />
                        <Text style={styles.openChatBtnText}>Open Group Chat</Text>
                      </LinearGradient>
                    </PressableScale>

                    <PressableScale style={styles.anotherLinkBtn} scaleTo={0.95} onPress={resetWizard}>
                      <Text style={styles.anotherLinkText}>Create another group</Text>
                    </PressableScale>
                  </View>
                </GlassPanel>
              </Animated.View>
            ) : mode === 'create' ? (
              /* ═══════════════════════════════════════════════════════════════
                 MODE 2: WHATSAPP-STYLE UNIFIED CREATE GROUP
              ═══════════════════════════════════════════════════════════════ */
              <Animated.View
                entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
                style={styles.createContainer}
              >
                {/* 1. WhatsApp-Style Group Identity Card */}
                <GlassPanel borderRadius={radius.xl} style={styles.profileCard}>
                  <Text style={styles.sectionHeaderLabel}>GROUP INFO</Text>

                  <View style={styles.identityRow}>
                    {/* WhatsApp-Style Circular Avatar with Camera Badge */}
                    <PressableScale style={styles.avatarPickerWrap} scaleTo={0.95} haptic="medium" onPress={pickPhoto}>
                      <Avatar
                        imageUrl={photo?.uri}
                        label={name.trim() || 'GC'}
                        size={82}
                        ringColors={activeTheme.colors}
                        glow
                      />
                      <View style={[styles.cameraBadge, { backgroundColor: activeTheme.accent }]}>
                        <Ionicons name="camera" size={14} color="#000000" />
                      </View>
                    </PressableScale>

                    {/* Group Subject & Details */}
                    <View style={styles.identityInputsCol}>
                      <View style={styles.nameFieldWrap}>
                        <TextInput
                          style={styles.nameInput}
                          placeholder="Type group subject..."
                          placeholderTextColor={colors.outline}
                          value={name}
                          onChangeText={(t) => {
                            setName(t);
                            setCreateError(null);
                          }}
                          maxLength={40}
                        />
                      </View>
                      <View style={styles.nameMetaRow}>
                        <Text style={styles.nameHelpText}>Provide a group name and icon</Text>
                        <Text style={styles.charCounter}>{name.length}/40</Text>
                      </View>
                    </View>
                  </View>

                  {/* Photo Actions if photo chosen */}
                  {photo && (
                    <View style={styles.photoActionsRow}>
                      <PressableScale style={styles.photoActionChip} scaleTo={0.94} onPress={pickPhoto}>
                        <Ionicons name="image-outline" size={14} color={activeTheme.accent} />
                        <Text style={[styles.photoActionText, { color: activeTheme.accent }]}>Change photo</Text>
                      </PressableScale>
                      <PressableScale style={styles.photoActionChip} scaleTo={0.94} onPress={() => setPhoto(null)}>
                        <Ionicons name="trash-outline" size={14} color="#F87171" />
                        <Text style={[styles.photoActionText, { color: '#F87171' }]}>Remove</Text>
                      </PressableScale>
                    </View>
                  )}
                </GlassPanel>

                {/* 2. Theme & Vibe Customization Palette */}
                <GlassPanel borderRadius={radius.xl} style={styles.themeCard}>
                  <View style={styles.themeHeaderRow}>
                    <Text style={styles.sectionHeaderLabel}>GROUP THEME & VIBE</Text>
                    <Text style={styles.selectedThemeName}>{activeTheme.name}</Text>
                  </View>

                  <View style={styles.themeGrid}>
                    {GROUP_THEMES.map((t) => {
                      const isSelected = theme === t.key;
                      return (
                        <PressableScale
                          key={t.key}
                          scaleTo={0.94}
                          haptic="light"
                          onPress={() => setTheme(t.key)}
                          style={[
                            styles.themeChip,
                            isSelected && {
                              borderColor: t.accent,
                              backgroundColor: `${t.accent}1A`,
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
                              styles.themeChipTitle,
                              isSelected && { color: '#FFFFFF', fontWeight: '700' },
                            ]}
                          >
                            {t.name}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={16} color={t.accent} />
                          )}
                        </PressableScale>
                      );
                    })}
                  </View>
                </GlassPanel>

                {/* 3. Live Card Preview */}
                <GlassPanel borderRadius={radius.xl} style={styles.previewCard}>
                  <Text style={styles.sectionHeaderLabel}>CHAT LIST PREVIEW</Text>
                  <View style={styles.previewContent}>
                    <Avatar
                      imageUrl={photo?.uri}
                      label={name.trim() || 'GC'}
                      size={52}
                      ringColors={activeTheme.colors}
                      status="online"
                    />
                    <View style={styles.previewTextCol}>
                      <View style={styles.previewTopRow}>
                        <Text style={styles.previewGroupName} numberOfLines={1}>
                          {name.trim() || 'Your Group Name'}
                        </Text>
                        <Text style={[styles.previewTime, { color: activeTheme.accent }]}>just now</Text>
                      </View>
                      <Text style={styles.previewSnippet} numberOfLines={1}>
                        You created this group. Tap to start chatting!
                      </Text>
                    </View>
                  </View>
                </GlassPanel>

                {/* Error Banner */}
                {!!createError && (
                  <Animated.View entering={FadeIn} style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                    <Text style={styles.errorText}>{createError}</Text>
                  </Animated.View>
                )}

                {/* Create CTA Button */}
                <PressableScale
                  style={styles.createBtnWrap}
                  scaleTo={0.96}
                  haptic="medium"
                  onPress={handleCreate}
                  disabled={busy || !name.trim()}
                >
                  <LinearGradient
                    colors={name.trim() ? activeTheme.colors : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.createBtnGradient,
                      name.trim() && {
                        shadowColor: activeTheme.accent,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.5,
                        shadowRadius: 14,
                      },
                    ]}
                  >
                    <Ionicons
                      name={busy ? 'sync' : 'sparkles'}
                      size={18}
                      color={name.trim() ? '#FFFFFF' : colors.outline}
                    />
                    <Text
                      style={[
                        styles.createBtnText,
                        !name.trim() && { color: colors.outline },
                      ]}
                    >
                      {busy ? 'Creating GC...' : 'Create Group'}
                    </Text>
                  </LinearGradient>
                </PressableScale>
              </Animated.View>
            ) : (
              /* ═══════════════════════════════════════════════════════════════
                 MODE 3: WHATSAPP-STYLE JOIN VIA INVITE CODE
              ═══════════════════════════════════════════════════════════════ */
              <Animated.View
                entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
                style={styles.joinContainer}
              >
                <GlassPanel borderRadius={radius.xl} style={styles.joinCard}>
                  <View style={styles.joinIconOrb}>
                    <Ionicons name="key" size={32} color="#22D3EE" />
                  </View>

                  <Text style={styles.joinTitle}>Join Group Chat</Text>
                  <Text style={styles.joinSubtext}>
                    Enter the 6-character code from your group invite.
                  </Text>

                  {/* 6-Box Pin Input Layout */}
                  <PressableScale
                    scaleTo={0.99}
                    onPress={() => codeInputRef.current?.focus()}
                    style={styles.boxesContainer}
                  >
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                      const char = code[i] ?? '';
                      const isFocused = i === code.length && code.length < CODE_LENGTH;
                      const isFilled = !!char;

                      return (
                        <View
                          key={i}
                          style={[
                            styles.codeDigitBox,
                            isFilled && styles.codeDigitBoxFilled,
                            isFocused && styles.codeDigitBoxFocused,
                          ]}
                        >
                          <Text style={styles.codeDigitText}>{char}</Text>
                        </View>
                      );
                    })}
                  </PressableScale>

                  {/* Hidden Native Input overlaid for smooth typing */}
                  <TextInput
                    ref={codeInputRef}
                    style={styles.hiddenInput}
                    value={code}
                    onChangeText={(t) => {
                      setCode(normaliseCode(t));
                      setJoinError(null);
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={CODE_LENGTH}
                    keyboardType="default"
                  />

                  {/* Error display */}
                  {!!joinError && (
                    <Animated.View entering={FadeIn} style={styles.errorBanner}>
                      <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                      <Text style={styles.errorText}>{joinError}</Text>
                    </Animated.View>
                  )}

                  {/* Join Action Button */}
                  <PressableScale
                    style={styles.joinBtnWrap}
                    scaleTo={0.96}
                    haptic="medium"
                    onPress={handleJoin}
                    disabled={code.length !== CODE_LENGTH || joining}
                  >
                    <LinearGradient
                      colors={code.length === CODE_LENGTH ? ['#06B6D4', '#3B82F6'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.joinBtnGradient,
                        code.length === CODE_LENGTH && {
                          shadowColor: '#22D3EE',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.5,
                          shadowRadius: 14,
                        },
                      ]}
                    >
                      <Ionicons
                        name={joining ? 'sync' : 'arrow-forward-circle'}
                        size={19}
                        color={code.length === CODE_LENGTH ? '#FFFFFF' : colors.outline}
                      />
                      <Text
                        style={[
                          styles.joinBtnText,
                          code.length !== CODE_LENGTH && { color: colors.outline },
                        ]}
                      >
                        {joining ? 'Joining Group...' : 'Join Group'}
                      </Text>
                    </LinearGradient>
                  </PressableScale>
                </GlassPanel>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07060B' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.md,
  },

  // Glow Background Styles
  glowBgRoot: { backgroundColor: '#07060B', overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -60, left: -60, width: 270, height: 270, opacity: 0.75 },
  blobTopRight: { top: -50, right: -50, width: 260, height: 260, opacity: 0.7 },
  blobBottomLeft: { bottom: -60, left: -50, width: 270, height: 270, opacity: 0.65 },
  blobBottomRight: { bottom: -70, right: -60, width: 290, height: 290, opacity: 0.7 },
  blobCenter: { top: '35%', left: '20%', width: 250, height: 250, opacity: 0.55 },

  // Segmented Mode Switcher Track
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  segmentText: { ...typography.label, fontSize: 13, color: colors.onSurfaceVariant, fontWeight: '600' },
  segmentTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // WhatsApp-Style Create Layout
  createContainer: { gap: spacing.md },
  profileCard: { padding: spacing.lg, gap: spacing.md },
  sectionHeaderLabel: {
    ...typography.label,
    fontSize: 11,
    color: colors.outline,
    letterSpacing: 1,
    fontWeight: '700',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarPickerWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#07060B',
  },
  identityInputsCol: {
    flex: 1,
    gap: 6,
  },
  nameFieldWrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  nameInput: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
    padding: 0,
  },
  nameMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameHelpText: { ...typography.micro, color: colors.outline, fontSize: 11 },
  charCounter: { ...typography.micro, color: colors.outline, fontSize: 11 },

  photoActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  photoActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  photoActionText: { ...typography.micro, fontSize: 11, fontWeight: '600' },

  // Theme Section
  themeCard: { padding: spacing.lg, gap: spacing.md },
  themeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedThemeName: {
    ...typography.label,
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '48%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  themeSwatch: { width: 20, height: 20, borderRadius: 10 },
  themeChipTitle: { ...typography.caption, fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },

  // Live Chat Preview Card
  previewCard: { padding: spacing.lg, gap: spacing.sm },
  previewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  previewTextCol: { flex: 1, gap: 2 },
  previewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewGroupName: { ...typography.title, fontSize: 16, color: '#FFFFFF', fontWeight: '700', flex: 1 },
  previewTime: { ...typography.micro, fontSize: 11, fontWeight: '600' },
  previewSnippet: { ...typography.body, fontSize: 12.5, color: colors.onSurfaceVariant },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  errorText: { ...typography.caption, color: '#F87171', flex: 1 },

  // Create Button
  createBtnWrap: { borderRadius: radius.pill, marginTop: spacing.xs },
  createBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  createBtnText: { ...typography.label, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Join Flow Styles
  joinContainer: { gap: spacing.md },
  joinCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  joinIconOrb: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  joinTitle: { ...typography.headline, fontSize: 24, color: '#FFFFFF', fontWeight: '800' },
  joinSubtext: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center', fontSize: 13 },
  boxesContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  codeDigitBox: {
    width: 44,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigitBoxFilled: {
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
    borderColor: 'rgba(34, 211, 238, 0.4)',
  },
  codeDigitBoxFocused: {
    borderColor: '#22D3EE',
    shadowColor: '#22D3EE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  codeDigitText: {
    fontFamily: typography.headline.fontFamily,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  joinBtnWrap: { width: '100%', borderRadius: radius.pill, marginTop: spacing.sm },
  joinBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  joinBtnText: { ...typography.label, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Created Success Card
  createdCardWrap: { width: '100%' },
  createdCard: { padding: spacing.xl, alignItems: 'center', gap: spacing.lg },
  createdBadgeRow: { alignItems: 'center', gap: 6 },
  celebrationBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  createdHeadline: { ...typography.headline, fontSize: 26, color: '#FFFFFF', fontWeight: '800' },
  createdSubtext: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center', fontSize: 13 },
  createdAvatarWrap: { alignItems: 'center', gap: spacing.sm },
  createdGroupName: { ...typography.title, fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
  codeBlock: { width: '100%' },
  createdActions: { width: '100%', gap: spacing.sm },
  openChatBtnWrap: { width: '100%', borderRadius: radius.pill },
  openChatBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  openChatBtnText: { ...typography.label, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  anotherLinkBtn: { alignSelf: 'center', paddingVertical: spacing.xs },
  anotherLinkText: { ...typography.caption, color: colors.onSurfaceVariant, fontSize: 13 },
});
