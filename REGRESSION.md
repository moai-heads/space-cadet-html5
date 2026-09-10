# Chromium regression validation

**Last run:** September 10, 2026  
**Command:** `./tests/run-smoke.sh`  
**Result:** **12/12 smoke tests passed**

The runner performs a syntax check, serves the project locally, launches headless Chromium for every smoke page, applies the autoplay policy to audio tests, and fails nonzero if any page does not report `data-smoke="pass"`.

Validated pages:

- `input-smoke.html`
- `table-features-smoke.html`
- `ramps-smoke.html`
- `rules-smoke.html`
- `tuning-smoke.html`
- `layout-smoke.html`
- `audio-smoke.html`
- `sound-smoke.html`
- `mission-sound-smoke.html`
- `controls-smoke.html`
- `ui-smoke.html`
- `presentation-smoke.html`

Environment used: Chromium 152.0.7977.82, Node v26.8.1, Python 3.14.7.
