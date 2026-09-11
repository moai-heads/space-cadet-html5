# Space Cadet HTML5 Recreation Plan

**Last updated:** September 11, 2026
**Current position:** Stage 8.7 — bridge occlusion
**Status legend:** `[x]` complete · `[-]` in progress · `[ ]` pending

This file is the working source of truth for the build. Update it whenever a
stage changes, and record the validating test or commit for completed work.

## Stage 1 — Reference pass

- [x] Collect gameplay and screenshot references.
- [x] Record the table vocabulary, visual palette, input model, and legal asset boundary.
- [x] Establish a from-scratch Canvas 2D implementation with procedural graphics and Web Audio rather than redistributed Microsoft assets.
- **Checkpoint:** `REFERENCE.md`, initial project commit `0db72db`.

## Stage 2 — Playable core

- [x] **2.1 Canvas boot:** responsive canvas, logical design space, initial table and scoreboard.
- [x] **2.2 Fixed timestep:** deterministic 120 Hz simulation with elapsed-time clamping.
- [x] **2.3 Input layer:** keyboard, pointer/touch, pause, help, mute, and focus-loss reset.
- [x] **2.4 Ball physics:** gravity, drag, velocity cap, nudge impulse, and motion trail.
- [x] **2.5 Collision primitives:** segment rails, positional correction, rebounds, and impact feedback.
- [x] **2.6 Game state:** ready, playing, paused, game over, restart, score, balls, and high score.
- [x] **2.7 Flippers:** articulated motion, capsule collision, moving-surface impulse, and hit feedback.
- [x] **2.8 Plunger lane:** chargeable spring, launch velocity, shooter lane, and release behavior.
- [x] **2.9 Drain/respawn:** life decrement, service delay, next-ball reset, and final-ball game over. Commit `9f96266`.
- [x] **2.10 Scoring hooks:** rail, flipper, and bumper awards with score popups. Commit `fab54c5`.
- [x] **2.11 Input smoke test:** deterministic Chromium harness covers controls, pause/mute/help, nudge, drain, and respawn. Result: `data-smoke="pass"`.
- [x] **2.12 Playable-core checkpoint:** clean archive, checkpoint notes, and passing browser validation. Checkpoint commit `35063c4`; archive `space-cadet-html5-stage-2.12.zip`. See `CHECKPOINT-2.12.md`.

## Stage 3 — Table recreation

- [x] 3.1 Migrate the temporary geometry to the reference table coordinate map. Added the source 600×416 camera projection, right-side score strip, mapped table rails, shooter lane, seven bumpers, and flipper anchors. Browser smoke test passes the map assertions. Commit `d92cdeb`.
- [x] 3.2 Add target banks, rollovers, lane guides, gates, kickers, and slingshots. Added all 22 source targets, 18 rollovers, five active guide rails, two gates, two kickers, and two slingshots with shared projected geometry, collision responses, hit lighting, scoring, and a feature smoke harness. Commit `5753c29`; `tests/table-features-smoke.html` passes.
- [x] 3.3 Add ramps, ramp holes, rocket/wormhole behavior, and shooter-lane exit routing. Added source-projected launch and hyperspace ramp centerlines with rail collisions, ramp rides, rocket launch feedback, a timed ramp-hole capture/re-entry path, three timed wormhole sinks with eject vectors, and a routed shooter-lane exit. Browser validation: `tests/ramps-smoke.html` passes. Commit `94c566d`.
- [x] 3.4 Add mission/rank progression and table-specific rule state. Added nine naval ranks, 17 rotating mission definitions, timed mission lifecycle, promotion progress, target-bank rules, 1x/2x/5x/10x multiplier, fuel bar, hazard/medal/booster state, mission banner, and `tests/rules-smoke.html`. Commits `570e091`, `63c47ef`; browser validation passes.
- [x] 3.5 Tune collision radii, restitution, kick strength, and drain geometry against gameplay reference. Centralized projected-physics tuning, softened rails/bumper/kicker/flipper impulses, added target/ramp collision slop and tangential damping, and narrowed the drain capture funnel. `tests/tuning-smoke.html` plus all prior smoke tests pass. Commits `11d7174`, `67ba213`.

## Stage 4 — Visual recreation

- [x] 4.1 Match the original low-resolution layout and perspective while retaining responsive scaling. Preserved the 600×416 reference aspect ratio with a responsive screen frame, safe-area handling, landscape/portrait sizing, and a layout smoke harness. Commits `5122ee9`, `0745c53`; all six Chromium smoke tests pass.
- [x] 4.2 Replace diagnostic labels with bitmap-like table art, rails, lamps, chrome, and mission indicators. Added a procedural five-row bitmap font, chrome rail layers, surface panel art, target/rollover lamps, target-bank indicators, and mission/rank badges without importing original assets. Commit `37860ea`; all six Chromium smoke tests pass.
- [x] 4.3 Tune palette, glow, CRT treatment, score panel, ball display, and transient hit effects. Added digital seven-segment score rendering, ball highlights/icons, CRT scanlines/vignette/rolling line, palette-aware bloom, and deterministic transient particle/ring flashes. Commit `3bf8cac`; all six Chromium smoke tests pass.

## Stage 5 — Sound

- [x] 5.1 Add a small Web Audio mixer with mute and unlock handling. Added lazy AudioContext creation, master/compressor/sfx/ui buses, gesture unlock, mute gain targeting, visibility suspend/resume, and audio status HUD. `tests/audio-smoke.html` plus the six prior smoke tests pass. Commits `db130b8`, `e53dee5`.
- [x] 5.2 Add procedural flipper, rail, bumper, target, ramp, drain, launch, and nudge sounds. Added cooldown-aware oscillator/noise synths and hooks for flippers, rails, bumpers, targets, rollovers, kickers, slingshots, ramps, holes, wormholes, launch, drain, and nudge. `tests/sound-smoke.html` plus the seven prior smoke tests pass. Commits `fbdd28a`, `35cb3ff`.
- [x] 5.3 Add restrained mission/rank cues without copying original recordings. Added procedural mission start/progress/complete/fail, promotion, multiplier, and fuel cues with separate cooldown policy. `tests/mission-sound-smoke.html` plus the eight prior smoke tests pass. Commits `6674917`, `a70958b`.

## Stage 6 — Controls and UI polish

- [x] 6.1 Verify keyboard, mouse, touch, and focus-loss behavior on desktop and mobile layouts. Added focus-safe control reset, pointer capture/drag zones, window-level pointer release, modified-shortcut protection, canvas keyboard focus, and touch/keyboard diagnostics. `tests/controls-smoke.html` plus the nine prior smoke tests pass. Commits `c092a96`, `d4491bc`.
- [x] 6.2 Finish help, pause, mute, restart, high-score, and accessibility labeling. Added the rendered help overlay, Escape/R restart paths, live status region, keyboard shortcut metadata, canvas focus, and accessible instructions. `tests/ui-smoke.html` plus the ten prior smoke tests pass. Commits `d939991`, `6fe7e90`.
- [x] 6.3 Add responsive/fullscreen presentation and make control hints match the final bindings. Added fullscreen API/button/keyboard controls, responsive fullscreen CSS, mute toolbar control, updated hints, and presentation smoke coverage. `tests/presentation-smoke.html` plus the eleven prior smoke tests pass. Commits `e7972dc`, `87df79b`.

## Stage 7 — Testing, polish, and delivery

- [x] 7.1 Run automated smoke/regression checks in Chromium. Added executable `tests/run-smoke.sh`, resilient embedded-layout polling, syntax validation, local serving, audio autoplay configuration, and fail-fast result parsing. September 10, 2026 run: 17/17 pass. Commit `261b516`; see `REGRESSION.md`.
- [x] 7.2 Test launch, flippers, collisions, scoring, missions, drain, respawn, and game over at multiple viewport sizes. Added `tests/gameplay-smoke.html` and runner coverage at 1280×900, 900×700, and 390×844; fixed mapped target/rollover score preservation. All 15 regression runs pass. Commits `fa70f89`, `668d642`.
- [x] 7.3 Check performance, input latency, audio unlock, and local/offline serving. Added `performance-smoke.html` for input/render/simulation budgets, `offline-smoke.html` for local-source dependency checks, and runner integration. September 10, 2026 run: 17/17 pass. Commits `7841a79`, `6989e4d`.
- [x] 7.4 Produce a clean downloadable archive and final README with controls and known limitations. Final source package: `space-cadet-html5-final-2026-09-10.zip`; generated archive is kept outside Git. All 17 regression runs pass.


## Stage 8 — Raised-deck table redesign from supplied reference

**Reference:** the supplied 342×482 `glx_vertical_cover.png` image. The
implementation will recreate its composition and gameplay ideas from scratch
with procedural shapes and colors; the reference pixels will not be shipped as
an asset.

The target is a narrow vertical table inside the existing responsive host:
midnight-blue lower bed, purple raised island at left, a dark upper deck with
three large bumpers, red/blue chrome rails, a circular teal reactor at center,
underpasses/bridges with visible support shadows, and ball routes that can move
between lower and raised levels.

Every task below is intentionally scoped to roughly four minutes or less. Mark
one task complete only after its code/docs change is committed and its listed
check passes.

- [x] **8.1 Reference freeze (≤4 min):** record the reference proportions,
  palette, major raised areas, under/over crossings, and the no-bundled-assets
  rule. This section is the source of truth for the redesign.
- [x] **8.2 Deck coordinate scaffold (≤4 min):** add a named portrait-style
  design map and deck metadata without changing existing collision behavior. Added
  the 342×482 viewport fit, lower/raised/bridge levels, named sections, and
  three access route paths. `tests/deck-scaffold-smoke.html` passes; commit
  `4b995d0`.
- [x] **8.3 Layered draw order (≤4 min):** introduce explicit `lower`,
  `raised`, `bridge-shadow`, `bridge-top`, and `ball` render passes. Added the
  named pass list and render hooks without replacing the existing physics map.
  `tests/deck-layers-smoke.html` passes; commit `ca1f465`.
- [x] **8.4 Lower-bed art (≤4 min):** replace the flat lower field with navy
  gradients, purple channels, lightning-like veins, and the central reactor. Added
  a portrait-fitted lower bed, purple apron channels, animated veins, and a
  procedural teal reactor with lamps. `tests/deck-layers-smoke.html` passes;
  preview is generated outside Git; commit `722b13c`.
- [x] **8.5 Raised left island (≤4 min):** draw the purple upper-left island,
  its lip, support posts, lamps, and access mouth. Added an elevated island
  silhouette with shadowed supports, a bright front lip, three procedural
  dome bumpers, perimeter lamps, and a marked lower-bed access mouth.
  `tests/deck-layers-smoke.html` passes; preview is generated outside Git;
  commit `ec46585`.
- [x] **8.6 Upper bumper deck (≤4 min):** draw the dark top deck, red cradle
  rails, three large bumper housings, and top entry lanes. Added the dark
  upper-deck silhouette, red/blue cradle rails, three large dome bumpers,
  entry-lane guides, and upper-deck lamps. `tests/deck-layers-smoke.html` passes;
  preview is generated outside Git; checkpoint commit follows.
- [-] **8.7 Bridge occlusion (≤4 min):** add raised rails, underside darkness,
  support shadows, and narrow visible lower lanes under the bridges.
- [ ] **8.8 Deck-aware feature metadata (≤4 min):** tag bumpers, targets,
  rollovers, ramps, and holes with their deck/height and render z-order.
- [ ] **8.9 Raised access routes (≤4 min):** add entry/exit guide paths from
  the lower bed to the island and upper deck.
- [ ] **8.10 Ball level routing (≤4 min):** add a small deck state to ball
  transport so ramps/bridges move the ball above and below correctly.
- [ ] **8.11 Lower apron and flipper art (≤4 min):** reshape the lower apron,
  slings, kickers, and flippers to match the reference silhouette.
- [ ] **8.12 Palette and feature pass (≤4 min):** tune lamps, bumpers, rails,
  chrome highlights, and glow to the reference's purple/teal/red balance.
- [ ] **8.13 Deck regression smoke test (≤4 min):** test render layers,
  bridge visibility, level transitions, and existing scoring/physics hooks.
- [ ] **8.14 Screenshot comparison pass (≤4 min):** capture a stable preview,
  compare proportions against the supplied image, and fix the largest drift.
- [ ] **8.15 Delivery checkpoint (≤4 min):** update README/PLAN, run the full
  regression suite, commit, and produce an updated archive.

**Stage 8.1 notes:** image is 342×482 portrait; the visual landmarks are the
left purple elevated area, a top elevated bumper cluster, a large central teal
circle, two long lower flipper lanes, and multiple rails that visibly pass over
blue playfield channels. The host remains 600×416 until 8.2–8.3 prove a safe
portrait mapping, so the redesign can be reverted without invalidating the
existing Space Cadet tests.

## Working rules

- Commit after every completed implementation or documentation change.
- Keep this plan current after each stage or meaningful scope change.
- Keep generated screenshots, archives, and downloaded references out of Git.
- Keep the recreation independent: no Microsoft binaries, original sprites, or original audio files.
