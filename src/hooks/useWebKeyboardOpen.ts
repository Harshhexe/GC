import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Below this the shrink is safe-area/browser-chrome accounting, not a keyboard.
 * A standalone iOS PWA reports a visual viewport smaller than the screen even
 * with nothing open, so the threshold has to clear that baseline.
 */
export const KEYBOARD_MIN_PX = 120;

/**
 * The portion of the current window covered by the software keyboard, on web.
 *
 * React Native's `Keyboard` module emits nothing on web — there is no keyboard
 * API there — so the composer cannot rely on `KeyboardAvoidingView`. This hook
 * is deliberately consumed by ChatScreen only. It does not resize, translate,
 * or otherwise mutate the app root.
 *
 * `offsetTop` matters when WebKit pans the visual viewport to reveal the
 * focused textarea. The keyboard begins at `offsetTop + height`, so the only
 * covered part of the full-screen app is the remainder below that point.
 */
export function useWebKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const viewportBottom = vv.offsetTop + vv.height;
      const covered = Math.max(0, Math.round(window.innerHeight - viewportBottom));
      setInset(covered > KEYBOARD_MIN_PX ? covered : 0);
    };

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  return inset;
}
