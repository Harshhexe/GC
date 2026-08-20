import { useEffect } from 'react';
import { Platform } from 'react-native';
import { KEYBOARD_MIN_PX } from './useWebKeyboardOpen';

const VIEWPORT_SYNC_EVENT = 'gc:viewport-sync';

/**
 * Ask the visual-viewport sync to re-run — after a layout change that the
 * browser reports no event for. No-op off web.
 */
export function requestViewportSync() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new Event(VIEWPORT_SYNC_EVENT));
}

/**
 * Keeps the app exactly as tall as the *visible* area on web,
 * and prevents iOS Safari / iOS PWA from shifting the entire page upward
 * or creating dead gaps when the software keyboard opens.
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
      const keyboardOpen = !!vv && window.innerHeight - vv.height > KEYBOARD_MIN_PX;
      if (vv && vv.height > 0 && keyboardOpen) {
        document.documentElement.style.setProperty('--gc-app-height', `${vv.height}px`);
        // WebKit scrolls the *visual* viewport (not the layout one) to lift a
        // focused input clear of the keyboard. #root is position:fixed, which
        // is laid out against the layout viewport, so that scroll drags the
        // whole app upward and the composer ends up under the keyboard —
        // exactly what happens when the reply preview grows the composer while
        // the keyboard is still animating in. resetWindowScroll() can't see
        // this; offsetTop is the only signal, and shifting #root down by it
        // puts the app back inside the visible area.
        const offset = Math.max(0, Math.round(vv.offsetTop));
        document.documentElement.style.setProperty('--gc-app-offset', `${offset}px`);
        // Applied to the node directly as well as through the variable: the
        // service worker can still be serving a cached index.html whose #root
        // rule has no transform in it.
        const root = document.getElementById('root');
        if (root) root.style.transform = offset ? `translateY(${offset}px)` : '';
      } else {
        document.documentElement.style.removeProperty('--gc-app-height');
        document.documentElement.style.removeProperty('--gc-app-offset');
        const root = document.getElementById('root');
        if (root) root.style.transform = '';
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
    document.addEventListener('visibilitychange', sync);
    // Composer-height changes (reply preview, attachment chip, a draft growing
    // to two lines) fire no viewport event of their own, so screens ping this
    // when their bottom bar resizes with the keyboard already up.
    window.addEventListener(VIEWPORT_SYNC_EVENT, sync);

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
      window.removeEventListener(VIEWPORT_SYNC_EVENT, sync);
      document.documentElement.style.removeProperty('--gc-app-height');
      document.documentElement.style.removeProperty('--gc-app-offset');
      const root = document.getElementById('root');
      if (root) root.style.transform = '';
    };
  }, []);
}
