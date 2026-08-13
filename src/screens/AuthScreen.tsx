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
import { Ionicons } from '@expo/vector-icons';
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
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton, LightFieldShell } from '../components/ui/Buttons';
import { PressableScale } from '../components/ui/PressableScale';
import { GCLogo } from '../components/ui/GCLogo';
import { AvatarPicker, AVATAR_COLORS, AVATAR_EMOJIS } from '../components/ui/AvatarPicker';
import { useAuth } from '../context/AuthContext';
import { isUsernameAvailable } from '../lib/username';

/**
 * Sign-up is split in two because the old single form asked for six things at
 * once — credentials and identity jumbled together — which is a wall to hit
 * before you've decided you want an account. Step 1 is the boring part that
 * makes the account exist; step 2 is the fun part that makes it yours.
 * Signing in stays one screen: it was never the problem.
 */
type SignUpStep = 0 | 1;

const PASSWORD_MIN = 6;

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

  // Profile picture: an emoji + colour, or a photo from the library.
  const [avatarEmoji, setAvatarEmoji] = useState(AVATAR_EMOJIS[0]);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; ext: string } | null>(null);

  const isSignUp = mode === 'signUp';

  // Checked as they type so a taken name surfaces before they fill out the
  // rest of the form and hit a failed signup — debounced since it's a network
  // round trip on every keystroke otherwise.
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
      if (usernameCheckRef.current !== requestId) return; // a newer keystroke superseded this check
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
      setError('Photo access is off — allow it in Settings, or pick an emoji instead.');
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
    setPhoto({
      uri: asset.uri,
      base64: asset.base64!,
      ext: asset.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
    });
  }

  /** Everything step 1 is responsible for, checked before moving on — the
   *  whole point of splitting the form is that you find out here, not after
   *  filling in step 2. */
  async function goToStepTwo() {
    setError(null);
    if (!username.trim()) return setError('Pick a username first.');
    if (!email.trim()) return setError('We need an email address.');
    if (!email.includes('@')) return setError("That email doesn't look right.");
    if (password.length < PASSWORD_MIN) {
      return setError(`Password needs at least ${PASSWORD_MIN} characters.`);
    }

    setBusy(true);
    const available = await isUsernameAvailable(username);
    setBusy(false);
    if (available === false) {
      setUsernameStatus('taken');
      return setError('That username is taken. Try another one.');
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
  }

  async function handleCreateAccount() {
    setError(null);
    if (!displayName.trim()) {
      setError('What should everyone call you?');
      return;
    }
    setBusy(true);

    // Re-check right now rather than trusting the debounced indicator: that
    // state only updates when the username *text* changes, so it goes stale
    // the moment the real answer changes for any other reason — e.g. someone
    // else claimed this name while the user was on step 2.
    const available = await isUsernameAvailable(username);
    if (available === false) {
      setBusy(false);
      setUsernameStatus('taken');
      setStep(0);
      setError('That username just got taken. Try another one.');
      return;
    }

    const message = await signUp(email.trim(), password, username.trim(), displayName.trim(), {
      emoji: avatarEmoji,
      color: avatarColor,
      photoBase64: photo?.base64,
      photoExt: photo?.ext,
    });
    setBusy(false);
    // On success the session lands and the navigator swaps to the welcome
    // screen on its own — nothing to do here.
    if (message) {
      setError(message);
      // A credential problem belongs to step 1, so send them back to where
      // they can actually fix it.
      if (/email|password/i.test(message)) setStep(0);
    }
  }

  return (
    <View style={styles.root}>
      <AmbientBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.centerContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              entering={FadeInDown.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
              style={styles.cardWrapper}
            >
              <GlassPanel borderRadius={radius.xl} style={styles.card} intensity={30}>
                <View style={styles.headerBlock}>
                  <GCLogo size={150} height={95} glow={false} />
                  <Text style={styles.tagline}>Your digital playground</Text>
                </View>

                <View style={styles.segmentContainer}>
                  <PressableScale
                    style={[styles.segmentBtn, !isSignUp && styles.segmentBtnActive]}
                    onPress={() => switchMode('signIn')}
                  >
                    <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>
                      Sign In
                    </Text>
                  </PressableScale>

                  <PressableScale
                    style={[styles.segmentBtn, isSignUp && styles.segmentBtnActive]}
                    onPress={() => switchMode('signUp')}
                  >
                    <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>
                      Sign Up
                    </Text>
                  </PressableScale>
                </View>

                {isSignUp && <StepBar step={step} />}

                {isSignUp ? (
                  step === 0 ? (
                    <Animated.View
                      key="step-0"
                      entering={SlideInLeft.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
                      exiting={SlideOutLeft.duration(duration.fast).reduceMotion(reduceMotion)}
                      style={styles.form}
                    >
                      <StepHeading
                        title="Claim your handle"
                        subtitle="This is how people find you in a GC."
                      />

                      <Field
                        index={0}
                        icon="at"
                        placeholder="Username"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        trailing={
                          usernameStatus === 'checking' ? (
                            <ActivityIndicator size="small" color={colors.textFaint} />
                          ) : usernameStatus === 'free' ? (
                            <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                          ) : usernameStatus === 'taken' ? (
                            <Ionicons name="close-circle" size={18} color={colors.error} />
                          ) : undefined
                        }
                      />
                      {usernameStatus === 'taken' && (
                        <Animated.Text
                          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
                          style={styles.fieldHint}
                        >
                          Someone's already @{username.trim()}. Try another.
                        </Animated.Text>
                      )}

                      <Field
                        index={1}
                        icon="mail-outline"
                        placeholder="Email Address"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                      <PasswordField
                        index={2}
                        value={password}
                        onChangeText={setPassword}
                        visible={showPassword}
                        onToggle={() => setShowPassword((v) => !v)}
                      />
                      {password.length > 0 && password.length < PASSWORD_MIN && (
                        <Animated.Text
                          entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
                          style={styles.fieldHint}
                        >
                          {PASSWORD_MIN - password.length} more character
                          {PASSWORD_MIN - password.length === 1 ? '' : 's'} to go.
                        </Animated.Text>
                      )}

                      {!!error && <ErrorText>{error}</ErrorText>}

                      <GCButton
                        label={busy ? 'Checking...' : 'Continue'}
                        variant="primary"
                        disabled={busy}
                        onPress={goToStepTwo}
                        style={styles.cta}
                        iconRight={
                          <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
                        }
                      />
                    </Animated.View>
                  ) : (
                    <Animated.View
                      key="step-1"
                      entering={SlideInRight.duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
                      exiting={SlideOutRight.duration(duration.fast).reduceMotion(reduceMotion)}
                      style={styles.form}
                    >
                      <StepHeading
                        title={`Nice one, @${username.trim()}`}
                        subtitle="Now the part people actually see."
                      />

                      <View style={styles.avatarBlock}>
                        <AvatarPicker
                          emoji={avatarEmoji}
                          color={avatarColor}
                          photoUri={photo?.uri}
                          label={displayName || username}
                          onPickEmoji={setAvatarEmoji}
                          onPickColor={setAvatarColor}
                          onPickPhoto={pickPhoto}
                          onClearPhoto={() => setPhoto(null)}
                        />
                      </View>

                      <Field
                        index={0}
                        icon="sparkles-outline"
                        placeholder="Display Name"
                        value={displayName}
                        onChangeText={setDisplayName}
                        autoFocus
                      />

                      {!!error && <ErrorText>{error}</ErrorText>}

                      <GCButton
                        label={busy ? 'Creating...' : 'Create Account'}
                        variant="primary"
                        disabled={busy}
                        onPress={handleCreateAccount}
                        style={styles.cta}
                      />

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
                        <Text style={styles.backText}>Back to login details</Text>
                      </PressableScale>
                    </Animated.View>
                  )
                ) : (
                  <Animated.View
                    key="sign-in"
                    entering={FadeIn.duration(duration.base).reduceMotion(reduceMotion)}
                    style={styles.form}
                  >
                    <Field
                      index={0}
                      icon="mail-outline"
                      placeholder="Email Address"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <PasswordField
                      index={1}
                      value={password}
                      onChangeText={setPassword}
                      visible={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                    />

                    {!!error && <ErrorText>{error}</ErrorText>}

                    <GCButton
                      label={busy ? 'Please wait...' : 'Sign In'}
                      variant="primary"
                      disabled={busy}
                      onPress={handleSignIn}
                      style={styles.cta}
                    />
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

/** Two segments that fill as you advance — cheap orientation, so step 2
 *  reads as "nearly done" rather than "how much more of this is there". */
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

  // Opacity only, no scaleX: a partially-scaled bar sits as a short dash in
  // the middle of its track, which reads as "half done" rather than "not
  // started" — exactly the wrong signal for the step you haven't reached.
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));

  return (
    <View style={styles.stepSegmentTrack}>
      <Animated.View style={[styles.stepSegmentFill, fillStyle]} />
    </View>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.stepHeading}>
      <Text style={styles.stepTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.stepSubtitle}>{subtitle}</Text>
    </View>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast).reduceMotion(reduceMotion)}
      style={styles.errorRow}
    >
      <Ionicons name="alert-circle" size={14} color={colors.error} />
      <Text style={styles.error}>{children}</Text>
    </Animated.View>
  );
}

/** Password gets its own field so it can carry a reveal toggle — typing a
 *  password blind on a phone keyboard is where most sign-in failures start. */
function PasswordField({
  index,
  value,
  onChangeText,
  visible,
  onToggle,
}: {
  index: number;
  value: string;
  onChangeText: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <Field
      index={index}
      icon="lock-closed-outline"
      placeholder="Password"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      trailing={
        <PressableScale hitSlop={10} scaleTo={0.85} onPress={onToggle}>
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={colors.textSecondary}
          />
        </PressableScale>
      }
    />
  );
}

function Field({
  index,
  icon,
  trailing,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  index: number;
  icon: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * STAGGER_MS + 40)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      <LightFieldShell style={styles.fieldShell}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          {...props}
        />
        {trailing}
      </LightFieldShell>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  centerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: CONTAINER_MARGIN,
    paddingVertical: spacing.xl,
  },
  cardWrapper: { width: '100%' },
  card: { padding: spacing.lg },
  headerBlock: { alignItems: 'center', marginBottom: spacing.md },
  tagline: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: 2 },

  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentBtnActive: { backgroundColor: colors.primaryContainer },
  segmentText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: typography.subheading.fontFamily,
  },
  segmentTextActive: { color: colors.onPrimary },

  stepBar: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  stepSegmentTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
  },
  stepSegmentFill: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },

  stepHeading: { marginBottom: spacing.xs },
  stepTitle: { ...typography.titleMd, fontSize: 19, color: colors.onSurface },
  stepSubtitle: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: 2 },

  avatarBlock: {
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.stroke,
    padding: spacing.md,
  },

  form: { gap: spacing.sm + 2 },
  fieldShell: { minHeight: 48, paddingHorizontal: spacing.lg },
  input: {
    flex: 1,
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
    color: colors.onSurface,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
  },
  error: { ...typography.caption, color: colors.error, flexShrink: 1 },
  fieldHint: {
    ...typography.micro,
    color: colors.onSurfaceVariant,
    marginTop: -6,
    marginLeft: spacing.md,
  },
  cta: { marginTop: spacing.xs },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: spacing.xs,
  },
  backText: { ...typography.caption, color: colors.onSurfaceVariant },
});
