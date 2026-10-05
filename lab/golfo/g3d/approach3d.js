/* Golfo 3D: the approach scene. Needs engine.js (window.G3D). No network, no dependencies.

   G3D.scenes.approach(renderer, scene, opts) → { anchors, animateReveal, update, summary, dispose }

   renderer  a scene from G3D.create(canvas). This builder sets its environment (background, light, fog),
             its camera (a sticky frame() per aspect) and a gentle orbit.
   scene     the challenge's scene object: {type:'approach', distance, elevation, wind, lie, pin, hazards,
             flight?: 'high'|'low'|'none', over?: 'branches', unit?: 's'}
   opts      { theme: 'light'|'dark', colors: {…}, reduced: bool, answered: bool, correct: bool|null, seed: number }
             colors (all optional, hex): bg, fg, muted, accent (or 'acc-lime'), 'water-ink' (wind), and any of the
             3D palette below with a 't-' prefix ('t-fairway', 't-rough', 't-green', 't-sand', 't-water', 't-tree',
             't-trunk', 't-earth', 't-sky', 't-ground', 't-ball', 't-guide', 't-shadow', 't-hardpan', 't-divot').
             The raw 2D tokens (--fairway etc.) are too dark once lit, so the defaults here are the lifted ones.

   World: metres, Y up, ball at the origin, the pin straight down −Z at `distance`. Elevation is drawn
   exaggerated (more on long shots) so it reads from behind the ball; the label carries the real number.

   Anchors (labels are HTML, never WebGL): [{id, kind, world, label, key?, qty?, sign?, align, offset}]
     kind  'distance' | 'elevation' | 'wind' | 'hazard' | 'lie' | 'pin'
     label an English fallback; key is the app's i18n key (lie_*, hzS_*, wind_*); qty {k, v} goes through
           Units.qty(k, v) ('d' or 's' for distance, 'h' elevation, 'w' wind); sign '+' | '−' for elevation.
     align, offset: pass straight to renderer.anchor(el, world, {align, offset}).

   answered: built true → the flight is drawn in its final state; animateReveal() replays it from the ball
   (call it synchronously after building and nothing flashes). update({answered: true, correct}) adds the
   flight to a live scene and animates it. Reduced motion: every animation jumps to its end state, wind is
   drawn as still arrows. The flight is always the correct shot (scene.flight: high by default, low = lands
   short and runs, none = no flight because the shot itself is the question). */
(function (root) {
  'use strict';
  var G = root.G3D; if (!G) return;
  G.scenes = G.scenes || {};

  var PAL = {
    dark: {
      bg: '#0b0b0c', fg: '#ededee', muted: '#b4b4b8', accent: '#d7f56a', wind: '#6ea8fe',
      fairway: '#3a5030', rough: '#273024', green: '#46682f', sand: '#7a6a4a', water: '#24466f', tree: '#2f4527', trunk: '#3a3328',
      earth: '#1b1b1e', sky: '#c9d4e6', ground: '#3a3a32', ball: '#fefdff', guide: '#9a9aa0', shadow: '#000000', hardpan: '#5b5040', divot: '#3a3226'
    },
    light: {
      bg: '#fefdff', fg: '#1b1b1f', muted: '#55555d', accent: '#1B4038', wind: '#2563eb',
      fairway: '#bcd2a0', rough: '#d3dbc3', green: '#9cc274', sand: '#e8d2a2', water: '#aac8f2', tree: '#86a873', trunk: '#9c8a70',
      earth: '#e8e7e1', sky: '#ffffff', ground: '#d8d4c4', ball: '#ffffff', guide: '#55555d', shadow: '#1b2a10', hardpan: '#d3c3a0', divot: '#a89272'
    }
  };
  var T3 = ['fairway', 'rough', 'green', 'sand', 'water', 'tree', 'trunk', 'earth', 'sky', 'ground', 'ball', 'guide', 'shadow', 'hardpan', 'divot'];
  var WIND = { into: [0, 0, 1], helping: [0, 0, -1], 'left-to-right': [1, 0, 0], 'right-to-left': [-1, 0, 0] };
  var EN = {
    lie: { fairway: 'fairway', rough: 'rough', bunker: 'bunker', divot: 'divot', hardpan: 'hardpan', tee: 'tee' },
    hz: { water: 'Water', bunker: 'Bunker', ob: 'OB', trees: 'Trees' },
    wind: { into: 'headwind', helping: 'tailwind', 'left-to-right': 'left to right', 'right-to-left': 'right to left' }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(c) {
    if (Array.isArray(c)) return c;
    var s = String(c).trim().replace('#', ''); if (s.length < 5) s = s.replace(/./g, '$&$&');
    var n = parseInt(s.slice(0, 6), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function ell(e, x, z) { return Math.hypot((x - e.x) / e.rx, (z - e.z) / e.rz); }
  function fmtM(v) { return (Math.round(Math.abs(v) * 10) / 10) + ' m'; }

  G.scenes.approach = function (R, sc, opts) {
    opts = opts || {}; sc = sc || {};
    var theme = opts.theme === 'light' ? 'light' : 'dark', P = {}, k;
    var base = PAL[theme], cin = opts.colors || {};
    for (k in base) P[k] = base[k];
    ['bg', 'fg', 'muted', 'accent'].forEach(function (n) { if (cin[n]) P[n] = cin[n]; });
    if (cin['acc-lime']) P.accent = cin['acc-lime'];
    if (cin['water-ink']) P.wind = cin['water-ink'];
    T3.forEach(function (n) { if (cin['t-' + n]) P[n] = cin['t-' + n]; });
    var C = {}; for (k in P) C[k] = hex(P[k]);
    var reduced = opts.reduced != null ? !!opts.reduced : !!R.reduced;
    var rand = rng((opts.seed | 0) || 7);

    R.setEnvironment({
      background: P.bg, sky: P.sky, ground: P.ground, hemi: .5,
      sun: { dir: [-.5, .85, .25], intensity: .62 }, wrap: .35,
      fog: { near: 1.3, far: 3.5, max: .35 }
    });

    /* ---------- the layout, in metres ---------- */
    var D = Math.max(4, +sc.distance || 140), E = +sc.elevation || 0, lie = EN.lie[sc.lie] ? sc.lie : 'fairway';
    var short = D < 45, hz = (sc.hazards || []).filter(function (h) { return h && EN.hz[h.kind]; });
    var wd = sc.wind && sc.wind.kmh && WIND[sc.wind.dir] ? WIND[sc.wind.dir] : null, cross = !!(wd && wd[0] !== 0);
    var ex = clamp(1.6 + D / 100, 1.6, 3.2), EY = clamp(E * ex, -D * .2, D * .2);               /* vertical exaggeration, so the ramp reads */
    var grz = clamp(.07 * D + 6, 7, 18), grx = grz * 1.15;
    var gz = sc.pin === 'front' ? -D - grz * .6 : sc.pin === 'back' ? -D + grz * .6 : -D;
    var GR = { x: 0, z: gz, rx: grx, rz: grz }, zf = gz + grz, zb = gz - grz;
    var PIN = [0, 0, -D];
    var rampA = zf + Math.max(clamp(D * .28, 6, 45), Math.abs(EY) * (EY < 0 ? 4.2 : 3)), rampB = zf + 1.5;          /* the climb (or fall) to the green */
    var fwH = clamp(D * .1, 6, 18);
    var fwStart = lie === 'rough' ? -clamp(D * .12, 3, 18) : lie === 'tee' ? -clamp(D * .4, 6, 70) : short ? zf + grz * .9 + 2 : clamp(D * .06, 3, 8);
    var sTree = clamp(D / 140, .45, 1.2);
    var flightKind = sc.flight === 'low' || sc.flight === 'none' ? sc.flight : 'high';

    /* the lie, shaped in the ground */
    var LB = lie === 'bunker' ? { x: 0, z: -.3, rx: clamp(D * .035, 2.2, 5) * 1.25, rz: clamp(D * .035, 2.2, 5) } : null;
    var TEE = lie === 'tee' ? { hw: clamp(D * .04, 3, 7), z0: clamp(D * .03, 2.5, 5), z1: -clamp(D * .03, 2.5, 5) } : null;
    var HP = lie === 'hardpan' ? { x: 0, z: -.4, rx: clamp(D * .03, 1.6, 4.5) * 1.3, rz: clamp(D * .03, 1.6, 4.5) } : null;

    /* hazards: short / long / left / right of the green */
    var bunkers = [], ponds = [], trees = [], stakes = [], hzL = [], hzSide = {};
    var used = {};
    hz.forEach(function (h, i) {
      var w = h.where || 'short', n = used[h.kind + w] = (used[h.kind + w] || 0) + 1, sgn = w === 'left' ? -1 : 1, j = (n - 1);
      var lab;
      if (h.kind === 'bunker') {
        var brx = clamp(grx * .45, 2.2, 8), brz = brx * .55, B;
        if (w === 'short') B = { x: (rand() - .5) * grx * .3 + j * brx * 2.2, z: zf + brz + 1.2, rx: brx, rz: brz };
        else if (w === 'long') B = { x: (rand() < .5 ? -1 : 1) * grx * .32 + j * brx * 2.2, z: zb - brz * .6, rx: brx * 1.15, rz: brz * 1.1 };
        else B = { x: sgn * (grx + brz + .8), z: gz + grz * .15 - j * brx * 2, rx: brz, rz: brx };
        bunkers.push(B);
        lab = w === 'long' ? [B.x + (B.x < 0 ? -1 : 1) * B.rx * .9, 0, B.z] : w === 'short' ? [B.x, 0, B.z + B.rz] : [B.x, 0, B.z + B.rz * .6];
        if (w === 'long') hzSide[i] = B.x < 0 ? -1 : 1;
      } else if (h.kind === 'water') {
        var W;
        if (w === 'short') { var rzw = clamp(D * .12, 3, 26); W = { x: 0, z: zf + rzw + 1.5, rx: Math.max(grx * 1.6, fwH * 1.35), rz: rzw }; }
        else if (w === 'long') W = { x: 0, z: zb - clamp(grz * .9, 4, 14) - 2, rx: grx * 1.5, rz: clamp(grz * .9, 4, 14) };
        else { var rxw = clamp(grx * .75, 4, 14), rzs = clamp(D * .16, 8, 32); W = { x: sgn * (Math.max(grx, fwH) + rxw + 2.5), z: gz + rzs * .45, rx: rxw, rz: rzs }; }
        ponds.push(W);
        lab = w === 'long' ? [W.x + W.rx * .8, 0, W.z] : w === 'short' ? [W.x + W.rx * .35, 0, W.z + W.rz * .55] : [W.x, 0, W.z + W.rz * .55];
        if (w === 'long') hzSide[i] = 1;
      } else if (h.kind === 'trees') {
        var list = [];
        if (w === 'left' || w === 'right') {
          var xr = sgn * (Math.max(fwH, grx) + 5 * sTree), nT = 7;
          for (var q = 0; q < nT; q++) {
            var zz = 2 - (q / (nT - 1)) * (D + 2 - zb) * .98;
            list.push([xr + sgn * rand() * 6 * sTree, zz + (rand() - .5) * 4, (.85 + rand() * .35) * sTree]);
          }
          lab = [xr, 0, list[2][1]];
        } else {
          var zc = w === 'short' ? zf + 8 * sTree : zb - 8 * sTree;
          for (q = 0; q < 4; q++) list.push([(q - 1.5) * 7 * sTree + (rand() - .5) * 2, zc + (rand() - .5) * 5, (.85 + rand() * .3) * sTree]);
          lab = w === 'long' ? [2.2 * 7 * sTree, 0, zc] : [0, 0, zc + 4 * sTree];
          if (w === 'long') hzSide[i] = 1;
        }
        trees = trees.concat(list);
      } else if (h.kind === 'ob') {
        var pts = [];
        if (w === 'left' || w === 'right') { var xo = sgn * (Math.max(fwH, grx) + 9); for (var s = 0; s <= 8; s++) pts.push([xo, 2 - s / 8 * (D + 10)]); lab = [xo, 0, pts[2][1]]; }
        else { var zo = w === 'short' ? zf + 6 : zb - 8; for (s = -4; s <= 4; s++) pts.push([s * grx * .5, zo]); lab = w === 'long' ? [grx * 1.6, 0, zo] : [0, 0, zo]; if (w === 'long') hzSide[i] = 1; }
        stakes = stakes.concat(pts);
      }
      hzL.push({ h: h, p: lab, i: i });
    });
    /* overhead branches: the shot has to stay under them */
    var OVER = sc.over === 'branches' ? { x: -(3.2 * sTree + 1.2), z: -(4 + D * .035), hb: clamp(D * .035, 3.2, 5.5) } : null;
    if (OVER) trees.push([OVER.x - 3 * sTree, OVER.z - 3, 1.1 * sTree]);

    /* ---------- the ground: smooth analytic height, no noise ---------- */
    var ph1 = rand() * 6.28, ph2 = rand() * 6.28, und = clamp(D * .004, .05, .55);
    function baseH(x, z) {
      var h = EY * sstep(rampA, rampB, z);
      if (EY > 0) h *= 1 - .45 * sstep(Math.max(grx, fwH) + 14, Math.max(grx, fwH) + 46, Math.abs(x)) * sstep(rampA, rampB, z);
      var calm = sstep(2, 6, Math.hypot(x, z) / Math.max(1, D * .02));      /* flat around the ball */
      h += und * calm * (Math.sin(x * .09 * 150 / Math.max(D, 30) + ph1) * .6 + Math.sin(z * .06 * 150 / Math.max(D, 30) + ph2) * .5);
      h += Math.min(1.2, .006 * Math.pow(Math.max(0, Math.abs(x) - (Math.max(grx, fwH) + 14)), 2)) * clamp(D / 120, .3, 1);
      return h;
    }
    var pondBase = ponds.map(function (W) { return baseH(W.x, W.z) - .1; });
    function height(x, z) {
      var h = baseH(x, z), g = ell(GR, x, z);
      h += clamp(D * .004, .08, .45) * (1 - sstep(.85, 1.35, g));          /* the green sits a touch proud */
      bunkers.concat(LB ? [LB] : []).forEach(function (B) {
        var e = ell(B, x, z), d = clamp(B.rz * .18, .35, 1.1);
        h += -d * (1 - sstep(.55, 1.02, e)) + d * .35 * Math.exp(-Math.pow((e - 1.1) / .12, 2));
      });
      if (TEE) { var m = (1 - sstep(TEE.hw - .6, TEE.hw + .6, Math.abs(x))) * (1 - sstep(TEE.z0 - .6, TEE.z0 + .6, z)) * sstep(TEE.z1 - .6, TEE.z1 + .6, z); h += m * .3 * clamp(D / 120, .5, 1.2); }
      ponds.forEach(function (W, i) {
        var w = ell(W, x, z), lv = 1 - sstep(1, 1.55, w);
        h = h * (1 - lv) + pondBase[i] * lv - Math.min(2.2, W.rz * .12 + .6) * (1 - sstep(.55, 1.08, w));
      });
      return h;
    }
    /* regions as signed distances (metres, < 0 inside): drawn as crisp overlays on the ground */
    function sdE(e, x, z, k) { return (ell(e, x, z) - (k || 1)) * Math.min(e.rx, e.rz); }
    function sdFair(x, z) {
      var hw = fwH * (1 - .12 * sstep(zf + D * .5, zf, z)), d = Math.max(Math.abs(x) - hw, (zf - grz * .2) - z);
      if (z > fwStart - hw) d = Math.max(d, Math.hypot(x, z - (fwStart - hw)) - hw);
      return d;
    }
    var stripeL = clamp(D * .05, 2, 9), fairS = mix(C.fairway, C.rough, theme === 'light' ? .2 : .16), bank = mix(C.rough, C.sand, .3);
    var teeC = mix(C.fairway, C.green, .3);
    function stripes(x, z) { /* mowing bands along the line of play */
      var w = cell * .5, st = (-z / stripeL) % 2; st = st < 0 ? st + 2 : st;
      return mix(fairS, C.fairway, sstep(.5 - w / stripeL, .5 + w / stripeL, Math.abs(st - 1)));
    }

    /* terrain extents: everything decision-relevant stays inside the un-faded part */
    var fade = 5, X1 = Math.max(grx + clamp(D * .17, 8, 26), fwH + clamp(D * .16, 6, 24), D * .32);
    ponds.forEach(function (W) { X1 = Math.max(X1, Math.abs(W.x) + W.rx + 6); });
    trees.forEach(function (t) { X1 = Math.max(X1, Math.abs(t[0]) + 10); });
    stakes.forEach(function (p) { X1 = Math.max(X1, Math.abs(p[0]) + 6); });
    X1 += fade;
    var Z0 = Math.max(14, D * .32) + fade, Z1 = zb - clamp(D * .3, 10, 40) - fade;
    ponds.forEach(function (W) { Z1 = Math.min(Z1, W.z - W.rz - 8 - fade); });
    var TW = 2 * X1, TD = Z0 - Z1, cell = Math.max(.12, Math.sqrt(TW * TD / 15000));
    var occ = trees.map(function (t) { return { x: t[0] + 1.5 * t[2], z: t[1] + 1, r: 7 * t[2], k: .45 }; });
    if (OVER) occ.push({ x: OVER.x + 2, z: OVER.z, r: 6 * sTree, k: .35 });
    var terr = G.terrain({
      size: [TW, TD], center: [0, (Z0 + Z1) / 2], segments: [Math.round(TW / cell), Math.round(TD / cell)],
      height: height, color: function () { return C.rough; }, ao: .6, aoRadius: clamp(D * .06, 2, 9), edgeFade: fade, occluders: occ
    });
    /* the same ground carried on to the horizon, so the slab never shows an edge */
    R.add(G.apron(terr, { color: C.rough, scale: 3.6, segments: 40, fade: .3 }), { order: -2 });
    R.add(terr, { order: -1 });
    var gy0 = terr.heightAt(0, 0);
    PIN[1] = terr.heightAt(PIN[0], PIN[2]);

    /* the regions: each one its own mesh lying on the ground, cut along its true outline with a thin soft rim,
       so fairway, green and sand edges stay sharp at any size (grid steps: `sub` subdivides the ground's cells) */
    function region(sd, bounds, colour, order, o) {
      o = o || {};
      var minR = o.minR || 1e9, sub = Math.min(6, Math.max(1, Math.ceil(cell / Math.max(.15, minR / 6))));
      var g = G.region(terr, { bounds: bounds, sd: sd, color: colour, sub: sub, rim: o.rim == null ? clamp(cell * .45, .3, .8) : o.rim, height: o.height, lift: o.lift });
      if (!g.indices.length) return null;
      var mo = { transparent: true, layer: 1, order: order }; for (var q in o.mesh || {}) mo[q] = o.mesh[q];
      return R.add(g, mo);
    }
    function ebox(e, k) { k = k || 1; return [e.x - e.rx * k, e.z - e.rz * k, e.x + e.rx * k, e.z + e.rz * k]; }
    region(sdFair, [-fwH - 1, zf - grz * .2 - 1, fwH + 1, fwStart + 1], stripes, -9);
    if (TEE) region(function (x, z) { return Math.max(Math.abs(x) - TEE.hw, z - TEE.z0, TEE.z1 - z); }, [-TEE.hw, TEE.z1, TEE.hw, TEE.z0], function () { return teeC; }, -8, { minR: 2 });
    if (HP) region(function (x, z) { return sdE(HP, x, z); }, ebox(HP), function () { return C.hardpan; }, -8, { minR: Math.min(HP.rx, HP.rz) });
    ponds.forEach(function (W) { region(function (x, z) { return sdE(W, x, z, 1.12); }, ebox(W, 1.12), function () { return bank; }, -8, { minR: Math.min(W.rx, W.rz) }); });
    region(function (x, z) { return sdE(GR, x, z, 1.13); }, ebox(GR, 1.13), function () { return C.fairway; }, -7, { minR: grz });
    region(function (x, z) { return sdE(GR, x, z); }, ebox(GR), function () { return C.green; }, -6, { minR: grz });
    bunkers.concat(LB ? [LB] : []).forEach(function (B) { region(function (x, z) { return sdE(B, x, z); }, ebox(B), function () { return C.sand; }, -5, { minR: Math.min(B.rx, B.rz) }); });
    /* water: a flat sheet cut along the shore just inside the hollow's rim, so the shoreline is a clean curve */
    ponds.forEach(function (W, i) {
      region(function (x, z) { return sdE(W, x, z, .97); }, ebox(W), function () { return C.water; }, -4,
        { minR: Math.min(W.rx, W.rz), height: function () { return pondBase[i] - .06; }, lift: 0, mesh: { spec: [.35, 60], opacity: .94 } });
    });

    /* trees: low-poly crowns and trunks, one draw call */
    if (trees.length || OVER) {
      var parts = [];
      trees.forEach(function (t) {
        var y = terr.heightAt(t[0], t[1]), s = t[2];
        parts.push({ geometry: G.cylinder({ radius: .35 * s, height: 3 * s, segments: 6 }), color: P.trunk, position: [t[0], y, t[1]] });
        parts.push({ geometry: G.icosphere({ radius: 3.6 * s, detail: 1, flat: true }), color: P.tree, position: [t[0], y + 5.4 * s, t[1]], scale: [1, 1.18, 1] });
      });
      if (OVER) { /* a trunk off to the left, its limbs reaching over the line at OVER.hb */
        var oy = terr.heightAt(OVER.x, OVER.z), hb = OVER.hb, s = sTree;
        parts.push({ geometry: G.cylinder({ radiusBottom: .45 * s, radiusTop: .3 * s, height: hb + 2.5 * s, segments: 7 }), color: P.trunk, position: [OVER.x, oy, OVER.z] });
        parts.push({ geometry: G.cylinder({ radius: .16 * s, height: Math.abs(OVER.x) + 3, segments: 5 }), color: P.trunk, position: [OVER.x, oy + hb + .6 * s, OVER.z], rotation: [0, 0, -78] });
        [[0, 2.6, 0, 1], [1.6, .5, .4, .8], [3.2, -.2, -.6, .75], [4.6, -.9, .8, .6], [2.2, 1.6, -1.6, .7]].forEach(function (c) {
          parts.push({ geometry: G.icosphere({ radius: 2.4 * s * c[3], detail: 1, flat: true }), color: P.tree,
            position: [OVER.x + c[0] / 4.6 * (Math.abs(OVER.x) + 3), oy + hb + .9 * s + c[1] * s * .35, OVER.z + c[2] * s], scale: [1.45, .5, 1.15] });
        });
      }
      R.add(G.merge(parts));
    }
    /* OB: white stakes */
    if (stakes.length) {
      var sp = stakes.map(function (p) { return { geometry: G.cylinder({ radius: .09 * Math.max(1, D / 120), height: 1.1 * Math.max(1, D / 100), segments: 6 }), color: P.fg, position: [p[0], terr.heightAt(p[0], p[1]), p[1]] }; });
      R.add(G.merge(sp));
    }

    /* the flag, the cup, the ball and its lie, sized in screen pixels (rebuilt on resize) */
    var stick = R.add(G.cylinder({ radius: 1, height: 1, segments: 8 }), { color: P.ball, position: PIN.slice() });
    var cloth = R.add(G.quad({ w: 1, h: 1, segX: 10, segY: 2, origin: [0, 1] }), { color: P.accent, doubleSided: true, emissive: .55, wave: reduced ? null : { amp: .16, waves: 1.1, speed: 5 } });
    var cup = R.add(G.disc({ radius: 1, segments: 20 }), { color: '#000000', layer: 2, unlit: true, position: [PIN[0], PIN[1] + .02, PIN[2]] });
    var ball = R.add(G.sphere({ radius: 1, segments: 18, rings: 12 }), { color: P.ball, spec: [.4, 40] });
    var shadow = R.add(G.blob({ radius: 1, fade: .8 }), { color: P.shadow, opacity: .45, transparent: true, layer: 3, unlit: true });
    var lieMesh = null, guide = null, gaugeH = null, gaugeV = null, flight = null, roll = null, spot = null;
    var br = .2, ballRest = [0, gy0, 0], pinH = clamp(D * .05, 1.5, 9);
    var state = { answered: !!opts.answered, correct: opts.correct == null ? null : !!opts.correct, playing: null, landed: true };

    /* ball rest height over the ground, by lie (multiples of the drawn ball radius) */
    function restY(r) { return gy0 + (lie === 'tee' ? r * 2.15 : lie === 'rough' ? r * .5 : lie === 'bunker' ? r * .78 : lie === 'divot' ? r * .7 : r); }
    function buildLie(r) {
      if (lieMesh) { lieMesh.remove(); lieMesh = null; }
      var parts = [], i;
      if (lie === 'rough') { /* tufts: thin blades leaning out around the ball */
        var tuft = theme === 'light' ? mix(C.tree, C.rough, .2) : mix(C.fairway, C.green, .6);
        var rr = rng(((opts.seed | 0) || 7) + 11);
        for (i = 0; i < 46; i++) {
          var a = rr() * 6.283, d = r * (.6 + rr() * 2.8), hgt = r * (1.8 + rr() * 1.6);
          parts.push({ geometry: G.cone({ radius: r * .2, height: hgt, segments: 4 }), color: tuft,
            position: [Math.sin(a) * d, gy0 - r * .1, Math.cos(a) * d], rotation: [Math.cos(a) * (8 + rr() * 22), 0, -Math.sin(a) * (8 + rr() * 22)] });
        }
      } else if (lie === 'tee') { /* the peg, plus the two tee markers */
        parts.push({ geometry: G.cylinder({ radiusTop: r * .3, radiusBottom: r * .12, height: r * 1.2, segments: 8 }), color: P.guide, position: [0, gy0, 0] });
        [-1, 1].forEach(function (sg) { parts.push({ geometry: G.sphere({ radius: r * 1.3, segments: 12, rings: 8 }), color: P.muted, position: [sg * Math.max(TEE.hw * .55, r * 9), gy0 + r * 1.1, -r * 3] }); }); /* neutral: the accent is for the flag and the flight */
      } else if (lie === 'divot') { /* a scar in the turf, the ball sitting at its front end, the lifted turf beside it */
        parts.push({ geometry: G.box({ w: r * 2.6, h: r * .2, d: r * 7 }), color: P.divot, position: [0, gy0 - r * .14, r * 2.6] });
        parts.push({ geometry: G.box({ w: r * 2.2, h: r * .35, d: r * 5 }), color: P.fairway, position: [r * 5.5, gy0, r * 4.5], rotation: [0, 28, 0] });
      } else if (lie === 'hardpan') { /* a few pebbles on the bare ground */
        var pr = rng(((opts.seed | 0) || 7) + 5);
        for (i = 0; i < 9; i++) { var a2 = pr() * 6.283, d2 = r * (2 + pr() * 6); parts.push({ geometry: G.icosphere({ radius: r * (.18 + pr() * .22), detail: 0, flat: true }), color: mix(C.hardpan, C.earth, .45), position: [Math.sin(a2) * d2, gy0, Math.cos(a2) * d2] }); }
      }
      if (parts.length) lieMesh = R.add(G.merge(parts), { layer: lie === 'divot' ? 1 : 0 });
    }

    /* flight path for the correct shot */
    function flightPath(r) {
      var start = [0, restY(r), 0];
      if (flightKind === 'low') {
        var lz = Math.min(-D * .72, zf - 1.5);
        if (lz < PIN[2] + 2) lz = PIN[2] + 2;
        var land = [0, terr.heightAt(0, lz) + r, lz];
        var air = G.arc(start, land, { height: OVER ? Math.min(D * .05, OVER.hb * .7) : clamp(D * .07, .8, 12), peak: .5, samples: 48 });
        var gp = []; for (var i = 0; i <= 24; i++) { var z = lz + (PIN[2] + .9 - lz) * i / 24; gp.push([0, terr.heightAt(0, z) + r, z]); }
        return { air: air, ground: gp };
      }
      /* the wind it is played in: lower into it, a touch higher and running on downwind, aimed off upwind across it */
      var into = wd && wd[2] > 0, help = wd && wd[2] < 0, landK = help ? clamp(D * .035, 1.4, 5) : into ? clamp(D * .006, .3, 1.2) : clamp(D * .012, .5, 2.2);
      var end = [0, PIN[1] + r, PIN[2] + landK];
      var a2 = G.arc(start, end, { height: clamp(D * (into ? .12 : help ? .19 : .17), 1.6, 38), peak: into ? .62 : .58, samples: 64 });
      if (cross) { var aim = -wd[0] * clamp(D * .045, .8, 12); a2.forEach(function (q, i) { var u = i / (a2.length - 1); q[0] += aim * Math.sin(Math.PI * Math.pow(u, .8)); }); }
      var g2 = [end];
      for (var gi = 1; gi <= 8; gi++) { var zz = end[2] + (PIN[2] + clamp(D * .004, .25, .7) - end[2]) * gi / 8; g2.push([0, terr.heightAt(0, zz) + r, zz]); }
      return { air: a2, ground: g2 };
    }
    var FP = flightKind === 'none' ? null : flightPath(.3);
    var apex = FP ? FP.air.reduce(function (a, p) { return p[1] > a[1] ? p : a; }, FP.air[0]) : null;

    /* elevation gauge: a thin bracket standing in the rough beside the climb (or the fall), clear of the fairway
       and the flag, ticked at both ends, with a level hairline from its top over the slope */
    var gSide = hz.some(function (h) { return h.where === 'right'; }) && !hz.some(function (h) { return h.where === 'left'; }) ? -1 : 1;
    var xg = gSide * (fwH + 4);
    function gaugePts() {
      var zA = rampA, zB = rampB, yA = terr.heightAt(xg, zA), yB = terr.heightAt(xg, zB), hi = Math.max(yA, yB);
      var H = [], V = [], up = yB > yA, zv = up ? zA : zB, lo = up ? yA : yB;
      for (var i = 0; i <= 12; i++) H.push([xg, hi, zv + ((up ? zB : zA) - zv) * .3 * i / 12]); /* a short level reference */
      for (i = 0; i <= 6; i++) V.push([xg, hi + (lo - hi) * i / 6, zv]);
      return { H: H, V: V, mid: [xg, (hi + lo) / 2, zv], top: [xg, hi, zv], bot: [xg, lo, zv] };
    }
    var GA = Math.abs(E) >= 1 ? gaugePts() : null;

    /* wind field: in the air over the middle of the shot */
    /* (a crosswind's field sits downwind: the flight aims off on the other side) */
    var WF = wd ? { c: [(cross ? wd[0] : -1) * fwH * .45, Math.max(gy0, PIN[1]) * .4 + clamp(D * .09, 2, 16), -D * .34], sx: fwH * (cross ? 1.1 : .75), sy: clamp(D * .03, .6, 5), sz: D * .22, L: clamp(D * .075, 1.4, 12) } : null;

    /* ---------- the camera: low behind the ball, looking at the green ---------- */
    var fr = [[0, gy0, 2.5], [-2.5, gy0, 0], [2.5, gy0, 0], [0, gy0, -1],
      [-grx, PIN[1], gz], [grx, PIN[1], gz], [0, PIN[1], zb], [0, PIN[1], zf], [0, PIN[1] + pinH * 1.25, PIN[2]]];
    bunkers.forEach(function (B) { fr.push([B.x - B.rx, PIN[1], B.z], [B.x + B.rx, PIN[1], B.z]); });
    ponds.forEach(function (W) { fr.push([W.x - W.rx * .9, pondBase[ponds.indexOf(W)], W.z], [W.x + W.rx * .9, pondBase[ponds.indexOf(W)], W.z], [W.x, pondBase[ponds.indexOf(W)], W.z - W.rz * .6]); });
    hzL.forEach(function (L) { if (L.h.kind === 'trees' || L.h.kind === 'ob') fr.push([L.p[0], terr.heightAt(L.p[0], L.p[2]) + (L.h.kind === 'trees' ? 6 * sTree : 1), L.p[2]]); });
    if (apex) fr.push(apex);
    if (WF) fr.push([WF.c[0] - WF.sx, WF.c[1] + WF.sy, WF.c[2]], [WF.c[0] + WF.sx, WF.c[1] + WF.sy, WF.c[2]]);
    if (GA) fr.push(GA.mid, GA.H[0], GA.H[GA.H.length - 1]);
    if (OVER) fr.push([OVER.x, gy0 + OVER.hb + 3 * sTree, OVER.z]);
    R.frame(fr, {
      /* the ball in the near corner, the green complex given the room: a little higher than eye level, so a hazard
         beyond the green shows over it */
      yaw: function (a) { return a < 1 ? 16 : 32; },
      pitch: function (a) { return (a < 1 ? 31 : 24) + (EY < 0 ? Math.min(8, -EY * .35) : 0); },
      fov: function (a) { return a < 1 ? 36 : 30; },
      padding: function (a) { return a < 1 ? { top: 44, right: 22, bottom: 22, left: 18 } : { top: 40, right: 60, bottom: 26, left: 48 }; }
    });

    /* ---------- pixel-sized pieces, rebuilt against the fitted camera ---------- */
    var streaks = [], arrows = null, windLoop = null, windT0 = 0;
    function sizeThings() {
      var kp = R.worldPerPixel(PIN), kb = R.worldPerPixel([0, gy0, 0]);
      var sh = Math.max(1.5, kp * 40); pinH = sh;
      stick.set({ scale: [Math.max(.03, kp * .75), sh, Math.max(.03, kp * .75)] });
      cloth.set({ position: [PIN[0] + kp * .5, PIN[1] + sh, PIN[2]], scale: [Math.max(.6, kp * 17), Math.max(.4, kp * 10.5), 1] });
      cup.set({ scale: [Math.max(.06, kp * 2.2), 1, Math.max(.06, kp * 2.2)] });
      br = Math.max(.03, kb * 3.6);
      ballRest = [0, restY(br), 0];
      if (FP) FP = flightPath(br);
      buildLie(br);
      shadow.set({ scale: [br * 2.1, 1, br * 2.1] });
      if (!state.playing) placeBall(state.answered && FP ? 'end' : 'rest');
      /* the ground guide, ball to pin */
      if (guide) guide.remove();
      var gp = []; for (var i = 0; i <= 80; i++) { var z = PIN[2] * i / 80; gp.push([0, terr.heightAt(0, z) + Math.max(.03, kb * .3), z]); }
      var km = R.worldPerPixel([0, 0, PIN[2] * .5]);
      guide = R.add(G.ribbon(gp, { width: Math.max(.06, km * 1.4), dash: [km * 8, km * 7] }), { color: P.guide, unlit: true, opacity: .75, transparent: true, layer: 2 });
      /* elevation gauge */
      if (gaugeH) { gaugeH.remove(); gaugeV.remove(); gaugeH = gaugeV = null; }
      if (GA) {
        var kg = R.worldPerPixel(GA.mid), tk = kg * 4;
        gaugeH = R.add(G.tube(GA.H, { radius: Math.max(.015, kg * .4), segments: 5 }), { color: P.guide, unlit: true, opacity: .55, transparent: true });
        gaugeV = R.add(G.merge([G.tube(GA.V, { radius: Math.max(.02, kg * .6), segments: 6 }),
          G.tube([[GA.top[0] - tk, GA.top[1], GA.top[2]], [GA.top[0] + tk, GA.top[1], GA.top[2]]], { radius: Math.max(.02, kg * .6), segments: 6 }),
          G.tube([[GA.bot[0] - tk, GA.bot[1], GA.bot[2]], [GA.bot[0] + tk, GA.bot[1], GA.bot[2]]], { radius: Math.max(.02, kg * .6), segments: 6 })]),
        { color: P.fg, unlit: true, opacity: .85, transparent: true });
      }
      buildFlight();
      buildWind();
    }
    function placeBall(where) {
      var p;
      if (where === 'end' && FP) p = FP.ground[FP.ground.length - 1].slice();
      else p = ballRest.slice();
      ball.set({ scale: br, position: p });
      shadowFollow();
    }
    function shadowFollow() {
      var p = ball.position, g = terr.heightAt(p[0], p[2]), up = Math.max(0, p[1] - g - br * 1.2);
      var onTee = lie === 'tee' && Math.hypot(p[0], p[2]) < br * 2;
      shadow.set({ position: [p[0], g + .02, p[2]], opacity: (onTee ? .3 : .45) * Math.max(0, 1 - up / Math.max(3, D * .06)) });
    }
    function buildFlight() {
      var rv = flight ? flight.reveal : state.answered ? 1 : 0, rr = roll ? roll.reveal : state.answered ? 1 : 0;
      if (flight) { flight.remove(); flight = null; } if (roll) { roll.remove(); roll = null; } if (spot) { spot.remove(); spot = null; }
      if (!state.answered || !FP) return;
      var kf = R.worldPerPixel(apex || PIN);
      var rad = Math.max(.02, Math.min(kf, R.worldPerPixel([0, gy0, 0]) * 2.2) * 1.05);
      flight = R.add(G.tube(FP.air, { radius: rad, segments: 8 }), { color: P.accent, emissive: .7, reveal: rv });
      roll = R.add(G.tube(FP.ground, { radius: rad * .8, segments: 6, dash: flightKind === 'low' ? [kf * 4, kf * 4] : null }), { color: P.accent, emissive: .7, reveal: rr, layer: 1 });
      var L = FP.air[FP.air.length - 1], kl = R.worldPerPixel(L);
      spot = R.add(G.blob({ radius: 1, fade: .75 }), { color: P.accent, unlit: true, transparent: true, layer: 3, position: [L[0], terr.heightAt(L[0], L[2]) + .03, L[2]], scale: [kl * 9, 1, kl * 9], opacity: rv >= 1 ? .45 : 0 });
    }

    /* wind: streaks drifting with the wind (a few seconds, then still arrows); still arrows under reduced motion */
    function arrowGeo(len, rad, dir) {
      var h = len / 2, d = dir, side = cross ? [0, 1, 0] : [1, 0, 0], hl = len * .28;
      var tip = [d[0] * h, d[1] * h, d[2] * h], tail = [-d[0] * h, -d[1] * h, -d[2] * h];
      function back(sg) { return [tip[0] - d[0] * hl + side[0] * hl * .7 * sg, tip[1] - d[1] * hl + side[1] * hl * .7 * sg, tip[2] - d[2] * hl + side[2] * hl * .7 * sg]; }
      return G.merge([G.tube([tail, tip], { radius: rad, segments: 6 }), G.tube([back(1), tip], { radius: rad, segments: 6 }), G.tube([back(-1), tip], { radius: rad, segments: 6 })]);
    }
    function buildWind() {
      streaks.forEach(function (s) { s.m.remove(); }); streaks = [];
      if (arrows) { arrows.forEach(function (m) { m.remove(); }); arrows = null; }
      if (!WF) return;
      var kw = R.worldPerPixel(WF.c), rad = Math.max(.02, kw * 1.05);
      var wr = rng(((opts.seed | 0) || 7) + 3);
      /* three still arrows: the reduced-motion picture, and where the streaks settle */
      arrows = [];
      var offs = cross ? [[0, .55, -.2], [-.15, -.1, .35], [.15, -.6, -.55]] : [[-.55, .3, 0], [.05, -.2, .25], [.6, .25, -.2]];
      offs.forEach(function (o) {
        var c = [WF.c[0] + o[0] * WF.sx, WF.c[1] + o[1] * WF.sy, WF.c[2] + o[2] * WF.sz];
        arrows.push(R.add(arrowGeo(WF.L * (cross ? 1.1 : 1.3), rad * 1.15, wd), { color: P.wind, emissive: .5, position: c, opacity: .92, transparent: true }));
      });
      /* the arrows say the direction from the first frame (a still has to read); the streaks drift over them */
      if (reduced) return;
      var n = cross ? 9 : 10;
      for (var i = 0; i < n; i++) {
        var g = G.tube([[-wd[0] * WF.L / 2, 0, -wd[2] * WF.L / 2], [wd[0] * WF.L / 2, 0, wd[2] * WF.L / 2]], { radius: rad * .8, segments: 5 });
        streaks.push({ m: R.add(g, { color: P.wind, emissive: .5, transparent: true, opacity: 0 }), ph: wr(), o: [(wr() - .5) * 2, (wr() - .5) * 2, (wr() - .5) * 2] });
      }
      startWind();
    }
    var WIND_S = 12;
    function startWind() {
      if (reduced || !WF || !streaks.length) return;
      if (windLoop) windLoop.stop();
      windT0 = -1;
      var spd = (.45 + (sc.wind.kmh || 15) / 40), span = cross ? WF.sx * 2.6 : WF.sz * 2.2;
      windLoop = R.loop(function (dt, t) {
        if (windT0 < 0) windT0 = t;
        var el = t - windT0, out = clamp((el - WIND_S) / 1.2, 0, 1);
        streaks.forEach(function (s) {
          var u = (s.ph + el * spd * WF.L / span * 1.6) % 1, a = Math.sin(Math.PI * u);
          var along = (u - .5) * span;
          var p = cross ? [wd[0] * along, s.o[1] * WF.sy, s.o[2] * WF.sz * .8] : [s.o[0] * WF.sx, s.o[1] * WF.sy, wd[2] * along];
          s.m.position = [WF.c[0] + p[0], WF.c[1] + p[1], WF.c[2] + p[2]];
          s.m.opacity = .6 * a * a * (1 - out);
        });
        if (out >= 1) { windLoop = null; return false; }
      });
    }

    /* the reveal: the ball flies to the landing area, then runs or checks to the pin */
    function animateReveal() {
      if (!state.answered || !FP || !flight) return Promise.resolve();
      if (state.playing) state.playing.cancel();
      var dur = clamp(900 + D * 5, 1000, 2000);
      flight.reveal = 0; roll.reveal = 0; spot.opacity = 0; placeBall('rest');
      if (reduced) { flight.reveal = 1; roll.reveal = 1; spot.opacity = .45; placeBall('end'); R.invalidate(); return Promise.resolve(); }
      var lift = 0;
      var h1 = R.drawAlong(flight, { duration: dur, easing: 'inOut', ball: ball, lift: lift, onUpdate: shadowFollow, delay: 120 });
      state.playing = h1;
      return h1.done.then(function () {
        if (state.playing !== h1) return;
        R.tween(500, 'out', function (e) { spot.opacity = .45 * e; });
        var h2 = R.drawAlong(roll, { duration: flightKind === 'low' ? clamp(D * 8, 600, 1500) : 420, easing: 'out', ball: ball, onUpdate: shadowFollow });
        state.playing = h2;
        return h2.done.then(function () { if (state.playing === h2) state.playing = null; placeBall('end'); });
      });
    }

    /* keep the pixel-sized pieces right when the canvas changes size */
    var lastW = -1, lastH = -1;
    var unFrame = R.onFrame(function (s) { if (s.width && (s.width !== lastW || s.height !== lastH)) { lastW = s.width; lastH = s.height; sizeThings(); } });
    if (R.width) { lastW = R.width; lastH = R.height; sizeThings(); }
    R.orbit({ yaw: [-22, 22], pitch: [-6, 12], returnAfter: 2600, onStart: function () { if (!windLoop && !reduced) startWind(); } });
    if (!reduced) R.flyIn({ yaw: -10, pitch: 6, zoom: 1.12, duration: 1400 });

    /* ---------- anchors for the HTML labels ---------- */
    var anchors = [];
    var dq = sc.unit === 's' ? 's' : 'd';
    var midZ = PIN[2] * .5;
    var dSide = WF ? -(cross ? wd[0] : -1) : -1; /* the distance sits on the side of the line away from the wind's streaks */
    anchors.push({ id: 'distance', kind: 'distance', world: [0, terr.heightAt(0, midZ), midZ], label: Math.round(D) + ' m', qty: { k: dq, v: D }, align: dSide < 0 ? [1, .5] : [0, .5], offset: [dSide * 12, 0] });
    if (GA) anchors.push({ id: 'elevation', kind: 'elevation', world: GA.mid, label: (E > 0 ? '+' : '−') + fmtM(E), qty: { k: 'h', v: Math.abs(E) }, sign: E > 0 ? '+' : '−', align: gSide > 0 ? [0, .5] : [1, .5], offset: [gSide * 10, 0] });
    if (WF) anchors.push({ id: 'wind', kind: 'wind', world: [WF.c[0] + (cross ? wd[0] : -1) * WF.sx * .3, WF.c[1] + WF.sy * 1.6, WF.c[2] + WF.sz * 1.05], label: Math.round(sc.wind.kmh) + ' km/h ' + EN.wind[sc.wind.dir], key: 'wind_' + sc.wind.dir, qty: { k: 'w', v: sc.wind.kmh }, align: [.5, 1], offset: [0, -8] });
    hzL.forEach(function (L, n) {
      var p = L.p, y = terr.heightAt(p[0], p[2]);
      if (L.h.kind === 'water') ponds.forEach(function (W, i) { if (ell(W, p[0], p[2]) < 1.2) y = pondBase[i] - .5; });
      var top = L.h.kind === 'trees' ? 10 * sTree : 0;
      var sd = hzSide[L.i], above = !sd && L.h.kind === 'trees';
      if (sd && L.h.kind === 'trees') top = 4 * sTree;
      anchors.push({ id: 'hazard-' + n, kind: 'hazard', world: [p[0], y + top, p[2]], label: EN.hz[L.h.kind], key: 'hzS_' + L.h.kind, hazard: { kind: L.h.kind, where: L.h.where },
        align: sd ? [sd > 0 ? 0 : 1, .5] : above ? [.5, 1] : [.5, 0], offset: sd ? [sd * 6, 0] : above ? [0, -4] : [0, 6] });
    });
    anchors.push({ id: 'lie', kind: 'lie', world: [0, gy0, 0], label: EN.lie[lie], key: 'lie_' + lie, align: [0, .5], offset: [14, 3] });
    anchors.push({ id: 'pin', kind: 'pin', world: [PIN[0], PIN[1], PIN[2]], label: 'Pin · ' + (sc.pin || 'middle'), key: 'pin_' + (sc.pin || 'middle'), optional: true, align: [.5, 1], offset: [0, -50] });

    var summary = 'Approach of ' + Math.round(D) + ' m' + (E ? ', green ' + Math.abs(E) + ' m ' + (E > 0 ? 'above' : 'below') : '') +
      (wd ? ', ' + sc.wind.kmh + ' km/h ' + EN.wind[sc.wind.dir] : '') + ', ball in the ' + EN.lie[lie] + ', pin ' + (sc.pin || 'middle') +
      (hz.length ? ', ' + hz.map(function (h) { return EN.hz[h.kind].toLowerCase() + ' ' + (h.where || ''); }).join(', ') : '') + '.';

    return {
      anchors: anchors,
      summary: summary,
      animateReveal: animateReveal,
      /* how long the reveal takes at tempo 1 (ms), so the app can fit it into its budget with renderer.tempo */
      revealMs: function () { return FP ? 120 + clamp(900 + D * 5, 1000, 2000) + (flightKind === 'low' ? clamp(D * 8, 600, 1500) : 420) : 0; },
      update: function (o) {
        o = o || {};
        if (o.correct !== undefined) state.correct = o.correct == null ? null : !!o.correct;
        if (o.answered != null && !!o.answered !== state.answered) {
          state.answered = !!o.answered;
          if (state.playing) { state.playing.cancel(); state.playing = null; }
          if (flight) { flight.remove(); flight = null; } if (roll) { roll.remove(); roll = null; } if (spot) { spot.remove(); spot = null; }
          if (state.answered && FP) { buildFlight(); flight.reveal = 0; roll.reveal = 0; spot.opacity = 0; return animateReveal(); }
          placeBall('rest'); R.invalidate();
        }
        return Promise.resolve();
      },
      /* screen geometry the labels keep clear of: the flag, and the drawn part of the flight */
      avoid: function () {
        var out = [], cs = cloth.scale, top = PIN[1] + pinH;
        out.push([[PIN[0], PIN[1], PIN[2]], [PIN[0], top, PIN[2]], [PIN[0] + cs[0], top - cs[1], PIN[2]]]);
        if (arrows) { var al = WF.L * (cross ? 1.1 : 1.3) / 2; arrows.forEach(function (m) { var c = m.position; out.push([[c[0] - wd[0] * al, c[1], c[2] - wd[2] * al], [c[0] + wd[0] * al, c[1], c[2] + wd[2] * al]]); }); }
        if (flight && FP && flight.reveal > 0) {
          var n = Math.max(2, Math.round(FP.air.length * flight.reveal));
          for (var i = 0; i + 1 < n; i += 4) out.push(FP.air.slice(i, Math.min(n, i + 5)));
        }
        return out;
      },
      dispose: function () { unFrame(); if (windLoop) windLoop.stop(); }
    };
  };
})(window);
