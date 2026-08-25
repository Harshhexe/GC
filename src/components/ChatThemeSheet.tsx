import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import {
  BUBBLE_ALPHA,
  GROUP_THEMES,
  type BubbleStyle,
  type ChatAppearance,
  flattenTint,
  type GroupThemeKey,
  themeFromColor,
} from '../theme/groupThemes';
import { PressableScale } from './ui/PressableScale';
import { DraggableSheet } from './ui/DraggableSheet';
import { pickChatWallpaper, deleteChatWallpaper } from '../lib/wallpaper';
import { extractWallpaperPalette } from '../lib/paletteExtract';
import { selectFeedback } from '../utils/haptics';

const BUBBLE_OPTIONS: { key: BubbleStyle; label: string; caption: string }[] = [
  { key: 'translucent', label: 'Translucent', caption: 'Tinted glass' },
  { key: 'opaque', label: 'Opaque', caption: 'Solid fill' },
];

/**
 * Everything about how this chat looks *to you*: bubble fill, accent colour
 * and an optional wallpaper.
 *
 * Replaces the row of bare colour swatches that used to sit in Group Info.
 * Those only ever exposed one of the three, and gave no hint that the choice
 * was personal rather than something the whole group would see.
 */
export function ChatThemeSheet({
  visible,
  groupId,
  appearance,
  onChange,
  onClose,
}: {
  visible: boolean;
  groupId: string;
  appearance: ChatAppearance;
  onChange: (patch: Partial<ChatAppearance>) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickWallpaper() {
    selectFeedback();
    setError(null);
    setBusy(true);
    const result = await pickChatWallpaper(groupId);
    setBusy(false);

    if (!result) return; // dismissed
    // Compared against null rather than checked for truthiness: the union is
    // discriminated on `error`, and a truthiness test can't narrow a string.
    if (result.error !== null) {
      setError(result.error);
      return;
    }

    // Show the wallpaper immediately; the palette is a bonus that must never
    // hold up the thing the user actually asked for.
    onChange({ wallpaperUri: result.uri });

    setExtracting(true);
    const palette = await extractWallpaperPalette(result.uri);
    setExtracting(false);
    // Colours from the *previous* wallpaper would be misleading next to a new
    // one, so this replaces rather than merges — including with an empty list
    // when a photo has no usable hue (a greyscale shot, say).
    onChange({ wallpaperPalette: palette });
  }

  async function handleRemoveWallpaper() {
    selectFeedback();
    const previous = appearance.wallpaperUri;
    onChange({ wallpaperUri: null, wallpaperPalette: [], customThemeColor: null });
    await deleteChatWallpaper(groupId, previous);
  }

  return (
    <DraggableSheet visible={visible} onClose={onClose} dragHandleOnly style={styles.sheet}>

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Chat theme</Text>
              <Text style={styles.subtitle}>Only changes how this chat looks for you.</Text>
            </View>
            <PressableScale style={styles.closeBtn} hitSlop={8} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.onSurface} />
            </PressableScale>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>Message bubbles</Text>
            <View style={styles.bubbleRow}>
              {BUBBLE_OPTIONS.map((option) => {
                const active = appearance.bubbleStyle === option.key;
                const theme = appearance.customThemeColor
                  ? themeFromColor(appearance.customThemeColor)
                  : GROUP_THEMES.find((t) => t.key === appearance.themeKey);
                return (
                  <PressableScale
                    key={option.key}
                    scaleTo={0.96}
                    haptic="light"
                    onPress={() => onChange({ bubbleStyle: option.key })}
                    style={[
                      styles.bubbleOption,
                      active && { borderColor: theme?.accent ?? colors.primary },
                    ]}
                  >
                    {/* A miniature of the real bubble sitting on a patterned
                        strip. The two fills are the same colour by design —
                        opaque is the flattened translucent look — so the only
                        honest way to show the difference is over a background
                        the translucent one lets through. Uses the actual
                        wallpaper when there is one. */}
                    <View style={styles.bubblePreviewStage}>
                      {appearance.wallpaperUri ? (
                        <Image
                          source={appearance.wallpaperUri}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <LinearGradient
                          colors={['#4B5563', '#111827']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <View
                        style={[
                          styles.bubblePreview,
                          {
                            borderColor: `${theme?.accent ?? colors.primary}8C`,
                            backgroundColor:
                              option.key === 'opaque'
                                ? flattenTint(
                                    theme?.colors[0] ?? colors.primary,
                                    BUBBLE_ALPHA.mineTop
                                  )
                                : `${theme?.colors[0] ?? colors.primary}59`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.bubbleLabel}>{option.label}</Text>
                    <Text style={styles.bubbleCaption}>{option.caption}</Text>
                    {active && (
                      <View style={styles.bubbleCheck}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={theme?.accent ?? colors.primary}
                        />
                      </View>
                    )}
                  </PressableScale>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Theme colour</Text>
            <View style={styles.themeGrid}>
              {GROUP_THEMES.map((t) => {
                const active = !appearance.customThemeColor && appearance.themeKey === t.key;
                return (
                  <PressableScale
                    key={t.key}
                    scaleTo={0.9}
                    haptic="medium"
                    onPress={() =>
                      onChange({ themeKey: t.key as GroupThemeKey, customThemeColor: null })
                    }
                    style={[styles.themeChip, active && { borderColor: t.accent }]}
                  >
                    <LinearGradient
                      colors={t.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.themeSwatch}
                    >
                      {active && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                    </LinearGradient>
                  </PressableScale>
                );
              })}
            </View>

            {(extracting || appearance.wallpaperPalette.length > 0) && (
              <>
                <Text style={[styles.sectionLabel, styles.sectionSpacing]}>
                  From your wallpaper
                </Text>
                {extracting ? (
                  <View style={styles.paletteLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.bubbleCaption}>Picking out colours…</Text>
                  </View>
                ) : (
                  <View style={styles.themeGrid}>
                    {appearance.wallpaperPalette.map((hex) => {
                      const custom = themeFromColor(hex);
                      const active = appearance.customThemeColor === hex;
                      return (
                        <PressableScale
                          key={hex}
                          scaleTo={0.9}
                          haptic="medium"
                          onPress={() => onChange({ customThemeColor: hex })}
                          style={[styles.themeChip, active && { borderColor: custom.accent }]}
                        >
                          <LinearGradient
                            colors={custom.colors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.themeSwatch}
                          >
                            {active && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                          </LinearGradient>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Wallpaper</Text>
            {appearance.wallpaperUri ? (
              <View style={styles.wallpaperWrap}>
                <Image
                  source={appearance.wallpaperUri}
                  style={styles.wallpaperPreview}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.wallpaperActions}>
                  <PressableScale
                    style={styles.wallpaperBtn}
                    disabled={busy}
                    onPress={handlePickWallpaper}
                  >
                    <Ionicons name="images-outline" size={15} color={colors.onSurface} />
                    <Text style={styles.wallpaperBtnText}>Replace</Text>
                  </PressableScale>
                  <PressableScale
                    style={styles.wallpaperBtn}
                    disabled={busy}
                    onPress={handleRemoveWallpaper}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.error} />
                    <Text style={[styles.wallpaperBtnText, { color: colors.error }]}>Remove</Text>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <PressableScale
                style={styles.wallpaperEmpty}
                scaleTo={0.97}
                disabled={busy}
                onPress={handlePickWallpaper}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={22} color={colors.onSurfaceVariant} />
                    <Text style={styles.wallpaperEmptyText}>Add a custom wallpaper</Text>
                    <Text style={styles.wallpaperEmptyHint}>
                      Pick a photo to sit behind this conversation
                    </Text>
                  </>
                )}
              </PressableScale>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
    </DraggableSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingBottom: spacing.xl,
    // Rows inside supply their own horizontal padding so the scroll area can
    // run edge to edge; the sheet must not add a second inset on top.
    paddingHorizontal: 0,
    maxHeight: '86%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerCopy: { flex: 1, gap: 2 },
  title: { ...typography.headline, fontSize: 19, fontWeight: '800', color: colors.onSurface },
  subtitle: { ...typography.caption, fontSize: 12, color: colors.onSurfaceVariant },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionLabel: {
    ...typography.label,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.sm + 2,
  },
  sectionSpacing: { marginTop: spacing.xl },

  bubbleRow: { flexDirection: 'row', gap: spacing.md },
  bubbleOption: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  bubblePreviewStage: {
    width: '100%',
    height: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  bubblePreview: {
    width: 58,
    height: 26,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bubbleLabel: { ...typography.label, fontSize: 13, color: colors.onSurface },
  bubbleCaption: { ...typography.caption, fontSize: 11, color: colors.textFaint },
  bubbleCheck: { position: 'absolute', top: 6, right: 6 },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  paletteLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  themeChip: {
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeSwatch: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  wallpaperWrap: { gap: spacing.sm },
  wallpaperPreview: {
    width: '100%',
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLowest,
  },
  wallpaperActions: { flexDirection: 'row', gap: spacing.sm },
  wallpaperBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  wallpaperBtnText: { ...typography.label, fontSize: 13, color: colors.onSurface },
  wallpaperEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 128,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceHigh,
  },
  wallpaperEmptyText: { ...typography.label, fontSize: 13, color: colors.onSurface },
  wallpaperEmptyHint: { ...typography.caption, fontSize: 11, color: colors.textFaint },

  error: { ...typography.caption, fontSize: 12, color: colors.error, marginTop: spacing.md },
});
