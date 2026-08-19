import { useEffect } from 'react';
import { Platform } from 'react-native';

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
      if (vv) {
        document.documentElement.style.setProperty('--gc-app-height', `${vv.height}px`);
      } else {
        document.documentElement.style.setProperty('--gc-app-height', `${window.innerHeight}px`);
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
      document.documentElement.style.removeProperty('--gc-app-height');
    };
  }, []);
}
