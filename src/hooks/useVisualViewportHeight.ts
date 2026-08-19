import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Keeps the app exactly as tall as the *visible* area on web.
 *
 * A standalone iOS PWA does not shrink its layout viewport when the keyboard
 * opens — only the visual viewport shrinks. So the app keeps its full height,
 * the composer stays pinned to a bottom edge that is now behind the keyboard,
 * and you get the gap between the two. Sizing to `visualViewport.height` is
 * what closes it.
 *
 * Lives here rather than as an inline script in public/index.html because
 * Expo's HTML pipeline does not reliably execute scripts from that template —
 * the tag survives into the DOM but never runs. Mounted from the app root it
 * simply always runs.
 *
 * Writes a CSS variable rather than transforming the container: a transform
 * would make it a containing block for `position: fixed` descendants, which is
 * how the modals are positioned.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    // Applied straight away rather than inside requestAnimationFrame: rAF does
    // not run while the document is hidden, so a keyboard opening on a page
    // that was briefly backgrounded would leave the old height applied. These
    // events are rare (keyboard, rotation), so there is nothing to throttle.
    const sync = () => {
      document.documentElement.style.setProperty('--gc-app-height', `${vv.height}px`);
    };

    const onOrientation = () => setTimeout(sync, 300);

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', onOrientation);
    sync();

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', onOrientation);
      document.documentElement.style.removeProperty('--gc-app-height');
    };
  }, []);
}
