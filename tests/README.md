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
