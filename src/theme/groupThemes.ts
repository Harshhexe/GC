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


// ── Personal chat appearance ────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';

/**
 * How message bubbles are filled.
 *
 * `translucent` is the original look — tinted glass letting the background
 * through. `opaque` is for anyone who finds that hard to read, especially over
 * a busy custom wallpaper, and is why the setting exists at all.
 */
export type BubbleStyle = 'translucent' | 'opaque';

/**
 * Everything the Chat Theme sheet controls, per group and per device.
 *
 * Deliberately local-only (AsyncStorage, never the server): this is "how *I*
 * want to see this chat", so it must not change the look for anybody else in
 * the GC — the same reason the theme picker was always labelled Personal View.
 */
export type ChatAppearance = {
  themeKey: GroupThemeKey;
  bubbleStyle: BubbleStyle;
  /** Local URI (native) or data URL (web) of a custom background; null = none. */
  wallpaperUri: string | null;
};

export const DEFAULT_APPEARANCE: Omit<ChatAppearance, 'themeKey'> = {
  bubbleStyle: 'translucent',
  wallpaperUri: null,
};

const appearanceKey = (groupId: string) => `@gc_chat_appearance_${groupId}`;
/** Pre-appearance storage: a bare theme key. Read once, then folded in. */
const legacyThemeKey = (groupId: string) => `@gc_personal_theme_${groupId}`;

const appearanceListeners = new Map<string, Set<(a: ChatAppearance) => void>>();

function normalize(raw: unknown, fallbackThemeKey?: string | null): ChatAppearance {
  const value = (raw ?? {}) as Partial<ChatAppearance>;
  const key = byKey.has(value.themeKey as GroupThemeKey)
    ? (value.themeKey as GroupThemeKey)
    : ((fallbackThemeKey as GroupThemeKey) ?? 'violet');
  return {
    themeKey: byKey.has(key) ? key : 'violet',
    bubbleStyle: value.bubbleStyle === 'opaque' ? 'opaque' : 'translucent',
    wallpaperUri: typeof value.wallpaperUri === 'string' ? value.wallpaperUri : null,
  };
}

export async function getChatAppearance(
  groupId: string,
  fallbackThemeKey?: string | null
): Promise<ChatAppearance> {
  try {
    const stored = await AsyncStorage.getItem(appearanceKey(groupId));
    if (stored) return normalize(JSON.parse(stored), fallbackThemeKey);

    // Carry over a theme chosen before this sheet existed, so upgrading
    // doesn't silently reset someone's colour back to the group default.
    const legacy = await AsyncStorage.getItem(legacyThemeKey(groupId));
    if (legacy) return normalize({ themeKey: legacy as GroupThemeKey }, fallbackThemeKey);
  } catch {}
  return normalize(null, fallbackThemeKey);
}

export async function setChatAppearance(
  groupId: string,
  appearance: ChatAppearance
): Promise<void> {
  try {
    await AsyncStorage.setItem(appearanceKey(groupId), JSON.stringify(appearance));
  } catch {}
  // Notified regardless of whether the write succeeded: the in-memory state is
  // already live, and a storage failure shouldn't leave open screens stale.
  appearanceListeners.get(groupId)?.forEach((fn) => fn(appearance));
}

/**
 * Subscribes to this group's personal appearance. Every screen that renders
 * the chat's look uses this, so a change made in the sheet lands everywhere
 * at once without a reload.
 */
export function useChatAppearance(groupId: string, fallbackThemeKey?: string | null) {
  const [appearance, setAppearance] = useState<ChatAppearance>(() =>
    normalize(null, fallbackThemeKey)
  );

  useEffect(() => {
    let mounted = true;
    getChatAppearance(groupId, fallbackThemeKey).then((a) => {
      if (mounted) setAppearance(a);
    });

    const listener = (next: ChatAppearance) => {
      if (mounted) setAppearance(next);
    };
    if (!appearanceListeners.has(groupId)) appearanceListeners.set(groupId, new Set());
    appearanceListeners.get(groupId)!.add(listener);

    return () => {
      mounted = false;
      const set = appearanceListeners.get(groupId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) appearanceListeners.delete(groupId);
      }
    };
  }, [groupId, fallbackThemeKey]);

  const update = useCallback(
    async (patch: Partial<ChatAppearance>) => {
      const next = { ...appearance, ...patch };
      setAppearance(next);
      await setChatAppearance(groupId, next);
    },
    [appearance, groupId]
  );

  return {
    appearance,
    theme: groupTheme(appearance.themeKey),
    themeKey: appearance.themeKey,
    bubbleStyle: appearance.bubbleStyle,
    wallpaperUri: appearance.wallpaperUri,
    update,
  };
}

/** Theme-only view of the same state, for screens that render no bubbles. */
export function usePersonalGroupTheme(groupId: string, fallbackThemeKey?: string | null) {
  const { theme, themeKey, update } = useChatAppearance(groupId, fallbackThemeKey);
  const updateTheme = useCallback((key: GroupThemeKey) => update({ themeKey: key }), [update]);
  return { theme, themeKey, updateTheme };
}

/**
 * Flattens a translucent tint into the solid colour it *appears* as over the
 * chat's dark background.
 *
 * Opaque bubbles can't just use the raw theme colours: those are bright brand
 * hues meant to be seen at ~25-35% over near-black, and at full strength they
 * turn the bubble light — at which point white body text, accent-coloured
 * @mentions and timestamps all wash out, since every one of them is designed
 * for a dark fill.
 *
 * Compositing the same tint at the same alpha over the base instead means an
 * opaque bubble is the exact colour a translucent one already reads as, so
 * contrast is unchanged and the only difference is what it was asked to be:
 * the wallpaper no longer shows through.
 */
export function flattenTint(hex: string, alpha: number, base = '#0A0A0F'): string {
  const parse = (value: string) => {
    const clean = value.replace('#', '');
    const full =
      clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean.slice(0, 6);
    const n = parseInt(full, 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  const [fr, fg, fb] = parse(hex);
  const [br, bg, bb] = parse(base);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));

  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The alphas the translucent bubble uses, so both modes stay in step. */
export const BUBBLE_ALPHA = { mineTop: 0.35, mineBottom: 0.24, theirs: 0.05 } as const;
