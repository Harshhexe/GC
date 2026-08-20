import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Below this the shrink is safe-area/browser-chrome accounting, not a keyboard.
 * A standalone iOS PWA reports a visual viewport smaller than the screen even
 * with nothing open, so the threshold has to clear that baseline.
 */
export const KEYBOARD_MIN_PX = 120;

/**
 * Whether the software keyboard is open, on web.
 *
 * React Native's `Keyboard` module emits nothing on web — there is no keyboard
 * API there — so `keyboardDidShow` never fires and anything gated on it stays
 * false forever. In a standalone iOS PWA that meant the composer kept its full
 * home-indicator safe-area inset while the keyboard was up, which is the gap
 * between the text field and the keyboard.
 *
 * This is only ever a *flag*: the layout itself is handled by sizing the app
 * root to the visual viewport (see useVisualViewportHeight), so nothing here
 * needs the keyboard's height.
 */
export function useWebKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => setOpen(window.innerHeight - vv.height > KEYBOARD_MIN_PX);

    vv.addEventListener('resize', sync);
    sync();

    return () => {
      vv.removeEventListener('resize', sync);
    };
  }, []);

  return open;
}
