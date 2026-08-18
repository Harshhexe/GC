import { Platform } from 'react-native';

/**
 * Safely wraps expo-screen-capture to prevent app launch crashes
 * on builds where the native module is not yet compiled into the binary.
 */
let screenCaptureModule: {
  preventScreenCaptureAsync?: () => Promise<void>;
  allowScreenCaptureAsync?: () => Promise<void>;
} | null = null;

if (Platform.OS !== 'web') {
  try {
    // Dynamic require so missing native module doesn't crash the JS bundle at evaluation time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    screenCaptureModule = require('expo-screen-capture');
  } catch {
    screenCaptureModule = null;
  }
}

export async function preventScreenCaptureAsync(): Promise<void> {
  if (Platform.OS === 'web' || !screenCaptureModule) return;
  try {
    if (typeof screenCaptureModule.preventScreenCaptureAsync === 'function') {
      await screenCaptureModule.preventScreenCaptureAsync();
    }
  } catch {}
}

export async function allowScreenCaptureAsync(): Promise<void> {
  if (Platform.OS === 'web' || !screenCaptureModule) return;
  try {
    if (typeof screenCaptureModule.allowScreenCaptureAsync === 'function') {
      await screenCaptureModule.allowScreenCaptureAsync();
    }
  } catch {}
}
