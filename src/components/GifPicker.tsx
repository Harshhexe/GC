import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme/theme';
import { duration, easing, reduceMotion } from '../theme/motion';
import { PressableScale } from './ui/PressableScale';
import { AmbientBackground } from './ui/AmbientBackground';
import { WebModalCard } from './ui/WebModalCard';
import { DismissibleModalPage } from './ui/DismissibleModalPage';
import { searchGifs, type GifResult } from '../lib/giphy';

const COLUMNS = 3;
const GAP = 4;

/** How long to wait after the last keystroke before searching */
const DEBOUNCE_MS = 350;

/**
 * Full-screen GIPHY search modal.
 * Safe area insets ensure the search bar and Cancel button are never clipped or out of screen.
 * Off-screen GIFs automatically pause playback to save memory and battery.
 */
export function GifPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const requestId = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track currently visible items to pause off-screen GIFs
  const [visibleGifIds, setVisibleGifIds] = useState<Set<string>>(() => new Set());

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const ids = new Set<string>();
      for (const token of viewableItems) {
        if (token.item?.id) {
          ids.add(token.item.id);
        } else if (token.key) {
          ids.add(token.key);
        }
      }
      setVisibleGifIds(ids);
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 15,
  }).current;

  // Trending on open, then re-searches as query changes
  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(
      async () => {
        const thisRequest = ++requestId.current;
        setLoading(true);
        const gifs = await searchGifs(query);
        if (thisRequest !== requestId.current) return;
        setResults(gifs);
        setLoading(false);
        setSearchedOnce(true);
      },
      query ? DEBOUNCE_MS : 0
    );

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [visible, query]);

  // Reset search state on close
  useEffect(() => {
    if (visible) return;
    setQuery('');
    setResults([]);
    setSearchedOnce(false);
  }, [visible]);

  const content = (
    <View style={styles.root}>
      <AmbientBackground variant="default" />

        {/* Safe Top Header with Search Bar and Cancel Button */}
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
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.onSurfaceVariant} style={styles.searchIcon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search GIPHY..."
              placeholderTextColor={colors.outline}
              style={styles.searchInput}
              autoFocus={true}
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!query && (
              <PressableScale onPress={() => setQuery('')} hitSlop={10} scaleTo={0.88}>
                <Ionicons name="close-circle" size={17} color={colors.outline} />
              </PressableScale>
            )}
          </View>

          <PressableScale
            style={styles.cancelBtn}
            scaleTo={0.92}
            hitSlop={10}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
        </View>

        {/* Keyboard-Friendly Content Container */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.contentWrap}
        >
          {loading && results.length === 0 ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : results.length === 0 && searchedOnce ? (
            <View style={styles.centerState}>
              <Text style={styles.emptyText}>No GIFs found for "{query}"</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              key={COLUMNS}
              numColumns={COLUMNS}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.grid,
                { paddingBottom: Math.max(insets.bottom + 24, 36) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              renderItem={({ item }) => {
                const isGifVisible = visibleGifIds.size === 0 || visibleGifIds.has(item.id);
                return (
                  <PressableScale
                    style={styles.cell}
                    scaleTo={0.95}
                    haptic="light"
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <Image
                      source={item.previewUrl}
                      autoplay={isGifVisible}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={120}
                    />
                  </PressableScale>
                );
              }}
            />
          )}

          {/* GIPHY Attribution Badge */}
          <Animated.View
            entering={FadeIn.duration(duration.fast).easing(easing.out).reduceMotion(reduceMotion)}
            style={styles.attribution}
          >
            <Text style={styles.attributionText}>Powered by GIPHY</Text>
          </Animated.View>
        </KeyboardAvoidingView>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    zIndex: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  searchIcon: {
    alignSelf: 'center',
  },
  searchInput: {
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
  cancelBtn: {
    height: 42,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 22,
  },
  contentWrap: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  grid: {
    paddingHorizontal: GAP,
    paddingTop: GAP,
  },
  cell: {
    flex: 1 / COLUMNS,
    aspectRatio: 1,
    margin: GAP,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  attribution: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  attributionText: {
    ...typography.micro,
    color: colors.outline,
    fontSize: 10,
    letterSpacing: 0.3,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
