# Stage 2.12 — Playable-core checkpoint

**Date:** September 10, 2026
**Status:** complete

The playable core is packaged as `space-cadet-html5-stage-2.12.zip`.
The archive is generated and intentionally kept outside Git.

## Included

- `index.html` — browser entry point
- `app.js` — fixed-step game loop, physics, flippers, plunger, drain/respawn, scoring, and procedural rendering
- `README.md` — run instructions and controls
- `REFERENCE.md` — reference-pass notes
- `PLAN.md` — live roadmap
- `tests/input-smoke.html` — deterministic browser smoke harness
- `tests/README.md` — test command

## Validation

- `node --check app.js` — passed
- `git diff --check` — passed
- Chromium smoke harness — passed (`data-smoke="pass"`)
- Smoke coverage includes launch, plunger charge/release, both flippers, nudge expiry, pause/resume, help/mute toggles, drain, and respawn.

## Known limitations entering Stage 3

- Table geometry is still a procedural approximation rather than a pixel-accurate reconstruction.
- Target banks, ramps, wormhole/rocket behavior, missions, and rank progression are not implemented yet.
- Audio is not implemented yet; Stage 5 will add procedural Web Audio effects.
