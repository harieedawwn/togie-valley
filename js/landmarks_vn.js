/* Togie Valley - landmarks_vn.js (Round 2 stage 7): Vietnamese countryside versions of the valley landmarks (Game.LandmarksVN). Same footprints, blocked tiles,
 * spots and ids as js/landmarks.js, which merges these parts into its ONE static mesh (no new draw calls). windmill -> rice mill hut + cọn nước (bamboo water wheel,
 * the wheel is the rotating mesh), shed -> chòi lúa (tôn roof), shrine -> cây đa + miếu, board -> bảng tin đình làng, compost -> giỏ ủ phân, trough -> bể nước with chum. */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.VNKit) { console.error('[landmarks_vn] missing deps'); return; }
  var VK = G.VNKit, C = VK.C, PI = Math.PI, LV = G.LandmarksVN = { ribbons: [] };
  var rnd = G.util.rng(70707);

  /* ---- cọn nước (hub at local origin, wheel in the XY plane) ---- */
  LV.wheel = function () {
    var K = VK.make(), i, a, R = 1.25, N = 16, bam = K.bambooH(C.bamA, C.bamB), x, y, x2, y2;
    K.o(0, 0);
    for (i = 0; i < N; i++) {
      a = i / N * PI * 2; x = Math.cos(a) * R; y = Math.sin(a) * R; x2 = Math.cos(a + PI * 2 / N) * R; y2 = Math.sin(a + PI * 2 / N) * R;
      K.poleXY(x, y, x2, y2, 0.2, 0.035, bam); K.poleXY(x, y, x2, y2, -0.2, 0.035, bam);                      // two rims
      K.cy(0.03, 0.4, C.bamG, x, y, 0, PI / 2, 0, 0);                                                           // cross bar between rims
      K.cy(0.065, 0.2, i % 2 ? C.bamA : C.bamB, x + Math.cos(a) * 0.06, y + Math.sin(a) * 0.06, 0.0, PI / 2, 0, 0);   // bamboo scoop tube (ống tre)
    }
    for (i = 0; i < 8; i++) { a = i / 8 * PI * 2 + 0.2; K.poleXY(0, 0, Math.cos(a) * R, Math.sin(a) * R, 0.2, 0.03, bam); K.poleXY(0, 0, Math.cos(a) * R, Math.sin(a) * R, -0.2, 0.03, bam); }
    K.cy(0.09, 0.62, C.wood, 0, 0, 0, PI / 2, 0, 0); K.cy(0.13, 0.08, C.dark, 0, 0, 0.26, PI / 2, 0, 0); K.cy(0.13, 0.08, C.dark, 0, 0, -0.26, PI / 2, 0, 0);
    return K.merge();
  };

  LV.windmill = function (K) {   // centre (37.5, 10.5); wheel hub is placed by landmarks.js at (37.5, 1.3, 11.5)
    var i, a, bam = K.bambooH(C.bamA, C.bamB), bamV = K.bambooV(C.bamA, C.bamB);
    K.o(37.5, 10.5);
    K.cy(1.45, 0.03, 0xcdb98a, 0, 0.015, 0.05);                                    // worn yard
    K.bx(2.5, 0.14, 1.7, C.stone, 0, 0.07, -0.4); K.bx(2.35, 0.05, 1.55, C.stone2, 0, 0.16, -0.4);
    K.bx(2.2, 1.3, 1.5, bam, 0, 0.85, -0.4);                                       // woven bamboo wall (đan phên)
    for (i = 0; i < 4; i++) K.cy(0.06, 1.45, bamV, (i % 2 ? 1.1 : -1.1), 0.88, (i < 2 ? 0.35 : -1.15));   // corner culms
    K.bx(2.3, 0.07, 0.07, C.wood, 0, 1.5, 0.37); K.bx(0.07, 0.07, 1.6, C.wood, 1.12, 1.5, -0.4); K.bx(0.07, 0.07, 1.6, C.wood, -1.12, 1.5, -0.4);
    K.roof({ x: 0, z: -0.4, w: 2.4, d: 1.75, y: 1.5, rise: 0.8, over: 0.22, rw: 0.2, thick: 0.1, c1: C.thatchA, c2: C.thatchB, base: C.thatchBase, curve: 0.05, ridgeC: 0xb98a42, ridgeH: 0.14, ridgeD: 0.26, tips: false, fringe: true, gable: C.bamB });
    K.bx(0.5, 0.8, 0.05, C.door, 1.115, 0.62, -0.5, 0, PI / 2, 0); K.bx(0.04, 0.04, 0.2, C.iron, 1.15, 0.65, -0.3); K.sp(0.025, C.gold, 1.16, 0.6, -0.33);   // side door + latch
    K.bx(0.5, 0.35, 0.04, C.dark, -0.35, 1.0, 0.36); K.bx(0.42, 0.27, 0.05, 0x2f2622, -0.35, 1.0, 0.37);                                                       // slit window
    for (i = -1; i <= 1; i++) K.bx(0.015, 0.3, 0.06, C.wood, -0.35 + i * 0.12, 1.0, 0.38);
    K.nonla(0.55, 1.05, 0.38, 0.2, true); K.lantern(-1.02, 1.28, 0.42, 1);
    // rice baskets, sacks and a drying mat
    K.basket(1.3, 0.55, 0.22, 0.3, [C.gold, C.thatchA], 0); K.basket(1.0, 0.95, 0.18, 0.26, [C.gold], 0);
    K.sp(0.17, C.cream, -1.25, 0.16, 0.3, 1.1); K.cn(0.06, 0.1, C.cream, -1.25, 0.34, 0.3, 0, 0, 6); K.sp(0.15, 0xe6d3a8, -1.28, 0.14, 0.62, 1.1);
    K.bx(0.95, 0.02, 0.8, C.thatchA, -0.85, 0.04, 1.05, 0, 0.15, 0); K.bx(0.95, 0.025, 0.04, C.bamB, -0.85, 0.05, 1.45, 0, 0.15, 0); K.ic(0.06, C.gold, -0.7, 0.07, 1.05, 0.4);
    K.cy(0.012, 0.9, C.dark, -1.4, 0.45, 0.8, 0, 0, 0.35); K.bx(0.28, 0.025, 0.04, C.dark, -1.57, 0.88, 0.8);   // rake
    // bamboo flume on stilts bringing water to the top of the wheel (water falls from x = 0.1)
    K.cy(0.05, 3.0, bamV, 1.35, 1.5, 0.9); K.cy(0.05, 3.0, bamV, 1.35, 1.5, 1.1); K.cy(0.06, 0.55, C.wood, 0, 1.3, 0.55, PI / 2, 0, 0); K.bx(0.16, 0.16, 0.1, C.dark, 0, 1.3, 0.4);
    K.poleXY(1.35, 2.95, 0.1, 2.85, 0.9, 0.05, bam); K.poleXY(1.35, 2.95, 0.1, 2.85, 1.1, 0.05, bam); K.poleXY(1.3, 2.93, 0.1, 2.83, 1.0, 0.03, C.water);
    K.poleXY(0.95, 1.6, 1.35, 2.2, 1.0, 0.03, C.bamB);
    K.cy(0.5, 0.02, C.water, 0.05, 0.03, 1.05); K.cy(0.36, 0.012, 0xa8e2f0, 0.12, 0.045, 1.1);          // splash pool under the wheel
    for (i = 0; i < 6; i++) { a = i / 6 * PI * 2; K.ic(0.07, i % 2 ? C.stone : C.stone2, 0.05 + Math.cos(a) * 0.62, 0.04, 1.05 + Math.sin(a) * 0.4, 0.55, i); }
    for (i = 0; i < 4; i++) { K.cn(0.025, 0.2, C.green, 1.5 - i * 0.06, 0.1, 1.38 + (i % 2) * 0.05, 0, 0.1, 4); }
  };

  LV.shed = function (K) {   // centre (20, 7): raised chòi lúa with a corrugated tôn roof
    var i, pl = K.plank(0xb77b46, 0xa8693a), bamV = K.bambooV(C.bamA, C.bamB);
    K.o(20, 7);
    K.bx(2.0, 0.02, 1.7, 0xcdb98a, 0, 0.03, 0.2);
    for (i = 0; i < 4; i++) { K.cy(0.065, 0.55, bamV, (i % 2 ? 1 : -1) * 0.72, 0.28, (i < 2 ? 1 : -1) * 0.58); K.ic(0.1, C.stone, (i % 2 ? 1 : -1) * 0.72, 0.03, (i < 2 ? 1 : -1) * 0.58, 0.4); }
    K.bx(1.75, 0.07, 1.5, C.wood2, 0, 0.58, 0); K.bx(1.7, 0.03, 0.05, C.dark, 0, 0.55, 0.77);                   // deck
    K.bx(1.6, 0.8, 1.35, pl, 0, 1.0, 0);                                                                     // plank walls
    for (i = -1; i <= 1; i += 2) { K.bx(0.09, 0.82, 0.09, C.dark, i * 0.82, 1.0, 0.68); K.bx(0.09, 0.82, 0.09, C.dark, i * 0.82, 1.0, -0.68); }
    K.roof({ x: 0, z: 0, w: 2.0, d: 1.5, y: 1.4, rise: 0.4, over: 0.14, rw: 0.1, thick: 0.045, c1: 0x86b6c8, c2: 0x6f9db2, base: 0x41607a, curve: 0, ridgeC: 0x4f7088, ridgeH: 0.07, ridgeD: 0.2, tips: false, gable: 0xb77b46 });
    K.bx(0.56, 0.62, 0.04, C.dark, -0.25, 0.95, 0.69); K.bx(0.5, 0.56, 0.05, C.door, -0.25, 0.95, 0.7);        // door with frame
    K.bx(0.015, 0.56, 0.055, C.dark, -0.25, 0.95, 0.72); K.bx(0.5, 0.05, 0.06, C.dark, -0.25, 0.8, 0.73); K.bx(0.5, 0.05, 0.06, C.dark, -0.25, 1.1, 0.73);
    K.bx(0.14, 0.035, 0.04, C.iron, -0.02, 0.95, 0.75); K.tor(0.04, C.gold, -0.06, 0.95, 0.76, 0);              // latch bar + ring
    K.bx(0.34, 0.28, 0.04, C.dark, 0.5, 1.1, 0.68); K.bx(0.26, 0.2, 0.05, 0x2f2622, 0.5, 1.1, 0.7);              // small window with shutters
    K.bx(0.1, 0.24, 0.03, C.glaze, 0.28, 1.1, 0.72); K.bx(0.1, 0.24, 0.03, C.glaze, 0.72, 1.1, 0.72);
    // ladder (thang tre) to the deck
    K.poleZY(-0.5, 0.0, 1.05, 0.58, 0.8, 0.03, C.bamB); K.poleZY(0.0, 0.0, 1.05, 0.58, 0.8, 0.03, C.bamB);
    for (i = 0; i < 4; i++) K.cy(0.02, 0.5, C.bamG, -0.25, 0.1 + i * 0.12, 1.0 - i * 0.065, 0, 0, PI / 2);
    // hanging corn (bắp), nón lá, red lantern, sacks, jar, rake
    K.bx(1.2, 0.03, 0.03, C.dark, 0, 1.3, 0.86); for (i = 0; i < 5; i++) { K.cn(0.045, 0.2, C.gold, -0.45 + i * 0.22, 1.18, 0.86, PI, 0, 6); K.cn(0.05, 0.07, C.green, -0.45 + i * 0.22, 1.3, 0.86, 0, 0, 5); }
    K.nonla(0.95, 1.0, 0.7, 0.2, true); K.lantern(-0.82, 1.2, 0.8, 0.9);
    K.sp(0.2, C.cream, 0.88, 0.2, 1.0, 1.1); K.cn(0.07, 0.12, C.cream, 0.88, 0.42, 1.0, 0, 0, 6); K.sp(0.17, 0xe6d3a8, 0.62, 0.17, 1.15, 1.1);
    K.jar(-0.9, 0.95, 0.2, C.clay, true); K.basket(-0.75, 1.3, 0.14, 0.18, [C.red, C.gold], 0);
    K.cy(0.012, 1.1, C.dark, 0.9, 0.6, -0.5, 0, 0, -0.1); K.bx(0.3, 0.025, 0.025, C.iron, 0.9, 1.15, -0.5, 0, 0, -0.1);
    for (i = 0; i < 3; i++) K.cn(0.025, 0.18, C.green, -1.12, 0.09, -0.4 + i * 0.35, 0, 0.1, 4);
  };

  LV.shrine = function (K) {   // cây đa at (6.5, 18.5) + a tile-roofed miếu in front
    var i, a, r, rib = [0xd8453a, 0xe8715d, C.gold, 0xd8453a, 0xffffff, 0xf2c14e];
    K.o(6.5, 18.5);
    K.cy(1.4, 0.025, C.glaze, 0, 0.012, 0.05); K.cy(1.0, 0.02, 0x78b36a, 0, 0.03, 0);
    for (i = 0; i < 14; i++) { a = rnd() * PI * 2; r = 0.6 + rnd() * 0.8; K.cy(0.04 + rnd() * 0.03, 0.01, i % 3 ? 0xc9d98a : 0x7fc27c, Math.cos(a) * r, 0.045, Math.sin(a) * r); }
    K.tp(0.38, 0.55, 0.7, 8, 0x7a5a45, 0, 0.35, 0); K.tp(0.3, 0.38, 0.6, 8, 0x65483a, 0.05, 0.98, -0.02, 0, 0, -0.08); K.tp(0.2, 0.3, 0.55, 8, 0x7a5a45, 0.12, 1.5, -0.05, 0, 0, -0.18);
    K.tp(0.06, 0.12, 0.7, 6, 0x7a5a45, -0.4, 1.72, -0.02, 0, 0, 0.95); K.tp(0.06, 0.11, 0.7, 6, 0x65483a, 0.55, 1.78, 0, 0, 0, -1.0); K.tp(0.05, 0.09, 0.55, 6, 0x7a5a45, 0.2, 1.85, 0.35, 0.8, 0, -0.2);
    for (i = 0; i < 7; i++) { a = i / 7 * PI * 2 + 0.4; K.ic(0.15 + rnd() * 0.06, i % 2 ? 0x7a5a45 : 0x65483a, Math.cos(a) * 0.52, 0.09, Math.sin(a) * 0.52 - (Math.sin(a) > 0.6 ? 0.1 : 0), 0.55, rnd() * 3); }
    K.ic(0.13, 0x78b36a, 0.38, 0.62, 0.22, 0.5); K.ic(0.11, 0x78b36a, -0.35, 0.78, -0.2, 0.5);
    K.ic(0.85, 0x4f9660, 0, 2.35, 0, 0.8); K.ic(0.6, 0x3f8a58, -0.75, 2.02, 0.1, 0.8); K.ic(0.62, 0x5aa86a, 0.78, 2.08, -0.1, 0.8); K.ic(0.62, 0x6fb877, 0.1, 2.88, -0.1, 0.8);
    K.ic(0.5, 0x3f8a58, 0.0, 2.2, 0.62, 0.8); K.ic(0.55, 0x6fb877, -0.3, 2.62, -0.5, 0.8); K.ic(0.4, 0x5aa86a, 0.55, 2.55, 0.4, 0.8); K.ic(0.35, 0x4f9660, -0.95, 2.45, -0.3, 0.8);
    for (i = 0; i < 9; i++) { a = i / 9 * PI * 2 + 0.2; r = 0.55 + (i % 3) * 0.2; K.cy(0.014, 0.9 + (i % 4) * 0.25, 0x8a6a50, Math.cos(a) * r, 1.45 - (i % 4) * 0.1, Math.sin(a) * r + 0.1); }   // aerial roots (rễ đa)
    K.tor(0.46, C.red, 0.06, 1.18, -0.03); K.tor(0.44, C.gold, 0.06, 1.05, -0.03);                               // sacred sash round the trunk
    // miếu: small shrine house, curved yin-yang tile roof
    K.bx(1.3, 0.14, 0.78, C.stone, 0, 0.07, 0.95); K.bx(1.1, 0.5, 0.58, C.plaster2, 0, 0.39, 0.92);
    K.bx(1.14, 0.08, 0.62, C.skirtColor || C.skirt, 0, 0.17, 0.92); K.bx(0.4, 0.38, 0.05, 0x2f2622, 0, 0.42, 1.22); K.bx(0.5, 0.06, 0.08, C.red, 0, 0.64, 1.23);
    K.bx(0.06, 0.4, 0.07, C.red, -0.24, 0.42, 1.23); K.bx(0.06, 0.4, 0.07, C.red, 0.24, 0.42, 1.23);
    K.bx(0.14, 0.14, 0.04, C.gold, 0, 0.42, 1.25); K.sp(0.04, C.red, 0, 0.7, 1.27);
    K.roof({ x: 0, z: 0.93, w: 1.45, d: 0.85, y: 0.64, rise: 0.4, over: 0.1, rw: 0.1, thick: 0.045, c1: C.tile, c2: C.tile2, base: C.tileBase, discs: true, curve: 0.14, gable: C.plaster2 });
    K.bx(0.04, 0.5, 0.04, C.red, -0.52, 0.39, 1.24); K.bx(0.04, 0.5, 0.04, C.red, 0.52, 0.39, 1.24);
    // incense bowl (bát hương), offerings, lanterns
    K.tp(0.12, 0.09, 0.14, 10, C.stone, 0, 0.22, 1.42); K.cy(0.11, 0.02, 0x2f2622, 0, 0.3, 1.42); for (i = -1; i <= 1; i++) { K.cy(0.008, 0.2, C.red, i * 0.04, 0.4, 1.42); K.sp(0.012, C.gold, i * 0.04, 0.5, 1.42); }
    K.bx(0.34, 0.03, 0.2, C.wood2, -0.52, 0.07, 1.4); K.ic(0.05, 0xff9b50, -0.6, 0.13, 1.4, 0.9); K.ic(0.05, 0xff9b50, -0.5, 0.13, 1.38, 0.9); K.ic(0.045, C.gold, -0.55, 0.13, 1.45, 0.9);
    K.bx(0.3, 0.03, 0.18, C.wood2, 0.52, 0.07, 1.4); K.cy(0.06, 0.05, C.cream, 0.52, 0.12, 1.4); K.cy(0.011, 0.14, C.red, 0.46, 0.2, 1.4); K.cy(0.011, 0.14, C.red, 0.58, 0.2, 1.4);
    K.lantern(-0.62, 0.95, 0.62, 0.9); K.lantern(0.62, 0.95, 0.62, 0.9);
    K.jar(-1.0, 0.95, 0.17, C.glaze, true); K.jar(1.05, 1.0, 0.15, C.clay, true);
    // red/yellow cloth strips tied on the branches (cloth mesh in landmarks.js)
    LV.ribbons.length = 0;
    for (i = 0; i < 9; i++) { a = i / 9 * PI * 2 + rnd() * 0.4; r = 0.75 + rnd() * 0.3; LV.ribbons.push([6.5 + Math.cos(a) * r, 1.95 + rnd() * 0.2, 18.5 + Math.sin(a) * r + 0.1, 0.5 + rnd() * 0.3, rib[i % rib.length], a]); }
  };

  LV.board = function (K) {   // centre (38, 20.5): bảng tin đình làng under a small curved tile canopy
    var i, bamV = K.bambooV(C.bamA, C.bamB);
    K.o(38, 20.5);
    K.bx(1.9, 0.02, 0.8, 0xcdb98a, 0, 0.03, 0.15);
    for (i = -1; i <= 1; i += 2) { K.cy(0.075, 1.65, 0x8a4a2e, i * 0.88, 0.83, -0.02); K.bx(0.22, 0.1, 0.22, C.stone2, i * 0.88, 0.05, -0.02); K.sp(0.06, C.gold, i * 0.88, 1.7, -0.02); }
    K.bx(1.55, 0.82, 0.07, K.plank(0xd9a066, 0xc98b4f), 0, 1.0, 0);                                 // plank panel
    K.bx(1.66, 0.06, 0.1, C.door, 0, 1.43, 0); K.bx(1.66, 0.06, 0.1, C.door, 0, 0.59, 0); K.bx(0.06, 0.82, 0.1, C.door, -0.8, 1.0, 0); K.bx(0.06, 0.82, 0.1, C.door, 0.8, 1.0, 0);
    K.roof({ x: 0, z: 0, w: 2.1, d: 0.95, y: 1.62, rise: 0.32, over: 0.08, rw: 0.1, thick: 0.045, c1: C.tile, c2: C.tile2, base: C.tileBase, discs: true, curve: 0.13, gable: C.door });
    K.bx(1.9, 0.07, 0.07, C.door, 0, 1.6, 0.4); K.bx(1.9, 0.07, 0.07, C.door, 0, 1.6, -0.4);
    K.bx(0.42, 0.52, 0.012, C.cream, -0.5, 1.03, 0.045); K.bx(0.42, 0.08, 0.014, C.red, -0.5, 1.23, 0.048);
    for (i = 0; i < 4; i++) K.bx(0.3, 0.018, 0.014, C.iron, -0.5, 1.07 - i * 0.07, 0.05);
    K.bx(0.3, 0.38, 0.012, 0xffd9e0, 0.02, 1.1, 0.045, 0, 0, 0.04); for (i = 0; i < 3; i++) K.bx(0.2, 0.016, 0.014, C.iron, 0.02, 1.15 - i * 0.07, 0.05, 0, 0, 0.04);
    K.bx(0.34, 0.44, 0.012, 0xd9f0e8, 0.5, 0.97, 0.045, 0, 0, -0.03); K.bx(0.34, 0.07, 0.014, 0x4fb3c8, 0.5, 1.15, 0.048, 0, 0, -0.03);
    for (i = 0; i < 3; i++) K.bx(0.22, 0.016, 0.014, C.iron, 0.5, 1.0 - i * 0.07, 0.05, 0, 0, -0.03);
    K.sp(0.025, 0xe8715d, -0.5, 1.25, 0.06); K.sp(0.025, 0x4fb3c8, 0.02, 1.27, 0.06); K.sp(0.025, C.gold, 0.5, 1.2, 0.06);
    K.lantern(0.78, 1.45, 0.3, 0.9); K.lantern(-0.78, 1.45, 0.3, 0.9);
    // tea set on a bamboo bench + little jar
    K.bx(0.7, 0.05, 0.22, K.bambooH(C.bamA, C.bamB), 0.55, 0.3, 0.42); for (i = -1; i <= 1; i += 2) { K.cy(0.03, 0.3, bamV, 0.55 + i * 0.3, 0.15, 0.42); }
    K.tp(0.06, 0.08, 0.1, 8, C.glaze, 0.45, 0.38, 0.42); K.cy(0.03, 0.04, C.cream, 0.62, 0.35, 0.42); K.cy(0.03, 0.04, C.cream, 0.7, 0.35, 0.44);
    K.jar(-0.78, 0.35, 0.14, C.clay, true);
    for (i = 0; i < 4; i++) K.cn(0.022, 0.16, C.green, 0.95 + (i % 2) * 0.05, 0.08, 0.1 + i * 0.2, 0, 0.1, 4);
  };

  LV.compost = function (K) {   // giỏ ủ phân at (10.5, 15.5): woven bamboo bin with straw
    var i, bam = K.bambooH(C.bamA, C.bamB);
    K.o(10.5, 15.5);
    K.bx(0.95, 0.02, 0.95, 0xcdb98a, 0, 0.03, 0.05);
    K.tp(0.4, 0.34, 0.75, 12, bam, 0, 0.4, 0); K.tor(0.4, C.bamB, 0, 0.74, 0, PI / 2); K.tor(0.37, C.bamB, 0, 0.45, 0, PI / 2); K.tor(0.35, C.bamB, 0, 0.18, 0, PI / 2);
    for (i = 0; i < 3; i++) K.cy(0.025, 0.85, C.bamG, Math.cos(i * 2.1) * 0.4, 0.45, Math.sin(i * 2.1) * 0.4);
    K.ic(0.36, 0x7a5236, 0, 0.76, 0, 0.45); K.ic(0.2, C.thatchA, 0.12, 0.88, 0.08, 0.5); K.ic(0.12, C.green, -0.15, 0.9, -0.05, 0.5); K.ic(0.09, 0xd9a066, 0.0, 0.93, 0.15, 0.5);
    for (i = 0; i < 4; i++) K.cy(0.012, 0.3, C.thatchA, -0.1 + i * 0.07, 0.98, 0.0, 0, 0, 0.6 - i * 0.4);
    K.cy(0.014, 1.05, C.dark, 0.55, 0.52, 0.2, 0, 0, -0.12); K.nonla(0.57, 1.05, 0.2, 0.2, false);                         // pole with a nón lá on top
    K.cy(0.012, 0.85, C.dark, -0.55, 0.42, 0.3, 0, 0, 0.3); K.bx(0.28, 0.025, 0.03, C.iron, -0.68, 0.83, 0.3, 0, 0, 0.3);   // rake
    for (i = -2; i <= 2; i++) K.bx(0.012, 0.07, 0.012, C.iron, -0.68 + i * 0.001, 0.78, 0.3 + i * 0.05, 0, 0, 0.3);
    K.sp(0.07, 0x6b4a32, 0.35, 0.06, 0.55, 0.6); K.sp(0.07, 0x6b4a32, 0.5, 0.06, 0.5, 0.6);                                   // coconut shells
    for (i = 0; i < 3; i++) K.cn(0.022, 0.16, C.green, -0.5 + rnd() * 0.2, 0.08, 0.35 + i * 0.15, 0, 0.1, 4);
  };

  LV.trough = function (K) {   // bể nước at (11, 17.5): bamboo trough fed by a bamboo pipe, chum + lu, gáo dừa
    var i, bam = K.bambooH(C.bamA, C.bamB), bamV = K.bambooV(C.bamA, C.bamB);
    K.o(11, 17.5);
    K.bx(1.9, 0.02, 0.75, 0xcdb98a, 0, 0.03, 0.05);
    K.bx(1.0, 0.07, 0.38, C.door, 0.3, 0.3, 0); K.bx(1.1, 0.26, 0.05, bam, 0.3, 0.42, -0.2); K.bx(1.1, 0.26, 0.05, bam, 0.3, 0.42, 0.2);
    K.bx(0.05, 0.26, 0.45, C.bamB, -0.25, 0.42, 0); K.bx(0.05, 0.26, 0.45, C.bamB, 0.85, 0.42, 0); K.bx(0.98, 0.012, 0.34, C.water, 0.3, 0.5, 0); K.bx(0.4, 0.014, 0.1, 0xa8e2f0, 0.15, 0.505, 0.02);
    for (i = -1; i <= 1; i += 2) { K.cy(0.04, 0.3, bamV, 0.3 + i * 0.45, 0.15, -0.14); K.cy(0.04, 0.3, bamV, 0.3 + i * 0.45, 0.15, 0.14); }
    K.cy(0.04, 1.05, bamV, 0.95, 0.52, 0.0); K.poleXY(0.95, 0.98, 0.5, 0.74, 0.0, 0.05, bam); K.cy(0.012, 0.22, C.water, 0.5, 0.62, 0.0); K.cy(0.07, 0.012, C.leaf2 || 0x7fc27c, 0.3, 0.512, 0.04);   // pipe + drip
    K.jar(-0.72, -0.05, 0.25, C.clay, true); K.jar(-0.35, 0.3, 0.19, C.glaze, true); K.jar(-0.38, -0.3, 0.15, C.clay, false);
    K.cy(0.012, 0.3, C.dark, 0.88, 0.82, 0.22, 0, 0, 0.5); K.sp(0.06, 0x6b4a32, 0.95, 0.78, 0.22, 0.8);                    // gáo dừa on a nail
    K.cy(0.13, 0.2, 0xc4c8cd, 0.0, 0.1, 0.45); K.cy(0.115, 0.02, C.water, 0.0, 0.19, 0.45); K.bx(0.28, 0.02, 0.02, C.iron, 0.0, 0.23, 0.45);   // bucket
    K.basket(0.75, 0.42, 0.13, 0.15, [0xff9b50, C.gold], 0);
    for (i = 0; i < 3; i++) K.cn(0.022, 0.16, C.green, -0.95 + rnd() * 0.1, 0.08, -0.1 + i * 0.25, 0, 0.1, 4);
  };

  /* ---- phase 2: secondary buildings (quán nước, mái đình nghỉ chân) ---- */
  LV.signs = [];   // painted sign planes drawn by landmarks.js through Town.signPlane: {text, bg, fg, x, y, z, w, h}
  LV.quan = function (K) {   // quán nước at (41, 22): thatched drink stall facing +z
    var i, bam = K.bambooH(C.bamA, C.bamB), bamV = K.bambooV(C.bamA, C.bamB);
    K.o(41, 22);
    K.bx(2.2, 0.02, 1.9, 0xcdb98a, 0, 0.03, 0.0);
    K.bx(2.0, 0.1, 1.5, C.stone, 0, 0.05, -0.05); K.bx(2.0, 1.35, 0.1, bam, 0, 0.8, -0.78);                       // plinth + woven back wall
    K.bx(0.1, 1.2, 1.2, bam, -0.97, 0.7, -0.2); K.bx(0.1, 1.2, 1.2, bam, 0.97, 0.7, -0.2);                        // side walls
    for (i = -1; i <= 1; i += 2) { K.cy(0.06, 1.55, bamV, i * 1.0, 0.8, 0.72); K.cy(0.06, 1.55, bamV, i * 1.0, 0.8, -0.78); }
    K.bx(2.1, 0.1, 0.1, C.door, 0, 1.5, 0.72); K.bx(2.1, 0.08, 0.08, C.door, 0, 1.45, -0.78);
    K.roof({ x: 0, z: -0.02, w: 2.3, d: 1.75, y: 1.5, rise: 0.6, over: 0.2, rw: 0.18, thick: 0.09, c1: C.thatchA, c2: C.thatchB, base: C.thatchBase, curve: 0.05, ridgeC: 0xb98a42, ridgeH: 0.13, ridgeD: 0.25, tips: false, fringe: true, gable: C.bamB });
    K.bx(1.8, 0.7, 0.5, K.plank(0xc98b4f, 0xb87a45), 0, 0.45, -0.35); K.bx(1.9, 0.07, 0.62, C.dark, 0, 0.83, -0.35);   // counter
    K.sp(0.11, C.glaze, -0.6, 0.97, -0.35, 0.9); K.bx(0.14, 0.04, 0.04, C.glaze, -0.45, 1.0, -0.35, 0, 0, 0.5); K.cy(0.07, 0.03, C.dark, -0.6, 1.1, -0.35);   // kettle
    K.tp(0.15, 0.17, 0.36, 10, 0xe8a24a, -0.2, 1.06, -0.4); K.tp(0.16, 0.16, 0.05, 10, C.red, -0.2, 1.27, -0.4); K.bx(0.06, 0.04, 0.05, C.iron, -0.2, 0.96, -0.2);   // iced-tea cooler
    K.cy(0.05, 0.4, 0xc4c8cd, 0.2, 1.08, -0.4); K.cy(0.05, 0.4, 0xc4c8cd, 0.34, 1.08, -0.4); K.cy(0.15, 0.04, C.iron, 0.27, 1.3, -0.4); K.bx(0.22, 0.03, 0.03, C.iron, 0.27, 1.33, -0.4);   // sugar-cane press
    for (i = 0; i < 3; i++) K.cy(0.035, 0.09, C.glass, -0.05 + i * 0.1, 0.92, -0.18);                                // glasses
    for (i = 0; i < 4; i++) K.sp(0.09, i % 2 ? 0xcfe3a0 : 0xe6efc4, 0.62 + (i % 2) * 0.14, 0.95 + (i > 1 ? 0.12 : 0), -0.35 + (i % 2) * 0.08, 1.05);   // coconuts
    K.bx(0.7, 0.4, 0.03, 0x2f2622, 0.5, 1.15, -0.72); for (i = 0; i < 4; i++) K.bx(0.4, 0.016, 0.02, i % 2 ? C.gold : C.cream, 0.5, 1.28 - i * 0.07, -0.7);   // menu board
    K.nonla(-0.55, 1.1, -0.72, 0.22, true); K.lantern(-0.85, 1.28, 0.78, 1); K.lantern(0.85, 1.28, 0.78, 1);
    K.stool(-0.4, 0.55, 0xd8453a); K.stool(0.1, 0.7, 0x4f8fd6); K.stool(0.55, 0.5, 0xffd166); K.bx(0.45, 0.04, 0.32, C.wood2, 0.1, 0.4, 0.35); K.cy(0.035, 0.05, C.cream, 0.0, 0.45, 0.35); K.cy(0.035, 0.05, C.cream, 0.2, 0.45, 0.33);
    K.jar(1.15, 0.2, 0.17, C.clay, true); K.basket(-1.15, 0.2, 0.15, 0.16, [0xff9b50, C.green], 0);
    LV.signs.push({ text: 'QUÁN NƯỚC', bg: '#4f9a6a', fg: '#fff1d0', x: 41, y: 1.2, z: 22.8, w: 1.5, h: 0.46 });
  };

  LV.dinh = function (K) {   // mái đình nghỉ chân at (36, 22): open pavilion, curved tile roof, benches
    var i, bamV = K.bambooV(C.bamA, C.bamB);
    K.o(36, 22);
    K.bx(1.95, 0.02, 1.7, 0xcdb98a, 0, 0.03, 0.0); K.bx(1.8, 0.12, 1.5, C.stone, 0, 0.06, 0); K.bx(1.7, 0.03, 1.4, C.stone2, 0, 0.13, 0);
    for (i = 0; i < 4; i++) { K.cy(0.07, 1.8, 0x8a4a2e, (i % 2 ? 1 : -1) * 0.78, 1.05, (i < 2 ? 1 : -1) * 0.62); K.bx(0.2, 0.08, 0.2, C.stone2, (i % 2 ? 1 : -1) * 0.78, 0.16, (i < 2 ? 1 : -1) * 0.62); }
    K.bx(1.7, 0.1, 0.1, C.door, 0, 1.88, 0.62); K.bx(1.7, 0.1, 0.1, C.door, 0, 1.88, -0.62); K.bx(0.1, 0.1, 1.35, C.door, -0.78, 1.88, 0); K.bx(0.1, 0.1, 1.35, C.door, 0.78, 1.88, 0);
    K.roof({ x: 0, z: 0, w: 1.95, d: 1.55, y: 1.92, rise: 0.55, over: 0.14, rw: 0.14, thick: 0.06, c1: C.tile, c2: C.tile2, base: C.tileBase, discs: true, curve: 0.15, gable: C.plaster2 });
    K.bx(1.5, 0.08, 0.34, K.bambooH(C.bamA, C.bamB), 0, 0.42, -0.45); K.bx(1.5, 0.3, 0.05, C.door, 0, 0.3, -0.62);   // back bench
    K.bx(1.5, 0.45, 0.04, K.bambooH(C.bamB, C.bamA), 0, 0.75, -0.66); for (i = -2; i <= 2; i++) K.cy(0.03, 0.4, bamV, i * 0.34, 0.2, -0.45);   // bamboo backrest + legs
    K.bx(0.34, 0.07, 0.9, C.wood2, -0.55, 0.38, 0.05); K.bx(0.34, 0.07, 0.9, C.wood2, 0.55, 0.38, 0.05);
    K.tp(0.07, 0.09, 0.14, 8, C.glaze, 0.5, 0.49, -0.45); K.cy(0.035, 0.05, C.cream, 0.3, 0.48, -0.45); K.cy(0.035, 0.05, C.cream, 0.7, 0.48, -0.42);   // tea set
    K.lantern(-0.3, 1.62, 0.62, 1); K.lantern(0.3, 1.62, 0.62, 1); K.nonla(0.78, 1.45, 0.7, 0.2, true);
    K.jar(-1.0, 0.7, 0.17, C.glaze, true); K.jar(1.02, 0.72, 0.15, C.clay, true);
    for (i = 0; i < 4; i++) K.cn(0.022, 0.16, C.green, -0.95 + i * 0.3, 0.08, 0.95, 0, 0.1, 4);
    K.cy(0.016, 1.1, 0xe8e2d0, 0, 2.9, 0); K.cn(0.03, 0.06, 0xe0b040, 0, 3.47, 0, 0, 0, 8);   // flagpole on the ridge (flag cloth: landmarks.js)
  };
  LV.flag = { x: 36, y: 2.95, z: 22, w: 0.6, h: 0.4 };   // Vietnamese flag on the dinh ridge, hoist edge at the pole, 3:2
})();
