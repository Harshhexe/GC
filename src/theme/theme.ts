/**
 * GC design tokens — "Vibrant Neo-Glass".
 *
 * Neo-Brutalism (heavy type, thick strokes, hard offset shadows) layered over
 * Glassmorphism (translucent panels on vibrant mesh gradients). Values come
 * from the design system spec; see stitch_gc_gen_z_social_platform/DESIGN.md.
 */

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
  appRoot: '#07060B',
  appChrome: '#030206',

  // Surface ramp, lowest → highest elevation
  bg: '#0A0A0F',
  surfaceLowest: '#050508',
  surfaceLow: '#0F0F17',
  surface: '#151522',
  surfaceHigh: '#1C1C2C',
  surfaceHighest: '#242438',

  /**
   * The neutral ramp is *slate* (cool, blue-tinted), not neutral gray.
   *
   * This was the app's single biggest palette inconsistency: these tokens used
   * to hold the gray family (#9CA3AF, #6B7280, #374151) while the screens
   * themselves overwhelmingly hardcoded the slate family (#94A3B8 alone
   * appeared 46 times against 4 uses of the gray token literal). Two neutral
   * families were being used for the same roles, which is what made muted text
   * look subtly different from screen to screen.
   *
   * Slate is the side worth keeping: the brand accent is indigo, and a cool
   * neutral is what harmonises with a cool accent. Every value below was
   * contrast-checked against all six app surfaces before the swap — the muted
   * text token actually gained contrast in the move (4.84:1 to 5.20:1).
   */
  onSurface: '#F1F5F9',
  onSurfaceVariant: '#94A3B8',
  /**
   * Muted body text that still clears WCAG AA (4.5:1) on every surface in the
   * app. `outline` is dimmer and reads as the natural choice for de-emphasised
   * copy, but it measures ~3.2:1 against the card fills these screens use —
   * the gray-on-gray trap. Reach for this for secondary *text*; keep `outline`
   * for borders, dividers and disabled states, where the rule doesn't apply.
   */
  textMuted: '#8B98AD',
  outline: '#64748B',
  outlineVariant: '#334155',

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
  // These name the same roles as onSurface/onSurfaceVariant/outline above, so
  // they carry the same slate values — an alias that resolved to the old gray
  // family would quietly reintroduce the exact two-palette split the ramp
  // above exists to remove.
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textFaint: '#64748B',
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

/** The frosted glass recipe — clean blurred opacity look. */
export const glass = {
  fill: 'rgba(255, 255, 255, 0.04)',
  fillStrong: 'rgba(255, 255, 255, 0.07)',
  stroke: 'rgba(255, 255, 255, 0.08)',
  strokeBright: 'rgba(255, 255, 255, 0.14)',
  borderWidth: 1,
  blur: 35,
  /** Inputs sit darker than the surface behind them. */
  inputFill: 'rgba(0, 0, 0, 0.25)',
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
