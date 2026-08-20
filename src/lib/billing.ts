import { supabase } from './supabase';

/**
 * Paid GC slots.
 *
 * One GC is free; every additional GC you *create* costs a one-off fee.
 * Joining someone else's GC is free and unlimited.
 *
 * No payment gateway is wired up yet. `startGCPurchase` records the intent
 * server-side and hands back the row a Razorpay checkout would be opened
 * against; nothing here holds keys, contacts Razorpay, or can mark a purchase
 * paid — settlement is the server's job (see supabase/gc_paid_slots.sql).
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
    return 'You’ve used all your GC slots. Add another to create this group.';
  }
  return rawMessage;
}
