# GitHub Pages deployment

The playable build is published from the `gh-pages` branch at:

**https://moai-heads.github.io/space-cadet-html5/**

The Pages source is the branch root. The published branch is deliberately kept
small: it contains the game entry point, runtime, and this deployment marker;
the development smoke tests and project history remain on `main`.


## Verification

- Pages API status: `built`
- HTTPS document: HTTP 200
- HTTPS runtime: HTTP 200
- Chromium public-page smoke check: passed; rendered screenshot was non-black
- Published commit: `078edb5`
- Verification date: September 13, 2026
- Local regression: 28/28 passed
- Public runtime SHA-256: matches local `app.js` (`281c965780e02c0c5d96e6336c1f355e999505ea3a3f4dd4958be306fa506125`)
- Public Chromium check: 60 FPS over 2 seconds at 1200×832; shooter exit and upper-deck bumper contact verified
