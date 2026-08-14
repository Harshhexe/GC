/**
 * Status callback for `channel.subscribe()`.
 *
 * A bare `.subscribe()` reports nothing when a channel fails to come up, and
 * the failure mode is badly non-local: if any one `postgres_changes` binding
 * names a table that isn't in the `supabase_realtime` publication, the server
 * rejects the *whole channel*, so every binding on it goes dead — not just the
 * offending one. The symptom is a screen that quietly only updates when you
 * reopen it, with nothing in the logs pointing anywhere near the cause. That
 * is exactly how an unpublished `groups` table stopped the chat list's
 * last-message preview from updating live.
 *
 * So: whenever you add a binding for a new table, add that table to the
 * publication too (see supabase/realtime_groups.sql).
 */
export function onChannelStatus(label: string) {
  return (status: string) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(
        `[realtime:${label}] channel ${status} — live updates are off here. ` +
          'Check every table this channel binds is in the supabase_realtime publication.'
      );
    }
  };
}
