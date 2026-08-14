import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  DOCK_HEIGHT,
  colors,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { PressableScale } from '../components/ui/PressableScale';
import { AppHeader } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { GCButton } from '../components/ui/Buttons';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../hooks/useGroups';
import { supabase } from '../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

function StatCircle({
  value,
  label,
  color,
  delay,
}: {
  value: string;
  label: string;
  color: string;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(duration.base).easing(easing.out).reduceMotion(reduceMotion)}
      style={[styles.statCircle, { borderColor: `${color}55` }]}
    >
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

function MenuRow({
  icon,
  color,
  label,
  onPress,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(duration.slow)
        .easing(easing.out)
        .reduceMotion(reduceMotion)}
    >
      <PressableScale style={styles.menuRow} scaleTo={0.985} onPress={onPress}>
        <View style={[styles.menuIcon, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={styles.menuLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.outline} />
      </PressableScale>
    </Animated.View>
  );
}

export default function ProfileScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  // Counts only — no need for a live channel behind the profile tab.
  const { groups } = useGroups({ realtime: false });
  const [totalMessages, setTotalMessages] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // "Total hype" is this user's own message count — a real number, not a prop.
  useEffect(() => {
    let cancelled = false;
    async function loadCount() {
      if (!profile?.id) return;
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', profile.id);
      if (!cancelled) setTotalMessages(count ?? 0);
    }
    loadCount();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Fetch access token for testing/debugging
  useEffect(() => {
    async function loadToken() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token);
      }
    }
    loadToken();
  }, []);

  async function copySessionToken() {
    if (!accessToken) {
      Alert.alert('No session', 'Could not find your session token.');
      return;
    }
    await Clipboard.setStringAsync(accessToken);
    Alert.alert('Copied', 'Session token copied to clipboard.');
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      signOut();
      return;
    }
    Alert.alert('Leave the GC?', 'You can always come back.', [
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
    // The row backing this session is gone; sign out locally to clear the
    // token and drop back to the Auth screen rather than leaving a session
    // that points at nothing.
    await signOut();
  }

  // Deletion is permanent and takes every GC you own with it (unless someone
  // else can inherit ownership) — worth a second confirmation, not just one.
  function confirmDeleteAccount() {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete your account? This removes your profile everywhere and cannot be undone.')) {
        return;
      }
      if (!window.confirm('Really sure? There is no way to get this back.')) return;
      doDeleteAccount();
      return;
    }
    Alert.alert(
      'Delete your account?',
      'Your profile, messages, and any GCs only you belong to are gone for good.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you sure?', 'This is permanent. There is no way to undo it.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete Everything', style: 'destructive', onPress: doDeleteAccount },
            ]),
        },
      ]
    );
  }

  const hype =
    totalMessages === null
      ? '—'
      : totalMessages >= 1000
        ? `${(totalMessages / 1000).toFixed(1)}k`
        : String(totalMessages);

  const vibeLevel =
    totalMessages === null
      ? 'CALIBRATING'
      : totalMessages > 500
        ? 'UNHINGED'
        : totalMessages > 100
          ? 'HIGH'
          : totalMessages > 10
            ? 'WARMING UP'
            : 'LURKER';

  return (
    <View style={styles.root}>
      <AmbientBackground variant="vivid" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader wordmark />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View
            entering={FadeInDown.duration(duration.page).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.identity}
          >
            <Avatar
              emoji={profile?.avatar_emoji}
              imageUrl={profile?.avatar_url}
              label={profile?.display_name}
              size={128}
              glow
              status="online"
            />
            <Text style={styles.name}>{profile?.display_name ?? 'you'}</Text>
            <Text style={styles.handle}>@{profile?.username ?? 'unknown'}</Text>

            <View style={styles.vibeChip}>
              <Ionicons name="flame" size={15} color={colors.tertiary} />
              <Text style={styles.vibeText}>VIBE LEVEL: {vibeLevel}</Text>
            </View>
          </Animated.View>

          <View style={styles.stats}>
            <StatCircle value={hype} label={'TOTAL\nHYPE'} color={colors.primary} delay={120} />
            <StatCircle
              value={String(groups.length)}
              label="GROUPS"
              color={colors.secondary}
              delay={200}
            />
            <StatCircle
              value={String(groups.filter((g) => g.unreadCount > 0).length)}
              label={'UNREAD\nGCS'}
              color={colors.tertiary}
              delay={280}
            />
          </View>

          <View style={styles.menu}>
            <MenuRow
              icon="people"
              color={colors.primary}
              label="My Groups"
              delay={STAGGER_MS * 2}
              onPress={() => navigation.navigate('GroupList')}
            />
            <MenuRow
              icon="trophy"
              color={colors.secondary}
              label="Achievements"
              delay={STAGGER_MS * 3}
              onPress={() => navigation.navigate('Explore')}
            />
            <MenuRow
              icon="add-circle"
              color={colors.tertiary}
              label="Start or Join a GC"
              delay={STAGGER_MS * 4}
              onPress={() => navigation.navigate('AddGC')}
            />
          </View>

          {accessToken && (
            <Animated.View
              entering={FadeInDown.delay(STAGGER_MS * 5)
                .duration(duration.slow)
                .easing(easing.out)
                .reduceMotion(reduceMotion)}
            >
              <GlassPanel style={styles.tokenPanel}>
                <View style={styles.tokenHeader}>
                  <Ionicons name="key-outline" size={18} color={colors.onSurfaceVariant} />
                  <Text style={styles.tokenLabel}>Session Token</Text>
                </View>
                <Text style={styles.tokenText} numberOfLines={1} ellipsizeMode="middle">
                  {accessToken.substring(0, 20)}...{accessToken.substring(accessToken.length - 20)}
                </Text>
                <GCButton
                  label="Copy"
                  variant="ghost"
                  full={false}
                  onPress={copySessionToken}
                  icon={<Ionicons name="copy-outline" size={16} color={colors.primary} />}
                />
              </GlassPanel>
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 6)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.signOut}
          >
            <GCButton
              label="Sign Out"
              variant="danger"
              onPress={confirmSignOut}
              icon={<Ionicons name="log-out-outline" size={19} color={colors.error} />}
            />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 7)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.dangerZone}
          >
            <PressableScale
              style={styles.deleteRow}
              scaleTo={0.98}
              disabled={deleting}
              onPress={confirmDeleteAccount}
            >
              <Ionicons name="skull-outline" size={16} color={colors.outline} />
              <Text style={styles.deleteText}>
                {deleting ? 'deleting your account…' : 'Delete Account'}
              </Text>
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: {
    padding: CONTAINER_MARGIN,
    paddingBottom: DOCK_HEIGHT + spacing.xxl,
    gap: spacing.xl,
  },
  identity: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  name: { ...typography.headline, fontSize: 28, color: colors.onSurface, marginTop: spacing.md },
  handle: { ...typography.bodyLg, color: colors.primary },
  vibeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.tertiary,
    backgroundColor: 'rgba(76,215,246,0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  vibeText: { ...typography.label, color: colors.onSurface },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  statCircle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statValue: { ...typography.headline, fontSize: 26 },
  statLabel: {
    ...typography.label,
    fontSize: 10,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  menu: { gap: spacing.md },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: glass.borderWidth,
    borderColor: glass.stroke,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  menuLabel: { ...typography.titleMd, color: colors.onSurface, flex: 1 },
  tokenPanel: {
    gap: spacing.md,
    alignItems: 'center',
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tokenLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  tokenText: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontFamily: 'monospace',
  },
  signOut: { marginTop: spacing.sm },
  dangerZone: { alignItems: 'center', paddingTop: spacing.xs },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  deleteText: { ...typography.caption, color: colors.outline },
});
