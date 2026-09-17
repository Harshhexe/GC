# Frame packet: 06-group-dna

## Project inputs

- Project: /Users/harsh/Desktop/GC/videos/gc-universe
- Design tokens: /Users/harsh/Desktop/GC/videos/gc-universe/frame.md
- RULES_DIR: /Users/harsh/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 6 — The Group Has a Personality

- status: outline
- src: compositions/frames/06-group-dna.html
- duration: 9s
- transition_in: cut
- scene: Group DNA traits, daily names, Tea Report, and Weekly Awards pulse out of one glowing social core.
- voiceover: "The chaos has a personality. GC AI knows it by heart."
- type: feature_showcase
- blueprint: constellation-hub
- asset_candidates: capture/assets/gc-logo.png, capture/assets/group-list-background.png

This is the emotional AI payoff: GC understands the group as a group.

Scene 1 (0.0–3.0s): A purple DNA core draws itself at center with SVG self-draw; trait labels orbit in a sparse dark field.
Scene 2 (3.0–6.4s): Daily names, Tea Report, and Weekly Awards become three distinct panels from the same center, using depth-scatter-assemble.
Scene 3 (6.4–9.0s): The panels resolve into one archetype lockup; amber award light and cyan trait lines remain sharp while the background dims.

## Selected blueprint: constellation-hub

# constellation-hub — Constellation / Hub + Satellites

**intent**: Labeled/iconned nodes spring into a ring/cluster around a center, then the shot resolves on the core — either by pushing the camera INTO the center (depth-of-field collapsing onto it) or by holding a hub mark while the satellites ORBIT it; the "everything connects to / sits around one center" beat.

**roles served**

- Hook (from `hook-cluster-push-in`): a constellation of tool/app nodes springs into a wide ring, then a sustained camera push-in with depth-of-field resolves on the inner core — "it connects everything / one hub for all your tools."
- Social_Proof (from `social-proof-orbit-ecosystem`): the product brand mark lands as the center hub and partner logos spring onto a ring and revolve around it — "plugs into / sits at the center of your stack."
- CTA (from `cta-orbit-collapse`): the ring resolves by COLLAPSE rather than a push-in — category icons drift around an empty central CTA, a cursor click implodes the orbit toward the click point, and the product demo springs OUT of that collapse as the answer (scope → choice → consequence → product).
- Social_Proof (from `proof-logo-chain`): a persistent center logo accrues proofs — its wordmark decodes, a claim ticker swaps, the logo glides to center, then avatars cascade into orbit with drawn connectors while partner logos scroll the bottom strip; four claims read as one statement.
- Social_Proof (from `scatter-drift-finisher`): the ecosystem beat as a
  static END CARD — a two-line serif `[headline]` is the center (no hub mark, no ring), `[~20 app
icons]` pop in scattered frame-wide in a quick stagger, then keep drifting very slowly OUTWARD
  to the end. "Connects to thousands of apps" said with count and spread, not geometry.

**duration**: 5–8s (Hook 5–6s · Social_Proof 5–8s · CTA orbit-collapse ~6s · Social_Proof
scatter-drift end card ~2.5s as a closing beat)

**shot structure**

Consolidated template — nodes ring a center, then one of two finishers resolves on the core.

- Scene 1 (0.0–~1.5s): `[bg]` (dark/space field, optionally slow-drifting diffused gradient blobs). `[primary nodes]` (circles carrying `[icon]` + label) SPRING-POP in (scale 0→1, ~1.15 elastic overshoot, staggered) arranged in a wide ring/cluster around an empty or marked center `[hub]`.
- Scene 2 (~0.7–2.5s, overlapping): smaller `[secondary nodes]` (platform / partner-logo chips) pop in staggered with the same elastic spring, filling the gaps; optional thin `[accent]` connector lines / orbit ring draw from hub→nodes. Camera holds.
- Scene 3 (~2.5–Xs, the resolve): see finisher variant below; lands and HOLDS on the magnified / orbited center to the end.

- Variant — Hook (push-in finisher): from Scene 3, a continuous smooth CAMERA PUSH-IN toward the center inner cluster — inner nodes scale up and stay sharp while outer nodes are pushed toward the edges and progressively BLUR (depth-of-field), background scales up smoothly; holds magnified on the core.
- Variant — Social_Proof (orbit finisher): the center `[brand mark]` snaps in via a quick 3D rotate that decelerates and settles; a thin `[accent]` orbit ring draws around it; `[N partner badges]` spring onto the ring (staggered overshoot) and revolve CLOCKWISE while staying upright, under a continuous slow camera ZOOM-OUT (ecosystem reveal).
- Variant — Social_Proof (optional type-push-through opener, prepended before Scene 1): centered `[headline]` types/slides in with a huge transparent-fill OUTLINE copy of the same words behind it; the outline text scales up exponentially toward camera (high-speed dolly / push-through), breaches the frame, then HARD-CUTS to the hub bg of Scene 1.
- Variant — Social_Proof (scatter-drift finisher, no ring): the center is a two-line serif
  `[headline]` building in place (not a mark); `[~20 app icons]` pop in SCATTERED across the whole
  frame in a quick stagger — no ring geometry, no connectors — then sustain a very slow outward
  drift to the end. Camera fully static: no push-in, no zoom-out; the "everything around one
  center" reads from the drift vectors pointing away from the headline. Often chained as the end
  card of a preceding UI beat (the prior card dissolves into it).

**motion vocabulary**: staggered elastic spring-pop node entrances (~1.15 overshoot); slow gradient-blob drift; connector-line / orbit-ring draw-on; 3D snap-rotate-settle on the hub mark; continuous camera push-in (inner sharp, outer depth-of-field blur, bg scale-up); clockwise orbital revolve of upright badges; continuous slow camera zoom-out (ecosystem reveal); optional outline-text push-through dolly entry. Scatter-drift finisher: frame-wide scattered icon pop-in (staggered, no ring); sustained slow
outward icon drift; in-place two-line serif headline build; static-frame hold to the end.

**rule mapping** (motion verb → `rules/<id>.md`)

- staggered spring-pop node entrances → `spring-pop-entrance` (elastic overshoot) + `gsap-effects` (stagger recipe); 3D-flip-in flavor → `orbit-3d-entry`
- ring / cluster layout of nodes around a center → `avatar-cloud-network` (nodes on an elliptical ring + SVG lines to a center)
- icons on the nodes → `svg-icon-enrichment`
- connector lines hub→node → `svg-path-draw`
- orbit-ring draw-on → `svg-path-draw`
- slow gradient-blob drift → `sine-wave-loop` (idle looped drift)
- 3D snap-rotate-settle on hub mark → `orbit-3d-entry` (3D-flip entry); technique CSS-3D
- clockwise orbital revolve of upright badges → `orbit-3d-entry` (continuous elliptical orbit); technique MotionPath
- camera push-in toward center → `multi-phase-camera` (PUSH-in) + `coordinate-target-zoom` (target the core)
- background scale-up during push-in → `multi-phase-camera`
- continuous slow zoom-out (ecosystem reveal) → `multi-phase-camera` (pull-back) / `coordinate-target-zoom`
- outline-text push-through dolly opener (Social_Proof) → `3d-text-depth-layers` (outline copy behind) + `multi-phase-camera` (push-through)
- depth-of-field blur on outer nodes during push-in → `depth-of-field-blur` (progressive DOF/focus-falloff blur on the off-center outer nodes while the inner core stays sharp)
- frame-wide scattered icon pop-in (no ring) → `spring-pop-entrance` (staggered group) +
  `gsap-effects` (stagger recipe); positions pre-baked scattered — NOT `avatar-cloud-network`'s
  elliptical ring
- sustained slow outward icon drift → `center-outward-expansion` (outward vectors, slow sustained
  register — drift targets sit slightly past the pop-in positions)
- in-place serif headline build → `gsap-effects` (staggered line/word reveal)

**camera modifier**: push-in-with-DOF (Hook) — `multi-phase-camera` PUSH-in targeted via `coordinate-target-zoom` onto the core; the focus-falloff blur half of it is backed by `depth-of-field-blur`. Orbit finisher (Social_Proof) — slow continuous zoom-out via `multi-phase-camera` (pull-back) while satellites revolve. Scatter-drift finisher (Social_Proof end card) — none: the frame never moves; the outward drift
is element-level.

## Selected motion rule: depth-scatter-assemble

---
name: depth-scatter-assemble
description: N elements scatter into / reassemble from a rotating 3D depth-cloud, each starting at a deterministic index-derived 3D offset and settling to a clean flat layout.
metadata:
  tags: 3d, scatter, assemble, depth, cloud, tumble, kinetic, letter, fragment, logo, reassemble
---

# Depth Scatter ↔ Assemble

N elements (glyphs, cards, logo fragments) fly in from a rotating 3D depth-cloud and lock into a flat layout — or the reverse. Each element has its OWN index-derived point in the cloud (translateZ depth + rotateX/Y tumble + x/y scatter). Distinct from `orbit-3d-entry` (flip-in then continuous orbit) and `center-outward-expansion` (flat burst from one shared center): here the resolve is a flat assembled layout.

## How It Works

Each element's flat target lives in `data-target-x/y`; its scattered state is pure trig on its index — golden-angle spread, stepped depth — so the cloud is byte-identical every render with no `Math.random`:

```js
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~2.39943 rad — even spread, no clumping
const a = i * GOLDEN;
const scatterX = Math.cos(a) * RADIUS;
const scatterY = Math.sin(a) * RADIUS;
const scatterZ = Z_NEAR - (i / (n - 1)) * (Z_NEAR - Z_FAR); // stepped depth
const rotX = Math.sin(a) * TUMBLE;
const rotY = Math.cos(a) * TUMBLE;
```

Elements are PARKED at their scatter points (`gsap.set`, opacity 0) before any tween, then each tweens to its flat target while the whole stage slowly rotates so the scatter has life before it locks. Requires `perspective` on the scene root and `preserve-3d` on the stage AND each element, or depth + tumble flatten to a 2D scale.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="cloud-stage">
  <div class="frag" data-target-x="-260" data-target-y="0">{glyph1}</div>
  <div class="frag" data-target-x="-130" data-target-y="0">{glyph2}</div>
  <!-- … one .frag per glyph / fragment … -->
</div>
```

```css
.scene-root {
  display: grid;
  place-items: center;
  perspective: 1400px; /* REQUIRED */
}
.cloud-stage {
  position: relative;
  display: grid;
  place-items: center;
  transform-style: preserve-3d;
  will-change: transform;
}
.frag {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden; /* hides the mirrored face mid-tumble */
  will-change: transform, opacity;
}
```

```js
const frags = Array.from(document.querySelectorAll(".frag"));
const n = frags.length;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// 1) Park every fragment in the cloud BEFORE any tween fires
const scatter = frags.map((el, i) => {
  const a = i * GOLDEN;
  const depthT = n > 1 ? i / (n - 1) : 0;
  return {
    x: Math.cos(a) * RADIUS,
    y: Math.sin(a) * RADIUS,
    z: Z_NEAR - depthT * (Z_NEAR - Z_FAR),
    rotationX: Math.sin(a) * TUMBLE,
    rotationY: Math.cos(a) * TUMBLE,
  };
});
frags.forEach((el, i) => gsap.set(el, { xPercent: -50, yPercent: -50, ...scatter[i], opacity: 0 }));

// 2) The cloud rotates so the scatter has life during assembly
tl.to(
  ".cloud-stage",
  { rotationY: CLOUD_SPIN_DEG, duration: CLOUD_SPIN_DUR, ease: "power1.out" },
  0,
);

// 3) ASSEMBLE — cloud point → flat target, index stagger = cloud collapsing inward
frags.forEach((el, i) => {
  tl.to(
    el,
    {
      x: Number(el.dataset.targetX),
      y: Number(el.dataset.targetY),
      z: 0,
      rotationX: 0,
      rotationY: 0,
      opacity: 1,
      duration: ASSEMBLE_DUR,
      ease: ASSEMBLE_EASE,
    },
    i * STAGGER,
  );
});
```

## Variations

- **Tumble-swap** (the beat-change hand-off): two glyph sets share the cloud; ONE shared 0→1 progress tween drives both in its `onUpdate` — outgoing lerps layout→cloud with `opacity: 1−p`, incoming lerps cloud→layout with `opacity: p`. Two separate tweens drift out of phase under seek and the cross stops reading as one hand-off. Inject per-glyph spans per phrase at setup (measure advance widths after `document.fonts.ready` — single-scene only).
- **Radial letter-explode → resolve**: flat-plane special case — `Z_NEAR = Z_FAR = 0`, small `TUMBLE`; reverse the assemble for the explode. Pure in-plane.
- **Scatter-OUT**: reverse assemble (layout → cloud, opacity 1→0) ONLY as the composition's final beat — mid-shot it reads as the shot ending.
- **Parallax lockup**: back layers get deeper `|Z_FAR|` + longer `ASSEMBLE_DUR`, foreground shallower/shorter — depth-speeded slide-in that locks into the logo.

## Values

| token                  | range                 | notes                                                                         |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------- |
| n                      | 4–14 (fragments 4–9)  | above ~14 individual paths stop reading                                       |
| RADIUS                 | 250–700px             | keep the farthest scatter in frame or fragments pop in with no travel         |
| Z_NEAR / Z_FAR         | +150…+450 / −150…−500 | large `\|z\|` needs a wider `perspective` or fragments smear                  |
| TUMBLE                 | 40–110°               | past 90° glyphs show blank mid-tween (intended); cap ~80° for one-faced cards |
| ASSEMBLE_DUR           | 0.7–1.4s              |                                                                               |
| ASSEMBLE_EASE          | `power3.out` default  | `expo.out` snaps, `back.out(1.4)` seats with overshoot; never `in`            |
| STAGGER                | 0.03–0.09s            | `n × STAGGER < ASSEMBLE_DUR` — one collapsing motion, not a queue             |
| CLOUD_SPIN_DEG / \_DUR | 15–60° over ≥ dur     | gentle life; too fast competes with the assembly                              |
| SWAP_DUR               | 0.5–1.0s              | on the beat boundary; shorter = hard cross                                    |

## Critical Constraints

- **Every scattered value is index-derived** — `cos/sin(i × GOLDEN)` + stepped `z`. The golden angle spreads points evenly with no clumps and no `Math.random`.
- **`gsap.set` the cloud BEFORE adding tweens** — skipping it leaves frame 0 showing the assembled layout, then a teleport when the first tween starts.
- **`perspective` + `preserve-3d` on stage AND each fragment** — missing any one flattens the depth.
- **Resolve flat** — settled state is `z: 0`, rotations 0; a still-tilted resolve reads unfinished.
- **Tumble-swap: one shared progress for both glyph sets.**
- **Depth ordering is automatic** inside `preserve-3d` (paint order follows actual Z) — no manual z-index, unlike the orbit case's capped band.

## See also

`orbit-3d-entry` (settles into a continuous orbit instead) · `hacker-flip-3d` (glyphs decode on arrival) · `3d-text-depth-layers` (extrude the locked wordmark) · `center-outward-expansion` (flat 2D cousin) · `sine-wave-loop` (idle breathe on the resolved layout).
