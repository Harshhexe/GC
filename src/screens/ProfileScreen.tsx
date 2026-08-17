import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
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
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { AppHeader } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { GCButton } from '../components/ui/Buttons';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../hooks/useGroups';
import { supabase } from '../lib/supabase';
import { uploadUserAvatar } from '../lib/uploadAvatar';
import { selectFeedback, successFeedback, warningFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Deep moody atmospheric glow background with high blur intensity */
function DarkAtmosphericBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.glowBgRoot]} pointerEvents="none">
      {/* Deep Obsidian Dark Base */}
      <LinearGradient
        colors={['#050409', '#020204', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Subtle Violet Spotlight */}
      <LinearGradient
        colors={['rgba(99, 102, 241, 0.12)', 'rgba(236, 72, 153, 0.05)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.60 }}
        style={styles.topSpotlight}
      />

      {/* Corner Glowing Mesh Blobs (Soft & Dark) */}
      <View style={[styles.cornerBlob, styles.blobTopLeft]}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobTopRight]}>
        <LinearGradient
          colors={['#EC4899', '#F43F5E', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomLeft]}>
        <LinearGradient
          colors={['#8B5CF6', '#3B82F6', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <View style={[styles.cornerBlob, styles.blobBottomRight]}>
        <LinearGradient
          colors={['#F59E0B', '#EC4899', 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.blobFill}
        />
      </View>

      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 95}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />

      {/* Dark Vignette Overlay */}
      <LinearGradient
        colors={['rgba(99, 102, 241, 0.05)', 'transparent', 'rgba(0, 0, 0, 0.70)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
  accentColor,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIconWrap, { backgroundColor: `${accentColor}18` }]}>
        <Ionicons name={icon} size={15} color={accentColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingsMenuItem({
  icon,
  accentColor,
  title,
  subtitle,
  onPress,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <PressableScale
      style={[styles.menuItem, !isLast && styles.menuItemBorder]}
      scaleTo={0.97}
      haptic="light"
      onPress={onPress}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: `${accentColor}18` }]}>
        <Ionicons name={icon} size={20} color={accentColor} />
      </View>

      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#64748B" />
    </PressableScale>
  );
}

export default function ProfileScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const { groups, refetch: refetchGroups } = useGroups({ realtime: true });
  const [totalMessages, setTotalMessages] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Alpha Feedback State
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackPhoto, setFeedbackPhoto] = useState<{ uri: string; base64: string; ext: string } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

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
        app_version: '1.0.0-alpha',
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
            AppVersion: '1.0.0-alpha',
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

  return (
    <View style={styles.root}>
      <DarkAtmosphericBackground />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader title="Settings" />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. Hero Profile Card */}
          <Animated.View
            entering={FadeInDown.duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
          >
            <GlassPanel borderRadius={radius.xl} style={styles.profileCard}>
              <Avatar
                emoji={profile?.avatar_emoji ?? undefined}
                imageUrl={profile?.avatar_url}
                label={profile?.display_name ?? 'You'}
                size={84}
                ring={true}
                ringColors={['#818CF8', '#C084FC', '#F472B6']}
              />

              <View style={styles.profileInfo}>
                <Text style={styles.displayName}>{profile?.display_name ?? 'Anonymous'}</Text>
                <Text style={styles.handle}>@{profile?.username ?? 'user'}</Text>
              </View>

              <View style={styles.statsRow}>
                <StatTile
                  label="Active GCs"
                  value={String(groups.length)}
                  icon="chatbubbles"
                  accentColor="#6366F1"
                />
                <View style={styles.statDivider} />
                <StatTile
                  label="Messages"
                  value={totalMessages !== null ? String(totalMessages) : '...'}
                  icon="sparkles"
                  accentColor="#EC4899"
                />
                <View style={styles.statDivider} />
                <StatTile
                  label="Status"
                  value="Alpha"
                  icon="shield-checkmark"
                  accentColor="#10B981"
                />
              </View>
            </GlassPanel>
          </Animated.View>

          {/* 2. Quick Navigation Shortcuts */}
          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.sectionWrap}
          >
            <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
            <GlassPanel borderRadius={radius.lg} style={styles.menuCard}>
              <SettingsMenuItem
                icon="people-outline"
                accentColor="#818CF8"
                title="All Group Chats"
                subtitle="Browse active conversations & unread badges"
                onPress={() => navigation.navigate('GroupList')}
              />
              <SettingsMenuItem
                icon="trophy-outline"
                accentColor="#F59E0B"
                title="Awards & Achievements"
                subtitle="Leaderboards and weekly GC highlights"
                onPress={() => navigation.navigate('Explore')}
              />
              <SettingsMenuItem
                icon="add-circle-outline"
                accentColor="#22D3EE"
                title="Create or Join Group"
                subtitle="Start a fresh GC or enter an invite code"
                onPress={() => navigation.navigate('AddGC')}
                isLast
              />
            </GlassPanel>
          </Animated.View>

          {/* 3. Alpha Feedback Form (Replaced Session ID) */}
          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 2)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.sectionWrap}
          >
            <View style={styles.feedbackSectionHeader}>
              <View style={styles.alphaPill}>
                <Ionicons name="flask" size={12} color="#A855F7" />
                <Text style={styles.alphaPillText}>ALPHA TEST FEEDBACK</Text>
              </View>
            </View>

            <GlassPanel borderRadius={radius.lg} style={styles.feedbackCard}>
              <View style={styles.feedbackIntro}>
                <Text style={styles.feedbackTitle}>Report a Bug or Suggestion</Text>
                <Text style={styles.feedbackSub}>
                  Help shape the future of GC! Let us know what broke or what you'd love to see next.
                </Text>
              </View>

              {/* Text Input */}
              <View style={styles.feedbackInputContainer}>
                <TextInput
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder="Describe what happened, or share an idea..."
                  placeholderTextColor="#64748B"
                  style={styles.feedbackInput}
                  multiline
                  numberOfLines={4}
                  maxLength={1000}
                  textAlignVertical="top"
                />
                <Text style={styles.feedbackCharCounter}>
                  {feedbackText.length}/1000
                </Text>
              </View>

              {/* Attached Photo Preview / Picker Button */}
              {feedbackPhoto ? (
                <View style={styles.photoAttachedRow}>
                  <View style={styles.photoThumbWrapper}>
                    <Image source={{ uri: feedbackPhoto.uri }} style={styles.photoThumb} />
                    <PressableScale
                      style={styles.photoRemoveBtn}
                      scaleTo={0.88}
                      hitSlop={6}
                      onPress={() => setFeedbackPhoto(null)}
                    >
                      <Ionicons name="close-circle" size={20} color="#F43F5E" />
                    </PressableScale>
                  </View>
                  <View style={styles.photoMetaCopy}>
                    <Text style={styles.photoMetaTitle}>Screenshot Attached 📸</Text>
                    <Text style={styles.photoMetaSub}>Will be sent with your report</Text>
                  </View>
                </View>
              ) : (
                <PressableScale
                  style={styles.attachPhotoBtn}
                  scaleTo={0.96}
                  haptic="light"
                  onPress={pickFeedbackImage}
                >
                  <Ionicons name="image-outline" size={18} color="#818CF8" />
                  <Text style={styles.attachPhotoText}>Attach Screenshot / Photo (Optional)</Text>
                </PressableScale>
              )}

              {/* Success Banner */}
              {feedbackSent && (
                <Animated.View entering={FadeIn.duration(150)} style={styles.feedbackSentBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={styles.feedbackSentText}>
                    Feedback received! Thank you for testing GC 💜
                  </Text>
                </Animated.View>
              )}

              {/* Submit Button */}
              <View style={styles.feedbackSubmitWrap}>
                <GCButton
                  label={submittingFeedback ? 'Sending Feedback...' : 'Send Feedback 🚀'}
                  variant="gradient"
                  neo
                  disabled={submittingFeedback || (!feedbackText.trim() && !feedbackPhoto)}
                  onPress={submitFeedback}
                  icon={<Ionicons name="send" size={16} color="#FFFFFF" />}
                />
              </View>
            </GlassPanel>
          </Animated.View>

          {/* 4. Account Actions */}
          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 3)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.actionsSection}
          >
            {/* Sign Out Button */}
            <PressableScale
              style={styles.signOutBtnWrap}
              scaleTo={0.96}
              haptic="medium"
              onPress={confirmSignOut}
            >
              <View style={styles.signOutBtnInner}>
                <Ionicons name="log-out-outline" size={18} color="#F87171" />
                <Text style={styles.signOutBtnText}>Sign Out</Text>
              </View>
            </PressableScale>

            {/* Delete Account Discreet Option */}
            <PressableScale
              style={styles.deleteAccountBtn}
              scaleTo={0.96}
              disabled={deleting}
              onPress={confirmDeleteAccount}
            >
              <Ionicons name="trash-outline" size={15} color="#64748B" />
              <Text style={styles.deleteAccountText}>
                {deleting ? 'Deleting account...' : 'Delete Account Permanently'}
              </Text>
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020204' },
  safe: { flex: 1 },
  scroll: {
    padding: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.lg,
  },

  // Glow Background
  glowBgRoot: { backgroundColor: '#020204', overflow: 'hidden' },
  topSpotlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  cornerBlob: { position: 'absolute', borderRadius: 999 },
  blobFill: { flex: 1, borderRadius: 999 },
  blobTopLeft: { top: -70, left: -70, width: 280, height: 280, opacity: 0.35 },
  blobTopRight: { top: -60, right: -60, width: 270, height: 270, opacity: 0.30 },
  blobBottomLeft: { bottom: -70, left: -60, width: 280, height: 280, opacity: 0.25 },
  blobBottomRight: { bottom: -80, right: -70, width: 290, height: 290, opacity: 0.30 },

  // Profile Card
  profileCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileInfo: {
    alignItems: 'center',
    gap: 3,
  },
  displayName: {
    ...typography.headline,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  handle: {
    ...typography.caption,
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    ...typography.title,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    ...typography.micro,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // Sections
  sectionWrap: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.onSurfaceVariant,
    paddingHorizontal: 4,
  },

  // Menu Card
  menuCard: {
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: {
    flex: 1,
    gap: 2,
  },
  menuTitle: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
  },

  // Alpha Feedback Form
  feedbackSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  alphaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  alphaPillText: {
    ...typography.micro,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: '#C084FC',
  },
  feedbackCard: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.25)',
  },
  feedbackIntro: {
    gap: 3,
  },
  feedbackTitle: {
    ...typography.title,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  feedbackSub: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#94A3B8',
    lineHeight: 18,
  },
  feedbackInputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.md,
    minHeight: 100,
  },
  feedbackInput: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
    minHeight: 64,
    padding: 0,
    margin: 0,
  },
  feedbackCharCounter: {
    ...typography.micro,
    fontSize: 10,
    color: '#64748B',
    alignSelf: 'flex-end',
    marginTop: 4,
  },

  attachPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(129, 140, 248, 0.10)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
    paddingVertical: 11,
  },
  attachPhotoText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    fontWeight: '700',
    color: '#818CF8',
  },

  photoAttachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.sm + 2,
  },
  photoThumbWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#0F172A',
    borderRadius: 10,
  },
  photoMetaCopy: {
    flex: 1,
    gap: 2,
  },
  photoMetaTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  photoMetaSub: {
    ...typography.micro,
    fontSize: 11.5,
    color: '#94A3B8',
  },

  feedbackSentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  feedbackSentText: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#34D399',
    fontWeight: '700',
    flex: 1,
  },
  feedbackSubmitWrap: {
    marginTop: 2,
  },

  // Actions Section
  actionsSection: {
    gap: spacing.md,
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  signOutBtnWrap: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  signOutBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  signOutBtnText: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: '#F87171',
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
  },
  deleteAccountText: {
    ...typography.micro,
    fontSize: 12,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
});
