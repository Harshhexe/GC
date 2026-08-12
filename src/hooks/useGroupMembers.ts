import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GroupMember } from '../types';

type Role = 'owner' | 'admin' | 'member';

/**
 * The current GC's member list — the one source the mention picker, the
 * member profile sheet, and (eventually) anything else that needs "who's in
 * this chat" reads from. One membership+profile fetch per group, kept live
 * via realtime rather than re-queried per keystroke or per message.
 */
export function useGroupMembers(groupId: string) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(Math.random().toString(36).slice(2, 10));

  const load = useCallback(async () => {
    if (!groupId) return;
    const { data: rows } = await supabase
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', groupId);

    const roleById = new Map((rows ?? []).map((r) => [r.user_id, r.role as Role]));
    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_emoji, avatar_color, avatar_url')
      .in('id', ids);

    setMembers(
      (profiles ?? []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        username: p.username,
        avatarEmoji: p.avatar_emoji,
        avatarColor: p.avatar_color,
        avatarUrl: p.avatar_url,
        role: roleById.get(p.id) ?? 'member',
      }))
    );
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group-members-${groupId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  return { members, loading };
}
