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
 * The visual viewport shrinking by a large amount is the only signal available:
 * the layout viewport does not change when the keyboard opens.
 */
export function useWebKeyboardOpen(): boolean {
  return useWebKeyboardInset() > 0;
}

/**
 * How many pixels of the app the keyboard currently covers, on web. 0 when
 * it's closed.
 *
 * The app root deliberately stays a full screen tall — resizing it to the
 * visual viewport made the whole UI (dock included) jump every time the
 * keyboard opened. So the viewport shrink is not a layout signal here; it is
 * an *inset*, applied only by the surfaces that own an input, exactly the way
 * a native keyboard inset works.
 *
 * `#root` is translated down by `--gc-keyboard-offset` to cancel any visual
 * viewport scroll WebKit applies, which is what makes plain
 * `innerHeight - vv.height` the right number here: with the app pinned to the
 * visible area, the covered strip is the whole shrink.
 */
export function useWebKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const shrink = window.innerHeight - vv.height;
      setInset(shrink > KEYBOARD_MIN_PX ? Math.round(shrink) : 0);
    };

    vv.addEventListener('resize', sync);
    // The keyboard can also change size in place — switching to an emoji
    // keyboard, or a predictive-text bar appearing — which only scrolls the
    // visual viewport rather than resizing the window.
    vv.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);
    sync();

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return inset;
}
