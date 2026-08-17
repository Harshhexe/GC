import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
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
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../context/AuthContext';
import { isUsernameAvailable } from '../lib/username';
import { successFeedback } from '../utils/haptics';

const PASSWORD_MIN = 6;
const APP_LOGO_TRANSPARENT = require('../../assets/gc_app_logo-transparent.png');

type SignUpStep = 0 | 1;

/** Deep moody atmospheric glow background with high blur for Auth Screen */
function AuthAtmosphericBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Obsidian Base */}
      <LinearGradient
        colors={['#0C0A14', '#06050A', '#030206']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Atmosphere Spotlight */}
      <LinearGradient
        colors={['rgba(139, 92, 246, 0.20)', 'rgba(99, 102, 241, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topSpotlight}
      />

      {/* 4-Corner Luminous Glowing Blobs */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.32)', 'rgba(236, 72, 153, 0.15)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={['rgba(76, 215, 246, 0.22)', 'rgba(99, 102, 241, 0.14)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['rgba(251, 113, 133, 0.18)', 'rgba(139, 92, 246, 0.14)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.22)', 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      {/* High-intensity dark blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 95}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle Ambient Sheen */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.02)', 'transparent', 'rgba(3, 2, 6, 0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function AuthScreen() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [step, setStep] = useState<SignUpStep>(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; ext: string } | null>(null);

  const isSignUp = mode === 'signUp';

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'free' | 'taken'>(
    'idle'
  );
  const usernameCheckRef = useRef(0);

  useEffect(() => {
    if (!isSignUp || !username.trim()) {
      setUsernameStatus('idle');
      return;
    }
    const requestId = ++usernameCheckRef.current;
    setUsernameStatus('checking');

    const timer = setTimeout(async () => {
      const available = await isUsernameAvailable(username);
      if (usernameCheckRef.current !== requestId) return;
      setUsernameStatus(available === null ? 'idle' : available ? 'free' : 'taken');
    }, 450);

    return () => clearTimeout(timer);
  }, [username, isSignUp]);

  function switchMode(next: 'signIn' | 'signUp') {
    setMode(next);
    setStep(0);
    setError(null);
  }

  async function pickPhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo access is off — allow it in Settings to choose a profile photo.');
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
    setPhoto({
      uri: asset.uri,
      base64: asset.base64!,
      ext: asset.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
    });
  }

  async function goToStepTwo() {
    setError(null);
    if (!username.trim()) return setError('Pick a username first.');
    if (!email.trim()) return setError('Please enter your email address.');
    if (!email.includes('@')) return setError("That email doesn't look valid.");
    if (password.length < PASSWORD_MIN) {
      return setError(`Password needs at least ${PASSWORD_MIN} characters.`);
    }

    setBusy(true);
    const available = await isUsernameAvailable(username);
    setBusy(false);
    if (available === false) {
      setUsernameStatus('taken');
      return setError('That username is already taken. Try another one.');
    }

    setStep(1);
  }

  async function handleSignIn() {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setBusy(true);
    const message = await signIn(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
    else successFeedback();
  }

  async function handleCreateAccount() {
    setError(null);
    if (!displayName.trim()) {
      setError('What should your friends call you? Enter your name.');
      return;
    }
    setBusy(true);

    const available = await isUsernameAvailable(username);
    if (available === false) {
      setBusy(false);
      setUsernameStatus('taken');
      setStep(0);
      setError('That username just got taken. Try another one.');
      return;
    }

    const message = await signUp(email.trim(), password, username.trim(), displayName.trim(), {
      emoji: '👤',
      color: '#d0bcff',
      photoBase64: photo?.base64,
      photoExt: photo?.ext,
    });
    setBusy(false);
    if (message) {
      setError(message);
      if (/email|password/i.test(message)) setStep(0);
    } else {
      successFeedback();
    }
  }

  return (
    <View style={styles.root}>
      <AuthAtmosphericBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
            keyboardDismissMode="on-drag"
          >
            <Animated.View
              entering={FadeInDown.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
              style={styles.cardWrapper}
            >
              {/* WhatsApp-Style App Brand Hero Header */}
              <View style={styles.brandHeader}>
                <Image
                  source={APP_LOGO_TRANSPARENT}
                  style={styles.brandLogo}
                  contentFit="contain"
                />
                <Text style={styles.brandWelcomeTitle}>
                  {!isSignUp
                    ? 'Welcome Back'
                    : step === 0
                      ? 'Create an Account'
                      : 'Profile Info'}
                </Text>
                <Text style={styles.brandWelcomeSubtitle}>
                  {!isSignUp
                    ? 'Sign in to jump back into your group chats and catch up on everything.'
                    : step === 0
                      ? 'Choose your unique handle, email address and password.'
                      : 'Provide your name and an optional photo so friends recognize you.'}
                </Text>
              </View>

              {/* Main Card Container */}
              <GlassPanel borderRadius={radius.xl} style={styles.card}>
                {/* Segmented Mode Switcher */}
                <View style={styles.segmentTrack}>
                  <PressableScale
                    style={[styles.segmentBtn, !isSignUp && styles.segmentBtnActive]}
                    scaleTo={0.97}
                    onPress={() => switchMode('signIn')}
                  >
                    <Ionicons
                      name="log-in-outline"
                      size={16}
                      color={!isSignUp ? '#FFFFFF' : colors.onSurfaceVariant}
                    />
                    <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>
                      Sign In
                    </Text>
                  </PressableScale>

                  <PressableScale
                    style={[styles.segmentBtn, isSignUp && styles.segmentBtnActive]}
                    scaleTo={0.97}
                    onPress={() => switchMode('signUp')}
                  >
                    <Ionicons
                      name="person-add-outline"
                      size={15}
                      color={isSignUp ? '#FFFFFF' : colors.onSurfaceVariant}
                    />
                    <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>
                      Sign Up
                    </Text>
                  </PressableScale>
                </View>

                {isSignUp && <StepBar step={step} />}

                {/* ═══════════════════════════════════════════════════════════
                    MODE 1: SIGN UP WIZARD
                ═══════════════════════════════════════════════════════════ */}
                {isSignUp ? (
                  step === 0 ? (
                    <Animated.View
                      key="signup-step-0"
                      entering={SlideInLeft.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
                      exiting={SlideOutLeft.duration(duration.fast).reduceMotion(reduceMotion)}
                      style={styles.form}
                    >
                      {/* Username Field */}
                      <AuthField
                        label="USERNAME"
                        icon="at-outline"
                        placeholder="Choose unique username"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        trailing={
                          usernameStatus === 'checking' ? (
                            <ActivityIndicator size="small" color="#818CF8" />
                          ) : usernameStatus === 'free' ? (
                            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                          ) : usernameStatus === 'taken' ? (
                            <Ionicons name="close-circle" size={18} color="#F87171" />
                          ) : undefined
                        }
                      />
                      {usernameStatus === 'taken' && (
                        <Animated.Text entering={FadeIn.duration(duration.fast)} style={styles.fieldHintTaken}>
                          @{username.trim()} is taken. Please choose another.
                        </Animated.Text>
                      )}

                      {/* Email Field */}
                      <AuthField
                        label="EMAIL ADDRESS"
                        icon="mail-outline"
                        placeholder="yourname@example.com"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />

                      {/* Password Field */}
                      <PasswordField
                        label="PASSWORD"
                        value={password}
                        onChangeText={setPassword}
                        visible={showPassword}
                        onToggle={() => setShowPassword((v) => !v)}
                      />
                      {password.length > 0 && password.length < PASSWORD_MIN && (
                        <Animated.Text entering={FadeIn.duration(duration.fast)} style={styles.fieldHint}>
                          {PASSWORD_MIN - password.length} more characters needed.
                        </Animated.Text>
                      )}

                      {!!error && <ErrorBanner message={error} />}

                      {/* Next Step Button */}
                      <PressableScale
                        style={styles.submitBtnWrap}
                        scaleTo={0.96}
                        haptic="medium"
                        disabled={busy}
                        onPress={goToStepTwo}
                      >
                        <LinearGradient
                          colors={gradients.brand}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.submitBtnGradient}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Text style={styles.submitBtnText}>Continue to Profile</Text>
                              <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                            </>
                          )}
                        </LinearGradient>
                      </PressableScale>
                    </Animated.View>
                  ) : (
                    /* ── Step 1: WhatsApp-Style Profile Setup ─────────── */
                    <Animated.View
                      key="signup-step-1"
                      entering={SlideInRight.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
                      exiting={SlideOutRight.duration(duration.fast).reduceMotion(reduceMotion)}
                      style={styles.form}
                    >
                      {/* WhatsApp-Style Circular Avatar with Camera Badge */}
                      <View style={styles.avatarSetupCenter}>
                        <PressableScale
                          scaleTo={0.95}
                          haptic="medium"
                          onPress={pickPhoto}
                          style={styles.avatarWrapper}
                        >
                          <Avatar
                            imageUrl={photo?.uri}
                            label={displayName.trim() || username.trim() || 'You'}
                            size={96}
                            ringColors={gradients.brand}
                            glow
                          />
                          <View style={styles.cameraBadge}>
                            <Ionicons name="camera" size={15} color="#000000" />
                          </View>
                        </PressableScale>

                        {photo ? (
                          <View style={styles.photoActionRow}>
                            <PressableScale style={styles.photoChip} scaleTo={0.94} onPress={pickPhoto}>
                              <Ionicons name="image-outline" size={13} color="#818CF8" />
                              <Text style={[styles.photoChipText, { color: '#818CF8' }]}>Change Photo</Text>
                            </PressableScale>
                            <PressableScale style={styles.photoChip} scaleTo={0.94} onPress={() => setPhoto(null)}>
                              <Ionicons name="trash-outline" size={13} color="#F87171" />
                              <Text style={[styles.photoChipText, { color: '#F87171' }]}>Remove</Text>
                            </PressableScale>
                          </View>
                        ) : (
                          <PressableScale style={styles.addPhotoLink} scaleTo={0.96} onPress={pickPhoto}>
                            <Text style={styles.addPhotoLinkText}>Tap avatar to upload photo</Text>
                          </PressableScale>
                        )}
                      </View>

                      {/* Display Name Input */}
                      <AuthField
                        label="YOUR NAME"
                        icon="person-outline"
                        placeholder="How should friends see you?"
                        value={displayName}
                        onChangeText={setDisplayName}
                        autoFocus
                      />

                      {!!error && <ErrorBanner message={error} />}

                      {/* Submit Account Creation */}
                      <PressableScale
                        style={styles.submitBtnWrap}
                        scaleTo={0.96}
                        haptic="medium"
                        disabled={busy}
                        onPress={handleCreateAccount}
                      >
                        <LinearGradient
                          colors={gradients.brand}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.submitBtnGradient}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="sparkles" size={17} color="#FFFFFF" />
                              <Text style={styles.submitBtnText}>Create Account</Text>
                            </>
                          )}
                        </LinearGradient>
                      </PressableScale>

                      <PressableScale
                        style={styles.backRow}
                        scaleTo={0.97}
                        disabled={busy}
                        onPress={() => {
                          setError(null);
                          setStep(0);
                        }}
                      >
                        <Ionicons name="chevron-back" size={15} color={colors.onSurfaceVariant} />
                        <Text style={styles.backText}>Back to credentials</Text>
                      </PressableScale>
                    </Animated.View>
                  )
                ) : (
                  /* ═══════════════════════════════════════════════════════════
                      MODE 2: SIGN IN
                  ═══════════════════════════════════════════════════════════ */
                  <Animated.View
                    key="sign-in-form"
                    entering={FadeIn.duration(duration.base).reduceMotion(reduceMotion)}
                    style={styles.form}
                  >
                    <AuthField
                      label="EMAIL ADDRESS"
                      icon="mail-outline"
                      placeholder="yourname@example.com"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />

                    <PasswordField
                      label="PASSWORD"
                      value={password}
                      onChangeText={setPassword}
                      visible={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                    />

                    {!!error && <ErrorBanner message={error} />}

                    <PressableScale
                      style={styles.submitBtnWrap}
                      scaleTo={0.96}
                      haptic="medium"
                      disabled={busy}
                      onPress={handleSignIn}
                    >
                      <LinearGradient
                        colors={gradients.brand}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.submitBtnGradient}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="log-in" size={18} color="#FFFFFF" />
                            <Text style={styles.submitBtnText}>Sign In</Text>
                          </>
                        )}
                      </LinearGradient>
                    </PressableScale>
                  </Animated.View>
                )}
              </GlassPanel>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function StepBar({ step }: { step: SignUpStep }) {
  return (
    <View style={styles.stepBar}>
      {[0, 1].map((i) => (
        <StepSegment key={i} active={i <= step} />
      ))}
    </View>
  );
}

function StepSegment({ active }: { active: boolean }) {
  const fill = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(active ? 1 : 0, {
      duration: duration.base,
      easing: easing.out,
      reduceMotion,
    });
  }, [active, fill]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));

  return (
    <View style={styles.stepSegmentTrack}>
      <Animated.View style={[styles.stepSegmentFill, fillStyle]} />
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <Animated.View entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)} style={styles.errorBanner}>
      <Ionicons name="alert-circle-outline" size={16} color="#F87171" />
      <Text style={styles.errorText}>{message}</Text>
    </Animated.View>
  );
}

function AuthField({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
  autoCapitalize = 'none',
  keyboardType = 'default',
  trailing,
  autoFocus,
}: {
  label?: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  trailing?: React.ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.inputContainer}>
        <Ionicons name={icon} size={18} color="#A5B4FC" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder={placeholder}
          placeholderTextColor="#71717A"
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
        />
        {trailing}
      </View>
    </View>
  );
}

function PasswordField({
  label = 'PASSWORD',
  value,
  onChangeText,
  visible,
  onToggle,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={18} color="#A5B4FC" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="At least 6 characters"
          placeholderTextColor="#71717A"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PressableScale onPress={onToggle} style={styles.passwordToggle} hitSlop={8}>
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color="#A5B4FC"
          />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07060B' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: CONTAINER_MARGIN,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl * 3,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: spacing.lg,
  },

  // Glow Background
  glowBgRoot: { backgroundColor: '#07060B', overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -70, left: -70, width: 280, height: 280, opacity: 0.75 },
  blobTopRight: { top: -60, right: -60, width: 270, height: 270, opacity: 0.7 },
  blobBottomLeft: { bottom: -70, left: -60, width: 280, height: 280, opacity: 0.65 },
  blobBottomRight: { bottom: -80, right: -70, width: 290, height: 290, opacity: 0.7 },

  // Brand Header
  brandHeader: {
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.xs,
  },
  brandLogo: {
    width: 110,
    height: 44,
    marginBottom: 2,
  },
  brandWelcomeTitle: {
    ...typography.headline,
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  brandWelcomeSubtitle: {
    ...typography.body,
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
  },

  // Card
  card: {
    padding: spacing.lg + 2,
    gap: spacing.md + 2,
    backgroundColor: '#12111A',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },

  // Segment Track
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
    backgroundColor: '#6366F1',
    borderWidth: 1,
    borderColor: '#818CF8',
  },
  segmentText: {
    ...typography.label,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Step Bar
  stepBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignSelf: 'center',
    width: '40%',
  },
  stepSegmentTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  stepSegmentFill: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  // Form Container
  form: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    ...typography.label,
    fontSize: 11,
    fontWeight: '800',
    color: '#C7D2FE',
    letterSpacing: 0.8,
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: spacing.md,
    height: 50,
    gap: spacing.sm,
  },
  inputIcon: {
    marginRight: 2,
  },
  textInput: {
    flex: 1,
    fontFamily: fontFamily.bodyBold,
    fontSize: 15,
    color: '#FFFFFF',
    height: '100%',
    padding: 0,
  },
  passwordToggle: {
    padding: 4,
  },
  fieldHint: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 4,
    marginTop: -4,
  },
  fieldHintTaken: {
    ...typography.micro,
    fontSize: 11,
    color: '#F87171',
    marginLeft: 4,
    marginTop: -4,
  },

  // Avatar Setup
  avatarSetupCenter: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  avatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#07060B',
  },
  addPhotoLink: {
    paddingVertical: 2,
  },
  addPhotoLinkText: {
    ...typography.micro,
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  photoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  photoChipText: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '600',
  },

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
  errorText: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#F87171',
    flex: 1,
    lineHeight: 17,
  },

  // Submit Button
  submitBtnWrap: {
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  submitBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.strokeBright,
  },
  submitBtnText: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  backText: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.onSurfaceVariant,
  },
});
