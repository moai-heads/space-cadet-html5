# Space Cadet HTML5 Recreation Plan

**Last updated:** September 10, 2026
**Current position:** Stage 4.3 ready
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
- [ ] 4.3 Tune palette, glow, CRT treatment, score panel, ball display, and transient hit effects.

## Stage 5 — Sound

- [ ] 5.1 Add a small Web Audio mixer with mute and unlock handling.
- [ ] 5.2 Add procedural flipper, rail, bumper, target, ramp, drain, launch, and nudge sounds.
- [ ] 5.3 Add restrained mission/rank cues without copying original recordings.

## Stage 6 — Controls and UI polish

- [ ] 6.1 Verify keyboard, mouse, touch, and focus-loss behavior on desktop and mobile layouts.
- [ ] 6.2 Finish help, pause, mute, restart, high-score, and accessibility labeling.
- [ ] 6.3 Add responsive/fullscreen presentation and make control hints match the final bindings.

## Stage 7 — Testing, polish, and delivery

- [ ] 7.1 Run automated smoke/regression checks in Chromium.
- [ ] 7.2 Test launch, flippers, collisions, scoring, missions, drain, respawn, and game over at multiple viewport sizes.
- [ ] 7.3 Check performance, input latency, audio unlock, and local/offline serving.
- [ ] 7.4 Produce a clean downloadable archive and final README with controls and known limitations.

## Working rules

- Commit after every completed implementation or documentation change.
- Keep this plan current after each stage or meaningful scope change.
- Keep generated screenshots, archives, and downloaded references out of Git.
- Keep the recreation independent: no Microsoft binaries, original sprites, or original audio files.
