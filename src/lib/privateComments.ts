import { supabase } from './supabase';

/**
 * Private comments — a one-to-one side conversation attached to a public group
 * message, visible only to the two participants.
 *
 * Everything that matters for privacy is enforced in Postgres (RLS on
 * `private_comments`, plus a BEFORE INSERT trigger that derives the recipient
 * from the message's author). Nothing here is a security boundary: this module
 * only shapes what the database already agreed to return. That is deliberate —
 * a bug in this file can make the UI wrong, it cannot leak someone's comment.
 */

export type PrivateComment = {
  id: string;
  groupId: string;
  messageId: string;
  authorId: string;
  recipientId: string;
  /** The participant who is NOT the original message's author — the thread key. */
  threadUserId: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type PrivateCommentRow = {
  id: string;
  group_id: string;
  message_id: string;
  author_id: string;
  recipient_id: string;
  thread_user_id: string;
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export const PRIVATE_COMMENT_COLUMNS =
  'id, group_id, message_id, author_id, recipient_id, thread_user_id, text, created_at, edited_at, deleted_at';

export function toPrivateComment(row: PrivateCommentRow): PrivateComment {
  return {
    id: row.id,
    groupId: row.group_id,
    messageId: row.message_id,
    authorId: row.author_id,
    recipientId: row.recipient_id,
    threadUserId: row.thread_user_id,
    text: row.deleted_at ? '' : row.text,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Posts a comment. `recipientId` is only meaningful when the message's own
 * author is replying inside a thread — in every other case the trigger
 * overwrites whatever is sent here with the message author's id, so it cannot
 * be used to address a comment to an uninvolved third party.
 */
export async function sendPrivateComment(params: {
  groupId: string;
  messageId: string;
  authorId: string;
  recipientId: string;
  text: string;
}): Promise<{ error: string | null }> {
  const trimmed = params.text.trim();
  if (!trimmed) return { error: 'Comment is empty' };

  const { error } = await supabase.from('private_comments').insert({
    group_id: params.groupId,
    message_id: params.messageId,
    author_id: params.authorId,
    recipient_id: params.recipientId,
    text: trimmed,
  });
  return { error: error?.message ?? null };
}

export async function editPrivateComment(
  commentId: string,
  text: string
): Promise<{ error: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) return { error: 'Comment is empty' };
  const { error } = await supabase
    .from('private_comments')
    .update({ text: trimmed, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', commentId);
  return { error: error?.message ?? null };
}

/** Soft delete — the counterpart keeps a "deleted" tombstone, not the text. */
export async function deletePrivateComment(commentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('private_comments')
    .update({ deleted_at: new Date().toISOString(), text: '', updated_at: new Date().toISOString() })
    .eq('id', commentId);
  return { error: error?.message ?? null };
}
