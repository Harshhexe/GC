import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export type NetworkStatus = {
  isOnline: boolean;
  isReconnecting: boolean;
  reconnect: () => Promise<boolean>;
};

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      return navigator.onLine ?? true;
    }
    return true;
  });
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const checkReachability = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    try {
      // Lightweight reachability test against Supabase
      const { error } = await supabase.from('profiles').select('id').limit(1);
      const online = !error || error.code !== 'PGRST301';
      setIsOnline(online);
      return online;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  const reconnect = useCallback(async (): Promise<boolean> => {
    setIsReconnecting(true);
    try {
      const ok = await checkReachability();
      if (ok) {
        setIsOnline(true);
      }
      return ok;
    } finally {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        setIsReconnecting(false);
      }, 600);
    }
  }, [checkReachability]);

  useEffect(() => {
    // 1. Web event listeners
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => {
        setIsOnline(true);
        reconnect();
      };
      const handleOffline = () => {
        setIsOnline(false);
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // 2. AppState listener for Mobile
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconnect();
      }
    });

    return () => {
      sub.remove();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [reconnect]);

  return {
    isOnline,
    isReconnecting,
    reconnect,
  };
}
