/* Togie Valley - boot_scene.js (Round 3 stage 30): light 3D diorama behind the splash / loading / title, plus the loading progress bar.
 * Loads right after vendor/three.min.js. Own renderer + canvas (#tv-boot, pixel ratio <= 1.5, 30 fps), 8 draw calls, merged vertex-colour geometry.
 * API: Game.BootScene { start(), handOver(), release(), live(), create(opts), registerLayer(fn), garden }.
 *  - handOver(): main.js calls it BEFORE Render.init. Renders a last frame into a still 2D canvas (kept as the title backdrop), then fully disposes
 *    the scene, renderer and context, so two WebGL contexts are never alive at once.
 *  - release(): panels.js calls it when the title closes; fades the still out and removes it.
 *  - registerLayer(fn): hook for the garden mini-game (next stage). fn(ctx) runs once at build, ctx = {THREE, group, garden, mat, track(geo)};
 *    return {update(t, dt), dispose()}. Layers added after start() are ignored. G.BootScene.garden = free soil patch {x, y, z, w, d} on the island.
 * Stage 31: js/boot_garden.js (loaded before this file) adds the 3-plot garden as a layer; while it is live handOver() keeps the scene alive
 * (a 2nd GL context during the title) and release() freezes + disposes it. G.BootScene.garden is now the 3.0 x 1.1 bed.
 * Fallback (CSS background stays): no THREE / WebGL, deviceMemory <= 2, prefers-reduced-motion. The progress bar works in every case.
 */
(function () {
  'use strict';
  var G = window.Game = window.Game || {};
  var me = typeof document !== 'undefined' ? document.currentScript : null;
  var TOTAL = me && +me.getAttribute('data-total') || 0;
  var FOGC = 0xe6f2ec, layers = [], inst = null, still = null, GARDEN = { x: 0, y: 0.2, z: 1.75, w: 3.0, d: 1.1 };
  var COL = { grass: 0x8ccf63, grass2: 0xa4d977, dirt: 0xb98a5c, dirt2: 0x8c5a34, sand: 0xf5e2aa, wall: 0xfff1d0, roof: 0xe0775a, wood: 0xc99256,
    wood2: 0xa87238, white: 0xffffff, trunk: 0x9c6b3c, leaf: 0x5fb04a, leaf2: 0x7cc24f, bamboo: 0x9ad06a, bamboo2: 0x6fae4a, stone: 0xd8cdb8, soil: 0x7a4f31 };

  /* ------------------------------------------------ progress bar (no THREE needed) */
  var barFill = null, barTxt = null, lastN = -1, timer = 0;
  function countScripts() {
    var s = document.scripts, i, n = 0;
    for (i = 0; i < s.length; i++) if (s[i].src) n++;
    return n;
  }
  function progress() {
    var sp = document.getElementById('tv-splash');
    if (!sp || !sp.parentNode) { clearInterval(timer); return; }
    if (!barFill) { barFill = sp.querySelector('.sp-bar i'); barTxt = sp.querySelector('.sp-txt'); }
    var n = countScripts();
    if (n === lastN) return;
    lastN = n;
    var pct = TOTAL ? Math.min(100, Math.round(n * 100 / TOTAL)) : 0;
    if (barFill) barFill.style.transform = 'scaleX(' + (pct / 100) + ')';
    if (barTxt) barTxt.textContent = pct >= 100 ? 'Đang dựng nông trại...' : 'Đang tải... ' + pct + '%';
  }
  if (typeof document !== 'undefined' && TOTAL) { progress(); timer = setInterval(progress, 100); }

  /* ------------------------------------------------ geometry builder (merged vertex colours) */
  function Builder(T) {
    this.T = T; this.p = []; this.n = []; this.c = []; this.i = []; this.o = 0;
    this.m = new T.Matrix4(); this.q = new T.Quaternion(); this.e = new T.Euler(); this.v = new T.Vector3(); this.s = new T.Vector3(); this.col = new T.Color();
  }
  Builder.prototype.add = function (geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
    var T = this.T, pos, nor, idx, k, col = this.col.setHex(hex), gc = geo.attributes.color ? geo.attributes.color.array : null;
    this.e.set(rx || 0, ry || 0, rz || 0);
    this.m.compose(this.v.set(x || 0, y || 0, z || 0), this.q.setFromEuler(this.e), this.s.set(sx || 1, sy || 1, sz || 1));
    geo.applyMatrix4(this.m);
    pos = geo.attributes.position.array; nor = geo.attributes.normal.array; idx = geo.index.array;
    for (k = 0; k < pos.length; k++) { this.p.push(pos[k]); this.n.push(nor[k]); }
    for (k = 0; k < pos.length; k += 3) { if (gc) this.c.push(gc[k], gc[k + 1], gc[k + 2]); else this.c.push(col.r, col.g, col.b); }
    for (k = 0; k < idx.length; k++) this.i.push(idx[k] + this.o);
    this.o += pos.length / 3;
    geo.dispose();
    return this;
  };
  Builder.prototype.box = function (hex, x, y, z, w, h, d, ry) { return this.add(new this.T.BoxBufferGeometry(w, h, d), hex, x, y, z, 0, ry || 0, 0); };
  Builder.prototype.cyl = function (hex, x, y, z, rt, rb, h, seg, rx, rz) { return this.add(new this.T.CylinderBufferGeometry(rt, rb, h, seg || 8), hex, x, y, z, rx || 0, 0, rz || 0); };
  Builder.prototype.ball = function (hex, x, y, z, r, sx, sy, sz, ws, hs) { return this.add(new this.T.SphereBufferGeometry(r, ws || 8, hs || 6), hex, x, y, z, 0, 0, 0, sx || 1, sy || 1, sz || 1); };
  Builder.prototype.cone = function (hex, x, y, z, r, h, seg, rx, ry, rz) { return this.add(new this.T.ConeBufferGeometry(r, h, seg || 6), hex, x, y, z, rx || 0, ry || 0, rz || 0); };
  Builder.prototype.build = function () {
    var T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return g;
  };

  /* mid-quality toon shader (one ShaderMaterial for everything lit): 3-band ramp with a cool shadow tint, hemisphere term, rim light, fog.
   * Fake AO is baked into the vertex colours (lawn blobs, object feet, island underside). No lights in the scene. */
  var VS = 'varying vec3 vN; varying vec3 vW; varying vec3 vC;\n#include <fog_pars_vertex>\nvoid main() { vC = color; vN = mat3(modelMatrix) * normal; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;\n vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}';
  var FS = 'uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 shadeTint; uniform vec3 skyCol; uniform vec3 gndCol; uniform vec3 rimCol;\nvarying vec3 vN; varying vec3 vW; varying vec3 vC;\n#include <fog_pars_fragment>\n' +
    'void main() { vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N; vec3 V = normalize(cameraPosition - vW); float nl = dot(N, sunDir);\n' +
    ' float band = smoothstep(-0.1, 0.14, nl) * 0.55 + smoothstep(0.38, 0.6, nl) * 0.45;\n' +
    ' vec3 base = vC * mix(gndCol, skyCol, N.y * 0.5 + 0.5);\n' +
    ' vec3 col = mix(base * shadeTint, base * sunCol, band);\n' +
    ' float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);\n' +
    ' col += rimCol * rim * 0.3 * (0.35 + 0.65 * smoothstep(-0.2, 0.6, nl));\n' +
    ' gl_FragColor = vec4(col, 1.0);\n#include <fog_fragment>\n}';
  function toonMaterial(T) {
    var u = T.UniformsUtils.merge([T.UniformsLib.fog, { sunDir: { value: new T.Vector3(-0.55, 0.75, 0.45).normalize() }, sunCol: { value: new T.Color(1.12, 1.08, 0.96) },
      shadeTint: { value: new T.Color(0.64, 0.74, 0.95) }, skyCol: { value: new T.Color(1.0, 1.0, 0.98) }, gndCol: { value: new T.Color(0.8, 0.88, 0.7) }, rimCol: { value: new T.Color(1.0, 0.96, 0.85) } }]);
    return new T.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, vertexColors: true, fog: true, side: T.DoubleSide });
  }

  /* ------------------------------------------------ the island (everything static merged into one mesh) */
  var BAYS = [[2.7, 0.5, 0.26], [-1.83, 0.45, 0.22], [0.96, 0.4, 0.2]];   // [angle, depth, width]: three gentle bays
  var WM = { x: 0.9, z: -2.2 }, SEG = 56;
  var BLOBS = [[-1.2, -0.8, 1.25, 0.32], [WM.x, WM.z, 0.85, 0.28], [2.6, -1.3, 0.6, 0.22], [-2.3, -1.3, 0.8, 0.22]];   // fake AO on the lawn: x, z, radius, strength
  function outline(th) {   // organic silhouette radius at angle th
    var r = 3.6 + 0.16 * Math.sin(2 * th + 0.7) + 0.1 * Math.sin(3 * th + 2.1) + 0.06 * Math.sin(5 * th), k, d;
    for (k = 0; k < BAYS.length; k++) { d = Math.atan2(Math.sin(th - BAYS[k][0]), Math.cos(th - BAYS[k][0])); r -= BAYS[k][1] * Math.exp(-d * d / (2 * BAYS[k][2] * BAYS[k][2])); }
    return r;
  }
  function lawnAO(x, z) {
    var k, d, t, f = 1;
    for (k = 0; k < BLOBS.length; k++) { d = Math.sqrt((x - BLOBS[k][0]) * (x - BLOBS[k][0]) + (z - BLOBS[k][1]) * (z - BLOBS[k][1])); t = 1 - d / BLOBS[k][2]; if (t > 0) f -= BLOBS[k][3] * t * t * (3 - 2 * t); }
    return f;
  }
  function floatingBody(T, y0) {   // one smooth lathe mesh: lawn, rounded bevel, soil, blue-grey stone strata tapering to a tip. Single-vertex centre/tip: no degenerate triangles
    var R = [], P = [], C = [], I = [], c1 = new T.Color(), c2 = new T.Color(), g = new T.BufferGeometry(), j, k, m, th, s, rr, x, z, y, f, a, b, c, d, jit;
    var F = [0.14, 0.28, 0.42, 0.56, 0.7, 0.82, 0.9];
    for (j = 0; j < F.length; j++) R.push([F[j], y0, 0x8ccf63, 1]);
    R.push([0.955, y0 - 0.02, 0xa6d677, 0], [0.99, y0 - 0.12, 0xcfa56c, 0], [1.0, y0 - 0.32, 0xbd8d5d, 0], [0.99, y0 - 0.68, 0xa3714a, 0], [0.93, -1.1, 0x948f9c, 0],
      [0.8, -1.55, 0x8693ab, 0], [0.6, -2.0, 0x7684a0, 0], [0.38, -2.5, 0x6a7896, 0], [0.16, -2.95, 0x5f6c8a, 0]);
    P.push(0, y0, 0); c1.setHex(0x9bd66d); C.push(c1.r, c1.g, c1.b);
    for (j = 0; j < R.length; j++) for (k = 0; k < SEG; k++) {
      th = k / SEG * Math.PI * 2; s = R[j][0]; y = R[j][1];
      jit = R[j][3] ? 1 : 1 + (j > 11 ? 0.07 * Math.sin(3 * th + j * 1.7) + 0.05 * Math.sin(7 * th + j * 2.9) : 0);
      rr = outline(th) * s * jit; x = Math.cos(th) * rr; z = Math.sin(th) * rr;
      c1.setHex(R[j][2]); f = 1;
      if (R[j][3]) { c2.setHex(0xa9dc7c); c1.lerp(c2, 0.55 * (0.5 + 0.5 * Math.sin(x * 1.1) * Math.cos(z * 0.9))); }
      if (y >= y0 - 0.05) f = lawnAO(x, z);
      P.push(x, y, z); C.push(c1.r * f, c1.g * f, c1.b * f);
    }
    m = P.length / 3; P.push(0, -3.3, 0); c1.setHex(0x5a6684); C.push(c1.r, c1.g, c1.b);
    for (k = 0; k < SEG; k++) I.push(0, 1 + (k + 1) % SEG, 1 + k);
    for (j = 0; j < R.length - 1; j++) for (k = 0; k < SEG; k++) {
      a = 1 + j * SEG + k; b = 1 + j * SEG + (k + 1) % SEG; c = a + SEG; d = b + SEG;
      I.push(a, b, c, b, d, c);
    }
    for (k = 0; k < SEG; k++) I.push(1 + (R.length - 1) * SEG + k, 1 + (R.length - 1) * SEG + (k + 1) % SEG, m);
    g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(C, 3));
    g.setIndex(I); g.computeVertexNormals();
    return g;
  }
  function aoBase(b, from, y0, hgt, str) {   // darken the foot of the objects added since vertex `from` (soft contact shadow, baked into vertex colours)
    var v, f, h;
    for (v = from; v < b.o; v++) {
      h = (b.p[v * 3 + 1] - y0) / hgt; if (h >= 1) continue; h = Math.max(0, h); f = 1 - str * (1 - h) * (1 - h);
      b.c[v * 3] *= f; b.c[v * 3 + 1] *= f; b.c[v * 3 + 2] *= f;
    }
  }
  function islandGeometry(T) {
    var b = new Builder(T), i, a, r, y = GARDEN.y, o, ch = [[-1.3, -1.95, 1.0, 0.55, 1.5, 0x7f8caa], [1.4, -2.15, -0.7, 0.5, 1.7, 0x74829f], [0.2, -1.9, -1.9, 0.42, 1.2, 0x7a88a6]];
    b.add(floatingBody(T, y), 0, 0, 0, 0);
    for (i = 0; i < ch.length; i++) b.cone(ch[i][5], ch[i][0], ch[i][1], ch[i][2], ch[i][3], ch[i][4], 6, Math.PI, i, 0);   // hanging rock chunks
    // house (no chimney)
    o = b.o;
    b.box(COL.wall, -1.2, y + 0.45, -0.8, 1.5, 0.9, 1.2);
    b.cone(COL.roof, -1.2, y + 1.2, -0.8, 1.45, 0.75, 4, 0, Math.PI / 4, 0);
    b.box(COL.wood2, -1.2, y + 0.3, -0.19, 0.3, 0.6, 0.04);
    b.box(0xbfe6f2, -0.7, y + 0.55, -0.19, 0.28, 0.26, 0.04); b.box(0xbfe6f2, -1.7, y + 0.55, -0.19, 0.28, 0.26, 0.04);
    aoBase(b, o, y, 0.8, 0.34);
    // pier over the sea (east side), posts + planks: all inside the frame
    for (i = 0; i < 7; i++) b.box(i % 2 ? COL.wood : 0xd6a468, 3.25 + i * 0.3, y - 0.05, 1.3, 0.26, 0.07, 0.8);
    for (i = 0; i < 3; i++) { b.cyl(COL.wood2, 3.7 + i * 0.7, y - 0.4, 0.92, 0.06, 0.06, 0.8, 5); b.cyl(COL.wood2, 3.7 + i * 0.7, y - 0.4, 1.68, 0.06, 0.06, 0.8, 5); }
    b.cyl(COL.wood2, 5.0, y + 0.18, 0.92, 0.05, 0.05, 0.4, 5); b.cyl(COL.wood2, 5.0, y + 0.18, 1.68, 0.05, 0.05, 0.4, 5);
    // coconut tree (leaning trunk, fronds, nuts)
    o = b.o;
    for (i = 0; i < 5; i++) b.cyl(i % 2 ? COL.trunk : 0xaf7c47, 2.6 + i * 0.07, y + 0.3 + i * 0.5, -1.3, 0.1 - i * 0.008, 0.13 - i * 0.008, 0.55, 6, 0, -0.14);
    aoBase(b, o, y, 0.9, 0.3);
    for (i = 0; i < 6; i++) { a = i * Math.PI / 3; b.cone(i % 2 ? COL.leaf : COL.leaf2, 2.95 + Math.cos(a) * 0.5, y + 2.65, -1.3 + Math.sin(a) * 0.5, 0.16, 1.3, 4, Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15); }
    b.ball(0x7a4f31, 2.9, y + 2.5, -1.2, 0.11); b.ball(0x7a4f31, 3.05, y + 2.5, -1.38, 0.11); b.ball(0x7a4f31, 2.85, y + 2.52, -1.45, 0.1);
    // bamboo clump
    o = b.o;
    for (i = 0; i < 6; i++) {
      a = i * 1.1; r = 0.18 + (i % 3) * 0.1; var h = 1.7 + (i % 4) * 0.35, bx = -2.3 + Math.cos(a) * r, bz = -1.3 + Math.sin(a) * r;
      b.cyl(i % 2 ? COL.bamboo : COL.bamboo2, bx, y + h / 2, bz, 0.06, 0.07, h, 6);
      b.cyl(COL.bamboo2, bx, y + h * 0.35, bz, 0.085, 0.085, 0.04, 6); b.cyl(COL.bamboo2, bx, y + h * 0.7, bz, 0.085, 0.085, 0.04, 6);
      b.cone(COL.leaf2, bx + 0.15, y + h, bz, 0.07, 0.55, 3, 0, 0, -1.1);
      b.cone(COL.leaf, bx - 0.15, y + h - 0.2, bz, 0.07, 0.5, 3, 0, 0, 1.1);
    }
    aoBase(b, o, y, 0.9, 0.3);
    // windmill tower (blades are a separate rotating mesh)
    o = b.o;
    b.cyl(COL.wall, WM.x, y + 0.85, WM.z, 0.38, 0.55, 1.7, 8); b.cone(COL.roof, WM.x, y + 2.0, WM.z, 0.5, 0.6, 8); b.box(COL.wood2, WM.x, y + 0.3, WM.z + 0.54, 0.28, 0.5, 0.04);
    aoBase(b, o, y, 0.9, 0.34);
    // garden patch: the spot the mini-game uses (soil bed, fence posts)
    b.box(COL.soil, GARDEN.x, y + 0.03, GARDEN.z, GARDEN.w, 0.06, GARDEN.d);
    for (i = 0; i < 4; i++) b.cyl(COL.wood, GARDEN.x + (i % 2 ? 1 : -1) * (GARDEN.w / 2 + 0.05), y + 0.16, GARDEN.z + (i < 2 ? 1 : -1) * (GARDEN.d / 2 + 0.05), 0.04, 0.04, 0.32, 5);
    // flowers and stones
    for (i = 0; i < 9; i++) { a = i * 2.4; b.ball([0xf8a794, 0xffc54d, 0xffffff][i % 3], Math.cos(a) * (1.9 + (i % 3) * 0.35), y + 0.08, Math.sin(a) * (1.8 + (i % 2) * 0.4) + 0.2, 0.07, 1, 1, 1, 5, 4); }
    b.ball(COL.stone, 2.5, y + 0.08, 0.1, 0.2, 1.3, 0.7, 1, 6, 4); b.ball(COL.stone, 2.8, y + 0.06, 0.4, 0.12, 1.2, 0.7, 1, 6, 4);
    return b.build();
  }
  function bladesGeometry(T) {
    var b = new Builder(T), i;
    for (i = 0; i < 4; i++) { b.add(new T.BoxGeometry(0.22, 1.15, 0.04), i % 2 ? 0xfff1d0 : 0xf6c777, 0, 0.62, 0, 0, 0, i * Math.PI / 2); }
    b.ball(COL.wood2, 0, 0, 0, 0.14);
    return b.build();
  }
  function cloudGeometry(T, seed) {
    var b = new Builder(T), i;
    for (i = 0; i < 4; i++) b.ball(COL.white, (i - 1.5) * 0.9, (i % 2) * 0.25 + seed * 0.05, 0, 0.8 - (i % 2) * 0.15, 1.2, 0.7, 0.9, 8, 5);
    return b.build();
  }
  function birdGeometry(T) {
    var b = new Builder(T), g = new T.BufferGeometry(), v = [0, 0, 0.35, -0.9, 0.12, -0.05, 0, 0, -0.3, 0, 0, 0.35, 0, 0, -0.3, 0.9, 0.12, -0.05], i, k;
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 3, 4, 5]);
    for (i = 0; i < 2; i++) { k = i * 1.3; b.add(g.clone(), i ? 0x7a6a5a : 0x5b3a29, k, i * 0.2, k * 0.8, 0, 0, 0, 0.5, 1, 0.5); }
    g.dispose();
    return b.build();
  }
  function skyGeometry(T) {   // gradient dome: deep sky on top, warm pale haze at the horizon
    var g = new T.SphereBufferGeometry(80, 16, 12), p = g.attributes.position, c = [], i, t, top = new T.Color(0x6db5e8), mid = new T.Color(0xa9d8f0), hor = new T.Color(FOGC), col = new T.Color();
    for (i = 0; i < p.count; i++) { t = Math.max(0, Math.min(1, p.getY(i) / 50)); if (t < 0.35) col.copy(hor).lerp(mid, t / 0.35); else col.copy(mid).lerp(top, (t - 0.35) / 0.65); c.push(col.r, col.g, col.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    return g;
  }
  function seaGeometry(T) {
    var g = new T.CircleBufferGeometry(70, 24), c = [], i, near = new T.Color(0x9fe0ee), far = new T.Color(0x6cc0e0), col = new T.Color(), p = g.attributes.position;
    for (i = 0; i < p.count; i++) { col.copy(i === 0 ? near : far); c.push(col.r, col.g, col.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    g.rotateX(-Math.PI / 2);
    return g;
  }

  /* ------------------------------------------------ instance: scene + loop. opts: {renderer, canvas, w, h} */
  function create(opts) {
    var T = THREE, r = opts.renderer, own = { geos: [], mats: [] }, scene = new T.Scene(), cam = new T.PerspectiveCamera(36, 16 / 9, 0.5, 200);
    var island = new T.Group(), px = 0, py = 0, tpx = 0, tpy = 0, t0 = 0, last = 0, raf = 0, alive = true, dist = 17, w = opts.w || 800, h = opts.h || 450;
    var tgt = new T.Vector3(), lay = [], i, clouds = [], birds = [], blades, hooks = [];
    function geo(g) { own.geos.push(g); return g; }
    function mesh(g, m) { var o = new T.Mesh(geo(g), m); o.frustumCulled = false; return o; }

    var mat = toonMaterial(T);
    var skyMat = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false });
    own.mats.push(mat, skyMat);
    scene.fog = new T.Fog(FOGC, 22, 58);

    scene.add(mesh(skyGeometry(T), skyMat));
    var sea = mesh(seaGeometry(T), mat); sea.position.y = -4.4; scene.add(sea);
    island.add(mesh(islandGeometry(T), mat));
    blades = mesh(bladesGeometry(T), mat); blades.position.set(WM.x, GARDEN.y + 1.9, WM.z + 0.57); island.add(blades);
    scene.add(island);
    for (i = 0; i < 2; i++) { var cl = mesh(cloudGeometry(T, i), mat); cl.position.set(-26 + i * 24, 8 + i * 1.5, -9 - i * 5); cl.scale.setScalar(1.6 + i * 0.5); scene.add(cl); clouds.push(cl); }
    var bg = birdGeometry(T);
    for (i = 0; i < 2; i++) { var bd = mesh(i ? bg.clone() : bg, mat); scene.add(bd); birds.push(bd); }
    var all = layers.slice(); if (G.BootGarden && G.BootGarden.layer) all.push(G.BootGarden.layer);   // stage 31: the tiny garden
    all.forEach(function (fn) {   // garden hook
      try { var l = fn({ THREE: T, Builder: Builder, camera: cam, group: island, garden: GARDEN, mat: mat, track: geo }); if (l) hooks.push(l); } catch (e) { console.error('[boot_scene] layer failed', e); }
    });

    function resize(nw, nh) {
      w = nw || w; h = nh || h;
      var asp = w / h, tanv = Math.tan(cam.fov * Math.PI / 360);
      cam.aspect = asp; cam.updateProjectionMatrix();
      dist = Math.max(16, 6.3 / (tanv * asp));   // island + pier (incl. sway) always fit the width, portrait too
      if (scene.fog) { scene.fog.near = dist + 6; scene.fog.far = dist + 42; }
      if (r.setSize) r.setSize(w, h, false);
    }
    function pose(t) {
      var az = 0.62 + 0.09 * Math.sin(t * 0.25) + px * 0.14, el = 0.5 + py * 0.05, ce = Math.cos(el);
      tgt.set(0.9, 0.4 + dist * 0.08, 0);   // target above the island: it sits lower, clear of the logo/buttons
      cam.position.set(tgt.x + dist * Math.sin(az) * ce, tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(az) * ce);
      cam.lookAt(tgt);
    }
    function frame(now, force) {
      if (!alive) return;
      var t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000), k, a;
      last = now;
      px += (tpx - px) * 0.06; py += (tpy - py) * 0.06;
      island.position.y = Math.sin(t * 0.8) * 0.12; island.rotation.y = Math.sin(t * 0.3) * 0.02;
      blades.rotation.z -= dt * 0.9;
      for (k = 0; k < 2; k++) {
        clouds[k].position.x += dt * (0.6 + k * 0.35); if (clouds[k].position.x > 28) clouds[k].position.x = -28;
        a = t * (0.16 + k * 0.05) + k * 3.1;
        birds[k].position.set(Math.cos(a) * (10 + k * 2.5), 5.2 + k * 1.4 + Math.sin(t + k) * 0.3, Math.sin(a) * (9 + k * 2));
        birds[k].rotation.y = -a;
        birds[k].scale.y = 0.35 + Math.abs(Math.sin(t * 5 + k)) * 0.9;
      }
      for (k = 0; k < hooks.length; k++) if (hooks[k].update) hooks[k].update(t, dt);
      pose(t);
      r.render(scene, cam);
    }
    function loop(now) {   // 30 fps cap while loading
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 31) return;
      frame(now);
    }
    function onMove(e) { tpx = (e.clientX / (window.innerWidth || 1) - 0.5) * 2; tpy = (e.clientY / (window.innerHeight || 1) - 0.5) * 2; }
    function onSize() { resize(window.innerWidth, window.innerHeight); }
    function onVis() { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (alive && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
    function onLost(e) { if (e && e.preventDefault) e.preventDefault(); api.dispose(); if (typeof document !== 'undefined') document.body.classList.remove('tv-bg3d'); }

    var api = {
      scene: scene, camera: cam, canvas: opts.canvas, renderer: r, own: own, frame: frame, resize: resize,
      get alive() { return alive; },
      get keep() { return hooks.some(function (l) { return l.keep; }); },
      stats: function () {
        var d = 0, tri = 0;
        scene.traverse(function (o) { if (o.isMesh && o.visible) { d++; tri += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
        return { draws: d, tris: tri };
      },
      run: function () {
        t0 = last = performance.now(); resize(w, h);
        window.addEventListener('resize', onSize); window.addEventListener('pointermove', onMove, { passive: true });
        document.addEventListener('visibilitychange', onVis);
        if (opts.canvas && opts.canvas.addEventListener) opts.canvas.addEventListener('webglcontextlost', onLost, false);
        raf = requestAnimationFrame(loop);
      },
      dispose: function () {   // release everything: geometries, materials, textures, renderer, GL context
        if (!alive) return;
        alive = false; cancelAnimationFrame(raf); raf = 0;
        if (typeof window !== 'undefined' && window.removeEventListener) { window.removeEventListener('resize', onSize); window.removeEventListener('pointermove', onMove); }
        if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', onVis);
        hooks.forEach(function (l) { try { if (l.dispose) l.dispose(); } catch (e) { /* ignore */ } });
        scene.traverse(function (o) { if (o.material && o.material.map) o.material.map.dispose(); });
        own.geos.forEach(function (g) { g.dispose(); });
        own.mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        while (scene.children.length) scene.remove(scene.children[0]);
        r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
        if (opts.canvas && opts.canvas.parentNode) opts.canvas.parentNode.removeChild(opts.canvas);
      }
    };
    return api;
  }

  /* ------------------------------------------------ lifecycle */
  function allowed() {
    if (typeof THREE === 'undefined' || typeof document === 'undefined') return false;
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return true;
  }
  function start() {
    if (inst || !allowed()) return false;
    var ui = document.getElementById('ui'), cv = document.createElement('canvas'), r;
    if (!ui) return false;
    cv.id = 'tv-boot'; cv.setAttribute('aria-hidden', 'true');
    try {
      r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, stencil: false, powerPreference: 'low-power' });   // throws without WebGL: CSS fallback stays
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      r.setClearColor(FOGC, 1);
      document.body.insertBefore(cv, ui);   // above #game, below #ui (title and splash draw over it)
      inst = create({ renderer: r, canvas: cv, w: window.innerWidth, h: window.innerHeight });
    } catch (e) {
      if (r) { try { r.dispose(); r.forceContextLoss(); } catch (e2) { /* ignore */ } }
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      inst = null; return false;
    }
    document.body.classList.add('tv-bg3d');
    inst.run();
    return true;
  }
  function freeze() {   // last frame -> still 2D canvas, then dispose the scene + GL context
    if (!inst) return false;
    var cv = inst.canvas, ui = document.getElementById('ui'), s = null;
    try {
      inst.frame(performance.now(), true);   // synchronous last frame, copied while the buffer is still valid
      s = document.createElement('canvas'); s.width = cv.width; s.height = cv.height; s.id = 'tv-boot-still'; s.setAttribute('aria-hidden', 'true');
      s.getContext('2d').drawImage(cv, 0, 0);
    } catch (e) { s = null; }
    inst.dispose(); inst = null;
    if (s) { still = s; document.body.insertBefore(s, ui); } else document.body.classList.remove('tv-bg3d');
    return true;
  }
  function handOver() {   // main.js: call before Render.init. With a live garden the scene stays (tappable on the title) until release()
    if (inst && inst.keep) return true;
    return freeze();
  }
  function release() {   // title closed: backdrop goes away
    if (inst) freeze();
    document.body.classList.remove('tv-bg3d');
    var s = still; still = null;
    if (s) { s.className = 'out'; setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 500); }
  }

  G.BootScene = {
    start: start, handOver: handOver, release: release, create: create, garden: GARDEN, Builder: Builder,
    live: function () { return !!inst; },
    registerLayer: function (fn) { if (typeof fn === 'function') layers.push(fn); }
  };
  if (typeof document !== 'undefined') start();
})();
