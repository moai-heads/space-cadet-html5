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
