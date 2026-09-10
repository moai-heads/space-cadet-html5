# Stage 1 — Reference pass (complete)

**Target:** a from-scratch HTML5 recreation inspired by the Windows 3D Pinball — Space Cadet experience.

## References collected

- Gameplay reference supplied in chat: `https://www.youtube.com/watch?v=lHQ8c8i42VE`
- Reverse-engineering/reference project: `k4zmu2a/SpaceCadetPinball` (cloned locally under `reference/upstream-port`; used only as a technical reference).
- The reference project includes two 1920×1200 screenshots under `reference/upstream-port/Screenshots/`.
- Its checked-in DAT notes identify the original logical table size as **600×416**, and enumerate the original resource categories: plunger, left/right flippers, bumpers, yellow/red targets, drain, gates, kickers, rollovers, ramps, ramp holes, lights, fuel bargraph, mission text, and score/ball/player text.

## Visual target

- Landscape Windows-era presentation: dark blue/black chrome frame, compact portrait table projection on the left, score/status strip on the right.
- Blue/teal space-table surface with warm yellow/orange highlights and red/blue bumper lamps.
- Bright metallic rails, beveled components, small bitmap-like labels, and a slightly compressed 3D perspective.
- Low-resolution arcade readability rather than modern photorealism; add subtle scanlines/glow without making text hard to read.
- Preserve the recognizable table vocabulary: top bumper cluster, central target/lane area, side ramps/rails, launch lane, slingshots, and two lower flippers.

## Gameplay target

- Immediate keyboard play with a charged plunger, deterministic fixed-step ball motion, flipper timing, wall/bumper bounces, nudge, drain, ball count, scoring, lights, and rank/mission feedback.
- Sound should be short, mechanical, and synthesized in-browser; do not redistribute original game audio or Microsoft assets.

## Implementation decisions from this pass

- Use a Canvas 2D renderer with the original 600×416 logical screen coordinate system, then scale responsively to the browser viewport.
- Keep the right-side scoreboard separate from the table clip so it resembles the original desktop layout.
- Draw the table and components procedurally in JavaScript; no external runtime dependencies.
- Store reference material and notes outside the final runtime bundle unless explicitly needed.

## Stage 3.1 geometry map (complete)

The source port exposes the original `camera_info` matrix and recenters the
playfield at `(183, 238)` in the 600×416 view. The HTML5 implementation now
uses that same projection for the table bounds, plunger anchor, flipper control
points, shooter rail, and all seven `a_bump1`–`a_bump7` bumper anchors. The
source table rectangle is `[-8, 8] × [-14, 15]`; its projected lower corners
continue below the 416px viewport, matching the clipped portrait table bitmap.

The score strip remains outside the 365px table clip on the right, matching the
source resource positions for `score1`, `player_number1`, and `ballcount1`.

## Next stage

Implement active target banks, rollovers, lane guides, gates, kickers, and
slingshot rule objects on top of the shared reference map.
