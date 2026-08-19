import { useEffect } from 'react';
import { Platform } from 'react-native';
import { KEYBOARD_MIN_PX } from './useWebKeyboardOpen';

/**
 * Keeps the app exactly as tall as the *visible* area on web,
 * and prevents iOS Safari / iOS PWA from shifting the entire page upward
 * when the software keyboard opens.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;

    const resetWindowScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
    };

    const sync = () => {
      // While the document is hidden every height source reports 0 — measured,
      // not assumed. Writing that would clip the app to nothing, because #root
      // is height + max-height + overflow:hidden. So when there is nothing
      // trustworthy to measure, clear the variables and let the CSS `100%`
      // fallback stand rather than committing a zero.
      // Only override the height while the keyboard is actually up.
      //
      // In a standalone iOS PWA visualViewport.height is *already* smaller than
      // the screen with no keyboard open — it leaves out the safe areas. Since
      // #root is pinned to the top, forcing that height made the app end short
      // and collected all the difference into one dead band under the composer.
      // With no keyboard there is nothing to avoid, so the CSS `100%` fallback
      // (the full layout viewport) is the correct height.
      const keyboardOpen = !!vv && window.innerHeight - vv.height > KEYBOARD_MIN_PX;
      if (vv && vv.height > 0 && keyboardOpen) {
        document.documentElement.style.setProperty('--gc-app-height', `${vv.height}px`);
        // How far the visible region has been pushed down inside the unchanged
        // layout viewport. Usually 0 because resetWindowScroll() below keeps it
        // there, but when iOS scrolls to reveal a focused field it is not, and
        // an app pinned to top:0 would then sit above the visible area — which
        // reads as a gap under the composer.
        document.documentElement.style.setProperty('--gc-app-offset', `${vv.offsetTop}px`);
      } else {
        document.documentElement.style.removeProperty('--gc-app-height');
        document.documentElement.style.removeProperty('--gc-app-offset');
      }
      resetWindowScroll();
    };

    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        // iOS WebKit triggers its native scroll-into-view after a brief microtask delay
        requestAnimationFrame(sync);
        setTimeout(sync, 50);
        setTimeout(sync, 150);
        setTimeout(sync, 350);
      }
    };

    const onOrientation = () => {
      setTimeout(sync, 100);
      setTimeout(sync, 300);
    };

    if (vv) {
      vv.addEventListener('resize', sync);
      vv.addEventListener('scroll', sync);
    }
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', resetWindowScroll, { passive: true });
    window.addEventListener('orientationchange', onOrientation);
    document.addEventListener('focusin', onFocusIn, { passive: true });
    // sync() deliberately measures nothing while hidden, so re-measure the
    // moment the page is shown — otherwise a PWA launched into the background
    // would keep the fallback height after coming to the foreground.
    document.addEventListener('visibilitychange', sync);

    sync();

    return () => {
      if (vv) {
        vv.removeEventListener('resize', sync);
        vv.removeEventListener('scroll', sync);
      }
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', resetWindowScroll);
      window.removeEventListener('orientationchange', onOrientation);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('visibilitychange', sync);
      document.documentElement.style.removeProperty('--gc-app-height');
      document.documentElement.style.removeProperty('--gc-app-offset');
    };
  }, []);
}
