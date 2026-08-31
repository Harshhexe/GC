import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  Easing as ReaEasing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { Avatar } from '../components/ui/Avatar';
import { GCButton } from '../components/ui/Buttons';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../hooks/useGroups';
import { supabase } from '../lib/supabase';
import { uploadUserAvatar } from '../lib/uploadAvatar';
import { WebCameraModal } from '../components/WebCameraModal';
import { supportsWebCamera } from '../lib/media';
import {
  USERNAME_COOLDOWN_DAYS,
  updateProfileIdentity,
  usernameCooldown,
} from '../lib/username';
import { selectFeedback, successFeedback, warningFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Stamped on every feedback report, and shown in the footer. */
const APP_VERSION = '1.0.0-alpha';

/** The floating top bar's own height, above the safe-area inset. */
const HEADER_HEIGHT = 56;

/** Where the big hero identity hands over to the compact header one. */
const HANDOVER_START = 130;
const HANDOVER_END = 200;

const AVATAR_SIZE = 112;
const RING_SIZE = 128;
/** Thickness of the aurora band drawn around the avatar. */
const RING_BAND = 3;
const HALO_SIZE = 152;

const FEEDBACK_MAX = 1000;

/**
 * The screen's atmosphere: a near-black base lit from the top by the same
 * indigo→rose pair the hero avatar spins, so the glow reads as coming *off*
 * the person rather than being wallpaper behind them.
 */
function AuroraBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdropRoot, style]} pointerEvents="none">
      <LinearGradient
        colors={['#100D1C', '#08070E', '#040306']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Overhead spotlight, centred on where the avatar sits. */}
      <LinearGradient
        colors={['rgba(129, 140, 248, 0.20)', 'rgba(236, 72, 153, 0.08)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backdropSpotlight}
      />

      <LinearGradient
        colors={['rgba(99, 102, 241, 0.12)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(236, 72, 153, 0.09)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.25, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Vignette — keeps the lower half from competing with the cards. */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.72)']}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * The hero avatar: a gradient band that slowly sweeps around the picture.
 *
 * The sweep is a *linear* gradient on an oversized square spun inside a
 * circular clip, not a conic gradient — React Native has no conic fill, and
 * this reads identically at ring thickness while staying one GPU transform.
 * The square is 1.5× the clip so its corners never rotate into view, and the
 * gradient's first and last stops match so each 360° lap loops seamlessly.
 */
function AuroraAvatar({
  emoji,
  imageUrl,
  label,
  uploading,
  onPress,
}: {
  emoji?: string;
  imageUrl?: string | null;
  label: string;
  uploading: boolean;
  onPress: () => void;
}) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(360, { duration: 7000, easing: ReaEasing.linear, reduceMotion }),
      -1,
      false
    );
  }, [spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  return (
    <PressableScale
      style={styles.avatarWrap}
      scaleTo={0.94}
      haptic="medium"
      onPress={onPress}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel="Edit profile picture, display name and username"
    >
      <View style={styles.avatarHalo} pointerEvents="none">
        <LinearGradient
          colors={['rgba(129, 140, 248, 0.30)', 'rgba(244, 114, 182, 0.12)', 'transparent']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.ringClip} pointerEvents="none">
        <Animated.View style={[styles.ringSweep, spinStyle]}>
          <LinearGradient
            colors={['#818CF8', '#F472B6', '#38BDF8', '#818CF8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={styles.ringHole} />
      </View>

      <Avatar
        emoji={emoji}
        imageUrl={imageUrl}
        label={label}
        size={AVATAR_SIZE}
        ring={false}
      />

      <View style={styles.cameraBadge}>
        {uploading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="camera" size={15} color="#FFFFFF" />
        )}
      </View>
    </PressableScale>
  );
}

/**
 * Counts a stat up to its value instead of snapping to it.
 *
 * Driven from JS rather than Reanimated because the thing being animated is
 * the *text*, not a style — and a number that ticks is the whole point, so
 * there is nothing to hand off to the UI thread. It re-targets mid-flight
 * (realtime pushes a new message count while the first tween is still
 * running) by tweening from wherever the display currently is.
 */
function useCountUp(target: number | null, ms = 850) {
  const [display, setDisplay] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (target === null) return;
    const from = current.current;
    if (from === target) return;

    let frame = 0;
    const start = Date.now();

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / ms);
      // Expo-out, matching the app's motion curve.
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
      current.current = value;
      setDisplay(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return target === null ? null : display;
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}) {
  return (
    <View style={styles.statCard} accessibilityLabel={`${value} ${label}`}>
      <LinearGradient
        colors={[`${accent}1A`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.statIcon, { backgroundColor: `${accent}22`, borderColor: `${accent}3D` }]}>
        <Ionicons name={icon} size={14} color={accent} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A bento tile. Quick actions used to be a stack of list rows, which made four
 * equally-weighted destinations read as a settings menu; as a grid they read
 * as places to go, which is what they are.
 */
function ActionTile({
  icon,
  accent,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      style={[styles.tile, { borderColor: `${accent}2E` }]}
      scaleTo={0.96}
      haptic="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <LinearGradient
        colors={[`${accent}1F`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.tileIcon, { backgroundColor: `${accent}24`, borderColor: `${accent}45` }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.tileCopy}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.tileSub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </PressableScale>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabelText} accessibilityRole="header">
        {text}
      </Text>
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.sectionRule}
      />
    </View>
  );
}

function SettingsRow({
  icon,
  accent,
  title,
  subtitle,
  onPress,
  tone = 'neutral',
  isLast,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger';
  isLast?: boolean;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      style={[styles.row, !isLast && styles.rowBorder, disabled && styles.rowDisabled]}
      scaleTo={0.98}
      haptic={tone === 'danger' ? 'medium' : 'light'}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${accent}1F`, borderColor: `${accent}3D` }]}>
        <Ionicons name={icon} size={19} color={accent} />
      </View>

      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, tone === 'danger' && { color: colors.error }]}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={17} color={colors.outline} />
    </PressableScale>
  );
}

export default function ProfileScreen({ navigation }: Props) {
  const { session, profile, signOut, refreshProfile } = useAuth();
  const { groups, refetch: refetchGroups } = useGroups({ realtime: true });
  const insets = useSafeAreaInsets();
  const [totalMessages, setTotalMessages] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [handleCopied, setHandleCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alpha Feedback State
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackFocused, setFeedbackFocused] = useState(false);
  const [feedbackPhoto, setFeedbackPhoto] = useState<{ uri: string; base64: string; ext: string } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [avatarChooserVisible, setAvatarChooserVisible] = useState(false);
  const [webCameraVisible, setWebCameraVisible] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Display name / username editor
  const [identityVisible, setIdentityVisible] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [draftUsername, setDraftUsername] = useState('');
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [savingIdentity, setSavingIdentity] = useState(false);

  const cooldown = usernameCooldown(profile?.username_changed_at);

  const displayName = profile?.display_name ?? 'Anonymous';
  const username = profile?.username ?? 'user';

  // The account's age comes off the auth user, not the profile row — the
  // profiles table has no created_at, and the two are made in the same
  // transaction anyway.
  const joined = useMemo(() => {
    const raw = session?.user?.created_at;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [session?.user?.created_at]);

  const daysIn = joined
    ? Math.max(1, Math.floor((Date.now() - joined.getTime()) / 86_400_000) + 1)
    : null;

  const groupsCount = useCountUp(groups.length);
  const messagesCount = useCountUp(totalMessages);
  const daysCount = useCountUp(daysIn);

  // ── Scroll choreography ───────────────────────────────────────────────
  // One shared value drives both the hero's parallax and the header's
  // cross-fade, so the big identity and the compact one are always exactly
  // out of phase rather than each animating to its own clock.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Depth comes from drifting the *backdrop*, never the hero itself. A hero
  // that lags the scroll has to move down the page to do it, and there are
  // only 24px of gap beneath it before it collides with the stats row — so
  // the parallax lives on the one layer that is absolutely positioned and
  // cannot push anything around.
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, 500], [0, -70], Extrapolation.CLAMP) },
    ],
  }));

  const heroStyle = useAnimatedStyle(() => ({
    // Overscroll (pull-to-refresh) blooms the hero instead of leaving a gap.
    // Clamped at 1 for downward scroll, so it never grows into the row below.
    transform: [{ scale: interpolate(scrollY.value, [-150, 0], [1.06, 1], Extrapolation.CLAMP) }],
  }));

  const headerTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 70], [1, 0], Extrapolation.CLAMP),
  }));

  const headerIdentityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HANDOVER_START, HANDOVER_END], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [HANDOVER_START, HANDOVER_END],
          [10, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const headerChromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [30, 110], [0, 1], Extrapolation.CLAMP),
  }));

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function copyHandle() {
    if (!profile?.username) return;
    await Clipboard.setStringAsync(`@${profile.username}`);
    successFeedback();
    setHandleCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setHandleCopied(false), 1800);
  }

  /** One entry point for the whole profile: picture, display name, username. */
  function openEditProfile() {
    selectFeedback();
    setDraftDisplayName(profile?.display_name ?? '');
    setDraftUsername(profile?.username ?? '');
    setIdentityError(null);
    setIdentityVisible(true);
  }

  async function handleSaveIdentity() {
    if (!profile?.id) return;

    const nextDisplayName = draftDisplayName.trim();
    const nextUsername = draftUsername.trim();
    if (!nextDisplayName) {
      setIdentityError('Your display name can’t be empty.');
      return;
    }

    // Only send what actually changed — an unchanged username must never be
    // included, or a display-name edit would burn the 30-day allowance.
    const changes: { displayName?: string; username?: string } = {};
    if (nextDisplayName !== profile.display_name) changes.displayName = nextDisplayName;
    if (nextUsername !== profile.username) changes.username = nextUsername;

    if (!changes.displayName && !changes.username) {
      setIdentityVisible(false);
      return;
    }
    if (changes.username && !cooldown.canChange) {
      setIdentityError(
        `You can change your username again on ${cooldown.nextAllowedAt?.toLocaleDateString()}.`
      );
      return;
    }

    setSavingIdentity(true);
    setIdentityError(null);
    const message = await updateProfileIdentity(profile.id, changes);
    setSavingIdentity(false);

    if (message) {
      setIdentityError(message);
      return;
    }

    await refreshProfile();
    successFeedback();
    setIdentityVisible(false);
  }

  async function handleChangeAvatar() {
    selectFeedback();
    if (Platform.OS === 'web') {
      // Alert.alert has no multi-button form on web, so the choice between the
      // webcam and the file picker needs its own sheet. Without a webcam
      // there's nothing to choose between and the library opens directly.
      if (supportsWebCamera()) {
        setAvatarChooserVisible(true);
      } else {
        choosePhotoFromLibrary();
      }
      return;
    }

    Alert.alert('Profile Picture', 'Choose how you want to update your profile photo', [
      { text: 'Choose from Library', onPress: choosePhotoFromLibrary },
      { text: 'Take Photo', onPress: takePhotoWithCamera },
      ...(profile?.avatar_url
        ? [
            {
              text: 'Remove Photo',
              style: 'destructive' as const,
              onPress: removeAvatarPhoto,
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function choosePhotoFromLibrary() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos to set a profile picture.');
        return;
      }
      selectFeedback();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0] || !profile?.id) return;
      await uploadAndSaveAvatar(result.assets[0]);
    } catch (e: any) {
      Alert.alert('Photo Picker', e?.message || 'Could not pick photo.');
    }
  }

  async function takePhotoWithCamera() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to take a profile picture.');
        return;
      }
      selectFeedback();
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0] || !profile?.id) return;
      await uploadAndSaveAvatar(result.assets[0]);
    } catch (e: any) {
      Alert.alert('Camera', e?.message || 'Could not take photo.');
    }
  }

  async function uploadAndSaveAvatar(asset: ImagePicker.ImagePickerAsset) {
    // A webcam capture arrives as a data: URL, whose "extension" is the tail of
    // the base64 payload — so the extension is taken from the mime type there.
    const ext = asset.uri.startsWith('data:')
      ? (asset.mimeType?.split('/')[1] ?? 'jpg')
      : asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    await uploadAvatarBase64(asset.base64 ?? null, ext);
  }

  async function uploadAvatarBase64(base64: string | null, ext: string) {
    if (!profile?.id || !base64) return;
    setUploadingAvatar(true);
    try {
      const { url, error } = await uploadUserAvatar(base64, profile.id, ext);
      if (error || !url) {
        throw new Error(error || 'Failed to upload photo.');
      }
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', profile.id);
      if (dbError) throw dbError;

      await refreshProfile();
      successFeedback();
      Alert.alert('Profile Photo Updated! ✨', 'Your new profile picture is now live across all your groups.');
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message || 'Could not save profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatarPhoto() {
    if (!profile?.id) return;
    setUploadingAvatar(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      successFeedback();
      Alert.alert('Photo Removed', 'Your avatar has been reset to your emoji profile.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not remove photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  const loadCount = useCallback(async () => {
    if (!profile?.id) return;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profile.id);
    setTotalMessages(count ?? 0);
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadCount();
      refetchGroups();
    }, [loadCount, refetchGroups])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCount(), refetchGroups(), refreshProfile()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCount, refetchGroups, refreshProfile]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`profile-hype-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `author_id=eq.${profile.id}`,
        },
        () => {
          loadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, loadCount]);

  async function pickFeedbackImage() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos to attach a screenshot.');
        return;
      }
      selectFeedback();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      setFeedbackPhoto({ uri: asset.uri, base64: asset.base64 ?? '', ext });
      successFeedback();
    } catch (e) {
      console.warn('Failed to pick photo:', e);
    }
  }

  async function submitFeedback() {
    if (!feedbackText.trim() && !feedbackPhoto) {
      warningFeedback();
      Alert.alert('Empty Feedback', 'Please describe the bug or share your thoughts before submitting.');
      return;
    }

    setSubmittingFeedback(true);
    try {
      let photoUrl: string | null = null;
      if (feedbackPhoto?.base64 && profile?.id) {
        const { url, error: uploadErr } = await uploadUserAvatar(feedbackPhoto.base64, profile.id, feedbackPhoto.ext);
        if (!uploadErr && url) {
          photoUrl = url;
        }
      }

      const { error } = await supabase.from('app_feedback').insert({
        user_id: profile?.id ?? null,
        message: feedbackText.trim() || '(Screenshot attached)',
        photo_url: photoUrl,
        app_version: APP_VERSION,
        platform: Platform.OS,
      });

      if (error) {
        Alert.alert('Could not submit', error.message);
        return;
      }

      // Forward directly to developer's inbox (hdhiman0302@gmail.com)
      try {
        await fetch('https://formsubmit.co/ajax/hdhiman0302@gmail.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            _subject: `🧪 GC Alpha Feedback from @${profile?.username ?? 'user'}`,
            _template: 'table',
            User: `@${profile?.username ?? 'user'} (${profile?.display_name ?? 'Anonymous'})`,
            UserId: profile?.id ?? 'Unknown',
            Platform: Platform.OS.toUpperCase(),
            AppVersion: APP_VERSION,
            Feedback: feedbackText.trim() || '(Screenshot only)',
            Screenshot: photoUrl ?? 'No screenshot attached',
            SubmittedAt: new Date().toLocaleString(),
          }),
        });
      } catch (emailErr) {
        // Non-blocking: data is already safe in database
        console.log('Email forward notice:', emailErr);
      }

      successFeedback();
      setFeedbackText('');
      setFeedbackPhoto(null);
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 5000);
      Alert.alert(
        'Feedback Sent! 💜',
        'Thank you for testing GC! Your feedback and screenshot have been sent directly to the team.'
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      signOut();
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  async function checkForUpdates() {
    try {
      const Updates = await import('expo-updates');
      if (!Updates.isEnabled || __DEV__) {
        Alert.alert('GC Updates', 'Running in local development mode. OTA updates are active on release builds.');
        return;
      }
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        Alert.alert('Update Found! 🚀', 'Downloading the latest version of GC and restarting...', [
          {
            text: 'Update Now',
            onPress: async () => {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            },
          },
        ]);
      } else {
        Alert.alert('Up to Date ✨', 'You are on the latest version of GC.');
      }
    } catch (e: any) {
      Alert.alert('Update Check', e?.message || 'Could not check for updates right now.');
    }
  }

  async function doDeleteAccount() {
    setDeleting(true);
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      setDeleting(false);
      const msg = error.message.toLowerCase().includes('signed in')
        ? "Couldn't verify your session — try signing in again first."
        : `Something went wrong: ${error.message}`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Account not deleted', msg);
      return;
    }
    await signOut();
  }

  function confirmDeleteAccount() {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete your account? This removes your profile everywhere and cannot be undone.')) {
        return;
      }
      doDeleteAccount();
      return;
    }
    Alert.alert(
      'Delete Account Permanently',
      'This will permanently delete your account, your messages, and your profile. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Permanently', style: 'destructive', onPress: doDeleteAccount },
      ]
    );
  }

  const headerOffset = insets.top + HEADER_HEIGHT;

  return (
    <View style={styles.root}>
      <AuroraBackdrop style={backdropStyle} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingTop: headerOffset + spacing.md }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
            progressViewOffset={headerOffset}
          />
        }
      >
        {/* 1. Hero identity */}
        <Animated.View
          entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
        >
          <Animated.View style={[styles.hero, heroStyle]}>
            <AuroraAvatar
              emoji={profile?.avatar_emoji ?? undefined}
              imageUrl={profile?.avatar_url}
              label={displayName}
              uploading={uploadingAvatar}
              onPress={openEditProfile}
            />

            <Text style={styles.displayName} numberOfLines={2}>
              {displayName}
            </Text>

            <PressableScale
              style={styles.handleChip}
              scaleTo={0.94}
              haptic="light"
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              onPress={copyHandle}
              accessibilityRole="button"
              accessibilityLabel={handleCopied ? 'Username copied' : `Copy username @${username}`}
            >
              <Text style={[styles.handleText, handleCopied && styles.handleTextCopied]}>
                {handleCopied ? 'Copied!' : `@${username}`}
              </Text>
              <Ionicons
                name={handleCopied ? 'checkmark-circle' : 'copy-outline'}
                size={13}
                color={handleCopied ? colors.green : colors.onSurfaceVariant}
              />
            </PressableScale>

            <View style={styles.heroMetaRow}>
              <View style={styles.alphaChip}>
                <Ionicons name="flask" size={11} color="#C084FC" />
                <Text style={styles.alphaChipText}>ALPHA TESTER</Text>
              </View>
              {!!joined && (
                <Text style={styles.heroMeta}>
                  Joined {joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </Text>
              )}
            </View>

            <PressableScale
              scaleTo={0.96}
              haptic="light"
              onPress={openEditProfile}
              disabled={uploadingAvatar}
              style={styles.editProfileBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit profile: picture, display name and username"
            >
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.editProfileGradient}
              >
                <Ionicons name="create-outline" size={16} color="#FFFFFF" />
                <Text style={styles.editProfileText}>
                  {uploadingAvatar ? 'Uploading…' : 'Edit Profile'}
                </Text>
              </LinearGradient>
            </PressableScale>
          </Animated.View>
        </Animated.View>

        {/* 2. Stats */}
        <Animated.View
          entering={FadeInDown.delay(STAGGER_MS)
            .duration(duration.slow)
            .easing(easing.out)
            .reduceMotion(reduceMotion)}
          style={styles.statsRow}
        >
          <StatCard label="Active GCs" value={String(groupsCount ?? 0)} icon="chatbubbles" accent="#818CF8" />
          <StatCard
            label="Messages"
            value={messagesCount === null ? '—' : String(messagesCount)}
            icon="sparkles"
            accent="#F472B6"
          />
          <StatCard
            label="Days in"
            value={daysCount === null ? '—' : String(daysCount)}
            icon="flame"
            accent="#38BDF8"
          />
        </Animated.View>

        {/* 3. Quick actions */}
        <Animated.View
          entering={FadeInDown.delay(STAGGER_MS * 2)
            .duration(duration.slow)
            .easing(easing.out)
            .reduceMotion(reduceMotion)}
          style={styles.section}
        >
          <SectionLabel text="QUICK ACTIONS" />

          <View style={styles.bentoRow}>
            <ActionTile
              icon="people"
              accent="#818CF8"
              title="All Chats"
              subtitle="Every GC and unread badge"
              onPress={() => navigation.navigate('GroupList')}
            />
            <ActionTile
              icon="trophy"
              accent="#F59E0B"
              title="Awards"
              subtitle="Leaderboards & weekly highlights"
              onPress={() => navigation.navigate('Explore')}
            />
          </View>

          <View style={styles.bentoRow}>
            <ActionTile
              icon="add-circle"
              accent="#22D3EE"
              title="New GC"
              subtitle="Create one or enter an invite code"
              onPress={() => navigation.navigate('AddGC')}
            />
            <ActionTile
              icon="sparkles"
              accent="#A855F7"
              title="App Tour"
              subtitle="@gc AI, Tea, 11:11, Awards & Polls"
              onPress={() => navigation.navigate('Welcome')}
            />
          </View>
        </Animated.View>

        {/* 4. Alpha feedback */}
        <Animated.View
          entering={FadeInDown.delay(STAGGER_MS * 3)
            .duration(duration.slow)
            .easing(easing.out)
            .reduceMotion(reduceMotion)}
          style={styles.section}
        >
          <SectionLabel text="ALPHA FEEDBACK" />

          <GlassPanel borderRadius={radius.lg} style={styles.feedbackCard}>
            <View style={styles.feedbackHead}>
              <View style={styles.feedbackHeadIcon}>
                <Ionicons name="bug" size={17} color="#C084FC" />
              </View>
              <View style={styles.feedbackHeadCopy}>
                <Text style={styles.feedbackTitle}>Report a bug or idea</Text>
                <Text style={styles.feedbackSub}>
                  Tell us what broke or what you'd love to see next — it goes straight to the team.
                </Text>
              </View>
            </View>

            <View style={[styles.feedbackInputWrap, feedbackFocused && styles.feedbackInputWrapFocused]}>
              <TextInput
                value={feedbackText}
                onChangeText={setFeedbackText}
                onFocus={() => setFeedbackFocused(true)}
                onBlur={() => setFeedbackFocused(false)}
                placeholder="Describe what happened, or share an idea…"
                placeholderTextColor={colors.outline}
                style={styles.feedbackInput}
                multiline
                numberOfLines={4}
                maxLength={FEEDBACK_MAX}
                textAlignVertical="top"
                accessibilityLabel="Feedback message"
              />
              <Text
                style={[
                  styles.feedbackCounter,
                  feedbackText.length > FEEDBACK_MAX * 0.9 && styles.feedbackCounterWarn,
                ]}
              >
                {feedbackText.length}/{FEEDBACK_MAX}
              </Text>
            </View>

            {feedbackPhoto ? (
              <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.photoRow}>
                <View style={styles.photoThumbWrap}>
                  <Image source={{ uri: feedbackPhoto.uri }} style={styles.photoThumb} />
                  <PressableScale
                    style={styles.photoRemoveBtn}
                    scaleTo={0.88}
                    hitSlop={10}
                    onPress={() => setFeedbackPhoto(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attached screenshot"
                  >
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </PressableScale>
                </View>
                <View style={styles.photoCopy}>
                  <Text style={styles.photoTitle}>Screenshot attached</Text>
                  <Text style={styles.photoSub}>Sent along with your report</Text>
                </View>
              </Animated.View>
            ) : (
              <PressableScale
                style={styles.attachBtn}
                scaleTo={0.97}
                haptic="light"
                onPress={pickFeedbackImage}
                accessibilityRole="button"
                accessibilityLabel="Attach a screenshot or photo, optional"
              >
                <Ionicons name="image-outline" size={17} color={colors.primary} />
                <Text style={styles.attachText}>Attach screenshot (optional)</Text>
              </PressableScale>
            )}

            {feedbackSent && (
              <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.sentBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={styles.sentText}>Feedback received. Thanks for testing GC 💜</Text>
              </Animated.View>
            )}

            <GCButton
              label={submittingFeedback ? 'Sending…' : 'Send Feedback'}
              variant="gradient"
              neo
              disabled={submittingFeedback || (!feedbackText.trim() && !feedbackPhoto)}
              onPress={submitFeedback}
              icon={<Ionicons name="send" size={15} color="#FFFFFF" />}
            />
          </GlassPanel>
        </Animated.View>

        {/* 5. Account */}
        <Animated.View
          entering={FadeInDown.delay(STAGGER_MS * 4)
            .duration(duration.slow)
            .easing(easing.out)
            .reduceMotion(reduceMotion)}
          style={styles.section}
        >
          <SectionLabel text="ACCOUNT" />

          <GlassPanel borderRadius={radius.lg} style={styles.listCard}>
            <SettingsRow
              icon="cloud-download-outline"
              accent="#818CF8"
              title="Check for updates"
              subtitle={`You're on ${APP_VERSION}`}
              onPress={checkForUpdates}
            />
            <SettingsRow
              icon="log-out-outline"
              accent="#F87171"
              title="Sign out"
              subtitle="You'll need your password to get back in"
              tone="danger"
              onPress={confirmSignOut}
              isLast
            />
          </GlassPanel>

          <PressableScale
            style={styles.deleteBtn}
            scaleTo={0.97}
            disabled={deleting}
            onPress={confirmDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete account permanently"
            accessibilityState={{ disabled: deleting }}
          >
            <Ionicons name="trash-outline" size={14} color={colors.outline} />
            <Text style={styles.deleteText}>
              {deleting ? 'Deleting account…' : 'Delete account permanently'}
            </Text>
          </PressableScale>

          <Text style={styles.footer}>GC · {APP_VERSION} · {Platform.OS}</Text>
        </Animated.View>
      </Animated.ScrollView>

      {/* Floating top bar. Sits above the scroll so the hero passes under a
          frosted pane, and swaps "Profile" for the person's own identity at
          exactly the point the hero one leaves the screen. */}
      <View style={[styles.headerWrap, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerChromeStyle]} pointerEvents="none">
          {Platform.OS !== 'web' && (
            <BlurView
              intensity={40}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.headerChromeFill} />
          <View style={styles.headerHairline} />
        </Animated.View>

        <View style={styles.headerBar} pointerEvents="box-none">
          <Animated.Text
            style={[styles.headerTitle, headerTitleStyle]}
            numberOfLines={1}
            pointerEvents="none"
          >
            Profile
          </Animated.Text>

          <Animated.View style={[styles.headerIdentity, headerIdentityStyle]} pointerEvents="none">
            <Avatar
              emoji={profile?.avatar_emoji ?? undefined}
              imageUrl={profile?.avatar_url}
              label={displayName}
              size={30}
              ringColors={['#818CF8', '#F472B6']}
            />
            <View style={styles.headerIdentityCopy}>
              <Text style={styles.headerIdentityName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.headerIdentityHandle} numberOfLines={1}>
                @{username}
              </Text>
            </View>
          </Animated.View>
        </View>
      </View>

      <Modal
        visible={identityVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIdentityVisible(false)}
      >
        {/* The sheet now carries an avatar row on top of two labelled fields,
            which on a 375×667 phone with the keyboard up is taller than the
            screen — hence the avoider plus an inner scroll. */}
        <KeyboardAvoidingView
          style={styles.chooserBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.identityScroll}
            contentContainerStyle={styles.identityScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.identityCard}>
            <LinearGradient
              colors={['rgba(129,140,248,0.16)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.identityCardGlow}
              pointerEvents="none"
            />
            <Text style={styles.identityTitle} accessibilityRole="header">
              Edit profile
            </Text>

            {/* Picture lives in the same dialog as the names: changing "my
                profile" is one intent, and splitting it across two flows meant
                two round trips to change two things about yourself. */}
            <View style={styles.editAvatarRow}>
              <PressableScale
                scaleTo={0.94}
                haptic="medium"
                onPress={handleChangeAvatar}
                disabled={uploadingAvatar || savingIdentity}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture"
              >
                <Avatar
                  emoji={profile?.avatar_emoji ?? undefined}
                  imageUrl={profile?.avatar_url}
                  label={displayName}
                  size={68}
                  ring
                  ringColors={['#818CF8', '#C084FC', '#F472B6']}
                />
                <View style={styles.editAvatarBadgeSm}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera" size={12} color="#FFFFFF" />
                  )}
                </View>
              </PressableScale>

              <View style={styles.editAvatarActions}>
                <PressableScale
                  style={styles.editAvatarBtn}
                  disabled={uploadingAvatar || savingIdentity}
                  onPress={handleChangeAvatar}
                  accessibilityRole="button"
                >
                  <Ionicons name="image-outline" size={14} color={colors.onSurface} />
                  <Text style={styles.editAvatarBtnText}>
                    {profile?.avatar_url ? 'Change photo' : 'Add photo'}
                  </Text>
                </PressableScale>

                {!!profile?.avatar_url && (
                  <PressableScale
                    style={styles.editAvatarBtn}
                    disabled={uploadingAvatar || savingIdentity}
                    onPress={removeAvatarPhoto}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={[styles.editAvatarBtnText, { color: colors.error }]}>
                      Remove
                    </Text>
                  </PressableScale>
                )}
              </View>
            </View>

            <View style={styles.identityDivider} />

            <Text style={styles.identityLabel}>Display name</Text>
            <TextInput
              style={styles.identityInput}
              value={draftDisplayName}
              onChangeText={setDraftDisplayName}
              placeholder="Your name"
              placeholderTextColor={colors.textFaint}
              maxLength={40}
              autoCapitalize="words"
              editable={!savingIdentity}
            />
            <Text style={styles.identityHint}>Change this as often as you like.</Text>

            <Text style={[styles.identityLabel, { marginTop: spacing.md }]}>Username</Text>
            <View style={styles.identityInputRow}>
              <Text style={styles.identityPrefix}>@</Text>
              <TextInput
                style={[styles.identityInput, styles.identityInputFlex]}
                value={draftUsername}
                onChangeText={setDraftUsername}
                placeholder="username"
                placeholderTextColor={colors.textFaint}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingIdentity && cooldown.canChange}
              />
            </View>
            <Text style={styles.identityHint}>
              {cooldown.canChange
                ? `You can only change your username once every ${USERNAME_COOLDOWN_DAYS} days.`
                : `Locked for ${cooldown.daysRemaining} more ${
                    cooldown.daysRemaining === 1 ? 'day' : 'days'
                  } — next change on ${cooldown.nextAllowedAt?.toLocaleDateString()}.`}
            </Text>

            {!!identityError && <Text style={styles.identityError}>{identityError}</Text>}

            <View style={styles.identityActions}>
              <PressableScale
                style={styles.identityCancel}
                disabled={savingIdentity}
                onPress={() => setIdentityVisible(false)}
              >
                <Text style={styles.chooserCancelText}>Cancel</Text>
              </PressableScale>
              <PressableScale
                style={[styles.identitySave, savingIdentity && { opacity: 0.6 }]}
                haptic="medium"
                disabled={savingIdentity}
                onPress={handleSaveIdentity}
              >
                <LinearGradient
                  colors={gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.identitySaveFill}
                >
                  {savingIdentity ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.identitySaveText}>Save</Text>
                  )}
                </LinearGradient>
              </PressableScale>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Web-only avatar source chooser (see handleChangeAvatar). */}
      <Modal
        visible={avatarChooserVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarChooserVisible(false)}
      >
        <View style={styles.chooserBackdrop}>
          <View style={styles.chooserCard}>
            <Text style={styles.chooserTitle}>Profile picture</Text>

            <PressableScale
              style={styles.chooserRow}
              onPress={() => {
                setAvatarChooserVisible(false);
                setTimeout(() => setWebCameraVisible(true), 50);
              }}
            >
              <Ionicons name="camera-outline" size={18} color={colors.onSurface} />
              <Text style={styles.chooserRowText}>Take photo</Text>
            </PressableScale>

            <PressableScale
              style={styles.chooserRow}
              onPress={() => {
                setAvatarChooserVisible(false);
                choosePhotoFromLibrary();
              }}
            >
              <Ionicons name="images-outline" size={18} color={colors.onSurface} />
              <Text style={styles.chooserRowText}>Choose from library</Text>
            </PressableScale>

            {!!profile?.avatar_url && (
              <PressableScale
                style={styles.chooserRow}
                onPress={() => {
                  setAvatarChooserVisible(false);
                  removeAvatarPhoto();
                }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.chooserRowText, { color: colors.error }]}>Remove photo</Text>
              </PressableScale>
            )}

            <PressableScale
              style={styles.chooserCancel}
              onPress={() => setAvatarChooserVisible(false)}
            >
              <Text style={styles.chooserCancelText}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>

      <WebCameraModal
        visible={webCameraVisible}
        onClose={() => setWebCameraVisible(false)}
        onCapture={(result) => {
          if (result.error || !result.attachment) {
            Alert.alert('Camera', result.error ?? 'Could not take photo.');
            return;
          }
          uploadAvatarBase64(result.attachment.base64, 'jpg');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appChrome },
  scroll: {
    paddingHorizontal: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.xl,
  },

  // ── Backdrop ──────────────────────────────────────────────────────────
  // Taller than the screen so translating it up never uncovers the root.
  backdropRoot: { bottom: -110, backgroundColor: colors.appChrome, overflow: 'hidden' },
  backdropSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 520 },

  // ── Floating header ───────────────────────────────────────────────────
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerChromeFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Platform.OS === 'web' ? 'rgba(10, 9, 18, 0.86)' : 'rgba(10, 9, 18, 0.55)',
  },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerBar: {
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  headerTitle: {
    ...typography.title,
    color: colors.onSurface,
    textAlign: 'center',
  },
  headerIdentity: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  headerIdentityCopy: { maxWidth: 190 },
  headerIdentityName: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  headerIdentityHandle: {
    ...typography.micro,
    fontSize: 11,
    color: colors.textMuted,
  },

  // ── Hero ──────────────────────────────────────────────────────────────
  hero: { alignItems: 'center', gap: spacing.sm },
  avatarWrap: {
    width: HALO_SIZE,
    height: HALO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHalo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    overflow: 'hidden',
  },
  ringClip: {
    position: 'absolute',
    top: (HALO_SIZE - RING_SIZE) / 2,
    left: (HALO_SIZE - RING_SIZE) / 2,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    overflow: 'hidden',
  },
  // 1.5× the clip so the rotating square's corners never swing into view.
  ringSweep: {
    position: 'absolute',
    top: -RING_SIZE * 0.25,
    left: -RING_SIZE * 0.25,
    width: RING_SIZE * 1.5,
    height: RING_SIZE * 1.5,
  },
  ringHole: {
    position: 'absolute',
    top: RING_BAND,
    left: RING_BAND,
    width: RING_SIZE - RING_BAND * 2,
    height: RING_SIZE - RING_BAND * 2,
    borderRadius: (RING_SIZE - RING_BAND * 2) / 2,
    backgroundColor: '#0B0A12',
  },
  cameraBadge: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryContainer,
    borderWidth: 2,
    borderColor: '#0B0A12',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  displayName: {
    ...typography.headline,
    fontSize: 32,
    lineHeight: 38,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  handleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  handleText: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  handleTextCopied: { color: colors.green },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  alphaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  alphaChipText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: '#C084FC',
  },
  heroMeta: { ...typography.micro, fontSize: 12, color: colors.textMuted },
  editProfileBtn: { marginTop: spacing.sm, borderRadius: radius.pill },
  editProfileGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
  },
  editProfileText: { ...typography.label, fontSize: 15, color: '#FFFFFF', fontWeight: '700' },

  // ── Stats ─────────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    overflow: 'hidden',
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    ...typography.title,
    fontSize: 22,
    color: '#FFFFFF',
  },
  statLabel: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // ── Sections ──────────────────────────────────────────────────────────
  section: { gap: spacing.md },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionLabelText: {
    ...typography.label,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.onSurfaceVariant,
  },
  sectionRule: { flex: 1, height: 1, borderRadius: 1 },

  // ── Bento tiles ───────────────────────────────────────────────────────
  bentoRow: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    minHeight: 132,
    padding: spacing.lg - 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCopy: { gap: 3 },
  tileTitle: {
    ...typography.bodyMedium,
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tileSub: {
    ...typography.micro,
    fontSize: 11.5,
    lineHeight: 15,
    color: colors.textMuted,
  },

  // ── Feedback ──────────────────────────────────────────────────────────
  feedbackCard: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.25)',
  },
  feedbackHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  feedbackHeadIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.32)',
  },
  feedbackHeadCopy: { flex: 1, gap: 3 },
  feedbackTitle: {
    ...typography.titleMd,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  feedbackSub: {
    ...typography.caption,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textMuted,
  },
  feedbackInputWrap: {
    backgroundColor: glass.inputFill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.md,
    minHeight: 108,
  },
  feedbackInputWrapFocused: {
    borderColor: 'rgba(168, 85, 247, 0.55)',
    backgroundColor: 'rgba(168, 85, 247, 0.06)',
  },
  feedbackInput: {
    fontFamily: fontFamily.body,
    fontSize: 14.5,
    lineHeight: 20,
    color: '#FFFFFF',
    minHeight: 68,
    padding: 0,
    margin: 0,
  },
  feedbackCounter: {
    ...typography.micro,
    fontSize: 10.5,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  feedbackCounterWarn: { color: colors.yellow },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(129, 140, 248, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  attachText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13.5,
    color: colors.primary,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.sm + 2,
  },
  photoThumbWrap: { position: 'relative' },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#0F172A',
    borderRadius: 10,
  },
  photoCopy: { flex: 1, gap: 2 },
  photoTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13.5,
    color: '#FFFFFF',
  },
  photoSub: { ...typography.micro, fontSize: 11.5, color: colors.textMuted },
  sentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sentText: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#34D399',
    flex: 1,
  },

  // ── Account list ──────────────────────────────────────────────────────
  listCard: {
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowDisabled: { opacity: 0.5 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rowSub: { ...typography.micro, fontSize: 12, color: colors.textMuted },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  deleteText: {
    ...typography.micro,
    fontSize: 12,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  footer: {
    ...typography.micro,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // ── Edit-profile dialog ───────────────────────────────────────────────
  editAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  editAvatarActions: { flex: 1, gap: spacing.sm },
  editAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  editAvatarBtnText: { ...typography.label, fontSize: 13, color: colors.onSurface },
  editAvatarBadgeSm: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  identityDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  identityScroll: { flexGrow: 0, width: '100%' },
  identityScrollContent: { alignItems: 'center', justifyContent: 'center' },
  identityCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderBright,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  identityCardGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  identityTitle: {
    ...typography.headline,
    fontSize: 20,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  identityLabel: {
    ...typography.label,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs + 2,
  },
  identityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  identityPrefix: {
    ...typography.label,
    fontSize: 16,
    color: colors.onSurfaceVariant,
  },
  identityInputFlex: { flex: 1 },
  identityInput: {
    ...typography.body,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: glass.inputFill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  identityHint: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: spacing.xs + 2,
  },
  identityError: {
    ...typography.caption,
    fontSize: 12,
    color: colors.error,
    marginTop: spacing.md,
  },
  identityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  identityCancel: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  identitySave: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  identitySaveFill: {
    minWidth: 100,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  identitySaveText: { ...typography.label, color: '#FFFFFF', fontSize: 14 },
  chooserBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  chooserCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  chooserTitle: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    fontSize: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chooserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  chooserRowText: { ...typography.label, color: colors.onSurface, fontSize: 14 },
  chooserCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  chooserCancelText: { ...typography.label, color: colors.onSurfaceVariant, fontSize: 13 },
});
