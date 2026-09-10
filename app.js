/*
 * 3D Pinball — Space Cadet (HTML5)
 * Stages 2.1–2.10: canvas boot, fixed loop, input, physics, collisions,
 * flippers, game state, plunger lane, drain/respawn, and scoring hooks. Later
 * stages add table rules and audio.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('Canvas #game was not found');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context is unavailable');
  const scriptUrl = document.currentScript ? new URL(document.currentScript.src, window.location.href) : null;
  const testMode = new URLSearchParams(window.location.search).has('test')
    || Boolean(scriptUrl && scriptUrl.searchParams.has('test'));

  const DESIGN_W = 1100;
  const DESIGN_H = 760;
  const board = { x: 330, y: 24, w: 520, h: 712 };
  const playfield = { x: 26, y: 18, w: 468, h: 676 };
  let cssScale = 1;

  // Stage 2.2: simulation time is independent of display refresh rate.
  const FIXED_DT = 1 / 120;
  let accumulator = 0;
  let lastFrameTime = null;
  let simTime = 0;
  let simTicks = 0;
  let renderFrames = 0;

  // Stage 2.3: one normalized input layer for keyboard, mouse, and touch.
  // Gameplay systems consume these flags/events in later stages.
  const input = {
    left: false,
    right: false,
    plunger: false,
    nudgeX: 0,
    nudgeUntil: 0,
    muted: false,
    help: false,
    paused: false,
    pointerAction: null,
    lastAction: 'READY',
    lastActionAt: 0,
  };

  // Stage 2.6: explicit game lifecycle. Stage 2.9 consumes this state for
  // ball drains and the transition to game over.
  const game = {
    state: 'ready', // ready -> playing -> paused/gameover
    score: 0,
    balls: 3,
    player: 1,
    stateTime: 0,
    highScore: 0,
    lastMessage: 'PRESS SPACE OR ENTER',
  };

  function readHighScore() {
    try {
      return Math.max(0, Number.parseInt(localStorage.getItem('space-cadet-high-score') || '0', 10) || 0);
    } catch (_) {
      return 0;
    }
  }

  function writeHighScore() {
    try { localStorage.setItem('space-cadet-high-score', String(game.highScore)); } catch (_) { /* offline/private mode */ }
  }

  function formatScore(value) {
    return String(Math.max(0, Math.floor(value))).padStart(9, '0').slice(-9);
  }

  function setGameState(state, message) {
    game.state = state;
    game.stateTime = 0;
    game.lastMessage = message;
    input.paused = state === 'paused';
  }

  function beginGame() {
    if (game.state === 'playing' || game.state === 'paused') return;
    if (game.state === 'gameover') startNewGame();
    setGameState('playing', 'HOLD SPACE TO LAUNCH');
    armPlunger();
    markAction('GAME START');
  }

  function startNewGame() {
    game.score = 0;
    game.balls = 3;
    game.player = 1;
    drain.cooldown = 0;
    drain.flash = 0;
    scoring.hits = 0;
    scoring.totalPoints = 0;
    scoring.lastPoints = 0;
    scoring.lastLabel = 'NO SCORE YET';
    scoring.flash = 0;
    scoring.combo = 0;
    scoring.comboTimer = 0;
    scoring.popups.length = 0;
    setGameState('ready', 'PRESS SPACE OR ENTER');
    armPlunger();
    markAction('NEW GAME');
  }

  function pauseOrResume() {
    if (game.state === 'playing') {
      setGameState('paused', 'PRESS P TO RESUME');
      markAction('PAUSE ON');
    } else if (game.state === 'paused') {
      setGameState('playing', 'BALL IN PLAY');
      markAction('PAUSE OFF');
    }
  }

  function finishGame() {
    if (game.score > game.highScore) {
      game.highScore = game.score;
      writeHighScore();
    }
    ball.active = false;
    setGameState('gameover', 'PRESS ENTER TO RESTART');
    markAction('GAME OVER');
  }

  function addScore(points) {
    game.score = Math.max(0, game.score + points);
    if (game.score > game.highScore) {
      game.highScore = game.score;
      writeHighScore();
    }
  }

  game.highScore = readHighScore();

  function markAction(label) {
    input.lastAction = label;
    input.lastActionAt = performance.now();
  }

  function setButton(action, pressed, source = 'KEY') {
    if (action !== 'left' && action !== 'right' && action !== 'plunger') return;
    const wasPressed = input[action];
    input[action] = pressed;
    if (pressed) {
      if (action === 'plunger' && game.state === 'ready') beginGame();
      markAction(`${source} ${action.toUpperCase()}`);
    } else if (action === 'plunger' && wasPressed) {
      launchBall();
    }
  }

  function keyAction(code) {
    if (code === 'KeyZ' || code === 'ShiftLeft') return 'left';
    if (code === 'Slash' || code === 'ShiftRight') return 'right';
    if (code === 'Space') return 'plunger';
    return null;
  }

  function onKeyDown(event) {
    const action = keyAction(event.code);
    if (action || ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyP', 'KeyH', 'KeyM', 'Enter'].includes(event.code)) {
      event.preventDefault();
    }

    if (action) {
      setButton(action, true);
      return;
    }
    if (event.repeat) return;

    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
      input.nudgeX = -1;
      input.nudgeUntil = simTime + 0.12;
      markAction('NUDGE LEFT');
    } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      input.nudgeX = 1;
      input.nudgeUntil = simTime + 0.12;
      markAction('NUDGE RIGHT');
    } else if (event.code === 'KeyP') {
      pauseOrResume();
    } else if (event.code === 'KeyH') {
      input.help = !input.help;
      markAction(input.help ? 'HELP ON' : 'HELP OFF');
    } else if (event.code === 'KeyM') {
      input.muted = !input.muted;
      markAction(input.muted ? 'MUTE ON' : 'MUTE OFF');
    } else if (event.code === 'Enter') {
      if (game.state === 'gameover') startNewGame();
      else beginGame();
    }
  }

  function onKeyUp(event) {
    const action = keyAction(event.code);
    if (action) setButton(action, false);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * DESIGN_W / rect.width,
      y: (event.clientY - rect.top) * DESIGN_H / rect.height,
    };
  }

  function pointerActionAt(x, y) {
    const insideBoard = x >= board.x && x <= board.x + board.w && y >= board.y && y <= board.y + board.h;
    if (!insideBoard || y < board.y + board.h - 155) return null;
    const rel = (x - board.x) / board.w;
    if (rel < 0.40) return 'left';
    if (rel > 0.60 && rel < 0.88) return 'right';
    if (rel >= 0.88) return 'plunger';
    return null;
  }

  function onPointerDown(event) {
    event.preventDefault();
    const pos = pointerPosition(event);
    const action = pointerActionAt(pos.x, pos.y);
    if (!action) return;
    input.pointerAction = action;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    setButton(action, true, 'TOUCH');
  }

  function releasePointerAction(event) {
    event.preventDefault();
    if (input.pointerAction) setButton(input.pointerAction, false, 'TOUCH');
    input.pointerAction = null;
  }

  // Stage 2.4: physically meaningful ball state. Coordinates are in the
  // rendered playfield's local design pixels; table collision geometry will
  // consume the same space in the next stages.
  const ballPhysics = {
    width: playfield.w,
    height: playfield.h,
    gravity: 920,
    airDrag: 0.12,
    maxSpeed: 980,
    radius: 9,
  };
  const ballSpawn = {
    // The right-side shooter lane is the original table's natural starting point.
    x: 427,
    y: 630,
  };
  const ball = {
    x: ballSpawn.x,
    y: ballSpawn.y,
    previousX: ballSpawn.x,
    previousY: ballSpawn.y,
    vx: -140,
    vy: -720,
    radius: ballPhysics.radius,
    active: true,
    age: 0,
    resets: 0,
    trail: [],
  };

  // Stage 2.8: shooter lane and spring plunger. Holding Space compresses
  // the spring; releasing it converts charge into launch velocity.
  const plunger = {
    armed: true,
    charge: 0,
    chargeRate: 1.45,
    launchMin: 590,
    launchMax: 930,
    laneX: 427,
    laneBottom: 630,
    laneTop: 116,
    lastLaunchSpeed: 0,
  };

  // Stage 2.9: the open lower apron is a real drain rather than a safety
  // reset. A short service interval makes the lost-ball transition readable
  // and gives the next ball a predictable plunger-ready moment.
  const drain = {
    y: 674,
    minX: 88,
    maxX: 440,
    cooldown: 0,
    serviceTime: 0.78,
    flash: 0,
    total: 0,
    lastReason: '',
  };

  // Stage 2.10: score events are centralized so table objects can award
  // points without coupling gameplay rules to the renderer.
  const scoring = {
    hits: 0,
    totalPoints: 0,
    lastPoints: 0,
    lastLabel: 'NO SCORE YET',
    flash: 0,
    combo: 0,
    comboTimer: 0,
    popups: [],
  };

  function armPlunger() {
    plunger.armed = true;
    plunger.charge = 0;
    plunger.lastLaunchSpeed = 0;
    resetBallMotion(false);
  }

  function ballHasEnteredDrain() {
    return ball.y - ball.radius > drain.y
      && ball.x > drain.minX - ball.radius
      && ball.x < drain.maxX + ball.radius;
  }

  function drainBall(reason = 'OPEN DRAIN') {
    if (!ball.active || game.state !== 'playing' || drain.cooldown > 0) return false;

    ball.active = false;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail.length = 0;
    drain.cooldown = drain.serviceTime;
    drain.flash = 1;
    drain.total += 1;
    drain.lastReason = reason;
    game.balls = Math.max(0, game.balls - 1);

    if (game.balls === 0) {
      finishGame();
    } else {
      game.lastMessage = 'BALL DRAINED — NEXT BALL';
      markAction(`DRAIN / ${game.balls} LEFT`);
    }
    return true;
  }

  function updateDrain(dt) {
    drain.flash = Math.max(0, drain.flash - dt * 3.4);
    if (game.state !== 'playing' || input.paused || drain.cooldown <= 0) return;

    drain.cooldown = Math.max(0, drain.cooldown - dt);
    if (drain.cooldown === 0 && game.balls > 0) {
      armPlunger();
      game.lastMessage = 'HOLD SPACE TO LAUNCH';
      markAction('NEXT BALL READY');
    }
  }

  function launchBall() {
    if (!plunger.armed || game.state !== 'playing') return;
    const charge = Math.max(0, Math.min(1, plunger.charge));
    const launchSpeed = plunger.launchMin + (plunger.launchMax - plunger.launchMin) * charge;
    plunger.lastLaunchSpeed = Math.round(launchSpeed);
    plunger.armed = false;
    plunger.charge = 0;
    ball.active = true;
    ball.x = plunger.laneX;
    ball.y = plunger.laneBottom - 2;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    // A small leftward bias lets the ball leave the shooter when it reaches the lane exit.
    ball.vx = -42;
    ball.vy = -launchSpeed;
    ball.age = 0;
    ball.trail.length = 0;
    markAction(`LAUNCH ${plunger.lastLaunchSpeed}`);
  }

  function updatePlunger(dt) {
    if (!plunger.armed || game.state !== 'playing' || input.paused) return;
    if (input.plunger) {
      plunger.charge = Math.min(1, plunger.charge + plunger.chargeRate * dt);
      ball.active = false;
      ball.x = plunger.laneX;
      ball.y = plunger.laneBottom + plunger.charge * 4;
      ball.previousX = ball.x;
      ball.previousY = ball.y;
      ball.vx = 0;
      ball.vy = 0;
    }
  }

  function resetBallMotion(activate = true) {
    ball.x = ballSpawn.x;
    ball.y = ballSpawn.y;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.vx = activate ? -140 : 0;
    ball.vy = activate ? -720 : 0;
    ball.age = 0;
    ball.active = activate;
    ball.resets += 1;
    ball.trail.length = 0;
    markAction('BALL RESET');
  }

  function limitBallSpeed() {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed <= ballPhysics.maxSpeed) return;
    const scale = ballPhysics.maxSpeed / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }

  function simulateBall(dt) {
    if (!ball.active || input.paused || game.state !== 'playing') return;

    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.age += dt;

    // Exponential drag keeps behavior stable if FIXED_DT changes later.
    const drag = Math.exp(-ballPhysics.airDrag * dt);
    ball.vx *= drag;
    ball.vy *= drag;
    ball.vy += ballPhysics.gravity * dt;

    // Nudge is deliberately gentle here; table-specific nudge rules come later.
    if (input.nudgeX !== 0) ball.vx += input.nudgeX * 10;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    collideBallWithWalls();
    collideBallWithBumpers();
    collideBallWithFlippers();
    limitBallSpeed();

    ball.trail.push({ x: ball.x, y: ball.y, life: 1 });
    if (ball.trail.length > 10) ball.trail.shift();
    for (const point of ball.trail) point.life *= 0.90;

    // Stage 2.9: crossing the open apron consumes a ball. Keep a separate
    // safety reset only for impossible horizontal escapes during development.
    if (ballHasEnteredDrain()) {
      drainBall();
      return;
    }
    const margin = 42;
    if (ball.y > ballPhysics.height + margin) {
      drainBall('SAFETY DRAIN');
    } else if (ball.x < -margin || ball.x > ballPhysics.width + margin) {
      resetBallMotion();
    }
  }

  // Stage 2.5: reusable segment collision primitives and a first-pass
  // perimeter matching the visible rails. The open bottom is intentional: it
  // becomes the drain in the later life/game-state stage.
  const walls = [
    { a: { x: 62, y: 14 }, b: { x: 398, y: 14 }, restitution: 0.92 },
    { a: { x: 62, y: 14 }, b: { x: 30, y: 210 }, restitution: 0.91 },
    { a: { x: 30, y: 210 }, b: { x: 34, y: 480 }, restitution: 0.91 },
    { a: { x: 34, y: 480 }, b: { x: 110, y: 652 }, restitution: 0.89 },
    { a: { x: 398, y: 14 }, b: { x: 436, y: 170 }, restitution: 0.91 },
    { a: { x: 436, y: 170 }, b: { x: 438, y: 652 }, restitution: 0.91 },
    { a: { x: 418, y: 614 }, b: { x: 418, y: 116 }, restitution: 0.88 },
  ];

  const bumpers = [
    { id: 'red', x: 142, y: 130, radius: 25, restitution: 1.04, kick: 145, points: 100, core: '#db4352', ring: '#f0a840', flash: 0, hitCooldown: 0, hits: 0 },
    { id: 'gold', x: 234, y: 108, radius: 25, restitution: 1.04, kick: 155, points: 100, core: '#e3be41', ring: '#f3df8d', flash: 0, hitCooldown: 0, hits: 0 },
    { id: 'blue', x: 326, y: 130, radius: 25, restitution: 1.04, kick: 145, points: 100, core: '#4baed2', ring: '#a3e7ec', flash: 0, hitCooldown: 0, hits: 0 },
  ];

  const collisionState = {
    wallHits: 0,
    flipperHits: 0,
    bumperHits: 0,
    impacts: [],
  };

  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    return { x: ax + dx * t, y: ay + dy * t, t };
  }

  function awardScore(points, label, x = ball.x, y = ball.y) {
    if (game.state !== 'playing') return;
    const value = Math.max(0, Math.floor(points));
    addScore(value);
    scoring.hits += 1;
    scoring.totalPoints += value;
    scoring.lastPoints = value;
    scoring.lastLabel = `${label} +${value}`;
    scoring.flash = 1;
    scoring.combo = scoring.comboTimer > 0 ? scoring.combo + 1 : 1;
    scoring.comboTimer = 1.5;
    scoring.popups.push({ x, y, points: value, life: 1 });
    if (scoring.popups.length > 12) scoring.popups.shift();
    markAction(`${label} +${value}`);
  }

  function recordWallImpact(x, y, nx, ny) {
    collisionState.wallHits += 1;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'wall' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(10, 'RAIL', x, y);
  }

  function collideBallWithSegment(segment) {
    const nearest = closestPointOnSegment(ball.x, ball.y,
      segment.a.x, segment.a.y, segment.b.x, segment.b.y);
    let nx = ball.x - nearest.x;
    let ny = ball.y - nearest.y;
    let distance = Math.hypot(nx, ny);

    if (distance < 0.0001) {
      const sx = segment.b.x - segment.a.x;
      const sy = segment.b.y - segment.a.y;
      const length = Math.hypot(sx, sy) || 1;
      nx = -sy / length;
      ny = sx / length;
      if (ball.vx * nx + ball.vy * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      distance = 0;
    } else {
      nx /= distance;
      ny /= distance;
    }

    const penetration = ball.radius - distance;
    if (penetration <= 0) return false;

    // Positional correction prevents the ball from sinking into a rail.
    ball.x += nx * (penetration + 0.05);
    ball.y += ny * (penetration + 0.05);

    const normalVelocity = ball.vx * nx + ball.vy * ny;
    if (normalVelocity < 0) {
      ball.vx -= (1 + segment.restitution) * normalVelocity * nx;
      ball.vy -= (1 + segment.restitution) * normalVelocity * ny;
      // A small tangential loss gives rails a physical feel without killing speed.
      const tangentX = -ny;
      const tangentY = nx;
      const tangentVelocity = ball.vx * tangentX + ball.vy * tangentY;
      ball.vx -= tangentVelocity * 0.018 * tangentX;
      ball.vy -= tangentVelocity * 0.018 * tangentY;
      limitBallSpeed();
      recordWallImpact(nearest.x, nearest.y, nx, ny);
    }
    return true;
  }

  function collideBallWithWalls() {
    // Two passes handle corners where a ball overlaps two rails in one tick.
    let collided = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const wall of walls) collided = collideBallWithSegment(wall) || collided;
    }
    return collided;
  }

  function recordBumperImpact(x, y, nx, ny, bumper) {
    collisionState.bumperHits += 1;
    bumper.hits += 1;
    bumper.flash = 1;
    bumper.hitCooldown = 0.085;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'bumper' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(bumper.points, 'BUMPER', x, y);
  }

  function collideBallWithBumper(bumper) {
    const dx = ball.x - bumper.x;
    const dy = ball.y - bumper.y;
    const hitRadius = ball.radius + bumper.radius;
    let distance = Math.hypot(dx, dy);
    let nx = distance > 0.0001 ? dx / distance : 0;
    let ny = distance > 0.0001 ? dy / distance : 1;
    if (distance < 0.0001) distance = 0;

    const penetration = hitRadius - distance;
    if (penetration <= 0) return false;

    ball.x += nx * (penetration + 0.08);
    ball.y += ny * (penetration + 0.08);
    const normalVelocity = ball.vx * nx + ball.vy * ny;
    const freshHit = bumper.hitCooldown <= 0;

    if (normalVelocity < 0 || freshHit) {
      if (normalVelocity < 0) {
        ball.vx -= (1 + bumper.restitution) * normalVelocity * nx;
        ball.vy -= (1 + bumper.restitution) * normalVelocity * ny;
      }
      ball.vx += nx * bumper.kick;
      ball.vy += ny * bumper.kick;
      limitBallSpeed();
      if (freshHit) recordBumperImpact(bumper.x + nx * bumper.radius, bumper.y + ny * bumper.radius, nx, ny, bumper);
      return true;
    }
    return false;
  }

  function collideBallWithBumpers() {
    let collided = false;
    for (const bumper of bumpers) collided = collideBallWithBumper(bumper) || collided;
    return collided;
  }

  // Stage 2.7: articulated flippers with finite travel, angular velocity,
  // capsule collision, and a small moving-bat impulse.
  const flippers = {
    left: {
      side: 'left', pivot: { x: 195, y: 632 }, length: 100, radius: 9,
      restAngle: -2.76, activeAngle: -0.38, angle: -2.76,
      previousAngle: -2.76, angularVelocity: 0, pressed: false,
      flash: 0, hitCooldown: 0,
    },
    right: {
      side: 'right', pivot: { x: 273, y: 632 }, length: 100, radius: 9,
      restAngle: -0.38, activeAngle: -2.76, angle: -0.38,
      previousAngle: -0.38, angularVelocity: 0, pressed: false,
      flash: 0, hitCooldown: 0,
    },
  };

  function approach(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
  }

  function flipperEndpoints(flipper) {
    return {
      a: { x: flipper.pivot.x, y: flipper.pivot.y },
      b: {
        x: flipper.pivot.x + Math.cos(flipper.angle) * flipper.length,
        y: flipper.pivot.y + Math.sin(flipper.angle) * flipper.length,
      },
    };
  }

  function updateFlipper(flipper, pressed, dt) {
    flipper.pressed = pressed;
    flipper.previousAngle = flipper.angle;
    const target = pressed ? flipper.activeAngle : flipper.restAngle;
    const travelSpeed = pressed ? 25 : 11;
    flipper.angle = approach(flipper.angle, target, travelSpeed * dt);
    flipper.angularVelocity = (flipper.angle - flipper.previousAngle) / dt;
    flipper.flash = Math.max(0, flipper.flash - dt * 5);
    flipper.hitCooldown = Math.max(0, flipper.hitCooldown - dt);
  }

  function recordFlipperImpact(x, y, nx, ny, flipper) {
    collisionState.flipperHits += 1;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, flipper: flipper.side, kind: 'flipper' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    flipper.flash = 1;
    flipper.hitCooldown = 0.055;
    awardScore(25, 'FLIPPER', x, y);
  }

  function collideBallWithFlipper(flipper) {
    const ends = flipperEndpoints(flipper);
    const nearest = closestPointOnSegment(ball.x, ball.y, ends.a.x, ends.a.y, ends.b.x, ends.b.y);
    let nx = ball.x - nearest.x;
    let ny = ball.y - nearest.y;
    let distance = Math.hypot(nx, ny);
    const hitRadius = ball.radius + flipper.radius;

    if (distance < 0.0001) {
      const sx = ends.b.x - ends.a.x;
      const sy = ends.b.y - ends.a.y;
      const length = Math.hypot(sx, sy) || 1;
      nx = -sy / length;
      ny = sx / length;
      if (ball.vx * nx + ball.vy * ny > 0) { nx = -nx; ny = -ny; }
      distance = 0;
    } else {
      nx /= distance;
      ny /= distance;
    }

    const penetration = hitRadius - distance;
    if (penetration <= 0) return false;

    ball.x += nx * (penetration + 0.08);
    ball.y += ny * (penetration + 0.08);

    const rx = nearest.x - flipper.pivot.x;
    const ry = nearest.y - flipper.pivot.y;
    const surfaceVx = -flipper.angularVelocity * ry;
    const surfaceVy = flipper.angularVelocity * rx;
    const relativeVx = ball.vx - surfaceVx;
    const relativeVy = ball.vy - surfaceVy;
    const normalVelocity = relativeVx * nx + relativeVy * ny;

    if (normalVelocity < 0 && flipper.hitCooldown <= 0) {
      const restitution = flipper.pressed ? 1.03 : 0.90;
      ball.vx = relativeVx - (1 + restitution) * normalVelocity * nx + surfaceVx;
      ball.vy = relativeVy - (1 + restitution) * normalVelocity * ny + surfaceVy;
      const kick = flipper.pressed ? 115 : 18;
      ball.vx += nx * kick;
      ball.vy += ny * kick;
      limitBallSpeed();
      recordFlipperImpact(nearest.x, nearest.y, nx, ny, flipper);
      return true;
    }
    return false;
  }

  function collideBallWithFlippers() {
    // Resolve the active bat first so a simultaneous contact favors player input.
    const ordered = flippers.left.pressed && !flippers.right.pressed
      ? [flippers.left, flippers.right]
      : (flippers.right.pressed && !flippers.left.pressed
        ? [flippers.right, flippers.left]
        : [flippers.left, flippers.right]);
    let collided = false;
    for (const flipper of ordered) collided = collideBallWithFlipper(flipper) || collided;
    return collided;
  }

  function drawFlipperGraphic(flipper, inner) {
    const ends = flipperEndpoints(flipper);
    const hot = flipper.pressed || flipper.flash > 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = hot ? '#ffe478' : 'transparent';
    ctx.shadowBlur = hot ? 17 : 0;
    ctx.strokeStyle = '#e9edf0';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(inner.x + ends.a.x, inner.y + ends.a.y);
    ctx.lineTo(inner.x + ends.b.x, inner.y + ends.b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hot ? '#f1c84e' : '#39a4bd';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(inner.x + ends.a.x, inner.y + ends.a.y);
    ctx.lineTo(inner.x + ends.b.x, inner.y + ends.b.y);
    ctx.stroke();
    ctx.fillStyle = '#dfecef';
    ctx.beginPath();
    ctx.arc(inner.x + flipper.pivot.x, inner.y + flipper.pivot.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hot ? '#f1c84e' : '#4a9bb2';
    ctx.beginPath();
    ctx.arc(inner.x + flipper.pivot.x, inner.y + flipper.pivot.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const stars = Array.from({ length: 85 }, (_, i) => ({
    x: (i * 83.17) % DESIGN_W,
    y: (i * 47.91) % DESIGN_H,
    r: i % 9 === 0 ? 1.6 : (i % 3 === 0 ? 1 : 0.55),
    a: 0.25 + ((i * 17) % 70) / 100,
  }));

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    cssScale = Math.min(rect.width / DESIGN_W, rect.height / DESIGN_H) || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(DESIGN_W * dpr);
    canvas.height = Math.round(DESIGN_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundedRect(x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + q, y);
    ctx.arcTo(x + w, y, x + w, y + h, q);
    ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q);
    ctx.arcTo(x, y, x + w, y, q);
    ctx.closePath();
  }

  function text(value, x, y, size, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px ${size <= 15 ? 'Consolas, monospace' : 'Arial Black, Arial, sans-serif'}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  function drawBumperGraphic(bumper, inner) {
    const pulse = bumper.flash;
    const radius = bumper.radius + pulse * 3;
    glowCircle(inner.x + bumper.x, inner.y + bumper.y, radius, bumper.core, bumper.ring);
    ctx.save();
    ctx.strokeStyle = pulse > 0 ? '#fff4a8' : 'rgba(226,246,239,.72)';
    ctx.lineWidth = pulse > 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(inner.x + bumper.x, inner.y + bumper.y, radius + 8 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function glowCircle(x, y, r, core, ring) {
    ctx.save();
    ctx.shadowColor = core;
    ctx.shadowBlur = 14;
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(x - r * .3, y - r * .35, 1, x, y, r);
    g.addColorStop(0, '#fffbd0');
    g.addColorStop(.25, core);
    g.addColorStop(1, '#15233b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d2ecff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawBackdrop(t) {
    const bg = ctx.createRadialGradient(560, 280, 40, 560, 340, 720);
    bg.addColorStop(0, '#0a2e4a');
    bg.addColorStop(.45, '#061525');
    bg.addColorStop(1, '#010308');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    for (const star of stars) {
      const pulse = 0.84 + 0.16 * Math.sin(t * 0.0015 + star.x);
      ctx.globalAlpha = star.a * pulse;
      ctx.fillStyle = '#a9dcff';
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }
    ctx.globalAlpha = 1;

    const haze = ctx.createRadialGradient(780, 220, 10, 780, 220, 250);
    haze.addColorStop(0, 'rgba(25,143,196,.18)');
    haze.addColorStop(1, 'rgba(25,143,196,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  function drawScorePanel() {
    const p = { x: 24, y: 24, w: 272, h: 712 };
    const panel = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    panel.addColorStop(0, '#071d31');
    panel.addColorStop(.52, '#020b17');
    panel.addColorStop(1, '#0a1726');
    ctx.fillStyle = panel;
    roundedRect(p.x, p.y, p.w, p.h, 6);
    ctx.fill();
    ctx.strokeStyle = '#2e779c';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(117,205,237,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 10, p.y + 10, p.w - 20, p.h - 20);

    text('3D PINBALL', p.x + p.w / 2, p.y + 42, 25, '#e8c75b', 'center');
    text('SPACE CADET', p.x + p.w / 2, p.y + 72, 20, '#84dfec', 'center');
    ctx.fillStyle = '#3a7890';
    ctx.fillRect(p.x + 25, p.y + 91, p.w - 50, 2);

    text('PLAYER 1', p.x + 30, p.y + 132, 13, '#75a7c4');
    text(formatScore(game.score), p.x + p.w - 28, p.y + 164, 31, '#f5d66c', 'right', 900);
    text('HIGH SCORE', p.x + 30, p.y + 212, 13, '#75a7c4');
    text(formatScore(game.highScore), p.x + p.w - 28, p.y + 244, 26, '#d6b85f', 'right', 900);

    text('RANK', p.x + 30, p.y + 302, 13, '#75a7c4');
    text(game.state.toUpperCase(), p.x + p.w - 28, p.y + 302, 12, game.state === 'playing' ? '#8fe7f0' : '#f2cd70', 'right');
    text('MISSION STATUS', p.x + 30, p.y + 344, 13, '#75a7c4');
    text(game.lastMessage, p.x + 30, p.y + 369, 12, '#f2cd5b');
    text(`LAST ${scoring.lastLabel}`, p.x + 30, p.y + 392, 10, scoring.flash > 0 ? '#f6d873' : '#628da2', 'left', 400);

    const lights = ['READY', 'LIGHT', 'RAMP', 'WORM'];
    lights.forEach((label, i) => {
      const yy = p.y + 414 + i * 30;
      ctx.fillStyle = i === 0 ? '#e5c658' : '#203c50';
      ctx.shadowColor = i === 0 ? '#ffe57b' : 'transparent';
      ctx.shadowBlur = i === 0 ? 8 : 0;
      ctx.beginPath();
      ctx.arc(p.x + 34, yy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      text(label, p.x + 52, yy, 12, i === 0 ? '#f3db79' : '#547f96');
    });

    text('BALL', p.x + 30, p.y + 560, 13, '#75a7c4');
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < game.balls ? '#f7e8ad' : '#1a3445';
      ctx.strokeStyle = '#83b7d3';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x + 39 + i * 29, p.y + 597, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const online = Math.sin(simTime * 8) > -0.6;
    ctx.fillStyle = online ? '#e7c75e' : '#315366';
    ctx.shadowColor = online ? '#ffe781' : 'transparent';
    ctx.shadowBlur = online ? 8 : 0;
    ctx.beginPath();
    ctx.arc(p.x + 32, p.y + 665, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    text('STAGE 2.10 /  SCORING HOOKS', p.x + 43, p.y + 630, 11, '#6699b2', 'left', 400);
    const nextBall = drain.cooldown > 0 ? `${drain.cooldown.toFixed(1)}s` : (plunger.armed ? 'READY' : 'IN PLAY');
    text(`DRAIN ${String(drain.total).padStart(2, '0')}  NEXT ${nextBall}`,
      p.x + 30, p.y + 647, 9, '#5b8ca3', 'left', 400);

    const inputColor = (on) => on ? '#f4d86e' : '#4b7184';
    text(`L:${input.left ? 'ON' : '--'}  R:${input.right ? 'ON' : '--'}  P:${input.plunger ? 'ON' : '--'}`,
      p.x + 30, p.y + 667, 10, inputColor(input.left || input.right || input.plunger), 'left', 400);
    text(`LAST: ${input.lastAction}`, p.x + 30, p.y + 687, 9, '#527e94', 'left', 400);
  }

  function drawTable(t) {
    const bx = board.x;
    const by = board.y;
    const bw = board.w;
    const bh = board.h;
    const inner = { x: bx + playfield.x, y: by + playfield.y, w: playfield.w, h: playfield.h };

    // Outer cabinet / bevel.
    const cabinet = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    cabinet.addColorStop(0, '#7e9aac');
    cabinet.addColorStop(.06, '#1e4054');
    cabinet.addColorStop(.5, '#092033');
    cabinet.addColorStop(.94, '#1f4962');
    cabinet.addColorStop(1, '#9ab1bd');
    ctx.fillStyle = cabinet;
    roundedRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = '#0d1825';
    ctx.lineWidth = 4;
    ctx.stroke();

    const surface = ctx.createLinearGradient(inner.x, inner.y, inner.x + inner.w, inner.y + inner.h);
    surface.addColorStop(0, '#0f5967');
    surface.addColorStop(.25, '#0b3b50');
    surface.addColorStop(.75, '#08273d');
    surface.addColorStop(1, '#041523');
    ctx.fillStyle = surface;
    roundedRect(inner.x, inner.y, inner.w, inner.h, 4);
    ctx.fill();

    ctx.save();
    roundedRect(inner.x, inner.y, inner.w, inner.h, 4);
    ctx.clip();

    // Space dust inside the playfield.
    for (let i = 0; i < 35; i++) {
      const sx = inner.x + ((i * 71) % inner.w);
      const sy = inner.y + ((i * 113) % inner.h);
      ctx.globalAlpha = .15 + (i % 4) * .04;
      ctx.fillStyle = i % 3 === 0 ? '#80d4df' : '#8eb4ca';
      ctx.fillRect(sx, sy, i % 2 ? 1 : 2, i % 2 ? 1 : 2);
    }
    ctx.globalAlpha = 1;

    // A compact approximation of the Space Cadet table silhouette.
    ctx.strokeStyle = 'rgba(149,229,228,.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inner.x + 62, inner.y + 14);
    ctx.lineTo(inner.x + 30, inner.y + 210);
    ctx.lineTo(inner.x + 34, inner.y + 480);
    ctx.lineTo(inner.x + 110, inner.y + inner.h - 24);
    ctx.moveTo(inner.x + inner.w - 70, inner.y + 14);
    ctx.lineTo(inner.x + inner.w - 32, inner.y + 170);
    ctx.lineTo(inner.x + inner.w - 30, inner.y + inner.h - 24);
    ctx.stroke();

    // Upper logo and central lane.
    ctx.strokeStyle = '#f4c54e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(inner.x + 110, inner.y + 30);
    ctx.quadraticCurveTo(inner.x + 230, inner.y + 2, inner.x + 345, inner.y + 40);
    ctx.stroke();
    text('SPACE CADET', inner.x + inner.w / 2, inner.y + 30, 16, '#e3c45a', 'center');

    ctx.strokeStyle = 'rgba(99,197,214,.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(inner.x + inner.w / 2, inner.y + 52);
    ctx.lineTo(inner.x + inner.w / 2, inner.y + 188);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,197,75,.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inner.x + inner.w / 2 - 28, inner.y + 52);
    ctx.lineTo(inner.x + inner.w / 2 - 28, inner.y + 188);
    ctx.moveTo(inner.x + inner.w / 2 + 28, inner.y + 52);
    ctx.lineTo(inner.x + inner.w / 2 + 28, inner.y + 188);
    ctx.stroke();

    // Target bank.
    const targetY = inner.y + 260;
    ['S', 'P', 'A', 'C', 'E'].forEach((letter, i) => {
      const x = inner.x + 78 + i * 49;
      ctx.fillStyle = i === 0 ? '#e3bd52' : '#234b5d';
      ctx.strokeStyle = '#8ed8d9';
      ctx.lineWidth = 1.5;
      roundedRect(x - 15, targetY - 11, 30, 22, 3);
      ctx.fill();
      ctx.stroke();
      text(letter, x, targetY + 1, 13, i === 0 ? '#12263a' : '#74b9c5', 'center');
    });

    // Bumper cluster.
    for (const bumper of bumpers) drawBumperGraphic(bumper, inner);
    ctx.strokeStyle = 'rgba(255,245,182,.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(inner.x + 234, inner.y + 108, 36, 0, Math.PI * 2);
    ctx.stroke();

    // Left ramp and right launch lane.
    ctx.strokeStyle = '#a9c7cc';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(inner.x + 54, inner.y + 300);
    ctx.bezierCurveTo(inner.x + 14, inner.y + 230, inner.x + 74, inner.y + 90, inner.x + 178, inner.y + 70);
    ctx.stroke();
    ctx.strokeStyle = '#2e6174';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#c3dce0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inner.x + inner.w - 62, inner.y + 120);
    ctx.lineTo(inner.x + inner.w - 62, inner.y + inner.h - 54);
    ctx.stroke();
    ctx.strokeStyle = '#52879a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(inner.x + inner.w - 48, inner.y + 116);
    ctx.lineTo(inner.x + inner.w - 48, inner.y + inner.h - 52);
    ctx.stroke();
    text('LAUNCH', inner.x + inner.w - 55, inner.y + 88, 10, '#e5c15a', 'center');

    // Shooter plunger, spring, and charge indicator.
    const plungerX = inner.x + plunger.laneX;
    const plungerBaseY = inner.y + plunger.laneBottom + 18;
    const plungerHandleY = plungerBaseY + plunger.charge * 14;
    ctx.strokeStyle = '#b8d5db';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(plungerX, plungerBaseY);
    ctx.lineTo(plungerX, plungerHandleY);
    ctx.stroke();
    ctx.strokeStyle = plunger.armed && input.plunger ? '#f4cd5c' : '#4f8798';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const yy = plungerBaseY - i * 5 + plunger.charge * 10;
      const xx = plungerX + (i % 2 ? 5 : -5);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.fillStyle = plunger.armed && input.plunger ? '#f4cd5c' : '#547f8c';
    ctx.fillRect(plungerX - 8, plungerHandleY - 2, 16, 4);

    // Slingshots / lower playfield geometry.
    ctx.fillStyle = 'rgba(189,47,94,.48)';
    ctx.strokeStyle = '#d9779c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inner.x + 60, inner.y + 512);
    ctx.lineTo(inner.x + 178, inner.y + 560);
    ctx.lineTo(inner.x + 76, inner.y + 604);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(inner.x + inner.w - 85, inner.y + 512);
    ctx.lineTo(inner.x + inner.w - 203, inner.y + 560);
    ctx.lineTo(inner.x + inner.w - 96, inner.y + 604);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower lanes and flippers.
    const drainLeft = inner.x + drain.minX + 12;
    const drainRight = inner.x + drain.maxX - 12;
    const drainY = inner.y + drain.y;
    ctx.save();
    ctx.globalAlpha = 0.82 + drain.flash * 0.18;
    ctx.fillStyle = '#01070d';
    ctx.beginPath();
    ctx.moveTo(drainLeft, drainY - 4);
    ctx.lineTo(drainRight, drainY - 4);
    ctx.lineTo(drainRight - 15, drainY + 18);
    ctx.lineTo(drainLeft + 15, drainY + 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = drain.flash > 0 ? '#f2cf63' : '#456b7b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    text('DRAIN', (drainLeft + drainRight) / 2, drainY + 8, 9, drain.flash > 0 ? '#f2cf63' : '#6f98a6', 'center');
    ctx.restore();

    ctx.strokeStyle = '#d1dde0';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(inner.x + 157, inner.y + 616);
    ctx.lineTo(inner.x + 50, inner.y + 663);
    ctx.moveTo(inner.x + inner.w - 157, inner.y + 616);
    ctx.lineTo(inner.x + inner.w - 50, inner.y + 663);
    ctx.stroke();
    ctx.strokeStyle = '#563f88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(inner.x + 157, inner.y + 616);
    ctx.lineTo(inner.x + 50, inner.y + 663);
    ctx.moveTo(inner.x + inner.w - 157, inner.y + 616);
    ctx.lineTo(inner.x + inner.w - 50, inner.y + 663);
    ctx.stroke();

    // Articulated flippers are driven by the same state used by collision.
    drawFlipperGraphic(flippers.left, inner);
    drawFlipperGraphic(flippers.right, inner);

    // Brief electric sparks on rail contacts help verify collision placement.
    for (const impact of collisionState.impacts) {
      const ix = inner.x + impact.x;
      const iy = inner.y + impact.y;
      ctx.save();
      ctx.globalAlpha = Math.max(0, impact.life);
      ctx.strokeStyle = '#ffe88c';
      ctx.shadowColor = '#fff1a8';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ix + impact.nx * 8, iy + impact.ny * 8);
      ctx.moveTo(ix - impact.ny * 5, iy + impact.nx * 5);
      ctx.lineTo(ix + impact.ny * 5, iy - impact.nx * 5);
      ctx.stroke();
      ctx.restore();
    }

    // Score popups are intentionally small, like the original bitmap callouts.
    for (const popup of scoring.popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, popup.life);
      text(`+${popup.points}`, inner.x + popup.x, inner.y + popup.y, 12, '#ffe88c', 'center');
      ctx.restore();
    }

    // Dynamic ball + short motion trail (physics-stage diagnostic).
    const ballX = inner.x + ball.x;
    const ballY = inner.y + ball.y;
    for (let i = 0; i < ball.trail.length; i++) {
      const point = ball.trail[i];
      const alpha = (i + 1) / ball.trail.length * 0.18 * point.life;
      ctx.fillStyle = `rgba(190, 239, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(inner.x + point.x, inner.y + point.y, 3 + i * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowColor = '#e4f8ff';
    ctx.shadowBlur = 10;
    const ballGradient = ctx.createRadialGradient(ballX - 3, ballY - 4, 1, ballX, ballY, ball.radius);
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(.45, '#d7e6e8');
    ballGradient.addColorStop(1, '#657e88');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    // Rails and Stage 2.1 label.
    ctx.strokeStyle = '#bbd5dc';
    ctx.lineWidth = 3;
    roundedRect(inner.x, inner.y, inner.w, inner.h, 4);
    ctx.stroke();
    text('SCORING HOOKS / REFERENCE PASS', bx + bw / 2, by + bh - 8, 11, '#8dbbc7', 'center', 400);
  }

  function updateScoring(dt) {
    scoring.flash = Math.max(0, scoring.flash - dt * 3.8);
    scoring.comboTimer = Math.max(0, scoring.comboTimer - dt);
    if (scoring.comboTimer === 0) scoring.combo = 0;
    for (const popup of scoring.popups) {
      popup.life -= dt * 1.7;
      popup.y -= dt * 24;
    }
    scoring.popups = scoring.popups.filter(popup => popup.life > 0);
  }

  function updateBumpers(dt) {
    for (const bumper of bumpers) {
      bumper.flash = Math.max(0, bumper.flash - dt * 5.5);
      bumper.hitCooldown = Math.max(0, bumper.hitCooldown - dt);
    }
  }

  function drawDrainStatus() {
    if (game.state !== 'playing' || drain.cooldown <= 0) return;

    const x = board.x + 76;
    const y = board.y + board.h - 146;
    const w = board.w - 152;
    ctx.save();
    ctx.fillStyle = 'rgba(1, 8, 15, .72)';
    ctx.strokeStyle = '#c59d4f';
    ctx.lineWidth = 1;
    roundedRect(x, y, w, 36, 5);
    ctx.fill();
    ctx.stroke();
    text('BALL DRAINED', x + w / 2, y + 12, 10, '#f0d36b', 'center');
    text(`NEXT BALL IN ${drain.cooldown.toFixed(1)}s`, x + w / 2, y + 27, 9, '#8cb7c1', 'center', 400);
    ctx.restore();
  }

  function drawGameStateOverlay() {
    if (game.state === 'playing') return;

    const x = board.x + 52;
    const y = board.y + board.h * 0.43;
    const w = board.w - 104;
    const h = 112;
    ctx.save();
    ctx.fillStyle = 'rgba(2, 9, 18, .82)';
    ctx.shadowColor = game.state === 'gameover' ? '#e05c6b' : '#6dd8e1';
    ctx.shadowBlur = 18;
    roundedRect(x, y, w, h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = game.state === 'gameover' ? '#d46370' : '#76cad4';
    ctx.lineWidth = 2;
    ctx.stroke();

    const title = game.state === 'ready' ? 'SPACE CADET READY' :
      (game.state === 'paused' ? 'GAME PAUSED' : 'GAME OVER');
    const titleColor = game.state === 'gameover' ? '#f07a7e' : '#f2d36d';
    text(title, x + w / 2, y + 32, 20, titleColor, 'center');
    text(game.lastMessage, x + w / 2, y + 67, 12, '#9fd9e0', 'center', 400);
    text(`SCORE ${formatScore(game.score)}`, x + w / 2, y + 91, 10, '#648fa6', 'center', 400);
    ctx.restore();
  }

  function draw(t) {
    renderFrames += 1;
    ctx.save();
    // The backing canvas is drawn in logical pixels and CSS scales it responsively.
    ctx.setTransform(canvas.width / DESIGN_W, 0, 0, canvas.height / DESIGN_H, 0, 0);
    drawBackdrop(t);
    drawScorePanel();
    drawTable(t);
    drawDrainStatus();
    drawGameStateOverlay();

    // Very light CRT scanlines, kept below text contrast threshold.
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#b5eaff';
    for (let y = 0; y < DESIGN_H; y += 4) ctx.fillRect(0, y, DESIGN_W, 1);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function updateSimulation(dt) {
    // Fixed-step clock + first real simulated object.
    simTime += dt;
    simTicks += 1;
    if (game.state !== 'paused') game.stateTime += dt;
    updatePlunger(dt);
    updateDrain(dt);
    updateScoring(dt);
    updateBumpers(dt);
    updateFlipper(flippers.left, input.left, dt);
    updateFlipper(flippers.right, input.right, dt);
    simulateBall(dt);
    for (const impact of collisionState.impacts) impact.life -= dt * 4.5;
    collisionState.impacts = collisionState.impacts.filter(impact => impact.life > 0);
    if (input.nudgeX !== 0 && simTime >= input.nudgeUntil) input.nudgeX = 0;
  }

  function frame(now) {
    if (lastFrameTime === null) lastFrameTime = now;

    // Clamp long sleeps (background tabs, breakpoints) so the simulation never
    // tries to process an unbounded backlog of physics steps.
    const elapsed = Math.min((now - lastFrameTime) / 1000, 0.25);
    lastFrameTime = now;
    accumulator += elapsed;

    while (accumulator >= FIXED_DT) {
      updateSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    draw(simTime * 1000);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', fitCanvas, { passive: true });
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', () => {
    input.left = false;
    input.right = false;
    input.plunger = false;
    input.nudgeX = 0;
    input.pointerAction = null;
  });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointerup', releasePointerAction, { passive: false });
  canvas.addEventListener('pointercancel', releasePointerAction, { passive: false });
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  // Exposed only for later stages and quick browser smoke tests.
  window.spaceCadetInput = input;
  window.spaceCadetGame = game;
  window.spaceCadetBall = ball;
  window.spaceCadetPhysics = ballPhysics;
  window.spaceCadetWalls = walls;
  window.spaceCadetCollisionState = collisionState;
  window.spaceCadetFlippers = flippers;
  window.spaceCadetPlunger = plunger;
  window.spaceCadetDrain = drain;
  window.spaceCadetBumpers = bumpers;
  window.spaceCadetScoring = scoring;
  if (testMode) {
    window.spaceCadetTest = {
      step(seconds = FIXED_DT) {
        const ticks = Math.max(0, Math.ceil(seconds / FIXED_DT));
        for (let i = 0; i < ticks; i += 1) updateSimulation(FIXED_DT);
      },
    };
  }

  fitCanvas();
  if (!testMode) requestAnimationFrame(frame);
})();
