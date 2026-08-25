import { useEffect } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import { WebModalCard } from './ui/WebModalCard';
import { DismissibleModalPage } from './ui/DismissibleModalPage';
import { useStickers } from '../hooks/useStickers';
import type { Sticker } from '../types';

const COLUMNS = 3;
const GAP = 8;

/**
 * Full-screen sticker tray, one scroll: Favorites first (whoever's stickers
 * they are), a divider, then everything you've made yourself. Tapping a
 * sticker sends it — this is a picker, not a management screen.
 */
export function StickerPicker({
  visible,
  onClose,
  onSelect,
  onCreateNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (sticker: Sticker) => void;
  /** The creator is a separate top-level Modal owned by the caller, not
   *  nested in here — two RN `Modal`s presented at once (one literally
   *  inside the other's tree, as this used to be) froze touch handling
   *  rather than stacking cleanly. The caller closes this one first. */
  onCreateNew: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { myStickers, favoriteStickers, favoriteIds, loading, refresh, toggleFavorite } = useStickers();

  // The tray stays mounted while hidden (only the Modal toggles), so it
  // needs to pull in anything favorited elsewhere (e.g. a chat long-press)
  // each time it's reopened rather than only once on mount.
  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  function handleSelect(sticker: Sticker) {
    onSelect(sticker);
    onClose();
  }

  const content = (
    <View style={styles.root}>
      <AmbientBackground variant="default" />

        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 20) }]}>
          <Text style={styles.headerTitle}>Stickers</Text>
          <PressableScale style={styles.cancelBtn} scaleTo={0.92} hitSlop={10} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
        </View>

        {loading && myStickers.length === 0 && favoriteStickers.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
          >
            <Section
              title="Favorites"
              emptyText="No favorites yet — hold on any sticker to save it."
              stickers={favoriteStickers}
              favoriteIds={favoriteIds}
              onSelect={handleSelect}
              onToggleFavorite={toggleFavorite}
            />

            <View style={styles.divider} />

            <Section
              title="Your Stickers"
              emptyText="No stickers yet — make one below."
              stickers={myStickers}
              favoriteIds={favoriteIds}
              onSelect={handleSelect}
              onToggleFavorite={toggleFavorite}
            />
          </ScrollView>
        )}

        <PressableScale
          style={[styles.createBtn, { bottom: Math.max(insets.bottom + 20, 32) }]}
          scaleTo={0.92}
          haptic="medium"
          onPress={onCreateNew}
        >
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </PressableScale>
      </View>
  );

  if (Platform.OS === 'web') {
    return (
      <WebModalCard visible={visible} onClose={onClose}>
        {content}
      </WebModalCard>
    );
  }

  return (
    <DismissibleModalPage visible={visible} onClose={onClose}>
      {content}
    </DismissibleModalPage>
  );
}

function Section({
  title,
  emptyText,
  stickers,
  favoriteIds,
  onSelect,
  onToggleFavorite,
}: {
  title: string;
  emptyText: string;
  stickers: Sticker[];
  favoriteIds: Set<string>;
  onSelect: (sticker: Sticker) => void;
  onToggleFavorite: (stickerId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {stickers.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.grid}>
          {stickers.map((item) => (
            <StickerCell
              key={item.id}
              sticker={item}
              isFavorite={favoriteIds.has(item.id)}
              onPress={() => onSelect(item)}
              onToggleFavorite={() => onToggleFavorite(item.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function StickerCell({
  sticker,
  isFavorite,
  onPress,
  onToggleFavorite,
}: {
  sticker: Sticker;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <View style={styles.cell}>
      <PressableScale style={styles.cellImageWrap} scaleTo={0.95} haptic="light" onPress={onPress}>
        <Image source={sticker.imageUrl} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={120} />
      </PressableScale>
      <PressableScale style={styles.favBtn} hitSlop={8} scaleTo={0.8} haptic="light" onPress={onToggleFavorite}>
        <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={15} color={isFavorite ? colors.yellow : '#FFFFFF'} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: { ...typography.titleMd, fontSize: 16, color: colors.onSurface },
  cancelBtn: { paddingVertical: spacing.xs },
  cancelText: { ...typography.bodyMedium, fontSize: 15, color: colors.primary },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  scroll: { paddingTop: spacing.md },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  section: { paddingHorizontal: spacing.lg },
  sectionTitle: {
    ...typography.label,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.sm,
  },
  emptyText: { ...typography.body, fontSize: 13.5, color: colors.onSurfaceVariant },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -GAP },
  cell: {
    width: `${100 / COLUMNS}%`,
    aspectRatio: 1,
    padding: GAP,
  },
  cellImageWrap: {
    flex: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  favBtn: {
    position: 'absolute',
    top: GAP + 4,
    right: GAP + 4,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
