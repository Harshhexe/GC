import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  CONTAINER_MARGIN,
  colors,
  glass,
  radius,
  spacing,
  typography,
} from '../theme/theme';
import { STAGGER_MS, duration, easing, reduceMotion } from '../theme/motion';
import { GROUP_THEMES, GroupThemeKey, groupTheme } from '../theme/groupThemes';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton } from '../components/ui/Buttons';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { MemberActionSheet, MemberActionTarget } from '../components/MemberActionSheet';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { successFeedback } from '../utils/haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupInfo'>;

type Role = 'owner' | 'admin' | 'member';

type Member = {
  id: string;
  display_name: string;
  username: string;
  avatar_emoji: string;
  avatar_color: string;
  messageCount: number;
  role: Role;
};

const VISIBLE_MEMBERS = 5;

export default function GroupInfoScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { session } = useAuth();

  const [group, setGroup] = useState<{
    name: string;
    emoji: string;
    code: string;
    createdBy: string | null;
    avatarUrl: string | null;
    theme: string | null;
  } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [changingTheme, setChangingTheme] = useState(false);
  const [actionTarget, setActionTarget] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const { data: g } = await supabase
      .from('groups')
      .select('name, emoji, invite_code, created_by, avatar_url, theme')
      .eq('id', groupId)
      .single();

    if (g) {
      setGroup({
        name: g.name,
        emoji: g.emoji,
        code: g.invite_code,
        createdBy: g.created_by,
        avatarUrl: g.avatar_url,
        theme: g.theme,
      });
    }

    const { data: rows } = await supabase
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', groupId);

    const roleById = new Map((rows ?? []).map((r) => [r.user_id, r.role as Role]));
    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) {
      setMembers([]);
      return;
    }

    const [{ data: profiles }, { data: msgs }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, username, avatar_emoji, avatar_color')
        .in('id', ids),
      supabase.from('messages').select('author_id').eq('group_id', groupId),
    ]);

    const counts = new Map<string, number>();
    for (const m of msgs ?? []) {
      if (!m.author_id) continue;
      counts.set(m.author_id, (counts.get(m.author_id) ?? 0) + 1);
    }

    const list: Member[] = (profiles ?? []).map((p) => ({
      ...p,
      messageCount: counts.get(p.id) ?? 0,
      role: roleById.get(p.id) ?? 'member',
    }));
    // Owner and admins first, then loudest first within each tier — the
    // member list doubles as both an org chart and a leaderboard.
    const roleWeight: Record<Role, number> = { owner: 0, admin: 1, member: 2 };
    list.sort(
      (a, b) => roleWeight[a.role] - roleWeight[b.role] || b.messageCount - a.messageCount
    );

    setMembers(list);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const myRole = members.find((m) => m.id === session?.user.id)?.role ?? null;
  const canManage = myRole === 'owner' || myRole === 'admin';

  async function handleCopy() {
    if (!group?.code) return;
    await Clipboard.setStringAsync(group.code);
    successFeedback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleInvite() {
    if (!group) return;
    await Share.share({
      message: `join "${group.name}" on GC — code: ${group.code}`,
    }).catch(() => {});
  }

  async function doLeave() {
    if (!session?.user) return;
    setLeaving(true);
    // RPC, not a plain delete: an owner leaving needs a successor promoted in
    // the same transaction, which client-side RLS can't do — see
    // supabase/roles_and_account_deletion.sql.
    await supabase.rpc('leave_group', { p_group_id: groupId });
    setLeaving(false);
    navigation.navigate('MainTabs');
  }

  function confirmLeave() {
    const isSoleOwner = myRole === 'owner' && members.length > 1;
    const message = isSoleOwner
      ? 'Ownership passes to the longest-standing admin (or member) automatically.'
      : 'You’ll need the code to get back in.';
    if (Platform.OS === 'web') {
      if (window.confirm(`Leave this GC? ${message}`)) doLeave();
      return;
    }
    Alert.alert('Leave this GC?', message, [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: doLeave },
    ]);
  }

  async function handleThemeChange(key: GroupThemeKey) {
    if (!canManage || changingTheme || group?.theme === key) return;
    setChangingTheme(true);
    setGroup((g) => (g ? { ...g, theme: key } : g)); // optimistic — it's just a colour
    const { error } = await supabase.from('groups').update({ theme: key }).eq('id', groupId);
    setChangingTheme(false);
    if (error) load(); // roll back to the real value on failure
    else successFeedback();
  }

  async function handleMakeAdmin(memberId: string) {
    setActionTarget(null);
    await supabase
      .from('group_members')
      .update({ role: 'admin' })
      .match({ group_id: groupId, user_id: memberId });
    successFeedback();
    load();
  }

  async function handleRemoveAdmin(memberId: string) {
    setActionTarget(null);
    await supabase
      .from('group_members')
      .update({ role: 'member' })
      .match({ group_id: groupId, user_id: memberId });
    load();
  }

  function confirmRemoveMember(member: Member) {
    setActionTarget(null);
    const go = async () => {
      await supabase
        .from('group_members')
        .delete()
        .match({ group_id: groupId, user_id: member.id });
      load();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${member.display_name} from this GC?`)) go();
      return;
    }
    Alert.alert(`Remove ${member.display_name}?`, 'They’ll need the code to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  }

  const shown = showAll ? members : members.slice(0, VISIBLE_MEMBERS);
  const activeTheme = groupTheme(group?.theme);

  const actionTargetView: MemberActionTarget | null = actionTarget
    ? {
        id: actionTarget.id,
        displayName: actionTarget.display_name,
        avatarEmoji: actionTarget.avatar_emoji,
        avatarColor: actionTarget.avatar_color,
        role: actionTarget.role,
      }
    : null;

  return (
    <View style={styles.root}>
      <AmbientBackground tint={activeTheme.accent} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader
          title="Group Info"
          left={<HeaderIconButton name="arrow-back" onPress={() => navigation.goBack()} />}
        />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View
            entering={FadeInDown.duration(duration.slow).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.identity}
          >
            <Avatar
              emoji={group?.emoji ?? '💬'}
              imageUrl={group?.avatarUrl}
              ringColors={activeTheme.colors}
              size={116}
              glow
            />
            <Text style={styles.groupName}>{group?.name ?? '…'}</Text>
            <View style={styles.memberLine}>
              <Ionicons name="people" size={16} color={colors.onSurfaceVariant} />
              <Text style={styles.memberCount}>
                {members.length} {members.length === 1 ? 'Member' : 'Members'}
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
          >
            <GlassPanel borderRadius={radius.lg} style={styles.codeCard}>
              <Text style={styles.codeLabel}>GROUP CODE</Text>
              <Text style={styles.code}>{group?.code ?? '••••••'}</Text>
              <GCButton
                label={copied ? 'COPIED' : 'COPY CODE'}
                variant="primary"
                neo
                full={false}
                onPress={handleCopy}
                style={styles.copyButton}
                icon={
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={17}
                    color={colors.onPrimary}
                  />
                }
              />
            </GlassPanel>
          </Animated.View>

          {canManage && (
            <Animated.View
              entering={FadeInDown.delay(STAGGER_MS * 2)
                .duration(duration.slow)
                .easing(easing.out)
                .reduceMotion(reduceMotion)}
              style={styles.themeBlock}
            >
              <Text style={styles.themeTitle}>Vibe</Text>
              <View style={styles.themeGrid}>
                {GROUP_THEMES.map((t) => {
                  const active = (group?.theme ?? 'violet') === t.key;
                  return (
                    <PressableScale
                      key={t.key}
                      scaleTo={0.9}
                      haptic="medium"
                      disabled={changingTheme}
                      onPress={() => handleThemeChange(t.key)}
                      style={[styles.themeChip, active && { borderColor: t.accent }]}
                    >
                      <LinearGradient
                        colors={t.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.themeSwatch}
                      >
                        {active && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                      </LinearGradient>
                    </PressableScale>
                  );
                })}
              </View>
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 3)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.crewBlock}
          >
            <Text style={styles.crewTitle}>Crew</Text>
            <GlassPanel borderRadius={radius.lg}>
              {shown.map((m, i) => {
                const isMe = m.id === session?.user.id;
                const showKebab = canManage && !isMe && !(myRole === 'admin' && m.role !== 'member');
                return (
                  <View key={m.id} style={[styles.memberRow, i > 0 && styles.memberDivider]}>
                    <Avatar
                      emoji={m.avatar_emoji}
                      label={m.display_name}
                      size={46}
                      ringColors={[m.avatar_color, colors.secondary]}
                      status={isMe ? 'online' : 'offline'}
                    />
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>
                        {m.display_name}
                        {isMe ? ' (you)' : ''}
                      </Text>
                      <View style={styles.memberMetaRow}>
                        <Text style={styles.memberMeta}>
                          {m.messageCount === 0
                            ? 'Professional lurker'
                            : `${m.messageCount} message${m.messageCount === 1 ? '' : 's'}`}
                        </Text>
                      </View>
                    </View>

                    {m.role === 'owner' && (
                      <View style={styles.roleChip}>
                        <Text style={styles.roleChipText}>OWNER</Text>
                      </View>
                    )}
                    {m.role === 'admin' && (
                      <View style={[styles.roleChip, styles.adminChip]}>
                        <Text style={[styles.roleChipText, styles.adminChipText]}>ADMIN</Text>
                      </View>
                    )}

                    {showKebab && (
                      <PressableScale
                        style={styles.kebab}
                        scaleTo={0.85}
                        hitSlop={8}
                        onPress={() => setActionTarget(m)}
                      >
                        <Ionicons name="ellipsis-vertical" size={16} color={colors.outline} />
                      </PressableScale>
                    )}
                  </View>
                );
              })}

              {members.length > VISIBLE_MEMBERS && (
                <PressableScale
                  style={[styles.viewAll, styles.memberDivider]}
                  scaleTo={0.98}
                  onPress={() => setShowAll((v) => !v)}
                >
                  <Text style={styles.viewAllText}>
                    {showAll ? 'SHOW LESS' : `VIEW ALL ${members.length} MEMBERS`}
                  </Text>
                </PressableScale>
              )}
            </GlassPanel>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 4)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.actions}
          >
            <GCButton
              label="Invite Friends"
              variant="gradient"
              neo
              onPress={handleInvite}
              icon={<Ionicons name="person-add" size={19} color="#FFFFFF" />}
            />
            <GCButton
              label={leaving ? 'leaving…' : 'Leave Group'}
              variant="danger"
              disabled={leaving}
              onPress={confirmLeave}
              icon={<Ionicons name="exit-outline" size={19} color={colors.error} />}
            />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <MemberActionSheet
        visible={actionTarget !== null}
        target={actionTargetView}
        myRole={myRole}
        onClose={() => setActionTarget(null)}
        onMakeAdmin={() => actionTarget && handleMakeAdmin(actionTarget.id)}
        onRemoveAdmin={() => actionTarget && handleRemoveAdmin(actionTarget.id)}
        onRemoveMember={() => actionTarget && confirmRemoveMember(actionTarget)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { padding: CONTAINER_MARGIN, paddingBottom: spacing.section + 40, gap: spacing.xl },
  identity: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  groupName: { ...typography.headline, fontSize: 30, color: colors.onSurface, marginTop: spacing.md },
  memberLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberCount: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  codeCard: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  codeLabel: { ...typography.label, color: colors.outline },
  code: {
    ...typography.headline,
    fontSize: 34,
    color: colors.onSurface,
    letterSpacing: 4,
    marginRight: -4,
  },
  copyButton: { marginTop: spacing.md },
  themeBlock: { gap: spacing.md },
  themeTitle: { ...typography.headline, fontSize: 20, color: colors.onSurface },
  themeGrid: { flexDirection: 'row', gap: spacing.sm },
  themeChip: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 3,
  },
  themeSwatch: {
    flex: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewBlock: { gap: spacing.md },
  crewTitle: { ...typography.headline, fontSize: 24, color: colors.onSurface },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  memberDivider: { borderTopWidth: 1, borderTopColor: glass.stroke },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { ...typography.titleMd, fontSize: 18, color: colors.onSurface },
  memberMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberMeta: { ...typography.caption, color: colors.outline },
  roleChip: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(208,188,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(208,188,255,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  roleChipText: { ...typography.label, fontSize: 10, color: colors.primary },
  adminChip: { backgroundColor: 'rgba(76,215,246,0.14)', borderColor: 'rgba(76,215,246,0.4)' },
  adminChipText: { color: colors.tertiary },
  kebab: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  viewAll: { paddingVertical: spacing.lg, alignItems: 'center' },
  viewAllText: { ...typography.label, color: colors.onSurfaceVariant },
  actions: { gap: spacing.md },
});
