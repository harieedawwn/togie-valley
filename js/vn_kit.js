/* Togie Valley - vn_kit.js (Round 2 stage 7): shared builders for the Vietnamese countryside look (Game.VNKit). make() returns a parts list with
 * box/cylinder/sphere helpers + ready-made pieces (yin-yang tile roof with curved ridge, thatch/tôn roofs, bamboo poles, clay jars, baskets,
 * nón lá, red lanterns, plastic stools). Everything bakes into ONE merged geometry per building (no new meshes, no new draw calls).
 * Shared geometries are cached here (cyl handles cone/prism/tapered shapes). Vertex-colour functions give bamboo/wood/brick banding. */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Models) { console.error('[vn_kit] missing deps'); return; }
  var Mo = G.Models, PI = Math.PI, geoCache = {};
  var BOXG = new THREE.BoxGeometry(1, 1, 1), SPHG = new THREE.SphereGeometry(0.5, 8, 6), ICOG = new THREE.IcosahedronGeometry(0.5, 0), TORG = new THREE.TorusGeometry(0.5, 0.035, 5, 16);
  function cylG(rt, rb, seg) { var k = rt + '_' + rb + '_' + seg; return geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(rt, rb, 1, seg)); }
  var C = { tile: 0xc9703c, tile2: 0xb85f32, tileBase: 0x7a3f2a, ridge: 0x8f4a30, plaster: 0xf0d48a, plaster2: 0xe3c373, lime: 0xeadfbf, skirt: 0x6fa58f, brick: 0xc2674a, brick2: 0xad573d, mortar: 0xe6d3b0,
    tonA: 0x7fb0c4, tonB: 0x6a9bb0, thatchA: 0xe6c36e, thatchB: 0xd2a954, thatchBase: 0x9c7a3c, bamA: 0xdcc470, bamB: 0xbfa24f, bamG: 0x9db85c, wood: 0xa8693a, wood2: 0xc98b4f, door: 0x7a4a2b,
    dark: 0x5a3a28, red: 0xd8453a, red2: 0xb53a30, gold: 0xf2c14e, clay: 0xb86d45, clay2: 0x9c5636, glaze: 0x5f8a5a, glaze2: 0x4a7a6e, stone: 0xb7b2a6, stone2: 0x9a958b, iron: 0x5a4a52,
    cream: 0xfff1d0, straw: 0xe8cf86, green: 0x5fb86a, water: 0x6cc6de, pink: 0xff9bb3, blue: 0x4f8fd6, glass: 0xaee3f0 };
  var SNACK = [0xe8715d, 0xffd166, 0x4fb3c8, 0x7fcf7a, 0xff9bb3, 0xb79cf2, 0xff9b50];

  /* vertex-colour textures (evaluated on world positions after the part transform) */
  function bambooV(a, b) { return function (x, y) { var f = (y * 2.6) % 1; return f < 0.1 || f > 0.94 ? C.bamG : (Math.floor(y * 2.6) % 2 ? a : b); }; }   // vertical culm: nodes + two tones
  function bambooH(a, b) { return function (x, y, z) { var s = x + z * 1.3, f = (s * 2.6) % 1; if (f < 0) f += 1; return f < 0.1 ? C.bamG : (Math.floor(s * 2.6) % 2 ? a : b); }; }
  function plank(a, b) { return function (x, y, z) { return Math.floor((x + z) * 7 + y * 0.4) % 2 ? a : b; }; }
  function brickV(a, b) { return function (x, y, z) { var row = Math.floor(y * 9), s = x + z + (row % 2) * 0.07, f = (s * 6) % 1; if (f < 0) f += 1; return (y * 9) % 1 < 0.1 || f < 0.07 ? C.mortar : ((row + Math.floor(s * 6)) % 3 ? a : b); }; }

  function make() {
    var K = { L: [], X: 0, Z: 0, C: C, SNACK: SNACK, bambooV: bambooV, bambooH: bambooH, plank: plank, brickV: brickV }, L = K.L;
    K.o = function (x, z) { K.X = x; K.Z = z; };
    K.bx = function (w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOXG, c, [x + K.X, y, z + K.Z], [rx || 0, ry || 0, rz || 0], [w, h, d])); };
    K.cy = function (r, h, c, x, y, z, rx, ry, rz) { L.push(Mo.part(cylG(0.5, 0.5, 10), c, [x + K.X, y, z + K.Z], [rx || 0, ry || 0, rz || 0], [r * 2, h, r * 2])); };
    K.sp = function (r, c, x, y, z, sy) { L.push(Mo.part(SPHG, c, [x + K.X, y, z + K.Z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); };
    K.ic = function (r, c, x, y, z, sy, ry) { L.push(Mo.part(ICOG, c, [x + K.X, y, z + K.Z], [0, ry || 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); };
    K.cn = function (r, h, c, x, y, z, rx, rz, seg) { L.push(Mo.part(cylG(0, 0.5, seg || 6), c, [x + K.X, y, z + K.Z], [rx || 0, 0, rz || 0], [r * 2, h, r * 2])); };
    K.tp = function (rt, rb, h, seg, c, x, y, z, rx, ry, rz) { L.push(Mo.part(cylG(rt, rb, seg), c, [x + K.X, y, z + K.Z], [rx || 0, ry || 0, rz || 0], [1, h, 1])); };
    K.tor = function (r, c, x, y, z, rx, ry) { L.push(Mo.part(TORG, c, [x + K.X, y, z + K.Z], [rx === undefined ? PI / 2 : rx, ry || 0, 0], [r * 2, r * 2, r * 2])); };
    K.tri = function (w, h, d, c, x, baseY, z) { L.push(Mo.part(cylG(0.5, 0.5, 3), c, [x + K.X, baseY + h / 2, z + K.Z], [-PI / 2, 0, 0], [w / 0.866, d, 2 * h])); };   // gable triangle facing +-z
    /* bamboo/wood pole between two points in the XY plane (z fixed) or ZY plane (x fixed) */
    K.poleXY = function (x1, y1, x2, y2, z, r, c) { var dx = x2 - x1, dy = y2 - y1; K.cy(r, Math.sqrt(dx * dx + dy * dy), c, (x1 + x2) / 2, (y1 + y2) / 2, z, 0, 0, -Math.atan2(dx, dy)); };
    K.poleZY = function (x, y1, z1, y2, z2, r, c) { var dz = z2 - z1, dy = y2 - y1; K.cy(r, Math.sqrt(dz * dz + dy * dy), c, x, (y1 + y2) / 2, (z1 + z2) / 2, Math.atan2(dz, dy), 0, 0); };

    /* roof with the ridge along X, all coordinates local to K.o(). o: x,z (centre), w (ridge length), d (eave to eave), y (eave height), rise, over (eave overhang), c1,c2,base (tile colours),
     * rw (rib width), thick, discs (round tile heads), curve (ridge upturn), ridgeC/ridgeH/ridgeD, tips, fringe (thatch fringe), gable (colour: fills both gable ends) */
    K.gableX = function (d, H, thick, c, x, baseY, z) { L.push(Mo.part(cylG(0.5, 0.5, 3), c, [x + K.X, baseY + H / 3, z + K.Z], [-PI / 2, 0, -PI / 2], [d / 0.866, thick, H / 0.75])); };
    K.roof = function (o) {
      var hd = o.d / 2, a = Math.atan2(o.rise, hd), over = o.over === undefined ? 0.12 : o.over, sl = Math.sqrt(hd * hd + o.rise * o.rise) + over, rw = o.rw || 0.16, n = Math.max(2, Math.round(o.w / rw));
      var cs = Math.cos(a), sn = Math.sin(a), s, i, x, zc, yc, ze, ye, ry = o.y + o.rise;
      for (s = -1; s <= 1; s += 2) {
        zc = o.z + s * (sl / 2) * cs; yc = ry - (sl / 2) * sn; ze = o.z + s * sl * cs; ye = ry - sl * sn;
        K.bx(o.w + 0.1, 0.05, sl, o.base || C.tileBase, o.x, yc - 0.02, zc, s * a, 0, 0);                                   // dark underlay shows between the ribs
        for (i = 0; i < n; i++) {
          x = o.x - o.w / 2 + (i + 0.5) * o.w / n;
          K.bx(o.w / n * 0.78, o.thick || 0.06, sl, i % 2 ? o.c2 : o.c1, x, yc + 0.015, zc, s * a, 0, 0);                    // convex tile column
          if (o.discs) L.push(Mo.part(cylG(0.5, 0.5, 6), i % 2 ? o.c2 : o.c1, [x + K.X, ye + 0.03, ze + K.Z], [s * (PI / 2 + a), 0, 0], [o.w / n * 0.76, 0.03, o.w / n * 0.76]));             // round tile head at the eave
          if (o.fringe) K.bx(o.w / n * 0.7, 0.12 + (i % 3) * 0.05, 0.03, i % 2 ? o.c1 : o.c2, x, ye - 0.04, ze, 0, 0, 0);
        }
      }
      // ridge cap that curves up toward both ends + finials
      var seg = 7, cv = o.curve === undefined ? 0.12 : o.curve, u0, u1, y0, y1, x0, x1, hw = o.w / 2 + 0.1;
      for (i = 0; i < seg; i++) {
        u0 = -1 + 2 * i / seg; u1 = -1 + 2 * (i + 1) / seg; x0 = o.x + u0 * hw; x1 = o.x + u1 * hw;
        y0 = ry + cv * Math.pow(u0, 4); y1 = ry + cv * Math.pow(u1, 4);
        K.bx(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) + 0.03, o.ridgeH || 0.1, o.ridgeD || 0.17, o.ridgeC || C.ridge, (x0 + x1) / 2, (y0 + y1) / 2 + 0.04, o.z, 0, 0, Math.atan2(y1 - y0, x1 - x0));
      }
      if (o.tips !== false) for (i = -1; i <= 1; i += 2) { K.cn(0.06, 0.2, o.ridgeC || C.ridge, o.x + i * (hw + 0.02), ry + cv + 0.13, o.z, 0, -i * 0.45, 5); K.sp(0.035, C.gold, o.x + i * (hw + 0.07), ry + cv + 0.24, o.z); }
      if (o.gable) for (i = -1; i <= 1; i += 2) K.gableX(o.d, o.rise, 0.05, o.gable, o.x + i * (o.w / 2 - 0.02), o.y, o.z);
    };
    /* eave-line fascia + simple rafters under a roof: boards at front and back */
    K.fascia = function (x, z, w, d, y, c) { K.bx(w + 0.2, 0.08, 0.06, c || C.door, x - K.X, y, z - d / 2 - K.Z); K.bx(w + 0.2, 0.08, 0.06, c || C.door, x - K.X, y, z + d / 2 - K.Z); };

    K.jar = function (x, z, r, c, lid) {   // chum / lu: fat clay jar with a rim and a conical lid
      var c2 = c === C.clay ? C.clay2 : C.glaze2;
      K.tp(r * 0.62, r * 0.7, r * 0.5, 10, c, x, r * 0.25, z); K.sp(r, c, x, r * 1.0, z, 0.95); K.tp(r * 0.5, r * 0.62, r * 0.35, 10, c2, x, r * 1.85, z);
      K.tor(r * 0.5, c2, x, r * 2.02, z, PI / 2); if (lid) { K.tp(0.1, r * 0.56, r * 0.2, 10, C.straw, x, r * 2.15, z); K.sp(r * 0.1, c2, x, r * 2.33, z); }
      K.tor(r * 0.92, c2, x, r * 1.05, z, PI / 2);
    };
    K.basket = function (x, z, r, h, goods, y0) {   // rổ / thúng: woven tapered basket with bands
      y0 = y0 || 0; K.tp(r, r * 0.72, h, 10, bambooH(C.bamA, C.bamB), x, y0 + h / 2, z); K.tor(r * 0.98, C.bamB, x, y0 + h * 0.98, z, PI / 2); K.tor(r * 0.8, C.bamB, x, y0 + h * 0.4, z, PI / 2);
      if (goods) { var i; for (i = 0; i < 5; i++) K.ic(r * 0.3, goods[i % goods.length], x + Math.cos(i * 1.3) * r * 0.45, y0 + h + r * 0.12, z + Math.sin(i * 1.3) * r * 0.45, 0.9, i); }
    };
    K.nonla = function (x, y, z, r, wall, c) {   // nón lá: wide cone hat; wall = hung on a wall (apex toward +z), else apex up
      c = c || 0xf3e2b0;
      if (wall) {
        L.push(Mo.part(cylG(0, 0.5, 14), c, [x + K.X, y, z + K.Z + r * 0.35], [PI / 2, 0, 0], [r * 2, r * 0.7, r * 2]));
        L.push(Mo.part(TORG, 0xc9a65a, [x + K.X, y, z + K.Z + 0.01], [0, 0, 0], [r * 2, r * 2, r * 2]));
        L.push(Mo.part(SPHG, C.red, [x + K.X, y, z + K.Z + r * 0.72], [0, 0, 0], [r * 0.16, r * 0.16, r * 0.16]));
      } else {
        L.push(Mo.part(cylG(0, 0.5, 14), c, [x + K.X, y, z + K.Z], [0, 0, 0], [r * 2, r * 0.7, r * 2]));
        L.push(Mo.part(TORG, 0xc9a65a, [x + K.X, y - r * 0.35, z + K.Z], [PI / 2, 0, 0], [r * 2, r * 2, r * 2]));
        L.push(Mo.part(SPHG, 0xe8c070, [x + K.X, y + r * 0.37, z + K.Z], [0, 0, 0], [r * 0.14, r * 0.14, r * 0.14]));
      }
    };
    K.lantern = function (x, y, z, s) {   // red paper lantern with gold caps + tassel
      s = s || 1; K.cy(0.012 * s, 0.14 * s, C.dark, x, y + 0.2 * s, z); K.cy(0.07 * s, 0.03 * s, C.gold, x, y + 0.14 * s, z); K.sp(0.11 * s, C.red, x, y, z, 1.1);
      K.cy(0.07 * s, 0.03 * s, C.gold, x, y - 0.14 * s, z); K.cy(0.006 * s, 0.14 * s, C.gold, x, y - 0.23 * s, z); K.sp(0.02 * s, C.red2, x, y - 0.31 * s, z);
      K.bx(0.14 * s, 0.01, 0.01, C.red2, x, y, z + 0.1 * s);
    };
    K.stool = function (x, z, c, ry) {   // plastic stool (ghế nhựa)
      K.tp(0.13, 0.11, 0.05, 10, c, x, 0.34, z); K.tp(0.11, 0.14, 0.31, 8, c, x, 0.17, z);
      K.tor(0.12, c, x, 0.2, z, PI / 2);
    };
    K.fan = function (x, y, z, ry) {   // table fan
      K.cy(0.1, 0.03, C.iron, x, y, z); K.cy(0.018, 0.2, C.iron, x, y + 0.11, z); K.cy(0.1, 0.02, C.glass, x, y + 0.24, z + 0.04, PI / 2, ry || 0, 0);
      K.cy(0.1, 0.012, 0xd9dde2, x, y + 0.24, z + 0.065, PI / 2, 0, 0); K.bx(0.14, 0.03, 0.01, C.red, x, y + 0.24, z + 0.07, 0, 0, 0.5); K.bx(0.14, 0.03, 0.01, C.red, x, y + 0.24, z + 0.07, 0, 0, -1.0);
    };
    K.snackBags = function (x0, x1, y, z, n, seed) {   // string of hanging snack bags
      var i, x, h; K.bx(x1 - x0, 0.015, 0.015, C.dark, (x0 + x1) / 2, y, z);
      for (i = 0; i < n; i++) { x = x0 + (i + 0.5) * (x1 - x0) / n; h = 0.15 + ((i * 7 + (seed || 0)) % 3) * 0.04; K.bx(0.006, 0.05, 0.006, C.dark, x, y - 0.03, z); K.bx(0.09, h, 0.025, SNACK[(i + (seed || 0)) % SNACK.length], x, y - 0.05 - h / 2, z, 0, 0, ((i % 3) - 1) * 0.05); K.bx(0.09, 0.025, 0.03, 0xffffff, x, y - 0.05 - h * 0.65, z); }
    };
    K.merge = function () { return Mo.mergeParts(L); };
    return K;
  }
  G.VNKit = { make: make, C: C, cylG: cylG, BOXG: BOXG, SPHG: SPHG, ICOG: ICOG, TORG: TORG };
})();
