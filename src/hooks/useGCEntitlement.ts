import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchGCEntitlement, type GCEntitlement } from '../lib/billing';

/**
 * Whether this account can create another GC, and what another slot costs.
 *
 * Refetched on mount, on navigation focus, and whenever the app returns to the
 * foreground. That last one is not redundant: paying happens in an external
 * browser, so the user leaves and returns to the *app* without this screen
 * ever losing navigation focus. Focus alone therefore never re-fires, and the
 * bought slot only appeared after navigating away and back by hand.
 */
export function useGCEntitlement() {
  const [entitlement, setEntitlement] = useState<GCEntitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await fetchGCEntitlement();
    setEntitlement(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  /*
   * Only on the transition *into* active. AppState also emits 'inactive' and
   * 'background', and on iOS a brief 'inactive' fires for things like the
   * control centre, so refetching on every event would mean redundant requests
   * for interruptions the entitlement cannot have changed during.
   */
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const returning = appState.current !== 'active' && next === 'active';
      appState.current = next;
      if (returning) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { entitlement, loading, refresh };
}
