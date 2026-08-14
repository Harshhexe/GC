import { supabase } from './supabase';

/**
 * Stamp a group as read up to now for the current user.
 *
 * Goes through the `mark_group_read` RPC rather than a plain update because
 * the write is conditional on the row's own current value: it shifts the old
 * watermark into `prev_read_at` when the user is returning after time away,
 * and leaves it alone when they're mid-sitting. PostgREST can't express
 * "set a column from another column", and doing it as read-then-write in JS
 * would race with the marks this same screen fires on every new message.
 *
 * That preserved boundary is what What Did I Miss? reads — without it, simply
 * opening the chat would erase the answer to "what did I miss".
 *
 * Fire-and-forget by design: the badge clearing is cosmetic, so a failed write
 * should never block opening a chat or surface an error at the user. The next
 * successful mark corrects it.
 */
export async function markGroupRead(groupId: string, userId: string | undefined) {
  if (!groupId || !userId) return;
  await supabase
    .rpc('mark_group_read', { p_group_id: groupId })
    .then(undefined, () => {});
}
