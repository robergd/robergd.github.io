/* G3D: Golfo's small, hand-written WebGL engine for its 3D diagrams.
   Plain script, no dependencies, no network. Defines window.G3D. See README.md for the contract.
   World: metres, Y up. Angles in the public API are degrees. Colours are CSS strings
   ('#rgb', '#rrggbb', '#rrggbbaa', 'rgb()/rgba()') or [r,g,b(,a)] in 0..1, all sRGB. */
(function (root) {
  'use strict';
  var G3D = root.G3D = { version: '1.0.0' };
  var PI = Math.PI, D2R = PI / 180;

  /* ---------- tiny vector / matrix maths (column-major, like GL) ---------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b, k) { k = k == null ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mmul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function perspective(fovy, asp, n, f) {
    var t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
    return m;
  }
  function lookAt(e, t) {
    var z = norm(sub(e, t)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  }
  /* rotation R = Ry·Rx·Rz from euler degrees, as three column vectors */
  function rot(r) {
    r = r || [0, 0, 0];
    var cx = Math.cos(r[0] * D2R), sx = Math.sin(r[0] * D2R), cy = Math.cos(r[1] * D2R), sy = Math.sin(r[1] * D2R), cz = Math.cos(r[2] * D2R), sz = Math.sin(r[2] * D2R);
    var A0 = [cy, 0, -sy], A1 = [sy * sx, cx, cy * sx], A2 = [sy * cx, -sx, cy * cx];
    return [add([0, 0, 0], A0, cz).map(function (v, i) { return v + A1[i] * sz; }), add([0, 0, 0], A1, cz).map(function (v, i) { return v - A0[i] * sz; }), A2];
  }
  function scl(s) { return s == null ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s; }
  /* model matrix and its normal matrix (R·S⁻¹, the inverse-transpose for rotation+scale) */
  function model(p, r, s) {
    var R = rot(r), S = scl(s), m = new Float32Array(16), n = new Float32Array(9);
    for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) { m[j * 4 + i] = R[j][i] * S[j]; n[j * 3 + i] = R[j][i] / S[j]; }
    p = p || [0, 0, 0]; m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
    return { m: m, n: n };
  }
  function xf(m, p) { /* mat4 × point → [x, y, z, w] */
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]];
  }

  /* ---------- colour: CSS string → linear [r, g, b, a] (cached). Gamma 2.2 both ways, so a fully
     fogged pixel lands exactly on the background colour ---------- */
  var cc = {};
  function lin(v) { return Math.pow(v, 2.2); }
  function col(c) {
    if (Array.isArray(c)) return [lin(c[0]), lin(c[1]), lin(c[2]), c[3] == null ? 1 : c[3]];
    var k = cc[c]; if (k) return k;
    var s = String(c || '#808080').trim(), r = .5, g = .5, b = .5, a = 1, m;
    if (s[0] === '#') {
      s = s.slice(1); if (s.length < 5) s = s.replace(/./g, '$&$&');
      var n = parseInt(s.slice(0, 6), 16); r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255;
      if (s.length === 8) a = parseInt(s.slice(6), 16) / 255;
    } else if ((m = s.match(/rgba?\(([^)]+)\)/))) {
      var p = m[1].split(/[\s,\/]+/).filter(Boolean);
      r = parseFloat(p[0]) / 255; g = parseFloat(p[1]) / 255; b = parseFloat(p[2]) / 255;
      if (p[3]) a = /%/.test(p[3]) ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    }
    return (cc[c] = [lin(r), lin(g), lin(b), a]);
  }
  G3D.color = col;
  /* read CSS custom properties (theme tokens) as strings: readTokens(el, ['fairway', 'bg']) → {fairway:'#24321f', …} */
  G3D.readTokens = function (el, names) {
    var cs = getComputedStyle(el || document.documentElement), o = {};
    names.forEach(function (n) { o[n] = cs.getPropertyValue('--' + n).trim(); });
    return o;
  };

  /* ---------- easing ---------- */
  var EASE = {
    linear: function (t) { return t; },
    in: function (t) { return t * t * t; },
    out: function (t) { return 1 - Math.pow(1 - t, 4); }, /* close to the site's cubic-bezier(.22,1,.36,1) */
    inOut: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  };
  G3D.ease = EASE;

  /* ---------- geometry. Every builder returns {positions, normals, colors|null, indices, bounds}.
     Winding is counter-clockwise seen from outside. Boxes, cylinders and cones stand on y = 0 ---------- */
  function geo(P, N, I, C) {
    var g = { positions: new Float32Array(P), normals: new Float32Array(N), colors: C ? new Float32Array(C) : null,
      indices: (P.length / 3 > 65535 ? Uint32Array : Uint16Array).from(I) };
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < P.length; i += 3) for (var k = 0; k < 3; k++) { if (P[i + k] < mn[k]) mn[k] = P[i + k]; if (P[i + k] > mx[k]) mx[k] = P[i + k]; }
    g.bounds = { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
    return g;
  }
  function push(A, v) { A.push(v[0], v[1], v[2]); }
  /* heightfield terrain: smooth normals from the height grid, per-vertex colour, baked horizon AO,
     soft contact shadows (occluders) and an optional edge fade to the background */
  G3D.terrain = function (o) {
    o = o || {};
    var sz = o.size || [100, 100], W = sz[0], D = sz[1], ce = o.center || [0, 0], seg = o.segments || 96;
    var nx = Array.isArray(seg) ? seg[0] : W >= D ? seg : Math.max(2, Math.round(seg * W / D));
    var nz = Array.isArray(seg) ? seg[1] : D >= W ? seg : Math.max(2, Math.round(seg * D / W));
    var hf = o.height || function () { return 0; }, cf = o.color || function () { return '#7f8f6c'; };
    var x0 = ce[0] - W / 2, z0 = ce[1] - D / 2, dx = W / nx, dz = D / nz, cols = nx + 1, H = new Float32Array(cols * (nz + 1));
    var i, j, k;
    for (j = 0; j <= nz; j++) for (i = 0; i <= nx; i++) H[j * cols + i] = hf(x0 + i * dx, z0 + j * dz);
    function h(a, b) { return H[clamp(b, 0, nz) * cols + clamp(a, 0, nx)]; }
    var aoK = o.ao || 0, aoR = o.aoRadius || Math.max(W, D) / 14, steps = Math.min(12, Math.max(2, Math.round(aoR / Math.min(dx, dz))));
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], occ = o.occluders || [], fade = o.edgeFade || 0;
    var P = [], N = [], C = [], I = [], SH = new Float32Array(cols * (nz + 1)), hole = o.hole;
    for (j = 0; j <= nz; j++) for (i = 0; i <= nx; i++) {
      var x = x0 + i * dx, z = z0 + j * dz, y = H[j * cols + i];
      var il = Math.max(i - 1, 0), ir = Math.min(i + 1, nx), jl = Math.max(j - 1, 0), jr = Math.min(j + 1, nz);
      var n = norm([-(h(ir, j) - h(il, j)) / ((ir - il) * dx), 1, -(h(i, jr) - h(i, jl)) / ((jr - jl) * dz)]);
      var shade = 1;
      if (aoK) { /* average sine of the horizon angle over 8 directions */
        var oc = 0;
        for (var d = 0; d < 8; d++) {
          var mxs = 0, sd = Math.hypot(DIRS[d][0] * dx, DIRS[d][1] * dz);
          for (k = 1; k <= steps; k++) {
            var ii = i + DIRS[d][0] * k, jj = j + DIRS[d][1] * k;
            if (ii < 0 || jj < 0 || ii > nx || jj > nz) break;
            var s = (H[jj * cols + ii] - y) / (k * sd); if (s > mxs) mxs = s;
          }
          oc += mxs / Math.sqrt(1 + mxs * mxs);
        }
        shade = 1 - aoK * oc / 8;
      }
      for (k = 0; k < occ.length; k++) { /* soft round contact shadows: {x, z, r, k} */
        var q = occ[k], t = 1 - Math.hypot(x - q.x, z - q.z) / q.r;
        if (t > 0) shade *= 1 - (q.k == null ? .35 : q.k) * t * t * (3 - 2 * t);
      }
      var c = col(cf(x, z, y, n)), a = c[3];
      if (fade) { var e = clamp(Math.min(x - x0, x0 + W - x, z - z0, z0 + D - z) / fade, 0, 1); a *= e * e * (3 - 2 * e); }
      P.push(x, y, z); push(N, n); C.push(c[0] * shade, c[1] * shade, c[2] * shade, a); SH[j * cols + i] = shade;
    }
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
      /* hole: [x0, z0, x1, z1] leaves out the cells wholly inside it (an apron around a finer terrain) */
      if (hole && x0 + i * dx > hole[0] && x0 + (i + 1) * dx < hole[2] && z0 + j * dz > hole[1] && z0 + (j + 1) * dz < hole[3]) continue;
      var v = j * cols + i; I.push(v, v + cols, v + 1, v + 1, v + cols, v + cols + 1);
    }
    var g = geo(P, N, I, C);
    /* exact queries on the drawn surface (the same two triangles per cell the mesh uses), so labels, balls and
       overlays sit exactly on it. Outside the grid the border values carry on (clamped) */
    function bary(arr, x, z, stride, k) {
      var fx = clamp((x - x0) / dx, 0, nx), fz = clamp((z - z0) / dz, 0, nz), a = Math.min(Math.floor(fx), nx - 1), b = Math.min(Math.floor(fz), nz - 1), u = fx - a, w = fz - b;
      function q(ii, jj) { return arr[((jj) * cols + ii) * stride + k]; }
      if (u + w <= 1) { var p0 = q(a, b); return p0 + u * (q(a + 1, b) - p0) + w * (q(a, b + 1) - p0); }
      var p1 = q(a + 1, b + 1); return p1 + (1 - u) * (q(a, b + 1) - p1) + (1 - w) * (q(a + 1, b) - p1);
    }
    g.heightAt = function (x, z) { return bary(H, x, z, 1, 0); };
    g.shadeAt = function (x, z) { return bary(SH, x, z, 1, 0); };
    g.normalAt = function (x, z) { return norm([bary(g.normals, x, z, 3, 0), bary(g.normals, x, z, 3, 1), bary(g.normals, x, z, 3, 2)]); };
    g.grid = { x0: x0, z0: z0, dx: dx, dz: dz, nx: nx, nz: nz, fade: fade };
    return g;
  };

  /* a crisp region lying on a terrain (a fairway, a green, a bunker, a pond): a mesh cut along the zero contour
     of a signed distance sd(x, z) (metres, negative inside), on the terrain's own grid (or a finer one aligned to
     it), with a thin rim that fades to transparent over `rim` metres. Unlike per-vertex colour, its edge is a
     true curve, so it stays sharp at any grid size. Draw it with {transparent: true, layer: 1, order: < 0}.
     o: {bounds: [x0, z0, x1, z1], sd, color(x, z) → colour, sub (grid subdivisions, default 1), rim (.6),
         lift (.03), height(x, z) (overrides the terrain, e.g. a flat water level), ao (true: the terrain's baked shade)} */
  G3D.region = function (T, o) {
    var gr = T.grid, k = Math.max(1, Math.round(o.sub || 1)), cx = gr.dx / k, cz = gr.dz / k, rim = o.rim == null ? .6 : o.rim, lift = o.lift == null ? .03 : o.lift;
    var b = o.bounds, pad = rim + Math.max(cx, cz);
    var i0 = Math.max(0, Math.floor((b[0] - pad - gr.x0) / cx)), i1 = Math.min(gr.nx * k, Math.ceil((b[2] + pad - gr.x0) / cx));
    var j0 = Math.max(0, Math.floor((b[1] - pad - gr.z0) / cz)), j1 = Math.min(gr.nz * k, Math.ceil((b[3] + pad - gr.z0) / cz));
    var sd = o.sd, cf = o.color || function () { return '#ffffff'; }, hf = o.height, ao = o.ao !== false && !hf, W = i1 - i0 + 1;
    if (i1 <= i0 || j1 <= j0) return geo([], [], [], []);
    var S = new Float32Array(W * (j1 - j0 + 1)), idx = new Int32Array(S.length).fill(-1), P = [], N = [], C = [], I = [], i, j;
    for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) S[(j - j0) * W + i - i0] = sd(gr.x0 + i * cx, gr.z0 + j * cz);
    function vert(x, z, a) {
      var y = hf ? hf(x, z) : T.heightAt(x, z), n = hf ? [0, 1, 0] : T.normalAt(x, z), c = col(cf(x, z)), sh = ao ? T.shadeAt(x, z) : 1;
      P.push(x, y + lift, z); push(N, n); C.push(c[0] * sh, c[1] * sh, c[2] * sh, c[3] * a);
      return P.length / 3 - 1;
    }
    function node(ii, jj) { var q = (jj - j0) * W + ii - i0; if (idx[q] < 0) idx[q] = vert(gr.x0 + ii * cx, gr.z0 + jj * cz, 1); return idx[q]; }
    function grad(x, z) { var e = Math.min(cx, cz) * .25, gx = sd(x + e, z) - sd(x - e, z), gz = sd(x, z + e) - sd(x, z - e), l = Math.hypot(gx, gz) || 1; return [gx / l, gz / l]; }
    var cross = {};
    function crossing(ia, ja, ib, jb, sa, sb) { /* one vertex per grid edge, shared by both cells */
      var key = ia < ib || (ia === ib && ja < jb) ? ia + ',' + ja + ',' + ib + ',' + jb : ib + ',' + jb + ',' + ia + ',' + ja;
      var c = cross[key]; if (c) return c;
      var t = sa / (sa - sb), x = gr.x0 + (ia + (ib - ia) * t) * cx, z = gr.z0 + (ja + (jb - ja) * t) * cz, g = grad(x, z);
      c = cross[key] = { v: vert(x, z, 1), o: rim > 0 ? vert(x + g[0] * rim, z + g[1] * rim, 0) : -1 };
      return c;
    }
    for (j = j0; j < j1; j++) for (i = i0; i < i1; i++) {
      /* the cell's corners counter-clockwise seen from above: (i,j) → (i,j+1) → (i+1,j+1) → (i+1,j) */
      var Q = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]], s = Q.map(function (q) { return S[(q[1] - j0) * W + q[0] - i0]; });
      if (s[0] > 0 && s[1] > 0 && s[2] > 0 && s[3] > 0) continue;
      if (s[0] <= 0 && s[1] <= 0 && s[2] <= 0 && s[3] <= 0) { /* inside: the same split as the terrain's cells */
        var a0 = node(i, j), a1 = node(i, j + 1), a2 = node(i + 1, j + 1), a3 = node(i + 1, j);
        I.push(a0, a1, a3, a3, a1, a2); continue;
      }
      var poly = [], exits = [];
      for (var e = 0; e < 4; e++) {
        var p = Q[e], q = Q[(e + 1) % 4], sp = s[e], sq = s[(e + 1) % 4];
        if (sp <= 0) poly.push({ v: node(p[0], p[1]) });
        if ((sp <= 0) !== (sq <= 0)) { var c = crossing(p[0], p[1], q[0], q[1], sp, sq); poly.push({ v: c.v, c: c, out: sp <= 0 }); }
      }
      for (e = 1; e + 1 < poly.length; e++) I.push(poly[0].v, poly[e].v, poly[e + 1].v);
      /* the rim: outward from each stretch of contour (an exit, then the next entry, in winding order) */
      if (rim > 0) for (e = 0; e < poly.length; e++) {
        var A = poly[e]; if (!A.c || !A.out) continue;
        var Bn = poly[(e + 1) % poly.length]; if (!Bn.c) continue;
        I.push(Bn.c.v, A.c.v, A.c.o, Bn.c.v, A.c.o, Bn.c.o);
      }
    }
    return geo(P, N, I, C);
  };

  /* a coarse ground that carries a terrain's border heights out to the horizon (its own cells are left out where
     the terrain is), so no slab edge ever shows; it fades into the background far away.
     o: {scale (×the terrain's size, default 6), segments (40), color, fade (fraction of its size, .32), lower (.04)} */
  G3D.apron = function (T, o) {
    o = o || {}; var gr = T.grid, W = gr.nx * gr.dx, D = gr.nz * gr.dz, sc = o.scale || 6, cx = gr.x0 + W / 2, cz = gr.z0 + D / 2, size = Math.max(W, D) * sc;
    var inset = (gr.fade || 0) + Math.max(gr.dx, gr.dz) * 1.5, lower = o.lower == null ? .04 : o.lower, cc = o.color || '#7f8f6c';
    /* color: one colour, or f(x, z) of the terrain's nearest border point */
    var cf = typeof cc === 'function' ? cc : function () { return cc; };
    var g = G3D.terrain({ size: [size, size], center: [cx, cz], segments: o.segments || 40, edgeFade: size * (o.fade == null ? .32 : o.fade),
      height: function (x, z) { return T.heightAt(x, z) - lower; },
      color: function (x, z) { /* with the terrain's own baked shade at that border point, so the seam never shows */
        var bx = clamp(x, gr.x0, gr.x0 + W), bz = clamp(z, gr.z0, gr.z0 + D), c = col(cf(bx, bz)), sh = T.shadeAt(bx, bz);
        return [Math.pow(c[0] * sh, 1 / 2.2), Math.pow(c[1] * sh, 1 / 2.2), Math.pow(c[2] * sh, 1 / 2.2)];
      },
      hole: [gr.x0 + inset, gr.z0 + inset, gr.x0 + W - inset, gr.z0 + D - inset] });
    /* its normals start as the terrain's own at the border and level out with distance, so the light matches there */
    var P = g.positions, N = g.normals, reach = Math.max(W, D) * .35;
    for (var v = 0; v < P.length; v += 3) {
      var x = P[v], z = P[v + 2], bx = clamp(x, gr.x0, gr.x0 + W), bz = clamp(z, gr.z0, gr.z0 + D), t = clamp(Math.hypot(x - bx, z - bz) / reach, 0, 1);
      var n = T.normalAt(bx, bz), m = norm([n[0] * (1 - t), n[1] * (1 - t) + t, n[2] * (1 - t)]);
      N[v] = m[0]; N[v + 1] = m[1]; N[v + 2] = m[2];
    }
    return g;
  };

  G3D.box = function (o) {
    o = o || {}; var w = (o.w || 1) / 2, hh = (o.h || 1) / 2, d = (o.d || 1) / 2, P = [], N = [], I = [];
    [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]].forEach(function (f) {
      var b = P.length / 3, S = [w, hh, d];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        for (var k = 0; k < 3; k++) P.push((f[0][k] + f[1][k] * q[0] + f[2][k] * q[1]) * S[k] + (k === 1 ? hh : 0));
        push(N, f[0]);
      });
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return geo(P, N, I);
  };

  G3D.cylinder = function (o) {
    o = o || {};
    var rt = o.radiusTop != null ? o.radiusTop : o.radius != null ? o.radius : .5, rb = o.radiusBottom != null ? o.radiusBottom : o.radius != null ? o.radius : .5;
    var h = o.height || 1, S = o.segments || 12, P = [], N = [], I = [], s, a;
    for (s = 0; s <= S; s++) {
      a = s / S * 2 * PI; var dx = Math.sin(a), dz = Math.cos(a), n = norm([dx * h, rb - rt, dz * h]);
      P.push(dx * rb, 0, dz * rb, dx * rt, h, dz * rt); push(N, n); push(N, n);
    }
    for (s = 0; s < S; s++) { var b0 = s * 2; I.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
    if (o.caps !== false) [[h, rt, 1], [0, rb, -1]].forEach(function (cp) {
      if (!cp[1]) return;
      var c = P.length / 3; P.push(0, cp[0], 0); N.push(0, cp[2], 0);
      for (s = 0; s <= S; s++) { a = s / S * 2 * PI; P.push(Math.sin(a) * cp[1], cp[0], Math.cos(a) * cp[1]); N.push(0, cp[2], 0); }
      for (s = 0; s < S; s++) if (cp[2] > 0) I.push(c, c + 1 + s, c + 2 + s); else I.push(c, c + 2 + s, c + 1 + s);
    });
    return geo(P, N, I);
  };
  G3D.cone = function (o) { o = o || {}; return G3D.cylinder({ radiusTop: 0, radiusBottom: o.radius != null ? o.radius : .5, height: o.height, segments: o.segments, caps: o.caps }); };

  G3D.sphere = function (o) {
    o = o || {}; var r = o.radius || .5, S = o.segments || 16, R = o.rings || 10, P = [], N = [], I = [];
    for (var y = 0; y <= R; y++) for (var x = 0; x <= S; x++) {
      var ph = y / R * PI, th = x / S * 2 * PI, d = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
      P.push(d[0] * r, d[1] * r, d[2] * r); push(N, d);
    }
    for (y = 0; y < R; y++) for (x = 0; x < S; x++) { var a = y * (S + 1) + x, c = a + S + 1; I.push(a, c, a + 1, a + 1, c, c + 1); }
    return geo(P, N, I);
  };

  G3D.icosphere = function (o) {
    o = o || {}; var r = o.radius || .5, t = (1 + Math.sqrt(5)) / 2;
    var V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    var F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (var l = 0; l < (o.detail == null ? 1 : o.detail); l++) {
      var mid = {}, F2 = [];
      var m = function (a, b) { var k = a < b ? a + '_' + b : b + '_' + a; if (mid[k] == null) { mid[k] = V.length; V.push(norm(add(V[a], V[b]))); } return mid[k]; };
      F.forEach(function (f) { var a = m(f[0], f[1]), b = m(f[1], f[2]), c = m(f[2], f[0]); F2.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]); });
      F = F2;
    }
    var P = [], N = [], I = [];
    V.forEach(function (v) { P.push(v[0] * r, v[1] * r, v[2] * r); push(N, v); });
    F.forEach(function (f) { I.push(f[0], f[1], f[2]); });
    var g = geo(P, N, I);
    return o.flat ? G3D.flat(g) : g;
  };

  /* a flat rectangle: plane 'xy' (faces +Z, e.g. the flag) or 'xz' (faces +Y, e.g. water); origin is a 0..1 fraction of its size */
  G3D.quad = function (o) {
    o = o || {}; var w = o.w || 1, h = o.h || 1, sx = o.segX || 1, sy = o.segY || 1, org = o.origin || [.5, .5], xz = o.plane === 'xz', P = [], N = [], I = [];
    for (var j = 0; j <= sy; j++) for (var i = 0; i <= sx; i++) {
      var u = (i / sx - org[0]) * w, v = (j / sy - org[1]) * h;
      if (xz) { P.push(u, 0, -v); N.push(0, 1, 0); } else { P.push(u, v, 0); N.push(0, 0, 1); }
    }
    for (j = 0; j < sy; j++) for (i = 0; i < sx; i++) { var a = j * (sx + 1) + i, c = a + sx + 1; I.push(a, a + 1, c, a + 1, c + 1, c); }
    return geo(P, N, I);
  };

  /* a flat disc in XZ facing up; fade (0..1) makes it a soft blob: solid to (1 - fade)·radius, transparent at the rim */
  G3D.disc = function (o) {
    o = o || {}; var r = o.radius || .5, S = o.segments || 32, f = o.fade || 0, P = [0, 0, 0], N = [0, 1, 0], C = f ? [1, 1, 1, 1] : null, I = [], s;
    var rings = f ? [[r * (1 - f), 1], [r, 0]] : [[r, 1]];
    rings.forEach(function (rg) { for (s = 0; s < S; s++) { var a = s / S * 2 * PI; P.push(Math.sin(a) * rg[0], 0, Math.cos(a) * rg[0]); N.push(0, 1, 0); if (C) C.push(1, 1, 1, rg[1]); } });
    for (s = 0; s < S; s++) {
      var n = (s + 1) % S; I.push(0, 1 + s, 1 + n);
      if (f) I.push(1 + s, 1 + S + s, 1 + n, 1 + n, 1 + S + s, 1 + S + n);
    }
    return geo(P, N, I, C);
  };
  G3D.blob = function (o) { o = o || {}; return G3D.disc({ radius: o.radius || 1, segments: o.segments || 24, fade: o.fade || .7 }); };

  /* ---------- paths: arcs, curves, resampling, dashes ---------- */
  function cumul(pts) { var c = [0]; for (var i = 1; i < pts.length; i++) c.push(c[i - 1] + len(sub(pts[i], pts[i - 1]))); return c; }
  function at(pts, cum, s) { /* point at arc length s */
    if (s <= 0) return pts[0].slice(); var i = 1;
    while (i < pts.length - 1 && cum[i] < s) i++;
    var t = clamp((s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
    return add(pts[i - 1], sub(pts[i], pts[i - 1]), t);
  }
  /* ball flight from a to b: apex `height` above the straight line, peaking at fraction `peak` (descent steeper) */
  G3D.arc = function (a, b, o) {
    o = o || {}; var n = o.samples || 48, H = o.height == null ? len(sub(b, a)) * .18 : o.height, pk = o.peak || .55, out = [];
    for (var i = 0; i <= n; i++) {
      var u = i / n, w = u < pk ? .5 * u / pk : .5 + .5 * (u - pk) / (1 - pk), p = add(a, sub(b, a), u);
      p[1] += H * Math.sin(PI * w); out.push(p);
    }
    return out;
  };
  /* quadratic (3 points) or cubic (4 points) Bézier, sampled */
  G3D.bezier = function (c, n) {
    n = n || 32; var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t, w = c.length === 3 ? [u * u, 2 * u * t, t * t] : [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t], p = [0, 0, 0];
      w.forEach(function (k, j) { p = add(p, c[j], k); }); out.push(p);
    }
    return out;
  };
  function dashes(pts, on, off) {
    var cum = cumul(pts), L = cum[cum.length - 1], out = [], s = 0;
    while (s < L) {
      var e = Math.min(s + on, L), piece = [at(pts, cum, s)];
      for (var i = 0; i < pts.length; i++) if (cum[i] > s && cum[i] < e) piece.push(pts[i]);
      piece.push(at(pts, cum, e)); out.push({ pts: piece, s0: s }); s = e + off;
    }
    return out;
  }
  /* shared by tube and ribbon: build pieces, then a reveal table [arcLength, indexCount, …] and pointAt(t) */
  function pathGeo(pts, o, build) {
    var cum = cumul(pts), P = [], N = [], I = [], R = [];
    (o.dash ? dashes(pts, o.dash[0], o.dash[1]) : [{ pts: pts, s0: 0 }]).forEach(function (pc) {
      var pc_cum = cumul(pc.pts);
      build(pc.pts, P, N, I, function (i) { R.push(pc.s0 + pc_cum[i], I.length); });
    });
    var g = geo(P, N, I), total = cum[cum.length - 1];
    g.reveal = R; g.path = { points: pts, length: total };
    g.pointAt = function (t) { return at(pts, cum, clamp(t, 0, 1) * total); };
    return g;
  }
  /* a round tube along a polyline (ball flights). Parallel-transport frames, so it never twists */
  G3D.tube = function (pts, o) {
    o = o || {}; var r = o.radius || .3, S = o.segments || 8;
    return pathGeo(pts, o, function (p, P, N, I, mark) {
      var b = P.length / 3, n = null;
      for (var i = 0; i < p.length; i++) {
        var T = norm(sub(p[Math.min(i + 1, p.length - 1)], p[Math.max(i - 1, 0)]));
        if (!n) { n = norm(cross(T, Math.abs(T[1]) < .9 ? [0, 1, 0] : [1, 0, 0])); }
        else n = norm(add(n, T, -dot(n, T)));
        var B = cross(T, n);
        for (var s = 0; s < S; s++) {
          var a = s / S * 2 * PI, d = add([n[0] * Math.cos(a), n[1] * Math.cos(a), n[2] * Math.cos(a)], B, Math.sin(a));
          push(P, add(p[i], d, r)); push(N, d);
        }
        if (i) for (s = 0; s < S; s++) {
          var a0 = b + (i - 1) * S + s, b0 = b + (i - 1) * S + (s + 1) % S; I.push(a0, b0, a0 + S, b0, b0 + S, a0 + S);
        }
        mark(i);
      }
    });
  };
  /* a flat strip along a polyline, lying in the plane perpendicular to `up` (putt lines, OB lines, guides on the ground) */
  G3D.ribbon = function (pts, o) {
    o = o || {}; var hw = (o.width || .5) / 2, up = norm(o.up || [0, 1, 0]);
    return pathGeo(pts, o, function (p, P, N, I, mark) {
      var b = P.length / 3;
      for (var i = 0; i < p.length; i++) {
        var T = norm(sub(p[Math.min(i + 1, p.length - 1)], p[Math.max(i - 1, 0)])), sd = norm(cross(T, up));
        push(P, add(p[i], sd, -hw)); push(P, add(p[i], sd, hw)); push(N, up); push(N, up);
        if (i) { var a = b + (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        mark(i);
      }
    });
  };

  /* bake several geometries (with optional colour and transform) into one, for one draw call:
     merge([{geometry, color, position, rotation, scale}, geometry, …]) */
  G3D.merge = function (items) {
    var P = [], N = [], C = [], I = [];
    items.forEach(function (it) {
      var g = it.positions ? it : it.geometry, M = model(it.position, it.rotation, it.scale), c = it.color ? col(it.color) : [1, 1, 1, 1], b = P.length / 3;
      for (var v = 0; v < g.positions.length / 3; v++) {
        var p = xf(M.m, g.positions.subarray(v * 3, v * 3 + 3)), n = g.normals.subarray(v * 3, v * 3 + 3), q = M.n;
        P.push(p[0], p[1], p[2]); push(N, norm([q[0] * n[0] + q[3] * n[1] + q[6] * n[2], q[1] * n[0] + q[4] * n[1] + q[7] * n[2], q[2] * n[0] + q[5] * n[1] + q[8] * n[2]]));
        for (var k = 0; k < 4; k++) C.push((g.colors ? g.colors[v * 4 + k] : 1) * c[k]);
      }
      for (var i = 0; i < g.indices.length; i++) I.push(g.indices[i] + b);
    });
    return geo(P, N, I, C);
  };
  /* faceted (low-poly) version of any geometry: one normal per triangle */
  G3D.flat = function (g) {
    var P = [], N = [], C = g.colors ? [] : null, I = [], X = g.indices;
    for (var t = 0; t < X.length; t += 3) {
      var v = [X[t], X[t + 1], X[t + 2]], p = v.map(function (i) { return Array.prototype.slice.call(g.positions, i * 3, i * 3 + 3); });
      var n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
      for (var k = 0; k < 3; k++) { push(P, p[k]); push(N, n); I.push(t + k); if (C) for (var q = 0; q < 4; q++) C.push(g.colors[v[k] * 4 + q]); }
    }
    return geo(P, N, I, C);
  };

  /* ---------- support detection ---------- */
  var sup = {};
  function context(canvas, slow, aa) {
    var a = { antialias: aa !== false, alpha: true, premultipliedAlpha: true, depth: true, failIfMajorPerformanceCaveat: !slow, powerPreference: 'low-power' }, gl = null, v2 = false;
    try { gl = canvas.getContext('webgl2', a); v2 = !!gl; if (!gl) gl = canvas.getContext('webgl', a) || canvas.getContext('experimental-webgl', a); } catch (e) { gl = null; }
    return gl && !gl.isContextLost() ? { gl: gl, v2: v2 } : null;
  }
  G3D.supported = function (o) {
    var slow = !!(o && o.allowSlow);
    if (sup[slow] != null) return sup[slow];
    var ok = false;
    try { var c = context(document.createElement('canvas'), slow, false); ok = !!c; if (c) { var x = c.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } } catch (e) {}
    return (sup[slow] = ok);
  };

  /* ---------- shaders: one program; hemisphere + wrapped directional light, optional Blinn sheen,
     fog toward the background, linear lighting with 2.2 gamma out, premultiplied alpha ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec4 aC;uniform mat4 uVP,uM;uniform mat3 uNM;uniform vec4 uWave;' +
    'varying vec3 vN,vW;varying vec4 vC;void main(){vec3 p=aP,n=aN;' +
    'if(uWave.x>0.){float ph=p.x*uWave.y-uWave.w*uWave.z;p.z+=uWave.x*p.x*sin(ph);n=normalize(vec3(-uWave.x*(sin(ph)+p.x*uWave.y*cos(ph)),0.,1.));}' +
    'vec4 w=uM*vec4(p,1.);vW=w.xyz;vN=uNM*n;vC=aC;gl_Position=uVP*w;}';
  var FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'uniform vec4 uCol,uFog;uniform vec3 uSun,uSunC,uSky,uGnd,uFogC,uEye,uMat;uniform float uFlip,uWrap;varying vec3 vN,vW;varying vec4 vC;' +
    'void main(){vec4 b=vC*uCol;vec3 n=normalize(vN);if(uFlip>.5&&!gl_FrontFacing)n=-n;vec3 V=normalize(uEye-vW);' +
    'float d=clamp((dot(n,uSun)+uWrap)/(1.+uWrap),0.,1.);vec3 c=b.rgb*(mix(uGnd,uSky,n.y*.5+.5)+uSunC*d);' +
    'if(uMat.y>0.)c+=uSunC*uMat.y*pow(max(dot(n,normalize(uSun+V)),0.),uMat.z);c=mix(c,b.rgb,uMat.x);' +
    'c=mix(c,uFogC,uFog.z*smoothstep(uFog.x,uFog.y,length(uEye-vW)));' +
    'gl_FragColor=vec4(pow(max(c,0.),vec3(1./2.2))*b.a,b.a);}';
  var UNI = ['uVP', 'uM', 'uNM', 'uWave', 'uCol', 'uFog', 'uSun', 'uSunC', 'uSky', 'uGnd', 'uFogC', 'uEye', 'uMat', 'uFlip', 'uWrap'];

  /* ---------- a mesh: geometry + material + transform. Change fields directly, then scene.invalidate(), or use set() ---------- */
  function Mesh(sc, g, o) {
    this.scene = sc; this.geometry = g;
    this.color = '#ffffff'; this.opacity = 1; this.position = [0, 0, 0]; this.rotation = [0, 0, 0]; this.scale = 1;
    this.unlit = false; this.emissive = 0; this.spec = null; this.layer = 0; this.doubleSided = false; this.order = 0;
    this.transparent = false; this.wave = null; this.visible = true; this.reveal = 1;
    this.set(o || {}, true);
  }
  Mesh.prototype.set = function (o, quiet) { for (var k in o) if (o.hasOwnProperty(k)) this[k] = o[k]; if (!quiet) this.scene.invalidate(); return this; };
  Mesh.prototype.remove = function () { this.scene.remove(this); };

  /* ---------- the scene ---------- */
  G3D.create = function (canvas, o) {
    o = o || {};
    var ctx = context(canvas, o.allowSlow, o.antialias);
    if (!ctx) return null;
    var gl = ctx.gl, prog = null, U = {}, bufs = new Map(), u32 = ctx.v2 || !!gl.getExtension('OES_element_index_uint');
    var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var S = {
      gl: gl, canvas: canvas, webgl2: ctx.v2, meshes: [], reduced: o.reducedMotion != null ? !!o.reducedMotion : !!(mq && mq.matches),
      width: 0, height: 0, dpr: 1, stats: { frames: 0, cpuMs: 0, cpuAvg: 0 }, lost: false, disposed: false
    };
    var home = { target: [0, 0, 0], distance: 50, yaw: 0, pitch: 25, fov: 40, near: 0, far: 0 }, off = { yaw: 0, pitch: 0, zoom: 1 };
    var env = {}, raf = 0, last = 0, tweens = [], loops = [], frameFns = [], anchors = [], fitState = null, visible = !root.IntersectionObserver;
    var waveT = 1.3, ambientLeft = 0, AMB = o.ambient == null ? 10 : o.ambient;
    S.invalidate = function () { if (!raf && !S.lost && !S.disposed) raf = root.requestAnimationFrame(frame); };

    /* lights, background and fog. Light: a flat surface facing up renders at about its own colour */
    S.setEnvironment = function (e) {
      for (var k in e) env[k] = e[k];
      var bg = col(env.background || '#0b0b0c');
      env._bg = bg; env._fogC = env.fog === false ? bg : col((env.fog && env.fog.color) || env.background || '#0b0b0c');
      var hi = env.hemi == null ? .5 : env.hemi, sun = env.sun || {}, si = sun.intensity == null ? .62 : sun.intensity, sc = col(sun.color || '#ffffff');
      env._sky = col(env.sky || '#ffffff').slice(0, 3).map(function (v) { return v * hi; });
      env._gnd = col(env.ground || '#8a8a80').slice(0, 3).map(function (v) { return v * hi; });
      env._sunC = sc.slice(0, 3).map(function (v) { return v * si; });
      env._sun = norm(sun.dir || [-.45, .8, .35]);
      S.invalidate();
    };
    S.setEnvironment({ background: o.background, transparent: o.transparent, sky: o.sky, ground: o.ground, hemi: o.hemi, sun: o.sun, fog: o.fog, wrap: o.wrap });

    function init() {
      function sh(t, s) { var x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('G3D shader: ' + gl.getShaderInfoLog(x)); return x; }
      prog = gl.createProgram();
      var v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
      gl.attachShader(prog, v); gl.attachShader(prog, f);
      gl.bindAttribLocation(prog, 0, 'aP'); gl.bindAttribLocation(prog, 1, 'aN'); gl.bindAttribLocation(prog, 2, 'aC');
      gl.linkProgram(prog); gl.deleteShader(v); gl.deleteShader(f);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('G3D link: ' + gl.getProgramInfoLog(prog));
      UNI.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
    }
    init();

    /* GPU buffers per geometry, uploaded lazily (and again after a context restore) */
    function buffers(g) {
      var b = bufs.get(g); if (b) return b;
      if (g.indices instanceof Uint32Array && !u32) return null;
      function mk(t, d) { var x = gl.createBuffer(); gl.bindBuffer(t, x); gl.bufferData(t, d, gl.STATIC_DRAW); return x; }
      b = { p: mk(gl.ARRAY_BUFFER, g.positions), n: mk(gl.ARRAY_BUFFER, g.normals), c: g.colors ? mk(gl.ARRAY_BUFFER, g.colors) : null,
        i: mk(gl.ELEMENT_ARRAY_BUFFER, g.indices), type: g.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, count: g.indices.length };
      bufs.set(g, b); return b;
    }
    function freeBuffers() { if (!gl.isContextLost()) bufs.forEach(function (b) { [b.p, b.n, b.c, b.i].forEach(function (x) { if (x) gl.deleteBuffer(x); }); }); bufs.clear(); }

    S.add = function (g, mo) { var m = new Mesh(S, g, mo); S.meshes.push(m); S.invalidate(); return m; };
    S.remove = function (m) { var i = S.meshes.indexOf(m); if (i >= 0) S.meshes.splice(i, 1); S.invalidate(); };
    S.clear = function () { S.meshes = []; freeBuffers(); S.invalidate(); };

    /* ---------- camera: a home view (set by setCamera / frame) plus offsets (orbit, fly-in) ---------- */
    function cam(h, of, aspect) {
      h = h || home; of = of || off;
      var yaw = (h.yaw + of.yaw) * D2R, pitch = clamp(h.pitch + of.pitch, -89, 89) * D2R, d = h.distance * of.zoom;
      var eye = add(h.target, [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], d);
      var near = h.near || Math.max(.05, d * .02), far = h.far || d * 12;
      var V = lookAt(eye, h.target), VP = mmul(perspective(h.fov * D2R, aspect || (S.width / S.height) || 1.5, near, far), V);
      return { eye: eye, VP: VP, d: d, right: [V[0], V[4], V[8]], up: [V[1], V[5], V[9]], target: h.target, yaw: h.yaw + of.yaw, pitch: h.pitch + of.pitch, fov: h.fov };
    }
    S.setCamera = function (c) { for (var k in c) home[k] = Array.isArray(c[k]) ? c[k].slice() : c[k]; fitState = null; S.invalidate(); };
    S.getCamera = function () { var c = cam(); return { target: c.target.slice(), distance: c.d, yaw: c.yaw, pitch: c.pitch, fov: c.fov, eye: c.eye }; };
    S.getHome = function () { return JSON.parse(JSON.stringify(home)); };
    /* frame points (or a {min, max} box) for this canvas's aspect, with CSS-pixel padding for HTML labels.
       Sticky by default: it re-fits whenever the canvas resizes */
    S.frame = function (pts, fo) {
      fo = fo || {};
      if (pts && pts.min) { var a = pts.min, b = pts.max; pts = []; for (var q = 0; q < 8; q++) pts.push([q & 1 ? b[0] : a[0], q & 2 ? b[1] : a[1], q & 4 ? b[2] : a[2]]); }
      fitState = fo.sticky === false ? null : { pts: pts, fo: fo };
      if (!S.width) return; /* not laid out yet: fitted on the first resize */
      /* yaw, pitch, fov and padding may be functions of the aspect ratio (w / h): a portrait phone can get its own view */
      var F = function (v) { return typeof v === 'function' ? v(S.width / S.height) : v; };
      ['yaw', 'pitch', 'fov'].forEach(function (k) { if (fo[k] != null) home[k] = F(fo[k]); });
      var p = fo.padding == null ? 16 : F(fo.padding), pd = typeof p === 'number' ? { top: p, right: p, bottom: p, left: p } : p;
      var ax0 = -1 + 2 * (pd.left || 0) / S.width, ax1 = 1 - 2 * (pd.right || 0) / S.width, ay0 = -1 + 2 * (pd.bottom || 0) / S.height, ay1 = 1 - 2 * (pd.top || 0) / S.height;
      var c = [0, 0, 0], r = 0;
      pts.forEach(function (p) { c = add(c, p, 1 / pts.length); });
      pts.forEach(function (p) { r = Math.max(r, len(sub(p, c))); });
      r = r || 1;
      var h = { target: c, distance: r, yaw: home.yaw, pitch: home.pitch, fov: home.fov }, Z = { yaw: 0, pitch: 0, zoom: 1 };
      function ext() {
        var cm = cam(h, Z), e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, ok: true };
        pts.forEach(function (p) { var v = xf(cm.VP, p); if (v[3] <= 0) { e.ok = false; return; } var x = v[0] / v[3], y = v[1] / v[3]; e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); });
        e.cm = cm; return e;
      }
      for (var it = 0; it < 3; it++) {
        var lo = r * .05, hi = r * 400;
        for (var k = 0; k < 28; k++) {
          h.distance = (lo + hi) / 2; var e = ext();
          if (e.ok && e.x1 - e.x0 <= ax1 - ax0 && e.y1 - e.y0 <= ay1 - ay0) hi = h.distance; else lo = h.distance;
        }
        h.distance = hi; e = ext();
        var t = Math.tan(h.fov * D2R / 2) * h.distance, asp = S.width / S.height;
        h.target = add(add(h.target, e.cm.right, ((e.x0 + e.x1) / 2 - (ax0 + ax1) / 2) * t * asp), e.cm.up, ((e.y0 + e.y1) / 2 - (ay0 + ay1) / 2) * t);
      }
      home.target = h.target; home.distance = h.distance;
      S.invalidate();
    };
    S.project = function (p) {
      var v = xf(cam().VP, p), w = v[3];
      if (w <= 0) return { x: -1e4, y: -1e4, visible: false, depth: w };
      var x = v[0] / w, y = v[1] / w;
      return { x: (x * .5 + .5) * S.width, y: (.5 - y * .5) * S.height, visible: x >= -1 && x <= 1 && y >= -1 && y <= 1 && v[2] / w <= 1, depth: w };
    };
    /* metres per CSS pixel at a world point: size thin things so they stay visible on a phone */
    S.worldPerPixel = function (p) { var c = cam(); return 2 * Math.tan(c.fov * D2R / 2) * len(sub(p || c.target, c.eye)) / (S.height || 1); };
    S.onFrame = function (fn) { frameFns.push(fn); return function () { var i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); }; };
    /* keep an HTML element on a world point. el: position:absolute; left:0; top:0 in a layer over the canvas.
       align: the element's own fraction pinned to the point ([.5, 1] = centred above it) */
    S.anchor = function (el, p, ao) {
      ao = ao || {}; var A = { el: el, p: p, align: ao.align || [.5, .5], offset: ao.offset || [0, 0] };
      A.set = function (q) { A.p = q; place(A); }; A.remove = function () { var i = anchors.indexOf(A); if (i >= 0) anchors.splice(i, 1); };
      anchors.push(A); place(A); return A;
    };
    function place(A) {
      if (!S.width) return;
      var r = S.project(A.p), k = S.dpr, x = Math.round((r.x + A.offset[0]) * k) / k, y = Math.round((r.y + A.offset[1]) * k) / k;
      A.el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(' + (-A.align[0] * 100) + '%,' + (-A.align[1] * 100) + '%)';
      A.el.style.visibility = r.visible ? '' : 'hidden';
    }

    /* ---------- drawing ---------- */
    S.render = function () {
      if (S.lost || S.disposed || !S.width || !prog) return;
      var t0 = performance.now(), c = cam(), bg = env._bg, tr = !!env.transparent;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(tr ? 0 : Math.pow(bg[0], 1 / 2.2), tr ? 0 : Math.pow(bg[1], 1 / 2.2), tr ? 0 : Math.pow(bg[2], 1 / 2.2), tr ? 0 : 1);
      gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      var fg = env.fog === false ? null : env.fog || {};
      gl.uniformMatrix4fv(U.uVP, false, c.VP); gl.uniform3fv(U.uEye, c.eye); gl.uniform3fv(U.uSun, env._sun); gl.uniform3fv(U.uSunC, env._sunC);
      gl.uniform3fv(U.uSky, env._sky); gl.uniform3fv(U.uGnd, env._gnd); gl.uniform3fv(U.uFogC, env._fogC.slice(0, 3));
      gl.uniform1f(U.uWrap, env.wrap == null ? .35 : env.wrap);
      /* fog distances are multiples of the camera distance, so every scene scale fogs alike */
      gl.uniform4f(U.uFog, fg ? (fg.near == null ? 1.1 : fg.near) * c.d : 1e9, fg ? (fg.far == null ? 3 : fg.far) * c.d : 2e9, fg ? (fg.max == null ? 1 : fg.max) : 0, 0);
      var vis = S.meshes.filter(function (m) { return m.visible && m.reveal > 0; });
      var op = vis.filter(function (m) { return !(m.transparent || m.opacity < 1); }), tp = vis.filter(function (m) { return m.transparent || m.opacity < 1; });
      op.sort(function (a, b) { return a.order - b.order; });
      tp.forEach(function (m) { m._d = len(sub(add(m.position, m.geometry.bounds.center), c.eye)); });
      tp.sort(function (a, b) { return a.order - b.order || b._d - a._d; });
      op.forEach(drawMesh); gl.depthMask(false); tp.forEach(drawMesh); gl.depthMask(true);
      var ms = performance.now() - t0, st = S.stats; st.frames++; st.cpuMs = ms; st.cpuAvg = st.cpuAvg ? st.cpuAvg * .9 + ms * .1 : ms;
      anchors.forEach(place);
      frameFns.slice().forEach(function (fn) { fn(S); });
    };
    function drawMesh(m) {
      var g = m.geometry, b = buffers(g); if (!b) return;
      var n = b.count;
      if (m.reveal < 1 && g.reveal) { /* draw up to the last path segment within the revealed length */
        var s = m.reveal * g.path.length, R = g.reveal; n = 0;
        for (var i = 0; i < R.length; i += 2) if (R[i] <= s + 1e-6) n = R[i + 1];
        if (!n) return;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      if (b.c) { gl.enableVertexAttribArray(2); gl.bindBuffer(gl.ARRAY_BUFFER, b.c); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0); }
      else { gl.disableVertexAttribArray(2); gl.vertexAttrib4f(2, 1, 1, 1, 1); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i);
      var M = model(m.position, m.rotation, m.scale), c = col(m.color), sp = m.spec || [0, 1];
      gl.uniformMatrix4fv(U.uM, false, M.m); gl.uniformMatrix3fv(U.uNM, false, M.n);
      gl.uniform4f(U.uCol, c[0], c[1], c[2], c[3] * m.opacity);
      gl.uniform3f(U.uMat, m.unlit ? 1 : m.emissive, sp[0], sp[1]);
      var wv = m.wave, wx = g.bounds.max[0] || 1;
      if (wv && wv.amp) gl.uniform4f(U.uWave, wv.amp / wx, 2 * PI * (wv.waves || 1.2) / wx, wv.speed || 5, waveT); else gl.uniform4f(U.uWave, 0, 0, 0, 0);
      gl.uniform1f(U.uFlip, m.doubleSided ? 1 : 0);
      if (m.doubleSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      if (m.layer) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-m.layer, -m.layer * 2); } else gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.drawElements(gl.TRIANGLES, n, b.type, 0);
    }

    /* ---------- render on demand: a frame is drawn only when something changed or is moving ---------- */
    function waving() { return S.meshes.some(function (m) { return m.visible && m.wave && m.wave.amp; }); }
    function frame(now) {
      raf = 0;
      /* frame time, capped so a switched-away tab never jumps; high enough that a slow device's 10 fps still runs
         animations at wall-clock speed */
      var dt = last ? Math.min(now - last, 150) : 16; last = now;
      var busy = false;
      if (visible && !(root.document && root.document.hidden)) { /* animation clocks only run while the canvas is on screen */
        busy = orbitStep(dt) || busy;
        tweens.slice().forEach(function (tw) {
          tw.t += dt * (S.tempo > 0 ? S.tempo : 1); if (tw.t < tw.delay) { busy = true; return; }
          var u = Math.min(1, (tw.t - tw.delay) / tw.ms); tw.fn(tw.e(u), u);
          if (u >= 1) tw.finish(); else busy = true;
        });
        loops.slice().forEach(function (L) { if (L.fn(dt, now / 1000) === false) L.stop(); else busy = true; });
        if (!S.reduced && ambientLeft > 0 && waving()) { /* the flag waves, then eases to a still pose */
          ambientLeft -= dt; waveT += dt / 1000 * clamp(ambientLeft / 1500, 0, 1); busy = true;
        }
      }
      S.render();
      if (busy) S.invalidate(); else last = 0;
    }
    S.wake = function (sec) { ambientLeft = Math.max(ambientLeft, (sec == null ? AMB : sec) * 1000); S.invalidate(); };

    /* ---------- animation helpers. Under reduced motion every one of them jumps to its end state ---------- */
    S.tween = function (ms, ease, fn, to) {
      to = to || {};
      var tw = { ms: Math.max(1, ms || 0), delay: to.delay || 0, t: 0, e: typeof ease === 'function' ? ease : EASE[ease] || EASE.inOut, fn: fn, alive: true }, res;
      tw.done = typeof Promise !== 'undefined' ? new Promise(function (r) { res = r; }) : null;
      function end() { tw.alive = false; var i = tweens.indexOf(tw); if (i >= 0) tweens.splice(i, 1); if (res) res(); }
      tw.finish = function () { if (!tw.alive) return; fn(1, 1); end(); if (to.onDone) to.onDone(); S.invalidate(); };
      tw.cancel = function () { if (tw.alive) end(); };
      if (S.reduced || !ms || performance.now() < skipUntil) tw.finish(); else { tweens.push(tw); S.invalidate(); }
      return tw;
    };
    /* tempo: a multiplier on tween time (2 = twice as fast), so an app can fit a reveal into a time budget.
       skip(): finish every running tween now, and any chained one started in the next few hundred ms */
    var skipUntil = 0;
    S.tempo = 1;
    S.skip = function (ms) { skipUntil = performance.now() + (ms == null ? 400 : ms); tweens.slice().forEach(function (t) { t.finish(); }); S.invalidate(); };
    S.loop = function (fn) {
      var L = { fn: fn, stop: function () { var i = loops.indexOf(L); if (i >= 0) loops.splice(i, 1); } };
      if (!S.reduced) { loops.push(L); S.invalidate(); }
      return L;
    };
    /* reveal a tube/ribbon along its path, optionally carrying a ball mesh with it */
    S.drawAlong = function (m, da) {
      da = da || {}; var g = m.geometry, lift = da.lift || 0;
      m.reveal = 0;
      return S.tween(da.duration || 1400, da.easing || 'inOut', function (e) {
        m.reveal = e;
        if (da.ball) { var p = g.pointAt(e); da.ball.position = [p[0], p[1] + lift, p[2]]; }
        if (da.onUpdate) da.onUpdate(e);
      }, da);
    };
    /* start offset from home ({yaw, pitch} degrees, zoom ×distance) and ease into it */
    S.flyIn = function (fi) {
      fi = fi || {};
      if (S.reduced) return S.tween(0, 'linear', function () {});
      var y0 = fi.yaw || 0, p0 = fi.pitch || 0, z0 = fi.zoom || 1;
      return S.tween(fi.duration || 1600, fi.easing || 'out', function (e) {
        off.yaw = y0 * (1 - e); off.pitch = p0 * (1 - e); off.zoom = z0 + (1 - z0) * e;
      }, fi);
    };

    /* ---------- drag to orbit: mouse turns and tilts; touch only turns (vertical swipes keep scrolling the page) ---------- */
    var orb = null, drag = null, vel = 0, idle = 0, ret = null;
    S.orbit = function (oo) {
      orb = oo === false ? null : Object.assign({ yaw: [-30, 30], pitch: [-8, 15], inertia: true, returnAfter: 0, speed: .35 }, oo || {});
      canvas.style.touchAction = orb ? 'pan-y pinch-zoom' : ''; /* vertical swipes scroll, pinches zoom the page */
      canvas.style.cursor = orb ? 'grab' : '';
    };
    function onDown(e) {
      if (!orb || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: e.timeStamp, touch: e.pointerType !== 'mouse', on: false };
      if (!drag.touch) { e.preventDefault(); canvas.style.cursor = 'grabbing'; }
    }
    /* a drag becomes an orbit only once it is clearly sideways (a mouse: once it moves at all), so a vertical
       scroll that starts on the canvas neither turns the scene nor wakes the render loop */
    function engage(e) {
      var mx = Math.abs(e.clientX - drag.x0), my = Math.abs(e.clientY - drag.y0);
      if (drag.touch ? !(mx > 8 && mx > 1.5 * my) : mx + my < 3) return false;
      drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
      vel = 0; if (ret) { ret.cancel(); ret = null; }
      try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      if (orb.onStart) orb.onStart();
      S.wake();
      return true;
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) { engage(e); return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, e.timeStamp - drag.t);
      drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
      off.yaw = clamp(off.yaw - dx * orb.speed, orb.yaw[0], orb.yaw[1]);
      if (!drag.touch) off.pitch = clamp(off.pitch + dy * orb.speed, orb.pitch[0], orb.pitch[1]);
      vel = -dx * orb.speed / dt; idle = 0; S.invalidate();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.touch) canvas.style.cursor = 'grab';
      var was = drag.on; drag = null;
      if (!was) return; /* a tap or a cancelled scroll: nothing moved */
      if (S.reduced || !orb.inertia || e.type === 'pointercancel') vel = 0;
      idle = 0; S.invalidate();
    }
    function orbitStep(dt) {
      if (!orb) return false;
      if (drag && drag.on) return true;
      if (Math.abs(vel) > .002) { /* inertia: velocity in degrees/ms, decaying with a ~200 ms time constant */
        off.yaw = clamp(off.yaw + vel * dt, orb.yaw[0], orb.yaw[1]); vel *= Math.exp(-dt / 200);
        if (off.yaw <= orb.yaw[0] || off.yaw >= orb.yaw[1]) vel = 0;
        return true;
      }
      vel = 0;
      if (orb.returnAfter && !S.reduced && !ret && (off.yaw || off.pitch)) {
        idle += dt;
        if (idle >= orb.returnAfter) {
          var y0 = off.yaw, p0 = off.pitch;
          ret = S.tween(900, 'inOut', function (e) { off.yaw = y0 * (1 - e); off.pitch = p0 * (1 - e); }, { onDone: function () { ret = null; } });
        }
        return true;
      }
      return false;
    }

    /* ---------- size, visibility, reduced motion, context loss ---------- */
    S.resize = function () {
      var w = canvas.clientWidth, h = canvas.clientHeight, k = Math.min(o.maxDpr || 2, root.devicePixelRatio || 1);
      if (!w || !h) { S.width = 0; return; }
      var bw = Math.round(w * k), bh = Math.round(h * k), changed = w !== S.width || h !== S.height;
      S.width = w; S.height = h; S.dpr = k;
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      if (changed && fitState) S.frame(fitState.pts, fitState.fo);
      if (changed && o.onResize) o.onResize(S);
      S.render(); /* now, so a resized canvas never shows a blank frame */
    };
    var ro = root.ResizeObserver ? new ResizeObserver(function () { S.resize(); }) : null;
    if (ro) ro.observe(canvas); else root.addEventListener('resize', S.resize);
    function onVis() { if (!root.document.hidden) { last = 0; S.invalidate(); } }
    if (root.document) root.document.addEventListener('visibilitychange', onVis);
    var io = root.IntersectionObserver ? new IntersectionObserver(function (es) { visible = es[es.length - 1].isIntersecting; if (visible) S.invalidate(); }) : null;
    if (io) io.observe(canvas);
    function onMQ() { if (o.reducedMotion != null) return; S.reduced = mq.matches; if (S.reduced) { tweens.slice().forEach(function (t) { t.finish(); }); loops = []; vel = 0; } S.invalidate(); }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMQ); else if (mq.addListener) mq.addListener(onMQ); }
    function onLost(e) {
      e.preventDefault(); S.lost = true;
      if (raf) root.cancelAnimationFrame(raf); raf = 0; bufs.clear(); prog = null;
      if (o.onContextLost && !S.disposed) o.onContextLost(S);
    }
    function onRestored() {
      if (S.disposed) return;
      S.lost = false; try { init(); } catch (x) { return; }
      last = 0; S.resize();
      S.invalidate(); S.wake(); /* tweens queued while it was gone (a reveal, late labels) carry on */
      if (o.onContextRestored) o.onContextRestored(S);
    }
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    /* free every GL resource and lose the context; the canvas should then be thrown away */
    S.dispose = function () {
      if (S.disposed) return;
      if (raf) root.cancelAnimationFrame(raf); raf = 0;
      tweens.slice().forEach(function (t) { t.cancel(); }); loops = []; anchors = []; frameFns = [];
      if (ro) ro.disconnect(); else root.removeEventListener('resize', S.resize);
      if (io) io.disconnect();
      if (root.document) root.document.removeEventListener('visibilitychange', onVis);
      if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMQ); else if (mq.removeListener) mq.removeListener(onMQ); }
      ['pointerdown', onDown, 'pointermove', onMove, 'pointerup', onUp, 'pointercancel', onUp, 'webglcontextrestored', onRestored].forEach(function (x, i, a) { if (i % 2 === 0) canvas.removeEventListener(x, a[i + 1]); });
      freeBuffers();
      if (prog && !gl.isContextLost()) gl.deleteProgram(prog);
      S.disposed = true; S.meshes = []; prog = null;
      var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.style.touchAction = ''; canvas.style.cursor = '';
    };

    if (o.camera) S.setCamera(o.camera);
    S.resize();
    S.wake();
    return S;
  };
})(window);
