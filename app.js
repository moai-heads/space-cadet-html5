/*
 * 3D Pinball — Space Cadet (HTML5)
 * Stages 2.1–2.10 plus 3.1: canvas boot, fixed loop, input, physics,
 * collisions, flippers, game state, plunger lane, drain/respawn, scoring hooks,
 * and the source 600×416 table coordinate map. Stage 3.2 adds active
 * target banks, rollovers, lane guides, gates, kickers, and slingshots.
 * Stage 3.3 adds mapped ramps, ramp-hole capture, wormhole sinks, rocket
 * launch feedback, and shooter-lane exit routing. Stage 3.4 adds
 * mission/rank progression, target-bank rules, fuel, multiplier state, and
 * table-specific objective feedback. Stage 4.1 preserves the responsive
 * 600x416 reference frame; Stage 4.2 adds procedural bitmap-like artwork,
 * chrome rails, lamp banks, and mission/rank indicators. Stage 4.3 adds
 * CRT/palette polish; Stage 5.1 adds the lazy Web Audio mixer and unlock path.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('Canvas #game was not found');
  const statusNode = document.getElementById('status');
  const fullscreenButton = document.getElementById('fullscreen');
  const muteButton = document.getElementById('mute');
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

  // Stage 3.5: keep physical tuning in one place. The values are expressed in
  // the 600x416 projected screen space, then shared by every collider so a
  // rail, bumper, flipper, or drain cannot quietly use a different feel.
  const PHYSICS_TUNING = Object.freeze({
    ballRadius: 5,
    gravity: 690,
    airDrag: 0.14,
    maxSpeed: 610,
    wallRestitution: 0.90,
    shooterRestitution: 0.86,
    guideRestitution: 0.76,
    gateRestitution: 0.82,
    rampRailRestitution: 0.80,
    bumperRestitution: 1.02,
    bumperKick: 62,
    targetRestitution: 0.88,
    targetKick: 34,
    kickerKick: 320,
    slingKick: 138,
    flipperRadius: 5,
    flipperRestitution: 0.88,
    flipperActiveRestitution: 1.01,
    flipperActiveKick: 108,
    flipperRestKick: 16,
    collisionSlop: 0.08,
    tangentialDamping: 0.024,
    drainY: 405,
    drainMinX: 23,
    drainMaxX: 344,
    drainFunnelDepth: 14,
    drainFunnelInset: 12,
    drainCaptureDepth: 2.5,
    targetCollisionRadius: 3.1,
    rolloverTriggerRadius: 5.4,
  });
  const VISUAL_TUNING = Object.freeze({
    scanlineStep: 3,
    scanlineAlpha: 0.045,
    vignetteAlpha: 0.30,
    rollingLineAlpha: 0.035,
    maxParticles: 220,
    maxRings: 42,
    flashDecay: 2.8,
  });
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

  // Stage 3.2: these source polygons are taken from the open-source table
  // data dump in reference/upstream-port/Doc/.dat dump.txt. They are kept as
  // data and projected once so rendering and collision share the same map.
  const worldRect = (cx, cy, width, height) => [
    [cx - width / 2, cy - height / 2],
    [cx + width / 2, cy - height / 2],
    [cx + width / 2, cy + height / 2],
    [cx - width / 2, cy + height / 2],
  ];

  const targetSources = [
    { id: 'a_targ1', bank: 'booster', label: 'B1', points: 500, visual: [10, 12], world: [[-4.242040, 0.706733], [-4.157959, 0.706708], [-4.157959, 1.222863], [-4.242040, 1.222888]] },
    { id: 'a_targ2', bank: 'booster', label: 'B2', points: 500, visual: [10, 12], world: [[-4.242040, 1.408076], [-4.157959, 1.408051], [-4.157959, 1.924205], [-4.242040, 1.924231]] },
    { id: 'a_targ3', bank: 'booster', label: 'B3', points: 500, visual: [10, 12], world: [[-4.242040, 2.106732], [-4.157959, 2.106707], [-4.157959, 2.622862], [-4.242040, 2.622887]] },
    { id: 'a_targ4', bank: 'medal', label: 'M1', points: 1500, visual: [16, 10], world: [[1.284484, -2.878328], [1.312133, -2.798923], [0.824632, -2.629339], [0.796983, -2.708743]] },
    { id: 'a_targ5', bank: 'medal', label: 'M2', points: 1500, visual: [16, 10], world: [[0.622076, -2.647900], [0.649725, -2.568495], [0.162224, -2.398911], [0.134575, -2.478315]] },
    { id: 'a_targ6', bank: 'medal', label: 'M3', points: 1500, visual: [16, 10], world: [[-0.037796, -2.418355], [-0.010147, -2.338950], [-0.497648, -2.169365], [-0.525297, -2.248770]] },
    { id: 'a_targ7', bank: 'multiplier', label: 'X1', points: 500, visual: [14, 10], world: [[3.369175, -7.924452], [3.324641, -7.853134], [2.886917, -8.126654], [2.931451, -8.197972]] },
    { id: 'a_targ8', bank: 'multiplier', label: 'X2', points: 500, visual: [14, 10], world: [[2.774403, -8.296104], [2.729868, -8.224786], [2.292144, -8.498306], [2.336679, -8.569625]] },
    { id: 'a_targ9', bank: 'multiplier', label: 'X3', points: 500, visual: [14, 10], world: [[2.181909, -8.666334], [2.137374, -8.595016], [1.699650, -8.868536], [1.744185, -8.939855]] },
    { id: 'a_targ10', bank: 'fuel', label: 'F1', points: 750, visual: [10, 11], world: [[7.421899, -10.735580], [7.349141, -10.740417], [7.349141, -11.283693], [7.426752, -11.283693]] },
    { id: 'a_targ11', bank: 'fuel', label: 'F2', points: 750, visual: [12, 11], world: [[5.797551, -12.932883], [5.792857, -12.860115], [5.249582, -12.859049], [5.249429, -12.936660]] },
    { id: 'a_targ12', bank: 'fuel', label: 'F3', points: 750, visual: [10, 11], world: [[4.207457, -12.452173], [4.258523, -12.400120], [3.896799, -11.994775], [3.838892, -12.046450]] },
    { id: 'a_targ13', bank: 'mission', label: 'M1', points: 1000, visual: [9, 11], world: [[4.553364, 2.980716], [4.626232, 2.983456], [4.641869, 3.526507], [4.564290, 3.528741]] },
    { id: 'a_targ14', bank: 'mission', label: 'M2', points: 1000, visual: [9, 11], world: [[4.553364, 3.634841], [4.626232, 3.637582], [4.641869, 4.180633], [4.564290, 4.182867]] },
    { id: 'a_targ15', bank: 'mission', label: 'M3', points: 1000, visual: [9, 11], world: [[4.553364, 4.275885], [4.626232, 4.278625], [4.641869, 4.821676], [4.564290, 4.823910]] },
    { id: 'a_targ16', bank: 'left-hazard', label: 'L1', points: 750, visual: [9, 11], world: [[5.861614, -5.692998], [5.934482, -5.690258], [5.950119, -5.147207], [5.872540, -5.144973]] },
    { id: 'a_targ17', bank: 'left-hazard', label: 'L2', points: 750, visual: [9, 11], world: [[5.856654, -4.898884], [5.928021, -4.883924], [5.852073, -4.345982], [5.775224, -4.356832]] },
    { id: 'a_targ18', bank: 'left-hazard', label: 'L3', points: 750, visual: [9, 11], world: [[5.754221, -4.123814], [5.816525, -4.085926], [5.565651, -3.604042], [5.496811, -3.639881]] },
    { id: 'a_targ19', bank: 'right-hazard', label: 'R1', points: 750, visual: [9, 11], world: [[-3.285803, -7.472939], [-3.223500, -7.435050], [-3.474373, -6.953167], [-3.543214, -6.989006]] },
    { id: 'a_targ20', bank: 'right-hazard', label: 'R2', points: 750, visual: [9, 11], world: [[-3.652299, -6.800594], [-3.586594, -6.768969], [-3.789226, -6.264896], [-3.861236, -6.293843]] },
    { id: 'a_targ21', bank: 'right-hazard', label: 'R3', points: 750, visual: [9, 11], world: [[-3.902839, -5.970493], [-3.830392, -5.962211], [-3.856160, -5.419546], [-3.933683, -5.423227]] },
    { id: 'a_targ22', bank: 'wormhole', label: 'W', points: 750, visual: [13, 12], world: [[-2.953458, -2.506831], [-2.919518, -2.442292], [-3.382525, -2.158086], [-3.423126, -2.224230]] },
  ];

  const rolloverSources = [
    { id: 'a_roll1', label: 'R1', points: 2000, world: worldRect(1.25, -9.50, 0.92, 0.68) },
    { id: 'a_roll2', label: 'R2', points: 2000, world: worldRect(0.00, -9.50, 0.92, 0.68) },
    { id: 'a_roll3', label: 'R3', points: 2000, world: worldRect(-1.25, -9.50, 0.84, 0.70) },
    { id: 'a_roll4', label: 'R4', points: 500, world: worldRect(7.00, 8.00, 0.88, 0.68) },
    { id: 'a_roll5', label: 'R5', points: 500, world: worldRect(5.85, 8.00, 0.72, 0.62) },
    { id: 'a_roll6', label: 'R6', points: 500, world: worldRect(4.75, 8.00, 0.86, 0.70) },
    { id: 'a_roll7', label: 'R7', points: 500, world: worldRect(-4.75, 8.00, 0.82, 0.72) },
    { id: 'a_roll8', label: 'R8', points: 500, world: worldRect(-5.85, 8.00, 0.72, 0.70) },
    { id: 'a_roll9', label: 'R9', points: 10000, world: [[4.698180, -7.002740], [4.709074, -7.405536], [5.063625, -7.597506], [5.407281, -7.386681], [5.396387, -6.983885], [5.041836, -6.791915]] },
    { id: 'a_roll110', label: 'L1', points: 500, world: worldRect(7.27, 1.85, 0.53, 0.49) },
    { id: 'a_roll111', label: 'L2', points: 500, world: worldRect(6.32, 2.10, 0.69, 0.48) },
    { id: 'a_roll112', label: 'L3', points: 500, world: worldRect(5.35, 2.39, 0.68, 0.48) },
    { id: 'a_roll179', label: 'A', points: 10000, world: [[5.298720, 1.609502], [4.946744, 2.060959], [3.244249, 1.285616], [3.571364, 0.848427]] },
    { id: 'a_roll180', label: 'B', points: 10000, world: [[5.716518, 0.642137], [5.410181, 1.162493], [4.114841, 0.340192], [4.400651, -0.163294]] },
    { id: 'a_roll181', label: 'C', points: 10000, world: [[6.293731, -0.359319], [5.975935, 0.242826], [4.787576, -0.530924], [5.085002, -1.112488]] },
    { id: 'a_roll182', label: 'D', points: 10000, world: [[6.728972, -1.373545], [6.446019, -0.904035], [5.432468, -1.422942], [5.697550, -1.875902]] },
    { id: 'a_roll183', label: 'E', points: 10000, world: [[7.227558, -2.512395], [6.949279, -2.049177], [5.832143, -2.345689], [6.092129, -2.791297]] },
    { id: 'a_roll184', label: 'F', points: 10000, world: [[7.416503, -3.528887], [7.225690, -3.042141], [6.263735, -3.291593], [6.440838, -3.759464]] },
  ];

  const guideSources = [
    { id: 'guide-left-upper', world: [[-6.26309, 3.554958], [-6.26309, 5.064444]], restitution: PHYSICS_TUNING.guideRestitution },
    { id: 'guide-left-mid', world: [[-5.229421, 3.916008], [-5.2351, 5.364433]], restitution: PHYSICS_TUNING.guideRestitution },
    { id: 'guide-left-ramp', world: [[-3.324988, -11.956454], [-2.625601, -10.714686]], restitution: PHYSICS_TUNING.rampRailRestitution },
    { id: 'guide-right-ramp', world: [[2.625341, -10.714686], [3.324727, -11.956454]], restitution: PHYSICS_TUNING.rampRailRestitution },
    { id: 'guide-right-lane', world: [[6.408451, -0.973824], [7.663972, -4.499189]], restitution: PHYSICS_TUNING.guideRestitution },
  ];

  // Stage 3.3: source ramp planes and sink positions are reduced to stable
  // centerlines here. The full source table still owns the camera projection;
  // these paths preserve the playable entry/exit shape without importing the
  // original bitmap or runtime assets.
  const rampSources = [
    {
      id: 'ramp',
      kind: 'launch',
      label: 'LAUNCH RAMP',
      worldPath: [
        [3.296382, 1.232470],
        [3.381792, 0.997584],
        [3.581364, 0.463746],
        [3.777676, -0.006016],
        [3.912348, -0.187517],
        [4.039313, -0.370893],
        [4.217121, -0.529171],
        [4.394761, -0.676098],
      ],
      width: 15,
      speed: 178,
      points: 5000,
      color: '#d7c262',
      accent: '#fff0a5',
    },
    {
      id: 's_ramp9',
      kind: 'hyperspace',
      label: 'HYPERSPACE',
      worldPath: [
        [-6.374070, -1.032808],
        [-6.200000, -2.100000],
        [-5.900000, -3.500000],
        [-5.500000, -5.200000],
        [-5.000000, -7.000000],
        [-4.400000, -8.700000],
        [-3.747841, -10.334387],
        [-3.044567, -10.786441],
      ],
      width: 18,
      speed: 214,
      points: 3500,
      color: '#6bc8d0',
      accent: '#bdf8f3',
    },
  ];

  const holeSources = [
    {
      id: 'ramp-hole',
      label: 'RAMP HOLE',
      worldCenter: [5.870174, 7.607636],
      radius: 11,
      captureTime: 0.44,
      points: 1000,
      route: 'ramp',
    },
  ];

  const wormholeSources = [
    {
      id: 'v_sink1',
      label: 'YELLOW',
      worldCenter: [-2.618267, -8.828711],
      color: '#e8ca5c',
      accent: '#fff1a2',
      eject: { x: -0.48, y: -0.88 },
      radius: 11,
      captureTime: 0.48,
      points: 10000,
    },
    {
      id: 'v_sink2',
      label: 'RED',
      worldCenter: [3.171890, -9.757203],
      color: '#d85e72',
      accent: '#ffadb2',
      eject: { x: 0.46, y: -0.89 },
      radius: 11,
      captureTime: 0.48,
      points: 10000,
    },
    {
      id: 'v_sink3',
      label: 'GREEN',
      worldCenter: [-4.714430, 3.329021],
      color: '#69c98a',
      accent: '#baffbf',
      eject: { x: 0.74, y: 0.36 },
      radius: 11,
      captureTime: 0.48,
      points: 10000,
    },
  ];

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
    targets: [],
    rollovers: [],
    guides: [],
    gates: [],
    kickers: [],
    slingshots: [],
    ramps: [],
    holes: [],
    wormholes: [],
    shooterExit: null,
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
    mappedTable.bumpers.push({ ...source, x: point.x, y: point.y, points: 100, restitution: PHYSICS_TUNING.bumperRestitution, kick: PHYSICS_TUNING.bumperKick, flash: 0, hitCooldown: 0, hits: 0 });
  }
  function polygonMetrics(points) {
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };
  }

  function mapWorldPolyline(worldPath) {
    return worldPath.map(projectWorldPair);
  }

  function polylineLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return length;
  }

  function polylineSample(points, progress) {
    if (points.length === 1) return { x: points[0].x, y: points[0].y, tangentX: 1, tangentY: 0 };
    const clamped = Math.max(0, Math.min(1, progress));
    const total = polylineLength(points) || 1;
    let distance = total * clamped;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segmentLength = Math.hypot(dx, dy) || 1;
      if (distance <= segmentLength || i === points.length - 1) {
        const t = Math.max(0, Math.min(1, distance / segmentLength));
        return {
          x: a.x + dx * t,
          y: a.y + dy * t,
          tangentX: dx / segmentLength,
          tangentY: dy / segmentLength,
        };
      }
      distance -= segmentLength;
    }
    const last = points[points.length - 1];
    const before = points[points.length - 2];
    const dx = last.x - before.x;
    const dy = last.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: last.x, y: last.y, tangentX: dx / length, tangentY: dy / length };
  }

  function nearestPointOnPolyline(x, y, points) {
    let best = { distance: Infinity, progress: 0, x: points[0].x, y: points[0].y, tangentX: 1, tangentY: 0 };
    const total = polylineLength(points) || 1;
    let traversed = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const nearest = closestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segmentLength = Math.hypot(dx, dy) || 1;
      const distance = Math.hypot(x - nearest.x, y - nearest.y);
      if (distance < best.distance) {
        best = {
          distance,
          progress: (traversed + segmentLength * nearest.t) / total,
          x: nearest.x,
          y: nearest.y,
          tangentX: dx / segmentLength,
          tangentY: dy / segmentLength,
        };
      }
      traversed += segmentLength;
    }
    return best;
  }

  function offsetPolyline(points, offset) {
    return points.map((point, index) => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: point.x - dy / length * offset, y: point.y + dx / length * offset };
    });
  }

  function mapWorldPolygon(source, options = {}) {
    const points = source.world.map(projectWorldPair);
    const bounds = polygonMetrics(points);
    return {
      ...source,
      score: Number.isFinite(source.points) ? source.points : (Number(source.score) || 0),
      points,
      ...bounds,
      collisionRadius: options.collisionRadius ?? Math.max(bounds.width, bounds.height) * 0.5 + 1.6,
      triggerRadius: options.triggerRadius ?? Math.max(bounds.width, bounds.height) * 0.5 + 2.2,
      active: true,
      lit: false,
      inside: false,
      flash: 0,
      hitCooldown: 0,
      hits: 0,
      dropTimer: 0,
    };
  }

  mappedTable.targets = targetSources.map(source => mapWorldPolygon(source, { collisionRadius: PHYSICS_TUNING.targetCollisionRadius }));
  mappedTable.rollovers = rolloverSources.map(source => mapWorldPolygon(source, { triggerRadius: PHYSICS_TUNING.rolloverTriggerRadius }));
  mappedTable.guides = guideSources.map(source => ({
    ...source,
    a: projectWorldPair(source.world[0]),
    b: projectWorldPair(source.world[1]),
    points: source.points || 12,
    flash: 0,
    hits: 0,
  }));
  mappedTable.ramps = rampSources.map(source => {
    const path = mapWorldPolyline(source.worldPath);
    const entry = path[0];
    const exit = path[path.length - 1];
    return {
      ...source,
      path,
      entry: { x: entry.x, y: entry.y },
      exit: { x: exit.x, y: exit.y },
      length: polylineLength(path),
      rails: [offsetPolyline(path, source.width / 2), offsetPolyline(path, -source.width / 2)],
      flash: 0,
      cooldown: 0,
      hits: 0,
      active: false,
    };
  });
  mappedTable.holes = holeSources.map(source => {
    const center = projectWorldPair(source.worldCenter);
    return { ...source, x: center.x, y: center.y, flash: 0, hitCooldown: 0, hits: 0, active: true };
  });
  mappedTable.wormholes = wormholeSources.map(source => {
    const center = projectWorldPair(source.worldCenter);
    return { ...source, x: center.x, y: center.y, flash: 0, hitCooldown: 0, hits: 0, active: true };
  });
  mappedTable.shooterExit = {
    id: 'shooter-exit',
    path: [
      { x: mappedTable.plunger.x, y: mappedTable.shooterRail[0].y + 5 },
      { x: mappedTable.plunger.x - 16, y: mappedTable.shooterRail[0].y - 4 },
      { x: mappedTable.plunger.x - 36, y: mappedTable.shooterRail[0].y - 18 },
      { x: 253, y: mappedTable.shooterRail[0].y - 34 },
      { x: 229, y: mappedTable.shooterRail[0].y - 37 },
    ],
    length: 0,
    flash: 0,
    cooldown: 0,
    hits: 0,
    active: false,
  };
  mappedTable.shooterExit.length = polylineLength(mappedTable.shooterExit.path);
  mappedTable.gates = [
    { id: 'v_gate1', a: projectWorldPoint(6.433412, 10.528717), b: projectWorldPoint(7.605177, 9.725221), restitution: PHYSICS_TUNING.gateRestitution, enabled: true, flash: 0, hits: 0 },
    { id: 'v_gate2', a: projectWorldPoint(-6.298658, 10.672674), b: projectWorldPoint(-5.213938, 11.435996), restitution: PHYSICS_TUNING.gateRestitution, enabled: true, flash: 0, hits: 0 },
  ];
  mappedTable.kickers = [
    { id: 'a_kick1', x: 42.1, y: 377.8, radius: 10, direction: { x: 0.52, y: -0.85 }, kick: PHYSICS_TUNING.kickerKick, points: 500, flash: 0, hitCooldown: 0, hits: 0 },
    { id: 'a_kick2', x: 299.0, y: 378.0, radius: 10, direction: { x: -0.52, y: -0.85 }, kick: PHYSICS_TUNING.kickerKick, points: 500, flash: 0, hitCooldown: 0, hits: 0 },
  ];
  mappedTable.slingshots = [
    { id: 'left-sling', points: [{ x: 60, y: 326 }, { x: 116, y: 350 }, { x: 79, y: 381 }], direction: { x: 0.62, y: -0.78 }, kick: PHYSICS_TUNING.slingKick, flash: 0, hitCooldown: 0, hits: 0 },
    { id: 'right-sling', points: [{ x: 258, y: 350 }, { x: 314, y: 326 }, { x: 295, y: 381 }], direction: { x: -0.62, y: -0.78 }, kick: PHYSICS_TUNING.slingKick, flash: 0, hitCooldown: 0, hits: 0 },
  ];
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
    pointerId: null,
    pointerType: '',
    lastPointerAt: 0,
    controlResetCount: 0,
    lastAction: 'READY',
    lastActionAt: 0,
  };

  // Stage 5.1: lazy mixer creation keeps the page silent until a real user
  // gesture unlocks it, while exposing a stable master/sfx/ui bus for Stage 5.2.
  const audio = {
    supported: Boolean(window.AudioContext || window.webkitAudioContext),
    unlocked: false,
    state: 'locked',
    muted: false,
    volume: 0.24,
    gainTarget: 0.24,
    context: null,
    master: null,
    buses: { sfx: null, ui: null },
    noiseBuffer: null,
    voiceCount: 0,
    events: [],
    lastPlayed: Object.create(null),
    error: '',
  };

  function updateAudioGain() {
    if (!audio.master || !audio.context) return;
    const target = input.muted ? 0 : audio.volume;
    const now = audio.context.currentTime;
    audio.gainTarget = target;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setTargetAtTime(target, now, 0.025);
    audio.muted = input.muted;
  }

  function unlockAudio() {
    if (!audio.supported) {
      audio.state = 'unsupported';
      return false;
    }
    try {
      if (!audio.context) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        audio.context = new AudioContextCtor();
        audio.master = audio.context.createGain();
        audio.master.gain.value = input.muted ? 0 : audio.volume;
        const compressor = audio.context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;
        audio.master.connect(compressor);
        compressor.connect(audio.context.destination);
        audio.buses.sfx = audio.context.createGain();
        audio.buses.ui = audio.context.createGain();
        audio.buses.sfx.gain.value = 1;
        audio.buses.ui.gain.value = 0.8;
        audio.buses.sfx.connect(audio.master);
        audio.buses.ui.connect(audio.master);
      }
      const resume = audio.context.resume();
      if (resume && typeof resume.catch === 'function') resume.catch(() => {});
      audio.unlocked = true;
      audio.state = audio.context.state || 'running';
      updateAudioGain();
      return true;
    } catch (error) {
      audio.error = error && error.message ? error.message : String(error);
      audio.state = 'error';
      return false;
    }
  }

  function setMuted(muted) {
    input.muted = Boolean(muted);
    updateAudioGain();
    updateMuteUi();
    markAction(input.muted ? 'MUTE ON' : 'MUTE OFF');
  }

  function toggleMute() {
    setMuted(!input.muted);
  }

  function updateMuteUi() {
    if (!muteButton) return;
    muteButton.textContent = input.muted ? 'UNMUTE' : 'SOUND ON';
    muteButton.setAttribute('aria-pressed', String(input.muted));
  }

  function updateFullscreenUi() {
    const active = Boolean(document.fullscreenElement);
    if (!fullscreenButton) return;
    fullscreenButton.textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    fullscreenButton.setAttribute('aria-pressed', String(active));
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return true;
      }
      if (!document.documentElement.requestFullscreen) throw new Error('Fullscreen API unavailable');
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      return true;
    } catch (error) {
      markAction('FULLSCREEN UNAVAILABLE');
      return false;
    }
  }

  const SOUND_COOLDOWNS = Object.freeze({
    flipper: .045,
    rail: .045,
    bumper: .075,
    target: .06,
    rollover: .08,
    kicker: .09,
    slingshot: .08,
    ramp: .16,
    rampHole: .18,
    wormhole: .22,
    launch: .18,
    drain: .35,
    nudge: .12,
    missionStart: 0,
    missionProgress: .08,
    missionComplete: 0,
    missionFail: 0,
    promotion: 0,
    multiplier: .18,
    fuel: .12,
  });

  function soundReady(name) {
    if (!audio.unlocked || input.muted || !audio.context || !audio.buses.sfx) return false;
    if (audio.context.state === 'closed') return false;
    const now = audio.context.currentTime;
    const previous = audio.lastPlayed[name] ?? -Infinity;
    const cooldown = SOUND_COOLDOWNS[name] || 0;
    if (now - previous < cooldown) return false;
    audio.lastPlayed[name] = now;
    audio.events.push(name);
    if (audio.events.length > 48) audio.events.shift();
    return true;
  }

  function soundEnvelope(gain, now, peak, duration) {
    const attack = Math.min(.008, duration * .18);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(.0001, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, now + Math.max(attack + .01, duration));
  }

  function playTone(startFrequency, endFrequency, duration, peak, type = 'sine', bus = 'sfx', detune = 0) {
    if (!audio.context || !audio.buses[bus]) return;
    const now = audio.context.currentTime;
    const oscillator = audio.context.createOscillator();
    const gain = audio.context.createGain();
    oscillator.type = type;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(Math.max(20, startFrequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    soundEnvelope(gain, now, peak, duration);
    oscillator.connect(gain);
    gain.connect(audio.buses[bus]);
    audio.voiceCount += 1;
    oscillator.addEventListener('ended', () => { audio.voiceCount = Math.max(0, audio.voiceCount - 1); }, { once: true });
    oscillator.start(now);
    oscillator.stop(now + duration + .025);
  }

  function playNoise(duration, peak, filterType = 'highpass', filterFrequency = 1200, bus = 'sfx') {
    if (!audio.context || !audio.buses[bus]) return;
    const now = audio.context.currentTime;
    if (!audio.noiseBuffer || audio.noiseBuffer.sampleRate !== audio.context.sampleRate) {
      const length = Math.max(1, Math.floor(audio.context.sampleRate * .5));
      audio.noiseBuffer = audio.context.createBuffer(1, length, audio.context.sampleRate);
      const data = audio.noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    const source = audio.context.createBufferSource();
    const filter = audio.context.createBiquadFilter();
    const gain = audio.context.createGain();
    source.buffer = audio.noiseBuffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, now);
    soundEnvelope(gain, now, peak, duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.buses[bus]);
    audio.voiceCount += 1;
    source.addEventListener('ended', () => { audio.voiceCount = Math.max(0, audio.voiceCount - 1); }, { once: true });
    source.start(now);
    source.stop(now + duration + .025);
  }

  function playSound(name, strength = 1) {
    const amount = Math.max(.2, Math.min(1.6, Number(strength) || 1));
    if (!soundReady(name)) return false;
    switch (name) {
      case 'flipper':
        playTone(180, 86, .065, .055 * amount, 'square');
        playNoise(.025, .025 * amount, 'highpass', 2200);
        break;
      case 'rail':
        playNoise(.035, .035 * amount, 'highpass', 1800);
        break;
      case 'bumper':
        playTone(170, 520, .16, .11 * amount, 'sine');
        playTone(330, 760, .11, .045 * amount, 'triangle', 'sfx', 7);
        break;
      case 'target':
        playTone(480, 780, .10, .075 * amount, 'square');
        break;
      case 'rollover':
        playTone(620, 900, .075, .045 * amount, 'triangle');
        break;
      case 'kicker':
        playTone(120, 330, .16, .10 * amount, 'triangle');
        playNoise(.04, .025 * amount, 'lowpass', 900);
        break;
      case 'slingshot':
        playTone(230, 90, .10, .07 * amount, 'sawtooth');
        break;
      case 'ramp':
        playTone(260, 640, .32, .075 * amount, 'triangle');
        break;
      case 'rampHole':
        playTone(210, 72, .20, .065 * amount, 'sine');
        break;
      case 'wormhole':
        playTone(150, 920, .38, .07 * amount, 'sawtooth');
        playNoise(.18, .022 * amount, 'bandpass', 850);
        break;
      case 'launch':
        playTone(120, 460, .45, .09 * amount, 'sawtooth');
        playNoise(.08, .025 * amount, 'lowpass', 700);
        break;
      case 'drain':
        playTone(420, 74, .42, .085 * amount, 'square');
        playNoise(.13, .03 * amount, 'lowpass', 520);
        break;
      case 'nudge':
        playTone(92, 54, .08, .045 * amount, 'sine');
        break;
      case 'missionStart':
        playTone(300, 620, .22, .065 * amount, 'triangle', 'ui');
        playTone(450, 900, .18, .040 * amount, 'sine', 'ui', 7);
        break;
      case 'missionProgress':
        playTone(520, 700, .075, .035 * amount, 'triangle', 'ui');
        break;
      case 'missionComplete':
        playTone(260, 780, .36, .085 * amount, 'triangle', 'ui');
        playTone(390, 1170, .30, .045 * amount, 'sine', 'ui', 7);
        break;
      case 'missionFail':
        playTone(300, 72, .36, .070 * amount, 'sawtooth', 'ui');
        break;
      case 'promotion':
        playTone(360, 920, .55, .095 * amount, 'triangle', 'ui');
        playTone(540, 1320, .42, .050 * amount, 'sine', 'ui', 7);
        break;
      case 'multiplier':
        playTone(680, 1180, .16, .065 * amount, 'square', 'ui');
        break;
      case 'fuel':
        playTone(410, 630, .09, .040 * amount, 'sine', 'ui');
        break;
      default:
        return false;
    }
    return true;
  }

  // Stage 2.6: explicit game lifecycle. Stage 2.9 consumes this state for
  // ball drains and the transition to game over.
  const game = {
    state: 'ready', // ready -> playing -> paused/gameover
    score: 0,
    balls: 3,
    player: 1,
    stateTime: 0,
    highScore: 0,
    rank: 0,
    rankName: 'Cadet',
    lastMessage: 'PRESS SPACE OR ENTER',
  };

  // Stage 3.4: the original table is driven by nine naval ranks and a
  // rotating set of named missions. These rules are intentionally data-first
  // so collision handlers can report events without embedding UI behavior.
  const RANK_NAMES = Object.freeze([
    'Cadet',
    'Ensign',
    'Lieutenant',
    'Captain',
    'Lt Commander',
    'Commander',
    'Commodore',
    'Admiral',
    'Fleet Admiral',
  ]);
  const MULTIPLIER_STEPS = Object.freeze([1, 2, 5, 10]);
  const MISSION_DEFINITIONS = Object.freeze([
    { id: 'target-practice', name: 'TARGET PRACTICE', objective: 'HIT THREE TARGETS', event: 'target', required: 3, timeLimit: 0, score: 10000, rankAward: 1 },
    { id: 'launch-training', name: 'LAUNCH TRAINING', objective: 'RIDE THE LAUNCH RAMP', event: 'ramp', required: 1, timeLimit: 0, score: 20000, rankAward: 1 },
    { id: 'reentry-training', name: 'RE-ENTRY TRAINING', objective: 'HIT THREE ROLLOVERS', event: 'rollover', required: 3, timeLimit: 30, score: 20000, rankAward: 1 },
    { id: 'science', name: 'SCIENCE', objective: 'FILL THE FUEL BAR', event: 'fuel', required: 3, timeLimit: 30, score: 30000, rankAward: 1 },
    { id: 'stray-comet', name: 'STRAY COMET', objective: 'HIT FIVE BUMPERS', event: 'bumper', required: 5, timeLimit: 30, score: 30000, rankAward: 1 },
    { id: 'black-hole', name: 'BLACK HOLE', objective: 'ENTER A WORMHOLE', event: 'wormhole', required: 1, timeLimit: 0, score: 50000, rankAward: 1 },
    { id: 'space-radiation', name: 'SPACE RADIATION', objective: 'HIT THREE GATES', event: 'gate', required: 3, timeLimit: 30, score: 50000, rankAward: 1 },
    { id: 'bug-hunt', name: 'BUG HUNT', objective: 'HIT FIVE TARGETS', event: 'target', required: 5, timeLimit: 30, score: 75000, rankAward: 2 },
    { id: 'alien-menace', name: 'ALIEN MENACE', objective: 'HIT THREE BUMPERS', event: 'bumper', required: 3, timeLimit: 30, score: 100000, rankAward: 2 },
    { id: 'rescue-mission', name: 'RESCUE MISSION', objective: 'TRIGGER A KICKER', event: 'kicker', required: 1, timeLimit: 0, score: 125000, rankAward: 2 },
    { id: 'satellite', name: 'SATELLITE', objective: 'HIT FOUR ROLLOVERS', event: 'rollover', required: 4, timeLimit: 30, score: 150000, rankAward: 2 },
    { id: 'reconnaissance', name: 'RECONNAISSANCE', objective: 'USE THE WORMHOLE', event: 'wormhole', required: 2, timeLimit: 45, score: 175000, rankAward: 2 },
    { id: 'doomsday-machine', name: 'DOOMSDAY MACHINE', objective: 'HIT BOTH OUTLANES', event: 'outlane', required: 2, timeLimit: 45, score: 200000, rankAward: 2 },
    { id: 'cosmic-plague', name: 'COSMIC PLAGUE', objective: 'TRIGGER BOTH FLAGS', event: 'gate', required: 5, timeLimit: 45, score: 250000, rankAward: 2 },
    { id: 'secret-yellow', name: 'SECRET MISSION: YELLOW', objective: 'ENTER THE YELLOW HOLE', event: 'yellow-wormhole', required: 1, timeLimit: 0, score: 300000, rankAward: 2 },
    { id: 'time-warp', name: 'TIME WARP', objective: 'TAKE THE SHOOTER EXIT', event: 'shooter', required: 1, timeLimit: 0, score: 350000, rankAward: 2 },
    { id: 'maelstrom', name: 'MAELSTROM', objective: 'COMPLETE TWO RAMPS', event: 'ramp', required: 2, timeLimit: 45, score: 500000, rankAward: 2 },
  ]);
  const TARGET_BANK_LIMITS = Object.freeze({
    booster: 3,
    medal: 3,
    multiplier: 3,
    fuel: 3,
    mission: 3,
    'left-hazard': 3,
    'right-hazard': 3,
  });
  const rules = {
    rank: 0,
    rankName: RANK_NAMES[0],
    rankProgress: 0,
    rankProgressMax: 3,
    missionsCompleted: 0,
    multiplierStage: 0,
    multiplier: 1,
    multiplierTimer: 0,
    multiplierLights: 0,
    fuel: 0,
    fuelMax: 12,
    boosterProgress: 0,
    medalProgress: 0,
    missionProgress: 0,
    leftHazardProgress: 0,
    rightHazardProgress: 0,
    missionReady: false,
    lastEvent: 'READY',
    promotionFlash: 0,
    bankProgress: Object.fromEntries(Object.keys(TARGET_BANK_LIMITS).map(key => [key, 0])),
    bankCompletions: Object.fromEntries(Object.keys(TARGET_BANK_LIMITS).map(key => [key, 0])),
  };
  const mission = {
    phase: 'waiting',
    index: 0,
    definition: MISSION_DEFINITIONS[0],
    name: MISSION_DEFINITIONS[0].name,
    objective: MISSION_DEFINITIONS[0].objective,
    progress: 0,
    required: MISSION_DEFINITIONS[0].required,
    timeLimit: MISSION_DEFINITIONS[0].timeLimit,
    timeRemaining: 0,
    banner: 0,
    flash: 0,
    nextDelay: 0,
    completed: 0,
    failed: 0,
    lastEvent: '',
  };

  function syncRankState() {
    rules.rankName = RANK_NAMES[rules.rank];
    game.rank = rules.rank;
    game.rankName = rules.rankName;
  }

  function resetRuleState() {
    rules.rank = 0;
    rules.rankProgress = 0;
    rules.missionsCompleted = 0;
    rules.multiplierStage = 0;
    rules.multiplier = MULTIPLIER_STEPS[0];
    rules.multiplierTimer = 0;
    rules.multiplierLights = 0;
    rules.fuel = 0;
    rules.boosterProgress = 0;
    rules.medalProgress = 0;
    rules.missionProgress = 0;
    rules.leftHazardProgress = 0;
    rules.rightHazardProgress = 0;
    rules.missionReady = false;
    rules.lastEvent = 'READY';
    rules.promotionFlash = 0;
    for (const key of Object.keys(rules.bankProgress)) rules.bankProgress[key] = 0;
    for (const key of Object.keys(rules.bankCompletions)) rules.bankCompletions[key] = 0;
    mission.phase = 'waiting';
    mission.index = 0;
    mission.definition = MISSION_DEFINITIONS[0];
    mission.name = mission.definition.name;
    mission.objective = mission.definition.objective;
    mission.progress = 0;
    mission.required = mission.definition.required;
    mission.timeLimit = mission.definition.timeLimit;
    mission.timeRemaining = 0;
    mission.banner = 0;
    mission.flash = 0;
    mission.nextDelay = 0;
    mission.completed = 0;
    mission.failed = 0;
    mission.lastEvent = '';
    syncRankState();
  }

  function startMission() {
    if (game.state !== 'playing' || mission.phase === 'active') return false;
    const definition = MISSION_DEFINITIONS[mission.index % MISSION_DEFINITIONS.length];
    mission.definition = definition;
    mission.name = definition.name;
    mission.objective = definition.objective;
    mission.required = definition.required;
    mission.timeLimit = definition.timeLimit;
    mission.timeRemaining = definition.timeLimit;
    mission.progress = 0;
    mission.phase = 'active';
    mission.banner = 3.2;
    mission.flash = 1;
    mission.nextDelay = 0;
    mission.lastEvent = '';
    game.lastMessage = `MISSION: ${definition.name}`;
    rules.lastEvent = `MISSION ${definition.name}`;
    playSound('missionStart', .9);
    markAction(`MISSION ${definition.name}`);
    return true;
  }

  function failMission() {
    if (mission.phase !== 'active') return false;
    mission.phase = 'cooldown';
    mission.failed += 1;
    mission.banner = 2.6;
    mission.flash = 1;
    mission.nextDelay = 1.8;
    mission.lastEvent = 'TIME EXPIRED';
    game.lastMessage = `${mission.name} FAILED`;
    rules.lastEvent = `${mission.name} FAILED`;
    playSound('missionFail', .9);
    mission.index = (mission.index + 1) % MISSION_DEFINITIONS.length;
    markAction('MISSION FAILED');
    return true;
  }

  function addRankProgress(amount = 1) {
    if (rules.rank >= RANK_NAMES.length - 1) return false;
    rules.rankProgress += Math.max(0, Math.floor(amount));
    let promoted = false;
    while (rules.rank < RANK_NAMES.length - 1 && rules.rankProgress >= rules.rankProgressMax) {
      rules.rankProgress -= rules.rankProgressMax;
      rules.rank += 1;
      promoted = true;
    }
    if (rules.rank >= RANK_NAMES.length - 1) rules.rankProgress = 0;
    syncRankState();
    if (promoted) {
      rules.promotionFlash = 1;
      mission.flash = 1;
      mission.banner = Math.max(mission.banner, 4.5);
      game.lastMessage = `PROMOTION TO ${rules.rankName.toUpperCase()}`;
      rules.lastEvent = game.lastMessage;
      playSound('promotion', 1);
      markAction(game.lastMessage);
    }
    return promoted;
  }

  function completeMission() {
    if (mission.phase !== 'active') return false;
    const completed = mission.definition;
    mission.phase = 'cooldown';
    mission.completed += 1;
    rules.missionsCompleted += 1;
    mission.banner = 4.2;
    mission.flash = 1;
    mission.nextDelay = 2.6;
    mission.lastEvent = 'COMPLETE';
    game.lastMessage = `${completed.name} COMPLETE`;
    rules.lastEvent = game.lastMessage;
    playSound('missionComplete', 1);
    awardScore(completed.score, 'MISSION');
    addRankProgress(completed.rankAward);
    mission.index = (mission.index + 1) % MISSION_DEFINITIONS.length;
    markAction(`MISSION COMPLETE +${completed.score}`);
    return true;
  }

  function missionEvent(event, amount = 1, label = event.toUpperCase()) {
    if (mission.phase !== 'active') return false;
    if (mission.definition.event !== event && mission.definition.event !== 'any') return false;
    mission.progress = Math.min(mission.required, mission.progress + Math.max(0, amount));
    mission.lastEvent = label;
    mission.banner = Math.max(mission.banner, 1.1);
    rules.lastEvent = label;
    if (mission.progress >= mission.required) return completeMission();
    playSound('missionProgress', .65);
    return true;
  }

  function advanceFuel(amount = 1) {
    const before = rules.fuel;
    rules.fuel = Math.min(rules.fuelMax, rules.fuel + Math.max(0, amount));
    if (rules.fuel > before) playSound('fuel', rules.fuel === rules.fuelMax ? 1 : .55);
    if (before < rules.fuelMax && rules.fuel === rules.fuelMax) {
      awardScore(25000, 'FUEL BAR');
      game.lastMessage = 'FUEL BAR FULL';
      rules.lastEvent = 'FUEL BAR FULL';
    }
  }

  function applyTargetRule(target) {
    const bank = target.bank;
    rules.lastEvent = `${bank.toUpperCase()} TARGET`;
    missionEvent('target', 1, `${bank.toUpperCase()} TARGET`);
    missionEvent(bank, 1, `${bank.toUpperCase()} TARGET`);

    if (Object.prototype.hasOwnProperty.call(rules.bankProgress, bank)) {
      rules.bankProgress[bank] = Math.min(TARGET_BANK_LIMITS[bank], rules.bankProgress[bank] + 1);
    }

    switch (bank) {
      case 'booster':
        rules.boosterProgress = rules.bankProgress.booster;
        if (rules.bankProgress.booster === TARGET_BANK_LIMITS.booster) {
          rules.bankProgress.booster = 0;
          rules.bankCompletions.booster += 1;
          awardScore(5000, 'BOOSTER BANK');
        }
        break;
      case 'medal':
        rules.medalProgress = rules.bankProgress.medal;
        if (rules.bankProgress.medal === TARGET_BANK_LIMITS.medal) {
          rules.bankProgress.medal = 0;
          rules.bankCompletions.medal += 1;
          awardScore(15000, 'MEDAL BANK');
          addRankProgress(1);
        }
        break;
      case 'multiplier': {
        const previousStage = rules.multiplierStage;
        rules.multiplierLights = rules.bankProgress.multiplier;
        rules.multiplierStage = Math.min(MULTIPLIER_STEPS.length - 1, rules.bankProgress.multiplier);
        rules.multiplier = MULTIPLIER_STEPS[rules.multiplierStage];
        rules.multiplierTimer = 30;
        if (rules.multiplierStage > previousStage) playSound('multiplier', .8);
        break;
      }
      case 'fuel':
        advanceFuel(4);
        rules.bankProgress.fuel = rules.bankProgress.fuel % TARGET_BANK_LIMITS.fuel;
        break;
      case 'mission':
        rules.missionProgress = rules.bankProgress.mission;
        if (rules.bankProgress.mission === TARGET_BANK_LIMITS.mission) {
          rules.missionReady = true;
          rules.bankCompletions.mission += 1;
        }
        break;
      case 'left-hazard':
        rules.leftHazardProgress = rules.bankProgress['left-hazard'];
        if (rules.leftHazardProgress === TARGET_BANK_LIMITS['left-hazard']) rules.bankCompletions['left-hazard'] += 1;
        break;
      case 'right-hazard':
        rules.rightHazardProgress = rules.bankProgress['right-hazard'];
        if (rules.rightHazardProgress === TARGET_BANK_LIMITS['right-hazard']) rules.bankCompletions['right-hazard'] += 1;
        break;
      case 'wormhole':
        rules.missionReady = true;
        break;
      default:
        break;
    }

    if (rules.bankCompletions['left-hazard'] > 0 && rules.bankCompletions['right-hazard'] > 0) {
      awardScore(10000, 'HAZARD BANKS');
      rules.bankCompletions['left-hazard'] = 0;
      rules.bankCompletions['right-hazard'] = 0;
    }
  }

  function applyRolloverRule(rollover) {
    const fuelRollover = /^a_roll(179|180|181|182|183|184)$/.test(rollover.id);
    if (fuelRollover) {
      advanceFuel(1);
      missionEvent('fuel', 1, 'FUEL ROLLOVER');
    }
    if (rollover.id === 'a_roll9') missionEvent('warp', 1, 'SPACE WARP');
    missionEvent('rollover', 1, 'ROLLOVER');
  }

  function updateRuleState(dt) {
    rules.promotionFlash = Math.max(0, rules.promotionFlash - dt * 2.8);
    mission.banner = Math.max(0, mission.banner - dt);
    mission.flash = Math.max(0, mission.flash - dt * 2.8);
    if (game.state !== 'playing' || input.paused) return;

    if (mission.phase === 'active' && mission.timeRemaining > 0) {
      mission.timeRemaining = Math.max(0, mission.timeRemaining - dt);
      if (mission.timeRemaining === 0) failMission();
    } else if (mission.phase === 'cooldown') {
      mission.nextDelay = Math.max(0, mission.nextDelay - dt);
      if (mission.nextDelay === 0) startMission();
    }

    if (rules.multiplierTimer > 0) {
      rules.multiplierTimer = Math.max(0, rules.multiplierTimer - dt);
      if (rules.multiplierTimer === 0 && rules.multiplierStage > 0) {
        rules.multiplierStage -= 1;
        rules.multiplierLights = rules.multiplierStage;
        rules.multiplier = MULTIPLIER_STEPS[rules.multiplierStage];
        rules.multiplierTimer = rules.multiplierStage > 0 ? 30 : 0;
      }
    }
  }

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
    if (statusNode) statusNode.textContent = message;
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
    resetVisualFx();
    resetRuleState();
    resetTableFeatures();
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
    ball.transport = null;
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
    if (statusNode) statusNode.textContent = label;
  }

  function setButton(action, pressed, source = 'KEY', options = {}) {
    if (action !== 'left' && action !== 'right' && action !== 'plunger') return;
    const wasPressed = input[action];
    input[action] = pressed;
    if (pressed) {
      if (action === 'plunger' && game.state === 'ready') beginGame();
      if (!wasPressed && (action === 'left' || action === 'right')) playSound('flipper', .85);
      markAction(`${source} ${action.toUpperCase()}`);
    } else if (action === 'plunger' && wasPressed && options.launch !== false) {
      launchBall();
    }
  }

  function releaseAllControls(source = 'FOCUS RESET') {
    const hadControl = input.left || input.right || input.plunger || input.nudgeX !== 0 || input.pointerAction !== null;
    input.left = false;
    input.right = false;
    input.plunger = false;
    input.nudgeX = 0;
    input.nudgeUntil = 0;
    input.pointerAction = null;
    input.pointerId = null;
    input.pointerType = '';
    if (hadControl) {
      input.controlResetCount += 1;
      markAction(source);
    }
  }

  function keyAction(code) {
    if (code === 'KeyZ' || code === 'ShiftLeft') return 'left';
    if (code === 'Slash' || code === 'ShiftRight') return 'right';
    if (code === 'Space') return 'plunger';
    return null;
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    unlockAudio();
    const action = keyAction(event.code);
    if (action || ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyP', 'KeyH', 'KeyM', 'KeyR', 'KeyF', 'F11', 'Enter', 'Escape'].includes(event.code)) {
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
      playSound('nudge', .9);
      markAction('NUDGE LEFT');
    } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      input.nudgeX = 1;
      input.nudgeUntil = simTime + 0.12;
      playSound('nudge', .9);
      markAction('NUDGE RIGHT');
    } else if (event.code === 'KeyP') {
      pauseOrResume();
    } else if (event.code === 'KeyH') {
      input.help = !input.help;
      markAction(input.help ? 'HELP ON' : 'HELP OFF');
    } else if (event.code === 'KeyM') {
      toggleMute();
    } else if (event.code === 'KeyR') {
      startNewGame();
    } else if (event.code === 'KeyF' || event.code === 'F11') {
      toggleFullscreen();
    } else if (event.code === 'Escape') {
      if (input.help) {
        input.help = false;
        markAction('HELP OFF');
      } else if (game.state === 'playing' || game.state === 'paused') {
        pauseOrResume();
      }
    } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
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
    // Keep the touch zones aligned to the projected lower apron: left bat,
    // right bat, then the shooter lane. This works for mouse and touch alike.
    const localX = x - board.x;
    if (localX < 175) return 'left';
    if (localX < 282) return 'right';
    return 'plunger';
  }

  function onPointerDown(event) {
    event.preventDefault();
    unlockAudio();
    if (canvas.focus) canvas.focus({ preventScroll: true });
    if (input.pointerAction) releaseAllControls('TOUCH RESET');
    const pos = pointerPosition(event);
    const action = pointerActionAt(pos.x, pos.y);
    if (!action) return;
    input.pointerAction = action;
    input.pointerId = event.pointerId ?? null;
    input.pointerType = event.pointerType || 'pointer';
    input.lastPointerAt = performance.now();
    try {
      if (canvas.setPointerCapture && event.pointerId != null) canvas.setPointerCapture(event.pointerId);
    } catch (_) { /* synthetic/test pointer events may not be capturable */ }
    setButton(action, true, 'TOUCH');
  }

  function onPointerMove(event) {
    if (!input.pointerAction) return;
    if (input.pointerId !== null && event.pointerId != null && event.pointerId !== input.pointerId) return;
    event.preventDefault();
    const pos = pointerPosition(event);
    const nextAction = pointerActionAt(pos.x, pos.y);
    input.lastPointerAt = performance.now();
    if (nextAction === input.pointerAction) return;
    setButton(input.pointerAction, false, 'TOUCH', { launch: false });
    input.pointerAction = nextAction;
    if (nextAction) setButton(nextAction, true, 'TOUCH');
  }

  function releasePointerAction(event) {
    if (event && event.pointerId != null && input.pointerId !== null && event.pointerId !== input.pointerId) return;
    if (event && event.cancelable) event.preventDefault();
    if (input.pointerAction) setButton(input.pointerAction, false, 'TOUCH');
    input.pointerAction = null;
    input.pointerId = null;
    input.pointerType = '';
  }

  // Stage 2.4 + 3.1: the ball now lives in the same projected screen space
  // as the reference table, so every later component can share one map.
  const ballPhysics = {
    width: playfield.w,
    height: playfield.h + 34,
    gravity: PHYSICS_TUNING.gravity,
    airDrag: PHYSICS_TUNING.airDrag,
    maxSpeed: PHYSICS_TUNING.maxSpeed,
    radius: PHYSICS_TUNING.ballRadius,
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
    transport: null,
    routeGrace: 0,
    shooterExited: false,
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
    y: PHYSICS_TUNING.drainY,
    minX: PHYSICS_TUNING.drainMinX,
    maxX: PHYSICS_TUNING.drainMaxX,
    funnelDepth: PHYSICS_TUNING.drainFunnelDepth,
    funnelInset: PHYSICS_TUNING.drainFunnelInset,
    captureDepth: PHYSICS_TUNING.drainCaptureDepth,
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

  // Stage 4.3: transient visual effects are separate from collision state so
  // the renderer can add readable sparks, rings, and flashes without changing
  // deterministic physics.
  const visualFx = {
    particles: [],
    rings: [],
    flash: 0,
    flashColor: '#fff0a0',
  };

  function effectColor(label) {
    const upper = String(label).toUpperCase();
    if (upper.includes('BUMPER') || upper.includes('KICKER')) return '#f0a84d';
    if (upper.includes('RAMP') || upper.includes('ROCKET')) return '#ffe07b';
    if (upper.includes('WORMHOLE') || upper.includes('HYPER')) return '#76e1df';
    if (upper.includes('DRAIN')) return '#ea6b78';
    if (upper.includes('TARGET') || upper.includes('MISSION')) return '#d6a8f2';
    return '#b5ecf2';
  }

  function spawnImpactFx(x, y, label = 'HIT') {
    const color = effectColor(label);
    const upper = String(label).toUpperCase();
    const energy = upper.includes('BUMPER') || upper.includes('KICKER') ? 1.35 : 1;
    const count = upper.includes('BUMPER') ? 10 : 5;
    visualFx.rings.push({ x, y, radius: 3, growth: 28 * energy, life: 1, color });
    if (visualFx.rings.length > VISUAL_TUNING.maxRings) visualFx.rings.shift();
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + (x + y) * .013;
      const speed = (24 + (index % 3) * 11) * energy;
      visualFx.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: index % 3 === 0 ? 1.7 : 1.1,
        color,
      });
    }
    if (visualFx.particles.length > VISUAL_TUNING.maxParticles) {
      visualFx.particles.splice(0, visualFx.particles.length - VISUAL_TUNING.maxParticles);
    }
    visualFx.flash = Math.max(visualFx.flash, upper.includes('BUMPER') ? .28 : .14);
    visualFx.flashColor = color;
  }

  function resetVisualFx() {
    visualFx.particles.length = 0;
    visualFx.rings.length = 0;
    visualFx.flash = 0;
    visualFx.flashColor = '#fff0a0';
  }

  function updateVisualFx(dt) {
    visualFx.flash = Math.max(0, visualFx.flash - dt * VISUAL_TUNING.flashDecay);
    for (const particle of visualFx.particles) {
      particle.life -= dt * 2.8;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-dt * 2.2);
      particle.vy *= Math.exp(-dt * 2.2);
    }
    visualFx.particles = visualFx.particles.filter(particle => particle.life > 0);
    for (const ring of visualFx.rings) {
      ring.life -= dt * 2.3;
      ring.radius += ring.growth * dt;
    }
    visualFx.rings = visualFx.rings.filter(ring => ring.life > 0);
  }

  function armPlunger() {
    plunger.armed = true;
    plunger.charge = 0;
    plunger.lastLaunchSpeed = 0;
    resetBallMotion(false);
  }

  function drainOpeningBounds(y) {
    const progress = Math.max(0, Math.min(1, (y - drain.y) / drain.funnelDepth));
    return {
      minX: drain.minX + drain.funnelInset * progress,
      maxX: drain.maxX - drain.funnelInset * progress,
    };
  }

  function ballHasEnteredDrain() {
    const bottom = ball.y + ball.radius;
    if (bottom <= drain.y + drain.captureDepth) return false;
    const opening = drainOpeningBounds(bottom);
    return ball.x > opening.minX - ball.radius
      && ball.x < opening.maxX + ball.radius;
  }

  function drainBall(reason = 'OPEN DRAIN') {
    if (!ball.active || game.state !== 'playing' || drain.cooldown > 0) return false;

    ball.active = false;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail.length = 0;
    drain.cooldown = drain.serviceTime;
    drain.flash = 1;
    playSound('drain', 1);
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
    ball.transport = null;
    ball.routeGrace = 0;
    ball.shooterExited = false;
    ball.x = plunger.laneX;
    ball.y = plunger.laneBottom - 2;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    // A small leftward bias lets the ball leave the shooter when it reaches the lane exit.
    ball.vx = -18;
    ball.vy = -launchSpeed;
    ball.age = 0;
    ball.trail.length = 0;
    playSound('launch', .9);
    markAction(`LAUNCH ${plunger.lastLaunchSpeed}`);
    if (mission.phase === 'waiting') startMission();
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
    ball.transport = null;
    ball.routeGrace = 0;
    ball.shooterExited = false;
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
    if (ball.transport) {
      updateBallTransport(dt);
      return;
    }

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
    collideBallWithTableFeatures();
    if (ball.transport) return;
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
    { id: 'top-rail', a: tableCorners.topLeft, b: tableCorners.topRight, restitution: PHYSICS_TUNING.wallRestitution },
    { id: 'left-rail', a: tableCorners.topLeft, b: tableCorners.bottomLeft, restitution: PHYSICS_TUNING.wallRestitution },
    { id: 'right-rail', a: tableCorners.topRight, b: tableCorners.bottomRight, restitution: PHYSICS_TUNING.wallRestitution },
    { id: 'shooter-rail', a: shooterRail[0], b: shooterRail[1], restitution: PHYSICS_TUNING.shooterRestitution },
  ];

  // The seven bumper anchors come from the original a_bump1–a_bump7
  // records. Their screen positions are deliberately kept as data, so later
  // rule/visual stages can add targets without inventing a second coordinate map.
  const bumpers = mappedTable.bumpers;
  const targets = mappedTable.targets;
  const rollovers = mappedTable.rollovers;
  const laneGuides = mappedTable.guides;
  const gates = mappedTable.gates;
  const kickers = mappedTable.kickers;
  const slingshots = mappedTable.slingshots;
  const ramps = mappedTable.ramps;
  const holes = mappedTable.holes;
  const wormholes = mappedTable.wormholes;
  const shooterExit = mappedTable.shooterExit;

  const wormholeState = {
    destination: 0,
    flash: 0,
    lastEntry: '',
  };
  const rocket = {
    x: ramps[0].exit.x + 43,
    y: ramps[0].exit.y - 8,
    flash: 0,
    launches: 0,
  };

  const collisionState = {
    wallHits: 0,
    flipperHits: 0,
    bumperHits: 0,
    targetHits: 0,
    rolloverHits: 0,
    guideHits: 0,
    gateHits: 0,
    kickerHits: 0,
    slingshotHits: 0,
    rampRailHits: 0,
    rampHits: 0,
    rampHoleHits: 0,
    wormholeHits: 0,
    shooterExits: 0,
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
    const baseValue = Math.max(0, Math.floor(points));
    const multiplier = Math.max(1, rules.multiplier || 1);
    const value = baseValue * multiplier;
    addScore(value);
    scoring.hits += 1;
    scoring.totalPoints += value;
    scoring.lastPoints = value;
    scoring.lastLabel = `${label}${multiplier > 1 ? ` x${multiplier}` : ''} +${value}`;
    scoring.flash = 1;
    scoring.combo = scoring.comboTimer > 0 ? scoring.combo + 1 : 1;
    scoring.comboTimer = 1.5;
    scoring.popups.push({ x, y, points: value, life: 1 });
    if (scoring.popups.length > 12) scoring.popups.shift();
    spawnImpactFx(x, y, label);
    markAction(`${label} +${value}`);
  }

  function recordWallImpact(x, y, nx, ny) {
    collisionState.wallHits += 1;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'wall' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(10, 'RAIL', x, y);
    playSound('rail', .55);
  }

  function collideBallWithSegment(segment, impactRecorder = recordWallImpact) {
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
      ball.vx -= tangentVelocity * PHYSICS_TUNING.tangentialDamping * tangentX;
      ball.vy -= tangentVelocity * PHYSICS_TUNING.tangentialDamping * tangentY;
      limitBallSpeed();
      impactRecorder(nearest.x, nearest.y, nx, ny, segment);
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

  function recordGuideImpact(x, y, nx, ny, guide) {
    collisionState.guideHits += 1;
    guide.hits += 1;
    guide.flash = 1;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'guide' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(15, 'GUIDE', x, y);
    playSound('rail', .45);
    missionEvent('guide', 1, 'LANE GUIDE');
  }

  function recordGateImpact(x, y, nx, ny, gate) {
    collisionState.gateHits += 1;
    gate.hits += 1;
    gate.flash = 1;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'gate' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(25, 'GATE', x, y);
    playSound('rail', .55);
    missionEvent('gate', 1, 'GATE');
  }

  function collideBallWithGates() {
    let collided = false;
    for (const gate of gates) {
      if (gate.enabled) collided = collideBallWithSegment(gate, recordGateImpact) || collided;
    }
    return collided;
  }

  function collideBallWithGuides() {
    let collided = false;
    for (const guide of laneGuides) collided = collideBallWithSegment(guide, recordGuideImpact) || collided;
    return collided;
  }

  function recordTargetImpact(x, y, nx, ny, target) {
    collisionState.targetHits += 1;
    target.hits += 1;
    target.lit = true;
    target.flash = 1;
    target.hitCooldown = 0.12;
    target.active = false;
    target.dropTimer = 0.82;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'target' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(target.score, target.bank.toUpperCase(), x, y);
    playSound('target', .9);
    applyTargetRule(target);
    if (target.id === 'a_targ22' && wormholes.length) {
      wormholeState.destination = (wormholeState.destination + 1) % wormholes.length;
      wormholeState.flash = 1;
      game.lastMessage = `${wormholes[wormholeState.destination].label} WORMHOLE OPEN`;
      markAction(`WORMHOLE ${wormholeState.destination + 1}`);
    }
  }

  function collideBallWithTarget(target) {
    if (!target.active || target.hitCooldown > 0) return false;
    const dx = ball.x - target.x;
    const dy = ball.y - target.y;
    let distance = Math.hypot(dx, dy);
    let nx = distance > 0.0001 ? dx / distance : 0;
    let ny = distance > 0.0001 ? dy / distance : -1;
    if (distance < 0.0001) distance = 0;
    const hitRadius = ball.radius + target.collisionRadius;
    const penetration = hitRadius - distance;
    if (penetration <= 0) return false;

    ball.x += nx * (penetration + PHYSICS_TUNING.collisionSlop);
    ball.y += ny * (penetration + PHYSICS_TUNING.collisionSlop);
    const normalVelocity = ball.vx * nx + ball.vy * ny;
    if (normalVelocity < 0) {
      ball.vx -= (1 + PHYSICS_TUNING.targetRestitution) * normalVelocity * nx;
      ball.vy -= (1 + PHYSICS_TUNING.targetRestitution) * normalVelocity * ny;
    }
    ball.vx += nx * PHYSICS_TUNING.targetKick;
    ball.vy += ny * PHYSICS_TUNING.targetKick;
    limitBallSpeed();
    recordTargetImpact(target.x + nx * target.collisionRadius, target.y + ny * target.collisionRadius, nx, ny, target);
    return true;
  }

  function collideBallWithTargets() {
    let collided = false;
    for (const target of targets) collided = collideBallWithTarget(target) || collided;
    return collided;
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;
      const crosses = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function collideBallWithRollovers() {
    let triggered = false;
    for (const rollover of rollovers) {
      const distance = Math.hypot(ball.x - rollover.x, ball.y - rollover.y);
      const inside = pointInPolygon(ball.x, ball.y, rollover.points)
        || distance <= rollover.triggerRadius + ball.radius * 0.35;
      if (inside && !rollover.inside && rollover.hitCooldown <= 0) {
        rollover.lit = true;
        rollover.flash = 1;
        rollover.hitCooldown = 0.16;
        rollover.hits += 1;
        collisionState.rolloverHits += 1;
        collisionState.impacts.push({ x: rollover.x, y: rollover.y, nx: 0, ny: -1, life: 1, kind: 'rollover' });
        if (collisionState.impacts.length > 16) collisionState.impacts.shift();
        awardScore(rollover.score, 'ROLLOVER', rollover.x, rollover.y);
        playSound('rollover', .75);
        applyRolloverRule(rollover);
        triggered = true;
      }
      rollover.inside = inside;
    }
    return triggered;
  }

  function recordKickerImpact(kicker) {
    collisionState.kickerHits += 1;
    kicker.hits += 1;
    kicker.flash = 1;
    kicker.hitCooldown = 0.20;
    collisionState.impacts.push({ x: kicker.x, y: kicker.y, nx: kicker.direction.x, ny: kicker.direction.y, life: 1, kind: 'kicker' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(kicker.points, 'KICKER', kicker.x, kicker.y);
    playSound('kicker', 1);
    missionEvent('kicker', 1, 'KICKER');
  }

  function collideBallWithKicker(kicker) {
    if (kicker.hitCooldown > 0) return false;
    const dx = ball.x - kicker.x;
    const dy = ball.y - kicker.y;
    const distance = Math.hypot(dx, dy);
    const hitRadius = ball.radius + kicker.radius;
    if (distance >= hitRadius) return false;
    const nx = distance > 0.0001 ? dx / distance : kicker.direction.x;
    const ny = distance > 0.0001 ? dy / distance : kicker.direction.y;
    ball.x = kicker.x + nx * (hitRadius + PHYSICS_TUNING.collisionSlop);
    ball.y = kicker.y + ny * (hitRadius + PHYSICS_TUNING.collisionSlop);
    ball.vx = kicker.direction.x * kicker.kick + ball.vx * 0.12;
    ball.vy = kicker.direction.y * kicker.kick + ball.vy * 0.12;
    limitBallSpeed();
    recordKickerImpact(kicker);
    return true;
  }

  function collideBallWithKickers() {
    let collided = false;
    for (const kicker of kickers) collided = collideBallWithKicker(kicker) || collided;
    return collided;
  }

  function polygonCenter(points) {
    return points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 });
  }

  function recordSlingshotImpact(sling) {
    collisionState.slingshotHits += 1;
    sling.hits += 1;
    sling.flash = 1;
    sling.hitCooldown = 0.18;
    const center = polygonCenter(sling.points);
    const dx = ball.x - center.x;
    const dy = ball.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    collisionState.impacts.push({ x: ball.x, y: ball.y, nx: dx / length, ny: dy / length, life: 1, kind: 'slingshot' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(500, 'SLINGSHOT', ball.x, ball.y);
    playSound('slingshot', .9);
    missionEvent('slingshot', 1, 'SLINGSHOT');
  }

  function collideBallWithSlingshot(sling) {
    if (sling.hitCooldown > 0) return false;
    const center = polygonCenter(sling.points);
    let nearest = null;
    let distance = Infinity;
    for (let i = 0; i < sling.points.length; i += 1) {
      const a = sling.points[i];
      const b = sling.points[(i + 1) % sling.points.length];
      const candidate = closestPointOnSegment(ball.x, ball.y, a.x, a.y, b.x, b.y);
      const candidateDistance = Math.hypot(ball.x - candidate.x, ball.y - candidate.y);
      if (candidateDistance < distance) {
        distance = candidateDistance;
        nearest = candidate;
      }
    }
    const inside = pointInPolygon(ball.x, ball.y, sling.points);
    if (!inside && distance > ball.radius + 1.5) return false;

    let nx = ball.x - (nearest ? nearest.x : center.x);
    let ny = ball.y - (nearest ? nearest.y : center.y);
    const normalLength = Math.hypot(nx, ny) || 1;
    nx /= normalLength;
    ny /= normalLength;
    const penetration = inside ? ball.radius + 1.5 : ball.radius + 1.5 - distance;
    ball.x += nx * Math.max(0.2, penetration);
    ball.y += ny * Math.max(0.2, penetration);
    ball.vx += sling.direction.x * sling.kick;
    ball.vy += sling.direction.y * sling.kick;
    limitBallSpeed();
    recordSlingshotImpact(sling);
    return true;
  }

  function collideBallWithSlingshots() {
    let collided = false;
    for (const sling of slingshots) collided = collideBallWithSlingshot(sling) || collided;
    return collided;
  }

  function normalizedVector(vector) {
    const length = Math.hypot(vector.x, vector.y) || 1;
    return { x: vector.x / length, y: vector.y / length };
  }

  function recordRampRailImpact(x, y, nx, ny, ramp) {
    collisionState.rampRailHits += 1;
    ramp.flash = 1;
    collisionState.impacts.push({ x, y, nx, ny, life: 1, kind: 'ramp-rail' });
    if (collisionState.impacts.length > 16) collisionState.impacts.shift();
    awardScore(20, 'RAMP RAIL', x, y);
  }

  function collideBallWithRampRails(ramp) {
    let collided = false;
    for (const rail of ramp.rails) {
      for (let i = 1; i < rail.length; i += 1) {
        collided = collideBallWithSegment({
          a: rail[i - 1],
          b: rail[i],
          restitution: PHYSICS_TUNING.rampRailRestitution,
        }, (x, y, nx, ny) => recordRampRailImpact(x, y, nx, ny, ramp)) || collided;
      }
    }
    return collided;
  }

  function startRampRide(ramp, progress = 0, fromHole = false) {
    if (!ramp || ramp.cooldown > 0 || ball.transport) return false;
    const sample = polylineSample(ramp.path, progress);
    ramp.active = true;
    ramp.flash = 1;
    ramp.cooldown = 0.70;
    ramp.hits += 1;
    collisionState.rampHits += 1;
    ball.transport = {
      type: 'ramp',
      ramp,
      progress: Math.max(0, Math.min(0.94, progress)),
      speed: ramp.speed,
      fromHole,
    };
    ball.x = sample.x;
    ball.y = sample.y;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.vx = 0;
    ball.vy = 0;
    if (!fromHole) awardScore(ramp.points, ramp.kind === 'launch' ? 'LAUNCH RAMP' : 'HYPERSPACE', ball.x, ball.y);
    game.lastMessage = ramp.kind === 'launch' ? 'LAUNCH RAMP — ROCKET RUN' : 'HYPERSPACE RAMP';
    markAction(ramp.label);
    return true;
  }

  function tryStartRampRide(ramp) {
    if (ramp.cooldown > 0 || ball.transport || ball.routeGrace > 0) return false;
    const nearest = nearestPointOnPolyline(ball.x, ball.y, ramp.path);
    const corridor = ramp.width * 0.60 + ball.radius;
    if (nearest.distance > corridor) return false;
    const along = ball.vx * nearest.tangentX + ball.vy * nearest.tangentY;
    const entryWindow = nearest.progress < 0.22 && along > -160;
    if (!entryWindow && along < 18) return false;
    return startRampRide(ramp, nearest.progress);
  }

  function startRampHoleCapture(hole) {
    if (hole.hitCooldown > 0 || ball.transport) return false;
    hole.flash = 1;
    hole.hitCooldown = 0.25;
    hole.hits += 1;
    collisionState.rampHoleHits += 1;
    ball.transport = {
      type: 'hole',
      hole,
      elapsed: 0,
      duration: hole.captureTime,
    };
    ball.x = hole.x;
    ball.y = hole.y;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.vx = 0;
    ball.vy = 0;
    awardScore(hole.points, 'RAMP HOLE', hole.x, hole.y);
    playSound('rampHole', .9);
    missionEvent('hole', 1, 'RAMP HOLE');
    game.lastMessage = 'RAMP HOLE — BALL CAPTURED';
    markAction('RAMP HOLE');
    return true;
  }

  function startWormholeCapture(wormhole) {
    if (wormhole.hitCooldown > 0 || ball.transport) return false;
    wormhole.flash = 1;
    wormhole.hitCooldown = 0.90;
    wormhole.hits += 1;
    collisionState.wormholeHits += 1;
    wormholeState.lastEntry = wormhole.label;
    ball.transport = {
      type: 'wormhole',
      wormhole,
      elapsed: 0,
      duration: wormhole.captureTime,
    };
    ball.x = wormhole.x;
    ball.y = wormhole.y;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.vx = 0;
    ball.vy = 0;
    awardScore(wormhole.points, `${wormhole.label} WORMHOLE`, wormhole.x, wormhole.y);
    playSound('wormhole', 1);
    missionEvent('wormhole', 1, `${wormhole.label} WORMHOLE`);
    missionEvent(`${wormhole.label.toLowerCase()}-wormhole`, 1, `${wormhole.label} WORMHOLE`);
    game.lastMessage = `${wormhole.label} WORMHOLE — CAPTURED`;
    markAction(`${wormhole.label} WORMHOLE`);
    return true;
  }

  function startShooterExit() {
    if (ball.transport || ball.shooterExited || shooterExit.cooldown > 0 || !shooterExit) return false;
    const start = shooterExit.path[0];
    if (ball.y > start.y + 9 || ball.x < plunger.laneX - ball.radius * 2 || ball.vy >= 0) return false;
    shooterExit.active = true;
    shooterExit.flash = 1;
    shooterExit.cooldown = 0.60;
    shooterExit.hits += 1;
    collisionState.shooterExits += 1;
    ball.transport = {
      type: 'shooter',
      path: shooterExit.path,
      progress: 0,
      speed: 278,
    };
    ball.x = start.x;
    ball.y = start.y;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.vx = 0;
    ball.vy = 0;
    missionEvent('shooter', 1, 'SHOOTER EXIT');
    playSound('ramp', .7);
    game.lastMessage = 'SHOOTER EXIT — BALL IN PLAY';
    markAction('SHOOTER EXIT');
    return true;
  }

  function updateBallTransport(dt) {
    if (!ball.transport) return;
    const transport = ball.transport;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    if (transport.type === 'ramp') {
      const ramp = transport.ramp;
      transport.progress += transport.speed * dt / (ramp.length || 1);
      const sample = polylineSample(ramp.path, transport.progress);
      ball.x = sample.x;
      ball.y = sample.y;
      ball.vx = sample.tangentX * transport.speed;
      ball.vy = sample.tangentY * transport.speed;
      if (transport.progress >= 1) {
        ramp.active = false;
        ramp.flash = 1;
        const exit = polylineSample(ramp.path, 1);
        ball.transport = null;
        ball.x = exit.x + exit.tangentX * 2;
        ball.y = exit.y + exit.tangentY * 2;
        ball.vx = exit.tangentX * (ramp.kind === 'launch' ? 230 : 255);
        ball.vy = exit.tangentY * (ramp.kind === 'launch' ? 230 : 255);
        ball.shooterExited = false;
        if (ramp.kind === 'launch') {
          rocket.flash = 1;
          rocket.launches += 1;
          missionEvent('ramp', 1, 'LAUNCH RAMP');
          playSound('launch', 1);
          game.lastMessage = 'ROCKET LAUNCH — +5000';
          markAction('ROCKET LAUNCH');
        } else {
          missionEvent('hyperspace', 1, 'HYPERSPACE RAMP');
          playSound('wormhole', .8);
          game.lastMessage = 'HYPERSPACE RETURN';
          markAction('HYPERSPACE RETURN');
        }
      }
    } else if (transport.type === 'hole') {
      const hole = transport.hole;
      transport.elapsed += dt;
      const pulse = Math.sin(transport.elapsed * 34) * Math.max(0, 1 - transport.elapsed / transport.duration) * 2.2;
      ball.x = hole.x + pulse;
      ball.y = hole.y + Math.cos(transport.elapsed * 28) * Math.max(0, 1 - transport.elapsed / transport.duration) * 1.7;
      ball.vx = 0;
      ball.vy = 0;
      if (transport.elapsed >= transport.duration) {
        const ramp = ramps.find(item => item.id === hole.route);
        ball.transport = null;
        if (ramp) {
          ball.x = ramp.entry.x;
          ball.y = ramp.entry.y;
          startRampRide(ramp, 0, true);
        } else {
          resetBallMotion();
        }
      }
    } else if (transport.type === 'wormhole') {
      const wormhole = transport.wormhole;
      transport.elapsed += dt;
      const swirl = Math.max(0, 1 - transport.elapsed / transport.duration);
      const angle = transport.elapsed * 28;
      ball.x = wormhole.x + Math.cos(angle) * swirl * 4;
      ball.y = wormhole.y + Math.sin(angle) * swirl * 4;
      ball.vx = 0;
      ball.vy = 0;
      wormholeState.flash = 1;
      if (transport.elapsed >= transport.duration) {
        const eject = normalizedVector(wormhole.eject);
        ball.transport = null;
        ball.x = wormhole.x + eject.x * (wormhole.radius + ball.radius + 1);
        ball.y = wormhole.y + eject.y * (wormhole.radius + ball.radius + 1);
        ball.vx = eject.x * 238;
        ball.vy = eject.y * 238;
        wormhole.hitCooldown = 0.90;
        ball.routeGrace = 0.45;
        game.lastMessage = `${wormhole.label} WORMHOLE — EJECTED`;
        markAction(`${wormhole.label} EJECT`);
      }
    } else if (transport.type === 'shooter') {
      transport.progress += transport.speed * dt / (shooterExit.length || 1);
      const sample = polylineSample(transport.path, transport.progress);
      ball.x = sample.x;
      ball.y = sample.y;
      ball.vx = sample.tangentX * transport.speed;
      ball.vy = sample.tangentY * transport.speed;
      if (transport.progress >= 1) {
        shooterExit.active = false;
        shooterExit.flash = 1;
        const exit = polylineSample(transport.path, 1);
        ball.transport = null;
        ball.x = exit.x;
        ball.y = exit.y;
        ball.vx = exit.tangentX * 165;
        ball.vy = exit.tangentY * 165;
        ball.routeGrace = 0.45;
        ball.shooterExited = true;
      }
    }
    ball.trail.push({ x: ball.x, y: ball.y, life: 1 });
    if (ball.trail.length > 10) ball.trail.shift();
    for (const point of ball.trail) point.life *= 0.90;
  }

  function collideBallWithRamps() {
    let collided = false;
    for (const ramp of ramps) {
      if (tryStartRampRide(ramp)) return true;
    }
    for (const ramp of ramps) collided = collideBallWithRampRails(ramp) || collided;
    return collided;
  }

  function collideBallWithRampHole(hole) {
    const distance = Math.hypot(ball.x - hole.x, ball.y - hole.y);
    if (distance > hole.radius + ball.radius) return false;
    return startRampHoleCapture(hole);
  }

  function collideBallWithHoles() {
    let collided = false;
    for (const hole of holes) collided = collideBallWithRampHole(hole) || collided;
    return collided;
  }

  function collideBallWithWormhole(wormhole) {
    const distance = Math.hypot(ball.x - wormhole.x, ball.y - wormhole.y);
    if (distance > wormhole.radius + ball.radius) return false;
    return startWormholeCapture(wormhole);
  }

  function collideBallWithWormholes() {
    let collided = false;
    for (const wormhole of wormholes) collided = collideBallWithWormhole(wormhole) || collided;
    return collided;
  }

  function collideBallWithShooterExit() {
    return startShooterExit();
  }

  function collideBallWithTableFeatures() {
    let collided = false;
    collided = collideBallWithRamps() || collided;
    if (ball.transport) return true;
    collided = collideBallWithHoles() || collided;
    if (ball.transport) return true;
    collided = collideBallWithWormholes() || collided;
    if (ball.transport) return true;
    collided = collideBallWithShooterExit() || collided;
    if (ball.transport) return true;
    collided = collideBallWithGuides() || collided;
    collided = collideBallWithGates() || collided;
    collided = collideBallWithTargets() || collided;
    collided = collideBallWithRollovers() || collided;
    collided = collideBallWithSlingshots() || collided;
    collided = collideBallWithKickers() || collided;
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
    playSound('bumper', 1);
    missionEvent('bumper', 1, 'BUMPER');
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

  function updateTableFeatures(dt) {
    for (const target of targets) {
      target.flash = Math.max(0, target.flash - dt * 5.4);
      target.hitCooldown = Math.max(0, target.hitCooldown - dt);
      if (!target.active) {
        target.dropTimer = Math.max(0, target.dropTimer - dt);
        if (target.dropTimer === 0) target.active = true;
      }
    }
    for (const rollover of rollovers) {
      rollover.flash = Math.max(0, rollover.flash - dt * 4.5);
      rollover.hitCooldown = Math.max(0, rollover.hitCooldown - dt);
    }
    for (const guide of laneGuides) guide.flash = Math.max(0, guide.flash - dt * 5);
    for (const gate of gates) gate.flash = Math.max(0, gate.flash - dt * 5);
    for (const kicker of kickers) {
      kicker.flash = Math.max(0, kicker.flash - dt * 5.5);
      kicker.hitCooldown = Math.max(0, kicker.hitCooldown - dt);
    }
    for (const sling of slingshots) {
      sling.flash = Math.max(0, sling.flash - dt * 5.5);
      sling.hitCooldown = Math.max(0, sling.hitCooldown - dt);
    }
    for (const ramp of ramps) {
      ramp.flash = Math.max(0, ramp.flash - dt * 4.5);
      ramp.cooldown = Math.max(0, ramp.cooldown - dt);
      if (ramp.cooldown === 0) ramp.active = false;
    }
    for (const hole of holes) {
      hole.flash = Math.max(0, hole.flash - dt * 4.5);
      hole.hitCooldown = Math.max(0, hole.hitCooldown - dt);
    }
    for (const wormhole of wormholes) {
      wormhole.flash = Math.max(0, wormhole.flash - dt * 4.2);
      wormhole.hitCooldown = Math.max(0, wormhole.hitCooldown - dt);
    }
    shooterExit.flash = Math.max(0, shooterExit.flash - dt * 4.5);
    shooterExit.cooldown = Math.max(0, shooterExit.cooldown - dt);
    rocket.flash = Math.max(0, rocket.flash - dt * 3.6);
    wormholeState.flash = Math.max(0, wormholeState.flash - dt * 2.8);
    if (ball.shooterExited && ball.y > shooterExit.path[0].y + 58) ball.shooterExited = false;
  }

  function resetTableFeatures() {
    for (const target of targets) {
      target.active = true;
      target.lit = false;
      target.inside = false;
      target.flash = 0;
      target.hitCooldown = 0;
      target.hits = 0;
      target.dropTimer = 0;
    }
    for (const rollover of rollovers) {
      rollover.lit = false;
      rollover.inside = false;
      rollover.flash = 0;
      rollover.hitCooldown = 0;
      rollover.hits = 0;
    }
    for (const guide of laneGuides) { guide.flash = 0; guide.hits = 0; }
    for (const gate of gates) { gate.flash = 0; gate.hits = 0; gate.enabled = true; }
    for (const kicker of kickers) { kicker.flash = 0; kicker.hitCooldown = 0; kicker.hits = 0; }
    for (const sling of slingshots) { sling.flash = 0; sling.hitCooldown = 0; sling.hits = 0; }
    for (const ramp of ramps) { ramp.flash = 0; ramp.cooldown = 0; ramp.hits = 0; ramp.active = false; }
    for (const hole of holes) { hole.flash = 0; hole.hitCooldown = 0; hole.hits = 0; }
    for (const wormhole of wormholes) { wormhole.flash = 0; wormhole.hitCooldown = 0; wormhole.hits = 0; }
    shooterExit.flash = 0;
    shooterExit.cooldown = 0;
    shooterExit.hits = 0;
    shooterExit.active = false;
    rocket.flash = 0;
    rocket.launches = 0;
    wormholeState.destination = 0;
    wormholeState.flash = 0;
    wormholeState.lastEntry = '';
  }

  // Stage 2.7 + 3.1: flipper pivots, travel, and angles are derived from
  // the source a_flip1/a_flip2 control points after projection.
  const flippers = {
    left: {
      side: 'left',
      pivot: mappedTable.flippers.left.pivot,
      length: mappedTable.flippers.left.length,
      radius: PHYSICS_TUNING.flipperRadius,
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
      radius: PHYSICS_TUNING.flipperRadius,
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
      const restitution = flipper.pressed ? PHYSICS_TUNING.flipperActiveRestitution : PHYSICS_TUNING.flipperRestitution;
      ball.vx = relativeVx - (1 + restitution) * normalVelocity * nx + surfaceVx;
      ball.vy = relativeVy - (1 + restitution) * normalVelocity * ny + surfaceVy;
      const kick = flipper.pressed ? PHYSICS_TUNING.flipperActiveKick : PHYSICS_TUNING.flipperRestKick;
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

  // Stage 4.2: a tiny five-row bitmap alphabet keeps table decals and lamp
  // labels close to the low-resolution source without importing its artwork.
  const PIXEL_GLYPHS = Object.freeze({
    A: ['01110', '10001', '10001', '11111', '10001'],
    B: ['11110', '10001', '11110', '10001', '11110'],
    C: ['01111', '10000', '10000', '10000', '01111'],
    D: ['11110', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '11110', '10000', '11111'],
    F: ['11111', '10000', '11110', '10000', '10000'],
    G: ['01111', '10000', '10111', '10001', '01111'],
    H: ['10001', '10001', '11111', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '11111'],
    J: ['00111', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '11100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001'],
    O: ['01110', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '11110', '10000', '10000'],
    Q: ['01110', '10001', '10101', '10011', '01111'],
    R: ['11110', '10001', '11110', '10010', '10001'],
    S: ['01111', '10000', '01110', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10101', '11011', '10001'],
    X: ['10001', '01010', '00100', '01010', '10001'],
    Y: ['10001', '01010', '00100', '00100', '00100'],
    Z: ['11111', '00010', '00100', '01000', '11111'],
    0: ['01110', '10011', '10101', '11001', '01110'],
    1: ['00100', '01100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00010', '00100', '11111'],
    3: ['11110', '00001', '00110', '00001', '11110'],
    4: ['00010', '00110', '01010', '11111', '00010'],
    5: ['11111', '10000', '11110', '00001', '11110'],
    6: ['01110', '10000', '11110', '10001', '01110'],
    7: ['11111', '00001', '00010', '00100', '00100'],
    8: ['01110', '10001', '01110', '10001', '01110'],
    9: ['01110', '10001', '01111', '00001', '01110'],
    '-': ['00000', '00000', '11111', '00000', '00000'],
    ':': ['00000', '00100', '00000', '00100', '00000'],
    '/': ['00001', '00010', '00100', '01000', '10000'],
    '?': ['01110', '10001', '00010', '00000', '00010'],
    ' ': ['00000', '00000', '00000', '00000', '00000'],
  });

  function pixelText(value, x, y, scale, color, align = 'left') {
    const glyphs = String(value).toUpperCase().split('').map(char => PIXEL_GLYPHS[char] || PIXEL_GLYPHS['?']);
    const advance = 6 * scale;
    const totalWidth = Math.max(0, glyphs.length * advance - scale);
    let startX = x;
    if (align === 'center') startX -= totalWidth / 2;
    else if (align === 'right') startX -= totalWidth;
    ctx.save();
    ctx.fillStyle = color;
    for (let index = 0; index < glyphs.length; index += 1) {
      const glyph = glyphs[index];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let column = 0; column < glyph[row].length; column += 1) {
          if (glyph[row][column] === '1') {
            ctx.fillRect(startX + index * advance + column * scale, y + row * scale, scale, scale);
          }
        }
      }
    }
    ctx.restore();
  }

  function drawLamp(x, y, color, on, radius = 2.2) {
    const active = Boolean(on);
    ctx.save();
    ctx.shadowColor = active ? color : 'transparent';
    ctx.shadowBlur = active ? radius * 4 : 0;
    ctx.fillStyle = '#07131c';
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.4, 0, Math.PI * 2);
    ctx.fill();
    const lamp = ctx.createRadialGradient(x - radius * .35, y - radius * .45, .2, x, y, radius);
    lamp.addColorStop(0, active ? '#fff9cf' : '#4f6670');
    lamp.addColorStop(.32, active ? color : '#223943');
    lamp.addColorStop(1, active ? '#38505b' : '#101d25');
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? '#e6f3e9' : '#526a73';
    ctx.lineWidth = .6;
    ctx.stroke();
    ctx.restore();
  }

  function drawChromePolyline(points, inner, accent = '#d7e8e7', width = 2) {
    if (!points.length) return;
    drawPolyline(points, inner, '#06111a', width + 6, 0);
    drawPolyline(points, inner, '#244552', width + 3, 0);
    drawPolyline(points, inner, accent, width, 4);
    drawPolyline(points, inner, 'rgba(255,255,255,.42)', Math.max(.55, width * .28), 0);
  }

  function drawClosedChromePolyline(points, inner, accent = '#d7e8e7', width = 2) {
    drawChromePolyline([...points, points[0]], inner, accent, width);
  }

  function drawTableSurfaceArt(inner, t) {
    ctx.save();
    ctx.globalAlpha = .18;
    ctx.strokeStyle = '#5ccbd2';
    ctx.lineWidth = 1;
    for (let y = 68; y < 390; y += 24) {
      ctx.beginPath();
      ctx.moveTo(inner.x + 20, inner.y + y);
      ctx.quadraticCurveTo(inner.x + 182, inner.y + y - 10, inner.x + 345, inner.y + y + 7);
      ctx.stroke();
    }
    ctx.globalAlpha = .22;
    ctx.strokeStyle = '#d4ae58';
    for (let x = 34; x < 350; x += 42) {
      ctx.beginPath();
      ctx.moveTo(inner.x + x, inner.y + 64);
      ctx.lineTo(inner.x + x + 30, inner.y + 386);
      ctx.stroke();
    }
    ctx.globalAlpha = .32;
    ctx.strokeStyle = '#6ee1e0';
    ctx.beginPath();
    ctx.ellipse(inner.x + 183, inner.y + 201, 108, 70, -.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(inner.x + 183, inner.y + 201, 74, 48, -.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = .55;
    const pulse = 0.5 + 0.5 * Math.sin(t * .002);
    drawLamp(inner.x + 183, inner.y + 201, '#e6c75f', pulse > .25, 2.2);
    ctx.restore();
  }

  function drawMissionIndicatorGraphics(inner) {
    const x = inner.x + 12;
    const y = inner.y + 52;
    const w = 100;
    const h = 27;
    const active = mission.phase === 'active';
    ctx.save();
    ctx.fillStyle = 'rgba(3, 12, 21, .88)';
    ctx.strokeStyle = active ? '#d8bc5d' : '#436b79';
    ctx.lineWidth = 1;
    roundedRect(x, y, w, h, 3);
    ctx.fill();
    ctx.stroke();
    pixelText(active ? 'MISSION' : 'TABLE', x + 5, y + 4, 1, active ? '#f0d36b' : '#77aeb7');
    pixelText(active ? `M-${String(mission.index + 1).padStart(2, '0')}` : 'READY', x + 5, y + 13, 1, '#d8e7e2');
    const count = active ? mission.required : 3;
    for (let i = 0; i < count; i += 1) {
      const lit = active ? i < mission.progress : i < rules.rankProgress;
      drawLamp(x + 60 + i * 10, y + 19, active ? '#e3c85f' : '#69c8d0', lit, 2);
    }
    ctx.restore();
  }

  function drawTableRuleLamps(inner) {
    const rows = [
      { label: 'BOOST', x: 17, y: 105, count: 3, value: rules.boosterProgress, color: '#e6c75f' },
      { label: 'MEDAL', x: 17, y: 121, count: 3, value: rules.medalProgress, color: '#dd6f84' },
      { label: 'MULTI', x: 285, y: 105, count: 3, value: rules.multiplierLights, color: '#6fc9d1' },
      { label: 'FUEL', x: 285, y: 121, count: 6, value: Math.ceil(rules.fuel / 2), color: '#dd9c50' },
    ];
    for (const row of rows) {
      pixelText(row.label, inner.x + row.x, inner.y + row.y - 4, .8, '#83b4bd');
      for (let i = 0; i < row.count; i += 1) {
        drawLamp(inner.x + row.x + 31 + i * 8, inner.y + row.y, row.color, i < row.value, 1.8);
      }
    }
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

  const DIGITAL_SEGMENTS = Object.freeze({
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  });

  function drawDigitalScore(value, rightX, topY, scale, color) {
    const digits = String(value);
    const advance = 10 * scale;
    const width = digits.length * advance - 2 * scale;
    const startX = rightX - width;
    const segment = {
      a: [2, 0, 6, 1.5],
      b: [8, 2, 1.5, 6],
      c: [8, 10, 1.5, 6],
      d: [2, 16, 6, 1.5],
      e: [0, 10, 1.5, 6],
      f: [0, 2, 1.5, 6],
      g: [2, 8, 6, 1.5],
    };
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 5 * scale;
    for (let index = 0; index < digits.length; index += 1) {
      const digit = DIGITAL_SEGMENTS[digits[index]] || '';
      const x = startX + index * advance;
      for (const [name, rect] of Object.entries(segment)) {
        ctx.fillStyle = digit.includes(name) ? color : 'rgba(46, 67, 76, .42)';
        ctx.fillRect(x + rect[0] * scale, topY + rect[1] * scale, rect[2] * scale, rect[3] * scale);
      }
    }
    ctx.restore();
  }

  function drawBallIcon(x, y, active, radius = 6) {
    ctx.save();
    ctx.shadowColor = active ? '#dff8ff' : 'transparent';
    ctx.shadowBlur = active ? 8 : 0;
    ctx.fillStyle = active ? '#dcebed' : '#233440';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? '#f5ffff' : '#40515d';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (active) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
    text(audio.state === 'locked' ? 'AUDIO LOCKED' : (input.muted ? 'MUTED' : 'SOUND ON'),
      p.x + p.w - 16, p.y + 42, 7, input.muted ? '#d9a0a8' : '#79c7cb', 'right', 400);
    ctx.fillStyle = '#4c6575';
    ctx.fillRect(p.x + 18, p.y + 55, p.w - 36, 1);

    text('PLAYER 1', p.x + 18, p.y + 78, 9, '#9eaab4', 'left', 400);
    drawDigitalScore(formatScore(game.score), p.x + p.w - 16, p.y + 87, 1.05, '#e0e5e8');
    text('HIGH SCORE', p.x + 18, p.y + 130, 9, '#738896', 'left', 400);
    drawDigitalScore(formatScore(game.highScore), p.x + p.w - 16, p.y + 138, .78, '#b7c2c7');

    ctx.fillStyle = '#26333e';
    ctx.fillRect(p.x + 18, p.y + 171, p.w - 36, 1);
    text('RANK', p.x + 18, p.y + 190, 9, '#738896', 'left', 400);
    text(rules.rankName.toUpperCase(), p.x + p.w - 16, p.y + 190, 8,
      rules.promotionFlash > 0 ? '#ffe58c' : '#dfe8ed', 'right');
    text(`${rules.rankProgress}/${rules.rankProgressMax}`, p.x + p.w - 16, p.y + 203, 7, '#7a9aa7', 'right', 400);
    text('MULTI', p.x + 18, p.y + 211, 9, '#738896', 'left', 400);
    text(`${rules.multiplier}X`, p.x + p.w - 16, p.y + 211, 10,
      rules.multiplier > 1 ? '#f0d36b' : '#8aa1aa', 'right');
    text('MISSION', p.x + 18, p.y + 229, 9, '#738896', 'left', 400);
    text(mission.phase === 'active' ? mission.name : mission.phase.toUpperCase(), p.x + p.w - 16, p.y + 229, 7,
      mission.flash > 0 ? '#ffe58c' : '#d9b75d', 'right');
    text(mission.phase === 'active' ? `${mission.progress}/${mission.required}` : mission.objective,
      p.x + 18, p.y + 244, 7, '#9dbdc2', 'left', 400);

    text('FUEL', p.x + 18, p.y + 261, 8, '#738896', 'left', 400);
    for (let i = 0; i < rules.fuelMax; i += 1) {
      const filled = i < rules.fuel;
      ctx.fillStyle = filled ? '#e0a34f' : '#273b47';
      ctx.shadowColor = filled ? '#ffd37a' : 'transparent';
      ctx.shadowBlur = filled ? 5 : 0;
      ctx.fillRect(p.x + 51 + i * 11, p.y + 257, 7, 7);
      ctx.shadowBlur = 0;
    }

    const lights = [
      ['TARGETS', targets.some(target => target.lit || target.flash > 0)],
      ['RAMPS', ramps.some(ramp => ramp.hits > 0 || ramp.flash > 0)],
      ['WORMHOLE', wormholes.some(wormhole => wormhole.hits > 0 || wormhole.flash > 0)],
      ['SLINGS', collisionState.slingshotHits > 0],
      ['ROCKET', rocket.launches > 0 || rocket.flash > 0],
    ];
    lights.forEach(([label, on], i) => {
      const yy = p.y + 281 + i * 11;
      ctx.fillStyle = on ? '#dfc35e' : '#273b47';
      ctx.shadowColor = on ? '#ffe98a' : 'transparent';
      ctx.shadowBlur = on ? 7 : 0;
      ctx.beginPath();
      ctx.arc(p.x + 23, yy, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      text(label, p.x + 34, yy, 7, on ? '#c7d2d8' : '#5d7787', 'left', 400);
    });

    ctx.fillStyle = '#26333e';
    ctx.fillRect(p.x + 18, p.y + 337, p.w - 36, 1);
    text('BALL', p.x + 18, p.y + 355, 9, '#738896', 'left', 400);
    for (let i = 0; i < 3; i++) {
      const on = i < game.balls;
      drawBallIcon(p.x + 23 + i * 21, p.y + 377, on, 6);
    }
    text(`DRAIN ${String(drain.total).padStart(2, '0')}`, p.x + 98, p.y + 374, 8, '#65808f', 'left', 400);
    text(`NEXT ${drain.cooldown > 0 ? `${drain.cooldown.toFixed(1)}s` : (plunger.armed ? 'READY' : 'IN PLAY')}`,
      p.x + 98, p.y + 389, 8, '#65808f', 'left', 400);
  }

  function drawMappedPolygon(points, inner, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(inner.x + points[0].x, inner.y + points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(inner.x + points[i].x, inner.y + points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  const featureColors = {
    booster: { on: '#e6c75f', off: '#275461', edge: '#f2e19b' },
    medal: { on: '#dd6f84', off: '#532b45', edge: '#f0a6b3' },
    multiplier: { on: '#6fc9d1', off: '#245164', edge: '#b4f1ee' },
    fuel: { on: '#dd9c50', off: '#573a2b', edge: '#f2c47b' },
    mission: { on: '#a681dd', off: '#3c315e', edge: '#d1baff' },
    'left-hazard': { on: '#d85f67', off: '#4d2839', edge: '#f0a3a0' },
    'right-hazard': { on: '#5fc2d1', off: '#244d5a', edge: '#b4f1ee' },
    wormhole: { on: '#e6c75f', off: '#3d3e2b', edge: '#f2e19b' },
  };

  function drawLaneGuideGraphics(inner) {
    for (const guide of laneGuides) {
      const hot = guide.flash > 0;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = hot ? '#fff0a0' : '#6bb7c2';
      ctx.shadowBlur = hot ? 8 : 3;
      ctx.strokeStyle = hot ? '#f7dc7a' : 'rgba(172, 214, 216, .72)';
      ctx.lineWidth = hot ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(inner.x + guide.a.x, inner.y + guide.a.y);
      ctx.lineTo(inner.x + guide.b.x, inner.y + guide.b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGateGraphics(inner) {
    for (const gate of gates) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = gate.flash > 0 ? '#fff0a2' : '#d2ae5d';
      ctx.shadowBlur = gate.flash > 0 ? 10 : 4;
      ctx.strokeStyle = gate.enabled ? (gate.flash > 0 ? '#fff0a2' : '#bd9851') : '#31404b';
      ctx.lineWidth = gate.flash > 0 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(inner.x + gate.a.x, inner.y + gate.a.y);
      ctx.lineTo(inner.x + gate.b.x, inner.y + gate.b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRolloverGraphics(inner) {
    for (const rollover of rollovers) {
      const lit = rollover.lit || rollover.flash > 0;
      const fill = lit ? '#e3c85f' : 'rgba(12, 35, 47, .92)';
      const edge = lit ? '#fff0a1' : 'rgba(105, 182, 191, .78)';
      ctx.save();
      ctx.shadowColor = lit ? '#ffe98c' : 'transparent';
      ctx.shadowBlur = lit ? 8 : 0;
      drawMappedPolygon(rollover.points, inner, fill, edge, lit ? 1.6 : 1);
      ctx.restore();
      if (rollover.width > 7 && rollover.height > 5) {
        pixelText(rollover.label, inner.x + rollover.x, inner.y + rollover.y - 2, .65, lit ? '#142538' : '#8dbbc0', 'center');
      }
    }
  }

  function drawTargetGraphics(inner) {
    for (const target of targets) {
      const palette = featureColors[target.bank] || featureColors.booster;
      const raised = target.active ? 1 : 0.34;
      const w = target.visual[0] * raised;
      const h = target.visual[1] * raised;
      const lit = target.flash > 0 || target.hits > 0;
      ctx.save();
      ctx.translate(inner.x + target.x, inner.y + target.y);
      ctx.shadowColor = lit ? palette.on : 'transparent';
      ctx.shadowBlur = lit ? 10 : 0;
      roundedRect(-w / 2, -h / 2, w, h, 2);
      ctx.fillStyle = target.active ? (lit ? palette.on : palette.off) : '#14242e';
      ctx.fill();
      ctx.strokeStyle = target.active ? palette.edge : '#48606b';
      ctx.lineWidth = lit ? 1.6 : 1;
      ctx.stroke();
      if (w >= 7 && h >= 7) pixelText(target.label, 0, -2, .65, target.active && lit ? '#15253a' : '#99c7ca', 'center');
      drawLamp(0, h / 2 + 3, palette.on, lit, 1.3);
      ctx.restore();
    }
  }

  function drawSlingshotGraphics(inner) {
    for (const sling of slingshots) {
      const hot = sling.flash > 0;
      const fill = hot ? 'rgba(240, 192, 83, .72)' : 'rgba(169, 43, 92, .52)';
      const stroke = hot ? '#ffe48b' : '#d36a91';
      ctx.save();
      ctx.shadowColor = hot ? '#ffe88c' : '#b63e7e';
      ctx.shadowBlur = hot ? 12 : 5;
      drawMappedPolygon(sling.points, inner, fill, stroke, hot ? 2.5 : 1.5);
      ctx.restore();
      const center = polygonCenter(sling.points);
      pixelText('S', inner.x + center.x, inner.y + center.y - 2, 1, hot ? '#17263a' : '#f0b3c1', 'center');
    }
  }

  function drawKickerGraphics(inner) {
    for (const kicker of kickers) {
      const hot = kicker.flash > 0;
      ctx.save();
      ctx.shadowColor = hot ? '#ffe88d' : '#bb5278';
      ctx.shadowBlur = hot ? 12 : 5;
      ctx.fillStyle = hot ? '#f4ca62' : '#b43d6e';
      ctx.beginPath();
      ctx.arc(inner.x + kicker.x, inner.y + kicker.y, kicker.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hot ? '#fff0a5' : '#e79ab0';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#17263a';
      ctx.beginPath();
      ctx.moveTo(inner.x + kicker.x, inner.y + kicker.y - 5);
      ctx.lineTo(inner.x + kicker.x - 3, inner.y + kicker.y + 2);
      ctx.lineTo(inner.x + kicker.x + 3, inner.y + kicker.y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPolyline(points, inner, stroke, width, shadow = 0, dash = []) {
    if (!points.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.shadowColor = shadow ? stroke : 'transparent';
    ctx.shadowBlur = shadow;
    if (dash.length) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(inner.x + points[0].x, inner.y + points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(inner.x + points[i].x, inner.y + points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRampGraphics(inner) {
    for (const ramp of ramps) {
      const hot = ramp.flash > 0 || ramp.active;
      const base = hot ? ramp.accent : ramp.color;
      drawPolyline(ramp.path, inner, 'rgba(8, 21, 31, .88)', ramp.width + 6, 0);
      drawPolyline(ramp.path, inner, `rgba(91, 166, 177, ${hot ? '.72' : '.38'})`, ramp.width, hot ? 6 : 0);
      for (const rail of ramp.rails) drawPolyline(rail, inner, hot ? '#fff0a0' : '#bed5d5', hot ? 2.3 : 1.5, hot ? 8 : 2);
      drawPolyline(ramp.path, inner, base, hot ? 2 : 1, hot ? 8 : 0, [3, 4]);
      const mid = polylineSample(ramp.path, 0.52);
      pixelText(ramp.kind === 'launch' ? 'RAMP' : 'HYPER', inner.x + mid.x, inner.y + mid.y - 9, .8,
        hot ? '#fff0a5' : '#8bb8be', 'center');
      const exit = polylineSample(ramp.path, 1);
      ctx.save();
      ctx.fillStyle = hot ? '#fff0a5' : '#d8e5dd';
      ctx.shadowColor = hot ? '#fff0a5' : 'transparent';
      ctx.shadowBlur = hot ? 9 : 0;
      ctx.beginPath();
      ctx.arc(inner.x + exit.x, inner.y + exit.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRampHoleGraphics(inner) {
    for (const hole of holes) {
      const hot = hole.flash > 0;
      const x = inner.x + hole.x;
      const y = inner.y + hole.y;
      ctx.save();
      ctx.shadowColor = hot ? '#ffe58b' : '#7a3f7c';
      ctx.shadowBlur = hot ? 15 : 7;
      ctx.fillStyle = '#050916';
      ctx.beginPath();
      ctx.arc(x, y, hole.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hot ? '#fff0a0' : '#b35c9a';
      ctx.lineWidth = hot ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(x, y, hole.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hot ? '#f1c760' : '#6c3b75';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, hole.radius - 4, 0.2, Math.PI * 1.7);
      ctx.stroke();
      ctx.restore();
      pixelText('RAMP', x, y - hole.radius - 10, .75, hot ? '#ffe89a' : '#9f728e', 'center');
    }
  }

  function drawWormholeGraphics(inner, t) {
    wormholes.forEach((wormhole, index) => {
      const selected = wormholeState.destination === index;
      const hot = wormhole.flash > 0 || selected || wormholeState.flash > 0 && selected;
      const x = inner.x + wormhole.x;
      const y = inner.y + wormhole.y;
      ctx.save();
      ctx.shadowColor = hot ? wormhole.accent : wormhole.color;
      ctx.shadowBlur = hot ? 16 : 7;
      ctx.fillStyle = '#050713';
      ctx.beginPath();
      ctx.arc(x, y, wormhole.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hot ? wormhole.accent : wormhole.color;
      ctx.lineWidth = hot ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, wormhole.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = wormhole.color;
      const spin = t * 0.004 + index * 1.4;
      ctx.beginPath();
      ctx.arc(x, y, wormhole.radius - 3, spin, spin + Math.PI * 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, wormhole.radius - 6, spin + Math.PI, spin + Math.PI * 2.45);
      ctx.stroke();
      ctx.fillStyle = hot ? wormhole.accent : wormhole.color;
      ctx.beginPath();
      ctx.arc(x, y, 3.2 + (hot ? 1.2 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      pixelText(wormhole.label[0], x, y - 2, .9, '#101827', 'center');
    });
  }

  function drawShooterExitGraphic(inner) {
    const hot = shooterExit.flash > 0 || shooterExit.active;
    drawPolyline(shooterExit.path, inner, hot ? '#ffe98f' : 'rgba(123, 192, 197, .64)', hot ? 2.2 : 1.2, hot ? 8 : 2, [4, 4]);
    const end = shooterExit.path[shooterExit.path.length - 1];
    pixelText('EXIT', inner.x + end.x, inner.y + end.y - 9, .75, hot ? '#ffe98f' : '#7aaeb7', 'center');
  }

  function drawRocketGraphic(inner) {
    const hot = rocket.flash > 0;
    const x = inner.x + rocket.x;
    const y = inner.y + rocket.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.18);
    ctx.shadowColor = hot ? '#ffe58c' : '#7fb6c0';
    ctx.shadowBlur = hot ? 15 : 4;
    ctx.fillStyle = hot ? '#f1c95e' : '#9abac0';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(5, -3, 4, 4);
    ctx.lineTo(0, 8);
    ctx.lineTo(-4, 4);
    ctx.quadraticCurveTo(-5, -3, 0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#315e71';
    ctx.beginPath();
    ctx.arc(0, -3, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hot ? '#fff0a4' : '#d36d63';
    ctx.beginPath();
    ctx.moveTo(-3, 7);
    ctx.lineTo(0, 14 + (hot ? 5 : 0));
    ctx.lineTo(3, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    pixelText('ROCKET', x, y + 17, .75, hot ? '#ffe99a' : '#759aa6', 'center');
  }

  function drawTransientFx(inner) {
    for (const ring of visualFx.rings) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ring.life) * .75;
      ctx.strokeStyle = ring.color;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.2 + ring.life * 1.2;
      ctx.beginPath();
      ctx.arc(inner.x + ring.x, inner.y + ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const particle of visualFx.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 5;
      ctx.fillRect(inner.x + particle.x, inner.y + particle.y, particle.size, particle.size);
      ctx.restore();
    }
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
    drawTableSurfaceArt(inner, t);

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
    drawClosedChromePolyline([
      tableCorners.topLeft,
      tableCorners.topRight,
      tableCorners.bottomRight,
      tableCorners.bottomLeft,
    ], inner, '#d6e5e3', 1.7);
    drawChromePolyline(shooterRail, inner, '#d6e5e3', 1.6);

    // Header mark and center lane. These are screen-space accents anchored to
    // the same projection center used by the original camera_info record.
    ctx.strokeStyle = '#dec45e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(112, 31);
    ctx.quadraticCurveTo(183, 8, 252, 31);
    ctx.stroke();
    pixelText('SPACE CADET', 183, 21, 1.55, '#e5ca66', 'center');
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

    drawMissionIndicatorGraphics(inner);
    drawTableRuleLamps(inner);

    // Stage 3.2: mapped table features are drawn from the same polygons used
    // by the collision system, so lamps and contact geometry cannot drift.
    drawLaneGuideGraphics(inner);
    drawGateGraphics(inner);
    drawRolloverGraphics(inner);
    drawTargetGraphics(inner);

    // Stage 3.3: mapped ramp centerlines, ramp hole, wormhole sinks, and the
    // shooter exit all use the same projected coordinates as their colliders.
    drawRampGraphics(inner);
    drawRampHoleGraphics(inner);
    drawWormholeGraphics(inner, t);
    drawShooterExitGraphic(inner);
    drawRocketGraphic(inner);

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
    pixelText('LAUNCH', plungerX + 14, 88, .8, '#dfc560', 'center');

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

    // Lower slingshots and kickers now have the same data-driven shape used
    // by the active collision handlers.
    drawSlingshotGraphics(inner);
    drawKickerGraphics(inner);

    const drainLeft = drain.minX;
    const drainRight = drain.maxX;
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
    pixelText('DRAIN', (drainLeft + drainRight) / 2, drainY + 2, .9, drain.flash > 0 ? '#f2cf63' : '#6f98a6', 'center');

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
    drawTransientFx(inner);

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
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.beginPath();
    ctx.arc(ballX - 1.8, ballY - 2.1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(25, 61, 75, .55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ballX + 1.8, ballY + 3.8, 3.8, 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();

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

  function drawMissionBanner() {
    if (mission.banner <= 0 || game.state !== 'playing') return;
    const x = board.x + 58;
    const y = board.y + 54;
    const w = board.w - 116;
    const h = 31;
    const active = mission.phase === 'active';
    ctx.save();
    ctx.globalAlpha = Math.min(1, mission.banner / 0.55);
    ctx.fillStyle = 'rgba(1, 8, 15, .82)';
    ctx.strokeStyle = rules.promotionFlash > 0 ? '#ffe58c' : (active ? '#8bd6dc' : '#c59d4f');
    ctx.lineWidth = 1.2;
    roundedRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
    const headline = rules.promotionFlash > 0 ? `PROMOTED: ${rules.rankName.toUpperCase()}`
      : (active ? `${mission.name}  ${mission.progress}/${mission.required}` : game.lastMessage);
    text(headline, x + w / 2, y + 10, 8, rules.promotionFlash > 0 ? '#ffe58c' : '#f0d36b', 'center');
    text(active ? mission.objective : mission.lastEvent || 'TABLE RULE UPDATE', x + w / 2, y + 22, 7, '#9fd9e0', 'center', 400);
    ctx.restore();
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

  function drawHelpOverlay() {
    if (!input.help) return;
    const x = board.x + 22;
    const y = board.y + 24;
    const w = board.w - 44;
    const h = board.h - 48;
    ctx.save();
    ctx.fillStyle = 'rgba(1, 7, 16, .94)';
    ctx.strokeStyle = '#77d6dc';
    ctx.shadowColor = '#39b5c1';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    roundedRect(x, y, w, h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    pixelText('SPACE CADET HELP', x + w / 2, y + 16, 1.7, '#f0d36b', 'center');
    text('KEYBOARD', x + 20, y + 58, 9, '#77cbd0', 'left', 800);
    const lines = [
      ['Z / LEFT SHIFT', 'LEFT FLIPPER'],
      ['/ / RIGHT SHIFT', 'RIGHT FLIPPER'],
      ['SPACE', 'CHARGE / LAUNCH'],
      ['A D / ARROWS', 'NUDGE'],
      ['P', 'PAUSE'],
      ['M', 'MUTE AUDIO'],
      ['R', 'RESTART GAME'],
      ['ESC / H', 'CLOSE HELP'],
    ];
    lines.forEach(([key, action], index) => {
      const yy = y + 76 + index * 22;
      pixelText(key, x + 20, yy, .85, '#e4bd54');
      pixelText(action, x + 132, yy, .85, '#b7d9d8');
    });
    text('TOUCH / MOUSE', x + 20, y + h - 70, 9, '#77cbd0', 'left', 800);
    pixelText('LOWER APRON: LEFT / RIGHT / SHOOTER', x + 20, y + h - 53, .72, '#b7d9d8');
    pixelText('BALLS', x + 20, y + h - 32, .72, '#8dbbc0');
    for (let index = 0; index < 3; index += 1) drawLamp(x + 62 + index * 10, y + h - 28, '#e3c85f', index < game.balls, 2);
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

  function drawCrtOverlay(t) {
    ctx.save();
    ctx.globalAlpha = VISUAL_TUNING.scanlineAlpha;
    ctx.fillStyle = '#b5eaff';
    for (let y = 0; y < DESIGN_H; y += VISUAL_TUNING.scanlineStep) ctx.fillRect(0, y, DESIGN_W, 1);
    ctx.globalAlpha = VISUAL_TUNING.rollingLineAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, (t * .018) % DESIGN_H, DESIGN_W, 2);
    const vignette = ctx.createRadialGradient(300, 208, 120, 300, 208, 360);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0, 4, 12, ${VISUAL_TUNING.vignetteAlpha})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.globalAlpha = .12;
    ctx.strokeStyle = '#b5eaff';
    ctx.lineWidth = 1;
    ctx.strokeRect(.5, .5, DESIGN_W - 1, DESIGN_H - 1);
    ctx.restore();
  }

  function drawVisualFlash() {
    if (visualFx.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = visualFx.flash * .22;
    ctx.fillStyle = visualFx.flashColor;
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
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
    drawMissionBanner();
    drawDrainStatus();
    drawGameStateOverlay();
    drawHelpOverlay();

    drawVisualFlash();
    drawCrtOverlay(t);
    ctx.restore();
  }

  function updateSimulation(dt) {
    // Fixed-step clock + first real simulated object.
    simTime += dt;
    simTicks += 1;
    ball.routeGrace = Math.max(0, ball.routeGrace - dt);
    if (game.state !== 'paused') game.stateTime += dt;
    updatePlunger(dt);
    updateDrain(dt);
    updateScoring(dt);
    updateVisualFx(dt);
    updateRuleState(dt);
    updateBumpers(dt);
    updateTableFeatures(dt);
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
  document.addEventListener('fullscreenchange', () => {
    updateFullscreenUi();
    markAction(document.fullscreenElement ? 'FULLSCREEN ON' : 'FULLSCREEN OFF');
    fitCanvas();
  });
  if (fullscreenButton) fullscreenButton.addEventListener('click', () => toggleFullscreen());
  if (muteButton) muteButton.addEventListener('click', () => {
    unlockAudio();
    toggleMute();
  });
  updateMuteUi();
  updateFullscreenUi();
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', () => releaseAllControls('FOCUS RESET'));
  window.addEventListener('pointerup', releasePointerAction, { passive: false });
  window.addEventListener('pointercancel', releasePointerAction, { passive: false });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllControls('VISIBILITY RESET');
    if (!audio.context) return;
    if (document.hidden) {
      const suspend = audio.context.suspend();
      if (suspend && typeof suspend.catch === 'function') suspend.catch(() => {});
      audio.state = 'suspended';
    } else if (audio.unlocked) {
      const resume = audio.context.resume();
      if (resume && typeof resume.catch === 'function') resume.catch(() => {});
      audio.state = audio.context.state || 'running';
      updateAudioGain();
    }
  });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
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
  window.spaceCadetAudio = audio;
  window.spaceCadetGame = game;
  window.spaceCadetBall = ball;
  window.spaceCadetPhysics = ballPhysics;
  window.spaceCadetTuning = PHYSICS_TUNING;
  window.spaceCadetWalls = walls;
  window.spaceCadetCollisionState = collisionState;
  window.spaceCadetFlippers = flippers;
  window.spaceCadetPlunger = plunger;
  window.spaceCadetDrain = drain;
  window.spaceCadetBumpers = bumpers;
  window.spaceCadetTargets = targets;
  window.spaceCadetRollovers = rollovers;
  window.spaceCadetLaneGuides = laneGuides;
  window.spaceCadetGates = gates;
  window.spaceCadetKickers = kickers;
  window.spaceCadetSlingshots = slingshots;
  window.spaceCadetRamps = ramps;
  window.spaceCadetRampHoles = holes;
  window.spaceCadetWormholes = wormholes;
  window.spaceCadetShooterExit = shooterExit;
  window.spaceCadetWormholeState = wormholeState;
  window.spaceCadetRocket = rocket;
  window.spaceCadetScoring = scoring;
  window.spaceCadetVisualFx = visualFx;
  window.spaceCadetVisualTuning = VISUAL_TUNING;
  window.spaceCadetRules = rules;
  window.spaceCadetMission = mission;
  window.spaceCadetUi = { input, statusNode };
  window.spaceCadetRanks = RANK_NAMES;
  window.spaceCadetAudioUnlock = unlockAudio;
  window.spaceCadetToggleFullscreen = toggleFullscreen;
  window.spaceCadetPlaySound = playSound;
  if (testMode) {
    window.spaceCadetTest = {
      step(seconds = FIXED_DT) {
        const ticks = Math.max(0, Math.ceil(seconds / FIXED_DT));
        for (let i = 0; i < ticks; i += 1) updateSimulation(FIXED_DT);
      },
      startMission,
      missionEvent,
      addRankProgress,
      render() {
        draw(simTime * 1000);
      },
      get renderFrames() {
        return renderFrames;
      },
    };
  }

  fitCanvas();
  if (!testMode) requestAnimationFrame(frame);
})();
