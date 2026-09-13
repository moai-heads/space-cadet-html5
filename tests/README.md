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

`deck-routing-smoke.html` covers lower/raised/bridge ball state, access-route transports, mid-route level handoffs, ramp destination levels, and raised-deck return routing.

`deck-apron-smoke.html` covers the portrait lower apron, paired slings/kickers, flipper skins, and corrected right-flipper handedness.

`deck-palette-smoke.html` covers the named purple/teal/red palette, chrome roles, bumper housings, and colored render contrast.

`deck-regression-smoke.html` covers render-pass vocabulary, bridge visibility, raised/bridge handoffs, bumper scoring, and the shared physics speed cap.

`deck-comparison-smoke.html` covers the stable screenshot frame, 342×482 portrait aspect, centered viewport, and major reference landmark bands.

`collision-clarity-smoke.html` checks visible-deck bumper alignment, portrait bounds, eased route capture, and route completion without a stuck transport.

`real-loop-smoke.html` checks the live scheduler, logical backing resolution, average frame budget, and flipper response.

Run the complete suite from the project root with `./tests/run-smoke.sh`; it starts a temporary local server, runs all 25 Chromium smoke pages plus 3 gameplay viewports, and exits nonzero on failure.

`gameplay-smoke.html` covers launch, flippers, bumper scoring, mission completion, drain/respawn, game over, and reference-aspect containment inside the current viewport. The regression runner executes it at 1280×900, 900×700, and 390×844.

`performance-smoke.html` checks synchronous input latency, audio unlock, logical rendering throughput, fixed-step simulation throughput, and finite runtime state.

`offline-smoke.html` verifies that the local index/app sources load without remote runtime dependencies.
