# Frame packet: 07-plans-faster

## Project inputs

- Project: /Users/harsh/Desktop/GC/videos/gc-universe
- Design tokens: /Users/harsh/Desktop/GC/videos/gc-universe/frame.md
- RULES_DIR: /Users/harsh/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 7 — Plans, Made Faster

- status: outline
- src: compositions/frames/07-plans-faster.html
- duration: 9s
- transition_in: cut
- scene: A chat request becomes an AI drafted poll, a live vote, a finalized plan, and an Explore invitation.
- voiceover: "From ‘what are we doing?’ to a plan—before the chat moves on."
- type: feature_showcase
- blueprint: panel-edit-live-sync
- asset_candidates: capture/assets/chat-background.png, capture/assets/gc-app-logo.png

Feature becomes benefit: less coordination, more time together.

Scene 1 (0.0–2.8s): A chat request appears in a compact composer panel, left third; the prompt types on.
Scene 2 (2.8–6.3s): An AI poll card expands live from the request, then options and vote bars sync with control-target-sync.
Scene 3 (6.3–9.0s): The winning choice morphs into a confirmed plan and Explore card, centered with a short held payoff.

## Selected blueprint: panel-edit-live-sync

# panel-edit-live-sync — Panel Edit, Live Sync

**intent**: A bipartite stage — an inspector/editor **panel bound to a target surface** — where a cursor (or text caret) continuously manipulates a control (value scrub, unit/codegen dropdown pick, knob or easing-handle drag, inline retype) and the coupled surface updates **live, in the same beat**: the page button rotates as the value scrubs, preview icons resize per keystroke, the hex readout mirrors every hover, the code block converts on the pick. The motion IS the causality — one gesture, two surfaces changing in the same frame. The camera's job is co-visibility of the couple, not a chase.

**provenance** (7 mined Key_Feature goldens across 4 products, both dialects — three sync modes):

- _Write-sync (control → target)_ — the anchor mode: a visual-editor panel scrubs rotation/margin/padding while the live page button rotates and shifts in the same beat (plus unit + font-weight dropdown picks); an inline `className` retype in a glowing code callout resizes the preview icons per keystroke (caret-as-actor, push-in/pull-back roundtrip that must keep BOTH surfaces in frame); a motion editor drags a knob along a dotted motion path and bends easing handles into an S-curve, paying off with a big zoom-out where the finished toggle PERFORMS the edited ease (deferred payoff).
- _Read-sync (target → panel mirror)_: clicking a page button pops a toolbar → "Copy code" → the code editor fills with the element's CSS under one continuous slow zoom-out; hovering palette swatches live-updates a footer hex readout while the grid scrolls.
- _Self-conversion (panel is both control and target)_: unit dropdown conversions inside a 3D-tilted spacing panel snap-convert values in place (rem→px→%, `0,375 rem` → `6 px` → `4,871 %`); a codegen dropdown picks SwiftUI and the CSS block crossfades into SwiftUI under a rapid punch-in.

> **Concentration caveat**: 4 of 7 members are one video (CSS Scan Pro 2.0). The COUPLING engine is independently attested by 3 more products across 3 more videos and both dialects (Figma Dev Mode, Figma motion editor, bolt.new), each on a different surface pair — page+inspector, canvas+timeline+easing panel, IDE code+app preview — so the shape is real, not one film's house style. What IS CSS-Scan-Pro house style (marked optional below): the dark-slate capability title-card prelude, the oversized black cursor with white outline, the green success-checkmark flip, flash tooltips. Trigger is product-conditional: reach for this shape when the feature itself is live editing/inspection.

**roles served**

- Key_Feature (from `panel-edit-live-sync`, all 7 cases): one capability demonstrated as 2–4 edit beats on a single bound element — each beat a continuous manipulation the coupled surface answers in real time, resolving on the last edit held, a zoom-out to the finished product performing the edit, or a callout landing on the result. Three sub-shapes fold in:
  - **(A) write-sync** — cursor/caret edits a control; the TARGET transforms live (rotate/shift/stretch/resize/re-animate).
  - **(B) read-sync** — cursor selects/hovers the target; the PANEL readout mirrors live (CSS streams in, hex footer updates).
  - **(C) self-conversion** — the edit transforms the panel's own readout (units snap-convert, CSS crossfades to SwiftUI).

**duration**: 5.3–11.9s (read-sync hover demos shortest ~5.3s; multi-beat scrub/edit runs 8.7–11.9s)

**shot structure** (a `[target surface — webpage / design canvas / IDE + live preview]` sharing the frame with a `[bound panel — floating inspector / docked code panel / timeline + easing editor]`; a `[cursor or caret]` is the actor; every beat pairs ONE manipulation gesture with a SIMULTANEOUS response on the coupled surface; selection chrome declares which element is bound; camera ranges locked → active but always preserves the couple)

- **Scene 0 (optional, 0.0–2.0s) — capability title card.** Solid dark `[slate/charcoal]` card; a single white line names the capability (`"Edit CSS visually"`, `"Auto measurement units conversion"`, `"Check color palettes"`) — fades/drifts in, holds, then a HARD CUT or a fast motion-blurred zoom-out that settles the stage. (CSS-Scan-Pro-house-leaning; 071/017/080 open cold on the stage, 071 instead springs a giant lowercase `[verb word]` over the preview.)

- **Scene 1 (~1–3s) — the couple establishes.** The `[target surface]` arrives with the `[bound panel]` docked, floating in subtle 3D tilt, or SLIDING IN from an edge. Selection chrome pops on to declare the binding: `[bounding box + corner handles / red dashed inspection guides / redline measurement chips popping sequentially / green class-name header]`. The cursor enters and glides to the first control.

- **Scene 2..N (~2s each) — edit beats, gesture + mirror in the same frame (the engine).** Each beat is ONE continuous manipulation and its live answer:
  - _Variant — write-sync (A)_: the cursor CLICK-AND-DRAGS a numeric field (value counts up/down: `0°→-10°`, `0→38 px`) while the target `[button/element]` rotates/shifts/stretches in real time; OR drags a `[knob along a dotted motion path / easing handle bending the curve, coords readout updating]`; OR a caret INLINE-RETYPES a value (`1xl→4xl→2xl`) inside a `[glowing magnifier callout]` while `[preview elements]` resize per keystroke. A flash `[tooltip]` may name the gesture.
  - _Variant — read-sync (B)_: the cursor CLICKS/HOVERS the target element — a `[floating toolbar]` springs up above it, a menu pick fires (`Copy code` → icon flips to a green checkmark) and the `[code editor]` fills with streaming CSS; or hovered `[swatches]` outline and the `[footer hex]` updates instantly per hover as the grid scrolls.
  - _Variant — self-conversion (C)_: the cursor clicks a unit/codegen `[dropdown]` — it opens with hover-highlighted rows + checkmark — and on the pick the readout SNAP-CONVERTS in place (`rem→px`, value recalculates) or the whole `[code block]` crossfades to the new language, heading flipping (`Layout`→`HStack`).
  - Camera per beat: LOCKED wide holding both surfaces; or a PUNCH-IN to the acting surface (panel scroll reveals the next section) — but during a write-sync edit both gesture and mirror stay co-visible (071's law: the push-in never crops the preview out).

- **Scene N (final beat → end) — the edit proves out, HOLD.** Resolution diverges:
  - _Variant — last edit held_: the final pick lands (`100 - Thin` selected, `4,871 %` applied) and the state simply HOLDS — never end on the tooltip with the dropdown unopened.
  - _Variant — payoff zoom-out_: a big zoom-out reveals the finished product PERFORMING the edited parameter — the toggle slides with the new ease inside the full phone mockup, confetti drifting; or the pull-back returns to the identical full framing while a `[terminal]` appends an hmr line.
  - _Variant — callout lands_: a large `[arrow callout]` slides in pointing at the result / the export menu rests open under the cursor; frame drifts subtly outward.

**signature move**: the **live-sync couple** — a scrubbed/typed/dragged control and its bound surface changing simultaneously, in-frame together, every edit beat.

**motion vocabulary**: click-and-drag value scrubbing with live target sync (rotate / shift / stretch); per-keystroke live preview resize; inline retype with backspace + blinking caret; instant value snap-conversion; live hex/readout mirror on hover; unit/codegen dropdown with hover-highlight rows + checkmark, instant open/close; font-weight/dropdown row pick; knob drag along a dotted motion path with waypoints; easing-handle drag bending the curve (coords readout updating); playhead scrub; redline measurement chips popping sequentially; bounding box + corner handles; red dashed inspection guides; floating toolbar springs up above the selected element; code panel slides in from an edge; in-panel scroll to a new section; swatch-grid scroll; syntax-highlighted code streams/pastes in; code crossfade (CSS→SwiftUI) with heading flip; glowing magnifier callout over a code token; icon flips to green success checkmark; flash tooltip naming the gesture; oversized black cursor with white outline; grab-cursor drag; dark title-card prelude + hard cut; fast motion-blurred zoom-out settle; ONE continuous slow zoom-out spanning a demo shot; eased push-in → hold → eased pull-back roundtrip; quick punch-in to panel/timeline/code; subtle 3D tilt drift/parallax on a floating panel; big zoom-out to the product payoff; result element re-animates with the edited ease; confetti drift; terminal log append; large arrow callout slide-in; static hold.

**rule mapping**

- cursor glide to a control, presses, click feedback → `cursor-click-ripple`
- cursor state flips pointer↔grab over a scrubbable field / draggable handle → `context-sensitive-cursor`
- scrubbed numeric readout counts up/down under the drag → `counting-dynamic-scale`
- **the live-sync couple itself** (control gesture drives a second element's property in the same beat) → `control-target-sync` (concurrent tweens at the SAME timeline position — readout tween + target transform tween sharing one label)
- inline retype with backspace, typos, holds / keystroke thresholds → `discrete-text-sequence` (+ `context-sensitive-cursor` for the caret blink)
- per-keystroke preview resize → `discrete-text-sequence` (keystroke state thresholds) + `control-target-sync` (the coupled scale steps)
- instant value snap-conversion / hex readout swap / heading flip (`Layout`→`HStack`) / status text → `discrete-text-sequence`
- syntax-highlighted code streaming/pasting in, terminal log append → `discrete-text-sequence` (bulk additions are explicitly in-scope)
- dropdown/menu pops open; floating toolbar springs up; tooltip flash; redline chips pop sequentially (staggered, ≤500ms) → `spring-pop-entrance`
- dropdown row hover-highlight stepping and pick sequencing / which edit beat shows what → `dynamic-content-sequencing`
- dashed inspection guides / selection outline draw on → `svg-path-draw`; dotted motion path with waypoints → `svg-path-draw` (the path display)
- knob TRAVEL along the motion path → path following — see `hyperframes-keyframes` (paths)
- easing-handle drag bending the curve (SVG `d` interpolation) → SVG path morph — see `hyperframes-keyframes` (morph; `svg-path-draw` only draws strokes, it cannot morph a path); coords readout beside it → `discrete-text-sequence`
- glowing magnifier callout over a code token (incl. the live enlarged duplicate of a UI token) → composition: `ambient-glow-bloom` (the glow) + `spring-pop-entrance` (the callout pop)
- code panel slides in from an edge / panel docks → `card-morph-anchor` / `scale-swap-transition` (per cursor-ui-demo precedent for panel slide-in)
- code block crossfade CSS→SwiftUI; success-icon flip to green checkmark → `scale-swap-transition` (state swap at the same anchor)
- in-panel scroll / swatch-grid scroll (masked internal translate) → `gsap-effects`; on a 3D-tilted panel → `3d-page-scroll` (tilted plane w/ internal scroll)
- subtle 3D tilt drift/parallax on the floating panel; continuous micro-drift on holds → `multi-phase-camera` (micro-drift phase)
- punch-in to panel/timeline/code and settle → `coordinate-target-zoom` + `multi-phase-camera`
- eased push-in → hold → eased pull-back roundtrip (co-visibility preserved) → `multi-phase-camera` (pull-back / focus / push sequencing)
- ONE continuous slow zoom-out spanning the demo shot; big zoom-out to the product payoff → `viewport-change` (single `.world` composite transform)
- fast motion-blurred zoom-out settle transition → `motion-blur-streak` + `viewport-change`
- result element re-animates with the edited ease (toggle slides with the new S-curve) → `gsap-effects` (custom-ease tween on the payoff element)
- confetti drift on the payoff → `particle-burst` (deterministic confetti) + `sine-wave-loop` (bounded drift)
- large arrow callout slide-in + hold → `gsap-effects` (single slide tween)
- dark title-card prelude (capability line fades/drifts in, hard cut out) → cross-blueprint: `titlecard-reveal` territory; the drift/fade itself → `gsap-effects` — EXIT-N/A as a mapped rule here
- hard cuts between title and demo; final static hold → EXIT-N/A (transition registry / no rule needed)

**camera modifier**: The camera law is the INVERSE of cursor-ui-demo's chase: it serves **co-visibility of the couple**. Three attested postures — (1) LOCKED: fixed framing for the whole demo, panel + target both in frame, all motion element-level (CSS_39.0, CSS_102.8 after settle); (2) ONE CONTINUOUS MOVE: a single slow zoom-out (or drift) spanning the entire demo shot while edits fire inside it (CSS_10.9, CSS_63.5's tilt-drift) → `viewport-change`; (3) PUNCH-AND-RETURN: eased push-in onto the acting surface, tight hold through the edit, eased pull-back to the identical opening framing (071_bolt, 080_figma, 017_figma) → `multi-phase-camera` + `coordinate-target-zoom` — with the hard constraint that during a write-sync edit the mirror surface is never cropped out. If the camera is chasing the cursor target-to-target with per-beat state swaps, you're in `cursor-ui-demo`, not here.

## Selected motion rule: control-target-sync

---
name: control-target-sync
description: The live-sync couple — a scrubbed/typed/picked control drives a second element's property in the SAME beat. Readout tween + target transform tween share one timeline label (continuous scrub), or one threshold state array carries both sides (discrete steps). Makes "change this, watch it change" read as causality.
metadata:
  tags: control, scrub, live-sync, mirror, panel, editor, couple, readout, ui
---

# Control-Target Sync

THE live-editing move: an inspector/editor control is manipulated — a value scrubbed, a field retyped, a dropdown picked — and a **bound second element answers in the same frame**. The button rotates WHILE the rotation value scrubs; icons resize PER KEYSTROKE. The persuasion is causality — one gesture, two surfaces changing together — and this rule is the coupling contract that produces it.

Nearest precedent is [reactive-displacement.md](reactive-displacement.md): that rule also derives two elements' motion from one source, but it is **collision physics** — an entering intruder displaces an exiting victim, once, as a transition, and the victim leaves. This rule is a **live editing mirror**: the control is manipulated repeatedly across several beats, the target answers every time, and both sides hold the stage throughout. The numeric readout rides [counting-dynamic-scale.md](counting-dynamic-scale.md)'s proxy pattern; discrete steps ride [discrete-text-sequence.md](discrete-text-sequence.md)'s threshold pattern — what this rule adds is the law that binds either of them to the target.

## How It Works

An **edit beat** is a set of concurrent tweens at ONE timeline label: `tl.addLabel("edit1", …)`, then the **readout tween** (numeric proxy + `onUpdate` writing `textContent` only) and the **target transform tween** (`rotation` / `x` / `y` / `scale` to the same endpoint), both placed at the label with the same **duration** and **ease**. The two motions are two projections of one gesture — value at 40% ⇒ target at 40%, on every frame, under any seek. That mathematical lockstep reads as "the panel is editing the page," not "two animations happen to overlap."

For **discrete edits** (per-keystroke retypes, dropdown picks, unit snaps) the couple steps instead of glides: a single threshold state array carries BOTH sides — each state holds the readout text AND the target's property value — and one driver applies whichever state is active. Both sides read from the same state object, so they cannot desync.

Chain 2–4 edit beats with short holds between, and end on a **landed** edit — the last value applied and holding, never a tooltip with the dropdown unopened.

## Recipe

```html
<!-- Bipartite by construction: target surface + inspector panel share the frame.
     Every scrubbed readout gets `font-variant-numeric: tabular-nums` and a fixed
     min-width (≥ the longest value) or the panel edge jitters as digits change. -->
<div class="target-surface">
  <div class="target-button" id="target-button">{buttonLabel}</div>
  <div class="preview-row">
    <div class="preview-icon">{iconA}</div>
    …
  </div>
</div>
<div class="panel">
  <div class="field-row">
    <span>Rotation</span><span class="field-value" id="rotation-readout">0°</span>
  </div>
  <div class="field-row">
    <span>Class</span><span class="field-value mono" id="class-readout">text-1xl</span>
  </div>
</div>
```

```js
// ---- Continuous couple: ONE label; both tweens share duration AND ease ----
tl.addLabel("edit1", EDIT1_AT);
const rotState = { v: 0 };
const rotReadout = document.getElementById("rotation-readout");
tl.to(
  rotState,
  {
    v: ROT_TARGET,
    duration: SCRUB_DUR,
    ease: SCRUB_EASE,
    onUpdate: () => {
      rotReadout.textContent = `${Math.round(rotState.v)}°`;
    },
  },
  "edit1",
);
tl.to(
  "#target-button",
  { rotation: ROT_TARGET, duration: SCRUB_DUR, ease: SCRUB_EASE },
  "edit1", // same label — the mirror answers in the same frame
);

// ---- Discrete couple: ONE state array carries BOTH sides ----
const STEPS = [
  { t: 0.0, text: "text-1xl", scale: 1.0 }, // must equal the initial state
  { t: 0.4, text: "text-4xl", scale: 1.9 },
  { t: 1.0, text: "text-xl", scale: 0.85 }, // backspace
  { t: 1.35, text: "text-2xl", scale: 1.3 }, // lands
];
const stepAt = (time) => [...STEPS].reverse().find((s) => time >= s.t) ?? STEPS[0];

tl.addLabel("edit3", EDIT3_AT);
const classReadout = document.getElementById("class-readout");
const stepDriver = { t: 0 };
let lastStep = null;
tl.to(
  stepDriver,
  {
    t: STEPS_TOTAL,
    duration: STEPS_TOTAL,
    ease: "none",
    onUpdate: () => {
      const s = stepAt(stepDriver.t);
      if (s !== lastStep) {
        classReadout.textContent = s.text; // control steps
        gsap.set(".preview-icon", { scale: s.scale }); // target steps — same state object
        lastStep = s;
      }
    },
  },
  "edit3",
);
```

## Variations

- **Dropdown pick → instant conversion (self-conversion)** — the pick converts the panel's own readout in place (`tl.set("#padding-readout", { textContent: "6 px" }, "pick")`); control and target collapse into one element. Compose the dropdown from neighbors: menu pops via [spring-pop-entrance.md](spring-pop-entrance.md), row hover-stepping via [dynamic-content-sequencing.md](dynamic-content-sequencing.md). The conversion must be an INSTANT snap — tweening between unit strings reads as broken, and instantness is the feature being sold.
- **Easing-handle drag → target re-animates (deferred mirror)** — the edit authors a _behavior_, so the mirror is a **replay**, not a concurrent transform: beat 1 drags the handle (handle tween + coords readout), then at a later label the target performs its motion with the newly-authored curve (`tl.fromTo("#toggle-knob", { x: 0 }, { x: KNOB_TRAVEL, duration: REPLAY_DUR, ease: AUTHORED_EASE }, "replay")`), often under a zoom-out ([viewport-change.md](viewport-change.md)). The one sanctioned case where the response is not in the gesture's beat; the replay must still be unmistakably the edited parameter.
- **Read-sync mirror (reverse direction)** — the gesture happens ON the target (hovering swatches, selecting an element) and the PANEL readout is the bound side. Same discrete contract — one state array of `{ t, hoverTarget, readout }` drives both the highlight and the text.
- **Color couple** — the readout counts (`0 → 80`) while the target's `backgroundColor` tweens between two palette stops at the same label. Keep it two fixed stops (GSAP interpolates); never derive per-frame hex strings by hand.

## Values

| token                | range                           | notes                                                                                                                                 |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| SCRUB_DUR            | 0.8–1.6 s                       | the viewer must see BOTH sides move — under ~0.6 s the mirror registers subconsciously at best                                        |
| SCRUB_EASE           | `power1.inOut` / `power2.inOut` | shared verbatim by both tweens. Never `back.out` / `elastic.out` — an overshooting value reads as a broken hinge; the readout is data |
| edit endpoints       | visible but plausible           | −10° tilt, 38 px shift, 1xl → 4xl → 2xl; a 2° rotation doesn't demo anything                                                          |
| HOLD_BETWEEN         | 0.3–0.8 s                       | each landed value gets a breath; below 0.3 s the beats smear into one gesture                                                         |
| BEAT_COUNT           | 2–4                             | one edit is a moment, not a demo; past 4 the shot reads as a settings tour                                                            |
| STEP gaps (discrete) | 0.15–0.5 s                      | keystroke pacing per discrete-text-sequence; first state must equal the on-load state                                                 |
| VALUE_MIN_WIDTH      | ≥ longest value's width         | without it the panel edge jitters as digit counts change                                                                              |

## Critical Constraints

- **One label, one gesture** — readout tween and target tween share position, duration, AND ease; never sequence readout-then-target, and never stagger the target behind the readout even by 0.1 s — a delayed response reads as an animation following an edit, not a bound surface. A mismatched ease desyncs the mirror mid-tween even when endpoints agree.
- **Discrete steps share one state object** — both sides read the same array entry, so desync is impossible by construction; first entry mirrors the initial DOM state.
- **The readout is data** — no overshoot, no bounce on the settle; the target may carry the gesture's ease but lands exactly on the edited value.
- **Co-visibility is load-bearing** — control and target share the frame for every edit beat; a camera move must never crop the mirror out (punch-and-return around the beats, not through them).
- **`tabular-nums` + fixed `min-width`** on every scrubbed readout; `onUpdate` is O(1) — text writes only, discrete drivers guard writes with a last-state check.
- **End on a landed edit** — the final beat resolves with the value applied and holding (or the deferred-mirror replay); never mid-gesture or on an unopened menu.
- **The gesture's actor is a separate rule** — cursor glide, grab-cursor flip, and click feedback come from the cursor rules; this rule owns only the couple.

## See also

`cursor-click-ripple` / `context-sensitive-cursor` (the hand performing the gesture) · `counting-dynamic-scale` (the readout half alone, when there is no bound target) · `discrete-text-sequence` (retypes inside the control field) · `spring-pop-entrance` (dropdowns/chrome around the couple) · `multi-phase-camera` (punch-and-return framing) · `chart-scrub-readout` (the sibling READ direction — a scrub interrogates a chart instead of editing a target).
