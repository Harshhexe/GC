# Hyperframes Composition Brief: GC

## Objective
Create a short launch-style brag video for GC, a group chat that hands out
AI-written nicknames and weekly awards.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: vertical — 1080x1920
- Duration: 20s

## Source Material
- Project root: `/Users/harsh/Desktop/GC`
- Primary files read: `src/theme/theme.ts` (tokens), `src/components/AwardCard.tsx`
  (the card being recreated), `src/screens/ExploreScreen.tsx` (trophy room),
  `supabase/functions/gc-ai/operations/dailyNames.ts` (naming feature), plus
  live award rows from the production database
- Product name: GC
- Tagline / strongest claim: it names you even when you say nothing
- Key UI to recreate: the award card — emoji orb with a metal ring, a numbered
  medal badge seated on the orb's edge, title as the hero, and the citation
  quote on a metal-tinted left rule

### Copy that must appear verbatim

All of the following is **real output from the shipped app**, generated for a
real group chat. None of it was written for this video. Do not paraphrase.

- "Zero messages sent, just pure read-receipt energy."
- "The Phantom Lurker"
- "The Glitch Hunter" / "Obsessed with the 'do e' glitch and double-texting bugs."
- "The Vibe Inspector" / "Solely here to validate 11:11 wishes and call people crazy."
- "The Ghost" / "Present in the group, absent from the chat."
- "Certified Yapper", "The 3 AM Correspondent", "Reply Guy"
- "Has never started a conversation. Has never missed one either."
- "This Week's Claimed Awards"
- "Every member. Every midnight."
- "Say nothing. Get named anyway."

## Creative Direction
- Tone preset: `default`
- Creative direction: a formal awards ceremony nobody in the group chat asked for
- Interpretation: clean, confident, postable pacing with a deadpan writing
  voice. Motion stays composed and slightly ceremonial; copy never winks.
  Comedy comes from delivering "pure read-receipt energy" with the gravity of a
  real awards package. No jokey typography, no comic bounce, no exclamation marks.
- Angle: the app roasts you and never breaks character. The humour is the
  product's actual output, not video copy. The claim that earns the film:
  silence is not an escape from GC, silence is a category.
- Hook: cold open on a roast with no context or logo — the viewer reads an
  insult and has to find out who it is about.
- Outro / punchline: "Say nothing. Get named anyway." then the GC wordmark.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign — the card must match the shipped component

## Visual Identity
Exact values from `src/theme/theme.ts`.

- Background: `#030206` (`colors.appChrome`); panels `#0A0A0F`
- Text: `#F1F5F9` (`colors.onSurface`); muted `#94A3B8` (`colors.onSurfaceVariant`)
- Accent: `#818CF8` (`colors.primary`)
- Ceremony gold: `#FBBF24` — scarce, medals only
- Podium metals: gold `#FBBF24`, silver `#CBD5E1`, bronze `#D97757`
- Display font: Bricolage Grotesque ExtraBold — bundled at
  `assets/fonts/BricolageGrotesque_800ExtraBold.ttf` (the app's real font)
- Body font: Inter 400/600/700 — bundled at `assets/fonts/Inter_*.ttf`
- Card geometry: 24px radius, 1px `rgba(255,255,255,0.08)` border,
  `rgba(255,255,255,0.028)` fill, metal wash from the top-left corner only

## Storyboard
`brag-output/brag-plan.md` is the creative contract.

1. Cold roast — 3.0s — the lurker line alone on near-black, gold hairline under it
2. It was a trophy — 3.5s — card assembles *around* the line already on screen
3. Named at midnight — 4.5s — clock rolls to 00:00, three name chips arrive one per beat
4. The podium — 5.5s — three award cards land on strong beats, gold/silver/bronze
5. Punchline and wordmark — 3.5s — one line alone, then the GC wordmark

## Audio
- Audio role: warm corporate bed, played straight
- Audio arc: cheerful business-presentation music runs unbothered under
  increasingly personal insults, lifts once for the podium, and drops out
  entirely for the final line — the only silent moment is the punchline
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music treatment: start at 3.0s of the track so the beat grid lands under the
  cold open; moderate under roast copy so it reads; small lift into the podium;
  fade to zero across the final 1.2s
- Music cue guidance: bundled preset read (120.19 BPM, grid from 3.02s at 0.5s
  intervals). Candidate strong cues: 17.02s, 18.52s, 20.02s. Use the
  16.02-18.52s window for the three podium cards. Cue timings are guidance
  only — if a card needs another 200ms to be readable, readability wins.
- Audio-reactive treatment: subtle. A faint gold bloom behind the medal on
  podium arrivals. Nothing that pulses continuously.
- Audio-coupled moments:
  - Scene 1 hook line settling — one soft settle cue
  - Scene 2 medal badge seating — one interface tick
  - Scene 3 three name chips — one quiet cue per chip
  - Scene 4 three medals — one restrained cue each, decreasing gold → bronze
- SFX selection guidance: sparse and motion-matched, roughly four to seven cues
  in the whole film. Bundled candidates in `assets/sfx/`: `drop_001.ogg`,
  `click_003.ogg`, `bong_001.ogg`, `switch1.ogg`.
- Restraint rule: no whoosh on every element, no riser into the outro, no
  stinger on the wordmark. The music must never sound aware the copy is funny.

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`,
`hyperframes-keyframes`, `hyperframes-cli`. This is the `/brag` workflow — do
not enter the `hyperframes` entry-point intent interview.

Requirements:
- Show at least one real UI element from the source project (the award card).
- Keep all text readable: short label ~0.8s settled, a sentence ~0.3s per word.
- Keep the video within 15-25 seconds.
- All assets are pre-bundled locally (fonts, music, SFX, GSAP) — no render-time
  network fetches.
- Run `npx hyperframes check` before render — brag's single gate.
