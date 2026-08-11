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
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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

export default function AuthScreen() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (isSignUp && (!username.trim() || !displayName.trim())) {
      setError('Username and Display Name are required.');
      return;
    }
    setBusy(true);

    if (isSignUp) {
      // Re-check right now rather than trusting the debounced indicator: that
      // state only updates when the username *text* changes, so it goes
      // stale the moment the real answer changes for any other reason — e.g.
      // the account that held this name got deleted a minute ago in another
      // tab, with this field never touched since.
      const available = await isUsernameAvailable(username);
      if (available === false) {
        setBusy(false);
        setUsernameStatus('taken');
        setError('That username is taken. Try another one.');
        return;
      }
    }

    const message = isSignUp
      ? await signUp(email.trim(), password, username.trim(), displayName.trim(), {
          emoji: avatarEmoji,
          color: avatarColor,
          photoBase64: photo?.base64,
          photoExt: photo?.ext,
        })
      : await signIn(email.trim(), password);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    if (isSignUp) setInfo('Account created. Welcome to the GC.');
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
                {/* Header Logo */}
                <View style={styles.headerBlock}>
                  <GCLogo size={150} height={95} glow={false} />
                  <Text style={styles.tagline}>Your digital playground</Text>
                </View>

                {/* Segmented Mode Selector */}
                <View style={styles.segmentContainer}>
                  <PressableScale
                    style={[styles.segmentBtn, !isSignUp && styles.segmentBtnActive]}
                    onPress={() => {
                      setMode('signIn');
                      setError(null);
                      setInfo(null);
                    }}
                  >
                    <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>
                      Sign In
                    </Text>
                  </PressableScale>

                  <PressableScale
                    style={[styles.segmentBtn, isSignUp && styles.segmentBtnActive]}
                    onPress={() => {
                      setMode('signUp');
                      setError(null);
                      setInfo(null);
                    }}
                  >
                    <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>
                      Sign Up
                    </Text>
                  </PressableScale>
                </View>

                {/* Form Fields */}
                <View style={styles.form}>
                  {isSignUp && (
                    <>
                      <Animated.View
                        entering={FadeInDown.duration(duration.slow)
                          .easing(easing.out)
                          .reduceMotion(reduceMotion)}
                        style={styles.avatarBlock}
                      >
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
                      </Animated.View>

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
                          style={styles.usernameHint}
                        >
                          Someone's already @{username.trim()}. Try another.
                        </Animated.Text>
                      )}
                      <Field
                        index={1}
                        icon="sparkles-outline"
                        placeholder="Display Name"
                        value={displayName}
                        onChangeText={setDisplayName}
                      />
                    </>
                  )}
                  <Field
                    index={isSignUp ? 2 : 0}
                    icon="mail-outline"
                    placeholder="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Field
                    index={isSignUp ? 3 : 1}
                    icon="lock-closed-outline"
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />

                  {!!error && (
                    <Animated.Text entering={FadeIn.reduceMotion(reduceMotion)} style={styles.error}>
                      {error}
                    </Animated.Text>
                  )}
                  {!!info && (
                    <Animated.Text entering={FadeIn.reduceMotion(reduceMotion)} style={styles.info}>
                      {info}
                    </Animated.Text>
                  )}

                  <GCButton
                    label={busy ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
                    variant="primary"
                    disabled={busy}
                    onPress={handleSubmit}
                    style={styles.cta}
                  />
                </View>
              </GlassPanel>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
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
  avatarBlock: {
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.stroke,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  cardWrapper: {
    width: '100%',
  },
  card: {
    padding: spacing.lg,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcome: {
    ...typography.headline,
    color: colors.onSurface,
    marginTop: spacing.xs,
    fontSize: 24,
  },
  tagline: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
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
  segmentBtnActive: {
    backgroundColor: colors.primaryContainer,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: typography.subheading.fontFamily,
  },
  segmentTextActive: {
    color: colors.onPrimary,
  },
  form: {
    gap: spacing.sm + 2,
  },
  fieldShell: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.bodyBold,
    fontSize: 16,
    color: colors.onSurface,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  error: { ...typography.caption, color: colors.error, textAlign: 'center', marginTop: 2 },
  usernameHint: {
    ...typography.micro,
    color: colors.error,
    marginTop: -6,
    marginLeft: spacing.md,
  },
  info: { ...typography.caption, color: colors.tertiary, textAlign: 'center', marginTop: 2 },
  cta: { marginTop: spacing.xs },
});
