import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

export type AppUpdateState = {
  isAvailable: boolean;
  isDownloading: boolean;
  error: string | null;
  checkCount: number;
  updateMessage: string | null;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  checkForUpdates: () => Promise<boolean>;
};

export function useAppUpdates(): AppUpdateState {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const checkingRef = useRef(false);

  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    // Updates only function on real standalone / EAS builds, not in Expo Go or local dev server
    if (__DEV__ || !Updates.isEnabled) {
      return false;
    }

    if (checkingRef.current) return false;
    checkingRef.current = true;
    setError(null);

    try {
      const update = await Updates.checkForUpdateAsync();
      setCheckCount((c) => c + 1);
      if (update.isAvailable) {
        const manifestMsg =
          (update.manifest as any)?.extra?.expoClient?.extra?.message ||
          (update.manifest as any)?.message ||
          (update.manifest as any)?.metadata?.message ||
          null;
        setUpdateMessage(manifestMsg);
        setIsAvailable(true);
        return true;
      }
      return false;
    } catch (e: any) {
      console.log('[Updates] Check error:', e?.message || e);
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) {
      setIsAvailable(false);
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        // Automatically reload and launch the newly downloaded update!
        await Updates.reloadAsync();
      } else {
        setIsAvailable(false);
      }
    } catch (e: any) {
      const msg = e?.message || 'Failed to download update. Please try again.';
      console.warn('[Updates] Download error:', msg);
      setError(msg);
      setIsDownloading(false);
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setIsAvailable(false);
  }, []);

  // Check on initial app launch
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Check whenever the app returns from background to foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkForUpdates();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [checkForUpdates]);

  return {
    isAvailable,
    isDownloading,
    error,
    checkCount,
    updateMessage,
    applyUpdate,
    dismissUpdate,
    checkForUpdates,
  };
}
