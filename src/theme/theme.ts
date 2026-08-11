/**
 * GC design tokens — "Vibrant Neo-Glass".
 *
 * Neo-Brutalism (heavy type, thick strokes, hard offset shadows) layered over
 * Glassmorphism (translucent panels on vibrant mesh gradients). Values come
 * from the design system spec; see stitch_gc_gen_z_social_platform/DESIGN.md.
 */

export const colors = {
  // Surface ramp, lowest → highest elevation
  bg: '#0A0A0F',
  surfaceLowest: '#050508',
  surfaceLow: '#0F0F17',
  surface: '#151522',
  surfaceHigh: '#1C1C2C',
  surfaceHighest: '#242438',

  onSurface: '#F3F4F6',
  onSurfaceVariant: '#9CA3AF',
  outline: '#6B7280',
  outlineVariant: '#374151',

  // Brand — Refined Indigo identity, Rose counterpart, Sky for functional accents.
  primary: '#818CF8',
  primaryContainer: '#6366F1',
  onPrimary: '#FFFFFF',
  primaryDeep: '#4F46E5',

  secondary: '#F472B6',
  secondaryContainer: '#DB2777',
  onSecondary: '#FFFFFF',
  secondaryDeep: '#BE185D',

  tertiary: '#38BDF8',
  tertiaryContainer: '#0284C7',
  onTertiary: '#FFFFFF',

  lime: '#10B981',
  error: '#F87171',
  onError: '#FFFFFF',

  // Aliases kept so existing screens keep compiling while they're reworked.
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textFaint: '#6B7280',
  accent: '#818CF8',
  accentStrong: '#6366F1',
  accentSoft: 'rgba(129, 140, 248, 0.14)',
  accentGlow: 'rgba(99, 102, 241, 0.35)',
  card: '#13131D',
  cardHigh: '#1A1A28',
  bgElevated: '#0F0F17',
  border: 'rgba(255, 255, 255, 0.08)',
  borderBright: 'rgba(255, 255, 255, 0.16)',
  pink: '#F472B6',
  cyan: '#38BDF8',
  yellow: '#FBBF24',
  green: '#10B981',
  red: '#F87171',
  onAccent: '#FFFFFF',
  scrim: 'rgba(5, 5, 10, 0.80)',
} as const;

/** The glass recipe. Every floating panel uses this, not ad-hoc rgba. */
export const glass = {
  fill: 'rgba(255, 255, 255, 0.05)',
  fillStrong: 'rgba(255, 255, 255, 0.08)',
  /** Spec calls for a 1.5px stroke on every glass element. */
  stroke: 'rgba(255, 255, 255, 0.10)',
  strokeBright: 'rgba(255, 255, 255, 0.18)',
  borderWidth: 1.5,
  blur: 40,
  /** Inputs sit *darker* than the surface behind them. */
  inputFill: 'rgba(0, 0, 0, 0.20)',
} as const;

export const gradients = {
  /** "Super actions" — 135° primary → secondary. */
  brand: ['#6366F1', '#4F46E5'] as const,
  cta: ['#6366F1', '#4F46E5'] as const,
  /** Light lavender→pink, as on the Invite Friends button. */
  brandSoft: ['#818CF8', '#A5B4FC'] as const,
  cyan: ['#0284C7', '#0369A1'] as const,
  /** Background mesh blobs. */
  meshViolet: ['rgba(99, 102, 241, 0.08)', 'rgba(99, 102, 241, 0)'] as const,
  meshPink: ['rgba(236, 72, 153, 0.05)', 'rgba(236, 72, 153, 0)'] as const,
  meshCyan: ['rgba(56, 189, 248, 0.04)', 'rgba(56, 189, 248, 0)'] as const,
  /** Top-light sheen across glass panels. */
  sheen: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] as const,
  glassPanel: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)'] as const,
  night: ['#11111A', '#0A0A0F'] as const,
} as const;

/** 8px base rhythm. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  section: 48,
} as const;

/** "Hyper-rounded" shape language. */
export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  pill: 999,
} as const;

export const HIT_TARGET = 44;
export const CONTAINER_MARGIN = 24;
/** Floating dock height — screens pad their scroll content by this. */
export const DOCK_HEIGHT = 124;

export const shadows = {
  /** Colour-matched glow, never black. */
  glow: {
    shadowColor: colors.primaryContainer,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  glowPink: {
    shadowColor: colors.secondaryDeep,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  glowCyan: {
    shadowColor: colors.tertiary,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  /** Neo-brutalist hard offset — no blur, full opacity. */
  hard: {
    shadowColor: '#000000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 4 },
    elevation: 6,
  },
  soft: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export const fontFamily = {
  /** Bricolage Grotesque: expressive, heavy, tight — carries the headlines. */
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

// letterSpacing in React Native is absolute px, so the spec's em values are
// resolved against each size here rather than carried as ratios.
export const typography = {
  displayXl: { fontFamily: fontFamily.display, fontSize: 56, lineHeight: 60, letterSpacing: -2.2 },
  headline: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.64 },
  headlineSm: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  title: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  titleMd: { fontFamily: fontFamily.bodyBold, fontSize: 20, lineHeight: 28 },
  bodyLg: { fontFamily: fontFamily.body, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 20 },
  micro: { fontFamily: fontFamily.bodyMedium, fontSize: 12, lineHeight: 16 },
  /** All-caps eyebrow labels — never below 12px per the spec. */
  label: { fontFamily: fontFamily.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  // Legacy aliases still referenced by screens pending rework.
  heading: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  subheading: { fontFamily: fontFamily.bodySemi, fontSize: 16, lineHeight: 22 },
  hero: { fontFamily: fontFamily.display, fontSize: 56, lineHeight: 60, letterSpacing: -2.2 },
} as const;
