import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorFeedback, successFeedback } from '../utils/haptics';

export type NotificationMode = 'all' | 'mentions_replies' | 'off';

export type MuteOption = '1h' | '8h' | '1w' | 'indefinite' | 'unmute';

export type GroupNotificationSettings = {
  mode: NotificationMode;
  mutedUntil: string | null;
  isMuted: boolean;
};

const INDEFINITE_MUTE_ISO = '2099-12-31T23:59:59.999Z';

export function isIndefiniteMute(mutedUntil: string | null): boolean {
  if (!mutedUntil) return false;
  const year = new Date(mutedUntil).getFullYear();
  return year >= 2090;
}

export function isCurrentlyMuted(mutedUntil: string | null): boolean {
  if (!mutedUntil) return false;
  const time = new Date(mutedUntil).getTime();
  return !isNaN(time) && time > Date.now();
}

export function formatMuteStatus(mutedUntil: string | null): string {
  if (!mutedUntil || !isCurrentlyMuted(mutedUntil)) return 'Unmuted';
  if (isIndefiniteMute(mutedUntil)) return 'Muted indefinitely';

  const date = new Date(mutedUntil);
  const now = new Date();

  // If today or tomorrow
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Muted until today at ${timeStr}`;
  if (isTomorrow) return `Muted until tomorrow at ${timeStr}`;

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `Muted until ${dateStr}, ${timeStr}`;
}

export function useGroupNotificationSettings(groupId: string, userId?: string | null) {
  const [mode, setModeState] = useState<NotificationMode>('all');
  const [mutedUntil, setMutedUntilState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isMuted = useMemo(() => isCurrentlyMuted(mutedUntil), [mutedUntil]);

  const load = useCallback(async () => {
    if (!groupId || !userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('group_notification_settings')
        .select('notification_mode, muted_until')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[useGroupNotificationSettings] load error:', error);
      } else if (data) {
        setModeState((data.notification_mode as NotificationMode) || 'all');
        setMutedUntilState(data.muted_until || null);
      } else {
        // Fallback default: 'all', unmuted
        setModeState('all');
        setMutedUntilState(null);
      }
    } catch (e) {
      console.warn('[useGroupNotificationSettings] failed to fetch:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription for multi-device synchronization
  useEffect(() => {
    if (!groupId || !userId) return;

    const channel = supabase
      .channel(`group_notif_${groupId}_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_notification_settings',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row && row.user_id === userId) {
            setModeState(row.notification_mode || 'all');
            setMutedUntilState(row.muted_until || null);
          } else if (payload.eventType === 'DELETE') {
            setModeState('all');
            setMutedUntilState(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, userId]);

  const updateSettings = useCallback(
    async (newMode: NotificationMode, newMutedUntil: string | null) => {
      if (!groupId || !userId) return { ok: false, error: 'User not signed in' };

      const prevMode = mode;
      const prevMuted = mutedUntil;

      // Optimistic update
      setModeState(newMode);
      setMutedUntilState(newMutedUntil);
      setSaving(true);

      try {
        const { error } = await supabase
          .from('group_notification_settings')
          .upsert(
            {
              group_id: groupId,
              user_id: userId,
              notification_mode: newMode,
              muted_until: newMutedUntil,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,group_id' }
          );

        if (error) {
          throw error;
        }

        successFeedback();
        setSaving(false);
        return { ok: true, error: null };
      } catch (err: any) {
        // Rollback
        setModeState(prevMode);
        setMutedUntilState(prevMuted);
        setSaving(false);
        errorFeedback();
        console.warn('[useGroupNotificationSettings] update failed:', err);
        return { ok: false, error: "Couldn't update notifications. Try again." };
      }
    },
    [groupId, userId, mode, mutedUntil]
  );

  const setNotificationMode = useCallback(
    async (nextMode: NotificationMode) => {
      return updateSettings(nextMode, mutedUntil);
    },
    [updateSettings, mutedUntil]
  );

  const setMuteDuration = useCallback(
    async (option: MuteOption) => {
      let nextMutedUntil: string | null = null;
      const now = Date.now();

      if (option === '1h') {
        nextMutedUntil = new Date(now + 60 * 60 * 1000).toISOString();
      } else if (option === '8h') {
        nextMutedUntil = new Date(now + 8 * 60 * 60 * 1000).toISOString();
      } else if (option === '1w') {
        nextMutedUntil = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (option === 'indefinite') {
        nextMutedUntil = INDEFINITE_MUTE_ISO;
      } else if (option === 'unmute') {
        nextMutedUntil = null;
      }

      return updateSettings(mode, nextMutedUntil);
    },
    [updateSettings, mode]
  );

  return {
    mode,
    mutedUntil,
    isMuted,
    muteStatusText: formatMuteStatus(mutedUntil),
    loading,
    saving,
    setNotificationMode,
    setMuteDuration,
    reload: load,
  };
}
