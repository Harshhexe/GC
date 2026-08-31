import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

/**
 * Settles a GC slot purchase from a signed Cashfree webhook.
 *
 * This is the only place in the system that can turn a purchase into a paid
 * slot, so it is the one endpoint worth being paranoid about. It runs with
 * `--no-verify-jwt` (Cashfree has no Supabase session), which means the URL is
 * reachable by anyone who finds it. The signature check below is therefore not
 * a formality: without it, a stranger could POST a fabricated success event
 * and grant themselves unlimited GCs.
 *
 * Three rules hold the line:
 *
 * 1. The raw body is verified before it is parsed. Signatures are computed
 *    over exact bytes, so re-serialising JSON first would compare a different
 *    string than Cashfree signed and every legitimate event would fail.
 * 2. Nothing is trusted from the payload except the identifiers. The amount
 *    that matters is the one already in the database.
 * 3. Settlement is conditional on the row still being `created`, so a replayed
 *    webhook is a no-op rather than a second slot.
 */

/**
 * Cashfree signs `timestamp + rawBody` with the account's secret key and sends
 * the base64 HMAC-SHA256 in `x-webhook-signature`.
 */
const SIGNATURE_HEADER = 'x-webhook-signature';
const TIMESTAMP_HEADER = 'x-webhook-timestamp';

/** Replay window. A correctly signed event from days ago is not current. */
const MAX_SKEW_SECONDS = 15 * 60;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Constant-time compare, so a wrong signature cannot be found byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function expectedSignature(secret: string, timestamp: string, rawBody: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(timestamp + rawBody)
  );
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Use POST' }, 405);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const secretKey = Deno.env.get('CASHFREE_SECRET_KEY');
    if (!url || !serviceKey || !secretKey) {
      console.error('[gc-payment-webhook] missing configuration');
      return jsonResponse({ ok: false }, 500);
    }

    // Read the body as text, once, before anything parses it.
    const rawBody = await req.text();
    const signature = req.headers.get(SIGNATURE_HEADER) ?? '';
    const timestamp = req.headers.get(TIMESTAMP_HEADER) ?? '';

    if (!signature || !timestamp) {
      console.warn('[gc-payment-webhook] rejected: missing signature headers');
      return jsonResponse({ ok: false }, 401);
    }

    const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(skew) || skew > MAX_SKEW_SECONDS) {
      console.warn(`[gc-payment-webhook] rejected: timestamp skew ${skew}s`);
      return jsonResponse({ ok: false }, 401);
    }

    const expected = await expectedSignature(secretKey, timestamp, rawBody);
    if (!safeEqual(signature, expected)) {
      console.warn('[gc-payment-webhook] rejected: bad signature');
      return jsonResponse({ ok: false }, 401);
    }

    // Verified. Only now is the payload safe to read.
    let event: {
      type?: string;
      data?: {
        order?: { order_id?: string; order_tags?: Record<string, string> };
        payment?: { cf_payment_id?: string | number; payment_status?: string };
      };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ ok: false, error: 'Bad JSON' }, 400);
    }

    /*
     * The dashboard's "Test" button sends a connectivity ping, not a payment:
     * `{ type: 'WEBHOOK', data: { test_object: ... } }` with no order and no
     * payment anywhere in it. Recognised explicitly so a routine setup check
     * does not log as a missing purchase and read like a real failure.
     */
    if (event.type === 'WEBHOOK' || (event as Record<string, unknown>).data?.hasOwnProperty?.('test_object')) {
      console.log('[gc-payment-webhook] test ping acknowledged');
      return jsonResponse({ ok: true, test: true });
    }

    /*
     * Structure only (keys plus our own identifiers, never customer values).
     * Kept until a real payment has settled once, because the first live event
     * is the only thing that can confirm this parser matches the payload the
     * account's webhook version actually sends.
     */
    console.log(
      `[gc-payment-webhook] shape type=${event.type ?? 'none'} ` +
      `data=${Object.keys((event as Record<string, unknown>).data ?? {}).join(',')} ` +
      `order=${Object.keys(event.data?.order ?? {}).join(',')} ` +
      `payment=${Object.keys(event.data?.payment ?? {}).join(',')}`
    );

    const orderId = event.data?.order?.order_id ?? '';
    const purchaseId = event.data?.order?.order_tags?.purchase_id ?? '';
    const paymentId = event.data?.payment?.cf_payment_id;
    const paymentStatus = event.data?.payment?.payment_status ?? '';
    const type = event.type ?? '';

    const asService = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /*
     * Locate the row by the tag we set at order time, falling back to the
     * order id. Both are values this system generated, never anything the
     * payer could choose.
     */
    const lookup = purchaseId
      ? asService.from('gc_purchases').select('id, status').eq('id', purchaseId)
      : asService.from('gc_purchases').select('id, status').eq('provider_order_id', orderId);

    const { data: rows } = await lookup.limit(1);
    const row = rows?.[0];

    if (!row) {
      // Acknowledged anyway: a 4xx makes Cashfree retry an event that will
      // never match, and an unknown order is not an error this system can fix.
      console.warn(`[gc-payment-webhook] no purchase for order ${orderId}`);
      return jsonResponse({ ok: true, matched: false });
    }

    const success = type === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS';

    if (!success) {
      // Only a still-open purchase is marked failed, so a late failure event
      // can never un-pay a settled slot.
      if (row.status === 'created') {
        await asService
          .from('gc_purchases')
          .update({ status: 'failed', provider_payment_id: paymentId ? String(paymentId) : null })
          .eq('id', row.id)
          .eq('status', 'created');
      }
      return jsonResponse({ ok: true, settled: false });
    }

    /*
     * The idempotency guard. `.eq('status', 'created')` means a duplicate or
     * replayed success event updates zero rows instead of granting a second
     * slot, and it is enforced by the database rather than by checking first
     * and writing after.
     */
    const { data: updated } = await asService
      .from('gc_purchases')
      .update({
        status: 'paid',
        provider_payment_id: paymentId ? String(paymentId) : null,
        paid_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'created')
      .select('id');

    const settled = (updated?.length ?? 0) > 0;
    console.log(
      `[gc-payment-webhook] order=${orderId} purchase=${row.id} settled=${settled}`
    );

    return jsonResponse({ ok: true, settled });
  } catch (error) {
    console.error(`[gc-payment-webhook] ${String(error)}`);
    // 500 so Cashfree retries: a transient failure here would otherwise mean a
    // real payment silently never grants its slot.
    return jsonResponse({ ok: false }, 500);
  }
});
