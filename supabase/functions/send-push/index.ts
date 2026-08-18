import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

/**
 * Fans one new message or special event out to group members' devices as a push
 * notification.
 *
 * Called by:
 * 1. The `messages` insert trigger (supabase/push.sql) with { messageId }
 * 2. Event triggers (tea started, weekly awards, 11:11) with { eventType, groupId, ... }
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
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
      console.error('[send-push] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
      return json({ ok: false, error: 'Server is not configured' }, 500);
    }

    const provided = req.headers.get('x-cron-secret');
    if (!cronSecret || !provided || !timingSafeEqual(cronSecret, provided)) {
      console.error('[send-push] Auth failed');
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    let body: {
      messageId?: string;
      eventType?: 'message' | '11_11' | 'tea_started' | 'awards';
      groupId?: string;
      userId?: string;
      customTitle?: string;
      customBody?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid request body' }, 400);
    }

    const db = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const eventType = body.eventType || (body.messageId ? 'message' : null);

    // ==========================================
    // CASE 1: 11:11 Make a Wish Alert
    // ==========================================
    if (eventType === '11_11') {
      const { data: tokens } = await db.from('device_push_tokens').select('token, user_id');
      const tokenRows = (tokens ?? []) as TokenRow[];
      if (tokenRows.length === 0) return json({ ok: true, sent: 0 });

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title: '✨ 11:11 Make a Wish! 🕯️',
        body: 'The 60-second wish window is open right now.',
        sound: 'default',
        categoryId: 'gc_event',
        data: { type: '11_11' },
        priority: 'high',
      }));

      const sent = await sendToExpo(messages, db);
      return json({ ok: true, sent });
    }

    // ==========================================
    // CASE 2: Tea Started in a Group
    // ==========================================
    if (eventType === 'tea_started' && body.groupId) {
      const [{ data: group }, { data: starter }, { data: members }] = await Promise.all([
        db.from('groups').select('name, emoji, avatar_url').eq('id', body.groupId).maybeSingle(),
        body.userId
          ? db.from('profiles').select('display_name, avatar_emoji').eq('id', body.userId).maybeSingle()
          : Promise.resolve({ data: null }),
        db.from('group_members').select('user_id').eq('group_id', body.groupId).eq('muted', false),
      ]);

      const groupName = group?.name ?? 'your GC';
      const groupEmoji = group?.emoji ? `${group.emoji} ` : '';
      const starterName = starter?.display_name ?? 'Someone';

      const recipientIds = (members ?? [])
        .map((m) => m.user_id as string)
        .filter((id) => id !== body.userId);
      if (recipientIds.length === 0) return json({ ok: true, sent: 0 });

      const { data: tokens } = await db
        .from('device_push_tokens')
        .select('token, user_id')
        .in('user_id', recipientIds);

      const tokenRows = (tokens ?? []) as TokenRow[];
      if (tokenRows.length === 0) return json({ ok: true, sent: 0 });

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title: `☕ Tea Started in ${groupEmoji}${groupName}`,
        body: `${starterName} just started Tea — join the spill!`,
        sound: 'default',
        categoryId: 'gc_event',
        threadId: body.groupId,
        data: {
          type: 'tea_started',
          groupId: body.groupId,
          groupName,
          groupEmoji: group?.emoji ?? '🍵',
          groupAvatarUrl: group?.avatar_url ?? null,
        },
        priority: 'high',
      }));

      const sent = await sendToExpo(messages, db);
      return json({ ok: true, sent });
    }

    // ==========================================
    // CASE 3: Weekly Awards Ready
    // ==========================================
    if (eventType === 'awards' && body.groupId) {
      const [{ data: group }, { data: members }] = await Promise.all([
        db.from('groups').select('name, emoji, avatar_url').eq('id', body.groupId).maybeSingle(),
        db.from('group_members').select('user_id').eq('group_id', body.groupId).eq('muted', false),
      ]);

      const groupName = group?.name ?? 'your GC';
      const groupEmoji = group?.emoji ? `${group.emoji} ` : '';
      const recipientIds = (members ?? []).map((m) => m.user_id as string);
      if (recipientIds.length === 0) return json({ ok: true, sent: 0 });

      const { data: tokens } = await db
        .from('device_push_tokens')
        .select('token, user_id')
        .in('user_id', recipientIds);

      const tokenRows = (tokens ?? []) as TokenRow[];
      if (tokenRows.length === 0) return json({ ok: true, sent: 0 });

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title: `🏆 Weekly Awards are here!`,
        body: `See who won this week in ${groupEmoji}${groupName}`,
        sound: 'default',
        categoryId: 'gc_event',
        threadId: body.groupId,
        data: {
          type: 'awards',
          groupId: body.groupId,
          groupName,
          groupEmoji: group?.emoji ?? '🏆',
          groupAvatarUrl: group?.avatar_url ?? null,
        },
        priority: 'default',
      }));

      const sent = await sendToExpo(messages, db);
      return json({ ok: true, sent });
    }

    // ==========================================
    // CASE 3.5: Group Stats (Today's One Word)
    // ==========================================
    if ((eventType === 'group_stats' || eventType === 'daily_stats') && body.groupId) {
      const [{ data: group }, { data: members }] = await Promise.all([
        db.from('groups').select('name, emoji, avatar_url').eq('id', body.groupId).maybeSingle(),
        db.from('group_members').select('user_id').eq('group_id', body.groupId).eq('muted', false),
      ]);

      const groupName = group?.name ?? 'your GC';
      const groupEmoji = group?.emoji ? `${group.emoji} ` : '';
      const oneWord = (body as any).oneWord || 'chaotic';
      const recipientIds = (members ?? []).map((m) => m.user_id as string);
      if (recipientIds.length === 0) return json({ ok: true, sent: 0 });

      const { data: tokens } = await db
        .from('device_push_tokens')
        .select('token, user_id')
        .in('user_id', recipientIds);

      const tokenRows = (tokens ?? []) as TokenRow[];
      if (tokenRows.length === 0) return json({ ok: true, sent: 0 });

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title: `📊 Group stats are here!`,
        body: `Today's one word: "${oneWord}" — see who ruled ${groupEmoji}${groupName}`,
        sound: 'default',
        categoryId: 'gc_event',
        threadId: body.groupId,
        data: {
          type: 'group_stats',
          groupId: body.groupId,
          groupName,
          groupEmoji: group?.emoji ?? '📊',
          groupAvatarUrl: group?.avatar_url ?? null,
          oneWord,
        },
        priority: 'default',
      }));

      const sent = await sendToExpo(messages, db);
      return json({ ok: true, sent });
    }

    // ==========================================
    // CASE 4: Standard Chat Message
    // ==========================================
    const messageId = typeof body.messageId === 'string' ? body.messageId : null;
    if (!messageId) {
      return json({ ok: false, error: 'Missing messageId' }, 400);
    }

    const { data: message, error: messageError } = await db
      .from('messages')
      .select('id, group_id, author_id, text, media_type, is_deleted, mention_everyone')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError) {
      console.error(`[send-push] message lookup failed: ${messageError.message}`);
      return json({ ok: false, error: 'Lookup failed' }, 500);
    }
    if (!message || message.is_deleted) {
      return json({ ok: true, sent: 0, skipped: 'gone' });
    }

    const [{ data: group }, { data: author }, { data: members }] = await Promise.all([
      db.from('groups').select('name, emoji, avatar_url').eq('id', message.group_id).maybeSingle(),
      message.author_id
        ? db
            .from('profiles')
            .select('display_name, avatar_emoji, avatar_color, avatar_url')
            .eq('id', message.author_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from('group_members')
        .select('user_id')
        .eq('group_id', message.group_id)
        .eq('muted', false),
    ]);

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

    const { data: mentionRows } = await db
      .from('notifications')
      .select('user_id')
      .eq('message_id', message.id)
      .in('kind', ['mention', 'mention_everyone']);
    const mentionedIds = new Set((mentionRows ?? []).map((r) => r.user_id as string));

    const groupName = group?.name ?? 'your GC';
    const groupEmojiPrefix = group?.emoji ? `${group.emoji} ` : '';
    const authorName = author?.display_name ?? 'Someone';
    const authorEmojiPrefix = author?.avatar_emoji ? `${author.avatar_emoji} ` : '';
    const preview = previewFor(message.text, message.media_type);

    // Coalesce per recipient. Expo's push API has no Android grouping flag
    // (threadId below is iOS-only), so every push becomes its own card in the
    // shade — which is why a burst of eight messages produced eight
    // notifications. Sending one per conversation per window is the part of
    // WhatsApp's behaviour reachable without native MessagingStyle code.
    //
    // Decided per recipient, not per message: each member has their own
    // window, and someone who just read the chat should be notified
    // immediately while someone who hasn't stays coalesced.
    const coalesceByUser = new Map<string, number>();
    for (const userId of new Set(tokenRows.map((r) => r.user_id))) {
      // A mention always breaks through — being tagged is the case where a
      // delayed or suppressed notification is genuinely costly.
      if (mentionedIds.has(userId)) {
        coalesceByUser.set(userId, 1);
        continue;
      }
      const { data: count } = await db.rpc('push_should_notify', {
        p_user_id: userId,
        p_group_id: message.group_id,
      });
      coalesceByUser.set(userId, typeof count === 'number' ? count : 1);
    }

    const messages = tokenRows
      .filter((row) => (coalesceByUser.get(row.user_id) ?? 1) > 0)
      .map((row) => {
      const mentioned = mentionedIds.has(row.user_id);
      const pending = coalesceByUser.get(row.user_id) ?? 1;
      // More than one banked: report the count rather than only the newest
      // line, so a single card still tells you how much is waiting.
      const bodyText =
        pending > 1
          ? `${pending} new messages`
          : mentioned
            ? preview
            : `${authorEmojiPrefix}${authorName}: ${preview}`;
      return {
        to: row.token,
        title: mentioned
          ? `${authorName} mentioned you in ${groupEmojiPrefix}${groupName}`
          : `${groupEmojiPrefix}${groupName}`,
        body: bodyText,
        sound: 'default',
        categoryId: 'gc_message',
        threadId: message.group_id,
        data: {
          type: 'message',
          groupId: message.group_id,
          messageId: message.id,
          groupName,
          groupEmoji: group?.emoji ?? '💬',
          groupAvatarUrl: group?.avatar_url ?? null,
          authorName,
          authorEmoji: author?.avatar_emoji ?? null,
          authorColor: author?.avatar_color ?? '#818CF8',
          authorAvatarUrl: author?.avatar_url ?? null,
          text: preview,
        },
        priority: mentioned ? 'high' : 'default',
      };
    });

    const sent = await sendToExpo(messages, db);
    return json({ ok: true, sent });
  } catch (error) {
    console.error(`[send-push] ${String(error)}`);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
});

async function sendToExpo(messages: any[], db: any): Promise<number> {
  let sent = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
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
          invalidTokens.push(chunk[idx].to);
        }
      });
    } catch (e) {
      console.error('[send-push] fetch error:', e);
    }
  }

  if (invalidTokens.length > 0) {
    await db.from('device_push_tokens').delete().in('token', invalidTokens);
  }

  return sent;
}

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
