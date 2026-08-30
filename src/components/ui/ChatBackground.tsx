import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

const CHAT_DOODLE = require('../../../assets/ChatBG.png');

/**
 * The default chat wallpaper.
 *
 * What this replaces was one opaque PNG of doodles, identical in every group.
 * `ChatBG.png` is RGB with no alpha channel, so it painted over the ambient
 * layer underneath it completely: the group's theme colour only ever survived
 * as a thin glow band at the very top of the screen. Six groups with six
 * different identities all rendered the same flat grey slab, in the one place
 * people spend nearly all their time.
 *
 * Three things fix that, none of them a new asset:
 *
 * 1. The doodle drops to a texture weight instead of being the background.
 *    It was competing at full strength across the whole screen, which is what
 *    made it read as noise rather than as the brand pattern it actually is.
 * 2. The group's own two theme colours light the room, as two soft blooms.
 *    They sit off-centre and at different sizes on purpose: a symmetric pair
 *    centred behind the message list is the stock "mesh gradient" look, and it
 *    also fights the bubbles for the middle of the screen.
 * 3. A vertical fall-off lifts the top and settles the bottom, so the surface
 *    has somewhere for the eye to rest and the bubbles have something to sit
 *    against. A perfectly even field is what makes a screen feel flat.
 *
 * Everything here is static and `pointerEvents: none`, so a scrolling
 * transcript never repaints it.
 */
export function ChatBackground({
  /**
   * The active theme's gradient pair, passed in already resolved rather than
   * looked up from a key. The caller's theme is Tea-aware, so a live Tea
   * session recolours the room along with everything else.
   */
  colors,
}: {
  colors?: readonly [string, string] | null;
}) {
  /*
   * Falls back rather than destructuring blind. This is decoration behind a
   * conversation: if a caller ever hands it a theme that has not resolved yet,
   * the right outcome is a plain dark room, never an error boundary swallowing
   * the whole chat screen.
   */
  const [c1, c2] = colors ?? (['#6366F1', '#8B5CF6'] as const);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The room's own darkness, tinted a touch toward the group rather than
          the same neutral for everybody. */}
      <View style={[StyleSheet.absoluteFill, styles.base]} />

      {/*
        Two full-bleed diagonal washes rather than circular blooms.

        A rounded View with a gradient inside leaves a hard arc wherever the
        gradient is still slightly opaque when it reaches the circle's edge,
        and on a tall phone screen that arc reads as a smudge across the
        middle of the conversation. A full-bleed gradient has no boundary to
        show, so the falloff is the only edge there is.
      */}
      <LinearGradient
        colors={[withAlpha(c1, 0.34), withAlpha(c1, 0.10), 'transparent']}
        locations={[0, 0.3, 0.66]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.95, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[withAlpha(c2, 0.26), withAlpha(c2, 0.07), 'transparent']}
        locations={[0, 0.28, 0.6]}
        start={{ x: 1, y: 1 }}
        end={{ x: 0.15, y: 0.15 }}
        style={StyleSheet.absoluteFill}
      />

      {/* The doodle, now a texture over the colour rather than a lid on it. */}
      <Image
        source={CHAT_DOODLE}
        style={[StyleSheet.absoluteFill, styles.doodle]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />

      {/* Depth. Slightly lifted under the header, settling into the dark under
          the composer, which is also what stops light bubbles from floating. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.045)', 'transparent', 'rgba(0,0,0,0.5)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Corner fall-off, so the field does not end abruptly at the bezel. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'transparent', 'transparent', 'rgba(0,0,0,0.42)']}
        locations={[0, 0.22, 0.78, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Hex to rgba, so a theme colour can be used at atmospheric strength. */
function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#07070C' },

  /* Half weight. At full strength this pattern was the loudest thing on a
     screen whose job is to carry other people's messages. */
  doodle: { opacity: 0.5 },
});
