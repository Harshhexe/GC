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
