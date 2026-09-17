# Frame packet: 05-never-miss

## Project inputs

- Project: /Users/harsh/Desktop/GC/videos/gc-universe
- Design tokens: /Users/harsh/Desktop/GC/videos/gc-universe/frame.md
- RULES_DIR: /Users/harsh/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 5 — Never Miss the Plot

- status: outline
- src: compositions/frames/05-never-miss.html
- duration: 10s
- transition_in: wipe
- scene: A fast message storm collapses into What Did I Miss, Daily Wrapped, search, pins, and shared AI recap cards.
- voiceover: "Leave for a day. Come back to the whole story."
- type: benefit_highlight
- blueprint: transcript-scroll-artifact-reveal
- asset_candidates: capture/assets/chat-background.png, capture/assets/group-list-background.png

AI turns the noise of an active group into the context a member needs.

Scene 1 (0.0–3.0s): A vertical message storm scrolls through a full-width strip, dense and deliberately overwhelming.
Scene 2 (3.0–7.0s): What Did I Miss, Daily Wrapped, pins, and search cards peel out in sequence as the storm collapses via scale-swap-transition.
Scene 3 (7.0–10.0s): One clean recap card owns center stage with the other utilities in a quiet orbit; hold the read.

## Selected blueprint: transcript-scroll-artifact-reveal

# transcript-scroll-artifact-reveal — Transcript-Scroll Artifact Reveal

**intent**: The frame travels vertically along ONE long content surface — an agent transcript, a running task feed, an analysis document, a story draft — rendered full-bleed on a flat canvas (no device frame, no held mockup), by camera pan or element scroll; the traversal itself is the story ("look how much work happened / how much is here"), until ONE focal interaction — a file-chip click, a quote highlight, a collapsible-row expand — pivots the shot into an artifact/detail reveal: the deliverable behind the work.

**roles served**

- Key_Feature (modes: `pan-to-workspace` · `feed-rush` · `document-to-artifact` · `selection-pivot`): the x-viral AI-product grammar for "the agent did a lot of work → here's the deliverable." The long surface is the EVIDENCE (tool pills, checked progress items, task rows, headings, comps tables, story paragraphs), read at traversal pace; the artifact is the PAYOFF (full workspace with live mockup, spreadsheet with highlighted cells, inline ask-panel, sub-task stack). Reach for it when the feature's proof is the volume/depth of generated work and the beat should cash that in on one interaction — not a held device tour (`device-surface-showcase`), not a cursor-chased workflow (`cursor-ui-demo`).

**duration**: 5–11.8s (feed-rush 5.4s · pan-to-workspace 5.0s · selection-pivot 9.3s · document-to-artifact 11.75s)

**shot structure** One `[long content surface: agent chat transcript / task feed / analysis document / story doc]` sits full-bleed on a `[flat light canvas]` (goldens: warm off-white / cream / beige / plain white — the surface's own background IS the scene background); dark text with small `[accent]` marks (green verb highlights, model-tag pills, check circles, yellow cells). Three acts: TRAVERSE → HINGE → ARTIFACT. Camera discipline is the signature: at most TWO real camera moves in the whole shot, bracketing the hinge; everything else is element motion on a static frame.

- **Scene 1 (0.0–~40–60% of runtime) — establish + vertical traversal (the evidence).** The surface establishes with one small opener — a `[title]` types on / a centered `[title]` shrinks ~50% and glides to the top-left to dock as a fixed header / the frame opens tight on the `[chat panel]` — then the traversal begins: the frame travels DOWN the content (or the content streams UP through the frame), revealing progressive work in reading order: `[prompt → tool pills → checked progress items → typed summary]`, `[tagged task rows → muted tasks → checklist block]`, `[heading → paragraph → comps table → bullets]`, `[title → story paragraphs → dialogue]`. New rows may cascade in (staggered arrival) before the scroll takes over; a typed line may finish under the moving frame. Traversal texture varies by member: one continuous slow pan, a fast continuous feed rush, stepped scrolls decelerating at each stop (speed-blur between stops, content fading at frame edges), or one smooth scroll easing to a stop.
- **Scene 2 (~1–2s) — the hinge: ONE focal interaction.** The traversal settles and a single interaction pivots the shot: a `[file-attachment chip]` spring-pops in below a typed handoff line and a cursor glides in and CLICKS it; a `[sentence/quote]` gets a selection-highlight sweep and a `[tooltip pill]` spring-pops above it for the click; a `[collapsible row]` reaches the frame center and EXPANDS; or the typed `[verifier summary]` completes as the implicit trigger. This is the only interaction in the shot — the cursor (if any) appears here for the first time.
- **Scene 3 (rest) — artifact reveal + hold.** The hinge cashes in, choosing ONE reveal mechanic: a fast smoothly-DECELERATING zoom-OUT re-frames the whole `[workspace]` (the panel just traversed becomes a sidebar beside a `[live mockup]` and `[tool panel]`); an `[artifact window: spreadsheet]` scales up from small toward full frame, then a slow push-in + lateral pan settles on its `[highlighted cells]`; an `[inline panel]` expands below the highlighted line and a `[follow-up question]` types into it; or the row unfolds into a `[sub-task stack]` and the scroll settles on `[narration text]`. Optional coda: one cursor click instantly swaps a `[screen]` inside the revealed artifact (e.g. a phone tab click). Frame locks; element motion only to the end.

- Variant — _pan-to-workspace_ (001_claudeai, 5.0s): traversal is a REAL camera pan — opens tight on the chat panel, one single uninterrupted downward glide (never cutting away) over pills → checked list → typing verifier summary; hinge is the summary completing; reveal is ONE rapid decelerating zoom-out to the three-part workspace (chat-as-sidebar / phone mockup / tweaks panel); coda cursor click swaps the phone screen instantly. Exactly two camera moves total.
- Variant — _feed-rush_ (010_perplexity A, 5.4s): NO camera at all — title docks to header, five tagged rows cascade in, then a fast continuous upward ELEMENT scroll races through muted tasks and a checklist to a collapsible row; hinge is the row itself; reveal is the row expanding into a six-item sub-task stack, settling on narration. Cursorless.
- Variant — _document-to-artifact_ (010_perplexity B, 11.75s): traversal is a stepped ELEMENT scroll (static frame) — the document climbs in fast steps, decelerating at each stop, blur/fade between stops, clearing to blank canvas; hinge is a typed handoff line + file-chip pop + cursor click; reveal is the spreadsheet window scaling up then one slow continuous push-in + rightward pan onto the yellow-highlighted forecast columns.
- Variant — _selection-pivot_ (014_OpenAI, 9.3s): typed headline → document builds (bubble prompt + typed title + populating paragraphs) → one smooth upward element scroll eases to a stop; hinge is the selection-highlight sweep + the shot's ONE push-in framing the sentence + tooltip-pill click; reveal is the inline panel expanding below the line with the referenced quote and a rapidly-typed follow-up question. Camera locked at the pushed-in zoom to the end.

**motion vocabulary** continuous slow downward camera pan; fast continuous upward feed scroll; stepped document scroll decelerating at each stop; smooth scroll easing to a stop; speed-blur between scroll stops; content fade at frame edges; centered title shrinks ~50% and glides to a top-left header dock; task rows cascade in staggered; typed line / typed title / typed follow-up question (caret); green leading-verb highlights and model-tag pills riding past; checked-item strikethroughs riding past; file-attachment chip spring pop-in; tooltip pill spring pop; chat-bubble arrival; cursor glide-in + click; selection-highlight sweep across a sentence; ONE camera push-in onto the selection; fast decelerating zoom-out to the full workspace; artifact window scales up from small; slow push-in + lateral pan settling on highlighted cells; collapsible row expands into a sub-task stack; inline panel expands below the line; phone-screen instant swap on a coda tab click; frame-lock hold.

**rule mapping**

- vertical traversal by ELEMENT scroll — fast feed rush / stepped document scroll / smooth scroll-to-stop → `3d-page-scroll` (flat variant: tilt ≈ 0 — the surface's content `translateY`-scrolls to sections; the multi-phase scroll variant covers stepped stops; keep ONE ease family across all steps — `power3.out`/`power4.out` for UI-scroll feel)
- vertical traversal by CAMERA pan (transcript glide) → `viewport-change` (pan mode — the world translates up under a static frame; one continuous tween, no cuts)
- speed-blur between stepped-scroll stops → `motion-blur-streak` (blur peaks at max scroll velocity, resolves to 0 at each settle)
- which content each traversal beat reveals (stop-by-stop sequencing) → `dynamic-content-sequencing`
- centered title shrinks and glides to dock as a fixed header → `gsap-effects` (one simultaneous scale + translate tween; plain two-property move, no named rule required)
- task rows cascade in staggered before the scroll takes over → `waterfall-entry` (arrival cascade; goldens use fade + slide-up — the house rule prescribes binary-opacity whip-in, adopt the house form) or `spring-pop-entrance` (staggered group) for card-like rows
- typed lines — verifier summary, handoff line, document title, follow-up question, opening headline → `discrete-text-sequence` (+ `context-sensitive-cursor` for the trailing caret)
- file-attachment chip pop-in / tooltip pill pop / chat-bubble arrival → `spring-pop-entrance`
- cursor glides in, lands, clicks (hinge and coda) → `cursor-click-ripple` (+ `physics-press-reaction` to compress cursor and target together on the press)
- selection-highlight sweep across the sentence → `css-marker-patterns` (highlight sweep)
- ONE push-in onto the highlighted selection / slow push-in + lateral pan settling on highlighted cells → `coordinate-target-zoom` (measured off-center target — the lateral pan IS the counter-translate component), sequenced under `multi-phase-camera` when it follows the window scale-up
- fast decelerating zoom-OUT to the full workspace → `coordinate-target-zoom` (zoom-out variation: open at the zoomed-in framing, pull to scale 1 with `power3.out`/`power4.out`) or `viewport-change` (single continuous pull on the `cam` object)
- artifact window scales up from small toward full frame on the click → `spring-pop-entrance` (hero arrival scale-up; tune overshoot to ~0 / `power3.out` so the window reads weighty, not bouncy)
- collapsible row expands into a sub-task stack / inline panel expands below the highlighted line → `anchored-layout-expand` (in-flow accordion growth pushing subsequent content DOWN — never tween width/height) + `waterfall-entry` (or `spring-pop-entrance` stagger) on the arriving children
- phone-screen instant swap on the coda tab click → `discrete-text-sequence` (discrete whole-state swap; instant, no in-artifact camera move)
- green verb highlights, model-tag pills, check-circle strikethroughs, yellow forecast cells, edge fade masks → static styling of the surface content — no motion rule needed

**camera modifier**: The blueprint's camera law: **at most TWO real camera moves, bracketing the hinge** — the goldens are emphatic (their briefs carry CRITICAL camera notes). Pick the traversal mechanic first: camera pan (`viewport-change` pan — pan-to-workspace only) OR element scroll (`3d-page-scroll` flat — all others); never both at once. The reveal then spends the second (or only) move: one zoom-OUT to the workspace or one push-IN to the detail (`coordinate-target-zoom`, phases sequenced by `multi-phase-camera`), after which the frame LOCKS — all remaining motion is element-level (typing, expand, screen swap). The feed-rush variant spends zero camera moves: the whole shot is element scroll + expand. This restraint is what separates the shape from `cursor-ui-demo` (camera servos to every interaction) and from `device-surface-showcase` (a showcase camera presenting a held hero).

**Overflow (scrolled/panned surfaces — required for a clean `check`):** the traversal deliberately moves content past the frame edges. Clip at the scene (`overflow: hidden`) AND mark the moving inner layer (the `.page-content` / `.world` wrapper carrying the transcript/feed/document) with `data-layout-allow-overflow` — otherwise `check` reports `text_box_overflow` / `container_overflow` for every row that has scrolled off. The clip handles it visually; the attribute tells the layout audit it's intentional.

## Selected motion rule: scale-swap-transition

---
name: scale-swap-transition
description: Coordinated shrink-out + spring pop-in morph-like transition between two elements — no SVG path interpolation needed.
metadata:
  tags: transition, morph, scale, swap, spring, pop
---

# Scale-Swap Transition

Simulates a "morph" between two DOM elements by overlapping exit and entrance scale animations. Lighter weight than [card-morph-anchor.md](card-morph-anchor.md) (which morphs container dimensions — use that for SHAPE changes; this rule is for SAME-shape state swaps) and easier than SVG path interpolation.

At a single trigger, two coordinated tweens fire:

1. **Outgoing**: scale `1.0 → EXIT_SCALE` + opacity `1 → 0`, fast `power2.in` (rushing away).
2. **Incoming**: scale `EXIT_SCALE → 1.0` + opacity `0 → 1`, `back.out(BOUNCE_FACTOR)` (arriving with weight).

A small `OVERLAP` window during which both are mid-tween creates the morph illusion; the incoming sits on top via z-index so the outgoing's fade-tail doesn't bleed through.

## Recipe

```html
<!-- Both cards position: absolute; inset: 0 in one fixed-size wrapper — same
     footprint, same transform-origin: 50% 50%. Incoming starts opacity: 0,
     transform: scale(EXIT_SCALE), z-index above the outgoing. -->
<div class="swap-wrap">
  <div class="card outgoing" id="outgoing">{outgoingIcon} {outgoingLabel}</div>
  <div class="card incoming" id="incoming">
    {incomingIcon} {incomingLabel}
    <div class="sub" id="sub">{incomingSubline}</div>
  </div>
</div>
```

```js
// Outgoing: shrink + fade fast
tl.to(
  "#outgoing",
  { scale: EXIT_SCALE, opacity: 0, duration: EXIT_DUR, ease: "power2.in" },
  TRIGGER,
);

// Incoming: pops in with overshoot, starting OVERLAP before the exit finishes
tl.to(
  "#incoming",
  { scale: 1.0, opacity: 1, duration: ENTER_DUR, ease: `back.out(${BOUNCE_FACTOR})` },
  TRIGGER + EXIT_DUR - OVERLAP,
);

// Inner content reveals AFTER the incoming settles
tl.fromTo(
  "#sub",
  { opacity: 0, y: SUB_REVEAL_Y_PX },
  { opacity: 1, y: 0, duration: SUB_REVEAL_DUR, ease: "power3.out" },
  TRIGGER + EXIT_DUR + SUB_REVEAL_DELAY,
);
```

## Variations

- **Delayed inner content reveal** — the classic pattern above: morph the container, then reveal inner text once it settles; the 0.2–0.4 s gap lets the eye land on the new shape before reading.
- **Triple swap (3-state cycle)** — chain A→B→C with triggers `TRIGGER_AB` / `TRIGGER_BC`; each transition is its own tween pair, the previous incoming becoming the next outgoing. State-evolution narratives (early → mid → final labels).
- **Color-shift transition (no scale)** — for a flat morph between same-shape states, drop the scale and keep opacity + a brief background hue tween; less dramatic, more product-UI tone.

## Values

| token            | range                                 | notes                                                                                                  |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| TRIGGER          | ≥ outgoing settled + a presence-dwell | the outgoing must "land" before transforming                                                           |
| EXIT_DUR         | 0.3–0.5 s                             |                                                                                                        |
| ENTER_DUR        | 0.45–0.7 s                            | longer than `EXIT_DUR` so the overshoot can settle                                                     |
| OVERLAP          | 0.1–0.2 s                             | >0.3 s both are clearly visible together (no morph); <0.05 s leaves a visible empty gap                |
| EXIT_SCALE       | 0.6–0.8                               | smaller exits feel dramatic but risk reading as "vanish" instead of "morph"                            |
| BOUNCE_FACTOR    | 1.4 soft · 1.8 firm · 2.2 cartoony    |                                                                                                        |
| SUB_REVEAL_DELAY | 0.2–0.4 s                             | reveals during the morph compete with the swap for attention                                           |
| BRAND_REVEAL_AT  | < TRIGGER                             | context (brand, eyebrow) sets the stage early; revealed AT the swap it competes with the headline beat |

## Critical Constraints

- **Incoming z-index ABOVE outgoing** — otherwise the outgoing's fade-tail (opacity 0.3–0.5) bleeds through and double-exposes the frame.
- **Both elements share `transform-origin: 50% 50%`** — different origins make the morph read as one thing teleporting elsewhere.
- **Bouncy ease ONLY on the incoming** — outgoing `power2.in`, incoming `back.out`; reversed, the swap feels mechanical.
- **Both cards `position: absolute; inset: 0`** in the same fixed-size wrapper (sized to fit both states; the wrap never resizes).
- **Don't `display: none` the outgoing** after the fade — leave it at `opacity: 0` so layout doesn't reflow.
- **Inner content reveals after the container settles**; **climax dwell ≥ 1 s** after the final state + subline land.

## See also

`press-release-spring` (a button press TRIGGERS the swap — cause and effect) · `card-morph-anchor` (shape-changing alternative) · `reactive-displacement` (when the replacement should read as a causal collision) · `sine-wave-loop` (idle breathing on the final state).
