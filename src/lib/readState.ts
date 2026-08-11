import { supabase } from './supabase';

/**
 * Stamp a group as read up to now for the current user.
 *
 * Fire-and-forget by design: the badge clearing is cosmetic, so a failed
 * write should never block opening a chat or surface an error at the user.
 * The next successful mark corrects it.
 */
export async function markGroupRead(groupId: string, userId: string | undefined) {
  if (!groupId || !userId) return;
  await supabase
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .match({ group_id: groupId, user_id: userId })
    .then(undefined, () => {});
}
