import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Paid GC slots.
 *
 * One GC is free; every additional GC you *create* costs a one-off fee.
 * Joining someone else's GC is free and unlimited.
 *
 * Cashfree is the gateway. `startGCPurchase` records the intent server-side
 * and hands back the row that checkout is opened against; nothing here holds
 * keys, talks to Cashfree, or can mark a purchase paid. The order is created
 * by the `gc-checkout` edge function and settled only by a signature-verified
 * webhook (`gc-payment-webhook`), because a client that could settle its own
 * purchase could grant itself unlimited GCs.
 */

export type GCEntitlement = {
  /** GCs this account currently owns. */
  owned: number;
  /** How many it may own: the free one plus a slot per settled purchase. */
  allowance: number;
  freeLimit: number;
  canCreate: boolean;
  /** Price of one more slot, in paise. */
  pricePaise: number;
  /** An unsettled purchase, if one is already open. */
  pendingPurchaseId: string | null;
  /** False until the address is confirmed, once confirmation is enabled. */
  emailVerified: boolean;
  /** True for a known throwaway provider. Blocks creation outright. */
  emailDisposable: boolean;
};

export type GCPurchase = {
  id: string;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  amountPaise: number;
  currency: string;
  provider: string;
};

/** 50000 → "₹500". Whole rupees are shown without a decimal tail. */
export function formatPaise(paise: number, currency = 'INR'): string {
  const major = paise / 100;
  const symbol = currency === 'INR' ? '₹' : '';
  return `${symbol}${Number.isInteger(major) ? major : major.toFixed(2)}`;
}

/**
 * The one authoritative answer to "can I create another GC?".
 *
 * Read from the database rather than derived from the local group list: the
 * same numbers back the trigger that enforces the limit, so the paywall can't
 * disagree with what the insert will actually do.
 */
export async function fetchGCEntitlement(): Promise<GCEntitlement | null> {
  const { data, error } = await supabase.rpc('gc_entitlement');
  if (error || !data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    owned: row.owned ?? 0,
    allowance: row.allowance ?? 1,
    freeLimit: row.free_limit ?? 1,
    canCreate: !!row.can_create,
    pricePaise: row.price_paise ?? 0,
    pendingPurchaseId: row.pending_purchase_id ?? null,
    /* Default to permissive: a server that did not report these should not
       lock someone out of a GC they are entitled to. The trigger is the real
       gate either way, so a wrong guess here costs a clearer message, not a
       free slot. */
    emailVerified: row.email_verified ?? true,
    emailDisposable: row.email_disposable ?? false,
  };
}

/**
 * Opens a purchase for one additional GC slot and returns it.
 *
 * Reuses an existing unsettled purchase instead of stacking up a new row per
 * tap. The amount and status are set by the database, not here — anything this
 * function sent for them would be overwritten by the guard trigger, which is
 * the point.
 */
export async function startGCPurchase(userId: string): Promise<{
  purchase: GCPurchase | null;
  error: string | null;
}> {
  const existing = await supabase
    .from('gc_purchases')
    .select('id, status, amount_paise, currency, provider')
    .eq('user_id', userId)
    .eq('status', 'created')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return { purchase: toPurchase(existing.data), error: null };
  }

  const { data, error } = await supabase
    .from('gc_purchases')
    .insert({ user_id: userId, amount_paise: 0 })
    .select('id, status, amount_paise, currency, provider')
    .single();

  if (error || !data) {
    return { purchase: null, error: error?.message ?? 'Could not start the purchase.' };
  }
  return { purchase: toPurchase(data), error: null };
}

function toPurchase(row: {
  id: string;
  status: string;
  amount_paise: number;
  currency: string;
  provider: string;
}): GCPurchase {
  return {
    id: row.id,
    status: row.status as GCPurchase['status'],
    amountPaise: row.amount_paise,
    currency: row.currency,
    provider: row.provider,
  };
}

/** Turns the creation trigger's error into copy the paywall can show. */
export function friendlyGroupCreateError(rawMessage: string): string {
  if (rawMessage.includes('GC_LIMIT_REACHED')) {
    return 'You\u2019ve used all your GC slots. Add another to create this group.';
  }
  if (rawMessage.includes('GC_EMAIL_UNVERIFIED')) {
    return 'Confirm your email address first. Check your inbox for the link we sent when you signed up.';
  }
  if (rawMessage.includes('GC_EMAIL_DISPOSABLE')) {
    return 'That email provider isn\u2019t supported for creating a GC. Sign up with a permanent address and you\u2019re good to go.';
  }
  return rawMessage;
}

/**
 * Where the hosted checkout page lives.
 *
 * A page on GC's own web app rather than a link generated per payment: it
 * loads Cashfree's SDK with the session id created server-side, so the app
 * never needs the payment SDK compiled into it. That is what keeps this an
 * over-the-air change instead of a new native build.
 *
 * Pointed at the canonical host and the extensionless path on purpose.
 * `web-gc.vercel.app` 307s to `the-gc.vercel.app`, and `cleanUrls` then 308s
 * `/pay.html` to `/pay`: two redirects for a URL carrying a single-use payment
 * session, on a mobile browser, is two chances to lose the query string.
 */
const CHECKOUT_PAGE = 'https://the-gc.vercel.app/pay';

/**
 * Opens Cashfree checkout for one additional GC slot.
 *
 * The amount is never sent from here. `gc-checkout` reads it out of the
 * purchase row, where the guard trigger stamped it from the database's own
 * price function, so the client cannot influence what is charged.
 *
 * Returns once the browser has been handed the URL, not once the payment is
 * done. Nothing here can grant a slot: the entitlement only moves when
 * Cashfree calls the signed webhook, and the app picks that up by refetching
 * on focus. Abandoning the payment page therefore costs nothing.
 */
export async function openGCCheckout(purchaseId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('gc-checkout', {
    body: { purchaseId },
  });

  if (error || !data?.ok || !data?.paymentSessionId) {
    return { error: data?.error ?? error?.message ?? 'Could not start the payment.' };
  }

  const url =
    `${CHECKOUT_PAGE}?session=${encodeURIComponent(data.paymentSessionId)}` +
    `&mode=${data.mode === 'production' ? 'production' : 'sandbox'}`;

  if (Platform.OS === 'web') {
    /*
     * Same tab, not a popup. Opening a new window here happens after an await,
     * which has already broken the user-gesture chain, and browsers block that
     * as a popup.
     */
    window.location.assign(url);
    return { error: null };
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) return { error: 'No browser available to open checkout.' };
  await Linking.openURL(url);
  return { error: null };
}
