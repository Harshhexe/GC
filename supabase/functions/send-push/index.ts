import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import webpush from 'npm:web-push@^3.6.7';

/**
 * Fans one new message or special event out to group members' devices as a push
 * notification.
 *
 * Called by:
 * 1. The `messages` insert trigger (supabase/push.sql) with { messageId }
 * 2. Event triggers (tea started, weekly awards, 11:11) with { eventType, groupId, ... }
 *
 * Two independent delivery mechanisms, run side by side: Expo's push service
 * for native devices (device_push_tokens), and VAPID-signed Web Push for
 * browsers (web_push_subscriptions) — the latter is what reaches a closed
 * tab or an iOS PWA that isn't running, which Expo's web stub can't do at all.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
const MAX_BODY_CHARS = 140;

type TokenRow = { token: string; user_id: string };
type WebPushItem = {
  userId: string;
  title: string;
  body: string;
  tag?: string;
  /** Shown as the notification's image. The group's avatar, so the card is
   *  identified by the GC the same way the title is. */
  icon?: string | null;
  data?: Record<string, unknown>;
};

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
      const [{ data: tokens }, { data: webSubs }] = await Promise.all([
        db.from('device_push_tokens').select('token, user_id'),
        db.from('web_push_subscriptions').select('user_id'),
      ]);
      const tokenRows = (tokens ?? []) as TokenRow[];
      const webUserIds = Array.from(new Set((webSubs ?? []).map((r: { user_id: string }) => r.user_id)));
      if (tokenRows.length === 0 && webUserIds.length === 0) return json({ ok: true, sent: 0 });

      const title = '✨ 11:11 Make a Wish! 🕯️';
      const body = 'The 60-second wish window is open right now.';

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title,
        body,
        sound: 'default',
        categoryId: 'gc_event',
        data: { type: '11_11' },
        priority: 'high',
      }));

      const webItems: WebPushItem[] = webUserIds.map((userId) => ({
        userId,
        title,
        body,
        data: { type: '11_11' },
      }));

      const [sent, webSent] = await Promise.all([sendToExpo(messages, db), sendToWebPush(webItems, db)]);
      return json({ ok: true, sent: sent + webSent });
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
      const title = `☕ Tea Started in ${groupEmoji}${groupName}`;
      const previewBody = `${starterName} just started Tea — join the spill!`;
      const eventData = {
        type: 'tea_started',
        groupId: body.groupId,
        groupName,
        groupEmoji: group?.emoji ?? '🍵',
        groupAvatarUrl: group?.avatar_url ?? null,
      };

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title,
        body: previewBody,
        sound: 'default',
        categoryId: 'gc_event',
        threadId: body.groupId,
        data: eventData,
        priority: 'high',
      }));

      const webItems: WebPushItem[] = recipientIds.map((userId) => ({
        userId,
        title,
        body: previewBody,
        tag: body.groupId,
        icon: group?.avatar_url ?? null,
        data: eventData,
      }));

      const [sent, webSent] = await Promise.all([sendToExpo(messages, db), sendToWebPush(webItems, db)]);
      return json({ ok: true, sent: sent + webSent });
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
      const title = `🏆 Weekly Awards are here!`;
      const previewBody = `See who won this week in ${groupEmoji}${groupName}`;
      const eventData = {
        type: 'awards',
        groupId: body.groupId,
        groupName,
        groupEmoji: group?.emoji ?? '🏆',
        groupAvatarUrl: group?.avatar_url ?? null,
      };

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title,
        body: previewBody,
        sound: 'default',
        categoryId: 'gc_event',
        threadId: body.groupId,
        data: eventData,
        priority: 'default',
      }));

      const webItems: WebPushItem[] = recipientIds.map((userId) => ({
        userId,
        title,
        body: previewBody,
        tag: body.groupId,
        icon: group?.avatar_url ?? null,
        data: eventData,
      }));

      const [sent, webSent] = await Promise.all([sendToExpo(messages, db), sendToWebPush(webItems, db)]);
      return json({ ok: true, sent: sent + webSent });
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
      const title = `📊 Group stats are here!`;
      const previewBody = `Today's one word: "${oneWord}" — see who ruled ${groupEmoji}${groupName}`;
      const eventData = {
        type: 'group_stats',
        groupId: body.groupId,
        groupName,
        groupEmoji: group?.emoji ?? '📊',
        groupAvatarUrl: group?.avatar_url ?? null,
        oneWord,
      };

      const messages = tokenRows.map((row) => ({
        to: row.token,
        title,
        body: previewBody,
        sound: 'default',
        categoryId: 'gc_event',
        threadId: body.groupId,
        data: eventData,
        priority: 'default',
      }));

      const webItems: WebPushItem[] = recipientIds.map((userId) => ({
        userId,
        title,
        body: previewBody,
        tag: body.groupId,
        icon: group?.avatar_url ?? null,
        data: eventData,
      }));

      const [sent, webSent] = await Promise.all([sendToExpo(messages, db), sendToWebPush(webItems, db)]);
      return json({ ok: true, sent: sent + webSent });
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

    // No early-exit on an empty tokenRows here (unlike the other cases) — a
    // group whose members only have web push subscriptions, no Expo tokens
    // at all, must still fall through to the coalescing + web push logic
    // below rather than short-circuit before it's ever reached.
    const tokenRows = (tokens ?? []) as TokenRow[];

    const { data: mentionRows } = await db
      .from('notifications')
      .select('user_id')
      .eq('message_id', message.id)
      .in('kind', ['mention', 'mention_everyone']);
    const mentionedIds = new Set((mentionRows ?? []).map((r) => r.user_id as string));

    // Plain names, no emoji prefixes: the card reads
    //   <group avatar>  Group Name
    //                   Member Name: message
    // so the group's identity comes from the avatar + title, and the body is
    // only ever "who said what".
    const groupName = group?.name ?? 'your GC';
    const authorName = author?.display_name ?? 'Someone';
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
    // Over every recipient, not just those with an Expo token — a member who
    // only ever registered a web push subscription still needs a decision
    // made for them, or they'd never be notified on any channel at all.
    const coalesceByUser = new Map<string, number>();
    for (const userId of new Set(recipientIds)) {
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
      // Always show the actual message content so the user sees what was said
      const bodyText = `${authorName}: ${preview}`;
      return {
        to: row.token,
        title: mentioned ? `${authorName} mentioned you in ${groupName}` : groupName,
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

    // Web push deliberately skips the coalescing window — every message goes
    // out the moment it lands.
    //
    // The window exists because Expo's push API has no way to group or replace
    // an Android notification, so the only way to avoid a wall of cards is to
    // send fewer of them — at the cost of the recipient waiting. Web Push has
    // no such limitation: the service worker sets `tag` to the group id, and a
    // notification with an existing tag *replaces* the one already showing for
    // that conversation. That is the same "one card per chat" outcome the
    // window is buying on native, except immediate, so paying the delay here
    // would be cost without benefit.
    const webItems: WebPushItem[] = recipientIds.map((userId) => ({
      userId,
      title: mentionedIds.has(userId)
        ? `${authorName} mentioned you in ${groupName}`
        : groupName,
      body: `${authorName}: ${preview}`,
      tag: message.group_id,
      icon: group?.avatar_url ?? null,
      data: {
        type: 'message',
        groupId: message.group_id,
        messageId: message.id,
      },
    }));

    const [sent, webSent] = await Promise.all([sendToExpo(messages, db), sendToWebPush(webItems, db)]);
    return json({ ok: true, sent: sent + webSent });
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

/**
 * Delivers to every browser subscription on file for each item's user, via
 * VAPID-signed Web Push. Silently no-ops if the VAPID keys aren't configured
 * yet (dev environments that haven't set them) rather than failing the whole
 * fan-out — native delivery must not depend on web push being set up.
 */
async function sendToWebPush(items: WebPushItem[], db: any): Promise<number> {
  if (items.length === 0) return 0;

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublic || !vapidPrivate) return 0;

  // Hardcoded rather than read from an env var: Apple's push service
  // validates the VAPID JWT `sub` claim far more strictly than Chrome/
  // Firefox's endpoints do — an invalid or placeholder subject (an empty
  // string, "https://localhost", etc.) gets silently accepted everywhere
  // except web.push.apple.com, which 403s with {"reason":"BadJwtToken"}.
  // A misconfigured secret is exactly how that happens, so this removes
  // the misconfiguration surface instead of trying to validate it.
  webpush.setVapidDetails('mailto:hdhiman0302@gmail.com', vapidPublic, vapidPrivate);

  const userIds = Array.from(new Set(items.map((i) => i.userId)));
  const { data: subs } = await db
    .from('web_push_subscriptions')
    .select('endpoint, user_id, p256dh, auth')
    .in('user_id', userIds);

  const subRows = (subs ?? []) as { endpoint: string; user_id: string; p256dh: string; auth: string }[];
  if (subRows.length === 0) return 0;

  const byUser = new Map<string, typeof subRows>();
  for (const s of subRows) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  let sent = 0;
  const deadEndpoints: string[] = [];

  for (const item of items) {
    const subsForUser = byUser.get(item.userId);
    if (!subsForUser) continue;

    for (const s of subsForUser) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: item.title,
            body: item.body,
            tag: item.tag,
            icon: item.icon ?? null,
            data: item.data ?? {},
          })
        );
        sent++;
      } catch (e: any) {
        // 404/410: the browser or OS dropped this subscription (uninstalled,
        // permission revoked, storage cleared) — dead, so it's cleaned up
        // rather than retried forever. Anything else is a transient/delivery
        // error worth logging but not worth deleting a still-live sub over.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          deadEndpoints.push(s.endpoint);
        } else {
          console.error(
            '[send-push] web push error:',
            e?.statusCode,
            e?.body || e?.message || e,
            'endpoint:',
            s.endpoint.slice(0, 40)
          );
        }
      }
    }
  }

  if (deadEndpoints.length > 0) {
    await db.from('web_push_subscriptions').delete().in('endpoint', deadEndpoints);
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
