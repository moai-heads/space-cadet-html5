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
- See `PLAN.md` for the live stage checklist and next steps.

## Run

Open `index.html` in a current desktop browser. If a browser blocks local files, serve the folder with any static server, for example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

To run the browser smoke tests, open `tests/input-smoke.html`, `tests/table-features-smoke.html`, and `tests/ramps-smoke.html` from the same server; each should show `data-smoke="pass"`.

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
