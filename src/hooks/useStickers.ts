import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchFavoriteStickerIds,
  fetchFavoriteStickers,
  fetchMyStickers,
  favoriteSticker,
  unfavoriteSticker,
} from '../lib/stickers';
import type { Sticker } from '../types';

/**
 * Backs the sticker picker's "My Stickers" / "Favorites" tabs plus the
 * favorite toggle used both there and from a long-press in chat. Refetches
 * on demand (`refresh`) rather than subscribing to realtime — favoriting is
 * a personal, low-frequency action, not something that needs to appear on
 * other devices instantly.
 */
export function useStickers() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [myStickers, setMyStickers] = useState<Sticker[]>([]);
  const [favoriteStickers, setFavoriteStickers] = useState<Sticker[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [mine, favs, favIds] = await Promise.all([
      fetchMyStickers(userId),
      fetchFavoriteStickers(userId),
      fetchFavoriteStickerIds(userId),
    ]);
    setMyStickers(mine);
    setFavoriteStickers(favs);
    setFavoriteIds(favIds);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleFavorite = useCallback(
    async (stickerId: string) => {
      if (!userId) return;
      const isFav = favoriteIds.has(stickerId);

      // Optimistic — the tray should react to the tap immediately.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(stickerId);
        else next.add(stickerId);
        return next;
      });

      const ok = isFav
        ? await unfavoriteSticker(userId, stickerId)
        : await favoriteSticker(userId, stickerId);

      if (!ok) {
        // Roll back on failure, then let the next refresh reconcile the list.
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(stickerId);
          else next.delete(stickerId);
          return next;
        });
        return;
      }
      refresh();
    },
    [userId, favoriteIds, refresh]
  );

  return { myStickers, favoriteStickers, favoriteIds, loading, refresh, toggleFavorite };
}
