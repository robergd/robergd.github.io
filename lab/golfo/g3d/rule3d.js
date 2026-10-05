/* Golfo 3D: the rule vignettes. One small, isolated diorama per rule icon, on a round turf puck
   with a soil edge, like an object on a plinth. Built on G3D (engine.js); no network, no textures.

   G3D.scenes.rule(renderer, scene, opts) → { anchors, animateReveal, update, description, dispose }
   - renderer: a G3D scene from G3D.create (the app owns it and disposes it)
   - scene: the challenge's scene object {type: 'rule', icon, detail, lie?}
   - opts: { theme: 'light'|'dark', colors: {token: '#hex'}, reduced, answered, correct, seed,
             lang: 'en'|'es', detail (localized detail text), labels: {key: text}, orbit (default true) }
   Anchors are [{id, kind, phase, world, label, align, offset}]. `world` arrays are LIVE: the gentle
   turntable updates them in place, so pass them by reference to renderer.anchor(el, a.world, …).
   kind: 'detail' (the plaque under the puck), 'cap' (a quiet caption), 'accent' (lime caption).
   phase: 'always', or 'answered' (show only once the challenge is answered). */
(function (root) {
  'use strict';
  var G = root.G3D; if (!G) return;
  G.scenes = G.scenes || {};
  var PI = Math.PI, D2R = PI / 180;
  var R = 5, WALL = .6, NR = 60, NS = 200; /* puck radius, soil depth, ground rings × segments */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(c) { /* CSS hex → sRGB [r, g, b] in 0..1 */
    var s = String(c || '#808080').trim().replace('#', ''); if (s.length < 6) s = s.replace(/./g, '$&$&');
    var n = parseInt(s.slice(0, 6), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(a) { return 'rgb(' + a.map(function (v) { return Math.round(clamp(v, 0, 1) * 255); }).join(',') + ')'; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function ell(x, z, cx, cz, rx, rz) { return Math.hypot((x - cx) / rx, (z - cz) / rz); }
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  /* a plain G3D geometry from arrays */
  function mk(P, N, I, C) {
    var g = { positions: new Float32Array(P), normals: new Float32Array(N), colors: C ? new Float32Array(C) : null,
      indices: (P.length / 3 > 65535 ? Uint32Array : Uint16Array).from(I) };
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < P.length; i += 3) for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
    g.bounds = { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
    return g;
  }

  /* ---------- palette: the site's golf tokens, lifted a touch for lit 3D (same values as the engine demo's --t-*) ---------- */
  var DEF = {
    dark: { bg: '#0b0b0c', accent: '#d7f56a', fairway: '#3a5030', rough: '#273024', green: '#46682f', sand: '#7a6a4a', sandInk: '#e3c98f',
      water: '#24466f', waterInk: '#6ea8fe', tree: '#2f4527', trunk: '#3a3328', soil: '#2a2926', path: '#4a4a4d', ball: '#fefdff',
      guide: '#9a9aa0', shadow: '#000000', stakeRed: '#ff9166', stakeYellow: '#f2cf5b', stakeWhite: '#ececee', neutral: '#c9c9ce',
      bag: '#3a3a3f', club: '#b4b4b8', sky: '#c9d4e6', ground: '#3a3a32', cup: '#050506' },
    light: { bg: '#fefdff', accent: '#1B4038', fairway: '#bdd3a1', rough: '#d4dbc4', green: '#9cc274', sand: '#eedcb2', sandInk: '#95712a',
      water: '#b9d2f5', waterInk: '#2563eb', tree: '#8fb07c', trunk: '#9c8a70', soil: '#d9d4c6', path: '#d7d5cd', ball: '#ffffff',
      guide: '#55555d', shadow: '#1b2a10', stakeRed: '#ea580c', stakeYellow: '#d6a21c', stakeWhite: '#ffffff', neutral: '#6e6e76',
      bag: '#d2cfc6', club: '#55555d', sky: '#ffffff', ground: '#d8d4c4', cup: '#1b1b1f' }
  };
  /* which token names feed which colour; the app may pass any of these (hex). Raw SVG fills (--fairway…) are
     deliberately not used for surfaces: they are tuned for flat fills and read too dark once lit */
  var KEYS = { bg: ['bg'], accent: ['accent', 'acc-lime'], fairway: ['t-fairway'], rough: ['t-rough'], green: ['t-green'], sand: ['t-sand'],
    sandInk: ['sand-ink'], water: ['t-water'], waterInk: ['water-ink'], tree: ['t-tree'], trunk: ['t-trunk'], soil: ['t-soil'], path: ['t-path'],
    ball: ['t-ball'], guide: ['t-guide'], shadow: ['t-shadow'], stakeRed: ['stake-red'], stakeYellow: ['stake-yellow'], sky: ['t-sky'], ground: ['t-ground'] };
  function palette(theme, c) {
    var d = DEF[theme === 'light' ? 'light' : 'dark'], o = {};
    Object.keys(d).forEach(function (k) {
      var v = d[k]; (KEYS[k] || []).some(function (n) { var x = c && c[n]; if (x && /^#[0-9a-f]{3,8}$/i.test(String(x).trim())) { v = String(x).trim(); return true; } });
      o[k] = v; o['_' + k] = hex(v);
    });
    /* on near-black, the rough would sink into the page: lift it toward the fairway */
    if (theme !== 'light') { o._rough = mix(o._rough, o._fairway, .4); o.rough = css(o._rough); }
    return o;
  }

  /* ---------- captions (the app's i18n can override any of them through opts.labels) ---------- */
  var TXT = {
    en: { penaltyRed: 'Red penalty area', penaltyYellow: 'Yellow penalty area', crossed: 'Last crossed here', ob: 'Out of bounds', boundary: 'Boundary',
      twoClubs: 'Two club-lengths', lineBack: 'Back on the line', pitchMark: 'Its own pitch mark', searchArea: 'Search area', threeMin: '3 minutes',
      npr: 'Nearest point of relief', oneClub: 'One club-length', teeingArea: 'Teeing area', club15: '15th club', outOfPlay: 'Out of play', hole: 'Hole',
      gur: 'Ground under repair', inArea: 'In the area', tempWater: 'Temporary water', freeRelief: 'Free relief', markLift: 'Mark, lift, identify',
      offLine: 'Off the line', oneStroke: 'One stroke', yourBall: 'Your ball', replace: 'Back on its spot', wrongGreen: 'Wrong green',
      spikeMark: 'Spike mark', origSpot: 'Original spot', tenSec: 'Ten seconds', holed: 'Holed', penaltyArea: 'Penalty area', clubUp: 'Club off the sand',
      removeFree: 'Remove them' },
    es: { penaltyRed: 'Área de penalización roja', penaltyYellow: 'Área de penalización amarilla', crossed: 'Último punto de cruce', ob: 'Fuera de límites', boundary: 'Límite',
      twoClubs: 'Dos longitudes de palo', lineBack: 'Hacia atrás en línea', pitchMark: 'En su propio pique', searchArea: 'Zona de búsqueda', threeMin: '3 minutos',
      npr: 'Punto más cercano de alivio', oneClub: 'Una longitud de palo', teeingArea: 'Área de salida', club15: 'Palo número 15', outOfPlay: 'Fuera de juego', hole: 'Hoyo',
      gur: 'Terreno en reparación', inArea: 'Dentro del área', tempWater: 'Agua temporal', freeRelief: 'Alivio sin penalización', markLift: 'Marcar, levantar, identificar',
      offLine: 'Fuera de la línea', oneStroke: 'Un golpe', yourBall: 'Tu bola', replace: 'A su sitio', wrongGreen: 'Green equivocado',
      spikeMark: 'Marca de clavos', origSpot: 'Punto original', tenSec: 'Diez segundos', holed: 'Embocada', penaltyArea: 'Área de penalización', clubUp: 'Palo sin tocar la arena',
      removeFree: 'Se pueden quitar' }
  };
  var DESC = {
    en: { 'penalty-red': 'A pond marked with red stakes, the ball in the water near its edge.', 'penalty-yellow': 'A creek crossing the fairway, marked with yellow stakes, the ball in the water.',
      ob: 'A line of white stakes with a fence behind, the ball beyond the stakes.', unplayable: 'A ball wedged among the roots of a tree.',
      'unplayable-bunker': 'A bunker with a steep grass face, the ball tucked under the lip and the flag beyond.', embedded: 'A ball sitting in its own pitch mark in soft ground.',
      lost: 'Deep rough with a search area around a half-hidden ball.', 'cart-path': 'A ball on a paved cart path, with the nearest point of relief marked off the path.',
      bunker: 'A bunker with a rake, the ball under the lip.', green: 'A putting green with the flag in the hole and the ball close by.',
      tee: 'A teeing ground between two tee markers, the ball on a tee.', equipment: 'A golf bag holding fifteen clubs, the extra club highlighted.', other: 'A flag on a small mound, a ball on its slope.',
      gur: 'A white-lined area of ground under repair in the rough, the ball resting on its line.', tempwater: 'A soggy fairway with water pooling around the shoes of a normal stance beside the ball.',
      identify: 'A muddy ball sitting down in the rough, a tee marking its spot.', caddie: 'A caddie standing on the line of play behind the ball, the flag ahead.',
      double: 'A chip from thick rough by the green, the ball popping up off the clubface.', wrongball: 'Two balls of the same brand in the rough, a few steps apart.',
      moved: 'A ball nudged a short way from its spot by the club at address.', wronggreen: 'A ball on the green of a neighbouring hole, its own flag on the green beyond.',
      damage: 'A green with small marks on the line of the putt.', blown: 'A ball on the green blown a little way from its marked spot.',
      overhang: 'A ball hanging over the edge of the hole.', flagin: 'A ball wedged against the flagstick, partly in the hole.',
      bunkerpa: 'A bunker beside a yellow-staked ditch, the ball in the sand.', leaves: 'A bunker with a leaf and a stone behind the ball.',
      'embedded-rough': 'A ball plugged in its own pitch mark in the rough.' },
    es: { 'penalty-red': 'Un lago marcado con estacas rojas y la bola en el agua, junto al margen.', 'penalty-yellow': 'Un arroyo que cruza la calle, marcado con estacas amarillas, y la bola en el agua.',
      ob: 'Una línea de estacas blancas con una valla detrás y la bola más allá de las estacas.', unplayable: 'Una bola encajada entre las raíces de un árbol.',
      'unplayable-bunker': 'Un búnker con un talud de hierba muy vertical, la bola bajo el labio y la bandera detrás.', embedded: 'Una bola en su propio pique, en terreno blando.',
      lost: 'Rough alto con una zona de búsqueda alrededor de una bola medio escondida.', 'cart-path': 'Una bola sobre un camino de buggies asfaltado, con el punto más cercano de alivio marcado fuera del camino.',
      bunker: 'Un búnker con un rastrillo y la bola bajo el labio.', green: 'Un green con la bandera en el hoyo y la bola cerca.',
      tee: 'Un área de salida entre dos marcas, con la bola en el tee.', equipment: 'Una bolsa con quince palos, con el palo de más resaltado.', other: 'Una bandera sobre un pequeño montículo y una bola en su pendiente.',
      gur: 'Un área de terreno en reparación marcada con una línea blanca en el rough, con la bola tocando la línea.', tempwater: 'Una calle encharcada, con agua alrededor de los zapatos al colocarse junto a la bola.',
      identify: 'Una bola con barro hundida en el rough y un tee que marca su sitio.', caddie: 'Un caddie de pie en la línea de juego, detrás de la bola, con la bandera delante.',
      double: 'Un chip desde rough alto junto al green, con la bola saltando de la cara del palo.', wrongball: 'Dos bolas de la misma marca en el rough, a unos pasos una de otra.',
      moved: 'Una bola movida un poco de su sitio por el palo al prepararse.', wronggreen: 'Una bola en el green de otro hoyo, con su bandera en el green de más allá.',
      damage: 'Un green con pequeñas marcas en la línea del putt.', blown: 'Una bola en el green movida por el viento desde su punto marcado.',
      overhang: 'Una bola colgando del borde del hoyo.', flagin: 'Una bola apoyada en la bandera, en parte dentro del hoyo.',
      bunkerpa: 'Un búnker junto a una zanja con estacas amarillas, con la bola en la arena.', leaves: 'Un búnker con una hoja y una piedra detrás de la bola.',
      'embedded-rough': 'Una bola empotrada en su propio pique en el rough.' }
  };

  /* the puck's gentle dome: zero at the rim, so the soil edge is level */
  function dome(x, z) {
    var f = Math.max(0, 1 - (x * x + z * z) / (R * R));
    return .2 * f * f + .045 * Math.sin(.8 * x + .3) * Math.sin(.6 * z + .9) * f;
  }

  /* ---------- the vignettes: layout data, height, colour, then props ---------- */
  /* each returns { yaw, H(x,z), C(x,z,y) → sRGB, water: level|null, occ: [{x,z,r,k}], ballR, build(k) } */
  var V = {};

  /* water hazards: a pond (red) or a creek crossing the fairway (yellow). E < 1 is water;
     M(t, e, side) traces the margin scaled by e (1 = the water's edge) */
  function waterVignette(P, kind) {
    var red = kind === 'penalty-red', WL = -.14, PC = [-.9, -1.35, 3.0, 1.85], HW = .78;
    function zc(x) { return .05 + .38 * Math.sin(.5 * x + .5); }
    var E = red ? function (x, z) { return ell(x, z, PC[0], PC[1], PC[2], PC[3]); } : function (x, z) { return Math.abs(z - zc(x)) / HW; };
    var M = red ? function (t, e) { return [PC[0] + PC[2] * e * Math.sin(t), PC[1] + PC[3] * e * Math.cos(t)]; }
      : function (t, e, sd) { return [t, zc(t) + sd * HW * e]; };
    function H(x, z) {
      var e = E(x, z), lv = 1 - sstep(1, 1.45, e), bowl = 1 - sstep(.7, 1.02, e);
      return dome(x, z) * (1 - lv) - .5 * bowl;
    }
    var stakeCss = red ? P.stakeRed : P.stakeYellow;
    return {
      yaw: red ? -14 : -18, H: H, water: WL, ballR: .17, occ: [],
      C: function (x, z) {
        var e = E(x, z), fw = red ? sstep(.5, 1.0, z - .25 * Math.sin(x * .6)) : 1 - sstep(1.6, 2.1, Math.abs(x - .3));
        var grass = mix(P._rough, P._fairway, fw * sstep(1.25, 1.6, e));
        var bank = mix(mix(P._rough, P._soil, .4), grass, sstep(.92, 1.08, e));
        return mix(mix(P._water, P._soil, .55), bank, sstep(.82, .92, e));
      },
      build: function (k) {
        function runs(e) {
          return red ? k.contour(function (t) { return M(t, e); }, 0, 2 * PI, 300)
            : [1, -1].reduce(function (a, sd) { return a.concat(k.contour(function (t) { return M(t, e, sd); }, -R, R, 220).map(function (r) { r.side = sd; return r; })); }, []);
        }
        /* the painted margin line, then stakes just outside it */
        runs(1.05).forEach(function (r) { k.line(r, { width: .05, color: stakeCss, emissive: .3 }); });
        var stakes = [];
        runs(1.17).forEach(function (r) { k.along(r, red ? 1.55 : 1.7, .5).forEach(function (p) { p.side = r.side; stakes.push(p); }); });
        k.stakes(stakes, stakeCss);
        /* the caption sits on the front-left stake */
        var want = red ? M(-.55, 1.17) : [-1.4, 0], cap = stakes.filter(function (p) { return red || p.side === 1; })
          .reduce(function (b, p) { return Math.hypot(p[0] - want[0], p[1] - want[1]) < Math.hypot(b[0] - want[0], b[1] - want[1]) ? p : b; });
        k.anchor('area', 'cap', [cap[0], H(cap[0], cap[1]) + .9, cap[1]], red ? 'penaltyRed' : 'penaltyYellow', { align: [.5, 1], offset: [0, -8] });
        /* the ball, in the water near the margin, with two quiet ripples */
        var b = red ? M(.6, .76) : M(.8, .45, 1);
        k.ball(b[0], b[1], { y: WL + .02, shadow: false });
        [.34, .58].forEach(function (r, i) { k.ring(b, r, { y: WL + .006, width: .022, color: P.ball, opacity: .4 - i * .15, unlit: true }); });
        /* answered: where the ball last crossed the margin */
        var cp = red ? M(.6, 1.05) : M(.8, 1.05, 1);
        k.answer(function (a) {
          a.ring(cp, .3, { width: .06 });
          a.peg(cp);
          a.anchor('crossed', 'accent', [cp[0], H(cp[0], cp[1]), cp[1] + .3], 'crossed', { align: [.5, 0], offset: [0, 10] });
        });
      }
    };
  }
  V['penalty-red'] = function (P) { return waterVignette(P, 'penalty-red'); };
  V['penalty-yellow'] = function (P) { return waterVignette(P, 'penalty-yellow'); };

  V.ob = function (P) {
    function zb(x) { return -.5 + .07 * x; }
    function H(x, z) { return dome(x, z) + .05 * sstep(0, -1.5, z - zb(x)); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) {
        var d = z - zb(x), fw = sstep(.7, 1.1, d);
        var inC = mix(P._rough, P._fairway, fw), outC = mix(P._rough, P._soil, .12);
        return mix(outC, inC, sstep(-.04, .04, d));
      },
      build: function (k) {
        var st = []; for (var x = -4.05; x <= 4.1; x += 1.35) if (Math.hypot(x, zb(x)) < R - .35) st.push([x, zb(x) - .05]);
        k.stakes(st, P.stakeWhite);
        /* a low post-and-rail fence near the back of the puck */
        var zf = -3.05, posts = [], rails = [];
        for (var fx = -3.6; fx <= 3.7; fx += 1.2) if (Math.hypot(fx, zf) < R - .3) posts.push(fx);
        var parts = posts.map(function (fx) { return { geometry: G.box({ w: .11, h: .78, d: .11 }), color: P.trunk, position: [fx, H(fx, zf) - .04, zf] }; });
        [.34, .64].forEach(function (yy) { rails.push(G.tube(posts.map(function (fx) { return [fx, H(fx, zf) + yy, zf]; }), { radius: .035, segments: 6 })); });
        rails.forEach(function (g) { parts.push({ geometry: g, color: P.trunk }); });
        k.add(G.merge(parts), {});
        var b = [.65, -1.55];
        k.ball(b[0], b[1]);
        k.anchor('ob', 'cap', [b[0] + .2, H(b[0], b[1]) + .17, b[1]], 'ob', { align: [0, .5], offset: [14, 0] }); /* beside the ball, clear of the fence */
        k.answer(function (a) {
          var pts = []; for (var s = 0; s <= 40; s++) { var x = -4.3 + s / 40 * 8.6; if (Math.hypot(x, zb(x)) < R - .2) pts.push([x, zb(x)]); }
          a.line(pts, { width: .06 });
          a.anchor('boundary', 'accent', [3.2, H(3.2, zb(3.2)) + .05, zb(3.2) + .25], 'boundary', { align: [.5, 0], offset: [0, 8] });
        });
        k.focus([0, 1.1, -3]);
      }
    };
  };

  V.unplayable = function (P) {
    var T = [-.75, -1.15], B = [.12, -.3];
    function H(x, z) { return dome(x, z) + .1 * Math.exp(-(Math.pow(x - T[0], 2) + Math.pow(z - T[1], 2)) / .9); }
    return {
      yaw: -18, H: H, water: null, ballR: .17, occ: [{ x: T[0] + .25, z: T[1] + .25, r: 2.6, k: .42 }, { x: 2.1, z: -1.45, r: 1.1, k: .35 }],
      C: function (x, z) { return mix(P._rough, mix(P._rough, P._soil, .35), Math.exp(-(Math.pow(x - T[0], 2) + Math.pow(z - T[1], 2)) / 1.4)); },
      build: function (k) {
        var y0 = H(T[0], T[1]), parts = [];
        parts.push({ geometry: G.cylinder({ radiusTop: .17, radiusBottom: .26, height: 1.9, segments: 9 }), color: P.trunk, position: [T[0], y0 - .05, T[1]] });
        /* roots: arched tubes running out over the ground; the ball sits between two of them */
        [12, 78, 135, 200, 262, 318].forEach(function (deg, i) {
          var a = deg * D2R, L = 1.15 + (i % 3) * .25, pts = [];
          for (var s = 0; s <= 12; s++) {
            var t = s / 12, r = .16 + t * L, x = T[0] + Math.sin(a) * r, z = T[1] + Math.cos(a) * r;
            pts.push([x, H(x, z) + .07 * Math.sin(PI * Math.min(1, t * 1.3)) + .03 * (1 - t), z]);
          }
          parts.push({ geometry: G.tube(pts, { radius: .065 - i * .002, segments: 6 }), color: P.trunk });
        });
        [[T[0], 2.25, T[1], 1.15], [T[0] + .68, 1.9, T[1] + .35, .8], [T[0] - .72, 1.8, T[1] + .2, .75]].forEach(function (c) {
          parts.push({ geometry: G.icosphere({ radius: c[3], detail: 1, flat: true }), color: P.tree, position: [c[0], y0 + c[1], c[2]], scale: [1, .9, 1] });
        });
        [[2.05, -1.5, .62], [2.6, -1.1, .42]].forEach(function (c) { parts.push({ geometry: G.icosphere({ radius: c[2], detail: 1, flat: true }), color: P.tree, position: [c[0], H(c[0], c[1]) + c[2] * .55, c[1]], scale: [1, .75, 1] }); });
        k.add(G.merge(parts), {});
        k.ball(B[0], B[1]);
        k.answer(function (a) {
          /* lateral relief: within two club-lengths, no nearer the hole (the hole lies beyond the tree, along −Z) */
          a.halfDisc(B, 2.0, {});
          a.anchor('twoClubs', 'accent', [B[0] + 1.25, H(B[0] + 1.25, B[1] + 1.6) + .05, B[1] + 1.6], 'twoClubs', { align: [.5, 0], offset: [0, 6] });
        });
        k.focus([T[0], y0 + 3.3, T[1]]);
      }
    };
  };

  /* a bunker with a grass face behind it; used by 'bunker' and 'unplayable-bunker' */
  function bunkerShape(cx, cz, rx, rz, depth, lipZ, lipH) {
    function E(x, z) { return ell(x, z, cx, cz, rx, rz); }
    function H(x, z) {
      var e = E(x, z), bowl = 1 - sstep(.62, 1.0, e);
      var lip = lipH * Math.exp(-Math.pow((z - lipZ) / .55, 2)) * (1 - sstep(rx * .7, rx * 1.15, Math.abs(x - cx)));
      return dome(x, z) + lip * (1 - .55 * bowl) - depth * bowl * (1 + .35 * sstep(cz, cz - rz, z));
    }
    return { E: E, H: H };
  }
  V['unplayable-bunker'] = function (P) {
    var S = bunkerShape(0, .55, 3.0, 2.05, .48, -1.65, .55), F = [.45, -3.45], B = [.32, -1.05];
    return {
      yaw: -16, H: S.H, water: null, ballR: .17, occ: [],
      C: function (x, z) {
        var e = S.E(x, z), g = ell(x, z, .4, -3.7, 2.7, 1.35);
        var turf = mix(P._green, P._rough, sstep(.92, 1.05, g));
        return mix(P._sand, turf, sstep(.93, 1.03, e));
      },
      build: function (k) {
        k.flag(F[0], F[1], { cloth: P.accent });
        k.ball(B[0], B[1]);
        k.answer(function (a) {
          /* back on the line from the flag through the ball, out of the bunker */
          var d = [B[0] - F[0], B[1] - F[1]], L = Math.hypot(d[0], d[1]); d = [d[0] / L, d[1] / L];
          var pts = [], end = null;
          for (var s = 0; s <= 50; s++) { var t = .3 + s / 50 * 4.1, p = [B[0] + d[0] * t, B[1] + d[1] * t]; if (Math.hypot(p[0], p[1]) > R - .4) break; pts.push(p); end = p; }
          a.line(pts, { width: .06, dash: [.22, .14] });
          a.ring(end, .28, { width: .06 });
          a.anchor('lineBack', 'accent', [end[0], S.H(end[0], end[1]) + .05, end[1]], 'lineBack', { align: [0, .5], offset: [16, 0] });
        });
        k.focus([F[0], 2.7, F[1]]);
      }
    };
  };
  V.bunker = function (P) {
    var S = bunkerShape(0, .3, 3.3, 2.3, .46, -2.15, .42), B = [.8, -1.3];
    return {
      yaw: -16, H: S.H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._sand, mix(P._fairway, P._rough, .35), sstep(.93, 1.03, S.E(x, z))); },
      build: function (k) {
        /* the rake, lying in the sand: handle, head and tines as tubes */
        var h0 = [-2.55, 1.05], h1 = [-.7, 1.75], parts = [], up = .045;
        function gp(p, lift) { return [p[0], S.H(p[0], p[1]) + (lift == null ? up : lift), p[1]]; }
        parts.push({ geometry: G.tube([gp(h0, .05), gp(h1, .07)], { radius: .032, segments: 6 }), color: P.guide });
        var dx = h1[0] - h0[0], dz = h1[1] - h0[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, px = -uz, pz = ux;
        var hc = [h1[0] + ux * .03, h1[1] + uz * .03], hw = .42;
        parts.push({ geometry: G.tube([gp([hc[0] - px * hw, hc[1] - pz * hw], .1), gp([hc[0] + px * hw, hc[1] + pz * hw], .1)], { radius: .04, segments: 6 }), color: P.guide });
        for (var i = 0; i <= 8; i++) { var q = [hc[0] + px * hw * (i / 4 - 1) + ux * .02, hc[1] + pz * hw * (i / 4 - 1) + uz * .02]; parts.push({ geometry: G.tube([gp(q, .1), gp([q[0] + ux * .07, q[1] + uz * .07], .01)], { radius: .014, segments: 4 }), color: P.guide }); }
        k.add(G.merge(parts), {});
        /* a few raked lines in the sand, beyond the head */
        for (var j = -3; j <= 3; j++) {
          var pts = []; for (var s = 0; s <= 14; s++) { var t = .15 + s / 14 * 1.5; pts.push([hc[0] + px * j * .13 + ux * t, hc[1] + pz * j * .13 + uz * t]); }
          k.line(pts, { width: .022, color: P.sandInk, opacity: .32, unlit: true });
        }
        k.ball(B[0], B[1]);
        k.answer(function (a) { a.ring(B, .42, { width: .06 }); });
        k.focus([0, .9, -2.2]);
      }
    };
  };

  V.embedded = function (P, scene, opts, theme) {
    var B = [.2, .35], sand = /bunker|sand/.test(String(scene.lie || '') + ' ' + String(opts.title || '')), rough = !sand && /rough/.test(variantKey(scene, opts)), BR = .3;
    function H(x, z) {
      var d = Math.hypot(x - B[0], z - B[1]), back = sstep(-.2, .7, -(z - B[1]) / Math.max(d, .01));
      return dome(x, z) - .2 * Math.exp(-Math.pow(d / .4, 2)) + (.05 + .07 * back) * Math.exp(-Math.pow((d - .56) / .17, 2));
    }
    return {
      yaw: -14, H: H, water: null, ballR: BR, occ: [],
      C: function (x, z) {
        var base = sand ? P._sand : rough ? P._rough : mix(P._rough, P._fairway, .35);
        var d = Math.hypot(x - B[0], z - B[1]);
        return mix(base, mix(base, P._soil, .55), Math.exp(-Math.pow(d / .48, 2)));
      },
      build: function (k) {
        var y = H(B[0], B[1]) + BR * .3;
        k.ball(B[0], B[1], { y: y, r: BR, shadow: false });
        if (rough) tufts(k, P, theme, opts.seed, 260, function (x, z) { return Math.hypot(x - B[0], z - B[1]) > .62; }, [.26, .48]);
        k.anchor('pitchMark', 'cap', [B[0], H(B[0], B[1] + .8), B[1] + .8], 'pitchMark', { align: [.5, 0], offset: [0, 8] });
        /* in the general area: a free drop within one club-length of the spot right behind it; in a bunker, as it lies */
        k.answer(function (a) {
          if (sand) { a.ring(B, .78, { width: .07 }); return; }
          a.halfDisc([B[0], B[1] + .45], 1.0, {});
          a.anchor('oneClub', 'accent', [B[0] + 1.05, H(B[0] + 1.05, B[1] + .9) + .05, B[1] + .9], 'oneClub', { align: [0, .5], offset: [10, 0] });
        });
        k.focus([B[0], .8, B[1]]);
      }
    };
  };

  /* tufts of thin blades, seeded so the same challenge always grows the same grass; keep(x, z) says where */
  function tufts(k, P, theme, seed, n, keep, hr) {
    var R0 = rng((seed || 1) * 977 + 31), parts = [], blade = G.cone({ radius: .028, height: 1, segments: 3, caps: false });
    var tones = (theme === 'light' ? [mix(P._tree, P._rough, .55), mix(P._tree, P._fairway, .6), mix(P._tree, P._rough, .3)] : [mix(P._tree, P._rough, .25), mix(P._tree, P._fairway, .45), P._tree]).map(css);
    for (var i = 0; i < n; i++) {
      var a = R0() * 2 * PI, r = Math.sqrt(R0()) * (R - .3), x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!keep(x, z)) continue;
      var y = k.H(x, z), hgt = hr[0] + R0() * (hr[1] - hr[0]), tone = tones[Math.floor(R0() * 3)];
      for (var b = 0; b < 3; b++) parts.push({ geometry: blade, color: tone, position: [x + (R0() - .5) * .08, y - .02, z + (R0() - .5) * .08], rotation: [8 + R0() * 18, R0() * 360, 0], scale: [1, hgt * (.75 + R0() * .4), 1] });
    }
    if (parts.length) k.add(G.merge(parts), {});
  }
  function variantKey(scene, opts) { return (String(scene.detail || '') + ' ' + String((opts && opts.title) || '')).toLowerCase(); }

  /* ---------- rulings that share an icon get their own picture ---------- */
  /* ground under repair: a white painted line in the rough, the ball's edge on it */
  V.gur = function (P) {
    var A = [-.6, -.6, 2.1, 1.35], B = [A[0] + A[2] * 1.0 + .03, A[1] + .25];
    function E(x, z) { return ell(x, z, A[0], A[1], A[2], A[3]); }
    function H(x, z) { return dome(x, z) - .03 * (1 - sstep(.9, 1, E(x, z))); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { var e = E(x, z); return mix(mix(P._rough, P._soil, .42), mix(P._rough, P._fairway, .25), sstep(.92, 1, e)); },
      build: function (k) {
        var ring = []; for (var i = 0; i <= 120; i++) { var t = i / 120 * 2 * PI; ring.push([A[0] + A[2] * Math.sin(t), A[1] + A[3] * Math.cos(t)]); }
        k.line(ring, { width: .07, color: P.stakeWhite, emissive: .4 });
        k.ball(B[0], B[1]);
        k.anchor('area', 'cap', [A[0] - A[2] * .2, H(A[0], A[1] + A[3]) + .05, A[1] + A[3] + .1], 'gur', { align: [.5, 0], offset: [0, 8] });
        k.answer(function (a) {
          a.area([A[0], A[1]], ring, {});
          a.ring(B, .3, { width: .05 });
          a.anchor('inArea', 'accent', [B[0] + .2, H(B[0], B[1]) + .3, B[1]], 'inArea', { align: [0, .5], offset: [16, 0] });
        });
        k.focus([0, .6, -2]);
      }
    };
  };
  /* temporary water: a soggy fairway; water pools around the shoes of a normal stance */
  V.tempwater = function (P) {
    var B = [.75, .1], SH = [[-.2, .62], [-.2, -.42]];
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -18, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._fairway, mix(P._fairway, P._soil, .25), .5 + .5 * Math.sin(x * .7 + z * .4)); },
      build: function (k) {
        k.ball(B[0], B[1]);
        SH.forEach(function (p) {
          k.add(G.disc({ radius: 1, segments: 40, fade: .3 }), { color: P.water, position: [p[0], H(p[0], p[1]) + .012, p[1]], scale: [.95, 1, .62], transparent: true, opacity: .88, spec: [.35, 60], layer: 2 });
          k.add(G.box({ w: .3, h: .16, d: .72 }), { color: css(mix(P._bag, P._shadow, .25)), position: [p[0], H(p[0], p[1]) - .01, p[1]], rotation: [0, 82, 0] }); /* a shoe of the stance */
        });
        k.anchor('tw', 'cap', [-.15, H(-.15, 1.1) + .05, 1.1], 'tempWater', { align: [.5, 0], offset: [0, 8] });
        k.answer(function (a) {
          var N = [1.9, .2];
          a.peg(N);
          a.halfDisc(N, 1.0, {});
          a.anchor('freeRelief', 'accent', [N[0] + .4, H(N[0] + .4, N[1] + 1.1) + .05, N[1] + 1.1], 'freeRelief', { align: [.5, 0], offset: [0, 8] });
        });
        k.focus([0, .6, -1]);
      }
    };
  };
  /* identifying a ball: sitting down in the rough, its spot marked with a tee */
  V.identify = function (P, scene, opts, theme) {
    var B = [.3, .1];
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._rough, P._tree, .22); },
      build: function (k) {
        tufts(k, P, theme, opts.seed, 300, function (x, z) { return Math.hypot(x - B[0], z - B[1]) > .26; }, [.24, .44]);
        k.ball(B[0], B[1], { y: H(B[0], B[1]) + .12 });
        k.peg([B[0] + .45, B[1] + .2], P.stakeWhite);
        k.answer(function (a) {
          a.ring(B, .42, { width: .06 });
          a.anchor('markLift', 'accent', [B[0], H(B[0], B[1] + .6), B[1] + .6], 'markLift', { align: [.5, 0], offset: [0, 10] });
        });
        k.focus([0, .8, -1.5]);
      }
    };
  };
  /* a caddie on the line of play behind the ball */
  function figure(k, P, x, z, H) {
    var y = H(x, z), c = css(mix(P._bag, P._shadow, .1));
    k.add(G.merge([{ geometry: G.cylinder({ radiusTop: .17, radiusBottom: .2, height: 1.15, segments: 14 }), color: c },
      { geometry: G.sphere({ radius: .15, segments: 12, rings: 8 }), color: c, position: [0, 1.32, 0] }]), { position: [x, y - .02, z] });
    k.focus([x, y + 1.5, z]);
  }
  V.caddie = function (P) {
    var F = [-.6, -3.6], B = [.15, .55], C2 = [.15 + (B[0] - F[0]) * .38, B[1] + (B[1] - F[1]) * .38];
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -22, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._fairway, P._rough, sstep(2.4, 3.6, Math.abs(x + .2))); },
      build: function (k) {
        k.flag(F[0], F[1], { cloth: P.accent });
        k.ball(B[0], B[1]);
        figure(k, P, C2[0], C2[1], H);
        var d = [B[0] - F[0], B[1] - F[1]], L = Math.hypot(d[0], d[1]); d = [d[0] / L, d[1] / L];
        var line = []; for (var i = 0; i <= 30; i++) { var t = .4 + i / 30 * (L + 1.2); line.push([F[0] + d[0] * t, F[1] + d[1] * t]); }
        k.line(line, { width: .035, color: P.guide, opacity: .75, unlit: true, dash: [.16, .12] });
        k.answer(function (a) {
          var off = [C2[0] + 1.2, C2[1] - .1];
          a.ring(off, .3, { width: .06 });
          a.line([[C2[0] + .3, C2[1] - .02], [off[0] - .32, off[1]]], { width: .05, dash: [.14, .1] });
          a.anchor('offLine', 'accent', [off[0], H(off[0], off[1] + .4), off[1] + .4], 'offLine', { align: [.5, 0], offset: [0, 10] });
        });
        k.focus([0, .6, -2.5]);
      }
    };
  };
  /* a double hit: a chip from thick rough by the green, the ball popping up off the face */
  V.double = function (P, scene, opts, theme) {
    var B = [.2, .5], GE = -.9;
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -18, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._green, mix(P._rough, P._tree, .2), sstep(GE - .1, GE + .1, z)); },
      build: function (k) {
        tufts(k, P, theme, opts.seed, 240, function (x, z) { return z > GE + .15 && Math.hypot(x - B[0], z - B[1]) > .3; }, [.22, .4]);
        var y = H(B[0], B[1]), arc = [];
        for (var i = 0; i <= 14; i++) { var t = i / 14; arc.push([B[0], y + .17 + .55 * Math.sin(PI * t * .9), B[1] - .9 * t]); }
        k.add(G.tube(arc, { radius: .02, segments: 5 }), { color: P.guide, unlit: true, opacity: .7, transparent: true });
        k.ball(B[0], B[1] - .55, { y: y + .17 + .5 });
        /* the club: a shaft and an iron head following through under the ball */
        var hd = [B[0] - .05, y + .1, B[1] - .2];
        k.add(G.merge([{ geometry: G.box({ w: .34, h: .12, d: .07 }), color: P.club, position: hd },
          { geometry: G.cylinder({ radius: .018, height: 1.6, segments: 6 }), color: P.club, position: [hd[0] + .12, hd[1] + .02, hd[2]], rotation: [-38, 0, -18] }]), {});
        k.answer(function (a) {
          a.ring([B[0], B[1] - .95], .32, { width: .06 });
          a.anchor('oneStroke', 'accent', [B[0] + .3, H(B[0], B[1] - .95) + .05, B[1] - .95], 'oneStroke', { align: [0, .5], offset: [18, 0] });
        });
        k.focus([0, 1.3, -1.5]);
      }
    };
  };
  /* a wrong ball: two of the same brand a few steps apart */
  V.wrongball = function (P, scene, opts, theme) {
    var B1 = [-.7, .4], B2 = [1.2, -.6];
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function () { return mix(P._rough, P._tree, .12); },
      build: function (k) {
        tufts(k, P, theme, opts.seed, 220, function (x, z) { return Math.hypot(x - B1[0], z - B1[1]) > .3 && Math.hypot(x - B2[0], z - B2[1]) > .3; }, [.18, .34]);
        k.ball(B1[0], B1[1]); k.ball(B2[0], B2[1]);
        k.answer(function (a) {
          a.ring(B2, .4, { width: .06 });
          a.anchor('yourBall', 'accent', [B2[0], H(B2[0], B2[1] + .5), B2[1] + .5], 'yourBall', { align: [.5, 0], offset: [0, 10] });
        });
        k.focus([0, .6, -1.5]);
      }
    };
  };
  /* a ball moved: nudged a short way by the club at address */
  V.moved = function (P) {
    var O = [-.2, .3], B = [.35, .05];
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._fairway, P._rough, sstep(2.2, 3.4, Math.abs(x))); },
      build: function (k) {
        k.ring(O, .19, { width: .025, color: P.guide, opacity: .8, unlit: true, dash: [.06, .05] });
        k.line([[O[0] + .2, O[1] - .08], [B[0] - .2, B[1] + .08]], { width: .025, color: P.guide, opacity: .7, unlit: true, dash: [.07, .06] });
        k.ball(B[0], B[1]);
        var hd = [O[0] - .42, H(O[0], O[1]) + .02, O[1] + .1];
        k.add(G.merge([{ geometry: G.box({ w: .1, h: .1, d: .32 }), color: P.club, position: hd },
          { geometry: G.cylinder({ radius: .018, height: 1.6, segments: 6 }), color: P.club, position: [hd[0] - .02, hd[1] + .06, hd[2]], rotation: [0, 0, 32] }]), {});
        k.answer(function (a) {
          a.ring(O, .34, { width: .06 });
          a.anchor('replace', 'accent', [O[0], H(O[0], O[1] + .5), O[1] + .5], 'replace', { align: [.5, 0], offset: [0, 10] });
        });
        k.focus([0, .9, -1.5]);
      }
    };
  };
  /* the green rulings: a putting surface, then each one's own detail */
  function greenBase(P, extra) {
    function H(x, z) { return dome(x, z) + .06 * Math.sin(.45 * x + .2) * Math.max(0, 1 - (x * x + z * z) / (R * R)); }
    return { yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { var r = Math.hypot(x, z); return mix(mix(P._green, P._fairway, sstep(3.6, 3.75, r)), P._rough, sstep(4.2, 4.35, r)); }, build: extra };
  }
  V.wronggreen = function (P) {
    /* the wrong green in front, the ball on it; your own green and flag beyond */
    var W = [-.3, 1.2, 2.6, 1.5], Y = [.6, -2.9, 2.6, 1.3], B = [.2, 1.0];
    function H(x, z) { return dome(x, z) + .05 * (1 - sstep(.95, 1.1, ell(x, z, W[0], W[1], W[2], W[3]))) + .05 * (1 - sstep(.95, 1.1, ell(x, z, Y[0], Y[1], Y[2], Y[3]))); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) {
        var c = mix(P._rough, P._fairway, .3);
        c = mix(c, P._green, 1 - sstep(.97, 1.03, ell(x, z, Y[0], Y[1], Y[2], Y[3])));
        return mix(c, mix(P._green, P._fairway, .25), 1 - sstep(.97, 1.03, ell(x, z, W[0], W[1], W[2], W[3])));
      },
      build: function (k) {
        k.flag(Y[0], Y[1] + .2, { cloth: P.accent });
        k.add(G.disc({ radius: .15, segments: 20 }), { color: P.cup, unlit: true, layer: 2, position: [W[0] - .9, H(W[0] - .9, W[1] - .2) + .012, W[1] - .2] }); /* the other hole's cup */
        k.ball(B[0], B[1]);
        k.anchor('wrongGreen', 'cap', [W[0] - 1.3, H(W[0] - 1.3, W[1] + 1.2) + .05, W[1] + 1.2], 'wrongGreen', { align: [.5, 0], offset: [0, 8] });
        k.answer(function (a) {
          /* relief is mandatory: the nearest point off that green, then a club-length, not nearer the hole */
          var N = [W[0] + W[2] + .15, B[1]];
          a.peg(N);
          a.halfDisc(N, 1.0, { clip: function (p) { return [Math.max(p[0], N[0]), p[1]]; } });
          a.anchor('oneClub', 'accent', [N[0] + .6, H(N[0] + .6, N[1] + 1.05) + .05, N[1] + 1.05], 'oneClub', { align: [.5, 0], offset: [0, 6] });
        });
        k.focus([0, .7, -1]);
      }
    };
  };
  V.damage = function (P) {
    var CUP = [-.6, -2.2], B = [.6, 1.6];
    return greenBase(P, function (k) {
      var H = k.H;
      k.flag(CUP[0], CUP[1], { cloth: P.accent });
      k.ball(B[0], B[1]);
      k.line([[B[0] - .08, B[1] - .25], [CUP[0] + .1, CUP[1] + .3]], { width: .025, color: P.guide, opacity: .6, unlit: true, dash: [.1, .08] });
      /* a spike mark (raised tufts), an old hole plug and a pitch mark beside the line */
      var SM = [B[0] + (CUP[0] - B[0]) * .45, B[1] + (CUP[1] - B[1]) * .45];
      var parts = [];
      for (var i = 0; i < 7; i++) { var a = i / 7 * 2 * PI; parts.push({ geometry: G.cone({ radius: .035, height: .07, segments: 4 }), color: css(mix(P._green, P._soil, .5)), position: [SM[0] + Math.sin(a) * .09, H(SM[0], SM[1]), SM[1] + Math.cos(a) * .09] }); }
      k.add(G.merge(parts), {});
      var PM = [SM[0] + .55, SM[1] + .6];
      k.add(G.disc({ radius: .1, segments: 16 }), { color: css(mix(P._green, P._soil, .55)), layer: 2, position: [PM[0], H(PM[0], PM[1]) + .01, PM[1]], scale: [1.3, 1, 1] });
      k.ring([SM[0] - .6, SM[1] - .3], .22, { width: .02, color: css(mix(P._green, P._soil, .3)), opacity: .7, unlit: true });
      k.answer(function (a) {
        a.ring(SM, .26, { width: .05 });
        a.anchor('spikeMark', 'accent', [SM[0] - .3, H(SM[0], SM[1]) + .05, SM[1]], 'spikeMark', { align: [1, .5], offset: [-14, 0] });
      });
      k.focus([0, .7, -1]);
    });
  };
  V.blown = function (P) {
    var CUP = [-.7, -2.4], O = [.3, .5], B = [.9, 1.2];
    return greenBase(P, function (k) {
      var H = k.H;
      k.flag(CUP[0], CUP[1], { cloth: P.accent });
      k.ring(O, .19, { width: .025, color: P.guide, opacity: .8, unlit: true, dash: [.06, .05] });
      var tr = []; for (var i = 0; i <= 12; i++) { var t = i / 12; tr.push([O[0] + (B[0] - O[0]) * t + .1 * Math.sin(PI * t), O[1] + (B[1] - O[1]) * t]); }
      k.line(tr.slice(2, 11), { width: .025, color: P.guide, opacity: .7, unlit: true, dash: [.08, .06] });
      k.ball(B[0], B[1]);
      k.answer(function (a) {
        a.ring(O, .34, { width: .06 });
        a.anchor('origSpot', 'accent', [O[0] - .3, H(O[0], O[1]) + .05, O[1]], 'origSpot', { align: [1, .5], offset: [-14, 0] });
      });
      k.focus([0, .7, -1]);
    });
  };
  V.overhang = function (P) {
    var CUP = [-.2, -.4];
    return greenBase(P, function (k) {
      var H = k.H;
      k.flag(CUP[0], CUP[1], { cloth: P.accent });
      k.ball(CUP[0] + .19, CUP[1] + .1, { y: H(CUP[0], CUP[1]) + .12 }); /* half over the hole */
      k.answer(function (a) {
        a.ring(CUP, .48, { width: .06 });
        a.anchor('tenSec', 'accent', [CUP[0] + .5, H(CUP[0], CUP[1]) + .05, CUP[1] + .4], 'tenSec', { align: [0, .5], offset: [14, 0] });
      });
      k.focus([CUP[0], 2.8, CUP[1]]);
    });
  };
  V.flagin = function (P) {
    var CUP = [-.2, -.4];
    return greenBase(P, function (k) {
      var H = k.H;
      k.flag(CUP[0], CUP[1], { cloth: P.accent });
      k.ball(CUP[0] + .12, CUP[1] + .1, { y: H(CUP[0], CUP[1]) + .07 }); /* wedged against the stick, partly below the surface */
      k.answer(function (a) {
        a.ring(CUP, .48, { width: .06 });
        a.anchor('holed', 'accent', [CUP[0] + .5, H(CUP[0], CUP[1]) + .05, CUP[1] + .4], 'holed', { align: [0, .5], offset: [14, 0] });
      });
      k.focus([CUP[0], 2.8, CUP[1]]);
    });
  };
  /* sand beside a yellow-staked ditch: two areas, two sets of rules */
  V.bunkerpa = function (P) {
    var S = bunkerShape(-1.1, .5, 2.3, 1.8, .42, -1.5, .32), DX = 2.6, B = [-.8, .3];
    function H(x, z) { return S.H(x, z) - .38 * (1 - sstep(.3, .62, Math.abs(x - DX - .12 * Math.sin(z * .8)))); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) {
        var d = Math.abs(x - DX - .12 * Math.sin(z * .8)), grass = mix(P._fairway, P._rough, .4);
        var c = mix(mix(P._soil, P._rough, .35), grass, sstep(.3, .62, d));
        return mix(P._sand, c, sstep(.93, 1.03, S.E(x, z)));
      },
      build: function (k) {
        var st = []; for (var z = -4.2; z <= 4.3; z += 1.2) { var x = DX + .72 + .12 * Math.sin(z * .8); if (Math.hypot(x, z) < R - .35) st.push([x, z]); }
        k.stakes(st, P.stakeYellow);
        k.ball(B[0], B[1]);
        k.anchor('pa', 'cap', [DX + .2, H(DX + .2, 3.0) + .9, 3.0], 'penaltyArea', { align: [1, 1], offset: [-4, -6] });
        k.answer(function (a) {
          a.ring(B, .42, { width: .06 });
          a.anchor('clubUp', 'accent', [B[0], H(B[0], B[1] + .55), B[1] + .55], 'clubUp', { align: [.5, 0], offset: [0, 10] });
        });
        k.focus([0, .9, -2]);
      }
    };
  };
  /* loose impediments in a bunker: a leaf and a stone behind the ball */
  V.leaves = function (P) {
    var S = bunkerShape(0, .3, 3.3, 2.3, .46, -2.15, .42), B = [.6, -.2];
    return {
      yaw: -16, H: S.H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._sand, mix(P._fairway, P._rough, .35), sstep(.93, 1.03, S.E(x, z))); },
      build: function (k) {
        k.ball(B[0], B[1]);
        var Lf = [B[0] + .15, B[1] + .5], St = [B[0] - .3, B[1] + .45];
        k.add(G.disc({ radius: .16, segments: 14 }), { color: P.trunk, position: [Lf[0], S.H(Lf[0], Lf[1]) + .02, Lf[1]], scale: [1, 1, .55], rotation: [0, 35, 0], layer: 2 });
        k.add(G.icosphere({ radius: .08, detail: 0, flat: true }), { color: css(mix(P._soil, P._shadow, .2)), position: [St[0], S.H(St[0], St[1]) + .04, St[1]], scale: [1.2, .7, 1] });
        k.answer(function (a) {
          a.ring([B[0] - .07, B[1] + .48], .36, { width: .05 });
          a.anchor('removeFree', 'accent', [B[0] - .07, S.H(B[0], B[1] + .9) + .05, B[1] + .9], 'removeFree', { align: [.5, 0], offset: [0, 8] });
        });
        k.focus([0, .9, -2.2]);
      }
    };
  };
  V['embedded-rough'] = function (P, scene, opts, theme) { return V.embedded(P, { detail: 'embedded in the rough' }, { title: 'rough', seed: opts.seed }, theme); };
  /* which picture: the icon, refined by the ruling's own words */
  function variant(icon, key) {
    if (icon === 'other') {
      if (/ground under repair|white line/.test(key)) return 'gur';
      if (/temporary water|water around/.test(key)) return 'tempwater';
      if (/identif|is that one yours/.test(key)) return 'identify';
      if (/caddie/.test(key)) return 'caddie';
      if (/double hit|twice/.test(key)) return 'double';
      if (/wrong ball|someone else/.test(key)) return 'wrongball';
      if (/ball moved|moved my ball/.test(key)) return 'moved';
    } else if (icon === 'green') {
      if (/wrong green/.test(key)) return 'wronggreen';
      if (/damage|fix on the green/.test(key)) return 'damage';
      if (/wind|blown/.test(key)) return 'blown';
      if (/overhang|lip/.test(key)) return 'overhang';
      if (/flagstick/.test(key)) return 'flagin';
    } else if (icon === 'bunker') {
      if (/penalty area/.test(key)) return 'bunkerpa';
      if (/loose impediment|leaves/.test(key)) return 'leaves';
    } else if (icon === 'embedded' && /rough/.test(key)) return 'embedded-rough';
    return icon;
  }

  V.lost = function (P, scene, opts, theme) {
    var B = [.55, -.15], C0 = [.3, -.35];
    function fw(x, z) { return sstep(2.35, 2.75, z + .25 * x); }
    function H(x, z) { return dome(x, z) - .03 * fw(x, z); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(mix(P._rough, P._tree, .3), P._fairway, fw(x, z)); },
      build: function (k) {
        /* deep rough: tufts of thin blades, seeded so the same challenge always grows the same grass */
        var R0 = rng((opts.seed || 1) * 977 + 31), parts = [], blade = G.cone({ radius: .028, height: 1, segments: 3, caps: false });
        var tones = (theme === 'light' ? [mix(P._tree, P._rough, .55), mix(P._tree, P._fairway, .6), mix(P._tree, P._rough, .3)] : [mix(P._tree, P._rough, .25), mix(P._tree, P._fairway, .45), P._tree]).map(css);
        var spots = [];
        for (var i = 0; i < 360; i++) { var a = R0() * 2 * PI, r = Math.sqrt(R0()) * (R - .3); spots.push([Math.sin(a) * r, Math.cos(a) * r]); }
        [[.3, .28], [.7, .3], [.5, .4], [.85, .05]].forEach(function (o) { spots.push([B[0] + o[0] - .5, B[1] + o[1]]); });
        spots.forEach(function (s) {
          if (fw(s[0], s[1]) > .4 || Math.hypot(s[0] - B[0], s[1] - B[1]) < .2) return;
          var y = H(s[0], s[1]), hgt = .32 + R0() * .3, tone = tones[Math.floor(R0() * 3)];
          for (var b = 0; b < 3; b++) parts.push({ geometry: blade, color: tone, position: [s[0] + (R0() - .5) * .08, y - .02, s[1] + (R0() - .5) * .08], rotation: [8 + R0() * 18, R0() * 360, 0], scale: [1, hgt * (.75 + R0() * .4), 1] });
        });
        k.add(G.merge(parts), {});
        k.ball(B[0], B[1]);
        k.ring(C0, 1.65, { width: .04, color: P.guide, opacity: .75, unlit: true, dash: [.22, .16] });
        k.anchor('searchArea', 'cap', [C0[0] - 1.2, H(C0[0] - 1.2, C0[1] + 1.2) + .05, C0[1] + 1.2], 'searchArea', { align: [1, 0], offset: [-2, 8] });
        k.answer(function (a) {
          a.ring(C0, 1.85, { width: .07, draw: 1400 });
          a.anchor('threeMin', 'accent', [C0[0] + 1.85 * Math.sin(.9), H(C0[0] + 1.85 * Math.sin(.9), C0[1] + 1.85 * Math.cos(.9)) + .05, C0[1] + 1.85 * Math.cos(.9)], 'threeMin', { align: [0, 0], offset: [8, 6] });
        });
        k.focus([0, .6, -2]);
      }
    };
  };

  V['cart-path'] = function (P) {
    function xc(z) { return .35 + .55 * Math.sin(.38 * z + .4); }
    function pm(x, z) { return 1 - sstep(.66, .74, Math.abs(x - xc(z))); }
    function H(x, z) { var m = pm(x, z); return dome(x, z) * (1 - .8 * m) + .05 * m; }
    var bz = .75, B = [xc(bz) + .1, bz], N = [xc(bz) + 1.35, bz];
    return {
      yaw: -18, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) {
        var d = x - xc(z), grass = mix(P._fairway, P._rough, sstep(-.3, .3, d));
        var edge = mix(P._path, P._soil, .35), road = mix(edge, P._path, sstep(.6, .52, Math.abs(d)));
        return mix(grass, road, pm(x, z));
      },
      build: function (k) {
        k.ball(B[0], B[1]);
        k.peg(N, P.stakeWhite);
        var g = []; for (var s = 0; s <= 10; s++) { var t = s / 10; g.push([B[0] + (N[0] - B[0]) * t, B[1]]); }
        k.line(g.slice(1, 10), { width: .035, color: P.guide, opacity: .8, unlit: true, dash: [.12, .09] });
        k.anchor('npr', 'cap', [N[0], H(N[0], N[1]) + .45, N[1]], 'npr', { align: [.5, 1], offset: [0, -6] });
        k.answer(function (a) {
          /* within one club-length of that point, no nearer the hole (along −Z), and off the path */
          a.halfDisc(N, 1.0, { clip: function (p) { return [Math.max(p[0], xc(p[1]) + .8), p[1]]; } });
          a.anchor('oneClub', 'accent', [N[0] + .55, H(N[0] + .55, N[1] + 1.05) + .05, N[1] + 1.05], 'oneClub', { align: [.5, 0], offset: [0, 6] });
        });
        k.focus([N[0], .6, N[1]]);
      }
    };
  };

  V.green = function (P) {
    var CUP = [-.55, -.75], B = [.3, -.05];
    function H(x, z) { return dome(x, z) + .06 * Math.sin(.45 * x + .2) * Math.max(0, 1 - (x * x + z * z) / (R * R)); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { var r = Math.hypot(x, z); return mix(mix(P._green, P._fairway, sstep(3.6, 3.75, r)), P._rough, sstep(4.2, 4.35, r)); },
      build: function (k) {
        k.flag(CUP[0], CUP[1], { cloth: P.accent });
        k.ball(B[0], B[1]);
        k.answer(function (a) { a.ring(CUP, .48, { width: .06 }); });
        k.focus([CUP[0], 2.8, CUP[1]]);
      }
    };
  };

  V.tee = function (P) {
    function sd(x, z) { var bx = Math.abs(x) - 2.15, bz = Math.abs(z - .15) - 1.55; return Math.hypot(Math.max(bx, 0), Math.max(bz, 0)) + Math.min(Math.max(bx, bz), 0) - .3; }
    function H(x, z) { var m = 1 - sstep(-.05, .4, sd(x, z)); return dome(x, z) * (1 - m) + (.17 + .3 * dome(x, z)) * m; }
    var M = [[-1.45, -.75], [1.45, -.75]], B = [.2, .3];
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._fairway, P._rough, sstep(-.02, .12, sd(x, z))); },
      build: function (k) {
        k.add(G.merge(M.map(function (m) { return { geometry: G.sphere({ radius: .17, segments: 14, rings: 8 }), color: P.stakeRed, position: [m[0], H(m[0], m[1]) + .12, m[1]], scale: [1, .8, 1] }; })), { spec: [.25, 40] });
        var y = H(B[0], B[1]);
        k.add(G.cylinder({ radiusTop: .035, radiusBottom: .012, height: .16, segments: 8 }), { color: P.ball, position: [B[0], y - .02, B[1]] });
        k.ball(B[0], B[1], { y: y + .14 + .17 });
        k.answer(function (a) {
          /* the teeing area: between the markers' front edge and two club-lengths back */
          var x0 = M[0][0], x1 = M[1][0], z0 = M[0][1], z1 = z0 + 2.0;
          a.rect(x0, z0, x1, z1, {});
          a.anchor('teeingArea', 'accent', [x0, H(x0, z1) + .05, z1], 'teeingArea', { align: [.5, 0], offset: [0, 8] });
        });
        k.focus([0, .7, -1]);
      }
    };
  };

  V.equipment = function (P) {
    var BAG = [.2, -.35], TILT = -13, SC = 1.55; /* the bag is built at life size, then shown larger */
    function H(x, z) { return dome(x, z); }
    return {
      yaw: -20, H: H, water: null, ballR: .17, occ: [{ x: BAG[0] + .3, z: BAG[1] - .5, r: 2.4, k: .5 }],
      C: function (x, z) { return mix(P._fairway, P._rough, sstep(2.6, 3.6, Math.hypot(x, z))); },
      build: function (k) {
        var y0 = H(BAG[0], BAG[1]) - .03, pos = [BAG[0], y0, BAG[1]], rot = [TILT, 0, 0];
        var c = Math.cos(TILT * D2R), s = Math.sin(TILT * D2R);
        function toW(v) { return [pos[0] + SC * v[0], pos[1] + SC * (c * v[1] - s * v[2]), pos[2] + SC * (s * v[1] + c * v[2])]; }
        var ink = mix(P._bag, P._shadow, .35);
        var bag = [
          { geometry: G.cylinder({ radiusTop: .4, radiusBottom: .36, height: 1.45, segments: 22 }), color: P.bag },
          { geometry: G.cylinder({ radius: .43, height: .12, segments: 22 }), color: css(ink), position: [0, 1.36, 0] },
          { geometry: G.cylinder({ radius: .38, height: .16, segments: 22 }), color: css(ink), position: [0, 0, 0] },
          { geometry: G.box({ w: .36, h: .55, d: .1 }), color: css(mix(P._bag, P._ball, .12)), position: [0, .42, .38] }
        ];
        /* the strap, an arc on the back */
        var strap = []; for (var i = 0; i <= 14; i++) { var t = i / 14; strap.push([.0, .35 + t * .8, -.4 - .16 * Math.sin(PI * t)]); }
        bag.push({ geometry: G.tube(strap, { radius: .035, segments: 6 }), color: css(ink) });
        /* fourteen clubs: woods with round heads, irons and a putter with flat ones */
        var slots = [], club = P.club;
        for (var r = 0; r < 2; r++) for (var j = 0; j < (r ? 9 : 6); j++) { var a = (j / (r ? 9 : 6)) * 2 * PI + r * .3, rr = r ? .27 : .13; slots.push([Math.sin(a) * rr, Math.cos(a) * rr]); }
        var front = slots.reduce(function (bi, p, i) { return p[1] > slots[bi][1] ? i : bi; }, 0), extra = slots[front];
        slots.forEach(function (p, i) {
          if (i === front) return;
          var wood = i < 4, top = 1.45 + (wood ? .62 : .32 + (i % 5) * .07);
          bag.push({ geometry: G.cylinder({ radius: .016, height: top - .6, segments: 5 }), color: club, position: [p[0], .6, p[1]] });
          if (wood) bag.push({ geometry: G.sphere({ radius: .1, segments: 10, rings: 6 }), color: css(mix(P._bag, P._shadow, .15)), position: [p[0], top + .04, p[1]], scale: [1.15, .8, 1.05] });
          else bag.push({ geometry: G.box({ w: .15, h: .045, d: .07 }), color: club, position: [p[0] + .05, top - .02, p[1]], rotation: [0, (i * 47) % 180, 0] });
        });
        k.add(G.merge(bag), { position: pos, rotation: rot, scale: SC });
        /* the stand's legs, from the bag's back to the ground */
        var legs = [-1, 1].map(function (sx) {
          var a = toW([sx * .22, .95, -.36]), bx = BAG[0] + sx * .48 * SC, bz = BAG[1] - 1.0 * SC;
          return { geometry: G.tube([a, [bx, H(bx, bz), bz]], { radius: .022 * SC, segments: 5 }), color: css(ink) };
        });
        k.add(G.merge(legs), {});
        /* the fifteenth club, in the lab's lime; answered, it lifts out of the bag */
        var L = 1.45 + .55 - .6, xg = G.merge([
          { geometry: G.cylinder({ radius: .02, height: L, segments: 6 }) },
          { geometry: G.box({ w: .17, h: .05, d: .08 }), position: [.05, L - .02, 0] }
        ]);
        var base = [extra[0], .6, extra[1]], xm = k.add(xg, { position: toW(base), rotation: rot, scale: SC, color: P.accent, emissive: .6 });
        var topW = toW([extra[0], .6 + L + .1, extra[1]]);
        var lab = k.anchor('club15', 'accent', topW.slice(), 'club15', { align: [0, .5], offset: [14, 0] });
        k.answer(function (a) {
          a.motion(function (e) {
            var lift = .6 * e, p = toW([base[0], base[1] + lift, base[2] + .0]);
            k.pose(xm, p, rot);
            lab.base = toW([extra[0], .6 + L + .1 + lift, extra[1]]); k.reanchor(lab);
          });
          a.anchor('outOfPlay', 'cap', toW([extra[0], .6 + L + .1 + .6, extra[1]]), 'outOfPlay', { align: [0, .5], offset: [14, 18] });
        });
        
      }
    };
  };

  V.other = function (P) {
    var M = [-.3, -.55], B = [1.15, .8];
    function H(x, z) { return dome(x, z) + .55 * Math.exp(-(Math.pow(x - M[0], 2) + Math.pow(z - M[1], 2)) / 2.4); }
    return {
      yaw: -16, H: H, water: null, ballR: .17, occ: [],
      C: function (x, z) { return mix(P._fairway, P._rough, sstep(2.2, 3.2, Math.hypot(x - M[0], z - M[1]))); },
      build: function (k) {
        k.flag(M[0], M[1], { cloth: P.accent, cup: false });
        k.ball(B[0], B[1]);
        k.answer(function (a) { a.ring(B, .4, { width: .06 }); });
        k.focus([M[0], H(M[0], M[1]) + 2.6, M[1]]);
      }
    };
  };

  /* ---------- the builder ---------- */
  G.scenes.rule = function (S, scene, opts) {
    opts = opts || {}; scene = scene || {};
    var theme = opts.theme === 'light' ? 'light' : 'dark', P = palette(theme, opts.colors || {});
    var lang = opts.lang === 'es' ? 'es' : 'en', LB = opts.labels || {};
    function text(key) { return LB[key] || TXT[lang][key] || TXT.en[key] || key; }
    var icon = V[scene.icon] ? scene.icon : (scene.icon === 'unplayable' ? 'unplayable' : 'other');
    icon = variant(icon, variantKey(scene, opts));
    var reduced = !!(opts.reduced || S.reduced), answered = !!opts.answered;
    var v = V[icon](P, scene, opts, theme), H = v.H;

    S.setEnvironment({ sky: P.sky, ground: P.ground, hemi: .5, sun: { dir: [-.5, .85, .32], intensity: .62 }, wrap: .35,
      fog: { near: 1.04, far: 1.7, max: theme === 'light' ? .3 : .22 } });

    var group = [], own = [], anchors = [], focus = [], answerFns = [], answerMeshes = [], motions = [];
    var yawNow = 0;
    function rotP(p, deg) { var c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
    function apply(e) { e.m.position = rotP(e.p, yawNow); e.m.rotation = [e.r[0], e.r[1] + yawNow, e.r[2]]; }
    function add(g, mo) {
      mo = mo || {}; var m = S.add(g, mo), e = { m: m, p: (mo.position || [0, 0, 0]).slice(), r: (mo.rotation || [0, 0, 0]).slice() };
      m._e = e; group.push(e); own.push(m); apply(e); return m;
    }
    function reanchor(a) { if (a.fixed) return; var w = rotP(a.base, yawNow); a.world[0] = w[0]; a.world[1] = w[1]; a.world[2] = w[2]; }
    function spin(deg) { yawNow = deg; group.forEach(apply); anchors.forEach(reanchor); S.invalidate(); }
    var lift = .015;
    function gpt(p, y) { return [p[0], y != null ? y : H(p[0], p[1]) + lift, p[1]]; }

    /* ground: a polar grid, so the puck's rim is a true circle; analytic normals, cavity AO and soft contact shadows */
    (function ground() {
      var Pp = [], N = [], C = [], I = [], occ = v.occ || [];
      function vert(x, z) {
        var y = H(x, z), e = .03, q = .26;
        var n = norm([-(H(x + e, z) - H(x - e, z)) / (2 * e), 1, -(H(x, z + e) - H(x, z - e)) / (2 * e)]);
        var cav = (H(x + q, z) + H(x - q, z) + H(x, z + q) + H(x, z - q) - 4 * y) / (q * q), sh = 1 - clamp(cav * .09, 0, .38);
        for (var i = 0; i < occ.length; i++) { var o = occ[i], t = 1 - Math.hypot(x - o.x, z - o.z) / o.r; if (t > 0) sh *= 1 - o.k * t * t * (3 - 2 * t); }
        sh *= 1 - .12 * sstep(R - .5, R, Math.hypot(x, z)); /* a hint of darkening toward the cut edge */
        var c = v.C(x, z, y);
        Pp.push(x, y, z); N.push(n[0], n[1], n[2]); C.push(Math.pow(c[0], 2.2) * sh, Math.pow(c[1], 2.2) * sh, Math.pow(c[2], 2.2) * sh, 1);
      }
      vert(0, 0);
      for (var i = 1; i <= NR; i++) { var r = R * i / NR; for (var s = 0; s < NS; s++) { var a = s / NS * 2 * PI; vert(Math.sin(a) * r, Math.cos(a) * r); } }
      for (s = 0; s < NS; s++) I.push(0, 1 + s, 1 + (s + 1) % NS);
      for (i = 1; i < NR; i++) {
        var b0 = 1 + (i - 1) * NS, b1 = b0 + NS;
        for (s = 0; s < NS; s++) { var n1 = (s + 1) % NS; I.push(b0 + s, b1 + s, b0 + n1, b0 + n1, b1 + s, b1 + n1); }
      }
      add(mk(Pp, N, I, C), {});

      /* the soil edge, with the water's cross-section where a hazard reaches the rim */
      var W = [], WN = [], WC = [], WI = [], soil = P._soil, dark = mix(P._soil, P._shadow, .45), wat = mix(P._water, P._soil, .2);
      function lc(c) { return [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2), 1]; }
      for (s = 0; s < NS; s++) {
        var a2 = s / NS * 2 * PI, x = Math.sin(a2) * R, z = Math.cos(a2) * R, gy = H(x, z), ty = v.water != null ? Math.max(gy, v.water) : gy;
        [[-WALL, dark], [gy, soil], [gy, wat], [ty, wat]].forEach(function (q) { W.push(x, q[0], z); WN.push(Math.sin(a2), 0, Math.cos(a2)); Array.prototype.push.apply(WC, lc(q[1])); });
      }
      for (s = 0; s < NS; s++) {
        var A = s * 4, Bn = ((s + 1) % NS) * 4;
        WI.push(A, Bn, A + 1, A + 1, Bn, Bn + 1);
        WI.push(A + 2, Bn + 2, A + 3, A + 3, Bn + 2, Bn + 3);
      }
      add(mk(W, WN, WI, WC), {});
      /* a soft shadow under the puck, falling away from the sun */
      add(G.blob({ radius: 1, fade: .55 }), { color: P.shadow, opacity: theme === 'light' ? .2 : .55, transparent: true, unlit: true, position: [.35, -WALL - .01, -.15], scale: [R * 1.1, 1, R * 1.06], order: -1 });
      if (v.water != null) add(G.disc({ radius: R - .004, segments: NS }), { color: P.water, position: [0, v.water, 0], spec: [.35, 60], opacity: .9, emissive: .08 });
    })();

    /* ---------- the kit the vignettes build with ---------- */
    function ribbonPts(pts, y) { return pts.map(function (p) { return gpt(p, typeof y === 'function' ? y(p) : y); }); }
    function circle(c, r, n) { var o = []; for (var i = 0; i <= n; i++) { var a = i / n * 2 * PI; o.push([c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r]); } return o; }
    function lineMesh(pts, o) {
      o = o || {};
      var g = G.ribbon(ribbonPts(pts, o.y), { width: o.width || .05, dash: o.dash });
      return add(g, { color: o.color || P.accent, opacity: o.opacity == null ? 1 : o.opacity, transparent: o.opacity != null && o.opacity < 1,
        unlit: !!o.unlit, emissive: o.unlit ? 0 : (o.emissive == null ? .6 : o.emissive), layer: 2 });
    }
    function fan(center, ring, o) { /* a filled area following the ground */
      var c = gpt(center, H(center[0], center[1]) + .012), Pp = [c[0], c[1], c[2]], N = [0, 1, 0], I = [];
      ring.forEach(function (p) { var q = gpt(p, H(p[0], p[1]) + .012); Pp.push(q[0], q[1], q[2]); N.push(0, 1, 0); });
      for (var i = 1; i < ring.length; i++) I.push(0, i, i + 1);
      return add(mk(Pp, N, I), { color: o.color || P.accent, opacity: o.opacity || .2, transparent: true, unlit: true, doubleSided: true, layer: 1 });
    }
    var k = {
      H: H, add: add, line: lineMesh,
      ring: function (c, r, o) { return lineMesh(circle(c, r, 72), o); },
      ball: function (x, z, o) {
        o = o || {}; var r = o.r || v.ballR, y = o.y != null ? o.y : H(x, z) + r;
        var m = add(G.sphere({ radius: 1, segments: 18, rings: 12 }), { color: P.ball, spec: [.4, 40], position: [x, y, z], scale: r });
        if (o.shadow !== false) add(G.blob({ radius: 1, fade: .8 }), { color: P.shadow, opacity: theme === 'light' ? .3 : .5, transparent: true, unlit: true, layer: 3, position: [x + r * .3, H(x, z) + .012, z - r * .1], scale: [r * 1.7, 1, r * 1.5] });
        k.focus([x, y + r, z]);
        return m;
      },
      stakes: function (pts, color) {
        if (!pts.length) return null;
        return add(G.merge(pts.map(function (p) { return { geometry: G.box({ w: .1, h: .9, d: .1 }), color: color, position: [p[0], H(p[0], p[1]) - .04, p[1]] }; })), {});
      },
      peg: function (p, color) { /* a tee peg pushed into the ground: the marker for a reference point */
        return add(G.merge([{ geometry: G.cylinder({ radiusTop: .05, radiusBottom: .015, height: .26, segments: 8 }), color: color || P.accent },
          { geometry: G.cylinder({ radius: .075, height: .03, segments: 12 }), color: color || P.accent, position: [0, .26, 0] }]),
        { position: [p[0], H(p[0], p[1]) - .03, p[1]], emissive: color ? 0 : .55 });
      },
      flag: function (x, z, o) {
        o = o || {}; var y = H(x, z), hgt = 2.35;
        if (o.cup !== false) add(G.disc({ radius: .17, segments: 20 }), { color: P.cup, unlit: true, layer: 2, position: [x, y + .012, z] });
        add(G.cylinder({ radius: .035, height: hgt, segments: 8 }), { color: P.ball, position: [x, y - .05, z] });
        add(G.quad({ w: .8, h: .5, segX: 10, segY: 2, origin: [0, 1] }), { color: o.cloth || P.accent, position: [x + .03, y + hgt - .05, z], doubleSided: true,
          emissive: o.emissive == null ? .55 : o.emissive, wave: { amp: .09, waves: 1.1, speed: 4.5 } });
        k.focus([x + .85, y + hgt, z]);
      },
      /* trace a parametric curve and keep the runs that lie on the puck */
      contour: function (f, t0, t1, n) {
        var runs = [], cur = null;
        for (var i = 0; i <= n; i++) { var p = f(t0 + (t1 - t0) * i / n); if (Math.hypot(p[0], p[1]) < R - .32) { if (!cur) runs.push(cur = []); cur.push(p); } else cur = null; }
        return runs.filter(function (r) { return r.length > 2; });
      },
      /* evenly spaced points along a polyline, starting half a gap in */
      along: function (pts, gap, start) {
        var out = [], acc = gap - (start || gap / 2);
        for (var i = 1; i < pts.length; i++) {
          var a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = 0;
          while (acc + (L - t) >= gap) { t += gap - acc; acc = 0; var u = t / L; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
          acc += L - t;
        }
        return out;
      },
      anchor: function (id, kind, world, key, o) {
        o = o || {};
        var a = { id: id, kind: kind, phase: o.phase || 'always', world: world.slice(), base: world.slice(), key: key, label: text(key), align: o.align || [.5, .5], offset: o.offset || [0, 0] };
        anchors.push(a); reanchor(a); focus.push(a.base); return a;
      },
      reanchor: reanchor,
      pose: function (m, p, r) { m._e.p = p.slice(); m._e.r = r.slice(); apply(m._e); S.invalidate(); },
      focus: function (p) { focus.push(p); },
      answer: function (fn) { answerFns.push(fn); }
    };
    v.build(k);

    /* the answered layer: built once, hidden until answered; drawn in when it is revealed */
    var answerKit = {
      ring: function (c, r, o) { o = o || {}; var m = lineMesh(circle(c, r, 72), { width: o.width || .06 }); m._draw = o.draw || 900; answerMeshes.push(m); return m; },
      line: function (pts, o) { o = o || {}; var m = lineMesh(pts, { width: o.width || .06, dash: o.dash }); m._draw = o.draw || 900; answerMeshes.push(m); return m; },
      peg: function (p) { var m = k.peg(p); m._pop = 1; answerMeshes.push(m); return m; },
      halfDisc: function (c, r, o) { /* a relief area: within r of c, on the side away from the hole (+Z) */
        var pts = [], clip = o.clip || function (p) { return p; };
        for (var i = 0; i <= 48; i++) { var a = -PI / 2 + i / 48 * PI; pts.push(clip([c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r])); }
        pts = pts.map(function (p) { var d = Math.hypot(p[0], p[1]); return d > R - .15 ? [p[0] * (R - .15) / d, p[1] * (R - .15) / d] : p; });
        var f = fan(c, pts, {}); f._fade = .2; answerMeshes.push(f);
        var m = lineMesh(pts, { width: .055 }); m._draw = 900; answerMeshes.push(m);
        var dia = lineMesh([clip([c[0] - r, c[1]]), c, clip([c[0] + r, c[1]])], { width: .04, dash: [.14, .1] }); dia._draw = 600; answerMeshes.push(dia);
      },
      rect: function (x0, z0, x1, z1, o) {
        var ring = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], pts = [];
        for (var i = 1; i < ring.length; i++) for (var s = 0; s < 16; s++) { var t = s / 16, a = ring[i - 1], b = ring[i]; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        pts.push(ring[4]);
        var f = fan([(x0 + x1) / 2, (z0 + z1) / 2], pts, {}); f._fade = .2; answerMeshes.push(f);
        var m = lineMesh(pts, { width: .055, dash: [.2, .12] }); m._draw = 1100; answerMeshes.push(m);
      },
      area: function (c, ring, o) { var f = fan(c, ring, o || {}); f._fade = .2; answerMeshes.push(f); return f; },
      motion: function (fn) { motions.push(fn); },
      anchor: function (id, kind, world, key, o) { o = o || {}; o.phase = 'answered'; return k.anchor(id, kind, world, key, o); }
    };
    answerFns.forEach(function (fn) { fn(answerKit); });
    function setAnswered(on, animate) {
      answerMeshes.forEach(function (m) { m.visible = on; if (m._fade) m.opacity = m._fade; if (m._draw) m.reveal = 1; if (m._pop) m.scale = 1; });
      motions.forEach(function (fn) { fn(on ? 1 : 0); });
      S.invalidate();
      if (!on || !animate || reduced || S.reduced) return Promise.resolve();
      var waits = [];
      answerMeshes.forEach(function (m) {
        if (m._draw) waits.push(S.drawAlong(m, { duration: m._draw, easing: 'inOut' }).done);
        else if (m._fade) { m.opacity = 0; waits.push(S.tween(700, 'out', function (e) { m.opacity = m._fade * e; }, { delay: 250 }).done); }
        else if (m._pop) { m.scale = .001; waits.push(S.tween(600, 'out', function (e) { m.scale = Math.max(.001, e); }).done); }
      });
      motions.forEach(function (fn) { fn(0); waits.push(S.tween(1000, 'inOut', function (e) { fn(e); }).done); });
      return Promise.all(waits);
    }
    setAnswered(answered, false);

    /* the plaque: the detail text, under the puck's front edge */
    var detail = opts.detail || scene.detail || '';
    var py = v.yaw * D2R, pq = [Math.sin(py) * R, -WALL, Math.cos(py) * R];
    var plaque = { id: 'detail', kind: 'detail', phase: 'always', world: pq.slice(), base: pq, key: 'detail', fixed: true, label: detail, align: [.5, 0], offset: [0, 12] };
    anchors.unshift(plaque);

    /* framing: the whole puck plus the tall props, at both ends of the turntable's swing */
    var AMP = 13, HEAD = 2.55, pts = [];
    /* every vignette gets the same box: the puck, plus a fixed headroom over its centre, so the pucks
       read at one size across challenges; only a prop taller than the headroom widens the shot */
    for (var i = 0; i < 24; i++) { var a = i / 24 * 2 * PI; pts.push([Math.sin(a) * R, .15, Math.cos(a) * R], [Math.sin(a) * R, -WALL, Math.cos(a) * R], [Math.sin(a) * R * .45, HEAD, Math.cos(a) * R * .3 - .8]); }
    focus.forEach(function (p) { [-AMP, 0, AMP].forEach(function (d) { pts.push(rotP(p, d)); }); });
    S.frame(pts, { yaw: function (asp) { return v.yaw + (asp < 1.25 ? 4 : 0); }, pitch: function (asp) { return asp < 1.25 ? 36 : 27; }, fov: 28,
      padding: function (asp) { return asp < 1.25 ? { top: 22, right: 14, bottom: 44, left: 14 } : { top: 22, right: 28, bottom: 46, left: 28 }; } });

    /* gentle turntable: a slow sway either side of the home view, then it settles; any drag takes over */
    var tt = null, PERIOD = 12000, RUN = PERIOD; /* one slow sway, then still */
    function turntable() {
      if (reduced || S.reduced || tt) return;
      var t = 0;
      tt = S.loop(function (dt) {
        t += dt; var env = sstep(0, 2200, t) * (1 - sstep(RUN - 3500, RUN, t));
        spin(AMP * Math.sin(2 * PI * t / PERIOD) * env);
        if (t >= RUN) { spin(0); tt = null; return false; }
      });
    }
    function stopTurntable() {
      if (!tt) return; tt.stop(); tt = null;
      var y0 = yawNow; S.tween(700, 'out', function (e) { spin(y0 * (1 - e)); });
    }
    if (opts.orbit !== false) S.orbit({ yaw: [-28, 28], pitch: [-6, 12], returnAfter: 2600, onStart: stopTurntable });
    turntable();

    var self = {
      anchors: anchors,
      description: (DESC[lang][icon] || DESC.en[icon]),
      icon: icon,
      /* the app's language changed: the same vignette, new words */
      relabel: function (o) {
        o = o || {}; if (o.lang) lang = o.lang === 'es' ? 'es' : 'en';
        if (o.labels) LB = o.labels;
        anchors.forEach(function (a) { if (a.kind !== 'detail' && a.key) a.label = text(a.key); else if (a.kind === 'detail' && o.detail != null) a.label = o.detail; });
        self.description = DESC[lang][icon] || DESC.en[icon];
      },
      /* the entrance: a short fly-in; with the answer showing, its accents draw in as well */
      animateReveal: function () {
        var f = S.flyIn({ yaw: -16, pitch: 7, zoom: 1.12, duration: 1300 }).done || Promise.resolve();
        return f.then(function () { return answered ? setAnswered(true, true) : null; });
      },
      /* {answered, correct}: answering draws the ruling's accent in (instant under reduced motion) */
      update: function (o) {
        o = o || {};
        if (o.answered != null && !!o.answered !== answered) { answered = !!o.answered; return setAnswered(answered, true); }
        return Promise.resolve();
      },
      dispose: function () { if (tt) tt.stop(); tt = null; own.forEach(function (m) { m.remove(); }); own = []; group = []; }
    };
    return self;
  };
})(typeof window !== 'undefined' ? window : this);
