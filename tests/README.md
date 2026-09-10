# Browser smoke tests

The input smoke test exercises the public controls and the stage 2 playable-core transitions in a real Chromium page.

```bash
python3 -m http.server 8080
chromium --headless --no-sandbox --disable-gpu \
  --virtual-time-budget=2500 --dump-dom \
  http://127.0.0.1:8080/tests/input-smoke.html
```

The returned document has `data-smoke="pass"` when every check succeeds.

`table-features-smoke.html` covers the Stage 3.2 mapped feature counts and
exercises a guide, gate, target, rollover, kicker, and slingshot in Chromium.

`ramps-smoke.html` covers Stage 3.3 ramp mapping and ride/eject behavior, ramp-hole
capture and re-entry, wormhole capture/eject behavior, rocket feedback, and
shooter-lane exit routing.

`rules-smoke.html` covers rank initialization, mission start/rotation/completion, target-practice progress, multiplier-bank steps, fuel-bar filling, and promotion progress.

`tuning-smoke.html` covers shared physics constants, bounded restitution, tuned kicker/bumper/slingshot impulses, and the narrowed drain capture funnel.

`layout-smoke.html` validates the responsive screen frame, 600×416 aspect ratio, logical canvas dimensions, viewport containment, and mobile/desktop alignment.

`audio-smoke.html` covers lazy AudioContext creation, master/SFX/UI bus creation, gesture unlock, mute gain targeting, and observable audio state.

`sound-smoke.html` covers the procedural flipper, rail, bumper, target, rollover, kicker, slingshot, ramp, hole, wormhole, launch, drain, and nudge sound event set plus mute suppression.

`mission-sound-smoke.html` covers mission start/progress/completion, promotion, multiplier, and fuel rule cues.

`controls-smoke.html` covers keyboard bindings, touch zones, pointer drag transfer, pointer release outside the canvas, canvas focus, focus-loss resets, and modified-shortcut protection.

`ui-smoke.html` covers help/escape behavior, pause/resume, mute/unmute, restart, live status updates, high-score preservation, and accessibility metadata.

`presentation-smoke.html` covers fullscreen/mute toolbar controls, fullscreen API exposure, responsive presentation hints, and keyboard shortcut metadata.

Run the complete suite from the project root with `./tests/run-smoke.sh`; it starts a temporary local server, runs all 12 Chromium pages, and exits nonzero on failure.
