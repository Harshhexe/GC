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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Use POST' }, 405);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = Deno.env.get('CASHFREE_APP_ID');
    const secretKey = Deno.env.get('CASHFREE_SECRET_KEY');
    const cfEnv = Deno.env.get('CASHFREE_ENV') ?? 'sandbox';

    if (!url || !anonKey || !serviceKey || !appId || !secretKey) {
      return jsonResponse({ ok: false, error: 'Server is not configured' }, 500);
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

    let body: { purchaseId?: unknown; returnUrl?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const purchaseId = typeof body.purchaseId === 'string' ? body.purchaseId : '';
    if (!purchaseId) {
      return jsonResponse({ ok: false, error: 'Missing purchaseId' }, 400);
    }

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
     * Reuse the order this purchase already has, if it is still payable.
     *
     * Minting a fresh order on every tap left several payable links alive for
     * one purchase at once, and someone who tapped Pay twice (or retried after
     * assuming the first attempt failed) could pay two of them. The settlement
     * guard then granted one slot and ignored the second payment, so the money
     * moved and nothing came back for it. Verified in sandbox: one purchase
     * ended up with two PAID orders and a single slot.
     *
     * An ACTIVE order carries its original payment_session_id, so handing the
     * same one back is both correct and cheaper than creating another.
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

      if (existing.ok && prev?.order_status === 'ACTIVE' && prev?.payment_session_id) {
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
     * otherwise no longer payable. The purchase id is the stable part so the
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
          // Cashfree wants a phone; a placeholder keeps card and UPI flows
          // working for accounts that never gave one.
          customer_phone: (user.phone && user.phone.length >= 10) ? user.phone : '9999999999',
        },
        order_meta: {
          /*
           * Where Cashfree drops the payer once the payment page is done.
           * Defaulted server-side rather than trusted from the request: a
           * caller-supplied URL is an open redirect, and this one is only ever
           * a confirmation page on GC's own domain.
           *
           * It is cosmetic. The slot is granted by the webhook, so a payer who
           * closes the tab before the redirect still gets what they paid for.
           */
          return_url: `${CONFIRM_PAGE}?order={order_id}`,
        },
        // Echoed back on the webhook, so settlement never has to parse an id
        // out of a formatted string.
        order_tags: { purchase_id: purchaseId, user_id: user.id },
      }),
    });

    const cf = await cfRes.json().catch(() => null);

    if (!cfRes.ok || !cf?.payment_session_id) {
      console.error(`[gc-checkout] cashfree order failed ${cfRes.status}: ${JSON.stringify(cf)}`);
      // The provider's message is not forwarded: it can carry account-level
      // detail, and there is nothing the app could do differently with it.
      return jsonResponse({ ok: false, error: 'Could not start the payment' }, 502);
    }

    /*
     * Written with the service role because clients have no UPDATE policy on
     * gc_purchases at all. This only records which Cashfree order belongs to
     * this row; status is untouched and stays `created`.
     */
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
