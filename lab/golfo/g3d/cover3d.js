/* Golfo 3D: the cover (the start-screen illustration).
   An island green in a pond on rolling ground, the flag in the lab's lime, and a slow, calm camera drift
   (static under reduced motion). Seeded by the day number, so each day's cover looks a little different.

   G3D.scenes.cover(renderer, scene, opts) → { anchors, animateReveal, update }
     renderer  a scene from G3D.create(canvas, …)
     scene     the challenge's scene object. Ignored on purpose: the cover shows before the clock starts,
               so it must never preview the challenge (its wind, hazards or distance)
     opts      { theme: 'light' | 'dark', colors: { bg, panel, fg, accent, … }, reduced, answered, correct, seed }
   The cover sits on the app's --panel colour, so the background is colors.panel (falling back to colors.bg).
   Any 3D palette entry can be overridden through colors['t-fairway'], colors['t-water'] and so on.
   Labels are not drawn here. The anchors (pin, green) are positional only (label: null): the app keeps its
   cover tags in the corners and may pin something to them if it wants. Frame padding leaves the top and
   bottom 13% of a tall canvas clear for those tags. */
(function (root) {
  'use strict';
  var G = root.G3D;
  if (!G) return;
  G.scenes = G.scenes || {};

  /* the 3D palette: the site's golf tokens, lifted a touch so lit surfaces read (the same values as demo.html) */
  var PAL = {
    dark: { fairway: '#3a5030', rough: '#273024', green: '#46682f', sand: '#857552', water: '#203a56', tree: '#2f4527', trunk: '#3a3328',
      sky: '#c9d4e6', ground: '#3a3a32', ball: '#fefdff', shadow: '#000000', bed: '#16241f', bg: '#131316', fg: '#ededee', accent: '#d7f56a' },
    light: { fairway: '#cfe0b8', rough: '#e3e8d6', green: '#a9cd84', sand: '#eedcb2', water: '#c0d5ef', tree: '#8fb07c', trunk: '#9c8a70',
      sky: '#ffffff', ground: '#d8d4c4', ball: '#ffffff', shadow: '#1b2a10', bed: '#9fb6c8', bg: '#f6f6f3', fg: '#1b1b1f', accent: '#1B4038' }
  };

  /* the app's own PRNG (mulberry32), seeded the way its SVG cover was */
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sstep(a, b, v) { var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mixC(a, b, t) { /* mix two sRGB colours in linear light; returns sRGB [r, g, b] */
    var A = G.color(a), B = G.color(b);
    return [0, 1, 2].map(function (i) { return Math.pow(A[i] + (B[i] - A[i]) * t, 1 / 2.2); });
  }

  /* a soft, wobbly ellipse: f(x, z) is 1 on the outline, < 1 inside; edge(θ) is the outline point at angle θ */
  function blob(cx, cz, rx, rz, rot, harm) {
    var c = Math.cos(rot), s = Math.sin(rot);
    function R(th) { var r = 1; for (var i = 0; i < harm.length; i++) r += harm[i][1] * Math.sin(harm[i][0] * th + harm[i][2]); return r; }
    return {
      cx: cx, cz: cz, rx: rx, rz: rz,
      f: function (x, z) {
        var dx = x - cx, dz = z - cz, u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
        return Math.hypot(u, v) / R(Math.atan2(v, u));
      },
      edge: function (th, k) {
        var r = R(th) * (k || 1), u = Math.cos(th) * rx * r, v = Math.sin(th) * rz * r;
        return [cx + u * c - v * s, cz + u * s + v * c];
      }
    };
  }

  G.scenes.cover = function (R3, scene, opts) {
    opts = opts || {};
    var theme = opts.theme === 'light' ? 'light' : 'dark', C = {}, src = opts.colors || {};
    Object.keys(PAL[theme]).forEach(function (k) { C[k] = src['t-' + k] || PAL[theme][k]; });
    C.bg = src.panel || src.bg || C.bg; C.fg = src.fg || C.fg; C.accent = src.accent || src['acc-lime'] || C.accent;
    var light = theme === 'light';
    var st = { answered: !!opts.answered, correct: opts.correct == null ? null : !!opts.correct };
    var seed = +opts.seed || 1, rnd = rng(seed * 7919 + 11);
    function rr(a, b) { return a + (b - a) * rnd(); }
    function sign() { return rnd() < .5 ? -1 : 1; }
    function H3() { return [[2, rr(.04, .09), rr(0, 6.28)], [3, rr(.02, .05), rr(0, 6.28)], [5, rr(.008, .02), rr(0, 6.28)]]; }

    /* ---------- the day's layout (metres; water level at y = 0) ---------- */
    var baseYaw = rr(-32, 32), side = sign();                     /* where the camera stands, and which way the flag flies */
    var CAMA = baseYaw * Math.PI / 180;
    var pond = blob(0, 0, rr(27, 31), rr(21, 25), rr(0, Math.PI), H3());
    var isl = blob(rr(-3, 3), rr(-3, 2), rr(12.5, 15), rr(9.5, 11.5), rr(0, Math.PI), H3());
    var TOP = .72, BED = -1.8;
    var tiltA = rr(0, 6.28), tilt = rr(.18, .3);                   /* the green's gentle tilt and one soft swale */
    function worldEdge(b, ang, k) { /* the outline point in world direction ang (0 = +Z, like yaw) */
      var lo = 0, hi = 3, dx = Math.sin(ang), dz = Math.cos(ang);
      for (var i = 0; i < 24; i++) { var m = (lo + hi) / 2; if (b.f(b.cx + dx * m * b.rx, b.cz + dz * m * b.rx) < (k || 1)) lo = m; else hi = m; }
      return [b.cx + dx * lo * b.rx, b.cz + dz * lo * b.rx];
    }
    /* the pot bunker sits on the camera's side of the island, a little left or right, so it always reads */
    var bAng = CAMA + sign() * rr(.45, .95), bR = [rr(2.4, 3), rr(1.6, 2), rr(0, Math.PI), [[2, .06, rr(0, 6)], [3, .04, rr(0, 6)]]], bunk;
    for (var bk = .72; bk > .3; bk -= .03) { /* near the edge, but its whole rim stays on the green, inside the collar */
      var bp = worldEdge(isl, bAng, bk); bunk = blob(bp[0], bp[1], bR[0], bR[1], bR[2], bR[3]);
      var inside = true;
      for (var bi = 0; bi < 16 && inside; bi++) { var be = bunk.edge(bi / 16 * Math.PI * 2, 1); inside = isl.f(be[0], be[1]) < .8; }
      if (inside) break;
    }
    /* the pin: somewhere on the green, away from the bunker */
    var pAng = bAng + Math.PI + rr(-.9, .9), pp = worldEdge(isl, pAng, rr(.28, .5));
    var PIN = [pp[0], 0, pp[1]];
    /* the walkway: a narrow footbridge from the island to the bank, off to one side of the camera */
    var wAng = CAMA + sign() * rr(1.0, 1.7);

    function landH(x, z) { /* the rolling ground around the pond, rising gently into an amphitheatre */
      var d = Math.hypot(x, z);
      var h = 2.2 + .9 * Math.sin(x * .052 + z * .021 + seed) + .7 * Math.sin(z * .066 - x * .029 + seed * 1.7) +
        .3 * Math.sin(x * .12 + z * .1 + seed * .3);
      return h + Math.min(9, .0022 * Math.pow(Math.max(0, d - 34), 2));
    }
    function mainH(x, z) {
      var p = pond.f(x, z), t = sstep(1.04, .74, p);
      return landH(x, z) * (1 - t) + BED * t;
    }
    function greenH(x, z) {
      return TOP + tilt * Math.sin(Math.atan2(z - isl.cz, x - isl.cx) - tiltA) * Math.min(1, Math.hypot(x - isl.cx, z - isl.cz) / isl.rx) +
        .12 * Math.sin(x * .35 + seed) * Math.sin(z * .3);
    }
    function islandH(x, z) { /* the island's surface: the green's plane less the pot bunker's bowl, with a small lip round it */
      var f = bunk.f(x, z);
      return greenH(x, z) - .55 * (1 - sstep(.58, .97, f)) + .07 * Math.exp(-Math.pow((f - 1.07) / .07, 2));
    }
    /* a patch meshed in rings that follow an outline exactly (the island, the bunker), so its edge and its colour
       bands are smooth curves, not grid steps. edge(θ, k) is the outline scaled by k; normals from the height function */
    function polar(shape, kMax, height, color, K, NS) {
      var P = [], Nn = [], Cc = [], I = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], e = .06;
      for (var r = 0; r <= K; r++) {
        var k = kMax * Math.pow(r / K, .75);
        for (var i = 0; i < NS; i++) {
          var xz = shape.edge(i / NS * Math.PI * 2, Math.max(k, 1e-4)), x = xz[0], z = xz[1], y = height(x, z);
          var n = [-(height(x + e, z) - height(x - e, z)) / (2 * e), 1, -(height(x, z + e) - height(x, z - e)) / (2 * e)], l = Math.hypot(n[0], n[1], n[2]);
          P.push(x, y, z); Nn.push(n[0] / l, n[1] / l, n[2] / l);
          var c = G.color(color(x, z, y, k)); Cc.push(c[0], c[1], c[2], 1);
          mn = [Math.min(mn[0], x), Math.min(mn[1], y), Math.min(mn[2], z)]; mx = [Math.max(mx[0], x), Math.max(mx[1], y), Math.max(mx[2], z)];
        }
      }
      for (r = 0; r < K; r++) for (i = 0; i < NS; i++) {
        var a0 = r * NS + i, a1 = r * NS + (i + 1) % NS, b0 = a0 + NS, b1 = a1 + NS;
        I.push(a0, b0, a1, a1, b0, b1);
      }
      var g = { positions: new Float32Array(P), normals: new Float32Array(Nn), colors: new Float32Array(Cc), indices: new Uint16Array(I),
        bounds: { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] } };
      /* front faces up: flip the winding if this outline runs clockwise when seen from above */
      var p0 = shape.edge(0, 1), p1 = shape.edge(.1, 1), cw = (p0[0] - shape.cx) * (p1[1] - shape.cz) - (p0[1] - shape.cz) * (p1[0] - shape.cx);
      if (cw > 0) for (i = 0; i < g.indices.length; i += 3) { var t = g.indices[i + 1]; g.indices[i + 1] = g.indices[i + 2]; g.indices[i + 2] = t; }
      return g;
    }

    /* ---------- environment: the cover sits on the panel colour; the sun comes from the camera's side ---------- */
    var sAz = CAMA + side * rr(1.5, 1.9), sEl = rr(.62, .78);
    R3.setEnvironment({
      background: C.bg, sky: C.sky, ground: C.ground, hemi: light ? .55 : .5,
      sun: { dir: [Math.sin(sAz) * Math.cos(sEl), Math.sin(sEl), Math.cos(sAz) * Math.cos(sEl)], intensity: light ? .58 : .64 },
      fog: { near: .95, far: 2.25, max: 1 }, wrap: .35
    });

    /* ---------- the ground ---------- */
    var trees = [], tries = 0, nT = 6 + Math.floor(rnd() * 4);
    while (trees.length < nT && tries++ < 200) { /* on the banks behind and beside the pond, never between camera and island */
      var a = rr(0, Math.PI * 2), da = Math.atan2(Math.sin(a - CAMA), Math.cos(a - CAMA));
      if (Math.abs(da) < 1.75) continue;
      var e = worldEdge(pond, a, 1), k = rr(1.35, 2.1), tx = e[0] * k, tz = e[1] * k;
      if (trees.some(function (t) { return Math.hypot(t[0] - tx, t[1] - tz) < 11; })) continue;
      trees.push([tx, tz, rr(.85, 1.3)]);
    }
    var terr = G.terrain({
      size: [176, 176], center: [0, 0], segments: [120, 120],
      height: mainH,
      color: function (x, z, y) { /* soft blends only, so no region edge steps along the grid */
        var p = pond.f(x, z), w = sstep(.86, .96, p) * (1 - sstep(1.16, 1.3, p));
        var c = mixC(C.rough, C.fairway, (light ? .55 : .38) * w);                        /* a mown collar around the water */
        c = mixC(c, C.trunk, .22 * (1 - sstep(.9, 1.12, p)));             /* a darker bank toward the water (wide, so no grid steps) */
        return mixC(c, C.bed, sstep(-.35, -1.2, y));                   /* only well under the water, so no tint creeps above it */                        /* the pond bed, seen faintly through the water */
      },
      ao: .42, aoRadius: 9, edgeFade: 22
    }); /* (the trees bring their own soft shadows, so a tree left out of the frame leaves none behind) */
    R3.add(terr);

    /* the island: the green and its collar, meshed in rings that follow the outline up to the bulkhead */
    var WQ = .99;
    R3.add(polar(isl, WQ, islandH, function (x, z, y, k) {
      var c = mixC(C.green, C.fairway, sstep(.83, .88, k));                 /* the green and its collar */
      var dp = Math.hypot(x - PIN[0], z - PIN[2]);
      if (dp < 1.2) c = mixC(c, C.shadow, .14 * (1 - sstep(.2, 1.2, dp)));  /* a soft contact shade at the cup */
      return c;
    }, 28, 144));
    /* the pot bunker: its own ring patch over the bowl, its walls and its lip, so the rim is a clean curve.
       Only the floor is sand; the walls are turf, a shade darker, so it reads as a hollow, not a mound */
    R3.add(polar(bunk, 1.16, islandH, function (x, z, y, k) {
      var c = mixC(C.sand, C.trunk, .12 * sstep(.5, .8, k));
      c = mixC(c, mixC(C.green, C.shadow, .22), sstep(.8, .86, k));
      return mixC(c, C.green, sstep(.98, 1.1, k));
    }, 18, 64), { layer: 2 });
    PIN[1] = islandH(PIN[0], PIN[2]);

    /* the bulkhead: a timber wall around the island, one exact outline (no grid steps), from under the water to the lip */
    (function () {
      var NW = 144, P = [], Nn = [], I = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      var pts = [];
      for (var i = 0; i < NW; i++) pts.push(isl.edge(i / NW * Math.PI * 2, WQ));
      pts.forEach(function (p, i) {
        var a = pts[(i + NW - 1) % NW], b = pts[(i + 1) % NW], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
        var nx = tz / l, nz = -tx / l;
        if (nx * (p[0] - isl.cx) + nz * (p[1] - isl.cz) < 0) { nx = -nx; nz = -nz; }   /* outward */
        var top = islandH(p[0], p[1]) + .02;
        P.push(p[0], -1.9, p[1], p[0], top, p[1]); Nn.push(nx, 0, nz, nx, 0, nz);
        [-1.9, top].forEach(function (y) { mn = [Math.min(mn[0], p[0]), Math.min(mn[1], y), Math.min(mn[2], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], y), Math.max(mx[2], p[1])]; });
      });
      for (i = 0; i < NW; i++) {
        var j = (i + 1) % NW, a0 = i * 2, a1 = i * 2 + 1, b0 = j * 2, b1 = j * 2 + 1;
        /* wind each quad so its front face looks outward */
        var ex = P[b0 * 3] - P[a0 * 3], ez = P[b0 * 3 + 2] - P[a0 * 3 + 2];   /* (b0 - a0) × (a1 - a0) with a1 - a0 = (0, h, 0) */
        var cx = -ez, cz = ex;
        if (cx * Nn[a0 * 3] + cz * Nn[a0 * 3 + 2] > 0) I.push(a0, b0, a1, a1, b0, b1); else I.push(a0, a1, b0, a1, b1, b0);
      }
      R3.add({ positions: new Float32Array(P), normals: new Float32Array(Nn), colors: null, indices: new Uint16Array(I),
        bounds: { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] } }, { color: C.trunk });
    })();

    /* contour hairlines on the ground, every CI metres: the old cover's contour map, now lying on the terrain.
       Marching squares on the terrain's own grid, chained into polylines and drawn as thin flat strips, one draw call */
    var CI = .6, NG = 140, GW = 176, gd = GW / NG, chains = [];
    (function () {
      var C1 = NG + 1, Hs = new Float32Array(C1 * C1), i, j;
      for (j = 0; j <= NG; j++) for (i = 0; i <= NG; i++) Hs[j * C1 + i] = mainH(-GW / 2 + i * gd, -GW / 2 + j * gd);
      for (var L = CI; L < 12; L += CI) {
        var pt = {}, adj = {}, segs = [];
        /* a crossing is named by its grid edge, so neighbouring cells share it exactly */
        var cross = function (u, v) {
          var k = Math.min(u, v) * 1e5 + Math.max(u, v);
          if (!pt[k]) { var t = (L - Hs[u]) / (Hs[v] - Hs[u]); pt[k] = [-GW / 2 + ((u % C1) + ((v % C1) - (u % C1)) * t) * gd, -GW / 2 + (Math.floor(u / C1) + (Math.floor(v / C1) - Math.floor(u / C1)) * t) * gd]; }
          return k;
        };
        for (j = 0; j < NG; j++) for (i = 0; i < NG; i++) {
          var q = [j * C1 + i, j * C1 + i + 1, (j + 1) * C1 + i + 1, (j + 1) * C1 + i], ks = [];
          for (var e = 0; e < 4; e++) { var u = q[e], v = q[(e + 1) % 4]; if ((Hs[u] < L) !== (Hs[v] < L)) ks.push(cross(u, v)); }
          for (var m = 0; m + 1 < ks.length; m += 2) segs.push([ks[m], ks[m + 1]]);
        }
        segs.forEach(function (sg, n) { [0, 1].forEach(function (z) { (adj[sg[z]] = adj[sg[z]] || []).push(n); }); });
        var used = new Uint8Array(segs.length);
        for (var s0 = 0; s0 < segs.length; s0++) {
          if (used[s0]) continue;
          used[s0] = 1;
          var line = [segs[s0][0], segs[s0][1]];
          [1, 0].forEach(function (dir) { /* grow from the tail, then from the head */
            for (;;) {
              var end = dir ? line[line.length - 1] : line[0], nx = (adj[end] || []).filter(function (n) { return !used[n]; })[0];
              if (nx == null) break;
              used[nx] = 1; var o = segs[nx][0] === end ? segs[nx][1] : segs[nx][0];
              if (dir) line.push(o); else line.unshift(o);
            }
          });
          if (line.length < 4) continue;
          /* keep only the stretches that show (away from the faded border and the water), thinned to ~2 m steps */
          var run = [], pl = line.map(function (k) { return pt[k]; });
          for (var ci = 0; ci <= pl.length; ci++) {
            var pp = pl[ci], on = pp && contourAlpha(pp) > .01;
            if (on && (!run.length || ci === pl.length - 1 || Math.hypot(pp[0] - run[run.length - 1][0], pp[1] - run[run.length - 1][1]) > 2)) run.push(pp);
            if (!on && run.length) { if (run.length > 2) chains.push(chaikin(chaikin(run))); run = []; }
          }
        }
      }
    })();
    function contourAlpha(p) { /* fade toward the terrain's own edge fade, and away from the water's bank */
      var edge = Math.min(p[0] + GW / 2, GW / 2 - p[0], p[1] + GW / 2, GW / 2 - p[1]);
      return sstep(22, 40, edge) * sstep(1.04, 1.16, pond.f(p[0], p[1]));
    }
    function chaikin(pl) { /* one corner-cutting pass, so the grid's kinks round off */
      var sm = [pl[0]];
      for (var i = 0; i + 1 < pl.length; i++) { var A = pl[i], B = pl[i + 1]; sm.push([A[0] * .75 + B[0] * .25, A[1] * .75 + B[1] * .25], [A[0] * .25 + B[0] * .75, A[1] * .25 + B[1] * .75]); }
      sm.push(pl[pl.length - 1]); return sm;
    }
    var contours = null, contourW = 0;
    function buildContours(w) {
      if (contours && Math.abs(w - contourW) / contourW < .15) return;
      contourW = w;
      var P = [], Nn = [], Cc = [], I = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      chains.forEach(function (ln) {
        var b = P.length / 3, n = ln.length;
        for (var i = 0; i < n; i++) {
          var a = ln[Math.max(0, i - 1)], c = ln[Math.min(n - 1, i + 1)], tx = c[0] - a[0], tz = c[1] - a[1], l = Math.hypot(tx, tz) || 1;
          var ox = -tz / l * w / 2, oz = tx / l * w / 2, p = ln[i];
          var al = contourAlpha(p);
          [[p[0] + ox, p[1] + oz], [p[0] - ox, p[1] - oz]].forEach(function (v) {
            var y = terr.heightAt(v[0], v[1]) + .06;
            P.push(v[0], y, v[1]); Nn.push(0, 1, 0); Cc.push(al, al, al, al);
            mn = [Math.min(mn[0], v[0]), Math.min(mn[1], y), Math.min(mn[2], v[1])]; mx = [Math.max(mx[0], v[0]), Math.max(mx[1], y), Math.max(mx[2], v[1])];
          });
          if (i) { var k = b + (i - 1) * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
      });
      var g = { positions: new Float32Array(P), normals: new Float32Array(Nn), colors: new Float32Array(Cc), indices: new (P.length / 3 > 65535 ? Uint32Array : Uint16Array)(I),
        bounds: { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] } };
      if (contours) contours.remove();
      contours = R3.add(g, { color: light ? '#1b1b1f' : '#ededee', unlit: true, transparent: true, opacity: light ? .16 : .09, layer: 2, order: 1, doubleSided: true });
    }

    /* water: one flat sheet with a soft sheen; the shore is the ground's own contour */
    R3.add(G.disc({ radius: 1, segments: 64 }), {
      color: C.water, position: [pond.cx, 0, pond.cz], scale: [pond.rx * 1.25, 1, pond.rx * 1.25], spec: [light ? .25 : .38, 70], opacity: light ? .9 : .92
    });

    /* the footbridge: planks laid from the island's edge to the bank */
    var w0 = worldEdge(isl, wAng, .97), w1 = w0, wd = [Math.sin(wAng), Math.cos(wAng)];
    for (var s = 0; s < 120; s++) { w1 = [w1[0] + wd[0] * .5, w1[1] + wd[1] * .5]; if (mainH(w1[0], w1[1]) > .45) break; }
    var wl = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) + 1.2, wm = [(w0[0] + w1[0]) / 2, (w0[1] + w1[1]) / 2];
    R3.add(G.box({ w: 1.5, h: .16, d: wl }), { color: mixC(C.trunk, C.sand, .35), position: [wm[0], .38, wm[1]], rotation: [0, wAng * 180 / Math.PI, 0] });

    /* trees: faceted crowns and slim trunks, one draw call, and their soft shadows. Rebuilt on each fit with only
       the trees that sit whole in the frame and clear of the corner tags */
    trees.forEach(function (t) { t.rot = rr(0, 90); });
    var treeMesh = null, shadeMesh = null, treeKey = null;
    function buildTrees(keep) {
      var key = keep.join(','); if (key === treeKey) return; treeKey = key;
      if (treeMesh) treeMesh.remove(); if (shadeMesh) shadeMesh.remove(); treeMesh = shadeMesh = null;
      var parts = [], sh = [];
      keep.forEach(function (i) {
        var t = trees[i], y = terr.heightAt(t[0], t[1]), k = t[2];
        parts.push({ geometry: G.cylinder({ radius: .3 * k, height: 3 * k, segments: 6 }), color: C.trunk, position: [t[0], y - .2, t[1]] });
        parts.push({ geometry: G.icosphere({ radius: 3.3 * k, detail: 1, flat: true }), color: C.tree, position: [t[0], y + 5.2 * k, t[1]], scale: [1, 1.2, 1], rotation: [0, t.rot, 0] });
        sh.push({ geometry: G.blob({ radius: 1, fade: .75 }), position: [t[0] + 1.4, terr.heightAt(t[0] + 1.4, t[1] + 1) + .05, t[1] + 1], scale: [6 * k, 1, 6 * k] });
      });
      if (parts.length) treeMesh = R3.add(G.merge(parts));
      if (sh.length) shadeMesh = R3.add(G.merge(sh), { color: C.shadow, opacity: light ? .16 : .32, transparent: true, unlit: true, layer: 3 });
    }
    function placeTrees() {
      var W = R3.width, Hh = R3.height, tall = aspect() < 1.2, keep = [];
      trees.forEach(function (t, i) {
        var c = [t[0], terr.heightAt(t[0], t[1]) + 5.2 * t[2], t[1]], p = R3.project(c);
        if (p.depth <= 0) return;
        var r = 3.5 * t[2] / R3.worldPerPixel(c), m = r * .1;
        var whole = p.x > m && p.x < W - m && p.y > m && p.y < Hh - m;
        var tag = tall && p.x - r < W * .72 && (p.y - r < Hh * .17 || p.y + r > Hh * .85);
        if (whole && !tag) keep.push(i);
      });
      buildTrees(keep);
    }

    /* the flag, its cup, and (after an answer) the ball; all sized in screen pixels on every fit */
    var stick = R3.add(G.cylinder({ radius: 1, height: 1, segments: 8 }), { color: light ? C.fg : '#e6e6e8', position: PIN.slice() });
    var cloth = R3.add(G.quad({ w: 1, h: 1, segX: 10, segY: 2, origin: [0, 1] }), { color: C.accent, doubleSided: true, emissive: light ? .45 : .6, wave: { amp: 0, waves: 1, speed: 3.2 } });
    var cup = R3.add(G.disc({ radius: 1, segments: 20 }), { color: light ? '#1b1b1f' : '#050506', unlit: true, layer: 2, position: [PIN[0], PIN[1] + .02, PIN[2]] });
    var ball = R3.add(G.sphere({ radius: 1, segments: 16, rings: 10 }), { color: C.ball, spec: [.4, 40], visible: false });
    /* a missed shot: two thin ripples on the water (unit radius; scaled to screen pixels on every fit) */
    function circle(r) { var p = []; for (var i = 0; i <= 64; i++) { var t = i / 64 * Math.PI * 2; p.push([Math.cos(t) * r, 0, Math.sin(t) * r]); } return p; }
    var ring = R3.add(G.merge([G.ribbon(circle(1), { width: .07 }), G.ribbon(circle(.58), { width: .1 }), G.disc({ radius: .12, segments: 16 })]),
      { color: light ? '#1b1b1f' : '#e6e6e8', unlit: true, transparent: true, opacity: light ? .32 : .5, layer: 1, visible: false, doubleSided: true });
    var splash = worldEdge(isl, CAMA + side * .5, 1.25); /* where a missed shot lands: in the water, short of the green */

    /* ---------- camera ---------- */
    function aspect() { return R3.width / Math.max(1, R3.height); }
    function view() { /* per aspect: a strip (start screen on a phone), landscape, or the tall desktop panel */
      var a = aspect();
      if (a >= 2) return { pitch: 22, fov: 28, pond: a > 4 ? .5 : .72, pad: { top: 10, right: 18, bottom: 6, left: 18 } };
      if (a >= 1.2) return { pitch: 30, fov: 30, pond: .9, pad: 16 };
      var hh = R3.height || 600;
      return { pitch: 58, fov: 30, pond: .98, pad: { top: Math.round(hh * .15), right: 20, bottom: Math.round(hh * .12), left: 20 } };
    }
    var flagTop = PIN.slice(), home = { yaw: baseYaw, pitch: 30 };
    function fit() {
      var v = view(), pts = [];
      for (var i = 0; i < 16; i++) { var th = i / 16 * Math.PI * 2, e = isl.edge(th, 1.04); pts.push([e[0], TOP, e[1]]); }
      for (i = 0; i < 12; i++) { th = i / 12 * Math.PI * 2; e = pond.edge(th, v.pond); pts.push([e[0], 0, e[1]]); }
      pts.push(flagTop);
      R3.frame(pts, { yaw: baseYaw, pitch: v.pitch, fov: v.fov, padding: v.pad, sticky: false });
      home = R3.getHome();
      sizeThings();
      applyDrift();
      placeTrees();
    }
    function sizeThings() {
      var kp = R3.worldPerPixel(PIN), hpx = Math.max(24, Math.min(58, (R3.height || 300) * .1));
      var sh = Math.max(2.2, kp * hpx), r = Math.max(.035, kp * .7);
      stick.set({ scale: [r, sh, r], position: PIN.slice() });
      var cw = Math.max(1.1, kp * hpx * .42), chh = cw * (home.pitch > 45 ? .8 : .62); /* taller when seen from above, so it still reads as a flag */
      cloth.set({ position: [PIN[0], PIN[1] + sh - kp * .5, PIN[2]], scale: [cw, chh, 1], rotation: [0, baseYaw + (side > 0 ? 0 : 180) + side * 24, 0],
        wave: { amp: cw * .1, waves: 1, speed: 3.2 } });
      buildContours(Math.max(.05, R3.worldPerPixel(home.target) * 1.1));
      cup.set({ scale: [Math.max(.11, kp * 2.4), 1, Math.max(.11, kp * 2.4)] });
      flagTop[1] = PIN[1] + sh + chh * .2;
      var br = Math.max(.12, kp * 2.6);
      ball.set({ scale: br });
      if (st.answered && st.correct) { var bx = PIN[0] + side * Math.max(1.1, kp * 16), bz = PIN[2] + 1.2; ball.set({ position: [bx, islandH(bx, bz) + br, bz] }); }
      ring.set({ scale: Math.max(1.2, kp * 11) });
    }

    /* the drift: a slow, small sway around the island, easing in, then for a few minutes, then easing to rest.
       It moves the home yaw and pitch only (offsets stay free for animateReveal) */
    /* about 18 s, then it rests: the start screen is the daily landing page and the lab dialog's, so it must not
       keep a GPU busy while nobody moves */
    var drift = { t: 0, yaw: 0, pitch: 0 }, DUR = 18000, PERIOD = 36000, AMP = 5;
    function applyDrift() { R3.setCamera({ yaw: home.yaw + drift.yaw, pitch: home.pitch + drift.pitch }); }
    function envelope(t) { return sstep(0, 4000, t) * (1 - sstep(DUR - 7000, DUR, t)); }
    var loop = null;
    function startDrift() {
      if (loop || R3.reduced) return;
      drift.t = 0;
      R3.wake(DUR / 1000);
      loop = R3.loop(function (dt) {
        drift.t += dt;
        var e = envelope(drift.t), u = drift.t / PERIOD * Math.PI * 2;
        drift.yaw = side * AMP * e * Math.sin(u);
        drift.pitch = 1.2 * e * Math.sin(u * .61 + 1.1) * Math.sin(Math.min(1, drift.t / 4000) * Math.PI / 2);
        applyDrift();
        if (drift.t >= DUR) { drift.yaw = drift.pitch = 0; applyDrift(); loop = null; return false; }
      });
    }

    /* re-fit whenever the canvas changes size (the engine's own sticky fit cannot be used: the drift moves the home view) */
    var lw = -1, lh = -1;
    var unsub = R3.onFrame(function (s) { if (s.width && (s.width !== lw || s.height !== lh)) { lw = s.width; lh = s.height; fit(); } });

    function showResult() {
      ball.set({ visible: !!(st.answered && st.correct) });
      ring.set({ visible: !!(st.answered && st.correct === false), position: [splash[0], .03, splash[1]] });
      if (R3.width) sizeThings();
    }
    showResult();
    if (R3.width) { lw = R3.width; lh = R3.height; fit(); }
    startDrift();

    var anchors = [
      { id: 'pin', kind: 'pin', world: flagTop, label: null },
      { id: 'green', kind: 'green', world: [isl.cx, TOP, isl.cz], label: null }
    ];
    return {
      anchors: anchors,
      /* the day's layout, for QA (test-cover.html checks every seed against it) */
      meta: {
        pin: PIN, flagTop: flagTop, bridge: wl, trees: trees.map(function (t) { return [t[0], terr.heightAt(t[0], t[1]) + 5.2 * t[2], t[1], 3.3 * t[2]]; }),
        island: Array.apply(null, Array(24)).map(function (_, i) { var e = isl.edge(i / 24 * Math.PI * 2, 1); return [e[0], TOP, e[1]]; }),
        bunkerInside: Array.apply(null, Array(16)).every(function (_, i) { var e = bunk.edge(i / 16 * Math.PI * 2, 1); return isl.f(e[0], e[1]) < .82; }),
        pinClear: bunk.f(PIN[0], PIN[2]) > 1.4 && isl.f(PIN[0], PIN[2]) < .8
      },
      /* a gentle settle into the cover; resolves at once under reduced motion */
      animateReveal: function () {
        var h = R3.flyIn({ yaw: -side * 7, pitch: 5, zoom: 1.12, duration: 2400 });
        return h.done || Promise.resolve();
      },
      update: function (o) {
        o = o || {};
        if ('answered' in o) st.answered = !!o.answered;
        if ('correct' in o) st.correct = o.correct == null ? null : !!o.correct;
        showResult();
        R3.invalidate();
      },
      dispose: function () { unsub(); if (loop) loop.stop(); loop = null; }
    };
  };
})(typeof window !== 'undefined' ? window : this);
