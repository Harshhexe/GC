import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

/**
 * Fans one new message out to every group member's devices as a push
 * notification.
 *
 * Called only by the `messages` insert trigger (see supabase/push.sql), never
 * by the app — the trigger proves who it is with the same `x-cron-secret`
 * vault secret the weekly-awards job uses. Everything here runs with the
 * service role, because deciding who to notify means reading other people's
 * memberships and device tokens, which no member is allowed to do.
 *
 * Delivery goes through Expo's push service rather than APNs/FCM directly:
 * one endpoint covers both platforms, it needs no signing key held here, and
 * it's free. The tradeoff is that Expo has to hold the APNs key for iOS —
 * see the note in src/lib/push.ts about the Apple Developer account.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo rejects batches larger than this. */
const CHUNK_SIZE = 100;
/** Notification body is a preview, not the message — keep it short. */
const MAX_BODY_CHARS = 140;

type TokenRow = { token: string; user_id: string };

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Use POST' }, 405);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const cronSecret = Deno.env.get('GC_AI_CRON_SECRET');
    if (!url || !serviceKey) {
      return json({ ok: false, error: 'Server is not configured' }, 500);
    }

    // Constant-time compare — a secret-equality check with a timing side
    // channel is not a secret-equality check.
    const provided = req.headers.get('x-cron-secret');
    if (!cronSecret || !provided || !timingSafeEqual(cronSecret, provided)) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    let body: { messageId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid request body' }, 400);
    }
    const messageId = typeof body.messageId === 'string' ? body.messageId : null;
    if (!messageId) return json({ ok: false, error: 'Missing messageId' }, 400);

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: message, error: messageError } = await db
      .from('messages')
      .select('id, group_id, author_id, text, media_type, is_deleted, mention_everyone')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError) {
      console.error(`[send-push] message lookup failed: ${messageError.message}`);
      return json({ ok: false, error: 'Lookup failed' }, 500);
    }
    // Deleted between the trigger firing and this running: the push would
    // deliver a preview of a message that no longer exists.
    if (!message || message.is_deleted) return json({ ok: true, sent: 0, skipped: 'gone' });

    const [{ data: group }, { data: author }, { data: members }] = await Promise.all([
      db.from('groups').select('name, emoji').eq('id', message.group_id).maybeSingle(),
      message.author_id
        ? db.from('profiles').select('display_name').eq('id', message.author_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from('group_members')
        .select('user_id')
        .eq('group_id', message.group_id)
        .eq('muted', false),
    ]);

    // Never notify yourself about your own message.
    const recipientIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== message.author_id);
    if (recipientIds.length === 0) return json({ ok: true, sent: 0 });

    const { data: tokens } = await db
      .from('device_push_tokens')
      .select('token, user_id')
      .in('user_id', recipientIds);

    const tokenRows = (tokens ?? []) as TokenRow[];
    if (tokenRows.length === 0) return json({ ok: true, sent: 0 });

    // Who was actually @mentioned, so their push can say so — mention rows are
    // already written by the mentions trigger, so this reuses that work
    // instead of re-parsing the message text here.
    const { data: mentionRows } = await db
      .from('notifications')
      .select('user_id')
      .eq('message_id', message.id)
      .in('kind', ['mention', 'mention_everyone']);
    const mentionedIds = new Set((mentionRows ?? []).map((r) => r.user_id as string));

    const groupName = group?.name ?? 'your GC';
    const authorName = author?.display_name ?? 'Someone';
    const preview = previewFor(message.text, message.media_type);

    const messages = tokenRows.map((row) => {
      const mentioned = mentionedIds.has(row.user_id);
      return {
        to: row.token,
        title: mentioned ? `${authorName} mentioned you in ${groupName}` : groupName,
        body: mentioned ? preview : `${authorName}: ${preview}`,
        sound: 'default',
        // Collapses to one notification per group rather than stacking a
        // separate row for every message in a busy chat.
        categoryId: 'gc_message',
        threadId: message.group_id,
        // Read by the tap handler in src/lib/push.ts to open the right chat
        // at the right message.
        data: {
          type: 'message',
          groupId: message.group_id,
          messageId: message.id,
        },
        priority: mentioned ? 'high' : 'default',
      };
    });

    let sent = 0;
    const invalidTokens: string[] = [];

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        console.error(`[send-push] Expo returned ${res.status}`);
        continue;
      }

      const payload = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (payload.data ?? []).forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          sent++;
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          // The app was uninstalled or the token rotated. Expo will keep
          // rejecting it forever, so drop it rather than retrying every send.
          invalidTokens.push(chunk[idx].to);
        }
      });
    }

    if (invalidTokens.length > 0) {
      await db.from('device_push_tokens').delete().in('token', invalidTokens);
    }

    return json({ ok: true, sent, pruned: invalidTokens.length });
  } catch (error) {
    console.error(`[send-push] ${String(error)}`);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
});

/** Media messages have no text — say what arrived rather than showing a
 *  blank body. Mirrors describeMedia() on the client. */
function previewFor(text: string | null, mediaType: string | null): string {
  const trimmed = (text ?? '').trim();
  if (trimmed) {
    return trimmed.length > MAX_BODY_CHARS ? `${trimmed.slice(0, MAX_BODY_CHARS - 1)}…` : trimmed;
  }
  switch (mediaType) {
    case 'image':
      return '📷 Photo';
    case 'gif':
      return '🎞️ GIF';
    case 'video':
      return '🎥 Video';
    case 'voice':
      return '🎙️ Voice message';
    case 'sticker':
      return '🏷️ Sticker';
    case 'file':
      return '📄 Document';
    default:
      return 'Sent a message';
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
