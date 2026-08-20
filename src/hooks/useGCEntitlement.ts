import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchGCEntitlement, type GCEntitlement } from '../lib/billing';

/**
 * Whether this account can create another GC, and what another slot costs.
 *
 * Refetched on focus as well as on mount: a slot can be freed by deleting a
 * group, or granted by a payment settling on the server, and neither of those
 * happens on this screen.
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

  return { entitlement, loading, refresh };
}
