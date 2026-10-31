/* Togie Valley - birds.js (Round 2 stage 4B): small flocks crossing the sky by day + 4 birds perched on the farmhouse roof, fences and trees.
 * Perched birds fly off when the player comes within ~3.5 tiles, stay away 22-52 s, then land on another spot (8-40 tiles from the player).
 * Day only, none in rain/snow/winter/indoors; counts = ceil(N * Perf critter density), OFF on tier 3 (Siêu nhẹ). Wing flap = instance x-scale.
 * Sound: existing 'bird' sfx via Audio.playAt, only for perched birds (rare). Added draw calls: 2 (flocks + perched, both InstancedMesh).
 * API: Game.Birds {build(), group, enabled, stats() -> {birds, flocks, flockBirds, perch, perched}}. Frame priority 12. Replaces the old circling birds of ambient.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Player || !G.Time || !G.Scenery || !G.Scenes || !G.Loop) { console.error('[birds] missing deps'); return; }
  var U = G.util, B = G.Birds = { group: null, enabled: true }, TAU = Math.PI * 2, NFL = 3, PER = 3, NPER = 4;
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color(), tint = new THREE.Color(1, 1, 1);
  var rnd = U.rng(5151), t = 0, mf = null, mp = null, fl = [], pb = [], spX = [], spY = [], spZ = [], lastFences = null, wasOn = false, shown = { f: 0, p: 0, pe: 0 };
  var TH = { med: 2.4, large: 3.4, giant: 4.4 }, COLS = [0xfff1d0, 0x8a8590, 0x4f8fd6, 0xe8715d, 0x8a8590, 0xfff1d0, 0x4f8fd6, 0xe8715d, 0x8a8590, 0xfff1d0, 0x8a8590, 0x4f8fd6, 0xe8715d];

  function inst(tris, n, name) {
    var g = new THREE.BufferGeometry(), m;
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), n);
    m.name = name; m.frustumCulled = false; m.raycast = function () {}; m.count = 0; m.visible = false;
    for (var i = 0; i < n; i++) m.setColorAt(i, C.set(COLS[i % COLS.length]));
    m.instanceColor.needsUpdate = true; B.group.add(m);
    return m;
  }
  function put(m, i, x, y, z, ry, sx, sy, sz, rz) {
    E.set(0, ry, rz || 0, 'YXZ'); Q.setFromEuler(E);
    M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)); m.setMatrixAt(i, M4);
  }
  function hide(m, i) { put(m, i, 0, -50, 0, 0, 0.001, 0.001, 0.001); }
  function season() { var s = G.Time.season; return typeof s === 'number' ? ['spring', 'summer', 'autumn', 'winter'][s] : s; }
  function push(x, y, z) { spX.push(x); spY.push(y); spZ.push(z); }

  /* perch spots: farmhouse roof, a sample of fence pieces, a sample of mid/large trees (rebuilt when the fences are rebuilt) */
  function gather() {
    var D = G.Decor, h = D && D.house, arr = D && D.fences, tr = D && D.layout && D.layout.trees, i, j, m, n = 0, k = 0, st;
    spX.length = 0; spY.length = 0; spZ.length = 0; lastFences = D ? D.fences : null;
    if (h) { push(h.position.x + 0.55, 2.68, h.position.z); push(h.position.x - 0.5, 2.66, h.position.z + 0.25); }
    if (arr && arr.length) {
      for (j = 0; j < arr.length; j++) n += arr[j].count || 0;
      st = Math.max(1, Math.floor(n / 14));
      for (j = 0; j < arr.length; j++) { m = arr[j]; if (!m.getMatrixAt) continue; for (i = 0; i < m.count; i++) if (k++ % st === 0) { m.getMatrixAt(i, M4); push(M4.elements[12], 0.95, M4.elements[14]); } }
    }
    if (tr) {
      for (n = 0, i = 0; i < tr.length; i++) if (TH[tr[i].sz]) n++;
      st = Math.max(1, Math.floor(n / 24));
      for (k = 0, i = 0; i < tr.length; i++) if (TH[tr[i].sz] && k++ % st === 0) push(tr[i].x + 0.45, TH[tr[i].sz], tr[i].z);
    }
  }
  function pickSpot(px, pz, bi) {
    var n = spX.length, k, j, s, dx, dz, d, ok;
    for (k = 0; n && k < 10; k++) {
      s = Math.floor(rnd() * n); dx = spX[s] - px; dz = spZ[s] - pz; d = dx * dx + dz * dz;
      if (d < 64 || d > 1600) continue;
      ok = true;
      for (j = 0; j < NPER; j++) if (j !== bi && pb[j].st !== 2 && Math.abs(pb[j].x - spX[s]) + Math.abs(pb[j].z - spZ[s]) < 1.5) ok = false;
      if (ok) return s;
    }
    return -1;
  }
  function chirp(o) {
    if (G.Audio && G.Audio.playAt && (o.x - G.Player.pos.x) * (o.x - G.Player.pos.x) + (o.z - G.Player.pos.z) * (o.z - G.Player.pos.z) < 625)
      G.Audio.playAt('bird', o.x, o.z, { set: String(1 + Math.floor(rnd() * 4)), vol: 0.35, pitch: 1 + rnd() * 0.2 });
  }
  function startFlock(o, px, pz) {
    var a = rnd() * TAU, off = (rnd() - 0.5) * 40;
    o.dx = Math.sin(a); o.dz = Math.cos(a); o.hd = a;
    o.ox = px - o.dx * 45 + o.dz * off; o.oz = pz - o.dz * 45 - o.dx * off;
    o.y = 8 + rnd() * 4; o.sp = 4 + rnd() * 1.5; o.s = 0; o.st = 1; o.f = 7 + rnd() * 3;
  }

  B.build = function () {
    if (B.group) return B.group;
    var i, bird = [0, 0, 0.2, 0.06, 0, -0.1, -0.06, 0, -0.1, 0, 0, 0.05, 0.34, 0.07, 0.1, 0.28, 0.05, -0.12, 0, 0, 0.05, -0.34, 0.07, 0.1, -0.28, 0.05, -0.12];
    B.group = new THREE.Group(); B.group.name = 'birds'; G.Scenery.group.add(B.group);
    mf = inst(bird, NFL * PER, 'bird_flocks'); mp = inst(bird, NPER, 'bird_perched');
    for (i = 0; i < NFL; i++) fl.push({ st: 0, tm: 2 + i * 7 + rnd() * 6, ox: 0, oz: 0, dx: 0, dz: 1, hd: 0, y: 9, sp: 4, s: 0, f: 8 });
    for (i = 0; i < NPER; i++) pb.push({ st: 2, tm: 1 + i * 1.5, x: 0, y: 0, z: 0, hd: rnd() * TAU, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, dur: 3, ct: 5 + rnd() * 10 });
    G.Loop.onFrame(G.SimTier ? G.SimTier.sim(update, { meshes: [mf, mp], hz: 20 }) : (G.Perf && G.Perf.throttled ? G.Perf.throttled(update) : update), 12);   // stage 36: 20 Hz + interpolated instances
    return B.group;
  };

  function update(dt) {
    if (!B.enabled || !B.group) return;
    if (G.Scenes.current !== 'outdoor') { B.group.visible = false; return; }
    B.group.visible = true; if (dt > 0.1) dt = 0.1; t += dt;
    var P = G.Player.pos, px = P.x, pz = P.z, hr = G.Time.hour, wx = G.Time.weather, cd = G.Perf ? G.Perf.density.critter : 1, i, j, o, k, e, s, x, z, dx, dz, flap, nf, np, u = G.Render.uniforms;
    var on = hr >= 6.5 && hr < 19 && wx !== 'rain' && wx !== 'snow' && season() !== 'winter' && !(G.Quality && G.Quality.level() >= 3) && cd > 0;
    if (!on) {
      if (wasOn) { for (i = 0; i < NPER; i++) { pb[i].st = 2; pb[i].tm = 2 + rnd() * 12; } for (i = 0; i < NFL; i++) { fl[i].st = 0; fl[i].tm = 3 + i * 6 + rnd() * 8; } }
      wasOn = false; mf.visible = mp.visible = false; mf.count = mp.count = 0; shown.f = shown.p = shown.pe = 0; return;
    }
    wasOn = true;
    if (lastFences !== G.Decor.fences || !spX.length) gather();
    tint.copy(u.uAmbient.value).add(u.uLightColor.value); tint.r = Math.min(1, tint.r); tint.g = Math.min(1, tint.g); tint.b = Math.min(1, tint.b);
    mf.material.color.copy(tint); mp.material.color.copy(tint);

    // flocks crossing the sky (V formation, 3 birds each)
    nf = Math.ceil(NFL * cd); if (nf > NFL) nf = NFL;
    for (i = 0; i < nf; i++) {
      o = fl[i];
      if (o.st === 0) { o.tm -= dt; if (o.tm <= 0) startFlock(o, px, pz); } else { o.s += o.sp * dt; if (o.s > 95) { o.st = 0; o.tm = 14 + rnd() * 25; } }
      for (j = 0; j < PER; j++) {
        k = i * PER + j;
        if (o.st === 0) { hide(mf, k); continue; }
        e = j ? 0.9 * Math.ceil(j / 2) : 0; s = j ? (j % 2 ? 0.8 : -0.8) * Math.ceil(j / 2) : 0;
        flap = 0.35 + 0.65 * Math.abs(Math.sin(t * o.f + k * 2));
        put(mf, k, o.ox + o.dx * (o.s - e) + o.dz * s, o.y + Math.sin(t * 0.8 + k) * 0.3, o.oz + o.dz * (o.s - e) - o.dx * s, o.hd, flap, 1, 1.2, Math.sin(t * o.f + k * 2) * 0.12);
      }
    }
    mf.count = nf * PER; mf.visible = nf > 0; mf.instanceMatrix.needsUpdate = true; shown.f = mf.count;

    // perched birds: sit folded, flee when the player is close, come back later to another spot
    np = Math.ceil(NPER * cd); if (np > NPER) np = NPER;
    shown.pe = 0;
    for (i = 0; i < np; i++) {
      o = pb[i];
      if (o.st === 0) {
        dx = o.x - px; dz = o.z - pz;
        if (dx * dx + dz * dz < 12) { o.st = 1; o.tm = 0; o.dur = 2.4; o.sy = o.y; o.hd = Math.atan2(dx, dz) + (rnd() - 0.5) * 0.8; chirp(o); }
        else {
          shown.pe++;
          if ((o.ct -= dt) < 0) { o.ct = 10 + rnd() * 15; chirp(o); }
          put(mp, i, o.x, o.y, o.z, o.hd, 0.3, 1, 1.2); continue;
        }
      }
      if (o.st === 1) {
        o.tm += dt; k = o.tm / o.dur; o.x += Math.sin(o.hd) * 6.5 * dt; o.z += Math.cos(o.hd) * 6.5 * dt; o.y = o.sy + k * 5;
        put(mp, i, o.x, o.y, o.z, o.hd, 0.35 + 0.65 * Math.abs(Math.sin(t * 14 + i)), 1, 1.2, Math.sin(t * 14 + i) * 0.12);
        if (k >= 1) { o.st = 2; o.tm = 22 + rnd() * 30; }
      } else if (o.st === 2) {
        hide(mp, i);
        if ((o.tm -= dt) <= 0) {
          k = pickSpot(px, pz, i);
          if (k < 0) o.tm = 4;
          else { o.tx = spX[k]; o.ty = spY[k]; o.tz = spZ[k]; s = rnd() * TAU; o.sx = o.tx + Math.sin(s) * 22; o.sz = o.tz + Math.cos(s) * 22; o.sy = o.ty + 7; o.dur = 3.2; o.tm = 0; o.st = 3; o.hd = Math.atan2(o.tx - o.sx, o.tz - o.sz); }
        }
      } else {
        o.tm += dt; k = Math.min(1, o.tm / o.dur); e = 1 - (1 - k) * (1 - k);
        o.x = o.sx + (o.tx - o.sx) * e; o.z = o.sz + (o.tz - o.sz) * e; o.y = o.sy + (o.ty - o.sy) * e;
        put(mp, i, o.x, o.y, o.z, o.hd, 0.35 + 0.65 * Math.abs(Math.sin(t * 14 + i)) * (1 - k * 0.6), 1, 1.2, Math.sin(t * 14 + i) * 0.12);
        if (k >= 1) { o.st = 0; o.x = o.tx; o.y = o.ty; o.z = o.tz; o.hd = rnd() * TAU; o.ct = 3 + rnd() * 8; }
      }
    }
    mp.count = np; mp.visible = np > 0; mp.instanceMatrix.needsUpdate = true; shown.p = np;
  }

  B.stats = function () { return { birds: shown.f + shown.p, flocks: shown.f / PER, flockBirds: shown.f, perch: shown.p, perched: shown.pe }; };
})();
