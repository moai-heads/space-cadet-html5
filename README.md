# 3D Pinball — Space Cadet (HTML5)

A from-scratch, browser-playable homage to the classic Windows Space Cadet table. It uses a Canvas 2D renderer, fixed-step physics, a drain/respawn lifecycle, procedural table art, and no external runtime assets. Procedural Web Audio is planned for Stage 5.

## Progress

- **Stage 2.9 complete:** open-drain detection, ball decrement, drain flash/banner, service delay, next-ball plunger reset, and final-ball game over.
- **Stage 2.10 complete:** centralized score events with rail, flipper, and bumper awards plus score popups.
- **Stage 2.11 complete:** deterministic Chromium smoke harness passes keyboard controls, pause/mute/help, nudge expiry, drain, and respawn.
- **Stage 2.12 complete:** playable-core checkpoint packaged and validated; see `CHECKPOINT-2.12.md`.
- **Stage 3.1 complete:** migrated to the original 600×416 screen coordinate system using the source camera projection; table rails, shooter lane, seven bumper anchors, flippers, and right-side score strip now share the reference map.
- **Stage 3.2 complete:** added 22 projected target faces, 18 rollovers, five active lane guides, two gates, two kickers, and two slingshots with collision response, scoring, flashes, and data-driven rendering. Feature smoke test passes; commit `5753c29`.
- **Stage 3.3 complete:** added two source-projected ramp rides, ramp rails, ramp-hole capture and re-entry, three timed wormhole sinks, rocket launch feedback, and a routed shooter-lane exit. `tests/ramps-smoke.html` passes; commit `94c566d`.
- **Stage 3.4 complete:** added nine ranks, 17 named missions, mission timers/completion, promotion progress, multiplier steps (1x/2x/5x/10x), fuel bar, target-bank rules, mission banner, and `tests/rules-smoke.html`; commits `570e091` and `63c47ef`.
- **Stage 3.5 complete:** centralized collision tuning, adjusted rail/bumper/kicker/flipper response, added collision slop and tangential damping, and narrowed the drain funnel; `tests/tuning-smoke.html` passes with the full regression set. Commits `11d7174` and `67ba213`.
- **Stage 4.1 complete:** corrected the 600×416 reference aspect ratio, added a responsive screen frame with safe-area support, and validated wide/mobile layouts with `tests/layout-smoke.html`; commits `5122ee9` and `0745c53`.
- **Stage 4.2 complete:** added procedural bitmap decals, chrome rails, textured table panels, lamp banks, and mission/rank indicators without redistributing original artwork; commit `37860ea`.
- **Stage 4.3 complete:** added digital score segments, ball display polish, CRT scanlines/vignette, palette-aware bloom, and transient particle/ring effects; commit `3bf8cac`.
- **Stage 5.1 complete:** added a lazy Web Audio mixer with master/compressor, SFX/UI buses, gesture unlock, mute gain control, visibility suspend/resume, and audio status HUD; `tests/audio-smoke.html` passes; commits `db130b8` and `e53dee5`.
- **Stage 5.2 complete:** added procedural cooldown-aware sounds for flippers, rails, bumpers, targets, rollovers, kickers, slingshots, ramps, holes, wormholes, launch, drain, and nudge; `tests/sound-smoke.html` passes; commits `fbdd28a` and `35cb3ff`.
- **Stage 5.3 complete:** added restrained procedural mission start/progress/complete/fail, promotion, multiplier, and fuel cues; `tests/mission-sound-smoke.html` passes; commits `6674917` and `a70958b`.
- **Stage 6.1 complete:** polished keyboard, mouse, touch, focus-loss, pointer-drag, and canvas focus behavior; added `tests/controls-smoke.html`; commits `c092a96` and `d4491bc`.
- **Stage 6.2 complete:** added the rendered help overlay, Escape/R restart paths, live accessibility status, keyboard shortcut metadata, and accessible instructions; `tests/ui-smoke.html` passes; commits `d939991` and `6fe7e90`.
- See `PLAN.md` for the live stage checklist and next steps.

## Run

Open `index.html` in a current desktop browser. If a browser blocks local files, serve the folder with any static server, for example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

To run the browser smoke tests, open `tests/input-smoke.html`, `tests/table-features-smoke.html`, `tests/ramps-smoke.html`, `tests/rules-smoke.html`, `tests/tuning-smoke.html`, `tests/layout-smoke.html`, `tests/audio-smoke.html`, `tests/sound-smoke.html`, `tests/mission-sound-smoke.html`, `tests/controls-smoke.html`, and `tests/ui-smoke.html` from the same server; each should show `data-smoke="pass"`.

## Controls

- **Z / Left Shift:** left flipper
- **/ / Right Shift:** right flipper
- **Hold Space, release Space:** charge and launch the plunger
- **A/D or Left/Right arrows:** nudge
- **Enter:** new game
- **P:** pause
- **H:** help overlay
- **M:** toggle mute state (audio is planned for Stage 5)

This is an independent, from-scratch fan recreation. It does not include Microsoft binaries, original sprites, or original audio files.
