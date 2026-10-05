/* Golfo 3D: the hole. A top-ish three-quarter view from behind the tee, built from a challenge's
   `scene` ({type: 'hole', par, length, dogleg, hazards, green, wind, downhill}).
   G3D.scenes.hole(renderer, scene, opts) → {anchors, animateReveal, update, at, destroy}
   Coordinates: metres, tee at the origin, the hole runs along −Z and bends with the dogleg.
   Everything is laid out in hole space (s = metres along the line of play, l = metres to its right)
   and mapped to the world through the centreline, so "at" distances are true distances from the tee.
   No labels are drawn here: `anchors` carry world points for the app's HTML labels. */
(function (root) {
  'use strict';
  var G = root.G3D;
  if (!G) return;
  G.scenes = G.scenes || {};

  var D2R = Math.PI / 180;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  /* css colour → sRGB [r, g, b] in 0..1 (the terrain accepts these arrays directly) */
  function rgb(c) {
    if (Array.isArray(c)) return c.slice(0, 3);
    c = String(c || '').trim();
    if (c.charAt(0) === '#') {
      if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      var n = parseInt(c.slice(1, 7), 16);
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    }
    var m = c.match(/[\d.]+/g);
    return m && m.length >= 3 ? [m[0] / 255, m[1] / 255, m[2] / 255] : [.5, .5, .5];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rng(seed) { /* mulberry32: the same challenge always grows the same trees */
    var a = (seed >>> 0) || 1;
    return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* the 3D palette: the site's golf tokens, lifted a touch so lit surfaces read on near-black.
     Any key can be overridden with opts.colors['t-<key>'] */
  var PAL = {
    dark: {
      rough: '#232b20', fairway: '#3c5632', green: '#5a8a3e', tee: '#46643a', sand: '#8e7d58', water: '#285381', shore: '#30372a',
      oob: '#1b1c1b', tree: '#2f4628', trunk: '#3a3328', stake: '#efeff1', guide: '#9a9aa0', ball: '#fefdff',
      sky: '#c9d4e6', ground: '#3a3a32', wind: '#6ea8fe', bg: '#0b0b0c', accent: '#d7f56a'
    },
    light: {
      rough: '#d2dac2', fairway: '#b3cd90', green: '#90c064', tee: '#a9ca86', sand: '#e8d29e', water: '#9fc1f0', shore: '#c8cfb5',
      oob: '#d9d9d0', tree: '#8db07a', trunk: '#9c8a70', stake: '#5d5d64', guide: '#6e6e76', ball: '#ffffff',
      sky: '#ffffff', ground: '#d8d4c4', wind: '#2563eb', bg: '#fefdff', accent: '#1B4038'
    }
  };
  /* green footprints, half-sizes in metres [across, along] */
  var GREENS = { wide: [16, 10], deep: [9.5, 19], tiered: [14, 13], small: [9, 8], biarritz: [10, 21], redan: [15, 10], punchbowl: [13, 13] };
  var EN = { hz_water: 'Water', hz_bunker: 'Bunker', hz_ob: 'OB', hz_trees: 'Trees', green: 'Green', tee: 'Tee', downhill: 'downhill',
    wind_into: 'headwind', wind_helping: 'tailwind', 'wind_left-to-right': 'left to right', 'wind_right-to-left': 'right to left', pair: '{0} ×2', fromTee: '{0} from tee' };

  G.scenes.hole = function (R, sc, opts) {
    opts = opts || {}; sc = sc || {};
    var theme = opts.theme === 'light' ? 'light' : 'dark', C = opts.colors || {}, base = PAL[theme], P = {};
    Object.keys(base).forEach(function (k) { P[k] = rgb(C['t-' + k] || base[k]); });
    var ACC = C.accent || C['acc-lime'] || base.accent, BG = C.bg || base.bg, WINDC = C['water-ink'] || base.wind;
    var reduced = !!(opts.reduced || R.reduced), answered = !!opts.answered;
    var imperial = opts.units === 'imperial';
    /* i18n and units: the app passes its own; the defaults are English and metric */
    var T_ = opts.t, F_ = opts.fmt || {}; /* swapped by relabel() when the language changes */
    var tr = function (k, a) { var s = T_ ? T_(k) : null; s = s || EN[k] || k; return a == null ? s : s.replace('{0}', a); };
    var fmtD = function (m) { return F_.d ? F_.d(m) : imperial ? Math.round(m * 1.0936) + ' yd' : Math.round(m) + ' m'; };
    var fmtW = function (k) { return F_.w ? F_.w(k) : imperial ? Math.round(k * .6214) + ' mph' : Math.round(k) + ' km/h'; };
    var rnd = rng(opts.seed || 7);

    /* ---------- the hole, in hole space ---------- */
    var L = clamp(+sc.length || 380, 80, 700), par = +sc.par || (L < 230 ? 3 : L < 440 ? 4 : 5);
    var dl = sc.dogleg === 'left' ? -1 : sc.dogleg === 'right' ? 1 : 0;
    var gr = sc.green || {}, shape = gr.shape || 'wide', GS = GREENS[shape] || [13, 12];
    var grx = GS[0], grz = GS[1], swale = !!gr.swale || shape === 'biarritz', tiered = shape === 'tiered';
    var pinS = L + (gr.pin === 'front' || gr.pin === 'tier-bottom' ? -.5 : gr.pin === 'back' || gr.pin === 'tier-top' ? .5 : 0) * grz;
    var FW = 15, W0 = 55, BANK = 1.6, TW = 5.5, TD = 7;
    var DOWN = Array.isArray(sc.downhill) ? [clamp(+sc.downhill[0], 0, L), clamp(+sc.downhill[1], 0, L + grz)] : null, DROP = 8;

    /* the centreline: straight off the tee, then turning up to 30° through the dogleg */
    var STEP = 3, TH = 30 * D2R * dl, B0 = .42 * L, B1 = .72 * L, CL = [], i, s;
    var x = 0, z = 0, n = Math.ceil((L + 150) / STEP);
    for (i = 0; i <= n; i++) {
      s = i * STEP; CL.push({ s: s, x: x, z: z, h: TH * sstep(B0, B1, s) });
      var hm = TH * sstep(B0, B1, s + STEP / 2); x += Math.sin(hm) * STEP; z -= Math.cos(hm) * STEP;
    }
    for (s = -STEP; s >= -90; s -= STEP) CL.unshift({ s: s, x: 0, z: -s, h: 0 });
    function cl(s) { /* centreline point and heading at s (straight beyond the ends) */
      var f = (s - CL[0].s) / STEP, k = clamp(Math.floor(f), 0, CL.length - 2), u = f - k, a = CL[k], b = CL[k + 1];
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, h: a.h + (b.h - a.h) * clamp(u, 0, 1) };
    }
    function wxz(s, l) { var f = cl(s); return [f.x + Math.cos(f.h) * l, f.z + Math.sin(f.h) * l]; }
    var cache = new Map();
    function proj(x, z) { /* world → hole space [s, l], nearest point on the centreline */
      var key = x + ',' + z, c = cache.get(key); if (c) return c;
      var best = Infinity, bs = 0, bl = 0, n1 = CL.length - 1, kb = 0, k;
      for (k = 0; k < n1; k += 6) { var d0 = (CL[k].x - x) * (CL[k].x - x) + (CL[k].z - z) * (CL[k].z - z); if (d0 < best) { best = d0; kb = k; } }
      best = Infinity; /* the centreline turns at most 30°, so the nearest segment is within a few of the nearest sample */
      for (k = Math.max(0, kb - 9); k < Math.min(n1, kb + 9); k++) {
        var a = CL[k], b = CL[k + 1], dx = (b.x - a.x) / STEP, dz = (b.z - a.z) / STEP, px = x - a.x, pz = z - a.z;
        var t = px * dx + pz * dz;
        if (k > 0) t = Math.max(t, 0); if (k < CL.length - 2) t = Math.min(t, STEP);
        var qx = px - dx * t, qz = pz - dz * t, d = qx * qx + qz * qz;
        if (d < best) { best = d; bs = a.s + t; bl = qx * -dz + qz * dx; }
      }
      c = [bs, bl]; cache.set(key, c); return c;
    }

    /* ---------- hazards, placed in hole space ---------- */
    var HZ = (sc.hazards || []).map(function (h, k) {
      return { k: k, kind: h.kind || 'bunker', side: h.side === 'left' ? -1 : h.side === 'right' ? 1 : 0, at: +h.at || L / 2 };
    });
    function greenside(h) { return h.kind !== 'ob' && h.at >= L - grz - 22; }
    var pinchers = HZ.filter(function (h) { return !greenside(h) && h.side && (h.kind === 'bunker' || h.kind === 'water'); });
    var wideners = HZ.filter(function (h) { return !greenside(h) && !h.side && h.kind === 'bunker'; });
    /* fairway edges: side hazards pinch their side, a centre-line bunker pushes both sides out */
    function edge(side, s) {
      var e = FW;
      pinchers.forEach(function (p) { if (p.side === side) e = Math.min(e, FW + (7.5 - FW) * (1 - sstep(20, 42, Math.abs(s - p.at)))); });
      wideners.forEach(function (p) { e = Math.max(e, FW + (21 - FW) * (1 - sstep(16, 34, Math.abs(s - p.at)))); });
      return e;
    }
    var FS0 = par > 3 ? clamp(.3 * L, 80, 150) : L - grz - 20, FE = L - grz * .55;

    var bunkers = [], waters = [], treeSpots = [], obs = [], labels = [];
    var guard = gr.guarded, guardWater = gr.guard === 'water';
    function drawnNear(side) { return HZ.some(function (h) { return (h.kind === 'bunker' || h.kind === 'water') && h.side === side && h.at >= L - 30 && h.at <= L + grz; }); }
    HZ.forEach(function (h) {
      var gs = greenside(h), e = h.side ? edge(h.side, h.at) : 0, lab = { h: h, kind: h.kind, side: h.side, at: h.at };
      if (h.kind === 'bunker') {
        var b;
        if (gs && h.side) b = { s: clamp(h.at, L - grz * .8, L + grz * .3), l: h.side * (grx + 7), rl: 4.6, rs: Math.max(6.5, grz * .62), a: h.side * -8, depth: 1.1 };
        else if (gs) b = { s: Math.min(h.at, L - grz - 5.5), l: 0, rl: Math.max(8, grx * .62), rs: 4.4, a: 0, depth: 1.1 };
        else if (h.side) b = { s: h.at, l: h.side * (e + 6), rl: 5, rs: 9.5, a: h.side * 12, depth: .9 };
        else b = { s: h.at, l: 0, rl: 7.5, rs: 11, a: 0, depth: .9 };
        b.ph = rnd() * 6.3; bunkers.push(b); lab.f = b;
        lab.outer = b.l + (h.side || 1) * b.rl; lab.s = b.s;
      } else if (h.kind === 'water') {
        var w;
        if (!h.side) w = { creek: true, s: h.at, hw: 5 };
        else if (gs) w = { sa: L - grz * .6, sb: L + grz * .4, la: h.side * (grx + 12), lb: h.side * (grx + 12), rl: 8.5, rs: 9 };
        else {
          w = { sa: h.at, sb: h.at, la: h.side * (e + 17), lb: h.side * (e + 17), rl: 14, rs: 24 };
          /* the same side's greenside water joins it: one lake running up to the green (a Cape hole) */
          if (guardWater && (guard === (h.side < 0 ? 'left' : 'right') || guard === 'both') && L - h.at < 230) { w.sa = h.at - 12; w.sb = L - 2; w.lb = h.side * (grx + 16); w.rs = 18; w.joined = true; }
        }
        w.ph = rnd() * 6.3; waters.push(w); lab.f = w;
        lab.s = w.creek ? w.s : h.at; lab.outer = w.creek ? 0 : w.la + h.side * w.rl;
      } else if (h.kind === 'trees') {
        var sd = h.side || (rnd() < .5 ? -1 : 1), cnt = h.side ? 7 : 3;
        for (var t = 0; t < cnt; t++) {
          var ts = h.at - 30 + 60 * (t + .5) / cnt + (rnd() - .5) * 6;
          var tl = h.side ? h.side * (edge(h.side, ts) + 13 + rnd() * 20) : (t - 1) * 9;
          treeSpots.push({ s: ts, l: tl, k: .85 + rnd() * .35 });
        }
        lab.s = h.at; lab.outer = h.side * (edge(h.side, h.at) + 37); lab.side = h.side;
        if (!h.side) lab.outer = 0;
      } else if (h.kind === 'ob') {
        if (h.side) { obs.push({ side: h.side, l: h.side * (FW + 22), s0: 8, s1: L + grz + 14, em: clamp(h.at - 30, 8, L) }); lab.long = true; lab.s = clamp(h.at, .2 * L, .9 * L); lab.outer = h.side * (FW + 22); }
        else { var so = Math.max(h.at, L + grz + 8); obs.push({ across: true, s: so, l0: -40, l1: 40 }); lab.s = so; lab.outer = 0; lab.behind = true; }
      }
      labels.push(lab);
    });
    /* greenside guards the data names without a hazard of their own */
    function addGuard(side) {
      if (guardWater) waters.push({ sa: L - grz * .6, sb: L + grz * .4, la: side * (grx + 11), lb: side * (grx + 11), rl: 8, rs: 9, ph: rnd() * 6.3, guard: true });
      else if (side) bunkers.push({ s: L - grz * .1, l: side * (grx + 7), rl: 4.6, rs: Math.max(6.5, grz * .62), a: side * -8, depth: 1.1, ph: rnd() * 6.3, guard: true });
      else bunkers.push({ s: L - grz - 5.5, l: 0, rl: Math.max(8, grx * .62), rs: 4.4, a: 0, depth: 1.1, ph: rnd() * 6.3, guard: true });
    }
    var joined = waters.some(function (w) { return w.joined; });
    if (guard === 'front' && !HZ.some(function (h) { return !h.side && greenside(h); })) addGuard(0);
    if ((guard === 'left' || guard === 'both') && !drawnNear(-1) && !(joined && guardWater)) addGuard(-1);
    if ((guard === 'right' || guard === 'both') && !drawnNear(1) && !(joined && guardWater)) addGuard(1);
    var obBehind = obs.some(function (o) { return o.across && o.s > L; });
    var sHi = Math.max(L + grz + 56, obBehind ? obs.filter(function (o) { return o.across; })[0].s + 34 : 0), sLo = -44;
    /* a few trees behind the green: a backdrop that makes the flag read (none where out of bounds lies behind) */
    if (!obBehind) for (i = 0; i < 5; i++) treeSpots.push({ s: L + grz + 20 + rnd() * 14, l: (i - 2) * 13 + (rnd() - .5) * 6, k: .8 + rnd() * .35, back: true });

    /* ---------- shape fields ---------- */
    function eEll(f, s, l) { /* rotated, gently lobed ellipse; < 1 inside */
      var ds = s - f.s, dd = l - f.l, a = (f.a || 0) * D2R, ca = Math.cos(a), sa = Math.sin(a);
      var u = dd * ca - ds * sa, v = dd * sa + ds * ca, e = Math.hypot(u / f.rl, v / f.rs);
      return e * (1 + .05 * Math.sin(Math.atan2(v, u) * 2 + f.ph));
    }
    function eWat(w, s, l) {
      if (w.creek) return Math.abs(s - w.s - 2.2 * Math.sin(l * .06 + w.ph)) / w.hw;
      var u = clamp((s - w.sa) / ((w.sb - w.sa) || 1), 0, 1), sp = w.sa + (w.sb - w.sa) * u, lc = w.la + (w.lb - w.la) * u;
      var e = Math.hypot((l - lc) / w.rl, (s - sp) / w.rs);
      return e * (1 + .05 * Math.sin(Math.atan2(s - sp, l - lc) * 3 + w.ph));
    }
    var GF = { s: L, l: 0, rl: grx, rs: grz, a: gr.angle || 0, ph: 1.3 };
    function eGreen(s, l) { return eEll(GF, s, l); }
    function inFair(s, l) {
      if (s < FS0 - 30 || s > FE + 2) return false;
      var e = l < 0 ? edge(-1, s) : edge(1, s), hw = par > 3 ? e : 9, al = Math.abs(l);
      if (s < FS0) { var cap = 26; if (s < FS0 - cap) return false; var q = (FS0 - s) / cap; return q * q + (al / hw) * (al / hw) < 1; }
      return al < hw;
    }
    function teeE(s, l) { return Math.max(Math.abs(l) / TW, Math.abs(s) / TD); }
    function hBase(s, l) {
      var al = Math.abs(l);
      var h = (.3 * Math.sin(s * .023 + l * .041) + .22 * Math.sin(l * .083 - s * .017 + 1.3)) * (.35 + .65 * sstep(6, 30, al));
      /* (no banks or mounds framing the corridor: lit, they read as dark bands down the sides) */
      if (DOWN) h -= DROP * sstep(DOWN[0], DOWN[1], s);
      h += .55 * (1 - sstep(1, 1.3, teeE(s, l)));
      var ge = eGreen(s, l);
      if (ge < 1.6) {
        var gin = 1 - sstep(.92, 1.4, ge), gs = s - L;
        h += .55 * gin;
        if (tiered) h += .7 * sstep(-2.2, 2.2, gs) * gin;
        if (swale) h -= 1.15 * Math.exp(-gs * gs / 18) * gin;
      }
      for (var k = 0; k < bunkers.length; k++) {
        var b = bunkers[k], e = eEll(b, s, l);
        if (e < 1.5) h += -b.depth * (1 - sstep(.4, 1, e)) + .22 * Math.exp(-Math.pow((e - 1.13) / .13, 2));
      }
      return h;
    }
    waters.forEach(function (w) { w.level = w.creek ? hBase(w.s, 0) : hBase((w.sa + w.sb) / 2, (w.la + w.lb) / 2); });
    function H(s, l) {
      var h = hBase(s, l);
      for (var k = 0; k < waters.length; k++) {
        var w = waters[k], e = eWat(w, s, l);
        if (e < 2) { var lv = 1 - sstep(1, 1.75, e); h = h * (1 - lv) + w.level * lv - 1.7 * (1 - sstep(.5, 1.02, e)); }
      }
      return h;
    }
    function beyondOB(s, l) {
      var t = 0;
      obs.forEach(function (o) {
        if (o.across) t = Math.max(t, sstep(o.s + .5, o.s + 4, s));
        else t = Math.max(t, sstep(Math.abs(o.l) + .5, Math.abs(o.l) + 4, l * o.side) * sstep(o.s0 - 10, o.s0, s));
      });
      return t;
    }
    /* colours blend over about one grid cell from true distances, so region edges are smooth curves, not stairs */
    var AA = 1;
    function over(c, top, d) { var t = 1 - sstep(-AA, AA, d); return t <= 0 ? c : t >= 1 ? top : mix(c, top, t); }
    function fairD(s, l) {
      var e = l < 0 ? edge(-1, s) : edge(1, s), hw = par > 3 ? e : 9, al = Math.abs(l), d = al - hw;
      if (s < FS0) { var cap = 26, q = (FS0 - s) / cap; d = (Math.sqrt(q * q + (al / hw) * (al / hw)) - 1) * Math.min(cap, hw); }
      return Math.max(d, s - FE);
    }
    function colour(s, l) {
      var c = P.rough, ob = beyondOB(s, l);
      return ob ? mix(c, P.oob, .62 * ob) : c;
    }

    /* ---------- the ground ---------- */
    var LW = W0 + 30;
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    for (s = sLo; s <= sHi + .1; s += 6) [-LW, LW].forEach(function (l) { var p = wxz(s, l); mn = [Math.min(mn[0], p[0]), Math.min(mn[1], p[1])]; mx = [Math.max(mx[0], p[0]), Math.max(mx[1], p[1])]; });
    /* the ground carries the shape (about 17k vertices); the crisp regions on it carry the detail */
    var TWd = mx[0] - mn[0], TDp = mx[1] - mn[1], cell = Math.max(1.5, Math.sqrt(TWd * TDp / 17000));
    var segs = [Math.round(TWd / cell), Math.round(TDp / cell)], FADE = 5;
    AA = cell * .75;
    var occl = [];
    treeSpots.forEach(function (t) { var p = wxz(t.s, t.l); t.x = p[0]; t.z = p[1]; occl.push({ x: p[0] + 1.6, z: p[1] + .8, r: 8 * t.k, k: .42 }); });
    var terr = G.terrain({
      size: [TWd, TDp], center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2], segments: segs,
      height: function (x, z) { var q = proj(x, z); return H(q[0], q[1]); },
      color: function (x, z) { var q = proj(x, z); return colour(q[0], q[1]); },
      ao: .35, aoRadius: 7, edgeFade: FADE, occluders: occl
    });
    var tg = terr.grid, tX0 = tg.x0, tZ0 = tg.z0, tX1 = tg.x0 + tg.nx * tg.dx, tZ1 = tg.z0 + tg.nz * tg.dz;
    var gy = terr.heightAt;
    function wp(s, l, lift) { var p = wxz(s, l); return [p[0], gy(p[0], p[1]) + (lift || 0), p[1]]; }

    R.setEnvironment({
      background: BG, sky: P.sky, ground: P.ground, hemi: .5,
      sun: { dir: [-.55, .7, .4], intensity: .66 }, fog: { near: 1.25, far: 3.5, max: .35 }
    });
    var meshes = [];
    function add(g, o) { var m = R.add(g, o); meshes.push(m); return m; }
    /* the ground carried on to the horizon in its border colour (rough, or out of bounds), so no slab edge shows */
    add(G.apron(terr, { scale: 3.6, segments: 40, fade: .3, color: function (x, z) { var q = proj(clamp(x, tX0, tX1), clamp(z, tZ0, tZ1)); return colour(q[0], q[1]); } }), { order: -2 });
    add(terr, { order: -1 });

    /* the regions: each its own mesh on the ground, cut along its true outline with a thin soft rim */
    function hbox(s0, s1, l0, l1) { /* the world box of a stretch of hole space */
      var a = [Infinity, Infinity], b = [-Infinity, -Infinity];
      for (var q = 0; q <= 16; q++) { var ss = s0 + (s1 - s0) * q / 16; [l0, l1].forEach(function (ll) { var p = wxz(ss, ll); a = [Math.min(a[0], p[0]), Math.min(a[1], p[1])]; b = [Math.max(b[0], p[0]), Math.max(b[1], p[1])]; }); }
      return [a[0], a[1], b[0], b[1]];
    }
    function region(sdH, box, col, order, minR, mo) {
      var sub = Math.min(5, Math.max(1, Math.ceil(cell / Math.max(.4, (minR || 1e9) / 6))));
      var g = G.region(terr, { bounds: box, sd: function (x, z) { var q = proj(x, z); return sdH(q[0], q[1]); }, color: typeof col === 'function' ? col : function () { return col; },
        sub: sub, rim: clamp(cell * .4, .5, .9), height: mo && mo.height, lift: mo && mo.height ? 0 : .04 });
      if (!g.indices.length) return null;
      var o = { transparent: true, layer: 1, order: order }; if (mo && mo.mesh) for (var k in mo.mesh) o[k] = mo.mesh[k];
      return add(g, o);
    }
    region(fairD, hbox(FS0 - 30, FE + 3, -24, 24), P.fairway, -9);
    region(function (s, l) { return Math.max(Math.abs(l) - TW, Math.abs(s) - TD); }, hbox(-TD - 2, TD + 2, -TW - 2, TW + 2), P.tee, -8, TW);
    var gm = Math.min(grx, grz);
    region(function (s, l) { return (eGreen(s, l) - 1.22) * gm; }, hbox(L - grz * 1.4, L + grz * 1.4, -grx * 1.4, grx * 1.4), P.fairway, -7, gm);
    region(function (s, l) { return (eGreen(s, l) - 1) * gm; }, hbox(L - grz * 1.2, L + grz * 1.2, -grx * 1.2, grx * 1.2), P.green, -6, gm);
    bunkers.forEach(function (b) {
      var r = Math.max(b.rl, b.rs) * 1.2;
      region(function (s, l) { return (eEll(b, s, l) - 1) * Math.min(b.rl, b.rs); }, hbox(b.s - r, b.s + r, b.l - r, b.l + r), P.sand, -4, Math.min(b.rl, b.rs));
    });

    /* water: a flat sheet cut along the shore just inside its hollow's rim, so the shoreline is a clean curve */
    waters.forEach(function (w) {
      var box, sc = w.creek ? w.hw : Math.min(w.rl, w.rs);
      if (w.creek) box = hbox(w.s - w.hw * 1.6 - 3, w.s + w.hw * 1.6 + 3, -LW, LW);
      else { var r0 = Math.max(w.rl, w.rs) * 1.3; box = hbox(Math.min(w.sa, w.sb) - r0, Math.max(w.sa, w.sb) + r0, Math.min(w.la, w.lb) - r0, Math.max(w.la, w.lb) + r0); }
      box = [Math.max(box[0], tX0), Math.max(box[1], tZ0), Math.min(box[2], tX1), Math.min(box[3], tZ1)];
      region(function (s, l) { return (eWat(w, s, l) - 1.14) * sc; }, box, P.shore, -5, sc);
      region(function (s, l) { return (eWat(w, s, l) - .97) * sc; }, box, P.water, -3, sc, { height: function () { return w.level - .02; }, mesh: { spec: [.35, 60], opacity: .94 } });
    });

    /* trees: faceted crowns and trunks, one draw call */
    if (treeSpots.length) {
      var parts = [];
      treeSpots.forEach(function (t) {
        var y = gy(t.x, t.z), k = t.k;
        parts.push({ geometry: G.cylinder({ radius: .38 * k, height: 3.2 * k, segments: 6 }), color: P.trunk, position: [t.x, y - .2, t.z] });
        parts.push({ geometry: G.icosphere({ radius: 4.1 * k, detail: 1, flat: true }), color: P.tree, position: [t.x, y + 6 * k, t.z], scale: [1, 1.16, 1], rotation: [0, rnd() * 70, 0] });
      });
      add(G.merge(parts));
    }

    /* ---------- the flag, the ball, stakes, the distance rail: sized in screen pixels ---------- */
    var PIN = wp(pinS, 0), TEE = wp(0, 0);
    var stick = add(G.cylinder({ radius: 1, height: 1, segments: 8 }), { color: P.ball, position: PIN.slice() });
    var cloth = add(G.quad({ w: 1, h: 1, segX: 10, segY: 2, origin: [0, 1] }), { color: ACC, doubleSided: true, emissive: .6, wave: { amp: .25, waves: 1.1, speed: 5 } });
    var cup = add(G.disc({ radius: 1, segments: 20 }), { color: '#000000', layer: 2, unlit: true, position: [PIN[0], PIN[1] + .02, PIN[2]] });
    var ball = add(G.sphere({ radius: 1, segments: 16, rings: 10 }), { color: P.ball, spec: [.4, 40] });
    var shadow = add(G.blob({ radius: 1, fade: .8 }), { color: '#000000', opacity: theme === 'light' ? .22 : .45, transparent: true, layer: 3, unlit: true });
    var markers = add(G.sphere({ radius: 1, segments: 10, rings: 6 }), { color: P.ball, spec: [.3, 30] });

    /* the distance rail: a thin ruler on the side away from the dogleg, ticked every 100 m (or 100 yd) */
    var railSide = dl === -1 ? 1 : -1, ext = FW;
    bunkers.forEach(function (b) { if (Math.sign(b.l) === railSide && b.s < L - grz - 14) ext = Math.max(ext, Math.abs(b.l) + b.rl); });
    waters.forEach(function (w) { if (!w.creek && Math.sign(w.la) === railSide) ext = Math.max(ext, Math.abs(w.la) + w.rl, Math.abs(w.lb) + w.rl); });
    treeSpots.forEach(function (t) { if (!t.back && Math.sign(t.l) === railSide) ext = Math.max(ext, Math.abs(t.l) + 5); });
    obs.forEach(function (o) { if (!o.across && o.side === railSide) ext = Math.max(ext, Math.abs(o.l)); });
    var railL = railSide * clamp(ext + 7, FW + 7, W0 - 4), railEnd = L - grz - 12, unitM = imperial ? .9144 : 1, tickStep = 100 * unitM;
    var ticks = [];
    for (var tv = tickStep; tv < railEnd - 4; tv += tickStep) {
      ticks.push({ s: tv, v: Math.round(tv / unitM) });
    }
    var railPts = []; for (s = 0; s <= railEnd + .1; s += 4) railPts.push(wp(s, railL, .07));
    var rail = null, tickMesh = null, stakeMesh = null, obLines = [], guides = [], chevrons = null, contours = null, windMeshes = [];

    /* the wind: three thin streaks high over the first half of the hole, with arrowheads */
    var wind = sc.wind && sc.wind.kmh ? sc.wind : null, windPts = [];
    if (wind) {
      var chord = norm2([PIN[0] - TEE[0], PIN[2] - TEE[2]]), right = [-chord[1], chord[0]];
      var wdir = { into: [-chord[0], -chord[1]], helping: chord, 'left-to-right': right, 'right-to-left': [-right[0], -right[1]] }[wind.dir] || chord;
      var lenW = wind.dir === 'into' || wind.dir === 'helping' ? clamp(.12 * L, 24, 50) : 34;
      var along = wind.dir === 'into' || wind.dir === 'helping', ws = -railSide;
      (along ? [[.2, 26, 22], [.3, 36, 30], [.25, 46, 26]] : [[.22, -14, 24], [.32, 6, 32], [.27, 26, 27]]).forEach(function (q) {
        var c = wp(q[0] * L, along ? ws * q[1] : q[1]); c[1] = TEE[1] + q[2];
        var a0 = [c[0] - wdir[0] * lenW / 2, c[1], c[2] - wdir[1] * lenW / 2], a1 = [c[0] + wdir[0] * lenW / 2, c[1], c[2] + wdir[1] * lenW / 2];
        windPts.push([a0, a1]);
      });
    }
    function norm2(v) { var m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; }

    /* downhill: chevrons on the fairway pointing toward the green */
    var chevS = DOWN ? [0, 1, 2].map(function (k) { return DOWN[0] + (Math.min(DOWN[1], FE - 6) - DOWN[0]) * (k + .5) / 3; }) : [];

    var revealE = 1, flagUp = 1, windE = 1;
    function sizeThings() {
      if (!R.width) return;
      var kp = R.worldPerPixel(PIN), kt = R.worldPerPixel(TEE), km = R.worldPerPixel(wp(L * .5, 0));
      var sh = Math.max(5, kp * 34) * flagUp;
      stick.set({ scale: [Math.max(.07, kp * .7), Math.max(.001, sh), Math.max(.07, kp * .7)], position: PIN.slice() });
      cloth.set({ position: [PIN[0] + kp * .45, PIN[1] + sh, PIN[2]], scale: [Math.max(1.8, kp * 15), Math.max(1.1, kp * 9.5) * Math.max(.001, flagUp), 1], rotation: [0, 18, 0] });
      cup.set({ scale: [Math.max(.15, kp * 2), 1, Math.max(.15, kp * 2)] });
      var br = Math.max(.15, kt * 2.6);
      ball.set({ scale: br, position: [TEE[0], TEE[1] + br, TEE[2]] });
      shadow.set({ scale: [br * 2.2, 1, br * 2.2], position: [TEE[0], TEE[1] + .03, TEE[2]] });
      /* tee markers: two small balls either side of the teeing ground */
      var mk = Math.max(.12, kt * 1.9), m1 = wp(-2.5, -TW + 1.5), m2 = wp(-2.5, TW - 1.5);
      markers.remove(); markers = add(G.merge([{ geometry: G.sphere({ radius: 1, segments: 10, rings: 6 }), position: [m1[0], m1[1] + mk, m1[2]], scale: mk }, { geometry: G.sphere({ radius: 1, segments: 10, rings: 6 }), position: [m2[0], m2[1] + mk, m2[2]], scale: mk }]), { color: P.guide, spec: [.3, 30] });
      /* the rail and its ticks */
      var rv = rail ? rail.reveal : revealE;
      if (rail) rail.remove();
      rail = add(G.ribbon(railPts, { width: Math.max(.2, km * 1.1) }), { color: P.guide, unlit: true, opacity: .62, transparent: true, layer: 2, reveal: rv });
      if (tickMesh) tickMesh.remove();
      var tg = ticks.map(function (t) {
        var k = R.worldPerPixel(wp(t.s, railL)), tl = Math.max(4, k * 9);
        return { geometry: G.ribbon([wp(t.s, railL - railSide * tl * .2, .07), wp(t.s, railL + railSide * tl, .07)], { width: Math.max(.25, k * 1.2) }) };
      });
      tickMesh = tg.length ? add(G.merge(tg), { color: P.guide, unlit: true, opacity: .8, transparent: true, layer: 2 }) : null;
      setTickReveal();
      /* out of bounds: white stakes and a faint line on the ground */
      if (stakeMesh) stakeMesh.remove(); stakeMesh = null;
      obLines.forEach(function (m) { m.remove(); }); obLines = [];
      var st = [];
      obs.forEach(function (o) {
        var pts = [], spots = [];
        var hot = [];
        if (o.across) { for (var l = o.l0; l <= o.l1 + .1; l += 2) pts.push(wp(o.s, l, .06)); for (l = o.l0; l <= o.l1 + .1; l += 10) spots.push(wp(o.s, l)); }
        else { /* stakes where it matters: from about 30 m short of its distance onward; a faint line before that */
          for (s = o.s0; s <= o.s1 + .1; s += 3) { pts.push(wp(s, o.l, .06)); if (s >= o.em - .1) hot.push(pts[pts.length - 1]); }
          for (s = o.em; s <= o.s1 + .1; s += 14) spots.push(wp(s, o.l));
        }
        spots.forEach(function (p) {
          var k = R.worldPerPixel(p);
          st.push({ geometry: G.cylinder({ radius: 1, height: 1, segments: 6 }), position: [p[0], p[1] - .1, p[2]], scale: [Math.max(.08, k * .9), Math.max(1.2, k * 10), Math.max(.08, k * .9)] });
        });
        var lw = Math.max(.2, R.worldPerPixel(pts[pts.length >> 1]) * .9);
        obLines.push(add(G.ribbon(pts, { width: lw }), { color: P.stake, unlit: true, opacity: hot.length ? .22 : .45, transparent: true, layer: 2 }));
        if (hot.length > 1) obLines.push(add(G.ribbon(hot, { width: lw * 1.3 }), { color: P.stake, unlit: true, opacity: .7, transparent: true, layer: 2 }));
      });
      if (st.length) stakeMesh = add(G.merge(st), { color: P.stake, emissive: .25 });
      /* guides from a centre-line hazard out to its label */
      guides.forEach(function (m) { m.remove(); }); guides = [];
      labels.forEach(function (lb) {
        if (!lb.guide) return;
        var k = R.worldPerPixel(lb.world), a = wp(lb.guide[0], lb.guide[1], .07), b = wp(lb.guide[0], lb.guide[2], .07);
        guides.push(add(G.ribbon([a, b], { width: Math.max(.2, k * 1), dash: [k * 3, k * 3] }), { color: P.guide, unlit: true, opacity: .7, transparent: true, layer: 2 }));
      });
      /* downhill: chevrons pointing toward the green, over hairline contours across the drop (one per metre) */
      if (chevrons) chevrons.remove(); chevrons = null;
      if (contours) contours.remove(); contours = null;
      if (chevS.length) {
        chevrons = add(G.merge(chevS.map(function (cs) {
          var k = R.worldPerPixel(wp(cs, 0)), w = 6.5, d = 3.2;
          return { geometry: G.ribbon([wp(cs - d, -w, .08), wp(cs + d, 0, .08), wp(cs - d, w, .08)], { width: Math.max(.3, k * 1.6) }) };
        })), { color: P.guide, unlit: true, opacity: .85, transparent: true, layer: 2 });
        var cl2 = [];
        for (var dv = 1; dv < DROP; dv++) {
          var lo = DOWN[0], hi = DOWN[1];
          for (var it = 0; it < 30; it++) { var mid = (lo + hi) / 2; if (DROP * sstep(DOWN[0], DOWN[1], mid) < dv) lo = mid; else hi = mid; }
          var cs2 = (lo + hi) / 2, row = [], kk = R.worldPerPixel(wp(cs2, 0));
          for (var ll = -(W0 - 6); ll <= W0 - 6 + .1; ll += 3) row.push(wp(cs2, ll, .08));
          cl2.push(G.ribbon(row, { width: Math.max(.18, kk * .9) }));
        }
        if (cl2.length) contours = add(G.merge(cl2), { color: P.guide, unlit: true, opacity: .4, transparent: true, layer: 2 });
      }
      /* wind streaks */
      windMeshes.forEach(function (m) { m.remove(); }); windMeshes = [];
      windPts.forEach(function (ab, q) {
        var k = R.worldPerPixel(ab[1]), rr = Math.max(.12, k * 1);
        var pts = []; for (var j = 0; j <= 16; j++) { var u = j / 16; pts.push([ab[0][0] + (ab[1][0] - ab[0][0]) * u, ab[0][1], ab[0][2] + (ab[1][2] - ab[0][2]) * u]); }
        var tube = add(G.tube(pts, { radius: rr, segments: 6 }), { color: WINDC, emissive: .55, opacity: .9, transparent: true, reveal: windE });
        var dx = ab[1][0] - ab[0][0], dz = ab[1][2] - ab[0][2], yaw = Math.atan2(dx, dz) / D2R;
        var head = add(G.cone({ radius: Math.max(.5, k * 4), height: Math.max(1.2, k * 9), segments: 10 }), { color: WINDC, emissive: .55, position: ab[1].slice(), rotation: [90, yaw, 0], visible: windE >= 1 });
        windMeshes.push(tube, head);
      });
    }
    function setTickReveal() { if (tickMesh) tickMesh.visible = revealE >= 1; }

    /* ---------- label anchors ----------
       Labels take slots: one per side (and one "beyond", along the line of play) every TS metres, so they never
       stack on a phone. Side hazards keep their own side; centre-line hazards, the green and the slope take the
       freer side; distance ticks are quiet wherever a hazard already speaks */
    var wide = R.width && R.height ? R.width / R.height >= 1 : false;
    var anchors = [], TS = clamp(.085 * (L + 80), 18, 50), slots = { '-1': [], '0': [], '1': [] };
    function A(o) { anchors.push(o); return o; }
    function free(side, s, ts) { return !slots[side].some(function (q) { return Math.abs(q - s) < (ts || TS); }); }
    function take(side, s) { slots[side].push(s); }
    var pairs = {};
    labels.forEach(function (lb) { if (lb.side && !lb.long) { var key = lb.kind + '|' + lb.at; (pairs[key] = pairs[key] || []).push(lb); } });
    Object.keys(pairs).forEach(function (key) {
      var g = pairs[key], Lf = g.filter(function (q) { return q.side < 0; })[0], Rt = g.filter(function (q) { return q.side > 0; })[0];
      if (Lf && Rt) { Lf.skip = true; Rt.pair = true; }
    });
    /* each anchor's words come from words(): run again by relabel() when the language changes */
    function words(a, cap, val) { a.words = function () { a.cap = cap(); a.value = val ? val() : ''; a.label = a.value ? a.cap + ' ' + a.value : a.cap; }; a.words(); return a; }
    function hzAnchor(lb) {
      var h = lb.h;
      return words({ id: 'hz' + h.k, kind: 'hazard', hazard: lb.kind, side: h.side < 0 ? 'left' : h.side > 0 ? 'right' : 'centre', at: lb.at, reveal: clamp(lb.at / L, 0, 1), count: lb.pair ? 2 : 1 },
        function () { var c = tr('hz_' + lb.kind); return lb.pair ? tr('pair', c) : c; }, function () { return fmtD(lb.at); }); /* out of bounds too: its distance is the decision */
    }
    function sideAlign(a, sd, gap) { a.align = [sd > 0 ? 0 : 1, .5]; a.offset = [sd * (gap || 6), 0]; }
    function beyond(a, s) { a.world = wp(s, 0); a.align = [.5, 1]; a.offset = [0, -6]; take(0, s); }
    var sideFirst = railSide < 0 ? 1 : -1;
    /* 1. hazards on a side: their own side (a pair also blocks the left) */
    labels.forEach(function (lb) {
      if (lb.skip) { take(-1, lb.s); return; }
      if (!lb.side) return;
      var a = hzAnchor(lb);
      if (lb.long) { /* out of bounds down a side: the label goes wherever that side is quiet */
        var s0 = lb.s; for (var q = 0; q < 9; q++) { var ss = clamp(s0 + (q % 2 ? -1 : 1) * Math.ceil(q / 2) * .06 * L, .15 * L, .92 * L); if (free(lb.side, ss)) { lb.s = ss; break; } }
      }
      var lo = lb.outer + lb.side * 2;
      if (lb.side === railSide && lb.s < railEnd + 8) { var lr = railL + railSide * 3; if (Math.abs(lr) - Math.abs(lb.outer) > 4) lb.guide = [lb.s, lb.outer, lr]; lo = lr; }
      a.world = wp(lb.s, lo); lb.world = a.world; sideAlign(a, lb.side); take(lb.side, lb.s); A(a);
    });
    /* 2. hazards across or in the middle: the freer side, tied back by a short guide; else beyond them */
    labels.forEach(function (lb) {
      if (lb.skip || lb.side) return;
      var a = hzAnchor(lb), f = lb.f;
      if (lb.behind) return;
      var sd = free(sideFirst, lb.s) ? sideFirst : free(-sideFirst, lb.s) ? -sideFirst : 0;
      if (sd && lb.kind !== 'water') {
        var rim = f ? f.l + sd * f.rl : 0, out = sd * Math.max(edge(sd, lb.s) + 4, Math.abs(rim) + 9);
        a.world = wp(lb.s, out); sideAlign(a, sd, 4); take(sd, lb.s);
        lb.guide = [lb.s, rim + sd * .5, out]; lb.world = a.world;
      } else if (sd) { a.world = wp(lb.s, sd * (FW + 10)); sideAlign(a, sd, 4); take(sd, lb.s); }
      else beyond(a, lb.s + (f && f.rs ? f.rs : 8) + 3);
      A(a);
    });
    /* 3. the green: its distance, on whichever side is quiet; else just beyond it */
    var g = words({ id: 'green', kind: 'green', at: L, reveal: 1 }, function () { return tr('green'); }, function () { return fmtD(L); });
    var gExt = function (sd) {
      var e = grx + 4;
      bunkers.forEach(function (b) { if (Math.sign(b.l) === sd && Math.abs(b.s - L) < grz + 8) e = Math.max(e, Math.abs(b.l) + b.rl + 3); });
      waters.forEach(function (w) { if (!w.creek && Math.sign(w.lb) === sd && w.sb > L - grz - 8) e = Math.max(e, Math.abs(w.lb) + w.rl + 3); });
      return e;
    };
    var gs1 = gExt(sideFirst) <= gExt(-sideFirst) ? sideFirst : -sideFirst, gsd = free(gs1, L) ? gs1 : free(-gs1, L) ? -gs1 : 0;
    if (gsd) { g.world = wp(L, gsd * gExt(gsd)); sideAlign(g, gsd); take(gsd, L); }
    else { /* both sides speak already: the distance flies with the flag, just right of the cloth */
      var fk = R.width ? R.worldPerPixel(PIN) : L / 300, fh = Math.max(5, fk * 34);
      g.world = [PIN[0], PIN[1] + fh, PIN[2]]; g.align = [0, 0]; g.offset = [Math.max(1.8 / fk, 15) + 12, -2]; g.flag = true;
    }
    A(g);
    /* out of bounds behind the green: over the stakes, clear of the flag */
    labels.forEach(function (lb) {
      if (!lb.behind) return;
      var a = hzAnchor(lb), ob = obs.filter(function (o) { return o.across; })[0], es = free(sideFirst, lb.s) ? sideFirst : free(-sideFirst, lb.s) ? -sideFirst : 0;
      if (es) { a.world = wp(lb.s, es > 0 ? ob.l1 + 2 : ob.l0 - 2); sideAlign(a, es); take(es, lb.s); }
      else { a.world = wp(lb.s, (g.flag ? -1 : -(gsd || 1)) * 24); a.align = [.5, 1]; a.offset = [0, -16]; }
      a.reveal = 1; A(a);
    });
    A({ id: 'pin', kind: 'pin', at: pinS, world: PIN.slice(), cap: '', value: '', label: '', reveal: 1, align: [0, 1], offset: [8, -8], silent: true });
    A(words({ id: 'tee', kind: 'tee', at: 0, world: wp(0, railSide * -(TW + 3)), reveal: 0, align: [railSide < 0 ? 0 : 1, .5], offset: [railSide < 0 ? 6 : -6, 0], silent: true }, function () { return tr('tee'); }));
    /* 4. the slope */
    if (DOWN) {
      var dsd = free(sideFirst, chevS[1]) ? sideFirst : -sideFirst;
      var d = words({ id: 'downhill', kind: 'slope', at: (DOWN[0] + DOWN[1]) / 2, world: wp(chevS[1], dsd * (FW + 6)), reveal: chevS[1] / L }, function () { return tr('downhill'); });
      sideAlign(d, dsd, 4); take(dsd, chevS[1]); A(d);
    }
    /* 5. the distance rail's ticks, quiet where a label already sits */
    ticks.forEach(function (t) {
      var tk = { id: 'tick' + t.v, kind: 'tick', at: t.s, world: wp(t.s, railL + railSide * 9), cap: '', value: String(t.v), label: String(t.v), reveal: t.s / L,
        quiet: !free(railSide, t.s, TS * .8) };
      sideAlign(tk, railSide); A(tk);
    });
    A(words({ id: 'rail', kind: 'rail', at: 0, world: wide ? wp(-2, railL) : wp(-16, railL), reveal: 0, align: wide ? [.5, 1] : [.5, 0], offset: wide ? [0, -8] : [0, 6] }, function () { return tr('fromTee', imperial ? 'yd' : 'm'); }));
    if (wind) {
      take(-railSide, .3 * L);
      A(words({ id: 'wind', kind: 'wind', at: 0, world: windPts[1][1].slice(), reveal: 0, align: [.5, 1], offset: [0, -10] }, function () { return tr('wind_' + wind.dir); }, function () { return fmtW(wind.kmh); }));
    }

    /* ---------- camera: portrait looks straight down the hole; landscape turns it into a diagonal ---------- */
    var fpts = [wp(-14, -TW - 4), wp(-14, TW + 4), wp(L + grz + 8, -grx - 8), wp(L + grz + 8, grx + 8), wp(L - grz - 10, 0), [PIN[0], PIN[1] + Math.max(10, L * .05), PIN[2]]];
    bunkers.forEach(function (b) { fpts.push(wp(b.s, b.l - b.rl), wp(b.s, b.l + b.rl)); });
    waters.forEach(function (w) { if (!w.creek) fpts.push(wp(w.sa, w.la - w.rl), wp(w.sb, w.lb + w.rl), wp(w.sa, w.la + w.rl)); });
    treeSpots.forEach(function (t) { if (!t.back || wide || L <= 400) { var y = gy(t.x, t.z); fpts.push([t.x, y + 10.5 * t.k, t.z]); } }); /* the backdrop's tops stay in (a long hole in a tall box needs the room) */
    obs.forEach(function (o) { if (o.across) fpts.push(wp(o.s, o.l0), wp(o.s, o.l1)); else fpts.push(wp(o.s0, o.l), wp(o.s1, o.l)); });
    anchors.forEach(function (a) { if (!a.silent) fpts.push(a.world); });
    windPts.forEach(function (ab) { fpts.push(ab[0], ab[1]); });
    fpts.push(wp(0, railL), wp(railEnd, railL));
    var yawL = (dl === -1 ? -1 : 1) * 62, long = L > 400;
    R.frame(fpts, {
      /* a long hole is seen from lower down and nearer, so the green complex at its far end, where the decision is,
         is drawn larger than the fairway leading to it */
      yaw: function (a) { return a < 1 ? 0 : yawL; }, pitch: function (a) { return a < 1 ? (long ? 32 : 46) : long ? 32 : 40; }, fov: function () { return long ? 30 : 26; },
      padding: function (a) { return a < 1 ? { top: 44, right: 50, bottom: 24, left: 50 } : { top: 56, right: 64, bottom: 26, left: 64 }; }
    });
    sizeThings();
    var lastW = R.width, lastH = R.height;
    var unsub = R.onFrame(function (S) { if (S.width !== lastW || S.height !== lastH) { lastW = S.width; lastH = S.height; sizeThings(); } });
    R.orbit({ yaw: [-26, 26], pitch: [-12, 10], returnAfter: 2600 });

    /* ---------- motion ---------- */
    var running = [];
    function stopAll() { running.forEach(function (h) { h.finish(); }); running = []; }
    function setFinal() {
      revealE = 1; flagUp = 1; windE = 1;
      if (rail) rail.reveal = 1; setTickReveal(); sizeThings(); R.invalidate();
    }
    /* the entrance: the clock is already running, so the flag, the rail, the wind and every label are there from
       the first frame; the camera only settles in (600 ms) */
    function animateReveal(onProgress) {
      stopAll(); setFinal();
      if (typeof onProgress === 'function') onProgress(1);
      if (reduced || R.reduced || answered) return Promise.resolve();
      var fly = R.flyIn({ yaw: -7, pitch: 5, zoom: 1.06, duration: 600 });
      running.push(fly);
      return fly.done.then(function () { running = []; });
    }
    function update(o) {
      o = o || {};
      if (o.answered != null) answered = !!o.answered;
      if (o.reduced != null) reduced = !!o.reduced;
      if (answered || reduced) { stopAll(); setFinal(); }
    }
    function destroy() { stopAll(); unsub(); R.orbit(false); meshes.forEach(function (m) { m.remove(); }); }

    return {
      anchors: anchors, animateReveal: animateReveal, update: update, destroy: destroy,
      /* new words for the same scene (the app's language changed): {t, fmt} */
      relabel: function (o) { o = o || {}; if (o.t) T_ = o.t; if (o.fmt) F_ = o.fmt; anchors.forEach(function (a) { if (a.words) a.words(); }); },
      /* the flag, for the app's labels to keep clear of */
      avoid: function () {
        var top = stick.position[1] + stick.scale[1], cs = cloth.scale, a = 18 * D2R;
        return [[PIN.slice(), [PIN[0], top, PIN[2]], [PIN[0] + Math.cos(a) * cs[0], top - cs[1], PIN[2] - Math.sin(a) * cs[0]]]];
      },
      /* hole space → world, on the ground: for any extra label the app wants (s from the tee, l to the right) */
      at: function (s, l, lift) { return wp(s, l || 0, lift); },
      summary: { par: par, length: L, dogleg: sc.dogleg || null, green: shape, pin: pinS, wind: wind }
    };
  };
})(typeof window !== 'undefined' ? window : this);
