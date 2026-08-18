import { Platform, useWindowDimensions } from 'react-native';

/**
 * Below this the web build keeps the phone UI verbatim.
 *
 * 900 rather than a typical 768 tablet breakpoint: the desktop shell puts a
 * ~360pt sidebar next to a chat pane, and a chat pane narrower than ~540pt is
 * worse than the single-column phone layout it replaced. This is the width at
 * which two panes genuinely beat one, not the width at which they merely fit.
 */
export const DESKTOP_MIN_WIDTH = 900;

/**
 * Whether to render the two-pane desktop shell.
 *
 * Gated on `Platform.OS === 'web'` *and* width — a phone browser is still a
 * phone, so it gets the identical mobile UI the native app has. Driven by
 * useWindowDimensions rather than a one-time measurement so resizing a desktop
 * browser window (or rotating a tablet) switches layouts live instead of
 * stranding the user in whichever mode the page happened to load in.
 */
export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}
