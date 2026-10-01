import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/theme';

/**
 * Wraps a mobile full-screen `Modal` so it reads as a centered dialog card
 * on desktop web instead — RN's Modal portals to document.body there,
 * escaping WebShell's rail/sidebar/pane layout and covering the whole
 * browser window (the same bug AttachmentSheet had). Mirrors the
 * modalLayer/modalBackdrop/modalCard treatment WebShell already uses for
 * WhatDidIMiss/GCDNA/Wordy, so every attachment-sheet picker matches it.
 *
 * Web only — callers keep using their native `<Modal>` on iOS/Android.
 */
export function WebModalCard({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,6,10,0.64)' },
  card: {
    width: '100%',
    maxWidth: 1040,
    maxHeight: 780,
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 20 },
  },
});
