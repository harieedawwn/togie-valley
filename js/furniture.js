/* Togie Valley - furniture.js (Stage 16 H1a): decor catalog (32 hand-built models), decor inventory, projected SVG icons.
 * Works in node (no THREE needed): models are plain part lists [shape, color, x, y, z, w, h, d, rx, ry, rz]
 *   shape b = box (w,h,d), c = cylinder (w = diameter, h), k = tapered cylinder (w = bottom diameter, top = 0.6 w), s = ellipsoid (w,h,d = full axes).
 * Local frame: footprint centred on x/z = 0, floor at y = 0, front faces +z. Wall items: centred on y = 0, back plane z = 0, `mountY` = height on the wall.
 * API: Furniture.CATS, ITEMS, get(id), byCat(cat), parts(id), geometry(id) (shared merged, THREE only), mesh(id), count(id), owned(), add(id,n), remove(id,n),
 *   price(id), sellPrice(id), buy(id) -> {ok, reason?}, giveAll(n). Icons.decor(id, px). Events: furniture:changed {id,n}, furniture:bought {id,cost}.
 * Save key `furniture`: {v:1, inv:{id:n}} (placements are added by the placement stage). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Save || !G.State) { console.error('[furniture] missing deps'); return; }
  var E = G.Events, PI = Math.PI;
  var F = G.Furniture = { CATS: [], ITEMS: [], stats: null };

  var C = { wood: 0xc98b4f, wood2: 0xd9a066, wood3: 0xa8693a, brown: 0x7a5236, cream: 0xf4e9d2, white: 0xfff8ea, red: 0xd9825b, red2: 0xc4604a, pink: 0xf2a1b3, pink2: 0xe98aa3,
    blue: 0x7fb2d9, blue2: 0x5f8fc4, sky: 0xbfe3f2, green: 0x5fb86a, green2: 0x8fd18a, leaf: 0x4e9f5a, yellow: 0xffd166, terra: 0xc9785a, terra2: 0xb5654a, stone: 0xb7b2a6,
    stone2: 0x9a958b, iron: 0x4a3f48, purple: 0xb79cf2, gold: 0xe9b84a, teal: 0x6fa8a0, teal2: 0x8cc2b8, sand: 0xe3cf9d, rope: 0xd8c08a, skin: 0xf2c7a0, water: 0xa8d8ee };
  function B(c, x, y, z, w, h, d, rx, ry, rz) { return ['b', c, x, y, z, w, h, d, rx || 0, ry || 0, rz || 0]; }
  function Cy(c, x, y, z, dia, h, rx, ry, rz) { return ['c', c, x, y, z, dia, h, dia, rx || 0, ry || 0, rz || 0]; }
  function K(c, x, y, z, dia, h, rx, ry, rz) { return ['k', c, x, y, z, dia, h, dia, rx || 0, ry || 0, rz || 0]; }
  function S(c, x, y, z, dx, dy, dz, rx, ry, rz) { return ['s', c, x, y, z, dx, dy == null ? dx : dy, dz == null ? dx : dz, rx || 0, ry || 0, rz || 0]; }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function ring(L, n, r, fn) { var i, a; for (i = 0; i < n; i++) { a = i / n * PI * 2; fn(Math.cos(a) * r, Math.sin(a) * r, a, i); } }

  /* ------------------------------------------------------------------ models (one hand-built function per item) */
  var M = {};
  M.bed_single = function () {
    var L = [];
    [[-0.42, -0.93], [0.42, -0.93], [-0.42, 0.93], [0.42, 0.93]].forEach(function (p) { L.push(B(C.wood3, p[0], 0.1, p[1], 0.09, 0.2, 0.09)); });
    L.push(B(C.wood, 0, 0.24, 0, 0.96, 0.14, 1.96), B(C.cream, 0, 0.4, 0.04, 0.86, 0.18, 1.78), B(C.blue, 0, 0.5, 0.36, 0.9, 0.08, 1.2), B(C.blue2, 0, 0.535, -0.2, 0.92, 0.05, 0.16),
      S(C.white, 0, 0.53, -0.68, 0.62, 0.2, 0.4), B(C.wood3, 0, 0.62, -0.97, 0.96, 0.76, 0.07), S(C.wood2, -0.4, 1.03, -0.97, 0.11), S(C.wood2, 0.4, 1.03, -0.97, 0.11), B(C.wood, 0, 0.4, 0.97, 0.96, 0.3, 0.06));
    return L;
  };
  M.bed_double = function () {
    var L = [];
    [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].forEach(function (p) { L.push(Cy(C.wood3, p[0], 0.06, p[1], 0.13, 0.12)); });
    L.push(B(C.wood2, 0, 0.2, 0, 1.96, 0.2, 1.96), B(C.cream, 0, 0.38, 0.02, 1.84, 0.2, 1.84), B(C.pink, 0, 0.5, 0.34, 1.88, 0.1, 1.3), B(C.white, -0.5, 0.56, 0.34, 0.12, 0.012, 1.28), B(C.white, 0.5, 0.56, 0.34, 0.12, 0.012, 1.28),
      B(C.yellow, 0, 0.56, 0.86, 1.8, 0.1, 0.22), S(C.white, -0.45, 0.56, -0.62, 0.8, 0.24, 0.46), S(C.white, 0.45, 0.56, -0.62, 0.8, 0.24, 0.46), B(C.blue, 0, 0.66, -0.4, 0.36, 0.3, 0.12, -0.4, 0, 0),
      B(C.wood3, 0, 0.8, -0.96, 1.96, 1.1, 0.1), S(C.wood3, 0, 1.36, -0.96, 1.4, 0.4, 0.1), Cy(C.wood3, -0.98, 0.78, -0.96, 0.12, 1.56), Cy(C.wood3, 0.98, 0.78, -0.96, 0.12, 1.56), S(C.gold, -0.98, 1.6, -0.96, 0.15), S(C.gold, 0.98, 1.6, -0.96, 0.15));
    return L;
  };
  /* Old mattress (1x2, head at -z): stage 0 clean blue .. 3 torn. Colour fades, the middle slab sags, stage 2 gets a stain + patch, stage 3 a torn corner with a stuffing tuft. One merged part list per stage. */
  var MAT = { col: [0x7fb2d9, 0x92b3cc, 0xa0aeb8, 0x9a9792], sag: [0, 0.02, 0.06, 0.09] };
  M.mattress_old = function (stage) {
    var s = Math.max(0, Math.min(3, stage | 0)), c = MAT.col[s], g = MAT.sag[s], mh = 0.2 - g, L = [];
    L.push(B(c, 0, 0.15, -0.64, 0.88, 0.2, 0.62), B(c, 0, 0.05 + mh / 2, 0, 0.88, mh, 0.68), B(c, 0, 0.15, 0.64, 0.88, 0.2, 0.62), B(C.cream, 0, 0.257, -0.64, 0.8, 0.014, 0.5), S(s > 1 ? C.stone : C.white, 0, 0.3, -0.68, 0.5, 0.12, 0.3), B(C.cream, 0, 0.15 - g / 2, 0.96, 0.9, 0.12, 0.02));
    if (s >= 2) L.push(B(0x7d6a52, 0.14, 0.253 - g, 0.04, 0.3, 0.012, 0.32), B(C.sand, -0.2, 0.2615, -0.38, 0.26, 0.012, 0.26), B(C.brown, -0.2, 0.269, -0.38, 0.2, 0.004, 0.02));
    if (s >= 3) L.push(B(C.iron, 0.3, 0.255, 0.78, 0.26, 0.014, 0.22, 0, 0.5, 0), S(C.white, 0.3, 0.29, 0.8, 0.2, 0.1, 0.16));
    else if (s === 2) L.push(S(C.white, 0.34, 0.27, 0.84, 0.1, 0.05, 0.08));
    return L;
  };
  M.chair_wood = function () {
    var L = [];
    [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(function (p) { L.push(B(C.wood3, p[0], 0.22, p[1], 0.06, 0.44, 0.06)); });
    L.push(B(C.wood2, 0, 0.46, 0, 0.5, 0.06, 0.5), B(C.wood3, -0.21, 0.82, -0.22, 0.06, 0.72, 0.06), B(C.wood3, 0.21, 0.82, -0.22, 0.06, 0.72, 0.06), B(C.wood, 0, 0.7, -0.22, 0.34, 0.05, 0.04), B(C.wood, 0, 0.86, -0.22, 0.34, 0.05, 0.04), B(C.wood2, 0, 1.14, -0.22, 0.48, 0.1, 0.05));
    return L;
  };
  M.chair_cushion = function () {
    var L = [];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { L.push(B(C.wood3, p[0] * 0.19, 0.22, p[1] * 0.19, 0.05, 0.46, 0.05, -p[1] * 0.12, 0, p[0] * 0.12)); });
    L.push(B(C.wood, 0, 0.44, 0, 0.5, 0.06, 0.5), B(C.red, 0, 0.52, 0.02, 0.44, 0.09, 0.44), S(C.yellow, 0, 0.575, 0.02, 0.06, 0.04, 0.06), B(C.wood3, 0, 0.88, -0.23, 0.46, 0.66, 0.05), B(C.pink, 0, 0.86, -0.2, 0.34, 0.5, 0.04), S(C.wood3, 0, 1.2, -0.23, 0.46, 0.14, 0.05));
    return L;
  };
  M.stool = function () {
    var L = [];
    [0, 1, 2].forEach(function (i) { var a = i * 2.094 + 0.5, cx = Math.cos(a), cz = Math.sin(a); L.push(B(C.wood3, cx * 0.13, 0.22, cz * 0.13, 0.05, 0.46, 0.05, -cz * 0.2, 0, cx * 0.2)); });
    L.push(Cy(C.wood3, 0, 0.2, 0, 0.3, 0.03), Cy(C.wood2, 0, 0.46, 0, 0.42, 0.07), S(C.yellow, 0, 0.51, 0, 0.38, 0.1, 0.38));
    return L;
  };
  M.armchair = function () {
    return [B(C.wood3, -0.38, 0.07, -0.32, 0.08, 0.14, 0.08), B(C.wood3, 0.38, 0.07, -0.32, 0.08, 0.14, 0.08), B(C.wood3, -0.38, 0.07, 0.32, 0.08, 0.14, 0.08), B(C.wood3, 0.38, 0.07, 0.32, 0.08, 0.14, 0.08),
      B(C.teal, 0, 0.3, 0, 0.9, 0.28, 0.82), B(C.cream, 0, 0.48, 0.06, 0.56, 0.14, 0.6), B(C.teal, 0, 0.74, -0.34, 0.86, 0.62, 0.16), S(C.teal, 0, 1.04, -0.34, 0.86, 0.22, 0.18),
      Cy(C.teal2, -0.4, 0.62, 0.04, 0.2, 0.66, PI / 2), Cy(C.teal2, 0.4, 0.62, 0.04, 0.2, 0.66, PI / 2), B(C.pink, 0.2, 0.7, -0.2, 0.26, 0.26, 0.09, -0.3, 0.4, 0)];
  };
  M.sofa = function () {
    var L = [B(C.wood3, -0.86, 0.06, -0.32, 0.09, 0.12, 0.09), B(C.wood3, 0.86, 0.06, -0.32, 0.09, 0.12, 0.09), B(C.wood3, -0.86, 0.06, 0.32, 0.09, 0.12, 0.09), B(C.wood3, 0.86, 0.06, 0.32, 0.09, 0.12, 0.09),
      B(C.terra, 0, 0.3, 0, 1.96, 0.3, 0.86), B(C.terra, 0, 0.74, -0.34, 1.96, 0.6, 0.2), Cy(C.terra, 0, 1.04, -0.34, 0.2, 1.96, 0, 0, PI / 2),
      B(C.terra2, -0.92, 0.62, 0.04, 0.16, 0.5, 0.74), B(C.terra2, 0.92, 0.62, 0.04, 0.16, 0.5, 0.74), Cy(C.terra2, -0.92, 0.88, 0.04, 0.16, 0.74, PI / 2), Cy(C.terra2, 0.92, 0.88, 0.04, 0.16, 0.74, PI / 2),
      B(C.sand, -0.43, 0.52, 0.1, 0.82, 0.16, 0.6), B(C.sand, 0.43, 0.52, 0.1, 0.82, 0.16, 0.6), B(C.cream, -0.45, 0.8, -0.18, 0.8, 0.4, 0.14, -0.22, 0, 0), B(C.cream, 0.45, 0.8, -0.18, 0.8, 0.4, 0.14, -0.22, 0, 0),
      B(C.blue, 0.7, 0.7, 0.0, 0.28, 0.28, 0.1, -0.2, 0.5, 0), B(C.yellow, -0.72, 0.7, 0.0, 0.24, 0.24, 0.1, -0.2, -0.4, 0)];
    return L;
  };
  M.table_round = function () {
    return [K(C.wood3, 0, 0.06, 0, 0.5, 0.12), Cy(C.wood3, 0, 0.38, 0, 0.12, 0.72), Cy(C.wood2, 0, 0.74, 0, 0.86, 0.06), Cy(C.cream, 0, 0.775, 0, 0.5, 0.012),
      S(C.blue, 0, 0.87, 0, 0.14, 0.18, 0.14), B(C.green, 0, 1.0, 0, 0.02, 0.14, 0.02), S(C.pink, 0, 1.1, 0, 0.11, 0.08, 0.11), S(C.yellow, 0.06, 1.05, 0, 0.07, 0.06, 0.07), S(C.white, -0.06, 1.05, 0.02, 0.07, 0.06, 0.07)];
  };
  M.table_square = function () {
    var L = [];
    [[-0.84, -0.36], [0.84, -0.36], [-0.84, 0.36], [0.84, 0.36]].forEach(function (p) { L.push(B(C.wood3, p[0], 0.36, p[1], 0.08, 0.72, 0.08)); });
    L.push(B(C.wood, 0, 0.22, -0.36, 1.6, 0.04, 0.05), B(C.wood, 0, 0.22, 0.36, 1.6, 0.04, 0.05), B(C.wood2, 0, 0.74, 0, 1.94, 0.07, 0.9), B(C.red, 0, 0.785, 0, 0.5, 0.015, 0.86), B(C.cream, 0, 0.795, 0, 0.08, 0.012, 0.86),
      Cy(C.white, -0.6, 0.79, 0.16, 0.3, 0.02), Cy(C.blue2, -0.6, 0.805, 0.16, 0.18, 0.012), K(C.sand, 0.62, 0.84, -0.02, 0.32, 0.13), S(C.red, 0.57, 0.92, -0.03, 0.11), S(C.yellow, 0.68, 0.92, 0.01, 0.1), S(C.green2, 0.62, 0.95, -0.06, 0.09));
    return L;
  };
  M.desk = function () {
    var L = [B(C.wood2, 0, 0.77, 0, 1.94, 0.06, 0.82), B(C.wood, -0.62, 0.37, 0, 0.6, 0.72, 0.74), B(C.wood3, 0.9, 0.37, 0, 0.06, 0.72, 0.74), B(C.wood3, 0.3, 0.4, -0.34, 1.2, 0.5, 0.03)];
    [0.6, 0.38, 0.17].forEach(function (y) { L.push(B(C.wood2, -0.62, y, 0.38, 0.52, 0.18, 0.025), S(C.gold, -0.62, y, 0.405, 0.06, 0.06, 0.04)); });
    L.push(B(C.blue2, 0.55, 0.84, -0.12, 0.34, 0.08, 0.26), B(C.red, 0.55, 0.91, -0.12, 0.3, 0.07, 0.24, 0, 0.3, 0), B(C.yellow, 0.05, 0.81, 0.14, 0.3, 0.02, 0.22, 0, 0.2, 0),
      Cy(C.terra, -0.62, 0.86, -0.22, 0.13, 0.14), B(C.yellow, -0.64, 0.98, -0.22, 0.02, 0.16, 0.02, 0, 0, 0.2), B(C.red2, -0.58, 0.98, -0.22, 0.02, 0.16, 0.02, 0, 0, -0.2), S(C.green, 0.85, 0.88, 0.2, 0.18, 0.14, 0.18));
    return L;
  };
  M.coffee_table = function () {
    var L = [];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { L.push(Cy(C.wood3, p[0] * 0.34, 0.15, p[1] * 0.2, 0.07, 0.3)); });
    L.push(B(C.wood, 0, 0.1, 0, 0.6, 0.03, 0.36), B(C.wood3, 0, 0.31, 0, 0.84, 0.05, 0.54), B(C.sky, 0, 0.345, 0, 0.74, 0.03, 0.44),
      S(C.red, -0.12, 0.44, 0, 0.2, 0.16, 0.2), S(C.red2, -0.12, 0.54, 0, 0.1, 0.07, 0.1), B(C.red, -0.01, 0.46, 0, 0.1, 0.03, 0.03, 0, 0, 0.6), Cy(C.white, 0.18, 0.385, 0.1, 0.1, 0.06), Cy(C.white, 0.18, 0.385, -0.1, 0.1, 0.06));
    return L;
  };
  M.nightstand = function () {
    var L = [];
    [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16]].forEach(function (p) { L.push(B(C.wood3, p[0], 0.07, p[1], 0.05, 0.14, 0.05)); });
    L.push(B(C.wood2, 0, 0.38, 0, 0.46, 0.5, 0.4), B(C.wood, 0, 0.65, 0, 0.54, 0.04, 0.48), B(C.wood, 0, 0.5, 0.205, 0.38, 0.18, 0.02), B(C.wood, 0, 0.26, 0.205, 0.38, 0.18, 0.02), S(C.gold, 0, 0.5, 0.23, 0.05, 0.05, 0.04), S(C.gold, 0, 0.26, 0.23, 0.05, 0.05, 0.04),
      B(C.red, -0.12, 0.74, 0, 0.14, 0.12, 0.08), S(C.cream, -0.12, 0.745, 0.045, 0.08, 0.08, 0.02), B(C.blue2, 0.1, 0.69, 0.02, 0.2, 0.04, 0.15, 0, 0.3, 0), B(C.yellow, 0.1, 0.73, 0.02, 0.17, 0.035, 0.13, 0, 0.15, 0));
    return L;
  };
  M.bookshelf = function () {
    var L = [B(C.wood3, -0.44, 0.85, -0.05, 0.06, 1.7, 0.36), B(C.wood3, 0.44, 0.85, -0.05, 0.06, 1.7, 0.36), B(C.wood, 0, 0.85, -0.2, 0.82, 1.7, 0.03)], r = rng(77), cols = [C.red, C.blue2, C.green, C.yellow, C.purple, C.pink2, C.teal, C.terra], rows = [0.05, 0.45, 0.85, 1.25, 1.65];
    rows.forEach(function (y, ri) {
      L.push(B(C.wood2, 0, y, -0.05, 0.82, 0.05, 0.36));
      if (ri > 3) return;
      var x = -0.36, n = 0, h, w;
      while (x < 0.34 && n < 8) { h = 0.22 + r() * 0.12; w = 0.05 + r() * 0.05; if (ri === 1 && n === 5) { L.push(B(cols[(r() * 8) | 0], x + 0.1, y + 0.02 + 0.2, -0.05, w, h, 0.2, 0, 0, 0.35)); x += 0.2; n++; continue; }
        L.push(B(cols[(r() * 8) | 0], x + w / 2, y + 0.025 + h / 2, -0.05, w, h, 0.22)); x += w + 0.01; n++; }
      if (ri === 2) { L.push(S(C.blue, 0.3, y + 0.14, -0.02, 0.2), B(C.gold, 0.3, y + 0.05, -0.02, 0.03, 0.08, 0.03)); }
    });
    L.push(K(C.terra, 0.0, 1.78, -0.05, 0.2, 0.16, PI), S(C.green, 0, 1.92, -0.05, 0.3, 0.22, 0.3), S(C.green2, 0.08, 2.0, -0.04, 0.18));
    return L;
  };
  M.cabinet = function () {
    var L = [];
    [[-0.88, -0.28], [0.88, -0.28], [-0.88, 0.28], [0.88, 0.28]].forEach(function (p) { L.push(B(C.wood3, p[0], 0.05, p[1], 0.08, 0.1, 0.08)); });
    L.push(B(C.wood3, 0, 0.4, 0, 1.94, 0.62, 0.68), B(C.cream, -0.48, 0.42, 0.35, 0.9, 0.56, 0.03), B(C.cream, 0.48, 0.42, 0.35, 0.9, 0.56, 0.03), B(C.wood, -0.48, 0.42, 0.37, 0.7, 0.4, 0.012), B(C.wood, 0.48, 0.42, 0.37, 0.7, 0.4, 0.012),
      S(C.gold, -0.06, 0.42, 0.39, 0.06, 0.06, 0.05), S(C.gold, 0.06, 0.42, 0.39, 0.06, 0.06, 0.05), B(C.wood2, 0, 0.74, 0, 2.0, 0.05, 0.74),
      Cy(C.sky, -0.62, 0.9, 0, 0.22, 0.28), Cy(C.wood, -0.62, 1.06, 0, 0.14, 0.05), S(C.pink, -0.62, 0.9, 0, 0.14, 0.12, 0.14), K(C.sand, 0.42, 0.82, 0.04, 0.42, 0.12), S(C.yellow, 0.42, 0.9, 0.04, 0.26, 0.12, 0.16), B(C.red, -0.18, 0.84, 0.18, 0.24, 0.1, 0.18, 0, 0.3, 0));
    return L;
  };
  M.rug_round = function () {
    var L = [Cy(C.red, 0, 0.02, 0, 1.92, 0.03), Cy(C.cream, 0, 0.04, 0, 1.56, 0.02), Cy(C.teal, 0, 0.055, 0, 1.28, 0.02), Cy(C.cream, 0, 0.07, 0, 0.64, 0.02), S(C.red, 0, 0.09, 0, 0.14, 0.04, 0.14)];
    ring(L, 6, 0.24, function (x, z) { L.push(S(C.yellow, x, 0.09, z, 0.2, 0.04, 0.2)); });
    ring(L, 12, 0.7, function (x, z) { L.push(S(C.pink, x, 0.075, z, 0.12, 0.03, 0.12)); });
    return L;
  };
  M.rug_rect = function () {
    var L = [B(C.blue2, 0, 0.02, 0, 2.9, 0.03, 1.9), B(C.cream, 0, 0.04, 0, 2.6, 0.02, 1.6), B(C.blue, 0, 0.055, 0, 2.42, 0.02, 1.42), B(C.yellow, 0, 0.075, 0, 0.74, 0.02, 0.74, 0, PI / 4, 0), B(C.red, 0, 0.09, 0, 0.36, 0.02, 0.36, 0, PI / 4, 0)];
    [-1, 1].forEach(function (s) { L.push(B(C.pink, s * 0.9, 0.075, 0, 0.3, 0.02, 0.3, 0, PI / 4, 0)); [-0.7, -0.35, 0, 0.35, 0.7].forEach(function (z) { L.push(B(C.cream, s * 1.5, 0.02, z, 0.12, 0.02, 0.04)); }); });
    return L;
  };
  M.lamp_floor = function () {
    return [Cy(C.iron, 0, 0.04, 0, 0.36, 0.07), Cy(C.gold, 0, 0.8, 0, 0.05, 1.5), Cy(C.gold, 0, 0.5, 0, 0.12, 0.03), K(C.yellow, 0, 1.52, 0, 0.5, 0.34), Cy(C.gold, 0, 1.36, 0, 0.5, 0.02), S(C.gold, 0, 1.72, 0, 0.07)];
  };
  M.lamp_table = function () {
    return [Cy(C.blue2, 0, 0.03, 0, 0.26, 0.06), S(C.blue, 0, 0.2, 0, 0.34, 0.36, 0.34), Cy(C.blue2, 0, 0.42, 0, 0.08, 0.1), K(C.cream, 0, 0.62, 0, 0.44, 0.28), Cy(C.red, 0, 0.49, 0, 0.46, 0.025), S(C.gold, 0, 0.78, 0, 0.06)];
  };
  function frame(c, canvas) { return [B(c, 0, 0, 0.03, 0.74, 0.58, 0.06), B(canvas, 0, 0, 0.065, 0.62, 0.46, 0.02)]; }
  M.pic_flower = function () {
    var L = frame(C.wood3, C.cream);
    L.push(S(C.blue, 0, -0.14, 0.09, 0.16, 0.18, 0.04), B(C.green, 0, 0.0, 0.085, 0.02, 0.16, 0.012), B(C.green, -0.06, -0.01, 0.085, 0.02, 0.14, 0.012, 0, 0, 0.5), B(C.green, 0.06, -0.01, 0.085, 0.02, 0.14, 0.012, 0, 0, -0.5),
      S(C.pink, 0, 0.1, 0.09, 0.12, 0.12, 0.03), S(C.yellow, -0.11, 0.05, 0.09, 0.1, 0.1, 0.03), S(C.red, 0.11, 0.05, 0.09, 0.1, 0.1, 0.03), S(C.yellow, 0, 0.1, 0.1, 0.04, 0.04, 0.02));
    return L;
  };
  M.pic_hill = function () {
    var L = frame(C.wood2, C.sky);
    L.push(S(C.yellow, 0.18, 0.12, 0.085, 0.12, 0.12, 0.03), S(C.white, -0.16, 0.13, 0.085, 0.16, 0.07, 0.03), S(C.white, -0.08, 0.11, 0.085, 0.1, 0.06, 0.03), S(C.green2, -0.12, -0.12, 0.085, 0.34, 0.2, 0.03), S(C.green, 0.14, -0.14, 0.085, 0.36, 0.16, 0.03),
      B(C.leaf, 0, -0.205, 0.085, 0.62, 0.05, 0.02), B(C.wood3, 0.2, -0.04, 0.09, 0.025, 0.1, 0.012), S(C.leaf, 0.2, 0.04, 0.09, 0.12, 0.12, 0.03));
    return L;
  };
  M.pic_boat = function () {
    var L = frame(C.cream, C.sky);
    L.push(B(C.blue, 0, -0.14, 0.075, 0.62, 0.17, 0.02), S(C.white, -0.2, -0.06, 0.09, 0.1, 0.04, 0.02), S(C.white, 0.2, -0.06, 0.09, 0.1, 0.04, 0.02), B(C.terra, 0, -0.05, 0.095, 0.3, 0.07, 0.02, 0, 0, 0.0), B(C.wood3, 0, 0.08, 0.1, 0.02, 0.3, 0.02),
      B(C.white, 0.08, 0.08, 0.105, 0.14, 0.24, 0.01), B(C.red, -0.07, 0.04, 0.105, 0.09, 0.16, 0.01), S(C.yellow, -0.2, 0.17, 0.085, 0.1, 0.1, 0.02));
    return L;
  };
  M.clock_wall = function () {
    return [B(C.wood2, 0, -0.05, 0.06, 0.5, 0.5, 0.1), B(C.terra2, -0.15, 0.27, 0.06, 0.38, 0.06, 0.18, 0, 0, 0.5), B(C.terra2, 0.15, 0.27, 0.06, 0.38, 0.06, 0.18, 0, 0, -0.5), Cy(C.cream, 0, -0.05, 0.115, 0.38, 0.02, PI / 2),
      B(C.iron, 0, 0.02, 0.135, 0.025, 0.16, 0.01), B(C.iron, 0.06, -0.05, 0.135, 0.12, 0.025, 0.01), S(C.gold, 0, -0.05, 0.14, 0.05, 0.05, 0.02), B(C.wood3, 0, 0.17, 0.125, 0.1, 0.09, 0.012),
      B(C.gold, 0, -0.43, 0.08, 0.012, 0.3, 0.012), S(C.gold, 0, -0.6, 0.08, 0.1, 0.14, 0.1), B(C.gold, 0.16, -0.38, 0.08, 0.012, 0.22, 0.012), S(C.wood, 0.16, -0.52, 0.08, 0.08, 0.1, 0.08)];
  };
  M.curtains = function () {
    var L = [Cy(C.wood3, 0, 0.95, 0.1, 0.04, 1.14, 0, 0, PI / 2), S(C.gold, -0.57, 0.95, 0.1, 0.08), S(C.gold, 0.57, 0.95, 0.1, 0.08), B(C.white, 0, -0.02, 0.06, 0.4, 1.74, 0.02)];
    [-1, 1].forEach(function (s) {
      L.push(B(C.pink, s * 0.33, -0.02, 0.1, 0.36, 1.74, 0.06), B(C.pink2, s * 0.26, -0.02, 0.14, 0.08, 1.7, 0.04), B(C.pink2, s * 0.4, -0.02, 0.14, 0.08, 1.7, 0.04), B(C.yellow, s * 0.28, -0.16, 0.16, 0.34, 0.07, 0.05, 0, 0, s * 0.1));
    });
    [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].forEach(function (x, i) { L.push(S(i % 2 ? C.pink2 : C.red, x, 0.76, 0.14, 0.2, 0.14, 0.1)); });
    return L;
  };
  M.pot_small = function () {
    return [K(C.terra, 0, 0.14, 0, 0.3, 0.28, PI), Cy(C.terra2, 0, 0.3, 0, 0.35, 0.05), Cy(C.brown, 0, 0.325, 0, 0.29, 0.02), S(C.green, 0, 0.42, 0, 0.34, 0.2, 0.34), S(C.green2, 0.07, 0.5, 0.02, 0.2, 0.18, 0.2), S(C.pink, -0.06, 0.58, 0.04, 0.11, 0.11, 0.11), S(C.yellow, 0.1, 0.62, 0, 0.09)];
  };
  M.pot_big = function () {
    var L = [S(C.blue, 0, 0.26, 0, 0.56, 0.5, 0.56), Cy(C.cream, 0, 0.26, 0, 0.57, 0.05), Cy(C.blue2, 0, 0.5, 0, 0.42, 0.05), Cy(C.brown, 0, 0.53, 0, 0.36, 0.02)];
    ring(L, 7, 0.1, function (x, z, a) { L.push(B(C.leaf, x, 0.84, z, 0.1, 0.56, 0.03, -Math.sin(a) * 0.5, -a + PI / 2, Math.cos(a) * 0.5)); });
    L.push(S(C.green2, 0, 1.15, 0, 0.18, 0.2, 0.18));
    return L;
  };
  M.planter_box = function () {
    var L = [B(C.wood, 0, 0.2, 0, 1.9, 0.4, 0.4), B(C.wood2, 0, 0.12, 0.205, 1.84, 0.05, 0.012), B(C.wood2, 0, 0.28, 0.205, 1.84, 0.05, 0.012), B(C.wood3, -0.93, 0.21, 0.17, 0.07, 0.42, 0.07), B(C.wood3, 0.93, 0.21, 0.17, 0.07, 0.42, 0.07), B(C.wood3, -0.93, 0.21, -0.17, 0.07, 0.42, 0.07), B(C.wood3, 0.93, 0.21, -0.17, 0.07, 0.42, 0.07), B(C.brown, 0, 0.4, 0, 1.8, 0.04, 0.32)], fl = [C.pink, C.yellow, C.white, C.purple, C.red, C.pink2];
    fl.forEach(function (c, i) { var x = -0.76 + i * 0.3, z = i % 2 ? 0.06 : -0.06; L.push(S(C.leaf, x, 0.5, z, 0.26, 0.16, 0.26), S(c, x, 0.62 + (i % 3) * 0.04, z, 0.14, 0.12, 0.14)); });
    return L;
  };
  M.plant_tall = function () {
    var L = [K(C.cream, 0, 0.18, 0, 0.4, 0.36, PI), Cy(C.terra, 0, 0.3, 0, 0.44, 0.05), Cy(C.brown, 0, 0.34, 0, 0.34, 0.02), Cy(C.leaf, 0, 0.8, 0, 0.05, 0.95)];
    [[-1, 0.62], [1, 0.78], [-1, 0.94], [1, 1.1], [-1, 1.26], [0, 1.45]].forEach(function (p, i) { L.push(S(i % 2 ? C.green : C.leaf, p[0] * 0.17, p[1], p[0] * 0.04, 0.34, 0.1, 0.22, 0, 0.4 * p[0], p[0] * 0.5 + (p[0] === 0 ? 0 : 0))); });
    L.push(S(C.green2, 0, 1.52, 0, 0.2, 0.26, 0.14));
    return L;
  };
  M.lantern_garden = function () {
    var L = [Cy(C.stone2, 0, 0.07, 0, 0.42, 0.14), Cy(C.stone, 0, 0.32, 0, 0.16, 0.36), Cy(C.stone2, 0, 0.52, 0, 0.36, 0.05), B(C.stone, 0, 0.68, 0, 0.32, 0.28, 0.32), K(C.stone2, 0, 0.92, 0, 0.62, 0.18), S(C.stone, 0, 1.06, 0, 0.14)];
    [[0, 0.165, 0.18, 0.14, 0.01], [0, -0.165, 0.18, 0.14, 0.01], [0.165, 0, 0.01, 0.14, 0.18], [-0.165, 0, 0.01, 0.14, 0.18]].forEach(function (p) { L.push(B(C.yellow, p[0], 0.68, p[1], p[2], p[3], p[4])); });
    L.push(S(C.green2, 0.2, 0.05, 0.2, 0.18, 0.08, 0.18));
    return L;
  };
  M.birdbath = function () {
    return [Cy(C.stone2, 0, 0.04, 0, 0.5, 0.08), K(C.stone, 0, 0.34, 0, 0.3, 0.52), Cy(C.stone2, 0, 0.64, 0, 0.7, 0.07), S(C.stone, 0, 0.72, 0, 0.66, 0.2, 0.66), Cy(C.water, 0, 0.77, 0, 0.5, 0.02),
      S(C.blue2, 0.14, 0.84, 0.02, 0.12, 0.1, 0.1), S(C.blue2, 0.2, 0.87, 0.02, 0.07), B(C.yellow, 0.26, 0.865, 0.02, 0.05, 0.02, 0.02), B(C.blue2, 0.07, 0.82, 0.02, 0.1, 0.03, 0.04, 0, 0, 0.3), S(C.green, -0.2, 0.05, 0.22, 0.18, 0.1, 0.16)];
  };
  M.bench_garden = function () {
    var L = [], z;
    [-0.15, -0.05, 0.05, 0.15].forEach(function (z0) { L.push(B(C.wood2, 0, 0.46, z0, 1.84, 0.04, 0.09)); });
    [0.64, 0.76, 0.88].forEach(function (y) { L.push(B(C.wood2, 0, y, -0.25, 1.84, 0.09, 0.03, -0.12, 0, 0)); });
    [-1, 1].forEach(function (s) { L.push(B(C.iron, s * 0.8, 0.22, 0.18, 0.05, 0.44, 0.05), B(C.iron, s * 0.8, 0.22, -0.18, 0.05, 0.44, 0.05), B(C.iron, s * 0.8, 0.7, -0.24, 0.05, 0.8, 0.04, -0.12, 0, 0), B(C.iron, s * 0.88, 0.58, 0, 0.05, 0.05, 0.5), S(C.iron, s * 0.88, 0.6, 0.26, 0.09)); });
    L.push(B(C.red, 0.5, 0.51, 0.04, 0.4, 0.07, 0.3, 0, 0.1, 0), S(C.pink, -0.5, 0.54, 0.02, 0.2, 0.08, 0.16));
    return L;
  };
  M.gnome = function () {
    return [B(C.brown, -0.07, 0.04, 0.05, 0.1, 0.08, 0.14), B(C.brown, 0.07, 0.04, 0.05, 0.1, 0.08, 0.14), S(C.blue2, 0, 0.2, 0, 0.3, 0.34, 0.3), Cy(C.brown, 0, 0.17, 0, 0.31, 0.04), B(C.gold, 0, 0.17, 0.155, 0.06, 0.05, 0.01),
      B(C.blue2, -0.17, 0.2, 0.05, 0.07, 0.18, 0.07, 0, 0, 0.3), B(C.blue2, 0.17, 0.2, 0.05, 0.07, 0.18, 0.07, 0, 0, -0.3), S(C.skin, 0, 0.4, 0.02, 0.2, 0.18, 0.2), S(C.pink, 0, 0.385, 0.115, 0.05), S(C.white, 0, 0.3, 0.08, 0.22, 0.2, 0.12),
      K(C.red, 0, 0.55, 0, 0.27, 0.2), K(C.red2, 0, 0.71, 0, 0.16, 0.14), S(C.red, 0, 0.8, 0, 0.09), Cy(C.cream, 0.3, 0.06, 0.1, 0.05, 0.12), S(C.red, 0.3, 0.13, 0.1, 0.18, 0.1, 0.18), S(C.white, 0.3, 0.17, 0.14, 0.05)];
  };
  M.wheelbarrow = function () {
    var L = [B(C.red, 0, 0.44, 0, 0.52, 0.22, 0.58, 0.12, 0, 0), B(C.brown, 0, 0.55, 0.02, 0.44, 0.03, 0.5, 0.12, 0, 0), Cy(C.iron, 0, 0.16, 0.34, 0.32, 0.07, 0, 0, PI / 2), S(C.gold, 0, 0.16, 0.34, 0.07), B(C.wood3, -0.2, 0.18, -0.26, 0.05, 0.36, 0.05), B(C.wood3, 0.2, 0.18, -0.26, 0.05, 0.36, 0.05),
      B(C.wood2, -0.2, 0.4, -0.4, 0.05, 0.05, 0.42, -0.18, 0, 0), B(C.wood2, 0.2, 0.4, -0.4, 0.05, 0.05, 0.42, -0.18, 0, 0), B(C.iron, -0.16, 0.32, 0.3, 0.03, 0.34, 0.03), B(C.iron, 0.16, 0.32, 0.3, 0.03, 0.34, 0.03)];
    L.push(S(C.leaf, 0, 0.62, 0, 0.4, 0.18, 0.4), S(C.pink, -0.1, 0.72, 0.02, 0.14, 0.12, 0.14), S(C.yellow, 0.1, 0.74, 0.1, 0.13, 0.11, 0.13), S(C.white, 0.02, 0.76, -0.1, 0.13, 0.11, 0.13));
    return L;
  };

  /* ------------------------------------------------------------------ catalog */
  /* Stage 17 FURN + DECOR b: per-item seat data in item-local space (front +z, footprint centred, floor y 0).
   * y = real seat-surface height (top of the cushion / board under the hips, from the model parts; `ys` = per seat slot when they differ), dx = extra lateral offset,
   * dz = hip position along the depth (clear of the backrest face), face = local front vector, n = seats along the width, pitch = distance between seat centres.
   * h = y (legacy). Checked numerically by tools/seat_furn_check.js. */
  function seatOf(y, back, n, pitch, ys) { return { h: y, y: y, ys: ys || null, dx: 0, dz: back === null ? 0 : Math.round((back + 0.175) * 1000) / 1000, back: back, face: [0, 1], n: n, pitch: pitch }; }   // back = z of the backrest face (null = none); 0.175 = AnimData.SIT.back + 5 mm so the spine rests on the backrest face without overlap
  var SEATS = { chair_wood: seatOf(0.49, -0.19, 1, 1), chair_cushion: seatOf(0.565, -0.18, 1, 1), stool: seatOf(0.56, null, 1, 1), armchair: seatOf(0.55, -0.25, 1, 1), sofa: seatOf(0.6, -0.065, 2, 0.86), bench_garden: seatOf(0.545, -0.23, 2, 1, [0.48, 0.545]) };
  var LAMPS = { lamp_floor: { y: 1.5, r: 1.5 }, lamp_table: { y: 0.65, r: 0.95 } };
  F.CATS = [{ id: 'seat', name: 'Giường & ghế' }, { id: 'table', name: 'Bàn & kệ' }, { id: 'light', name: 'Thảm & đèn' }, { id: 'wall', name: 'Treo tường' }, { id: 'plant', name: 'Cây cảnh' }, { id: 'yard', name: 'Sân vườn' }];
  // [id, name, cat, price, w, d, place (floor|wall|yard|any), tip, extra]
  var DEF = [
    ['bed_single', 'Giường đơn', 'seat', 450, 1, 2, 'floor', 'Ngủ đủ giấc giúp bạn tỉnh táo cả ngày làm vườn.'],
    ['bed_double', 'Giường đôi', 'seat', 900, 2, 2, 'floor', 'Chăn hồng sọc trắng, đầu giường cong xinh xắn.'],
    ['mattress_old', 'Nệm cũ', 'seat', 120, 1, 2, 'floor', 'Nệm rẻ cho khách ghé ngủ, dùng được 3 ngày rồi sẽ hỏng.', { decay: true, sellPct: 0.3 }],
    ['chair_wood', 'Ghế gỗ', 'seat', 90, 1, 1, 'floor', 'Chiếc ghế gỗ mộc mạc, ngồi vừa vặn bên bàn ăn.'],
    ['chair_cushion', 'Ghế đệm', 'seat', 140, 1, 1, 'floor', 'Có đệm đỏ mềm, ngồi lâu cũng không mỏi.'],
    ['stool', 'Ghế đẩu', 'seat', 60, 1, 1, 'floor', 'Ba chân vững chãi, nhỏ gọn kê đâu cũng vừa.'],
    ['armchair', 'Ghế bành', 'seat', 260, 1, 1, 'floor', 'Ghế bành xanh bạc hà, hợp để đọc sách buổi tối.'],
    ['sofa', 'Ghế sofa', 'seat', 520, 2, 1, 'floor', 'Sofa cam đất êm ái, kèm hai chiếc gối nhỏ.'],
    ['table_round', 'Bàn tròn', 'table', 180, 1, 1, 'floor', 'Bàn tròn một chân, có bình hoa nhỏ trên mặt.'],
    ['table_square', 'Bàn ăn', 'table', 240, 2, 1, 'floor', 'Bàn dài có khăn trải đỏ, đủ chỗ cho cả nhà.'],
    ['desk', 'Bàn làm việc', 'table', 320, 2, 1, 'floor', 'Ba ngăn kéo để cất sổ sách và bút vở.'],
    ['coffee_table', 'Bàn trà', 'table', 150, 1, 1, 'floor', 'Bàn thấp mặt kính xanh, có sẵn ấm trà nóng.'],
    ['nightstand', 'Tủ đầu giường', 'table', 110, 1, 1, 'floor', 'Đặt cạnh giường để cất đồng hồ và cuốn sách dở.'],
    ['bookshelf', 'Kệ sách', 'table', 280, 1, 1, 'floor', 'Bốn tầng đầy sách đủ màu, trên đỉnh có chậu cây.'],
    ['cabinet', 'Tủ thấp', 'table', 360, 2, 1, 'floor', 'Tủ hai cánh để cất đồ, trên mặt bày lọ và giỏ bánh.'],
    ['rug_round', 'Thảm tròn', 'light', 120, 2, 2, 'floor', 'Thảm tròn nhiều vòng màu, đi chân trần rất êm.', { flat: true }],
    ['rug_rect', 'Thảm chữ nhật', 'light', 180, 3, 2, 'floor', 'Thảm xanh viền kem, họa tiết hình thoi và tua rua.', { flat: true }],
    ['lamp_floor', 'Đèn cây', 'light', 160, 1, 1, 'floor', 'Chao vàng dịu, thắp lên là góc nhà ấm hẳn.'],
    ['lamp_table', 'Đèn bàn', 'light', 90, 1, 1, 'floor', 'Chân sứ xanh, chao kem viền đỏ.'],
    ['pic_flower', 'Tranh bình hoa', 'wall', 80, 1, 0, 'wall', 'Bức tranh bình hoa tươi, treo là thấy vui.', { mountY: 1.35 }],
    ['pic_hill', 'Tranh đồi xanh', 'wall', 95, 1, 0, 'wall', 'Đồi xanh, mây trắng và một cái cây nhỏ.', { mountY: 1.35 }],
    ['pic_boat', 'Tranh thuyền buồm', 'wall', 110, 1, 0, 'wall', 'Chiếc thuyền buồm nhỏ lướt trên sóng xanh.', { mountY: 1.35 }],
    ['clock_wall', 'Đồng hồ cúc cu', 'wall', 140, 1, 0, 'wall', 'Đồng hồ nhà nhỏ có quả lắc vàng đung đưa.', { mountY: 1.55 }],
    ['curtains', 'Rèm cửa', 'wall', 130, 1, 0, 'wall', 'Rèm hồng buộc gọn, có thanh treo gỗ.', { mountY: 1.3 }],
    ['pot_small', 'Chậu nhỏ', 'plant', 40, 1, 1, 'any', 'Chậu đất nung nhỏ với đóa hoa hồng xinh.'],
    ['pot_big', 'Chậu lớn', 'plant', 75, 1, 1, 'any', 'Cây lá dài trồng trong chậu sứ xanh.'],
    ['planter_box', 'Bồn hoa dài', 'plant', 120, 2, 1, 'any', 'Bồn gỗ trồng sáu loại hoa nhiều màu.'],
    ['plant_tall', 'Cây lá to', 'plant', 150, 1, 1, 'any', 'Cây cao đến vai, lá xanh bóng khỏe khoắn.'],
    ['lantern_garden', 'Đèn đá sân vườn', 'yard', 130, 1, 1, 'yard', 'Đèn đá cổ kính, thắp sáng lối đi buổi tối.'],
    ['birdbath', 'Bể chim tắm', 'yard', 200, 1, 1, 'yard', 'Một chú chim xanh hay ghé uống nước ở đây.'],
    ['bench_garden', 'Ghế đá vườn', 'yard', 220, 2, 1, 'yard', 'Ghế dài có gối đỏ, ngồi hóng gió thật thích.'],
    ['gnome', 'Chú lùn vườn', 'yard', 90, 1, 1, 'yard', 'Chú lùn mũ đỏ canh giữ vườn rau của bạn.'],
    ['wheelbarrow', 'Xe cút kít hoa', 'yard', 160, 1, 1, 'yard', 'Chiếc xe cút kít cũ nay chở đầy hoa.']
  ];
  var byId = {};
  DEF.forEach(function (d) {
    var it = { id: d[0], name: d[1], cat: d[2], price: d[3], w: d[4], d: d[5], place: d[6], tip: d[7], flat: !!(d[8] && d[8].flat), mountY: (d[8] && d[8].mountY) || 0, sell: Math.floor(d[3] * ((d[8] && d[8].sellPct) || 0.5)), decay: !!(d[8] && d[8].decay), build: M[d[0]], seat: SEATS[d[0]] || null, bed: /^bed_/.test(d[0]), lamp: LAMPS[d[0]] || null };
    F.ITEMS.push(it); byId[it.id] = it;
  });
  F.get = function (id) { return byId[id] || null; };
  F.byCat = function (cat) { return F.ITEMS.filter(function (i) { return i.cat === cat; }); };
  F.price = function (id) { return byId[id] ? byId[id].price : 0; };
  F.sellPrice = function (id) { return byId[id] ? byId[id].sell : 0; };
  var pc = {};
  F.parts = function (id, stage) { var k; if (!byId[id]) return []; k = stage ? id + '#' + (stage | 0) : id; return pc[k] || (pc[k] = byId[id].build(stage | 0)); };
  /* Decaying items (old mattress): stage = days since placement, 0..DECAY_DAYS; at DECAY_DAYS the piece breaks on that morning. Missing/future placement day = fresh. */
  F.DECAY_DAYS = 3;
  F.decayStage = function (placedDay, today) { var n = Math.floor(+today) - Math.floor(+placedDay); return isFinite(n) ? Math.max(0, Math.min(F.DECAY_DAYS, n)) : 0; };

  /* ------------------------------------------------------------------ inventory + save */
  var inv = {};
  F.count = function (id) { return inv[id] || 0; };
  F.owned = function () { return F.ITEMS.filter(function (i) { return inv[i.id] > 0; }).map(function (i) { return { id: i.id, n: inv[i.id] }; }); };
  F.total = function () { var t = 0; Object.keys(inv).forEach(function (k) { t += inv[k]; }); return t; };
  F.add = function (id, n) { if (!byId[id]) return 0; n = Math.max(0, Math.floor(+n || 0)); if (!n) return 0; inv[id] = Math.min(99, (inv[id] || 0) + n); E.emit('furniture:changed', { id: id, n: inv[id] }); if (G.Save.request) G.Save.request(); return n; };
  F.remove = function (id, n) { n = Math.max(1, Math.floor(+n || 1)); if ((inv[id] || 0) < n) return false; inv[id] -= n; if (!inv[id]) delete inv[id]; E.emit('furniture:changed', { id: id, n: inv[id] || 0 }); if (G.Save.request) G.Save.request(); return true; };
  F.giveAll = function (n) { F.ITEMS.forEach(function (i) { F.add(i.id, n || 1); }); };
  F.buy = function (id) {
    var it = byId[id], S = G.State;
    if (!it) return { ok: false, reason: 'unknown' };
    if ((inv[id] || 0) >= 99) return { ok: false, reason: 'Bạn đã có quá nhiều món này rồi.' };
    if (!S.spendMoney(it.price)) return { ok: false, reason: 'Bạn chưa đủ tiền cho món này.' };
    F.add(id, 1); E.emit('furniture:bought', { id: id, cost: it.price }); E.emit('shop:transaction', { kind: 'decor', id: id, n: 1, cost: it.price });
    return { ok: true };
  };
  G.Save.register('furniture', {
    save: function () { var o = {}; Object.keys(inv).forEach(function (k) { o[k] = inv[k]; }); return { v: 1, inv: o }; },
    load: function (s) { inv = {}; if (s && s.inv) Object.keys(s.inv).forEach(function (k) { var n = Math.floor(+s.inv[k]); if (byId[k] && n > 0) inv[k] = Math.min(99, n); }); E.emit('furniture:changed', { id: null, n: 0 }); },
    reset: function () { inv = {}; E.emit('furniture:changed', { id: null, n: 0 }); }
  });

  /* ------------------------------------------------------------------ projected SVG icon (3/4 view of the same hand-built parts) */
  function rmat(rx, ry, rz) {
    var cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    function mm(a, b) { var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j]; return r; }
    return mm([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], mm([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]));
  }
  function mv(R, v) { return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]]; }
  function pj(p) { return [(p[0] - p[2]) * 0.866, (p[0] + p[2]) * 0.5 - p[1]]; }
  function hull(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function shade(hex, m) { var r = Math.min(255, Math.round(((hex >> 16) & 255) * m)), g = Math.min(255, Math.round(((hex >> 8) & 255) * m)), b = Math.min(255, Math.round((hex & 255) * m)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
  var LV = [-0.35, 0.85, 0.4];
  function mult(n) { var v = n[0] * LV[0] + n[1] * LV[1] + n[2] * LV[2]; return v > 0.55 ? 1.12 : v > 0.1 ? 0.95 : 0.78; }
  function opsOf(parts) {
    var out = [];
    parts.forEach(function (p) {
      var sh = p[0], col = p[1], c = [p[2], p[3], p[4]], R = rmat(p[8], p[9], p[10]), d = c[0] + c[1] + c[2], i, j, a;
      if (sh === 'b') {
        var h = [p[5] / 2, p[6] / 2, p[7] / 2], faces = [];
        [0, 1, 2].forEach(function (ax) {
          [-1, 1].forEach(function (sg) {
            var u = (ax + 1) % 3, v = (ax + 2) % 3, n = [0, 0, 0], q = [], k, cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            n[ax] = sg; n = mv(R, n); if (n[0] + n[1] + n[2] <= 0.0001) return;
            for (k = 0; k < 4; k++) { var l = [0, 0, 0]; l[ax] = sg * h[ax]; l[u] = cs[k][0] * h[u]; l[v] = cs[k][1] * h[v]; l = mv(R, l); q.push(pj([c[0] + l[0], c[1] + l[1], c[2] + l[2]])); }
            faces.push({ d: d + (n[0] + n[1] + n[2]) * 0.0001, pts: q, fill: shade(col, mult(n)) });
          });
        });
        faces.forEach(function (f) { out.push(f); });
      } else if (sh === 'c' || sh === 'k') {
        var r = p[5] / 2, hh = p[6] / 2, rt = sh === 'k' ? r * 0.6 : r, top = [], bot = [], all = [], ax = mv(R, [0, 1, 0]);
        for (i = 0; i < 14; i++) { a = i / 14 * PI * 2; var t = mv(R, [Math.cos(a) * rt, hh, Math.sin(a) * rt]), b = mv(R, [Math.cos(a) * r, -hh, Math.sin(a) * r]);
          top.push(pj([c[0] + t[0], c[1] + t[1], c[2] + t[2]])); bot.push(pj([c[0] + b[0], c[1] + b[1], c[2] + b[2]])); }
        out.push({ d: d, pts: hull(top.concat(bot)), fill: shade(col, 0.92) });
        var s = ax[0] + ax[1] + ax[2];
        if (Math.abs(s) > 0.08) out.push({ d: d + 0.0002, pts: s > 0 ? top : bot, fill: shade(col, mult(s > 0 ? ax : [-ax[0], -ax[1], -ax[2]])) });
      } else {
        var pts = [], hx = [p[5] / 2, p[6] / 2, p[7] / 2], lat = [-1, -0.7, -0.35, 0, 0.35, 0.7, 1];
        lat.forEach(function (y) { var rr = Math.sqrt(Math.max(0, 1 - y * y)), n = rr < 0.01 ? 1 : 12; for (j = 0; j < n; j++) { a = j / n * PI * 2; var l = mv(R, [Math.cos(a) * rr * hx[0], y * hx[1], Math.sin(a) * rr * hx[2]]); pts.push(pj([c[0] + l[0], c[1] + l[1], c[2] + l[2]])); } });
        out.push({ d: d, pts: hull(pts), fill: shade(col, 1.0) });
        if (Math.max(hx[0], hx[1], hx[2]) > 0.05) { var hl = mv(R, [-0.38 * hx[0], 0.5 * hx[1], 0.5 * hx[2]]), q = pj([c[0] + hl[0], c[1] + hl[1], c[2] + hl[2]]), rr2 = Math.min(hx[0], hx[1], hx[2]) * 0.5, hp = [];
          for (j = 0; j < 8; j++) { a = j / 8 * PI * 2; hp.push([q[0] + Math.cos(a) * rr2, q[1] + Math.sin(a) * rr2 * 0.8]); }
          out.push({ d: d + 0.0003, pts: hp, fill: shade(col, 1.22), plain: true }); }
      }
    });
    return out.sort(function (a, b) { return a.d - b.d; });
  }
  var ic = {};
  function iconSvg(id, px) {
    var it = byId[id]; if (!it) return '';
    var key = id + '@' + px; if (ic[key]) return ic[key];
    var ops = opsOf(F.parts(id)), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, body = '';
    ops.forEach(function (o) { o.pts.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }); });
    var s = 54 / Math.max(x1 - x0, y1 - y0, 0.2), tx = 32 - (x0 + x1) / 2 * s, ty = 32 - (y0 + y1) / 2 * s;
    ops.forEach(function (o) { body += '<polygon points="' + o.pts.map(function (q) { return q[0].toFixed(3) + ',' + q[1].toFixed(3); }).join(' ') + '" fill="' + o.fill + '"' + (o.plain ? ' stroke="none" opacity=".55"' : '') + '/>'; });
    return (ic[key] = '<svg class="tvi" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + px + '" height="' + px + '"><g transform="translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ') scale(' + s.toFixed(3) + ')" stroke="#5b3a29" stroke-width="' + (2.3 / s).toFixed(3) + '" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>');
  }
  F.icon = function (id, px) { return iconSvg(id, px || 40); };
  if (G.Icons) G.Icons.decor = F.icon;

  /* ------------------------------------------------------------------ shared-geometry 3D (needs THREE + Models) */
  var gc = {}, geos = null;
  F.geometry = function (id) {
    if (gc[id]) return gc[id];
    if (typeof THREE === 'undefined' || !G.Models || !byId[id]) return null;
    if (!geos) geos = { b: new THREE.BoxGeometry(1, 1, 1), c: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), k: new THREE.CylinderGeometry(0.3, 0.5, 1, 10), s: new THREE.SphereGeometry(0.5, 10, 7) };
    var list = F.parts(id).map(function (p) { return G.Models.part(geos[p[0]], p[1], [p[2], p[3], p[4]], [p[8], p[9], p[10]], [p[5], p[6], p[7]]); });
    return (gc[id] = G.Models.mergeParts(list));
  };
  F.mesh = function (id) {
    var g = F.geometry(id); if (!g) return null;
    var m = new THREE.Mesh(g, G.Models.material('prop')); m.name = 'decor_' + id; if (G.Render && G.Render.addOutline) G.Render.addOutline(m, true); return m;
  };
  F.stats = { items: F.ITEMS.length, cats: F.CATS.length };
})();
