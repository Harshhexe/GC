import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** CSS safe-area values can differ from React Native Web's measured insets in an iOS PWA. */
export function useWebBottomInset(): number {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;

    const update = () => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
      document.body.appendChild(probe);
      const value = Number.parseFloat(window.getComputedStyle(probe).paddingBottom);
      probe.remove();
      setBottomInset(Number.isFinite(value) ? value : 0);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return bottomInset;
}
