/**
 * Per-group colour identity. Picked at creation, then used for the group's
 * avatar ring, accents and highlights so each GC feels distinct inside an
 * otherwise shared dark shell.
 */
export type GroupThemeKey =
  | 'violet'
  | 'bubblegum'
  | 'cyan'
  | 'sunset'
  | 'lime'
  | 'midnight';

export type GroupTheme = {
  key: GroupThemeKey;
  name: string;
  /** Ring / button gradient. */
  colors: readonly [string, string];
  /** Single colour for text, dots and borders. */
  accent: string;
};

export const GROUP_THEMES: GroupTheme[] = [
  { key: 'violet', name: 'Violet', colors: ['#8B5CF6', '#EC4899'], accent: '#d0bcff' },
  { key: 'bubblegum', name: 'Bubblegum', colors: ['#ffb0cd', '#d0bcff'], accent: '#ffb0cd' },
  { key: 'cyan', name: 'Cyan', colors: ['#4cd7f6', '#009eb9'], accent: '#4cd7f6' },
  { key: 'sunset', name: 'Sunset', colors: ['#FB7185', '#FBBF24'], accent: '#FBBF24' },
  { key: 'lime', name: 'Lime', colors: ['#84CC16', '#22D3EE'], accent: '#84CC16' },
  { key: 'midnight', name: 'Midnight', colors: ['#6366F1', '#312E81'], accent: '#818CF8' },
];

const byKey = new Map(GROUP_THEMES.map((t) => [t.key, t]));

export function groupTheme(key?: string | null): GroupTheme {
  return byKey.get((key ?? 'violet') as GroupThemeKey) ?? GROUP_THEMES[0];
}

/**
 * The temporary look while a Tea session is running — hot amber over the
 * group's usual palette, so the chat reads as "something is happening" the
 * moment you open it.
 *
 * Deliberately a GroupTheme like any other rather than a parallel styling
 * path: everything downstream already themes off this object, so Tea Mode
 * changes one value instead of every component. It is never persisted, so a
 * group's chosen theme is untouched and returns the instant Tea ends.
 */
export const TEA_THEME: GroupTheme = {
  key: 'sunset',
  name: 'Tea',
  colors: ['#F59E0B', '#EF4444'],
  accent: '#FBBF24',
};

// ── Personal View Theme Storage ─────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';

const themeListeners = new Map<string, Set<(key: GroupThemeKey) => void>>();

export async function getPersonalGroupTheme(groupId: string): Promise<GroupThemeKey | null> {
  try {
    const val = await AsyncStorage.getItem(`@gc_personal_theme_${groupId}`);
    if (val && byKey.has(val as GroupThemeKey)) {
      return val as GroupThemeKey;
    }
  } catch {}
  return null;
}

export async function setPersonalGroupTheme(groupId: string, key: GroupThemeKey): Promise<void> {
  try {
    await AsyncStorage.setItem(`@gc_personal_theme_${groupId}`, key);
    // Notify any active listeners (e.g. ChatScreen, GroupInfoScreen)
    const listeners = themeListeners.get(groupId);
    if (listeners) {
      listeners.forEach((fn) => fn(key));
    }
  } catch {}
}

export function usePersonalGroupTheme(groupId: string, fallbackThemeKey?: string | null) {
  const [personalKey, setPersonalKey] = useState<GroupThemeKey | null>(null);

  useEffect(() => {
    let mounted = true;
    getPersonalGroupTheme(groupId).then((key) => {
      if (mounted && key) setPersonalKey(key);
    });

    const listener = (newKey: GroupThemeKey) => {
      if (mounted) setPersonalKey(newKey);
    };

    if (!themeListeners.has(groupId)) {
      themeListeners.set(groupId, new Set());
    }
    themeListeners.get(groupId)!.add(listener);

    return () => {
      mounted = false;
      const set = themeListeners.get(groupId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) themeListeners.delete(groupId);
      }
    };
  }, [groupId]);

  const activeKey = personalKey || ((fallbackThemeKey as GroupThemeKey) ?? 'violet');
  const theme = groupTheme(activeKey);

  const updateTheme = useCallback(
    async (newKey: GroupThemeKey) => {
      setPersonalKey(newKey);
      await setPersonalGroupTheme(groupId, newKey);
    },
    [groupId]
  );

  return { theme, themeKey: activeKey, updateTheme };
}
