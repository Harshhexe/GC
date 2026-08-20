import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Keeps `#root` matched to the visual viewport, on web.
 *
 * iOS never shrinks the *layout* viewport when the software keyboard opens —
 * `window.innerHeight` is unchanged — so an app sized to it keeps its bottom
 * (the composer, the dock) behind the keyboard. WebKit's response is to scroll
 * the *visual* viewport to bring the focused input into view, which drags
 * every `position: fixed` element upward and leaves a blank strip below the
 * app. The visual viewport is the only thing that describes what the user can
 * actually see, so it is what the root is sized and positioned from:
 *
 *   --gc-viewport-height  vv.height    — full screen closed, above the keyboard open
 *   --gc-viewport-top     vv.offsetTop — follows any scroll WebKit applies
 *
 * Because the root tracks that scroll rather than fighting it, the layout is
 * self-correcting: anything that moves the focused input (a reply preview
 * growing the composer, a keyboard swap) is a viewport event that lands here,
 * with no timers or re-sync pings needed.
 *
 * Everything else in the app is a normal flex layout inside that box, so no
 * other surface needs to know the keyboard exists.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    // Without visualViewport the CSS fallbacks (100dvh at top 0) already give
    // the right full-screen result.
    if (!vv) return;

    const root = document.documentElement;

    const sync = () => {
      root.style.setProperty('--gc-viewport-height', `${Math.round(vv.height)}px`);
      root.style.setProperty('--gc-viewport-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
    };

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);
    sync();

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
      root.style.removeProperty('--gc-viewport-height');
      root.style.removeProperty('--gc-viewport-top');
    };
  }, []);
}
