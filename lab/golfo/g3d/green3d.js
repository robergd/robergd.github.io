/* Golfo 3D: the green (a putt). Plain script, no dependencies, no network; needs engine.js first.

   G3D.scenes.green(renderer, scene, opts) → { anchors, animateReveal, update, cup, info, alt }

   renderer  a scene from G3D.create(canvas, …)
   scene     the challenge's scene object: { type: 'green', putt (m), slope, first?, speed, pin }
               slope  left-to-right | right-to-left | uphill | downhill | double (first: the break nearer the ball)
               speed  slow | medium | fast
               pin    front | middle | back | tier-top | tier-bottom
   opts      { theme: 'light' | 'dark', colors: { bg, accent, … }, reduced, answered, correct, seed,
               units?: 'metric' | 'imperial', label?: (kind, value, scene) → string,
               flyIn?: true, orbit?: true }

   Returns
     anchors        [{ id: 'putt' | 'slope' | 'speed' | 'aim', kind: 'distance' | 'slope' | 'speed' | 'aim', value, world: [x, y, z],
                      label (English default, or opts.label's), align, offset (hints for scene.anchor), when?: 'answered' }]
                    'slope' carries kind 'slope' even on a tier pin (its label then names the tier); show 'aim' only once answered.
     animateReveal  () → Promise: the line drawn as the ball rolls into the cup (or past it, opts.correct === false),
                    then, after a miss, the right read dashed in lime. Under reduced motion it jumps to the end.
     update(o)      { answered?, correct? }: switch state in place (the final pose; call animateReveal to play it).
     cup            [x, y, z]: the cup in world space (the app's reveal flicks grass up there when the putt drops).
     alt            an English sentence for the canvas's aria-label, if the app has none of its own.

   World: metres, Y up, the ball at the origin and the cup along −Z. The camera sits behind the ball,
   a little raised (and, for straight up/down putts, a little to the side so the tilt reads).
   The ball's roll is a small physics simulation on the green's height field (rolling resistance from
   the green speed, gravity from the slope), solved for the start line and pace that hole it, so the
   curve bends most where the ball slows, near the hole. A wrong read rolls a believable miss instead.
   Slopes are exaggerated (physics a little, the drawn tilt more) so they read at 390 px. */
(function (root) {
  'use strict';
  var G = root.G3D;
  if (!G) return;
  G.scenes = G.scenes || {};

  /* the 3D palette per theme: the site's golf tokens, lifted a touch for lit surfaces on near-black.
     Any of these can be overridden through opts.colors (by name, or as 't-name'). */
  var PAL = {
    dark: {
      bg: '#0b0b0c', accent: '#d7f56a', green: '#47692f', fringe: '#3a5230', rough: '#262e22',
      guide: '#a4a4aa', miss: '#c4c4c8', ball: '#fefdff', stick: '#e6e6ea', hole: '#050605', rim: '#d4d6cf',
      shadow: '#000000', sky: '#c9d4e6', ground: '#3a3a32'
    },
    light: {
      bg: '#fefdff', accent: '#1B4038', green: '#9cc477', fringe: '#b5cf97', rough: '#d4dbc4',
      guide: '#4c4c54', miss: '#8a8a92', ball: '#ffffff', stick: '#55555d', hole: '#18211a', rim: '#ffffff',
      shadow: '#1b2a10', sky: '#ffffff', ground: '#d8d4c4'
    }
  };
  /* green speed: rolling deceleration (m/s², from stimpmeter 8 / 10 / 12 ft) and the mowing stripes */
  var SPEED = {
    slow: { k: .70, band: 2.5, contrast: .045 },
    medium: { k: .55, band: 1.8, contrast: .06 },
    fast: { k: .44, band: 1.25, contrast: .085 }
  };
  /* physical slope (exaggerated a little so the break is visible) and the extra tilt drawn on screen */
  var SLOPE = { lat: .035, fall: .025, dbl: .032, tier: .18 };
  var DRAW = { lat: 5, fall: 9, dbl: 5, tier: 3 }; /* about 5× a real green's tilt, so the slope reads at a glance */
  var GRAV = 5 / 7 * 9.81; /* a rolling ball feels 5/7 of gravity along the slope */
  var CUP_R = .054;

  var EN = {
    'slope_left-to-right': 'left to right', 'slope_right-to-left': 'right to left', slope_uphill: 'uphill', slope_downhill: 'downhill',
    slope_double: 'double break', speed_slow: 'slow green', speed_medium: 'medium green', speed_fast: 'fast green', aim: 'Aim',
    'tier-top': 'upper tier', 'tier-bottom': 'lower tier'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function srgb(lin) { return [Math.pow(clamp(lin[0], 0, 1), 1 / 2.2), Math.pow(clamp(lin[1], 0, 1), 1 / 2.2), Math.pow(clamp(lin[2], 0, 1), 1 / 2.2)]; }
  function mixL(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ---------- the roll: integrate a ball on the height field hp ---------- */
  function simulate(hp, k, th, v0, bounds) {
    var x = 0, z = 0, vx = v0 * Math.sin(th), vz = -v0 * Math.cos(th), t = 0, dt = 1 / 200, e = 1e-3, out = [[0, 0, 0]];
    for (var i = 0; i < 200 * 30; i++) {
      var gx = (hp(x + e, z) - hp(x - e, z)) / (2 * e), gz = (hp(x, z + e) - hp(x, z - e)) / (2 * e), g = GRAV * Math.hypot(gx, gz);
      var sp = Math.hypot(vx, vz);
      if (sp < .012 && g < k * .9) break;
      var ux = sp > 1e-6 ? vx / sp : 0, uz = sp > 1e-6 ? vz / sp : 0;
      vx += (-k * ux - GRAV * gx) * dt; vz += (-k * uz - GRAV * gz) * dt;
      if (sp > 1e-6 && vx * ux + vz * uz < 0 && g < k) { vx = 0; vz = 0; } /* friction stops it, never reverses it */
      x += vx * dt; z += vz * dt; t += dt;
      out.push([x, z, t]);
      if (x < bounds[0] || x > bounds[1] || z < bounds[2] || z > bounds[3]) break;
    }
    return out;
  }
  function closest(path, p) {
    var bi = 0, bd = Infinity;
    for (var i = 0; i < path.length; i++) { var d = Math.hypot(path[i][0] - p[0], path[i][1] - p[1]); if (d < bd) { bd = d; bi = i; } }
    return { i: bi, d: bd };
  }
  /* damped Newton on (start angle, speed): err(path) → [e1, e2], driven to zero */
  function solve(hp, k, L, bounds, err) {
    var lift = hp(0, -L) - hp(0, 0);
    var th = 0, v0 = Math.sqrt(Math.max(.25, 2 * (k * (L + .4) + GRAV * lift))), best = null;
    function run(a, b) { var P = simulate(hp, k, a, b, bounds), e = err(P); return { e: e, r: Math.hypot(e[0], e[1]), P: P }; }
    var F = run(th, v0);
    for (var it = 0; it < 40; it++) {
      if (!best || F.r < best.r) best = { th: th, v0: v0, r: F.r, P: F.P };
      if (F.r < 2e-3) break;
      var h1 = 2e-4, h2 = 2e-3, Fa = run(th + h1, v0).e, Fb = run(th, v0 + h2).e;
      var J00 = (Fa[0] - F.e[0]) / h1, J01 = (Fb[0] - F.e[0]) / h2, J10 = (Fa[1] - F.e[1]) / h1, J11 = (Fb[1] - F.e[1]) / h2, det = J00 * J11 - J01 * J10;
      if (!det || !isFinite(det)) break;
      var dth = -(J11 * F.e[0] - J01 * F.e[1]) / det, dv = -(-J10 * F.e[0] + J00 * F.e[1]) / det;
      var m = Math.max(1, Math.abs(dth) / .12, Math.abs(dv) / .35), step = 1, N = null;
      for (var ls = 0; ls < 6; ls++) { /* back off until the error drops */
        N = run(th + dth / m * step, Math.max(.2, v0 + dv / m * step));
        if (N.r < F.r) break;
        step /= 2;
      }
      if (N.r >= F.r && ls === 6) break;
      th += dth / m * step; v0 = Math.max(.2, v0 + dv / m * step); F = N;
    }
    if (!best || F.r < best.r) best = { th: th, v0: v0, r: F.r, P: F.P };
    return best;
  }

  G.scenes.green = function (R, S, opts) { return build(R, S, opts); };
  G.scenes.green.simulate = simulate;
  function build(R, S, opts) {
    opts = opts || {};
    S = S || {};
    var theme = opts.theme === 'light' ? 'light' : 'dark', base = PAL[theme], CO = opts.colors || {};
    function C(name) { return CO['t-' + name] || CO[name] || (name === 'accent' && CO['acc-lime']) || base[name]; }
    var L = clamp(+S.putt || 5, 1, 25);
    var slope = S.slope || null, speed = SPEED[S.speed] ? S.speed : 'medium', SP = SPEED[speed], pin = S.pin || 'middle';
    var tier = pin === 'tier-top' ? 1 : pin === 'tier-bottom' ? -1 : 0;
    var first = S.first === 'right-to-left' ? 'right-to-left' : 'left-to-right';
    var rand = rng((opts.seed == null ? Math.round(L * 97) + String(slope).length * 13 : opts.seed) * 7919 + 17);
    var answered = !!opts.answered, correct = opts.correct !== false;
    var U = opts.units === 'imperial';
    function text(kind, value) {
      if (typeof opts.label === 'function') { var s = opts.label(kind, value, S); if (s != null) return s; }
      if (kind === 'distance') return U ? Math.round(value * 3.28084) + ' ft' : (Math.round(value * 10) / 10) + ' m';
      if (kind === 'slope') return EN['slope_' + value] || String(value || '').replace(/-/g, ' ');
      if (kind === 'speed') return EN['speed_' + value];
      if (kind === 'tier') return EN[value];
      return EN[kind] || '';
    }

    /* ---------- the green's shape: the ball L in front of the cup; the pin sets where the cup sits ---------- */
    var cupZ = -L, f = { front: .3, middle: .55, back: .78, 'tier-top': .7, 'tier-bottom': .34 }[pin] || .55;
    var D = clamp((L + 2) / f, 16, 34), Wg = clamp(D * .92, 15, 28);
    var zc = cupZ - D / 2 + f * D;               /* green centre */
    var gx = (rand() - .5) * 2;                  /* a little off the line, so it doesn't look stamped */
    var h2 = [.05 * (rand() + .4), rand() * 6.28], h3 = [.035 * (rand() + .3), rand() * 6.28];
    function egreen(x, z) { /* 1 on the green's edge */
      var dx = (x - gx) / (Wg / 2), dz = (z - zc) / (D / 2), a = Math.atan2(dz, dx);
      return Math.hypot(dx, dz) / (1 + h2[0] * Math.cos(2 * a + h2[1]) + h3[0] * Math.cos(3 * a + h3[1]));
    }

    /* ---------- height: hp for the physics, hv for the drawing ---------- */
    function phi(z) { return 1 - 2 * sstep(-.36 * L, -.64 * L, z); } /* +1 near the ball, −1 near the hole */
    function slopeP(x, z) {
      switch (slope) {
        case 'left-to-right': return -SLOPE.lat * x;
        case 'right-to-left': return SLOPE.lat * x;
        case 'uphill': return -SLOPE.fall * z;
        case 'downhill': return SLOPE.fall * z;
        case 'double': return (first === 'left-to-right' ? -1 : 1) * SLOPE.dbl * x * phi(z);
      }
      return 0;
    }
    function tierZ(x) { return -.5 * L + .008 * (x - gx) * (x - gx); }
    function tierP(x, z) {
      if (!tier) return 0;
      var zt = tierZ(x), up = sstep(zt + 1.4, zt - 1.4, z); /* 0 on the ball's side, 1 on the cup's */
      return SLOPE.tier * (tier > 0 ? up : 1 - up);
    }
    function hp(x, z) { return slopeP(x, z) + tierP(x, z); }
    var drawK = { 'left-to-right': DRAW.lat, 'right-to-left': DRAW.lat, uphill: DRAW.fall, downhill: DRAW.fall, double: DRAW.dbl }[slope] || 1;
    function hv(x, z) {
      var e = egreen(x, z);
      var h = drawK * slopeP(x, z) * (1 - .45 * sstep(1, 1.6, e)) + DRAW.tier * tierP(x, z);
      h += .2 * (1 - sstep(.98, 1.45, e)) - .4 * sstep(1.5, 2.6, e); /* the green sits on a low pad */
      return h;
    }

    /* ---------- the roll: the read that holes it, and the miss ---------- */
    var M = 8, X0 = gx - Wg / 2 - M, X1 = gx + Wg / 2 + M, Z0 = zc - D / 2 - M, Z1 = Math.max(zc + D / 2, 1) + M;
    var simB = [X0 + M * .5, X1 - M * .5, Z0 + M * .5, Z1 - M * .5];
    var cup2 = [0, cupZ];
    function entryDir(P, i) {
      var a = P[Math.max(0, i - 6)], b = P[Math.min(P.length - 1, i + 6)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      return l > 1e-4 ? [dx / l, dz / l] : [0, -1];
    }
    /* the read that holes it: the path crosses the cup's centre with about 40 cm of roll left
       (more where the slope makes that impossible, as down a tier) */
    var make = null;
    [.4, .8, 1.3, 2, 3].some(function (past) {
      var r = solve(hp, SP.k, L, simB, function (P) {
        var c = closest(P, cup2), p = P[c.i], d = entryDir(P, c.i), vx = cup2[0] - p[0], vz = cup2[1] - p[1];
        var lat = d[0] * vz - d[1] * vx, rest = 0;
        if (c.i >= P.length - 2) rest = -Math.hypot(vx, vz);
        else for (var q = c.i + 1; q < P.length; q++) rest += Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]);
        return [lat, rest - past];
      });
      if (!make || r.r < make.r) make = r;
      return closest(r.P, cup2).d < .03;
    });
    /* the holed putt ends in the cup: cut it at its closest pass and finish at the centre */
    var mc = closest(make.P, cup2), makeP = make.P.slice(0, mc.i + 1);
    makeP.push([cup2[0], cup2[1], makeP[makeP.length - 1][2] + .05]);
    var holed = mc.d < .12;

    /* the miss: under-read breaks finish low and long; downhill runs past; uphill stops short */
    var lowX = slope === 'left-to-right' ? 1 : slope === 'right-to-left' ? -1 : slope === 'double' ? (first === 'left-to-right' ? -1 : 1) : 1;
    var missT;
    if (tier) missT = [lowX * .5, cupZ - 1.3];
    else if (slope === 'uphill') missT = [.22, cupZ + .8];
    else if (slope === 'downhill') missT = [.5, cupZ - 1.6];
    else missT = [lowX * (.45 + .03 * L), cupZ - .7];
    /* it must clear the drawn cup (exaggerated so it reads at 390 px) with daylight: widen the miss until it does */
    var miss, missP;
    for (var mt = 0; mt < 6; mt++) {
      miss = solve(hp, SP.k, L, simB, function (P) { var e = P[P.length - 1]; return [e[0] - missT[0], e[1] - missT[1]]; });
      missP = miss.P;
      if (closest(missP, cup2).d > .42 || slope === 'uphill' && !tier) break;
      missT = [missT[0] * 1.35 + (missT[0] >= 0 ? .08 : -.08), missT[1]];
    }

    /* ---------- terrain ---------- */
    /* height tint: the high side a shade lighter, the low side a shade darker */
    var hMin = Infinity, hMax = -Infinity;
    for (var ti = 0; ti <= 16; ti++) for (var tj = 0; tj <= 16; tj++) {
      var tx = gx - Wg / 2 + Wg * ti / 16, tz = zc - D / 2 + D * tj / 16;
      if (egreen(tx, tz) < 1) { var th0 = hp(tx, tz); hMin = Math.min(hMin, th0); hMax = Math.max(hMax, th0); }
    }
    var hMid = (hMin + hMax) / 2, hSpan = Math.max(.05, (hMax - hMin) / 2), TINT = theme === 'dark' ? .16 : .07, stripeK = theme === 'dark' ? 1 : .6;
    var Lg = G.color(C('green')), Lf = G.color(C('fringe')), Lr = G.color(C('rough'));
    var cell = Math.max(.22, Math.sqrt((X1 - X0) * (Z1 - Z0) / 26000));
    var terr = G.terrain({
      size: [X1 - X0, Z1 - Z0], center: [(X0 + X1) / 2, (Z0 + Z1) / 2],
      segments: [Math.round((X1 - X0) / cell), Math.round((Z1 - Z0) / cell)],
      height: hv,
      color: function (x, z) {
        var e = egreen(x, z);
        /* mowing stripes run along the line of play: finer and crisper on a quick green */
        var st = clamp(3 * Math.sin(Math.PI * (x - gx) / SP.band), -1, 1), hy = clamp((hp(x, z) - hMid) / hSpan, -1, 1);
        var g = Lg.map(function (v) { return v * (1 + SP.contrast * stripeK * st) * (1 + TINT * hy); });
        var c = mixL(g, Lf, sstep(.985, 1.015, e));
        c = mixL(c, Lr, sstep(1.1, 1.16, e));
        return srgb(c);
      },
      ao: .45, aoRadius: 2.5, edgeFade: 4
    });
    function H(x, z) { return terr.heightAt(x, z); }
    function normalAt(x, z) {
      var e = .15, nx = -(H(x + e, z) - H(x - e, z)) / (2 * e), nz = -(H(x, z + e) - H(x, z - e)) / (2 * e), l = Math.hypot(nx, 1, nz);
      return [nx / l, 1 / l, nz / l];
    }
    function tiltTo(n) { /* euler (Rx·Rz) that turns +Y onto n */
      return [Math.atan2(n[2], n[1]) * 180 / Math.PI, 0, -Math.asin(clamp(n[0], -1, 1)) * 180 / Math.PI];
    }

    /* ---------- environment and meshes ---------- */
    R.setEnvironment({
      background: C('bg'), sky: C('sky'), ground: C('ground'), hemi: .5,
      sun: { dir: [-.45, .85, .32], intensity: .62 }, wrap: .4,
      fog: { near: 1.25, far: 3.5, max: .35 }
    });
    R.add(G.apron(terr, { color: C('rough'), scale: 6, segments: 40, fade: .3 }), { order: -2 }); /* the rough carries on to the horizon */
    R.add(terr, { order: -1 });

    var cupY = H(0, cupZ), ballY0 = H(0, 0), cupN = normalAt(0, cupZ), cupRot = tiltTo(cupN), STICK = 2.1;
    var rim = R.add(G.disc({ radius: 1, segments: 28 }), { color: C('rim'), layer: 1, position: [0, cupY + .004, cupZ], rotation: cupRot });
    var hole = R.add(G.disc({ radius: 1, segments: 28 }), { color: C('hole'), unlit: true, layer: 2, position: [0, cupY + .006, cupZ], rotation: cupRot });
    var stick = R.add(G.cylinder({ radius: 1, height: 1, segments: 8 }), { color: C('stick'), position: [0, cupY, cupZ] });
    var cloth = R.add(G.quad({ w: 1, h: 1, segX: 10, segY: 2, origin: [0, 1] }), { color: C('accent'), doubleSided: true, emissive: .6, wave: { amp: .07, waves: 1.1, speed: 4.5 }, rotation: [0, 18, 0] });
    var ball = R.add(G.sphere({ radius: 1, segments: 18, rings: 12 }), { color: C('ball'), spec: [.45, 40], order: 2 });
    var blob = R.add(G.blob({ radius: 1, fade: .8 }), { color: C('shadow'), opacity: .4, transparent: true, unlit: true, layer: 3 });
    var chev = null, level = null, makeLine = null, missLine = null, idealLine = null, aimLine = null;

    /* ---------- the reveal's geometry, in xz; heights come from the drawn surface ---------- */
    function to3(P, lift, n) { /* thin to about n points */
      var step = Math.max(1, Math.floor(P.length / (n || 110))), out = [];
      for (var i = 0; i < P.length; i += step) out.push([P[i][0], H(P[i][0], P[i][1]) + lift, P[i][1]]);
      var l = P[P.length - 1]; if (out.length < 2 || out[out.length - 1][0] !== l[0] || out[out.length - 1][2] !== l[1]) out.push([l[0], H(l[0], l[1]) + lift, l[1]]);
      return out;
    }
    function trimEnd(P, r) { /* stop a line at the cup's edge */
      var out = [];
      for (var i = 0; i < P.length; i++) { if (Math.hypot(P[i][0] - cup2[0], P[i][1] - cup2[1]) < r && i > 2) break; out.push(P[i]); }
      return out.length >= 2 ? out : P.slice(0, 2);
    }
    function arcLen(P) { var s = [0]; for (var i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return s; }
    var makeS = arcLen(makeP), missS = arcLen(missP);
    /* aim: where the start line reaches the cup's depth */
    var aimX = L * Math.tan(make.th), aimed = Math.abs(aimX) > .12 && !tier && slope !== 'uphill' && slope !== 'downhill';
    var aimP = [aimX, H(aimX, cupZ), cupZ];

    /* ---------- labels: world anchors for the app's HTML ---------- */
    var slopeSide = slope === 'left-to-right' ? 1 : slope === 'right-to-left' ? -1 : 1;
    var slopePt;
    if (tier) slopePt = [2.2 + .1 * L, 0, tierZ(2.2 + .1 * L)];
    else if (slope === 'left-to-right' || slope === 'right-to-left') slopePt = [slopeSide * (1.4 + .22 * L), 0, -.5 * L];
    else slopePt = [1.3 + .18 * L, 0, -.5 * L];
    slopePt[1] = H(slopePt[0], slopePt[2]);
    var speedPt = [0, H(0, 0), 0]; /* the speed sits beside the ball, opposite its distance: the corner of the green nothing else uses */
    var fall = slope === 'uphill' || slope === 'downhill';
    var anchors = [
      /* seen from the side (a straight uphill or downhill putt), the distance goes under the ball, clear of the line */
      { id: 'putt', kind: 'distance', value: L, world: [0, ballY0, 0], label: text('distance', L), align: fall && !tier ? [.5, 0] : [0, .5], offset: fall && !tier ? [0, 14] : [14, 2] },
      { id: 'slope', kind: 'slope', value: slope, tier: tier ? pin : null, world: slopePt, label: tier ? text('tier', pin) : text('slope', slope), align: [.5, .5], offset: [0, 0] },
      { id: 'speed', kind: 'speed', value: speed, world: speedPt, label: text('speed', speed), align: fall && !tier ? [.5, 0] : [1, .5], offset: fall && !tier ? [0, 32] : [-14, 2] }
    ];
    if (aimed) anchors.push({ id: 'aim', kind: 'aim', value: aimX, world: aimP, label: text('aim'), align: [.5, 1], offset: [0, -8], when: 'answered' });

    /* ---------- camera: behind the ball, slightly raised; a straight up/down putt is seen low from the side, so the cup
       sits visibly above or below the ball ---------- */
    var side = fall && !tier;
    var yawK = side ? 80 : tier ? 26 : slopeSide * 9;
    var framePts = [[0, ballY0, 1.1], [-.6 - .12 * L, ballY0, .3], [.6 + .08 * L, ballY0, .3], [0, cupY, cupZ - 1.2], [0, cupY + STICK + .25, cupZ], slopePt, speedPt];
    [makeP, missP].forEach(function (P) { for (var i = 0; i < P.length; i += 12) framePts.push([P[i][0], H(P[i][0], P[i][1]), P[i][1]]); var l = P[P.length - 1]; framePts.push([l[0], H(l[0], l[1]), l[1]]); });
    if (aimed) framePts.push([aimP[0], aimP[1] + .4, aimP[2]]);
    /* the putt with a margin of green around it; a wide canvas shows more of the green to the sides for free */
    var latM = Math.max(2.6, .45 * L);
    framePts.push([-latM, H(-latM, -.5 * L), -.5 * L], [latM, H(latM, -.5 * L), -.5 * L], [0, H(0, cupZ - 2.2), cupZ - 2.2]);
    var backZ = Math.max(zc - D / 2 + .3, cupZ - 4.5); framePts.push([0, H(0, backZ), backZ]); /* the green's back edge: its silhouette shows the tilt */
    R.frame(framePts, {
      yaw: function (a) { return side ? yawK : a < 1.15 ? yawK * .7 : yawK; },
      pitch: function (a) { return side ? (a < 1.15 ? 13 : 10) : fall || tier ? (a < 1.15 ? 24 : 18) : a < 1.15 ? 38 : 33; },
      fov: 30,
      padding: function (a) { return a < 1.15 ? { top: 18, right: 58, bottom: 22, left: 58 } : { top: 20, right: 64, bottom: 20, left: 64 }; } /* room for centred HTML labels */
    });

    /* ---------- everything sized in pixels, rebuilt against the fitted camera ---------- */
    var br = .1, cr = .2, lw = .04;
    var state = { make: answered && correct ? 1 : 0, miss: answered && !correct ? 1 : 0, ideal: answered && !correct ? 1 : 0, aim: answered ? 1 : 0 };
    function ribbon(P, w, color, extra) {
      var o = { color: color, unlit: true, layer: 3, transparent: true, opacity: 1, order: 1 };
      for (var k in extra) o[k] = extra[k];
      return R.add(G.ribbon(P, { width: w, dash: extra && extra.dash }), o);
    }
    function sizeThings() {
      if (!R.width) return;
      var kc = R.worldPerPixel([0, cupY, cupZ]), kb = R.worldPerPixel([0, ballY0, 0]);
      br = Math.max(.0214, kb * 3.4);
      cr = Math.max(br * 2.1, kc * 6.4);
      lw = Math.max(.012, kb * 2.2);
      rim.set({ scale: [cr * 1.16, 1, cr * 1.16] }); hole.set({ scale: [cr, 1, cr] });
      var sr = Math.max(.012, kc * .8);
      stick.set({ scale: [sr, STICK, sr] });
      var cw = Math.max(.42, kc * 15);
      cloth.set({ position: [sr * .5, cupY + STICK, cupZ], scale: [cw, cw * .66, 1] });
      /* a few large fall-line arrows lying on the green, pointing downhill, clear of the ball, the cup, the lines
         and the slope's own label (a double break gets one each side of its turn) */
      if (chev) chev.remove(); chev = null;
      var parts = [], e = 1e-3, AL = clamp(.2 * L, .8, 1.5), cand = [];
      [-.22, -.5, -.78].forEach(function (f) { [1, -1].forEach(function (sx) { cand.push([sx * (1.3 + .26 * L), f * L]); }); });
      [-.3, -.7].forEach(function (f) { [1, -1].forEach(function (sx) { cand.push([sx * (2.4 + .4 * L), f * L]); }); });
      cand.push([gx + 1.6, cupZ - 1.8], [gx - 1.6, cupZ - 1.8], [-1.6, 1.4], [1.6, 1.4]);
      var picked = [];
      cand.forEach(function (q) {
        var x = q[0], z = q[1];
        if (picked.length >= 4 || egreen(x, z) > .82) return;
        if (Math.hypot(x, z) < 1.3 || Math.hypot(x, z - cupZ) < 1.4) return;
        if (closest(makeP, [x, z]).d < .9 || closest(missP, [x, z]).d < .8) return;
        if (Math.hypot(x - slopePt[0], z - slopePt[2]) < 1.6 || (aimed && Math.hypot(x - aimP[0], z - aimP[2]) < 1.2)) return;
        if (picked.some(function (p) { return Math.hypot(p[0] - x, p[1] - z) < AL * 1.6; })) return;
        var sp = R.project([x, H(x, z), z]); /* whole on screen, never cut by the edge */
        if (!sp.visible || sp.x < 40 || sp.x > R.width - 40 || sp.y < 24 || sp.y > R.height - 24) return;
        var gxv = (hp(x + e, z) - hp(x - e, z)) / (2 * e), gzv = (hp(x, z + e) - hp(x, z - e)) / (2 * e), gl = Math.hypot(gxv, gzv);
        if (gl < .006) return;
        picked.push([x, z]);
        var dx = -gxv / gl, dz = -gzv / gl, nx = -dz, nz = dx, hl = AL * .3;
        var t0 = [x - dx * AL / 2, z - dz * AL / 2], t1 = [x + dx * AL / 2, z + dz * AL / 2];
        function on(p) { return [p[0], H(p[0], p[1]) + .014, p[1]]; }
        var w = Math.max(.02, R.worldPerPixel(on([x, z])) * 1.7);
        parts.push(G.ribbon([on(t0), on(t1)], { width: w }));
        parts.push(G.ribbon([on([t1[0] - dx * hl + nx * hl * .75, t1[1] - dz * hl + nz * hl * .75]), on(t1), on([t1[0] - dx * hl - nx * hl * .75, t1[1] - dz * hl - nz * hl * .75])], { width: w }));
      });
      if (parts.length) chev = R.add(G.merge(parts), { color: C('guide'), unlit: true, transparent: true, opacity: theme === 'dark' ? .62 : .55, layer: 1 });
      /* straight up or down: a level hairline from the higher of ball and cup, and a ticked drop at the lower one */
      if (level) level.remove(); level = null;
      if (side) {
        var yb = ballY0 + br, yc = cupY + br, hi = Math.max(yb, yc), up = yc > yb, zl = up ? 0 : cupZ, zh = up ? cupZ : 0, xo = .35;
        var kl = R.worldPerPixel([0, hi, cupZ / 2]), rr = Math.max(.004, kl * .55), tk = kl * 4;
        var lv = [], dv = [];
        for (var j = 0; j <= 16; j++) lv.push([xo, hi, zh + (zl - zh) * j / 16]);
        for (j = 0; j <= 4; j++) dv.push([xo, hi + ((up ? yb : yc) - hi) * j / 4, zl]);
        var lo2 = up ? yb : yc;
        level = R.add(G.merge([G.tube(lv, { radius: rr, segments: 5, dash: [kl * 5, kl * 4] }), G.tube(dv, { radius: rr * 1.2, segments: 5 }),
          G.tube([[xo, hi, zl - tk], [xo, hi, zl + tk]], { radius: rr * 1.2, segments: 5 }), G.tube([[xo, lo2, zl - tk], [xo, lo2, zl + tk]], { radius: rr * 1.2, segments: 5 })]),
        { color: C('guide'), unlit: true, transparent: true, opacity: .8, order: 1 });
      }
      /* the lines: the holed read in lime, the miss in a quiet grey, the ideal read dashed after a miss */
      [makeLine, missLine, idealLine, aimLine].forEach(function (m) { if (m) m.remove(); });
      makeLine = ribbon(to3(trimEnd(makeP, cr * .9), .02), lw, C('accent'), { emissive: .7, unlit: false, reveal: state.make, transparent: false });
      missLine = ribbon(to3(missP, .02), lw, C('miss'), { opacity: .85, reveal: state.miss });
      idealLine = ribbon(to3(trimEnd(makeP, cr * .9), .02), lw * .9, C('accent'), { emissive: .7, unlit: false, opacity: .9, dash: [kb * 7, kb * 5], reveal: state.ideal });
      if (aimed) {
        var ap = []; for (var j = 0; j <= 24; j++) { var t = j / 24, axx = aimX * t, azz = cupZ * t; ap.push([axx, H(axx, azz) + .018, azz]); }
        aimLine = ribbon(ap, lw * .7, C('guide'), { opacity: .6, dash: [kb * 4, kb * 5], reveal: state.aim });
      }
      placeBall();
    }
    /* ---------- the ball: at the start, rolling, or finished ---------- */
    var ballAt = { x: 0, z: 0, drop: 0 }, SHK = theme === 'light' ? 2 : 1.7, SHO = theme === 'light' ? .62 : .4; /* a white ball on a pale green needs its shadow */
    function placeBall() {
      var y = H(ballAt.x, ballAt.z);
      ball.set({ scale: br, position: [ballAt.x, y + br - ballAt.drop * 1.6 * br, ballAt.z] });
      blob.set({ scale: [br * SHK, 1, br * SHK], position: [ballAt.x, y + .01, ballAt.z], opacity: SHO * (1 - ballAt.drop) });
    }
    function at(P, Sx, t) { /* position at sim time t */
      var lo = 0, hi = P.length - 1;
      if (t <= 0) return { x: P[0][0], z: P[0][1], s: 0 };
      if (t >= P[hi][2]) return { x: P[hi][0], z: P[hi][1], s: Sx[hi] };
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (P[m][2] < t) lo = m; else hi = m; }
      var u = (t - P[lo][2]) / ((P[hi][2] - P[lo][2]) || 1);
      return { x: P[lo][0] + (P[hi][0] - P[lo][0]) * u, z: P[lo][1] + (P[hi][1] - P[lo][1]) * u, s: Sx[lo] + (Sx[hi] - Sx[lo]) * u };
    }
    function finalState() {
      state = correct ? { make: 1, miss: 0, ideal: 0, aim: 1 } : { make: 0, miss: 1, ideal: 1, aim: 1 };
      var P = correct ? makeP : missP, l = P[P.length - 1];
      ballAt = { x: l[0], z: l[1], drop: correct ? 1 : 0 };
      applyState();
    }
    function startState() {
      state = { make: 0, miss: 0, ideal: 0, aim: 0 };
      ballAt = { x: 0, z: 0, drop: 0 };
      applyState();
    }
    function applyState() {
      if (makeLine) makeLine.reveal = state.make;
      if (missLine) missLine.reveal = state.miss;
      if (idealLine) idealLine.reveal = state.ideal;
      if (aimLine) aimLine.reveal = state.aim;
      placeBall(); R.invalidate();
    }

    sizeThings();
    if (answered) finalState(); else startState();
    var lastW = R.width, lastH = R.height;
    R.onFrame(function (s) {
      if (s.width === lastW && s.height === lastH) return;
      lastW = s.width; lastH = s.height;
      sizeThings();
    });

    if (!answered && opts.flyIn !== false) R.flyIn({ yaw: -12, pitch: 7, zoom: 1.14, duration: 1500 });
    if (opts.orbit !== false) R.orbit({ yaw: [-28, 28], pitch: [-6, 14], returnAfter: 2600 });

    /* ---------- the reveal: line drawn as the ball rolls (time-true, so it slows near the hole) ---------- */
    var running = [];
    function roll(P, Sx, line, lineLen, key) {
      var T = P[P.length - 1][2], ms = clamp(T * 550, 1500, 3000);
      return R.tween(ms, 'linear', function (e) {
        var q = at(P, Sx, e * T);
        ballAt.x = q.x; ballAt.z = q.z;
        state[key] = clamp(q.s / lineLen, 0, 1); line.reveal = state[key];
        placeBall();
      });
    }
    function animateReveal() {
      running.forEach(function (h) { h.cancel(); }); running = [];
      answered = true;
      startState();
      return new Promise(function (resolve) {
        var lineP = correct ? makeLine : missLine;
        /* the holed line stops at the cup's lip, a little short of the roll: map the reveal by its own length */
        var full = correct ? arcLen(trimEnd(makeP, cr * .9)).pop() : missS[missS.length - 1];
        var h = roll(correct ? makeP : missP, correct ? makeS : missS, lineP, full, correct ? 'make' : 'miss');
        running.push(h);
        h.done.then(function () {
          if (correct) {
            var d = R.tween(260, 'in', function (e) { ballAt.drop = e; placeBall(); });
            var a = R.tween(700, 'out', function (e) { state.aim = e; if (aimLine) aimLine.reveal = e; }, { delay: 120 });
            running.push(d, a);
            return Promise.all([d.done, a.done]);
          }
          var i2 = R.tween(900, 'inOut', function (e) { state.ideal = e; idealLine.reveal = e; }, { delay: 250 });
          var a2 = R.tween(700, 'out', function (e) { state.aim = e; if (aimLine) aimLine.reveal = e; }, { delay: 700 });
          running.push(i2, a2);
          return Promise.all([i2.done, a2.done]);
        }).then(function () { finalState(); resolve(); });
      });
    }
    function update(o) {
      o = o || {};
      if (o.correct != null) correct = o.correct !== false;
      if (o.answered != null) {
        answered = !!o.answered;
        running.forEach(function (h) { h.cancel(); }); running = [];
        if (answered) finalState(); else startState();
      }
    }

    var alt = text('distance', L) + ' putt' + (slope ? ', ' + text('slope', slope) : '') + ', on a ' + text('speed', speed) + (tier ? ', the cup on the ' + text('tier', pin) : '');
    return {
      anchors: anchors,
      animateReveal: animateReveal,
      update: update,
      /* the cup, in world space: where the app's grass flicks up when the putt drops */
      cup: [0, cupY, cupZ],
      /* how long animateReveal takes at tempo 1 (ms) for a make (true) or a miss (false) */
      revealMs: function (ok) { var P = ok === false ? missP : makeP; return clamp(P[P.length - 1][2] * 550, 1500, 3000) + (ok === false ? 1400 : 820); },
      alt: alt,
      info: { holed: holed, makeAim: make.th * 180 / Math.PI, makeSpeed: make.v0, makeResidual: make.r, missResidual: miss.r,
        missPass: closest(missP, cup2).d, missEnd: missP[missP.length - 1].slice(0, 2), sizes: function () { return { ball: br, cup: cr, line: lw }; },
        ball: function () { return ball.position.slice(); }, cup: [0, cupY, cupZ], hp: hp, k: SP.k, bounds: simB }
    };
  }
})(typeof window !== 'undefined' ? window : this);
