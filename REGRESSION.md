# Chromium regression validation

**Last run:** September 11, 2026  
**Command:** `./tests/run-smoke.sh`  
**Result:** **25/25 regression runs passed**

The runner performs a syntax check, serves the project locally, launches headless Chromium for every smoke page, applies the autoplay policy to audio tests, runs gameplay at 1280×900, 900×700, and 390×844, checks performance and offline serving, and fails nonzero if any page does not report `data-smoke="pass"`. The eight raised-deck smoke pages are included in the 25-run total.

Validated pages:

- `input-smoke.html`
- `table-features-smoke.html`
- `ramps-smoke.html`
- `rules-smoke.html`
- `tuning-smoke.html`
- `deck-scaffold-smoke.html`
- `deck-layers-smoke.html`
- `deck-metadata-smoke.html`
- `deck-access-smoke.html`
- `deck-routing-smoke.html`
- `deck-apron-smoke.html`
- `deck-palette-smoke.html`
- `deck-regression-smoke.html`
- `layout-smoke.html`
- `audio-smoke.html`
- `sound-smoke.html`
- `mission-sound-smoke.html`
- `controls-smoke.html`
- `ui-smoke.html`
- `presentation-smoke.html`
- `performance-smoke.html`
- `offline-smoke.html`
- `gameplay-smoke.html` at 1280×900
- `gameplay-smoke.html` at 900×700
- `gameplay-smoke.html` at 390×844

Environment used: Chromium 152.0.7977.82, Node v26.8.1, Python 3.14.7.
