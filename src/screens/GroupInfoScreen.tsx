import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
import {
  type ChatAppearance,
  groupTheme,
  useChatAppearance,
} from '../theme/groupThemes';
import { AmbientBackground } from '../components/ui/AmbientBackground';
import { GlassPanel } from '../components/ui/Glass';
import { GCButton } from '../components/ui/Buttons';
import { AppHeader, HeaderIconButton } from '../components/ui/AppHeader';
import { Avatar } from '../components/ui/Avatar';
import { PressableScale } from '../components/ui/PressableScale';
import { MemberActionSheet, MemberActionTarget } from '../components/MemberActionSheet';
import { ChatThemeSheet } from '../components/ChatThemeSheet';
import { GroupNotificationSheet } from '../components/GroupNotificationSheet';
import { useGroupNotificationSettings } from '../hooks/useGroupNotificationSettings';
import { supabase } from '../lib/supabase';
import { onChannelStatus } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { successFeedback } from '../utils/haptics';
import { signedImageSource, useSignedMediaUrl } from '../lib/mediaUrl';
import { useVideoPoster } from '../hooks/useVideoPoster';
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
  avatar_url: string | null;
  messageCount: number;
  role: Role;
};

type RecentMediaItem = {
  id: string;
  url: string;
  thumbUrl: string | null;
  type: 'image' | 'video' | 'gif' | 'file';
};

const VISIBLE_MEMBERS = 5;

function MediaBannerThumbnailItem({
  item,
}: {
  item: RecentMediaItem;
}) {
  const isVideo = item.type === 'video';
  const signedUrl = useSignedMediaUrl(item.url);
  const signedThumb = useSignedMediaUrl(item.thumbUrl);
  const derivedPoster = useVideoPoster(isVideo && !item.thumbUrl ? signedUrl : null);
  const previewUri = isVideo ? signedThumb ?? derivedPoster : signedUrl;
  // Matches the object previewUri was signed from — see signedImageSource.
  const previewOriginal = isVideo ? (signedThumb ? item.thumbUrl : null) : item.url;

  if (item.type === 'file') {
    return (
      <View style={styles.mediaBannerThumbFile}>
        <Ionicons name="document-text" size={20} color="#818CF8" />
      </View>
    );
  }

  return (
    <View style={styles.mediaBannerThumbWrap}>
      {!!previewUri ? (
        <Image
          source={signedImageSource(previewUri, previewOriginal)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={styles.mediaBannerThumbPlaceholder}>
          <Ionicons
            name={isVideo ? 'videocam' : 'image'}
            size={18}
            color={colors.onSurfaceVariant}
          />
        </View>
      )}
      {isVideo && (
        <View style={styles.mediaBannerPlayBadge}>
          <Ionicons name="play" size={10} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

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
  const [clearingChat, setClearingChat] = useState(false);
  const [actionTarget, setActionTarget] = useState<Member | null>(null);
  const [recentMedia, setRecentMedia] = useState<RecentMediaItem[]>([]);
  const [mediaTotalCount, setMediaTotalCount] = useState(0);

  const load = useCallback(async () => {
    const [{ data: g }, { data: mediaRows, count: totalMediaCount }] = await Promise.all([
      supabase
        .from('groups')
        .select('name, emoji, invite_code, created_by, avatar_url, theme')
        .eq('id', groupId)
        .single(),
      supabase
        .from('messages')
        .select('id, media_url, media_thumb_url, media_type', { count: 'exact' })
        .eq('group_id', groupId)
        .eq('is_deleted', false)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

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

    setMediaTotalCount(totalMediaCount ?? 0);
    setRecentMedia(
      (mediaRows ?? []).map((r) => ({
        id: r.id,
        url: r.media_url!,
        thumbUrl: r.media_thumb_url,
        type: (r.media_type as 'image' | 'video' | 'gif' | 'file') || 'image',
      }))
    );

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
        .select('id, display_name, username, avatar_emoji, avatar_color, avatar_url')
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

  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group-info-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
        () => load()
      )
      .subscribe(onChannelStatus('group-info'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

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

  async function doClearChat() {
    setClearingChat(true);
    const { error } = await supabase.rpc('clear_chat_for_me', { p_group_id: groupId });
    setClearingChat(false);
    if (error) {
      Alert.alert('Error', error.message || 'Could not clear chat.');
    } else {
      successFeedback();
      Alert.alert('Chat Cleared', 'Messages in this group chat have been cleared for you. Other members are not affected.');
      load();
    }
  }

  function confirmClearChat() {
    const title = 'Clear this chat?';
    const message = 'Messages in this chat will be cleared for you only. Other members will still see them.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) doClearChat();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear for Me', style: 'destructive', onPress: doClearChat },
    ]);
  }

  const {
    appearance,
    update: updateAppearance,
    theme: activePersonalTheme,
  } = useChatAppearance(groupId, group?.theme);
  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const [notifSheetVisible, setNotifSheetVisible] = useState(false);

  const notifSettings = useGroupNotificationSettings(groupId, session?.user.id);
  const { mode: notifMode, isMuted, muteStatusText } = notifSettings;

  function handleAppearanceChange(patch: Partial<ChatAppearance>) {
    successFeedback();
    // Personal and device-local by design — the old swatch grid also wrote the
    // key back to `groups`, which changed the colour for every member despite
    // being labelled "Personal View".
    updateAppearance(patch);
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
  const activeTheme = activePersonalTheme;

  const actionTargetView: MemberActionTarget | null = actionTarget
    ? {
        id: actionTarget.id,
        displayName: actionTarget.display_name,
        avatarEmoji: actionTarget.avatar_emoji,
        avatarColor: actionTarget.avatar_color,
        avatarUrl: actionTarget.avatar_url,
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

          {/* Media, Links & Files Banner */}
          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS + 2)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
          >
            <PressableScale
              scaleTo={0.98}
              haptic="light"
              onPress={() => navigation.navigate('MediaLinksFiles', { groupId })}
              style={styles.mediaBannerWrap}
            >
              <GlassPanel borderRadius={radius.lg} style={styles.mediaBannerCard}>
                <View style={styles.mediaBannerHeader}>
                  <View style={styles.mediaBannerHeaderLeft}>
                    <View
                      style={[
                        styles.mediaBannerIconWrap,
                        {
                          backgroundColor: `${activeTheme.accent}1E`,
                          borderColor: `${activeTheme.accent}3A`,
                        },
                      ]}
                    >
                      <Ionicons name="images" size={17} color={activeTheme.accent} />
                    </View>
                    <Text style={styles.mediaBannerTitle}>Media, Links & Files</Text>
                  </View>
                  <View style={styles.mediaBannerHeaderRight}>
                    <Text style={styles.mediaBannerCount}>{mediaTotalCount}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
                  </View>
                </View>

                {recentMedia.length > 0 ? (
                  <View style={styles.mediaBannerStrip}>
                    {recentMedia.map((item) => (
                      <MediaBannerThumbnailItem key={item.id} item={item} />
                    ))}
                    {mediaTotalCount > recentMedia.length && (
                      <View style={styles.mediaBannerMoreChip}>
                        <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                        <Text style={styles.mediaBannerMoreText}>All</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.mediaBannerEmpty}>
                    <Ionicons name="images-outline" size={15} color={colors.onSurfaceVariant} />
                    <Text style={styles.mediaBannerEmptyText}>
                      Photos, videos, files and links shared in chat will appear here
                    </Text>
                  </View>
                )}
              </GlassPanel>
            </PressableScale>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS + 4)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
          >
            <GlassPanel borderRadius={radius.lg} style={styles.quickLinks}>
              <QuickLinkRow
                icon="search"
                label="Search"
                onPress={() => navigation.navigate('GroupSearch', { groupId })}
              />
              <View style={styles.quickLinkDivider} />
              <QuickLinkRow
                icon="pin"
                label="Pinned Messages"
                onPress={() => navigation.navigate('PinnedMessages', { groupId })}
              />
              <View style={styles.quickLinkDivider} />
              <QuickLinkRow
                icon="finger-print"
                label="GC DNA"
                onPress={() =>
                  navigation.navigate('GCDNA', { groupId, groupName: group?.name })
                }
              />
              <View style={styles.quickLinkDivider} />
              <QuickLinkRow
                icon="bulb"
                label="Custom Instructions"
                onPress={() => navigation.navigate('GroupInstructions', { groupId })}
              />
            </GlassPanel>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS + 6)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.notifBlock}
          >
            <View style={styles.notifHeaderRow}>
              <Text style={styles.notifSectionTitle}>Notifications</Text>
            </View>

            <PressableScale
              scaleTo={0.98}
              haptic="light"
              onPress={() => setNotifSheetVisible(true)}
              style={styles.notifRow}
            >
              <View
                style={[
                  styles.notifIconWrap,
                  {
                    backgroundColor: isMuted
                      ? 'rgba(239, 68, 68, 0.15)'
                      : notifMode === 'off'
                      ? 'rgba(255, 255, 255, 0.06)'
                      : `${activePersonalTheme.accent}22`,
                  },
                ]}
              >
                <Ionicons
                  name={
                    isMuted
                      ? 'volume-mute'
                      : notifMode === 'off'
                      ? 'notifications-off'
                      : notifMode === 'mentions_replies'
                      ? 'at'
                      : 'notifications'
                  }
                  size={18}
                  color={
                    isMuted
                      ? colors.error
                      : notifMode === 'off'
                      ? colors.onSurfaceVariant
                      : activePersonalTheme.accent
                  }
                />
              </View>

              <View style={styles.notifCopy}>
                <Text style={styles.notifRowTitle}>Notifications</Text>
                <Text style={styles.notifRowSub}>
                  {isMuted
                    ? muteStatusText
                    : notifMode === 'all'
                    ? 'All messages'
                    : notifMode === 'mentions_replies'
                    ? 'Mentions & replies'
                    : 'Off'}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
            </PressableScale>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(STAGGER_MS * 2)
              .duration(duration.slow)
              .easing(easing.out)
              .reduceMotion(reduceMotion)}
            style={styles.themeBlock}
          >
            <View style={styles.themeHeaderRow}>
              <Text style={styles.themeTitle}>Chat Theme</Text>
              <View style={styles.personalBadge}>
                <Text style={styles.personalBadgeText}>Personal View</Text>
              </View>
            </View>
            <Text style={styles.themeSub}>Only changes how this chat looks for you.</Text>

            <PressableScale
              scaleTo={0.98}
              haptic="light"
              onPress={() => setThemeSheetVisible(true)}
              style={styles.themeRow}
            >
              {/* The current look, previewed rather than named: swatch, bubble
                  fill and wallpaper thumbnail if one is set. */}
              <LinearGradient
                colors={activePersonalTheme.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.themeRowSwatch}
              >
                {appearance.wallpaperUri ? (
                  <Image
                    source={appearance.wallpaperUri}
                    style={styles.themeRowWallpaper}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Ionicons name="color-palette-outline" size={17} color="#FFFFFF" />
                )}
              </LinearGradient>

              <View style={styles.themeRowCopy}>
                <Text style={styles.themeRowTitle}>Chat theme</Text>
                <Text style={styles.themeRowSub}>
                  {activePersonalTheme.name}
                  {' · '}
                  {appearance.bubbleStyle === 'opaque' ? 'Opaque' : 'Translucent'}
                  {appearance.wallpaperUri ? ' · Wallpaper' : ''}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
            </PressableScale>
          </Animated.View>

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
                      imageUrl={m.avatar_url}
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
              label={clearingChat ? 'Clearing…' : 'Clear Chat'}
              variant="danger"
              disabled={clearingChat}
              onPress={confirmClearChat}
              icon={<Ionicons name="trash-outline" size={19} color={colors.error} />}
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

      <ChatThemeSheet
        visible={themeSheetVisible}
        groupId={groupId}
        appearance={appearance}
        onChange={handleAppearanceChange}
        onClose={() => setThemeSheetVisible(false)}
      />

      <GroupNotificationSheet
        visible={notifSheetVisible}
        groupId={groupId}
        groupName={group?.name}
        userId={session?.user.id}
        accentColor={activeTheme.accent}
        settings={notifSettings}
        onClose={() => setNotifSheetVisible(false)}
      />

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

function QuickLinkRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <PressableScale style={quickLinkStyles.row} scaleTo={0.98} onPress={onPress}>
      <Ionicons name={icon} size={18} color={destructive ? colors.error : colors.primary} />
      <Text style={[quickLinkStyles.label, destructive && { color: colors.error }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={destructive ? colors.error : colors.outline} />
    </PressableScale>
  );
}

const quickLinkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  label: { ...typography.bodyMedium, fontSize: 15, color: colors.onSurface, flex: 1 },
});

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

  // Media, Links & Files Banner
  mediaBannerWrap: {
    borderRadius: radius.lg,
  },
  mediaBannerCard: {
    padding: spacing.md + 2,
    gap: spacing.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaBannerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  mediaBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBannerTitle: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  mediaBannerHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mediaBannerCount: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  mediaBannerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mediaBannerThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  mediaBannerThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBannerThumbFile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBannerPlayBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBannerMoreChip: {
    height: 52,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  mediaBannerMoreText: {
    ...typography.micro,
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurface,
  },
  mediaBannerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  mediaBannerEmptyText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    flex: 1,
  },

  quickLinks: { overflow: 'hidden' },
  quickLinkDivider: { height: StyleSheet.hairlineWidth, backgroundColor: glass.stroke, marginLeft: spacing.lg + 18 + spacing.md },
  notifBlock: { gap: spacing.sm },
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifSectionTitle: { ...typography.headline, fontSize: 20, color: colors.onSurface },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  notifIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCopy: { flex: 1, gap: 1 },
  notifRowTitle: { ...typography.label, fontSize: 14, color: colors.onSurface },
  notifRowSub: { ...typography.caption, fontSize: 12, color: colors.onSurfaceVariant },
  themeBlock: { gap: spacing.sm },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeTitle: { ...typography.headline, fontSize: 20, color: colors.onSurface },
  personalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.35)',
  },
  personalBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
  },
  themeSub: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xs,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  themeRowSwatch: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  themeRowWallpaper: { width: '100%', height: '100%' },
  themeRowCopy: { flex: 1, gap: 1 },
  themeRowTitle: { ...typography.label, fontSize: 14, color: colors.onSurface },
  themeRowSub: { ...typography.caption, fontSize: 11, color: colors.onSurfaceVariant },
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
