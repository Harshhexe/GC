import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppAppearance = 'light' | 'dark' | 'genz';

type Palette = {
  appRoot: string; appChrome: string; bg: string; surfaceLowest: string; surfaceLow: string;
  surface: string; surfaceHigh: string; surfaceHighest: string; onSurface: string;
  onSurfaceVariant: string; textMuted: string; outline: string; outlineVariant: string;
  primary: string; primaryContainer: string; onPrimary: string; secondary: string;
  secondaryContainer: string; onSecondary: string; tertiary: string; tertiaryContainer: string;
  onTertiary: string; lime: string; error: string; onError: string; border: string;
  borderBright: string; scrim: string;
};

export type AppTheme = {
  id: AppAppearance;
  label: string;
  description: string;
  icon: 'sunny-outline' | 'moon-outline' | 'sparkles-outline';
  isDark: boolean;
  palette: Palette;
  gradients: readonly [string, string];
  canvas: readonly [string, string, string];
  glass: { fill: string; fillStrong: string; stroke: string; strokeBright: string; inputFill: string };
};

const STORAGE_KEY = '@gc_app_appearance_v1';

const genz: AppTheme = {
  id: 'genz', label: 'Signal', description: 'GC’s focused indigo look.', icon: 'sparkles-outline', isDark: true,
  palette: {
    appRoot:'#0C1015', appChrome:'#090C10', bg:'#0C1015', surfaceLowest:'#0A0D12', surfaceLow:'#151A21', surface:'#1B222B', surfaceHigh:'#252D38', surfaceHighest:'#303946',
    onSurface:'#F4F6F8', onSurfaceVariant:'#AAB3BE', textMuted:'#96A1AE', outline:'#75808D', outlineVariant:'#35404B', primary:'#B0B6FF', primaryContainer:'#6A6FEB', onPrimary:'#FFFFFF', secondary:'#E4A4B7', secondaryContainer:'#B76486', onSecondary:'#FFFFFF', tertiary:'#86C7D7', tertiaryContainer:'#357E94', onTertiary:'#FFFFFF', lime:'#55BE9D', error:'#F18585', onError:'#FFFFFF', border:'rgba(244,246,248,0.08)', borderBright:'rgba(244,246,248,0.15)', scrim:'rgba(5,8,12,0.80)',
  },
  gradients:['#7378EC','#5C63D7'], canvas:['#111722','#0C1015','#090C10'],
  glass:{fill:'rgba(255,255,255,0.035)',fillStrong:'rgba(255,255,255,0.055)',stroke:'rgba(255,255,255,0.075)',strokeBright:'rgba(255,255,255,0.13)',inputFill:'rgba(0,0,0,0.25)'},
};

const dark: AppTheme = {
  id: 'dark', label: 'Dark', description: 'Quiet graphite. Sharp focus. Zero noise.', icon: 'moon-outline', isDark: true,
  palette: {
    appRoot:'#0C0E12', appChrome:'#08090C', bg:'#101216', surfaceLowest:'#0C0E12', surfaceLow:'#14171C', surface:'#1A1D23', surfaceHigh:'#23272E', surfaceHighest:'#2D323A',
    onSurface:'#F6F7F9', onSurfaceVariant:'#B2B7C0', textMuted:'#9299A4', outline:'#6D747E', outlineVariant:'#353A42', primary:'#A5B4FC', primaryContainer:'#6D7FF2', onPrimary:'#10131B', secondary:'#C8CDD7', secondaryContainer:'#7F8794', onSecondary:'#10131B', tertiary:'#7DD3FC', tertiaryContainer:'#2E93C7', onTertiary:'#06131A', lime:'#5EEAD4', error:'#FB7185', onError:'#2A0710', border:'rgba(255,255,255,0.09)', borderBright:'rgba(255,255,255,0.17)', scrim:'rgba(4,5,7,0.82)',
  },
  gradients:['#A5B4FC','#6D7FF2'], canvas:['#151924','#0E1015','#08090C'],
  glass:{fill:'rgba(255,255,255,0.055)',fillStrong:'rgba(255,255,255,0.085)',stroke:'rgba(255,255,255,0.10)',strokeBright:'rgba(255,255,255,0.17)',inputFill:'rgba(0,0,0,0.28)'},
};

const light: AppTheme = {
  id: 'light', label: 'Light', description: 'Warm paper, ink type, and calm indigo.', icon: 'sunny-outline', isDark: false,
  palette: {
    appRoot:'#F7F7F5', appChrome:'#F1F1EE', bg:'#F7F7F5', surfaceLowest:'#ECECE8', surfaceLow:'#FFFFFF', surface:'#FFFFFF', surfaceHigh:'#F0F0ED', surfaceHighest:'#E6E6E2',
    onSurface:'#17181C', onSurfaceVariant:'#5D616A', textMuted:'#6E737D', outline:'#8D919A', outlineVariant:'#D8D8D2', primary:'#4F46E5', primaryContainer:'#4338CA', onPrimary:'#FFFFFF', secondary:'#9D174D', secondaryContainer:'#BE185D', onSecondary:'#FFFFFF', tertiary:'#0369A1', tertiaryContainer:'#0284C7', onTertiary:'#FFFFFF', lime:'#047857', error:'#BE123C', onError:'#FFFFFF', border:'rgba(23,24,28,0.10)', borderBright:'rgba(23,24,28,0.16)', scrim:'rgba(17,18,21,0.38)',
  },
  gradients:['#4F46E5','#6366F1'], canvas:['#FFFFFF','#F7F7F5','#ECECE8'],
  glass:{fill:'rgba(255,255,255,0.78)',fillStrong:'rgba(255,255,255,0.94)',stroke:'rgba(23,24,28,0.10)',strokeBright:'rgba(23,24,28,0.16)',inputFill:'rgba(23,24,28,0.045)'},
};

export const APP_THEMES: Record<AppAppearance, AppTheme> = { light, dark, genz };

type AppearanceContextValue = { appearance: AppAppearance; theme: AppTheme; ready: boolean; setAppearance: (appearance: AppAppearance) => Promise<void> };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppAppearance>('genz');
  const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(STORAGE_KEY).then((saved) => { if (saved === 'light' || saved === 'dark' || saved === 'genz') setAppearanceState(saved); }).catch(() => {}).finally(() => setReady(true)); }, []);
  const setAppearance = useCallback(async (next: AppAppearance) => { setAppearanceState(next); await AsyncStorage.setItem(STORAGE_KEY, next); }, []);
  const value = useMemo(() => ({ appearance, theme: APP_THEMES[appearance], ready, setAppearance }), [appearance, ready, setAppearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
