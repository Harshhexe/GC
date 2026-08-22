import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How far to lift content inside an Android `<Modal>` when the keyboard opens.
 * Returns 0 on iOS and web, and 0 whenever the keyboard is down.
 *
 * React Native's `<Modal>` on Android is a separate window, and that window
 * does not inherit the activity's `adjustResize` soft-input mode (set here via
 * app.json's `softwareKeyboardLayoutMode`). So when the keyboard opens, nothing
 * about the modal's layout changes and anything anchored to the bottom — a
 * composer, a Save button — stays underneath it.
 *
 * `KeyboardAvoidingView` cannot fix this on its own: it responds to the window
 * resizing, and the window did not resize. Measuring the keyboard directly and
 * applying the height as padding is what actually moves the content.
 *
 * `statusBarTranslucent` on the Modal makes it more likely still, which is why
 * every full-bleed modal in this app needs it.
 *
 * @param visible Whether the modal is open. Listeners are only attached while
 * it is, and the height resets on close so reopening never starts out padded
 * for a keyboard that is not up.
 * @param onShow Optional — runs when the keyboard opens, after the height is
 * recorded. Useful for scrolling a list back to the end once it has shrunk.
 */
export function useAndroidModalKeyboard(visible: boolean, onShow?: () => void) {
  const [height, setHeight] = useState(0);
  // Held in a ref so the listener always calls the current callback without
  // the effect re-running — re-attaching would drop keyboard events in the gap.
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setHeight(e.endCoordinates.height);
      onShowRef.current?.();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
      setHeight(0);
    };
  }, [visible]);

  return height;
}
