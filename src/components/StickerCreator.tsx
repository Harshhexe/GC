import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import { renderSticker } from '../lib/stickers';
import type { Sticker } from '../types';

const MAX_BOX_WIDTH = Math.min(Dimensions.get('window').width - spacing.lg * 2, 360);
// Capped independently of width — a tall portrait photo would otherwise
// stretch the preview past the "Add text" controls and the Send button,
// pushing them off screen. Everything (the text toolbar) now lives above
// the picture instead of depending on it, but this keeps the picture itself
// from taking over a small screen either way.
const MAX_BOX_HEIGHT = 380;
/** Fraction of the displayed box width the text's font size scales to — the
 *  same value the edge function is told, so the baked-in text matches. */
const FONT_SIZE_PCT = 0.12;

const TEXT_COLORS = ['#FFFFFF', '#000000', colors.yellow, colors.secondary, colors.tertiary];

function fitWithin(naturalW: number, naturalH: number, maxW: number, maxH: number) {
  const ratio = naturalW / naturalH;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width, height };
}

/**
 * Pick a photo, drag a text overlay onto it, save. The overlay here is a
 * live preview only — the actual flattening into one PNG happens server-side
 * in the render-sticker edge function, using the same font and the xPct/yPct
 * position this screen hands it, so what's dragged is what ships.
 */
export function StickerCreator({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fires once the sticker is rendered and saved — the caller sends it. */
  onCreated: (sticker: Sticker) => void;
}) {
  const insets = useSafeAreaInsets();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [box, setBox] = useState({ width: MAX_BOX_WIDTH, height: MAX_BOX_WIDTH });
  const [text, setText] = useState('');
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  function reset() {
    setPhotoUri(null);
    setPhotoBase64(null);
    setText('');
    setColor(TEXT_COLORS[0]);
    translateX.value = 0;
    translateY.value = 0;
  }

  async function pickPhoto() {
    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos access needed', 'Allow photo library access to pick a sticker base.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Not 1: at full quality the picker writes a full-resolution copy of
        // the original out to disk before we even get to resize it, which is
        // the slow part of choosing a photo. The picked file is a throwaway
        // intermediate — it gets downscaled to 320px below regardless.
        quality: 0.5,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]) return;

      // Downscaled hard and re-encoded as a low-quality JPEG before it ever
      // leaves the device. Stickers draw at 148pt in the transcript, so this
      // is already more resolution than gets displayed — and the payload
      // size is what decides whether the round trip beats the timeout on a
      // slow connection.
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 320 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) {
        Alert.alert("Couldn't read that photo", 'Try a different one.');
        return;
      }

      translateX.value = 0;
      translateY.value = 0;
      setPhotoUri(manipulated.uri);
      setPhotoBase64(manipulated.base64);
      setBox(fitWithin(manipulated.width, manipulated.height, MAX_BOX_WIDTH, MAX_BOX_HEIGHT));
    } finally {
      setPicking(false);
    }
  }

  const dragGesture = Gesture.Pan().onUpdate((e) => {
    translateX.value = e.translationX;
    translateY.value = e.translationY;
  });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  async function handleSave() {
    if (!photoBase64 || saving) return;
    setSaving(true);
    try {
      // Center + drag offset, converted to a 0–1 fraction of the full image —
      // the same coordinate space the edge function composites against.
      const xPct = clamp01(0.5 + translateX.value / box.width);
      const yPct = clamp01(0.5 + translateY.value / box.height);

      const { sticker, error } = await renderSticker({
        imageBase64: photoBase64,
        text: text.trim(),
        xPct,
        yPct,
        fontSizePct: FONT_SIZE_PCT,
        color,
      });

      if (!sticker) {
        Alert.alert("Couldn't create sticker", error ?? 'Something went wrong — try again.');
        return;
      }
      reset();
      onCreated(sticker);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.root}>
        <AmbientBackground variant="default" />

        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top + 8, 20),
              paddingLeft: Math.max(insets.left + 16, 16),
              paddingRight: Math.max(insets.right + 16, 16),
            },
          ]}
        >
          <PressableScale hitSlop={10} scaleTo={0.92} onPress={handleClose} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
          <Text style={styles.title}>New Sticker</Text>
          <PressableScale hitSlop={10} scaleTo={0.92} onPress={handleSave} disabled={!photoBase64 || saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.saveText, !photoBase64 && styles.saveTextDisabled]}>Send</Text>
            )}
          </PressableScale>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!photoUri ? (
              <PressableScale
                style={[styles.pickButton, { width: MAX_BOX_WIDTH, height: MAX_BOX_WIDTH }]}
                scaleTo={0.97}
                haptic="medium"
                onPress={pickPhoto}
              >
                {picking ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={30} color={colors.primary} />
                    <Text style={styles.pickLabel}>Choose a photo</Text>
                  </>
                )}
              </PressableScale>
            ) : (
              <>
                {/* Text controls sit above the picture on purpose — a tall
                    portrait photo used to push "Add text" out of view
                    entirely when it lived below the image. */}
                <View style={styles.toolbar}>
                  <View style={styles.toolbarInputRow}>
                    <Ionicons name="text" size={17} color={colors.primary} style={styles.toolbarIcon} />
                    <TextInput
                      value={text}
                      onChangeText={(v: string) => setText(v.replace(/\n/g, '').slice(0, 60))}
                      placeholder="Add text..."
                      placeholderTextColor={colors.outline}
                      style={styles.textInput}
                      returnKeyType="done"
                      autoCorrect={false}
                    />
                    {!!text && (
                      <PressableScale onPress={() => setText('')} hitSlop={10} scaleTo={0.88}>
                        <Ionicons name="close-circle" size={17} color={colors.outline} />
                      </PressableScale>
                    )}
                  </View>

                  <View style={styles.colorRow}>
                    {TEXT_COLORS.map((c) => (
                      <PressableScale
                        key={c}
                        scaleTo={0.85}
                        haptic="light"
                        onPress={() => setColor(c)}
                        style={[
                          styles.swatch,
                          { backgroundColor: c },
                          color === c && styles.swatchActive,
                        ]}
                      >
                        <></>
                      </PressableScale>
                    ))}
                  </View>
                </View>

                <Animated.View
                  entering={FadeIn.duration(duration.base)}
                  style={[styles.imageBox, { width: box.width, height: box.height }]}
                >
                  <Image source={photoUri} style={StyleSheet.absoluteFill} contentFit="contain" />
                  {!!text && (
                    <GestureDetector gesture={dragGesture}>
                      <Animated.View style={[styles.textLayer, dragStyle]}>
                        <Text
                          style={[
                            styles.overlayText,
                            { color, fontSize: box.width * FONT_SIZE_PCT },
                          ]}
                        >
                          {text}
                        </Text>
                      </Animated.View>
                    </GestureDetector>
                  )}
                </Animated.View>

                <Text style={styles.hint}>Drag the text to place it, then tap Send</Text>

                <PressableScale scaleTo={0.96} haptic="light" onPress={pickPhoto} style={styles.changePhoto}>
                  <Text style={styles.changePhotoText}>Change photo</Text>
                </PressableScale>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    zIndex: 10,
  },
  title: {
    ...typography.titleMd,
    fontSize: 16,
    color: colors.onSurface,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 22,
  },
  cancelText: {
    ...typography.bodyMedium,
    fontSize: 15,
    color: colors.onSurfaceVariant,
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 22,
  },
  saveText: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 22,
  },
  saveTextDisabled: { color: colors.outline },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  pickButton: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pickLabel: {
    ...typography.body,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  toolbar: { width: '100%', gap: spacing.sm + 2 },
  toolbarInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  toolbarIcon: { alignSelf: 'center' },
  textInput: {
    flex: 1,
    height: '100%',
    ...typography.body,
    fontSize: 15,
    color: colors.onSurface,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: Platform.OS === 'ios' ? 20 : undefined,
  },
  imageBox: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  textLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    fontFamily: 'StickerFont',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: colors.primary },
  hint: { ...typography.caption, fontSize: 12, color: colors.onSurfaceVariant, textAlign: 'center' },
  changePhoto: { paddingVertical: spacing.xs },
  changePhotoText: { ...typography.caption, fontSize: 12.5, color: colors.primary },
});
