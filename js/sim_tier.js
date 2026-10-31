/* Togie Valley - sim_tier.js (Round 3 stage 36): update tiers. Entities beyond a radius or off screen sleep; ambient life, birds, bees, critters,
 * fish shadows, NPC layers and far avatars step at 10-20 Hz on staggered phases, and their rendering is interpolated every frame.
 * Loads right after perf.js. Consumers look Game.SimTier up lazily and fall back to their old per-frame path when it is missing.
 * Game.SimTier:
 *   d2(x, z)                 squared distance to the local hero (tiles)
 *   seen(x, y, z, r)         sphere vs camera frustum (frustum refreshed once per frame at priority 0.5; true until the 4th frame)
 *   tierRate()               update rate cap of the active quality tier (Hz)
 *   stagger()                0..1 golden-ratio phase for a new Clock / avatar
 *   Clock()                  .tick(dt, hz) -> accumulated step dt when a step is due (0 otherwise); hz >= 59 = every frame; .alpha 0..1 since the last step
 *   Inst(mesh)               instanced-matrix interpolator: .capture() right after the module stepped, .apply(alpha) every frame (typed arrays, no allocation)
 *   Pose(n)                  Object3D pose interpolator: .push(i, mesh) after the AI wrote the mesh, .apply(i, mesh, alpha) every frame
 *   sim(step, o)             wraps a module step into a Loop.onFrame callback. o = {meshes:[InstancedMesh], hz:n|fn, sleep:fn->bool}
 *   npc                      {due, dt, far}: one shared decision per frame for ALL additive NPC joint layers (town idle, CharAnim, NpcReact, CharSec), so a
 *                            skipped frame leaves every layer's joints untouched (no double-add); .run is false while every NPC is far / off screen / indoors
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Loop || !G.Render || !G.Player || !G.Scenes || typeof THREE === 'undefined') { console.error('[sim_tier] missing dependencies'); return; }
  var ST = G.SimTier = { npc: { run: false, due: false, dt: 0, far: false }, sleeping: 0 };
  var fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(), phase = 0.3, frames = 0, NPC_R2 = 30 * 30, NEAR_R2 = 14 * 14;

  ST.d2 = function (x, z) { var p = G.Player.pos, dx = x - p.x, dz = z - p.z; return dx * dx + dz * dz; };
  ST.seen = function (x, y, z, r) {
    if (frames < 4) return true;
    sph.center.set(x, y, z); sph.radius = r;
    return fr.intersectsSphere(sph);
  };
  ST.tierRate = function () { var P = G.Perf; return (P && P.tierDef && P.tierDef.rate) || 60; };
  ST.stagger = function () { phase += 0.618034; if (phase >= 1) phase -= 1; return phase; };

  /* ---- Clock: fixed-rate gate on frame time ---- */
  function Clock() { this.acc = -1; this.ph = ST.stagger(); this.alpha = 1; }
  Clock.prototype.tick = function (dt, hz) {
    var per, s;
    if (hz >= 59) { this.alpha = 1; this.acc = 0; return dt; }
    per = 1 / hz;
    if (this.acc < 0) this.acc = this.ph * per;   // staggered first step
    this.acc += dt;
    if (this.acc >= per) { s = this.acc; this.acc = 0; this.alpha = 0; return s > 0.25 ? 0.25 : s; }
    this.alpha = this.acc / per;
    return 0;
  };
  ST.Clock = Clock;

  /* ---- Inst: interpolate an InstancedMesh's matrices between two simulation steps ---- */
  function Inst(mesh) { var n = mesh.instanceMatrix.array.length; this.m = mesh; this.prev = new Float32Array(n); this.cur = new Float32Array(n); this.n = 0; }
  Inst.prototype.capture = function () {
    var m = this.m, arr = m.instanceMatrix.array, len = Math.min((m.count | 0) * 16, arr.length), k, p = this.prev, c = this.cur, n = this.n;
    for (k = 0; k < len; k++) { p[k] = k < n ? c[k] : arr[k]; c[k] = arr[k]; }
    this.n = len;
  };
  Inst.prototype.apply = function (a) {
    var m = this.m, arr = m.instanceMatrix.array, k, n = this.n, p = this.prev, c = this.cur;
    if (!n || !m.visible) return;
    if (a >= 1) { for (k = 0; k < n; k++) arr[k] = c[k]; } else for (k = 0; k < n; k++) arr[k] = p[k] + (c[k] - p[k]) * a;
    m.instanceMatrix.needsUpdate = true;
  };
  ST.Inst = Inst;

  /* ---- Pose: interpolate position + euler rotation of individual meshes ---- */
  var PI = Math.PI, TAU = PI * 2;
  function Pose(n) { this.prev = new Float32Array(n * 6); this.cur = new Float32Array(n * 6); this.ok = new Uint8Array(n); }
  Pose.prototype.push = function (i, mesh) {
    var o = i * 6, p = this.prev, c = this.cur, q = mesh.position, r = mesh.rotation, k;
    if (this.ok[i]) for (k = 0; k < 6; k++) p[o + k] = c[o + k];
    c[o] = q.x; c[o + 1] = q.y; c[o + 2] = q.z; c[o + 3] = r.x; c[o + 4] = r.y; c[o + 5] = r.z;
    if (!this.ok[i]) { this.ok[i] = 1; for (k = 0; k < 6; k++) p[o + k] = c[o + k]; }
  };
  Pose.prototype.apply = function (i, mesh, a) {
    var o = i * 6, p = this.prev, c = this.cur, dy;
    if (!this.ok[i]) return;
    dy = c[o + 4] - p[o + 4]; if (dy > PI) dy -= TAU; else if (dy < -PI) dy += TAU;
    mesh.position.set(p[o] + (c[o] - p[o]) * a, p[o + 1] + (c[o + 1] - p[o + 1]) * a, p[o + 2] + (c[o + 2] - p[o + 2]) * a);
    mesh.rotation.set(p[o + 3] + (c[o + 3] - p[o + 3]) * a, p[o + 4] + dy * a, p[o + 5] + (c[o + 5] - p[o + 5]) * a);
  };
  ST.Pose = Pose;

  /* ---- sim: module step at <= 20 Hz + instanced interpolation ---- */
  ST.sim = function (step, o) {
    var clk = new Clock(), ins = [], i, ms = o.meshes || [];
    for (i = 0; i < ms.length; i++) if (ms[i] && ms[i].instanceMatrix) ins.push(new Inst(ms[i]));
    return function (dt) {
      var hz, tr, s;
      if (document.hidden) return;
      hz = typeof o.hz === 'function' ? o.hz() : (o.hz || 20); tr = ST.tierRate(); if (tr < hz) hz = tr;
      if (o.sleep && o.sleep()) { ST.sleeping++; return; }
      s = clk.tick(dt, hz);
      if (s) { step(s); for (i = 0; i < ins.length; i++) ins[i].capture(); }
      if (clk.alpha < 1) for (i = 0; i < ins.length; i++) ins[i].apply(clk.alpha);
    };
  };

  /* ---- per-frame bookkeeping: hero, frustum, shared NPC decision ---- */
  var npcRoots = [], npcN = 0, npcClk = new Clock(), npcSeen = false;
  function npcScan() {
    var N = G.Town && G.Town.npcs, k, e;
    if (!N || !N.shopkeeper || !N.shopkeeper.h) return;
    for (k in N) { e = N[k]; if (e && e.h && e.h.root) npcRoots.push(e.h.root); }
    npcN = npcRoots.length; npcSeen = true;
  }
  G.Loop.onFrame(function (dt) {
    var cam = G.Render.camera, i, p, d, best = 1e9, N = ST.npc, hz, s;
    frames++;
    ST.sleeping = 0;
    if (cam) { pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm); }
    if (!npcSeen) npcScan();
    N.due = false; N.run = false;
    if (!npcN) { N.due = true; N.dt = dt; N.run = true; return; }   // not built yet: layers behave as before
    if (G.Scenes.current !== 'outdoor') { npcClk.acc = -1; return; }
    for (i = 0; i < npcN; i++) {
      p = npcRoots[i].position; d = ST.d2(p.x, p.z);
      if (d < NPC_R2 && d < best && ST.seen(p.x, 1, p.z, 1.6)) best = d;
    }
    if (best >= 1e9) { npcClk.acc = -1; return; }   // every NPC far or off screen: asleep
    N.run = true; N.far = best > NEAR_R2;
    hz = N.far ? 10 : 20; s = ST.tierRate(); if (s < hz) hz = s;
    s = npcClk.tick(dt, hz);
    if (s) { N.due = true; N.dt = s > 0.1 ? 0.1 : s; }
  }, 0.5);
})();
