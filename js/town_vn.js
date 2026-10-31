/* Togie Valley - town_vn.js (Round 2 stage 7): Vietnamese shopfronts for the two town buildings (Game.TownVN). js/town.js stall() calls shop(ctx) / work(ctx) with the
 * footprint fitted to the world map and emits the returned merged geometry as the same 'town_shop' / 'town_workshop' meshes (no new draw calls). The painted sign plane
 * is the existing Town.signPlane. shop = tiệm tạp hóa (yin-yang tile roof, mành tre, snack bags, stools, fan); workshop = brick kiln workshop (tôn roof, kiln mouth). */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.VNKit) { console.error('[town_vn] missing deps'); return; }
  var VK = G.VNKit, C = VK.C, PI = Math.PI, TV = G.TownVN = {};

  function shell(K, c, wallCol) {   // plinth, walls, corner pilasters, fascia posts + beam carrying the front roof overhang
    var h = c.h, fz = c.fz, fy = fz + 0.02;
    K.bx(c.w + 0.12, 0.14, c.dep + 0.12, C.stone, c.cx, 0.07, c.z0 + c.dep / 2);
    K.bx(c.w, h - 0.14, c.dep, wallCol, c.cx, 0.14 + (h - 0.14) / 2, c.z0 + c.dep / 2);
    K.bx(0.24, h - 0.14, 0.26, C.lime, c.x0 + 0.1, 0.14 + (h - 0.14) / 2, fz - 0.02); K.bx(0.24, h - 0.14, 0.26, C.lime, c.x1 - 0.1, 0.14 + (h - 0.14) / 2, fz - 0.02);
    [c.x0 + 0.25, c.x1 - 0.25].forEach(function (x) { K.cy(0.07, h, K.bambooV(C.bamA, C.bamB), x, h / 2, fz + 0.95); K.bx(0.2, 0.08, 0.2, C.stone2, x, 0.04, fz + 0.95); });
    K.bx(c.w - 0.1, 0.12, 0.12, C.door, c.cx, h - 0.1, fz + 0.95); K.bx(0.12, 0.1, 0.95, C.door, c.x0 + 0.25, h - 0.1, fz + 0.48); K.bx(0.12, 0.1, 0.95, C.door, c.x1 - 0.25, h - 0.1, fz + 0.48);
    return fy;
  }
  function door(K, x, fy, w2, h2) {   // double wooden door with a latch bar and a ring
    var pl = K.plank(0x8a5a36, 0x7a4a2b);
    K.bx(w2 + 0.16, h2 + 0.1, 0.06, C.lime, x, 0.14 + (h2 + 0.1) / 2, fy + 0.01);
    K.bx(w2 / 2 - 0.02, h2, 0.05, pl, x - w2 / 4, 0.14 + h2 / 2, fy + 0.04); K.bx(w2 / 2 - 0.02, h2, 0.05, pl, x + w2 / 4, 0.14 + h2 / 2, fy + 0.04);
    K.bx(w2 - 0.04, 0.05, 0.06, C.dark, x, 0.14 + h2 * 0.25, fy + 0.07); K.bx(w2 - 0.04, 0.05, 0.06, C.dark, x, 0.14 + h2 * 0.78, fy + 0.07);
    K.bx(w2 * 0.5, 0.04, 0.05, C.iron, x, 0.14 + h2 * 0.5, fy + 0.09); K.tor(0.035, C.gold, x - w2 * 0.1, 0.14 + h2 * 0.5, fy + 0.11, 0); K.tor(0.035, C.gold, x + w2 * 0.1, 0.14 + h2 * 0.5, fy + 0.11, 0);
    K.bx(0.06, 0.1, 0.03, C.iron, x - w2 / 2 + 0.05, 0.14 + h2 * 0.25, fy + 0.08); K.bx(0.06, 0.1, 0.03, C.iron, x - w2 / 2 + 0.05, 0.14 + h2 * 0.78, fy + 0.08);   // hinges
    K.bx(w2 + 0.3, 0.1, 0.3, C.stone, x, 0.05, fy + 0.2);                                                                                                         // step
  }
  function counter(K, c, cm, kind) {
    var i, x, y, pl = K.plank(0xc98b4f, 0xb87a45);
    for (i = 0; i < cm.length; i++) {
      x = cm[i].x; y = cm[i].y;
      K.bx(1, 0.78, 0.8, pl, x, 0.39, y); K.bx(1.1, 0.08, 0.95, C.dark, x, 0.82, y); K.bx(0.9, 0.05, 0.05, C.gold, x, 0.62, y + 0.41);
      if (i) continue;
      if (kind === 'shop') {
        K.bx(0.56, 0.2, 0.5, C.glass, x + 0.17, 0.96, y); K.bx(0.6, 0.03, 0.54, C.dark, x + 0.17, 1.07, y);   // glass sweets case
        K.bx(0.14, 0.1, 0.14, 0xff9bb3, x + 0.02, 0.91, y); K.bx(0.14, 0.1, 0.14, 0xffd166, x + 0.17, 0.91, y); K.bx(0.14, 0.1, 0.14, 0x7fcf7a, x + 0.32, 0.91, y);
        K.fan(x - 0.32, 0.86, y, 0.3);
      } else {
        K.bx(0.3, 0.14, 0.22, C.iron, x, 0.93, y); K.bx(0.18, 0.14, 0.16, C.iron, x, 1.05, y); K.bx(0.5, 0.12, 0.24, 0x8a8590, x, 1.18, y); K.cn(0.1, 0.25, 0x8a8590, x + 0.37, 1.18, y, 0, -PI / 2, 6);
      }
    }
  }
  function roofOf(K, c, o) {
    var z1 = c.z0 - 0.15, z2 = c.fz + 1.1;
    o.x = c.cx; o.z = (z1 + z2) / 2; o.w = c.w + 0.5; o.d = z2 - z1; o.y = c.h - 0.08;
    K.roof(o);
  }

  TV.shop = function (c) {
    var K = VK.make(), i, x0 = c.x0, x1 = c.x1, cx = c.cx, fz = c.fz, h = c.h, fy, wx = x0 + 1.0, dx = x1 - 1.0, sx = (x0 + 1.8 + x1 - 1.75) / 2, bamH = K.bambooH(C.bamA, C.bamB);
    K.o(0, 0);
    fy = shell(K, c, C.plaster);
    K.bx(c.w + 0.02, 0.5, 0.03, C.skirt, cx, 0.39, fy - 0.005); K.bx(c.w + 0.04, 0.1, 0.06, C.lime, cx, h - 0.2, fy + 0.01);   // green tile skirt + lime cornice
    for (i = 0; i < 6; i++) K.bx(c.w + 0.03, 0.012, 0.035, 0x5a8f7a, cx, 0.2 + i * 0.09, fy - 0.003);
    roofOf(K, c, { rise: 0.85, over: 0.12, rw: 0.17, thick: 0.065, c1: C.tile, c2: C.tile2, base: C.tileBase, discs: true, curve: 0.14, gable: C.plaster2 });
    // window with shutters and a half-rolled bamboo blind (mành tre)
    K.bx(0.95, 0.85, 0.06, C.door, wx, 1.25, fy + 0.02); K.bx(0.78, 0.68, 0.05, C.glass, wx, 1.25, fy + 0.045); K.bx(0.03, 0.68, 0.06, C.door, wx, 1.25, fy + 0.06); K.bx(0.78, 0.03, 0.06, C.door, wx, 1.25, fy + 0.06);
    K.bx(0.3, 0.8, 0.04, C.skirt, wx - 0.64, 1.25, fy + 0.03); K.bx(0.3, 0.8, 0.04, C.skirt, wx + 0.64, 1.25, fy + 0.03);
    for (i = 0; i < 5; i++) { K.bx(0.24, 0.015, 0.045, 0x4a7a6a, wx - 0.64, 0.95 + i * 0.15, fy + 0.035); K.bx(0.24, 0.015, 0.045, 0x4a7a6a, wx + 0.64, 0.95 + i * 0.15, fy + 0.035); }
    K.cy(0.05, 1.0, C.bamB, wx, 1.78, fy + 0.1, 0, 0, PI / 2); K.bx(0.96, 0.3, 0.02, bamH, wx, 1.6, fy + 0.09); for (i = 0; i < 4; i++) K.bx(0.96, 0.008, 0.025, C.dark, wx, 1.5 + i * 0.07, fy + 0.095);
    K.bx(0.5, 0.1, 0.2, C.dark, wx, 0.76, fy + 0.1); K.cn(0.05, 0.1, C.green, wx - 0.12, 0.86, fy + 0.1, 0, 0, 5); K.ic(0.06, 0xff9bb3, wx - 0.12, 0.93, fy + 0.1, 0.9); K.ic(0.06, 0xffd166, wx + 0.1, 0.9, fy + 0.1, 0.9);   // flower box
    door(K, dx, fy, 1.0, 1.5);
    K.bx(0.9, 0.18, 0.04, 0x2f2622, dx, 1.78, fy + 0.02);                                                                                                           // transom
    // shelves behind the shopkeeper: candy jars, bottles, packs, baskets
    for (i = 0; i < 2; i++) {
      K.bx(2.5, 0.06, 0.3, C.wood2, sx, 0.88 + i * 0.5, fy + 0.15); K.bx(0.05, 0.12, 0.26, C.dark, sx - 1.2, 0.8 + i * 0.5, fy + 0.15); K.bx(0.05, 0.12, 0.26, C.dark, sx + 1.2, 0.8 + i * 0.5, fy + 0.15);
    }
    for (i = 0; i < 5; i++) { K.cy(0.085, 0.2, 0xdff1f5, sx - 1.0 + i * 0.5, 1.01, fy + 0.15); K.cy(0.09, 0.03, C.red, sx - 1.0 + i * 0.5, 1.13, fy + 0.15); K.sp(0.06, K.SNACK[i], sx - 1.0 + i * 0.5, 1.0, fy + 0.15, 0.9); }
    for (i = 0; i < 5; i++) { if (i % 2) K.bx(0.2, 0.22, 0.14, K.SNACK[(i + 2) % 7], sx - 1.0 + i * 0.5, 1.5, fy + 0.15); else K.tp(0.03, 0.06, 0.26, 8, i === 2 ? 0x7fcf7a : 0xb86d45, sx - 1.0 + i * 0.5, 1.51, fy + 0.15); }
    K.snackBags(sx - 0.9, sx - 0.2, 1.9, fy + 0.2, 4, 0); K.snackBags(sx + 0.3, sx + 1.0, 1.9, fy + 0.2, 4, 3);
    // hanging goods under the front beam: snack bags, red lanterns, nón lá
    K.snackBags(x0 + 0.45, x0 + 1.35, 2.14, fz + 0.95, 5, 1); K.snackBags(x1 - 1.45, x1 - 0.55, 2.14, fz + 0.95, 5, 4);
    K.lantern(x0 + 1.75, 1.98, fz + 0.95, 1); K.lantern(x1 - 1.75, 1.98, fz + 0.95, 1);
    K.nonla(x0 + 0.25, 1.55, fz + 1.02, 0.2, true); K.nonla(x1 - 0.25, 1.55, fz + 1.02, 0.2, true, 0xe8d49a);
    counter(K, c, c.counters, 'shop');
    // plastic stools + low tea table, jar and baskets on the ground
    K.stool(x1 - 1.6, c.counters[0].y + 0.05, 0xd8453a); K.stool(x1 - 0.9, c.counters[0].y + 0.2, 0x4f8fd6); K.stool(x1 - 1.25, c.counters[0].y - 0.15, 0xffd166);
    K.bx(0.5, 0.04, 0.34, C.wood2, x1 - 1.3, 0.4, c.counters[0].y + 0.45); K.cy(0.1, 0.04, C.glaze, x1 - 1.3, 0.44, c.counters[0].y + 0.45);
    K.jar(x1 - 0.3, fz + 0.4, 0.17, C.clay, true); K.basket(x0 + 0.5, fz + 0.4, 0.2, 0.22, [0xff9b50, 0xd8453a, C.gold], 0); K.basket(x0 + 0.95, fz + 0.5, 0.15, 0.18, [C.green], 0);
    c.sign(c.o.sign, c.o.bg, cx, 1.95, fy + 0.03, 1.7, 0.55, c.o.fg);
    return K.merge();
  };

  TV.work = function (c) {
    var K = VK.make(), i, x0 = c.x0, x1 = c.x1, cx = c.cx, fz = c.fz, h = c.h, fy, kx = x0 + 0.75, br = K.brickV(C.brick, C.brick2);
    K.o(0, 0);
    fy = shell(K, c, br);
    K.bx(c.w + 0.04, 0.08, 0.06, C.tileBase, cx, h - 0.2, fy + 0.01);
    roofOf(K, c, { rise: 0.6, over: 0.12, rw: 0.1, thick: 0.045, c1: 0x86b6c8, c2: 0x6f9db2, base: 0x41607a, curve: 0, ridgeC: 0x4f7088, ridgeH: 0.07, ridgeD: 0.2, tips: false, gable: C.brick2 });
    // kiln mouth (lò) with glowing embers
    K.bx(0.98, 1.12, 0.08, C.stone2, kx, 0.72, fy + 0.03); K.bx(0.64, 0.66, 0.1, 0x2a1f1c, kx, 0.58, fy + 0.06); K.cy(0.32, 0.1, 0x2a1f1c, kx, 0.91, fy + 0.06, PI / 2, 0, 0);
    K.tor(0.37, C.stone, kx, 0.91, fy + 0.1, 0); K.bx(0.4, 0.14, 0.05, 0xff8a3d, kx, 0.4, fy + 0.1); K.ic(0.08, 0xffc766, kx - 0.1, 0.5, fy + 0.1, 0.9); K.ic(0.06, 0xff8a3d, kx + 0.1, 0.48, fy + 0.1, 0.9);
    // door with latch
    door(K, x1 - 0.7, fy, 0.78, 1.45);
    // front beam dressing: red lantern, nón lá, hanging tool board
    K.lantern(cx, 1.98, fz + 0.95, 1); K.nonla(x0 + 0.25, 1.55, fz + 1.02, 0.2, true); K.nonla(x1 - 0.25, 1.55, fz + 1.02, 0.2, true, 0xe8d49a);
    K.bx(0.75, 0.5, 0.04, C.door, cx + 0.12, 1.28, fy + 0.03); K.bx(0.05, 0.4, 0.05, C.wood2, cx - 0.08, 1.28, fy + 0.07); K.bx(0.24, 0.1, 0.08, 0x8a8590, cx - 0.08, 1.5, fy + 0.07); K.bx(0.05, 0.4, 0.05, C.wood2, cx + 0.2, 1.28, fy + 0.07); K.bx(0.3, 0.05, 0.05, 0x8a8590, cx + 0.2, 1.5, fy + 0.07);
    counter(K, c, c.counters, 'work');
    // clay pots, chum, stacked bricks, firewood
    K.jar(x0 + 0.4, fz + 0.4, 0.2, C.clay, true); K.jar(x0 + 0.85, fz + 0.5, 0.14, C.glaze, false);
    for (i = 0; i < 3; i++) K.tp(0.15 - i * 0.01, 0.1, 0.14, 10, i % 2 ? C.clay2 : C.clay, x0 + 0.62, 0.07 + i * 0.13, fz + 0.9 - 0.05);
    for (i = 0; i < 6; i++) K.bx(0.32, 0.09, 0.15, i % 2 ? C.brick : C.brick2, x1 - 0.4 + (i % 2) * 0.03, 0.05 + Math.floor(i / 2) * 0.09, fz + 0.35 + (i % 2) * 0.18);
    for (i = 0; i < 4; i++) K.cy(0.05, 0.5, i % 2 ? 0x8a5a36 : 0xa8693a, x1 - 0.95, 0.06 + (i > 1 ? 0.09 : 0), fz + 0.3 + (i % 2) * 0.11 + (i > 1 ? 0.05 : 0), 0, 0, PI / 2);
    c.sign(c.o.sign, c.o.bg, cx, 1.95, fy + 0.03, 1.3, 0.5, c.o.fg);
    return K.merge();
  };
})();
