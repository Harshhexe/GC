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

/**
 * Retire the preserved boundary — "I have now caught up to here".
 *
 * The boundary above is written when you return after a gap and then read for
 * the rest of the sitting, which is what lets you open a chat and still ask
 * what you missed. But nothing ever spent it, so the answer kept being
 * re-delivered: read the messages, reply to them, open What Did I Miss?, and
 * it recaps what you just replied to. Reopening it then matched the same
 * message set, so the AI cache returned the byte-identical recap again.
 *
 * Called when the user sends a message in the group. Sending is treated as
 * proof of having read — you don't reply to a conversation you haven't seen —
 * which is the behaviour asked for, though it does mean firing off a message
 * without scrolling up also clears it.
 *
 * Not called when a recap is merely displayed, even though that would also
 * stop it repeating: a recap is alive for ten minutes and the screen shows a
 * countdown saying so, so leaving and coming back inside that window has to
 * show the same recap. Spending the boundary on view made the next resolve
 * answer "you're caught up" and the recap vanished mid-countdown.
 *
 * Fire-and-forget for the same reason as markGroupRead: this is bookkeeping,
 * and it must never be able to fail a send or block a screen.
 */
export async function consumeMissedBoundary(groupId: string, userId: string | undefined) {
  if (!groupId || !userId) return;
  await supabase
    .rpc('gc_consume_missed_boundary', { p_group_id: groupId })
    .then(undefined, () => {});
}
