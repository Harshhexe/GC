import { config } from '../config.ts';

/**
 * The database row, as fetched. Only the columns the AI layer is allowed to
 * see — no media URLs, no view-once state, no deleted-by attribution.
 */
export type MessageRow = {
  id: string;
  author_id: string | null;
  text: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  reply_to_message_id: string | null;
  mentions: { userId: string; username: string }[] | null;
  mention_everyone: boolean;
  media_type: 'image' | 'video' | 'gif' | 'file' | 'voice' | null;
  media_name: string | null;
};

/**
 * A message as the model sees it: identity, who said it, when, what it said,
 * and just enough structure to follow a thread. Everything else is dropped.
 */
export type NormalizedMessage = {
  id: string;
  sender: string;
  senderId: string | null;
  timestamp: string;
  text: string;
  /**
   * Sent by the person this context is being built for.
   *
   * Kept rather than filtered out because a reply reads as nonsense without
   * the message it answered — but an operation about what someone *missed*
   * must never report these back to them as news.
   */
  isOwn?: boolean;
  /** Who this replies to, by display name — enough to follow a thread. */
  replyTo?: { id: string; sender: string };
  mentions?: string[];
  /** Present only for attachments. The file itself is never sent. */
  media?: string;
  reactionCount?: number;
};

const MEDIA_LABEL: Record<NonNullable<MessageRow['media_type']>, string> = {
  image: '📷 Photo',
  video: '🎥 Video',
  gif: '🎞️ GIF',
  file: '📄 File',
  voice: '🎙️ Voice message',
};

/**
 * Attachments are described, never uploaded.
 *
 * No current operation reasons about pixels, so sending the bytes would be
 * pure cost — and it would put private photos through a third party for no
 * gain. A future feature that genuinely needs image understanding can opt in
 * explicitly; until then metadata is the honest representation.
 */
function mediaLabel(row: MessageRow): string | undefined {
  if (!row.media_type) return undefined;
  const label = MEDIA_LABEL[row.media_type];
  return row.media_type === 'file' && row.media_name ? `📄 ${row.media_name}` : label;
}

function clip(text: string): string {
  const limit = config.limits.maxCharsPerMessage;
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

/**
 * Rows → the compact shape the model reads.
 *
 * Deleted messages are dropped outright rather than rendered as tombstones:
 * "delete for everyone" means the content is gone, and an AI summary that
 * quoted a deleted message would quietly undo that.
 */
export function normalizeMessages(
  rows: MessageRow[],
  nameById: Map<string, string>,
  reactionsByMessage: Map<string, number>,
  hiddenIds: ReadonlySet<string>,
  viewerId?: string
): NormalizedMessage[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const nameFor = (id: string | null) =>
    id ? nameById.get(id) ?? 'someone' : 'Deleted User';

  const out: NormalizedMessage[] = [];
  for (const row of rows) {
    if (row.is_deleted) continue;
    // Messages the requesting user hid for themselves. Summarizing something
    // they chose not to see would leak it straight back to them.
    if (hiddenIds.has(row.id)) continue;

    const text = clip(row.text ?? '');
    const media = mediaLabel(row);
    if (!text && !media) continue; // nothing for the model to read

    const message: NormalizedMessage = {
      id: row.id,
      sender: nameFor(row.author_id),
      senderId: row.author_id,
      timestamp: row.created_at,
      text,
    };

    if (viewerId && row.author_id === viewerId) message.isOwn = true;

    if (media) message.media = media;

    const target = row.reply_to_message_id ? byId.get(row.reply_to_message_id) : undefined;
    if (target) {
      message.replyTo = { id: target.id, sender: nameFor(target.author_id) };
    }

    const mentioned = (row.mentions ?? []).map((m) => m.username).filter(Boolean);
    if (row.mention_everyone) mentioned.push('everyone');
    if (mentioned.length > 0) message.mentions = mentioned;

    const reactions = reactionsByMessage.get(row.id) ?? 0;
    if (reactions > 0) message.reactionCount = reactions;

    out.push(message);
  }

  return out;
}

/** "3:41 PM" — the clock the transcript is rendered with. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

/**
 * Renders the transcript the model actually reads.
 *
 * Message ids are inlined per line because every operation is expected to
 * cite them — the model cannot reference a message it was never shown the id
 * of, and that citation is what makes "tap an insight, jump to the message"
 * possible later.
 */
export function renderTranscript(messages: NormalizedMessage[]): string {
  return messages
    .map((m) => {
      // Marked inline so the model can tell, line by line, which messages
      // belong to the person it's writing for.
      const own = m.isOwn ? ' [THE READER]' : '';
      const head = `[${clockTime(m.timestamp)}] ${m.sender}${own} (id:${m.id})`;
      const reply = m.replyTo ? ` ↩ replying to ${m.replyTo.sender} (id:${m.replyTo.id})` : '';
      const media = m.media ? ` ${m.media}` : '';
      const reactions = m.reactionCount ? ` [${m.reactionCount} reactions]` : '';
      return `${head}${reply}:${media}${m.text ? ` ${m.text}` : ''}${reactions}`;
    })
    .join('\n');
}

/** Cheap size estimate — see config.charsPerToken for why it's approximate. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / config.charsPerToken);
}
