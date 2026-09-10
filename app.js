/*
 * 3D Pinball — Space Cadet (HTML5)
 * Stages 2.1–2.10 plus 3.1: canvas boot, fixed loop, input, physics,
 * collisions, flippers, game state, plunger lane, drain/respawn, scoring hooks,
 * and the source 600×416 table coordinate map. Later stages add table rules and audio.
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

  // Stage 3.1: use the original 600×416 logical screen as the source
  // coordinate system. The original table projection occupies the left
  // 365-ish pixels; score/status art lives in the right-hand strip.
  const DESIGN_W = 600;
  const DESIGN_H = 416;
  const REFERENCE_SCREEN = Object.freeze({ width: 600, height: 416 });
  const board = { x: 0, y: 0, w: 365, h: 416 };
  const playfield = { x: 0, y: 0, w: 365, h: 416 };
  const tableMap = Object.freeze({
    camera: Object.freeze({
      row0: [1, 0, 0, 0],
      row1: [0, -0.913545, 0.406737, 3.791398],
      row2: [0, -0.406737, -0.913545, 24.675402],
      projectionDistance: -400.000702,
      centerX: 183,
      centerY: 238,
    }),
    worldBounds: Object.freeze({ left: -10.391989, right: 10.321410, top: -14.437246, bottom: 15.000000 }),
    tableBounds: Object.freeze({ left: -8, right: 8, top: -14, bottom: 15 }),
    plunger: Object.freeze({ x: -7.020939, y: 10.084854 }),
    flippers: Object.freeze({
      left: Object.freeze({
        pivot: [2.488815, 12.063060],
        restTip: [0.961315, 13.130959],
        activeTip: [0.961315, 11.006570],
      }),
      right: Object.freeze({
        pivot: [-2.489000, 12.063060],
        restTip: [-0.961000, 13.130959],
        activeTip: [-0.961000, 11.006570],
      }),
    }),
    bumpers: Object.freeze([
      Object.freeze({ id: 'bump1', world: [0.008000, -3.720000], radius: 12, core: '#d94352', ring: '#f0a840' }),
      Object.freeze({ id: 'bump2', world: [-1.377520, -6.618031], radius: 12, core: '#e3be41', ring: '#f3df8d' }),
      Object.freeze({ id: 'bump3', world: [1.251057, -5.960478], radius: 12, core: '#4baed2', ring: '#a3e7ec' }),
      Object.freeze({ id: 'bump4', world: [5.769451, -10.955119], radius: 11, core: '#e3be41', ring: '#f3df8d' }),
      Object.freeze({ id: 'bump5', world: [5.280001, 4.000000], radius: 10, core: '#d94352', ring: '#f0a840' }),
      Object.freeze({ id: 'bump6', world: [7.140000, 3.500000], radius: 10, core: '#4baed2', ring: '#a3e7ec' }),
      Object.freeze({ id: 'bump7', world: [6.451294, 4.907899], radius: 10, core: '#d94352', ring: '#f0a840' }),
    ]),
  });

  function projectWorldPoint(x, y, z = 0) {
    const camera = tableMap.camera;
    const y1 = camera.row1[1] * y + camera.row1[2] * z + camera.row1[3];
    const z1 = camera.row2[1] * y + camera.row2[2] * z + camera.row2[3];
    return {
      x: x * camera.projectionDistance / z1 + camera.centerX,
      y: y1 * camera.projectionDistance / z1 + camera.centerY,
    };
  }

  function projectWorldPair(pair) {
    return projectWorldPoint(pair[0], pair[1], pair[2] || 0);
  }

  function angleBetween(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  const mappedTable = {
    plunger: projectWorldPair([tableMap.plunger.x, tableMap.plunger.y]),
    tableCorners: {
      topLeft: projectWorldPoint(tableMap.tableBounds.right, tableMap.tableBounds.top),
      topRight: projectWorldPoint(tableMap.tableBounds.left, tableMap.tableBounds.top),
      bottomRight: projectWorldPoint(tableMap.tableBounds.left, tableMap.tableBounds.bottom),
      bottomLeft: projectWorldPoint(tableMap.tableBounds.right, tableMap.tableBounds.bottom),
    },
    drain: {
      left: projectWorldPoint(tableMap.worldBounds.right, tableMap.worldBounds.bottom - 0.56),
      right: projectWorldPoint(tableMap.worldBounds.left, tableMap.worldBounds.bottom - 0.56),
    },
    shooterRail: [
      projectWorldPoint(-6.492623, -5.604876),
      projectWorldPoint(-6.492159, -0.072489),
    ],
    flippers: {},
    bumpers: [],
  };
  for (const side of ['left', 'right']) {
    const source = tableMap.flippers[side];
    const pivot = projectWorldPair(source.pivot);
    const restTip = projectWorldPair(source.restTip);
    const activeTip = projectWorldPair(source.activeTip);
    mappedTable.flippers[side] = {
      pivot,
      restTip,
      activeTip,
      length: Math.hypot(restTip.x - pivot.x, restTip.y - pivot.y),
      restAngle: angleBetween(pivot, restTip),
      activeAngle: angleBetween(pivot, activeTip),
    };
  }
  for (const source of tableMap.bumpers) {
    const point = projectWorldPair(source.world);
    mappedTable.bumpers.push({ ...source, x: point.x, y: point.y, points: 100, restitution: 1.04, kick: 70, flash: 0, hitCooldown: 0, hits: 0 });
  }
  const shooterRail = mappedTable.shooterRail;
  const tableCorners = mappedTable.tableCorners;
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
    if (!insideBoard || y < board.y + board.h - 116) return null;
    // The original projection puts both flippers and the shooter lane in the
    // lower-right half of the 365px table image, not across the whole canvas.
    const localX = x - board.x;
    if (localX < 175) return 'left';
    if (localX < 282) return 'right';
    return 'plunger';
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

  // Stage 2.4 + 3.1: the ball now lives in the same projected screen space
  // as the reference table, so every later component can share one map.
  const ballPhysics = {
    width: playfield.w,
    height: playfield.h + 34,
    gravity: 700,
    airDrag: 0.12,
    maxSpeed: 620,
    radius: 5,
  };
  const ballSpawn = {
    // The right-side shooter lane is projected from the original plunger point.
    x: mappedTable.plunger.x,
    y: mappedTable.plunger.y,
  };
  const ball = {
    x: ballSpawn.x,
    y: ballSpawn.y,
    previousX: ballSpawn.x,
    previousY: ballSpawn.y,
    vx: -38,
    vy: -360,
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
    launchMin: 300,
    launchMax: 520,
    laneX: mappedTable.plunger.x,
    laneBottom: mappedTable.plunger.y,
    laneTop: mappedTable.shooterRail[0].y,
    lastLaunchSpeed: 0,
  };

  // Stage 2.9: the open lower apron is a real drain rather than a safety
  // reset. A short service interval makes the lost-ball transition readable
  // and gives the next ball a predictable plunger-ready moment.
  const drain = {
    // The source drain line projects just below the 416px viewport; this
    // inset keeps the playable apron visible while preserving its slope.
    y: playfield.h - 11,
    minX: 0,
    maxX: playfield.w,
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
    ball.vx = -18;
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
    ball.vx = activate ? -38 : 0;
    ball.vy = activate ? -360 : 0;
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

  // Stage 3.1: project the source table perimeter into the same 600×416
  // screen space as the renderer. The bottom remains open so the drain can
  // own ball loss; a mapped shooter rail retains the source's right-side lane.
  const walls = [
    { id: 'top-rail', a: tableCorners.topLeft, b: tableCorners.topRight, restitution: 0.92 },
    { id: 'left-rail', a: tableCorners.topLeft, b: tableCorners.bottomLeft, restitution: 0.91 },
    { id: 'right-rail', a: tableCorners.topRight, b: tableCorners.bottomRight, restitution: 0.91 },
    { id: 'shooter-rail', a: shooterRail[0], b: shooterRail[1], restitution: 0.88 },
  ];

  // The seven bumper anchors come from the original a_bump1–a_bump7
  // records. Their screen positions are deliberately kept as data, so later
  // rule/visual stages can add targets without inventing a second coordinate map.
  const bumpers = mappedTable.bumpers;

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

  // Stage 2.7 + 3.1: flipper pivots, travel, and angles are derived from
  // the source a_flip1/a_flip2 control points after projection.
  const flippers = {
    left: {
      side: 'left',
      pivot: mappedTable.flippers.left.pivot,
      length: mappedTable.flippers.left.length,
      radius: 5,
      restAngle: mappedTable.flippers.left.restAngle,
      activeAngle: mappedTable.flippers.left.activeAngle,
      angle: mappedTable.flippers.left.restAngle,
      previousAngle: mappedTable.flippers.left.restAngle,
      angularVelocity: 0, pressed: false,
      flash: 0, hitCooldown: 0,
    },
    right: {
      side: 'right',
      pivot: mappedTable.flippers.right.pivot,
      length: mappedTable.flippers.right.length,
      radius: 5,
      restAngle: mappedTable.flippers.right.restAngle,
      activeAngle: mappedTable.flippers.right.activeAngle,
      angle: mappedTable.flippers.right.restAngle,
      previousAngle: mappedTable.flippers.right.restAngle,
      angularVelocity: 0, pressed: false,
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
    const travelSpeed = pressed ? 32 : 16;
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
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(inner.x + ends.a.x, inner.y + ends.a.y);
    ctx.lineTo(inner.x + ends.b.x, inner.y + ends.b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hot ? '#f1c84e' : '#39a4bd';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(inner.x + ends.a.x, inner.y + ends.a.y);
    ctx.lineTo(inner.x + ends.b.x, inner.y + ends.b.y);
    ctx.stroke();
    ctx.fillStyle = '#dfecef';
    ctx.beginPath();
    ctx.arc(inner.x + flipper.pivot.x, inner.y + flipper.pivot.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hot ? '#f1c84e' : '#4a9bb2';
    ctx.beginPath();
    ctx.arc(inner.x + flipper.pivot.x, inner.y + flipper.pivot.y, 4, 0, Math.PI * 2);
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
    const bg = ctx.createRadialGradient(260, 180, 20, 280, 220, 520);
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

    const haze = ctx.createRadialGradient(250, 150, 10, 250, 150, 180);
    haze.addColorStop(0, 'rgba(25,143,196,.18)');
    haze.addColorStop(1, 'rgba(25,143,196,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  }

  function drawScorePanel() {
    // The source DAT places score1/player/ballcount in the right-hand strip
    // of the 600×416 screen. Keep that composition instead of the temporary
    // left-side diagnostic panel used during Stage 2.
    const p = { x: 386, y: 8, w: 205, h: 400 };
    const panel = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    panel.addColorStop(0, '#172332');
    panel.addColorStop(.08, '#0b111a');
    panel.addColorStop(.55, '#03070d');
    panel.addColorStop(1, '#121b27');
    ctx.fillStyle = panel;
    roundedRect(p.x, p.y, p.w, p.h, 3);
    ctx.fill();
    ctx.strokeStyle = '#566171';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(213, 226, 234, .26)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);

    text('3D PINBALL', p.x + 18, p.y + 24, 14, '#d7dce1');
    text('SPACE CADET', p.x + 18, p.y + 42, 11, '#8da8ba', 'left', 700);
    ctx.fillStyle = '#4c6575';
    ctx.fillRect(p.x + 18, p.y + 55, p.w - 36, 1);

    text('PLAYER 1', p.x + 18, p.y + 78, 9, '#9eaab4', 'left', 400);
    text(formatScore(game.score), p.x + p.w - 16, p.y + 100, 23, '#e0e5e8', 'right', 900);
    text('HIGH SCORE', p.x + 18, p.y + 130, 9, '#738896', 'left', 400);
    text(formatScore(game.highScore), p.x + p.w - 16, p.y + 151, 17, '#b7c2c7', 'right', 900);

    ctx.fillStyle = '#26333e';
    ctx.fillRect(p.x + 18, p.y + 171, p.w - 36, 1);
    text('RANK', p.x + 18, p.y + 192, 9, '#738896', 'left', 400);
    text(game.state.toUpperCase(), p.x + p.w - 16, p.y + 192, 9,
      game.state === 'playing' ? '#dfe8ed' : '#d9b75d', 'right');
    text('MISSION', p.x + 18, p.y + 213, 9, '#738896', 'left', 400);
    text(game.lastMessage, p.x + 18, p.y + 231, 8, '#d9b75d', 'left', 700);

    const lights = [
      ['READY', true], ['LIGHTS', scoring.hits > 0], ['RAMP', false], ['WORM HOLE', false],
    ];
    lights.forEach(([label, on], i) => {
      const yy = p.y + 255 + i * 20;
      ctx.fillStyle = on ? '#dfc35e' : '#273b47';
      ctx.shadowColor = on ? '#ffe98a' : 'transparent';
      ctx.shadowBlur = on ? 7 : 0;
      ctx.beginPath();
      ctx.arc(p.x + 23, yy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      text(label, p.x + 34, yy, 8, on ? '#c7d2d8' : '#5d7787', 'left', 400);
    });

    ctx.fillStyle = '#26333e';
    ctx.fillRect(p.x + 18, p.y + 337, p.w - 36, 1);
    text('BALL', p.x + 18, p.y + 355, 9, '#738896', 'left', 400);
    for (let i = 0; i < 3; i++) {
      const on = i < game.balls;
      ctx.fillStyle = on ? '#d9e0e2' : '#233440';
      ctx.strokeStyle = on ? '#a9bcc5' : '#40515d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x + 23 + i * 21, p.y + 377, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    text(`DRAIN ${String(drain.total).padStart(2, '0')}`, p.x + 98, p.y + 374, 8, '#65808f', 'left', 400);
    text(`NEXT ${drain.cooldown > 0 ? `${drain.cooldown.toFixed(1)}s` : (plunger.armed ? 'READY' : 'IN PLAY')}`,
      p.x + 98, p.y + 389, 8, '#65808f', 'left', 400);
  }

  function drawTable(t) {
    const bx = board.x;
    const by = board.y;
    const bw = board.w;
    const bh = board.h;
    const inner = { x: bx + playfield.x, y: by + playfield.y, w: playfield.w, h: playfield.h };

    // The original table bitmap is a narrow portrait projection inside the
    // 600×416 game screen. Keep the right-side score strip outside this clip.
    const cabinet = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    cabinet.addColorStop(0, '#b8c4c8');
    cabinet.addColorStop(.035, '#33434d');
    cabinet.addColorStop(.12, '#101e2a');
    cabinet.addColorStop(.82, '#172b38');
    cabinet.addColorStop(1, '#a4b4bb');
    ctx.fillStyle = cabinet;
    roundedRect(bx, by, bw, bh, 4);
    ctx.fill();
    ctx.strokeStyle = '#05090e';
    ctx.lineWidth = 3;
    ctx.stroke();

    const surface = ctx.createLinearGradient(inner.x, inner.y, inner.x + inner.w, inner.y + inner.h);
    surface.addColorStop(0, '#155b68');
    surface.addColorStop(.22, '#0b3c50');
    surface.addColorStop(.62, '#06263b');
    surface.addColorStop(1, '#020d18');
    ctx.fillStyle = surface;
    roundedRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8, 3);
    ctx.fill();

    ctx.save();
    roundedRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8, 3);
    ctx.clip();

    // Repeated dust/texture gives the flat procedural field the same low-res
    // visual density as the source bitmap without importing its pixels.
    for (let i = 0; i < 56; i++) {
      const sx = 6 + ((i * 47) % 350);
      const sy = 8 + ((i * 83) % 402);
      ctx.globalAlpha = .10 + (i % 5) * .025;
      ctx.fillStyle = i % 3 === 0 ? '#91dbe0' : '#9dbcca';
      ctx.fillRect(sx, sy, i % 2 ? 1 : 2, i % 2 ? 1 : 1);
    }
    ctx.globalAlpha = 1;

    // Projected outer rails from the source table group's [-8, 8] × [-14, 15]
    // rectangle. The lower corners intentionally continue below the viewport.
    ctx.strokeStyle = 'rgba(195, 227, 228, .70)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tableCorners.topLeft.x, tableCorners.topLeft.y);
    ctx.lineTo(tableCorners.topRight.x, tableCorners.topRight.y);
    ctx.lineTo(tableCorners.bottomRight.x, tableCorners.bottomRight.y);
    ctx.lineTo(tableCorners.bottomLeft.x, tableCorners.bottomLeft.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(18, 93, 108, .95)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(tableCorners.topLeft.x + 3, tableCorners.topLeft.y + 2);
    ctx.lineTo(tableCorners.topRight.x - 3, tableCorners.topRight.y + 2);
    ctx.lineTo(tableCorners.bottomRight.x - 3, tableCorners.bottomRight.y - 4);
    ctx.moveTo(tableCorners.topLeft.x + 3, tableCorners.topLeft.y + 2);
    ctx.lineTo(tableCorners.bottomLeft.x + 3, tableCorners.bottomLeft.y - 4);
    ctx.stroke();

    // Header mark and center lane. These are screen-space accents anchored to
    // the same projection center used by the original camera_info record.
    ctx.strokeStyle = '#dec45e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(112, 31);
    ctx.quadraticCurveTo(183, 8, 252, 31);
    ctx.stroke();
    text('SPACE CADET', 183, 28, 13, '#e5ca66', 'center');
    ctx.strokeStyle = 'rgba(115, 218, 225, .72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(183, 42);
    ctx.lineTo(183, 83);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(229, 194, 78, .66)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(174, 42);
    ctx.lineTo(174, 83);
    ctx.moveTo(192, 42);
    ctx.lineTo(192, 83);
    ctx.stroke();

    // The first three popup targets are mapped from a_targ1–a_targ3.
    const topTargetYs = [0.965, 1.666, 2.365];
    topTargetYs.forEach((worldY, index) => {
      const a = projectWorldPoint(-4.24204, worldY);
      const b = projectWorldPoint(-4.157959, worldY + .516);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      ctx.fillStyle = index === 0 ? '#d8bb58' : '#163d4d';
      ctx.strokeStyle = '#79bcc5';
      ctx.lineWidth = 1;
      roundedRect(x - 5, y - 5, 10, 10, 1.5);
      ctx.fill();
      ctx.stroke();
      text(String(index + 1), x, y + .5, 7, index === 0 ? '#14253a' : '#9ad7d7', 'center');
    });

    // Inner guide rails are simple screen projections of the source's long
    // one-way segments; Stage 3.2 will turn these into active gates/guides.
    const guidePaths = [
      [[-6.26309, 3.554958], [-6.26309, 5.064444]],
      [[-5.229421, 3.916008], [-5.2351, 5.364433]],
      [[2.625341, -10.714686], [3.324727, -11.956454]],
      [[-3.324988, -11.956454], [-2.625601, -10.714686]],
      [[6.408451, -.973824], [7.663972, -4.499189]],
    ];
    ctx.strokeStyle = 'rgba(174, 213, 213, .68)';
    ctx.lineWidth = 2;
    for (const path of guidePaths) {
      const a = projectWorldPair(path[0]);
      const b = projectWorldPair(path[1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // A pair of curved ramp outlines reserves the source ramp lanes visually.
    ctx.strokeStyle = '#b7d1d1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(118, 294);
    ctx.bezierCurveTo(85, 242, 74, 174, 107, 95);
    ctx.bezierCurveTo(126, 54, 153, 42, 176, 43);
    ctx.stroke();
    ctx.strokeStyle = '#2b7080';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(118, 294);
    ctx.bezierCurveTo(85, 242, 74, 174, 107, 95);
    ctx.bezierCurveTo(126, 54, 153, 42, 176, 43);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(182, 216, 217, .74)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(245, 284);
    ctx.bezierCurveTo(268, 240, 288, 197, 289, 144);
    ctx.lineTo(289, 104);
    ctx.stroke();

    // Shooter lane, mapped plunger, spring, and a short launch indicator.
    const plungerX = plunger.laneX;
    ctx.strokeStyle = '#c9dadd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plungerX + 12, 104);
    ctx.lineTo(plungerX + 12, 350);
    ctx.stroke();
    ctx.strokeStyle = '#3b8090';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(plungerX + 19, 104);
    ctx.lineTo(plungerX + 19, 350);
    ctx.stroke();
    text('LAUNCH', plungerX + 14, 93, 7, '#dfc560', 'center');

    const plungerBaseY = plunger.laneBottom + 14;
    const plungerHandleY = plungerBaseY + plunger.charge * 7;
    ctx.strokeStyle = '#c4d9da';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plungerX, plungerBaseY);
    ctx.lineTo(plungerX, plungerHandleY);
    ctx.stroke();
    ctx.strokeStyle = plunger.armed && input.plunger ? '#f1d36b' : '#638f9b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const yy = plungerBaseY - i * 3.2 + plunger.charge * 5;
      const xx = plungerX + (i % 2 ? 3 : -3);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.fillStyle = plunger.armed && input.plunger ? '#f1d36b' : '#638f9b';
    ctx.fillRect(plungerX - 5, plungerHandleY - 1, 10, 2);

    // The source has seven compact bumpers, with a larger three-bumper cluster
    // near the top and four smaller field bumpers below/left.
    for (const bumper of bumpers) drawBumperGraphic(bumper, inner);

    // Lower slingshots and the open apron are anchored to the mapped flippers.
    ctx.fillStyle = 'rgba(169, 43, 92, .52)';
    ctx.strokeStyle = '#d36a91';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 326);
    ctx.lineTo(116, 350);
    ctx.lineTo(79, 381);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(258, 350);
    ctx.lineTo(314, 326);
    ctx.lineTo(295, 381);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const drainLeft = 23;
    const drainRight = 344;
    const drainY = drain.y;
    ctx.fillStyle = 'rgba(0, 4, 9, .90)';
    ctx.beginPath();
    ctx.moveTo(drainLeft, drainY - 3);
    ctx.lineTo(drainRight, drainY - 3);
    ctx.lineTo(drainRight - 12, drainY + 15);
    ctx.lineTo(drainLeft + 12, drainY + 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = drain.flash > 0 ? '#f2cf63' : '#466b79';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text('DRAIN', (drainLeft + drainRight) / 2, drainY + 7, 7, drain.flash > 0 ? '#f2cf63' : '#6f98a6', 'center');

    drawFlipperGraphic(flippers.left, inner);
    drawFlipperGraphic(flippers.right, inner);

    // Contact sparks and score callouts are kept inside the source bitmap clip.
    for (const impact of collisionState.impacts) {
      const ix = inner.x + impact.x;
      const iy = inner.y + impact.y;
      ctx.save();
      ctx.globalAlpha = Math.max(0, impact.life);
      ctx.strokeStyle = '#ffe88c';
      ctx.shadowColor = '#fff1a8';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ix + impact.nx * 6, iy + impact.ny * 6);
      ctx.moveTo(ix - impact.ny * 4, iy + impact.nx * 4);
      ctx.lineTo(ix + impact.ny * 4, iy - impact.nx * 4);
      ctx.stroke();
      ctx.restore();
    }
    for (const popup of scoring.popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, popup.life);
      text(`+${popup.points}`, inner.x + popup.x, inner.y + popup.y, 8, '#ffe88c', 'center');
      ctx.restore();
    }

    // Dynamic ball and a short trail, in the same screen coordinates as the
    // mapped colliders above.
    const ballX = inner.x + ball.x;
    const ballY = inner.y + ball.y;
    for (let i = 0; i < ball.trail.length; i++) {
      const point = ball.trail[i];
      const alpha = (i + 1) / ball.trail.length * 0.20 * point.life;
      ctx.fillStyle = `rgba(190, 239, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(inner.x + point.x, inner.y + point.y, 1.7 + i * .15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowColor = '#e4f8ff';
    ctx.shadowBlur = 8;
    const ballGradient = ctx.createRadialGradient(ballX - 1.5, ballY - 2, .5, ballX, ballY, ball.radius);
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(.45, '#d7e6e8');
    ballGradient.addColorStop(1, '#657e88');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    ctx.strokeStyle = '#d2e1e3';
    ctx.lineWidth = 1.5;
    roundedRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8, 3);
    ctx.stroke();
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
  window.spaceCadetTableCoordinates = {
    screen: REFERENCE_SCREEN,
    source: tableMap,
    mapped: mappedTable,
  };
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
