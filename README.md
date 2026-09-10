# 3D Pinball — Space Cadet (HTML5)

A from-scratch, browser-playable homage to the classic Windows Space Cadet table. It uses a Canvas 2D renderer, fixed-step physics, procedural table art, and synthesized Web Audio effects so it runs offline with no external assets.

## Run

Open `index.html` in a current desktop browser. If a browser blocks local files, serve the folder with any static server, for example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## Controls

- **Z / Left Shift:** left flipper
- **/ / Right Shift:** right flipper
- **Hold Space, release Space:** charge and launch the plunger
- **A/D or Left/Right arrows:** nudge
- **Enter:** new game
- **P:** pause
- **H:** help overlay
- **M:** mute/unmute synthesized sound

This is an independent, from-scratch fan recreation. It does not include Microsoft binaries, original sprites, or original audio files.
