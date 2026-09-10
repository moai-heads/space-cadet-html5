# Stage 1 — Reference pass (complete)

**Target:** a from-scratch HTML5 recreation inspired by the Windows 3D Pinball — Space Cadet experience.

## References collected

- Gameplay reference supplied in chat: `https://www.youtube.com/watch?v=lHQ8c8i42VE`
- Reverse-engineering/reference project: `k4zmu2a/SpaceCadetPinball` (cloned locally under `reference/upstream-port`; used only as a technical reference).
- The reference project includes two 1920×1200 screenshots under `reference/upstream-port/Screenshots/`.
- Its checked-in DAT notes identify the original logical table size as **600×416**, and enumerate the original resource categories: plunger, left/right flippers, bumpers, yellow/red targets, drain, gates, kickers, rollovers, ramps, ramp holes, lights, fuel bargraph, mission text, and score/ball/player text.

## Visual target

- Landscape Windows-era presentation: dark blue/black chrome frame, score/status panel on the left, compact table on the right.
- Blue/teal space-table surface with warm yellow/orange highlights and red/blue bumper lamps.
- Bright metallic rails, beveled components, small bitmap-like labels, and a slightly compressed 3D perspective.
- Low-resolution arcade readability rather than modern photorealism; add subtle scanlines/glow without making text hard to read.
- Preserve the recognizable table vocabulary: top bumper cluster, central target/lane area, side ramps/rails, launch lane, slingshots, and two lower flippers.

## Gameplay target

- Immediate keyboard play with a charged plunger, deterministic fixed-step ball motion, flipper timing, wall/bumper bounces, nudge, drain, ball count, scoring, lights, and rank/mission feedback.
- Sound should be short, mechanical, and synthesized in-browser; do not redistribute original game audio or Microsoft assets.

## Implementation decisions from this pass

- Use a Canvas 2D renderer with a logical 600×416 table coordinate system, then scale responsively to the browser viewport.
- Keep the scoreboard separate from the playfield so it resembles the original desktop layout.
- Draw the table and components procedurally in JavaScript; no external runtime dependencies.
- Store reference material and notes outside the final runtime bundle unless explicitly needed.

## Next stage

Implement the playable core: game state, fixed-step physics, collision primitives, flippers, plunger, drain/respawn, keyboard/touch input, and a minimal score loop. 
