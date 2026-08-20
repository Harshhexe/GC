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
  /** 'custom' is a colour lifted from the wallpaper rather than a preset. */
  key: GroupThemeKey | 'custom';
  name: string;
  /** Ring / button gradient. */
  colors: readonly [string, string];
  /** Single colour for text, dots and borders. */
  accent: string;
};

/** The built-in presets. Narrower than GroupTheme: never a wallpaper colour. */
export type GroupPresetTheme = GroupTheme & { key: GroupThemeKey };

export const GROUP_THEMES: GroupPresetTheme[] = [
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


/**
 * Builds a full theme around a single colour taken from a wallpaper.
 *
 * Only the *hue* survives from the photo. Saturation and lightness are pinned
 * to the range the presets occupy, because a theme colour has two jobs with
 * opposite requirements: it is used as a ~35% tint over near-black (so it must
 * be bright enough to register) and its accent is drawn as text on top of that
 * tint (so the accent must be light enough to read). A muddy or near-black hue
 * lifted verbatim fails both — the contrast work in MessageBubble is why these
 * numbers are fixed rather than sampled.
 */
export function themeFromColor(hex: string): GroupTheme {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/./g, '$&$&') : clean.slice(0, 6), 16);
  const { h } = rgbToHsl({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });

  return {
    key: 'custom',
    name: 'From wallpaper',
    // A second, slightly rotated stop so the bubble keeps the gradient the
    // presets have rather than reading as one flat block.
    colors: [hslToHex(h, 0.68, 0.62), hslToHex((h + 28) % 360, 0.7, 0.54)],
    accent: hslToHex(h, 0.72, 0.8),
  };
}

// ── Personal chat appearance ────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hslToHex, rgbToHsl } from '../lib/palette';
import { useState, useEffect, useCallback, useRef } from 'react';

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
  /** Hex picked from the wallpaper's palette. Overrides themeKey when set. */
  customThemeColor: string | null;
  /** Colours pulled out of the current wallpaper, offered alongside the presets. */
  wallpaperPalette: string[];
  bubbleStyle: BubbleStyle;
  /** Local URI (native) or data URL (web) of a custom background; null = none. */
  wallpaperUri: string | null;
};

export const DEFAULT_APPEARANCE: Omit<ChatAppearance, 'themeKey'> = {
  bubbleStyle: 'translucent',
  wallpaperUri: null,
  customThemeColor: null,
  wallpaperPalette: [],
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
    customThemeColor:
      typeof value.customThemeColor === 'string' ? value.customThemeColor : null,
    wallpaperPalette: Array.isArray(value.wallpaperPalette)
      ? value.wallpaperPalette.filter((c): c is string => typeof c === 'string')
      : [],
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
  /**
   * Always the newest value, including writes not yet rendered. See update().
   * Kept in step at every point that sets state — the initial load, the
   * cross-screen listener and update() itself — rather than being reassigned
   * during render, which could overwrite a newer value mid-render.
   */
  const latest = useRef(appearance);

  useEffect(() => {
    let mounted = true;
    getChatAppearance(groupId, fallbackThemeKey).then((a) => {
      if (!mounted) return;
      latest.current = a;
      setAppearance(a);
    });

    const listener = (next: ChatAppearance) => {
      if (!mounted) return;
      latest.current = next;
      setAppearance(next);
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

  /*
   * Merged against a ref rather than the rendered value.
   *
   * Two updates in a row from one handler — as picking a wallpaper does, first
   * the image and then the palette extracted from it — would otherwise both
   * merge into the state captured when that handler was created. The second
   * write would spread a stale object and silently revert the first, so the
   * new wallpaper appeared and then vanished. The ref also keeps this callback
   * stable, which stops every consumer re-rendering on each change.
   */
  const update = useCallback(
    async (patch: Partial<ChatAppearance>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setAppearance(next);
      await setChatAppearance(groupId, next);
    },
    [groupId]
  );

  return {
    appearance,
    theme: appearance.customThemeColor
      ? themeFromColor(appearance.customThemeColor)
      : groupTheme(appearance.themeKey),
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
