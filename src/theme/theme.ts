/** GC's shared visual language: confident type, quiet surfaces, and indigo accents. */

export const colors = {
  /**
   * The two app-chrome blacks, named because they were previously spelled out
   * as literals in ~20 files, drifted apart, and produced a visible seam in
   * the iOS PWA where the safe-area strips are painted by the page rather than
   * by React.
   *
   * `appRoot` is what a full screen sits on. `appChrome` is the darker value
   * behind everything — the web shell, the PWA safe areas, the manifest and
   * splash background, and the far end of the screen gradients. Any surface
   * the OS paints for us has to use `appChrome`, or the seam comes back.
   */
  appRoot: '#0C1015',
  appChrome: '#090C10',

  // Surface ramp, lowest → highest elevation
  bg: '#0C1015',
  surfaceLowest: '#0A0D12',
  surfaceLow: '#151A21',
  surface: '#1B222B',
  surfaceHigh: '#252D38',
  surfaceHighest: '#303946',

  // Cool neutral type and borders work across the appearance themes.
  onSurface: '#F4F6F8',
  onSurfaceVariant: '#AAB3BE',
  /** Secondary copy; use outline for borders and disabled states. */
  textMuted: '#96A1AE',
  outline: '#75808D',
  outlineVariant: '#35404B',

  // Signal violet with rose and blue reserved for meaning.
  primary: '#B0B6FF',
  primaryContainer: '#6A6FEB',
  onPrimary: '#FFFFFF',
  primaryDeep: '#5057C8',

  secondary: '#E4A4B7',
  secondaryContainer: '#B76486',
  onSecondary: '#FFFFFF',
  secondaryDeep: '#91415F',

  tertiary: '#86C7D7',
  tertiaryContainer: '#357E94',
  onTertiary: '#FFFFFF',

  lime: '#55BE9D',
  error: '#F18585',
  onError: '#FFFFFF',

  // Aliases used by screen styles during the layout migration.
  textPrimary: '#F4F6F8',
  textSecondary: '#AAB3BE',
  textFaint: '#75808D',
  accent: '#B0B6FF',
  accentStrong: '#6A6FEB',
  accentSoft: 'rgba(176, 182, 255, 0.12)',
  accentGlow: 'rgba(106, 111, 235, 0.15)',
  card: '#151A21',
  cardHigh: '#1B222B',
  bgElevated: '#151A21',
  border: 'rgba(244, 246, 248, 0.08)',
  borderBright: 'rgba(244, 246, 248, 0.15)',
  pink: '#E4A4B7',
  cyan: '#86C7D7',
  yellow: '#E9BD69',
  green: '#55BE9D',
  red: '#F18585',
  onAccent: '#FFFFFF',
  scrim: 'rgba(5, 8, 12, 0.80)',
} as const;

/** The frosted glass recipe — clean blurred opacity look. */
export const glass = {
  // Quiet, legible surfaces. Reserve translucency for overlays and navigation.
  fill: 'rgba(255, 255, 255, 0.035)',
  fillStrong: 'rgba(255, 255, 255, 0.055)',
  stroke: 'rgba(255, 255, 255, 0.075)',
  strokeBright: 'rgba(255, 255, 255, 0.13)',
  borderWidth: 1,
  blur: 35,
  /** Inputs sit darker than the surface behind them. */
  inputFill: 'rgba(0, 0, 0, 0.25)',
} as const;

export const gradients = {
  /** "Super actions" — 135° primary → secondary. */
  brand: ['#7378EC', '#5C63D7'] as const,
  cta: ['#7378EC', '#5C63D7'] as const,
  /** Light lavender→pink, as on the Invite Friends button. */
  brandSoft: ['#A8AEF8', '#C3C6FF'] as const,
  cyan: ['#4F9FB5', '#357E94'] as const,
  /** Background mesh blobs. */
  meshViolet: ['rgba(99, 102, 241, 0.08)', 'rgba(99, 102, 241, 0)'] as const,
  meshPink: ['rgba(236, 72, 153, 0.05)', 'rgba(236, 72, 153, 0)'] as const,
  meshCyan: ['rgba(56, 189, 248, 0.04)', 'rgba(56, 189, 248, 0)'] as const,
  /** Top-light sheen across glass panels. */
  sheen: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] as const,
  glassPanel: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)'] as const,
  night: ['#151A21', '#0C1015'] as const,
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

/** A compact radius scale keeps cards and controls related without pill overload. */
export const radius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const HIT_TARGET = 44;
export const CONTAINER_MARGIN = 24;
/** Maximum navigation shelf height, including the bottom safe area. */
export const DOCK_HEIGHT = 0;

export const shadows = {
  /** A restrained lift for the rare surface that needs separation. */
  glow: {
    shadowColor: colors.primaryContainer,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  glowPink: {
    shadowColor: colors.secondaryDeep,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  glowCyan: {
    shadowColor: colors.tertiary,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /** Neo-brutalist hard offset — no blur, full opacity. */
  hard: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
