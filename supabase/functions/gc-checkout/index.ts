import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

/**
 * Opens a Cashfree order for one additional GC slot.
 *
 * The client never sees the Cashfree secret key and never states the price.
 * It sends only a purchase id; this function reads the amount back out of
 * `gc_purchases` (where the guard trigger already stamped it from
 * `gc_slot_price_paise()`), so a tampered request buys the same slot at the
 * same price as an honest one.
 *
 * Nothing here settles anything. A successful Cashfree order means a payment
 * page exists, not that money moved — the row stays `created` until the
 * webhook verifies a signed event. See gc-payment-webhook.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Cashfree pins request/response shape to a dated version header. Kept in one
 * place so a version bump is a one-line change rather than a hunt.
 */
const CASHFREE_API_VERSION = '2023-08-01';

/** Confirmation page the payer lands on after Cashfree finishes. */
const CONFIRM_PAGE = 'https://the-gc.vercel.app/paid';

function baseUrl(env: string) {
  return env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = Deno.env.get('CASHFREE_APP_ID');
    const secretKey = Deno.env.get('CASHFREE_SECRET_KEY');
    const cfEnv = Deno.env.get('CASHFREE_ENV') ?? 'sandbox';

    if (!url || !anonKey || !serviceKey || !appId || !secretKey) {
      return jsonResponse({ ok: false, error: 'Server is not configured' }, 500);
    }

    // ── Handle GET: Verification check for confirmation / return page ────
    if (req.method === 'GET') {
      const reqUrl = new URL(req.url);
      const orderId = reqUrl.searchParams.get('order');
      if (!orderId) {
        return jsonResponse({ ok: false, error: 'Missing order parameter' }, 400);
      }

      let cfOrder: any = null;
      try {
        const cfRes = await fetch(
          `${baseUrl(cfEnv)}/orders/${encodeURIComponent(orderId)}`,
          {
            headers: {
              'x-api-version': CASHFREE_API_VERSION,
              'x-client-id': appId,
              'x-client-secret': secretKey,
            },
          }
        );
        cfOrder = await cfRes.json().catch(() => null);
      } catch (err) {
        console.error(`[gc-checkout] Cashfree check failed for ${orderId}: ${String(err)}`);
      }

      const asService = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: dbPurchase } = await asService
        .from('gc_purchases')
        .select('status')
        .eq('provider_order_id', orderId)
        .maybeSingle();

      const isPaid = cfOrder?.order_status === 'PAID' || dbPurchase?.status === 'paid';

      return jsonResponse({
        ok: true,
        orderId,
        orderStatus: cfOrder?.order_status ?? (isPaid ? 'PAID' : 'UNKNOWN'),
        isPaid,
      });
    }

    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Use GET or POST' }, 405);
    }

    // A real session is required: a purchase belongs to a specific account,
    // and the order Cashfree creates is tagged with that account's id.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'Missing Authorization header' }, 401);

    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await asUser.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ ok: false, error: 'Invalid session' }, 401);
    }
    const user = userData.user;

    let body: { purchaseId?: unknown; phone?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const purchaseId = typeof body.purchaseId === 'string' ? body.purchaseId : '';
    const phoneParam = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (!purchaseId) {
      return jsonResponse({ ok: false, error: 'Missing purchaseId' }, 400);
    }

    let cleanPhone = phoneParam.replace(/\D/g, '');
    if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
      cleanPhone = cleanPhone.slice(2);
    }
    const customerPhone = cleanPhone.length === 10
      ? cleanPhone
      : (user.phone && user.phone.replace(/\D/g, '').length >= 10)
        ? user.phone.replace(/\D/g, '').slice(-10)
        : '9999999999';

    /*
     * Read the purchase with the caller's own client, not the service role.
     * RLS then does the ownership check for us: another user's purchase id
     * simply returns no row, so this cannot be used to open an order against
     * somebody else's account.
     */
    const { data: purchase } = await asUser
      .from('gc_purchases')
      .select('id, user_id, amount_paise, currency, status, provider_order_id')
      .eq('id', purchaseId)
      .maybeSingle();

    if (!purchase) {
      return jsonResponse({ ok: false, error: 'Purchase not found' }, 404);
    }
    if (purchase.status !== 'created') {
      // Already settled or failed. Re-opening it would let a paid slot be
      // paid for twice.
      return jsonResponse({ ok: false, error: 'This purchase is already closed' }, 409);
    }
    if (!purchase.amount_paise || purchase.amount_paise <= 0) {
      return jsonResponse({ ok: false, error: 'Purchase has no amount' }, 422);
    }

    /*
     * Cashfree takes the amount in major units. The database stores paise so
     * money is only ever integer arithmetic; the conversion happens here, at
     * the last possible moment, and only ever downward from the stored value.
     */
    const orderAmount = purchase.amount_paise / 100;

    /*
     * Reuse the order this purchase already has, if it is still payable and
     * the customer phone matches.
     */
    if (purchase.provider_order_id) {
      const existing = await fetch(
        `${baseUrl(cfEnv)}/orders/${encodeURIComponent(purchase.provider_order_id)}`,
        {
          headers: {
            'x-api-version': CASHFREE_API_VERSION,
            'x-client-id': appId,
            'x-client-secret': secretKey,
          },
        }
      );
      const prev = await existing.json().catch(() => null);

      const existingPhone = prev?.customer_details?.customer_phone;
      const phoneMatches = !cleanPhone || cleanPhone === existingPhone;

      if (existing.ok && prev?.order_status === 'ACTIVE' && prev?.payment_session_id && phoneMatches) {
        return jsonResponse({
          ok: true,
          orderId: purchase.provider_order_id,
          paymentSessionId: prev.payment_session_id,
          mode: cfEnv === 'production' ? 'production' : 'sandbox',
          reused: true,
        });
      }

      /*
       * A PAID order on a purchase still marked `created` means the webhook
       * has not landed yet. Opening another payable order here is exactly how
       * the double charge happened, so refuse instead and let the webhook
       * settle it.
       */
      if (prev?.order_status === 'PAID') {
        return jsonResponse(
          { ok: false, error: 'This payment is already going through. Give it a moment.' },
          409
        );
      }
    }

    /*
     * Only reached when the purchase has no order, or its order is expired or
     * phone number changed. The purchase id is the stable part so the
     * webhook can find its way back to the row.
     */
    const orderId = `gc_${purchaseId.replace(/-/g, '')}_${Date.now().toString(36)}`;

    const cfRes = await fetch(`${baseUrl(cfEnv)}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': CASHFREE_API_VERSION,
        'x-client-id': appId,
        'x-client-secret': secretKey,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: orderAmount,
        order_currency: purchase.currency ?? 'INR',
        customer_details: {
          customer_id: user.id,
          customer_email: user.email ?? undefined,
          customer_phone: customerPhone,
        },
        order_meta: {
          return_url: `${CONFIRM_PAGE}?order={order_id}`,
        },
        order_tags: { purchase_id: purchaseId, user_id: user.id },
      }),
    });

    const cf = await cfRes.json().catch(() => null);

    if (!cfRes.ok || !cf?.payment_session_id) {
      console.error(`[gc-checkout] cashfree order failed ${cfRes.status}: ${JSON.stringify(cf)}`);
      return jsonResponse({ ok: false, error: 'Could not start the payment' }, 502);
    }

    const asService = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await asService
      .from('gc_purchases')
      .update({ provider: 'cashfree', provider_order_id: orderId })
      .eq('id', purchaseId);

    return jsonResponse({
      ok: true,
      orderId,
      paymentSessionId: cf.payment_session_id,
      mode: cfEnv === 'production' ? 'production' : 'sandbox',
    });
  } catch (error) {
    console.error(`[gc-checkout] ${String(error)}`);
    return jsonResponse({ ok: false, error: 'Unexpected error' }, 500);
  }
});
