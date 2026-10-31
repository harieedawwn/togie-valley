/* Togie Valley - fishing_fx.js (Stage 10): fishing visuals. Game.FishingFx.
 * Bendable rod on handR, thin sagging line (one Line), bobber with bob/dip, water ring ripples, splash + star confetti particles,
 * fish shadow circling the bobber, sitting/charge/cast/bite/reel/catch animations, catch celebration, slight camera zoom-in.
 * Reads Game.Fishing.view (see fishing.js). Depends on THREE, Render, Models, Player, Fishing, Items, UI.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.Player || !G.Fishing || !G.Fishing.view || !G.Items || !G.UI || !G.Loop || !G.Camera) { console.error('[fishing_fx] missing dependencies'); return; }
  var R = G.Render, M = G.Models, P = G.Player, F = G.Fishing, E = G.Events, Items = G.Items, V = F.view, FX = G.FishingFx = {};
  F.fx = true;

  /* ------------------------------------------------------------ helpers */
  var TAU = 6.2832, calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ss(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ky(u, a) {
    if (u <= a[0]) return a[1];
    for (var i = 2; i < a.length; i += 2) if (u <= a[i]) return a[i - 1] + (a[i + 1] - a[i - 1]) * ss((u - a[i - 2]) / (a[i] - a[i - 2]));
    return a[a.length - 1];
  }
  var KA = [0, 0, 0.3, 0.45, 0.55, 0.85, 1, 0], KB = [0, 0, 0.35, 0.5, 1, 0.72], KC = [0, 0, 0.3, 0.3, 0.7, 0.1, 1, 0.06], KD = [0, -0.15, 0.3, 0.22, 1, 0.14];   // cast keyframe scratch (stage 34)
  var _e = new THREE.Euler();
  function pt(g, c, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    var m = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(_e),
      new THREE.Vector3(sx || 1, sy === undefined ? (sx || 1) : sy, sz === undefined ? (sx || 1) : sz));
    return { geo: g, color: c, matrix: m };
  }
  var SPH = new THREE.SphereGeometry(1, 8, 6), CONE = new THREE.ConeGeometry(1, 1, 6), CYL = new THREE.CylinderGeometry(1, 1, 1, 7), BOX = new THREE.BoxGeometry(1, 1, 1);
  function col(c, fb) {
    var o = new THREE.Color(fb || 0xcccccc);
    if (c !== undefined && c !== null) { try { var t = new THREE.Color(); t.set(c); if (isFinite(t.r + t.g + t.b)) o = t; } catch (e) {} }
    return o;
  }
  function lighter(c, k) { return c.clone().lerp(new THREE.Color(0xffffff), k); }
  var scene = R.scene, calmK = calm ? 0.4 : 1, castTrail = null, tmpT = new THREE.Vector3();

  /* ------------------------------------------------------------ rod (4 chained segments so it can bend) */
  var ROD_COL = {
    bamboo_pole: [0xc9b45a, 0x8c5a34, 0x9aa4ad], fiber_rod: [0x5fb3a8, 0x8c5a34, 0x6aa8d8],
    carbon_rod: [0x4a525c, 0x6b4a3a, 0xd9d9d9], master_rod: [0xe0b040, 0x8c5a34, 0xf2d37a]
  };
  var SEGL = [0.34, 0.3, 0.28, 0.26], SEGR = [0.024, 0.02, 0.015, 0.01];
  var rodRoot = new THREE.Group(), segs = [], tipObj = new THREE.Group(), rodGeo = {}, rodId = null, built = false;
  rodRoot.rotation.x = 0.3; rodRoot.visible = false;
  function rodGeoFor(id) {
    if (rodGeo[id]) return rodGeo[id];
    var c = ROD_COL[id] || ROD_COL.bamboo_pole, out = [], i, L, parts;
    for (i = 0; i < 4; i++) {
      L = SEGL[i]; parts = [pt(CYL, i === 0 ? c[1] : c[0], 0, 0, L / 2, Math.PI / 2, 0, 0, SEGR[i], L, SEGR[i])];
      if (i === 0) parts.push(pt(CYL, c[2], 0.04, -0.01, 0.12, 0, 0, Math.PI / 2, 0.035, 0.05, 0.035), pt(CYL, c[0], 0, 0, 0.24, Math.PI / 2, 0, 0, 0.03, 0.03, 0.03));
      else parts.push(pt(CYL, c[2], 0, 0, 0.02, Math.PI / 2, 0, 0, SEGR[i] * 1.5, 0.03, SEGR[i] * 1.5));
      out.push(M.mergeParts(parts));
    }
    return (rodGeo[id] = out);
  }
  function buildRod() {
    if (built) return; built = true;
    var g = rodGeoFor('bamboo_pole'), i, m, prev = rodRoot;
    for (i = 0; i < 4; i++) {
      m = new THREE.Mesh(g[i], M.material('prop')); R.addOutline(m, true);
      m.position.z = i === 0 ? 0 : SEGL[i - 1]; prev.add(m); segs.push(m); prev = m;
    }
    tipObj.position.z = SEGL[3]; segs[3].add(tipObj);
    P.hero.attach.handR.add(rodRoot);
  }
  function setRod(id) {
    if (!id || id === rodId) return; rodId = id;
    var g = rodGeoFor(id), i, k;
    for (i = 0; i < 4; i++) {
      segs[i].geometry = g[i];
      for (k = 0; k < segs[i].children.length; k++) if (segs[i].children[k].name === 'outline') segs[i].children[k].geometry = g[i];
    }
  }

  /* ------------------------------------------------------------ bobber, line, fish shadow, ripples */
  var bobber = new THREE.Mesh(M.mergeParts([
    pt(SPH, 0xffffff, 0, -0.045, 0, 0, 0, 0, 0.075, 0.075, 0.075), pt(SPH, 0xf0675a, 0, 0.03, 0, 0, 0, 0, 0.082, 0.07, 0.082),
    pt(CYL, 0x8c5a34, 0, 0.12, 0, 0, 0, 0, 0.012, 0.1, 0.012), pt(SPH, 0xfff1d0, 0, 0.065, 0, 0, 0, 0, 0.082, 0.014, 0.082)]), M.material('prop'));
  R.addOutline(bobber, true); bobber.visible = false; scene.add(bobber);

  var LN = 18, lineGeo = new THREE.BufferGeometry(), lpos = new Float32Array(LN * 3);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
  var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x5b3a29 }));
  line.frustumCulled = false; line.visible = false; scene.add(line);

  var shGeo = new THREE.ShapeGeometry((function () {
    var s = new THREE.Shape(); s.moveTo(0.5, 0); s.bezierCurveTo(0.45, 0.2, 0.0, 0.22, -0.3, 0.05); s.lineTo(-0.55, 0.2); s.lineTo(-0.5, 0); s.lineTo(-0.55, -0.2);
    s.lineTo(-0.3, -0.05); s.bezierCurveTo(0.0, -0.22, 0.45, -0.2, 0.5, 0); return s;
  })());
  shGeo.rotateX(-Math.PI / 2);
  var shMat = new THREE.MeshBasicMaterial({ color: 0x2f5f7a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  var shadow = new THREE.Mesh(shGeo, shMat); shadow.visible = false; shadow.renderOrder = 2; scene.add(shadow);

  var ringGeo = new THREE.RingGeometry(0.86, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  var rings = [], ri = 0, i0;
  for (i0 = 0; i0 < 6; i0++) {
    var rm = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0, depthWrite: false }));
    rm.visible = false; rm.renderOrder = 3; scene.add(rm); rings.push({ m: rm, t: 9, life: 1, s0: 0.1, s1: 1, o: 0.7 });
  }
  function ripple(x, z, s1, life, o) {
    var r = rings[ri]; ri = (ri + 1) % rings.length;
    r.t = 0; r.life = life || 1.1; r.s0 = 0.08; r.s1 = s1 || 0.8; r.o = o || 0.7; r.m.position.set(x, 0.035, z); r.m.visible = true;
  }
  function stepRings(dt) {
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i]; if (r.t >= r.life) { if (r.m.visible) r.m.visible = false; continue; }
      r.t += dt; var u = clamp(r.t / r.life, 0, 1), s = r.s0 + (r.s1 - r.s0) * (1 - (1 - u) * (1 - u));
      r.m.scale.set(s, 1, s); r.m.material.opacity = r.o * (1 - u) * (1 - u);
      if (u >= 1) r.m.visible = false;
    }
  }

  /* ------------------------------------------------------------ particles: water drops + star confetti */
  var ND = 30, NS = 28, drops = [], stars = [], i1;
  var dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd6f0ff }), ND);
  var starShape = new THREE.Shape(), si;
  for (si = 0; si < 10; si++) { var sa = si / 10 * TAU + Math.PI / 2, sr = si % 2 ? 0.42 : 1; if (!si) starShape.moveTo(Math.cos(sa) * sr, Math.sin(sa) * sr); else starShape.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr); }
  var starMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(starShape), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), NS);
  [dropMesh, starMesh].forEach(function (m) { m.frustumCulled = false; m.count = 0; m.visible = false; m.raycast = function () {}; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
  for (i1 = 0; i1 < ND; i1++) drops.push({ on: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.03, l: 0, m: 1 });
  var starCols = [0xffd36a, 0xff9fb0, 0x9fd8ff, 0xb9e6a0, 0xffffff, 0xf7b267];
  for (i1 = 0; i1 < NS; i1++) stars.push({ on: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, l: 0, m: 1, sp: 0, c: new THREE.Color() });
  starMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  var dpi = 0, spi = 0;
  function splash(x, z, n, power) {
    for (var i = 0; i < n; i++) {
      var d = drops[dpi], a = Math.random() * TAU, v = rnd(0.2, 0.7) * power;
      dpi = (dpi + 1) % ND;
      d.on = 1; d.x = x; d.y = 0.05; d.z = z; d.vx = Math.cos(a) * v; d.vz = Math.sin(a) * v; d.vy = rnd(1.6, 2.8) * power; d.s = rnd(0.022, 0.04); d.l = d.m = rnd(0.45, 0.7);
    }
  }
  function confetti(x, y, z, n) {
    n = Math.round(n * calmK);
    for (var i = 0; i < n; i++) {
      var s = stars[spi]; spi = (spi + 1) % NS;
      var a = Math.random() * TAU, v = rnd(0.5, 1.5);
      s.on = 1; s.x = x; s.y = y; s.z = z; s.vx = Math.cos(a) * v; s.vz = Math.sin(a) * v; s.vy = rnd(1.8, 3.4); s.s = rnd(0.07, 0.12); s.l = s.m = rnd(1.0, 1.5);
      s.sp = rnd(-6, 6); s.c.setHex(starCols[(Math.random() * starCols.length) | 0]);
    }
  }
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  function stepParts(dt) {
    var i, p, n = 0, k;
    for (i = 0; i < ND; i++) {
      p = drops[i]; if (!p.on) continue;
      p.l -= dt; p.vy -= 7 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.l <= 0 || p.y < 0.02) { p.on = 0; continue; }
      k = p.s * Math.min(1, p.l / (p.m * 0.35));
      _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(k, k * 1.3, k)); dropMesh.setMatrixAt(n++, _m);
    }
    dropMesh.count = n; dropMesh.visible = n > 0; dropMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (i = 0; i < NS; i++) {
      p = stars[i]; if (!p.on) continue;
      p.l -= dt; p.vy -= 5.5 * dt; p.vx *= 1 - 0.8 * dt; p.vz *= 1 - 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.l <= 0 || p.y < 0.05) { p.on = 0; continue; }
      k = p.s * Math.min(1, p.l / (p.m * 0.3));
      _q2.setFromAxisAngle(_z, p.sp * (p.m - p.l));
      _q.copy(R.camera.quaternion).multiply(_q2);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(k, k, k)); starMesh.setMatrixAt(n, _m); starMesh.setColorAt(n, p.c); n++;
    }
    starMesh.count = n; starMesh.visible = n > 0; starMesh.instanceMatrix.needsUpdate = true;
    if (starMesh.instanceColor) starMesh.instanceColor.needsUpdate = true;
  }

  /* ------------------------------------------------------------ held catch (fish or junk) */
  var held = new THREE.Group(), heldMesh = null, heldGeo = null; held.visible = false; scene.add(held);
  if (G.Scenes && G.Scenes.outdoorOnly) [bobber, line, shadow, dropMesh, starMesh, held].concat(rings.map(function (r) { return r.m; })).forEach(G.Scenes.outdoorOnly);   // Scenes hides these indoors
  function buildHeld(def, junk) {
    var ic = (def && def.icon) || {}, c1 = col(ic.c1, 0x88aacc), c2 = col(ic.c2, 0xeeeeee), c3 = col(ic.c3, 0xffffff), v = ic.v, l = [], k;
    if (heldMesh) { held.remove(heldMesh); if (heldGeo) heldGeo.dispose(); heldMesh = null; }
    if (junk || ic.tpl !== 'fish') {
      l.push(pt(SPH, c1, 0, 0, 0, 0, 0, 0, 0.13, 0.08, 0.09), pt(SPH, c2, 0.02, 0.05, 0, 0, 0, 0, 0.07, 0.05, 0.06), pt(CYL, c2, -0.1, 0.0, 0, 0, 0, 1.2, 0.025, 0.12, 0.025));
    } else if (G.FishModels) {
      l = G.FishModels.parts(def.id, { len: v === 'round' ? 0.34 : v === 'flat' ? 0.32 : 0.4, y: 0.01 });
    } else {
      var bl = v === 'round' ? 0.15 : v === 'flat' ? 0.14 : 0.21, bh = v === 'round' ? 0.1 : v === 'flat' ? 0.115 : 0.06;
      l.push(pt(SPH, c1, 0, 0.012, 0, 0, 0, 0, bl, bh, 0.05), pt(SPH, c2, 0.01, -0.02, 0, 0, 0, 0, bl * 0.85, bh * 0.55, 0.045),
        pt(CONE, c3, -bl - 0.04, 0, 0, 0, 0, -1.5708, 0.07, 0.11, 0.015), pt(CONE, c3, -0.01, bh + 0.01, 0, 0, 0, 0, 0.05, 0.07, 0.012),
        pt(SPH, 0xffffff, bl * 0.62, 0.025, 0.04, 0, 0, 0, 0.022), pt(SPH, 0x3a2a22, bl * 0.65, 0.025, 0.055, 0, 0, 0, 0.012));
      for (k = 0; k < 2; k++) l.push(pt(SPH, c3, bl * 0.2 - k * 0.04, -bh * 0.7, 0, 0, 0, 0, 0.03, 0.015, 0.01));
    }
    heldGeo = M.mergeParts(l);
    heldMesh = new THREE.Mesh(heldGeo, M.material('prop')); R.addOutline(heldMesh, true); held.add(heldMesh);
  }

  /* ------------------------------------------------------------ camera zoom (relative, so pinch zoom stays respected) */
  var zoomCur = 1;
  function zoomTo(f) {
    if (f === zoomCur) return;
    G.Camera.zoomBy(f / zoomCur); zoomCur = f;
  }
  var origGetState = G.Camera.getState;
  G.Camera.getState = function () { var s = origGetState.call(G.Camera); s.zoom = s.zoom / zoomCur; return s; };

  /* ------------------------------------------------------------ main animation / effects frame */
  var pose = M.Anim.newPose(), KEYS = M.Anim.KEYS, prevSt = 'off', stT = 0, clockT = 0, nibT = 2, ripT = 0, bend = 0.15, bendV = 0, prevArm = 1.05, lastCharge = 0.5;
  var shA = 0, shR = 1, shOp = 0, shX = 0, shZ = 0, catchT = -1, catchInfo = null, bobAng = 0, tip = new THREE.Vector3(), calc = new THREE.Vector3(), cele = false;
  var ARM = 1.05, slump = false;

  E.on('fish:sat', function () { buildRod(); zoomTo(0.84); });
  E.on('fish:stopped', function () { zoomTo(1); catchT = -1; held.visible = false; cele = false; });
  E.on('fish:cast', function () { lastCharge = clamp(V.charge, 0.2, 1); });
  E.on('fish:bite', function () {
    ripple(V.bobPos.x, V.bobPos.z, 0.55, 0.8, 0.8);
    if (G.AnimTools) { P.hero.joints.head.getWorldPosition(tmpT); G.AnimTools.emote('!', tmpT.x, tmpT.y + 0.42, tmpT.z, 0.9, 1); }   // startled "!" mark
  });
  E.on('fish:caught', function (e) { startCatch(e.id, false, e.q, e.perfect, e.size); });
  E.on('fish:junk', function (e) { startCatch(e.id, true, 'normal', false); });
  E.on('fish:escaped', function () { slump = true; splash(V.bobPos.x, V.bobPos.z, 5, 0.7); ripple(V.bobPos.x, V.bobPos.z, 0.7, 0.9, 0.6); });
  function startCatch(id, junk, q, perfect, size) {
    var def = Items.get(id);
    buildHeld(def, junk);
    catchInfo = { junk: junk, q: q, perfect: !!perfect, big: junk ? 1 : clamp(0.7 + (size || 40) / 75, 0.85, 1.75), sx: V.bobPos.x, sz: V.bobPos.z };
    catchT = 0; cele = false; held.visible = true; held.scale.setScalar(0.01);
    splash(catchInfo.sx, catchInfo.sz, 12, 1.1); ripple(catchInfo.sx, catchInfo.sz, 1.0, 1.0, 0.8);
  }
  var FACE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  function headPos(out, h) {
    var d = FACE[P.facing] || FACE.s;
    return out.set(P.pos.x + d[0] * 0.08, h, P.pos.z + d[1] * 0.08);
  }

  G.Loop.onFrame(function (dt) {
    var pt0 = G.Prof && G.Prof.on ? performance.now() : 0;
    fxFrame(dt);
    if (pt0) G.Prof.mark(pt0);
  }, 102);
  function fxFrame(dt) {
    clockT += dt; stT += dt;
    var st = F.state, on = st !== 'off', i, k, T, u, armR, armL, spine, head, armRZ, armLZ, hop, a, tx, tz, r;
    if (st !== prevSt) {
      // state transitions -> effects
      if (prevSt === 'cast' && st === 'wait') { splash(V.bobPos.x, V.bobPos.z, 9, 1); ripple(V.bobPos.x, V.bobPos.z, 0.9, 1.2, 0.8); ripple(V.bobPos.x, V.bobPos.z, 0.5, 0.9, 0.7); nibT = rnd(1.2, 2.2); }
      if (st === 'reel') { splash(V.bobPos.x, V.bobPos.z, 6, 0.8); zoomTo(0.76); }
      else if (prevSt === 'reel') zoomTo(F.state === 'off' ? 1 : 0.84);
      prevSt = st; stT = 0;
    }
    if (!on) {
      rodRoot.visible = false; bobber.visible = false; line.visible = false; shadow.visible = false;
      if (st === 'off') { held.visible = false; }
      stepRings(dt); stepParts(dt); return;
    }
    if (!built) buildRod();
    setRod(V.rodId || 'bamboo_pole');

    /* ---- character pose (applied after Player's sitting pose and farm_fx) */
    for (i = 0; i < KEYS.length; i++) pose[KEYS[i]] = P.hero.anim.pose[KEYS[i]];
    armR = ARM; armL = 0.72; armRZ = 0.12; armLZ = 0.1; spine = 0.06; head = 0.14; hop = 0;
    T = clockT;
    if (st === 'charge') {
      k = clamp(V.charge, 0, 1); armR = ARM + 1.35 * k; armL = 0.72 + 0.9 * k; spine = 0.06 - 0.26 * k; head = 0.14 - 0.3 * k; armRZ = 0.12 + 0.2 * k;
    } else if (st === 'cast') {
      u = V.castK; KA[1] = ARM + 1.35 * lastCharge; KA[7] = ARM; armR = ky(u, KA); KB[1] = 0.72 + 0.9 * lastCharge; armL = ky(u, KB);
      KC[1] = -0.2 * lastCharge; spine = ky(u, KC); head = ky(u, KD);
    } else if (st === 'wait') {
      armR = ARM + 0.025 * Math.sin(T * 1.7); head = 0.16 + 0.03 * Math.sin(T * 0.9);
      if (stT > 4) { armR += 0.04 * Math.sin(T * 0.7); spine += 0.03 * Math.sin(T * 0.5); }
    } else if (st === 'bite') {
      armR = ARM + 0.28 + 0.07 * Math.sin(T * 34) + 0.5 * (1 - ss(stT / 0.18)); armL = 0.9 + 0.4 * (1 - ss(stT / 0.2)); spine = -0.12 - 0.12 * (1 - ss(stT / 0.25)); head = -0.12 + 0.04 * Math.sin(T * 30); hop = 0.09 * Math.sin(3.1416 * Math.min(1, stT / 0.3));
    } else if (st === 'reel') {
      r = V.R;
      armR = 1.32 + (r && !r.inside ? 0.12 : 0) + 0.06 * Math.sin(T * 9); armL = 0.85 + 0.5 * Math.sin(T * 11); armLZ = 0.1 + 0.18 * Math.cos(T * 11);
      spine = -0.14 + (r && !r.inside ? 0.12 : 0) + 0.04 * Math.sin(T * 6); head = -0.02; hop = 0.012 * Math.sin(T * 22) * (r && !r.inside ? 1 : 0.4);
    } else if (st === 'idle') {
      armR = ARM + 0.02 * Math.sin(T * 1.5); head = 0.1 + 0.04 * Math.sin(T * 0.8);
      if (slump && stT < 0.9) spine += 0.1 * (1 - ss(stT / 0.9)); else slump = false;   // slump after an escape fades out
    }
    // catch celebration overrides arms while the result card is up
    cele = st === 'result' && catchT >= 0 && catchInfo;
    if (cele) {
      u = ss(catchT / 0.35);
      if (catchInfo.junk) { armR = ARM + (1.7 - ARM) * u; armL = 0.72 + (1.7 - 0.72) * u; head = 0.14 + 0.1 * Math.sin(catchT * 7); pose.headRY = 0.25 * Math.sin(catchT * 8) * u; spine = 0.1 * u; }
      else { armR = ARM + (2.9 - ARM) * u; armL = 0.72 + (2.9 - 0.72) * u; armRZ = 0.12 + 0.28 * u; armLZ = 0.1 + 0.3 * u; spine = 0.06 - 0.12 * u; head = 0.14 - 0.34 * u; hop = 0.05 * Math.abs(Math.sin(catchT * 8)) * u; }
    }
    if (st === 'reel') { pose.legLX += 0.07 * Math.sin(T * 14); pose.legRX -= 0.07 * Math.sin(T * 14); }
    if (st === 'idle' && slump && stT < 0.9) { var sh = ss(Math.min(1, stT / 0.2)) * (1 - ss((stT - 0.6) / 0.3)); armRZ += 0.5 * sh; armLZ += 0.5 * sh; pose.headRZ = 0.2 * sh; head += 0.12 * sh; }   // shrug after losing a fish
    pose.armRX = armR; pose.armLX = armL; pose.armRZ = armRZ; pose.armLZ = armLZ; pose.spineRX = spine; pose.headRX = head; pose.bob += hop;
    M.Anim.apply(P.hero, pose);
    rodRoot.visible = !cele;

    /* ---- rod bend (spring: follows arm acceleration + line load) */
    var armVel = (armR - prevArm) / Math.max(dt, 0.001); prevArm = armR;
    var tgt = 0.14 + clamp(armVel, -12, 12) * 0.075;
    if (st === 'wait') tgt += 0.04 * Math.sin(T * 2.1) + (nibT < 0.3 ? 0.12 : 0);
    else if (st === 'bite') tgt = 0.4 + 0.15 * Math.sin(T * 34);
    else if (st === 'reel') { r = V.R; tgt = (r && r.inside ? 0.5 : 0.82) + 0.1 * Math.sin(T * 13) + 0.2 * (1 - (r ? r.prog : 0.5)); }
    else if (st === 'result' || st === 'idle') tgt = 0.12;
    bendV += (160 * (tgt - bend) - 14 * bendV) * dt; bend = clamp(bend + bendV * dt, -0.9, 1.3);
    for (i = 0; i < 4; i++) segs[i].rotation.x = bend * (0.16 + 0.1 * i);

    /* ---- bobber + line */
    P.hero.root.updateMatrixWorld(true);
    tipObj.getWorldPosition(tip);
    if (!castTrail && G.AnimTools) castTrail = G.AnimTools.trail(0xffffff, 0.035, 0.18);
    if (castTrail) { if (st === 'cast' && V.castK < 0.75 && !calm) castTrail.add(tip.x, tip.y, tip.z); castTrail.update(dt); }
    if (V.bobOn) {
      bobAng += dt;
      bobber.visible = true;
      var bp = V.bobPos, wobble = st === 'bite' ? 0.35 * Math.sin(T * 26) : st === 'reel' ? 0.25 * Math.sin(T * 12) : 0.06 * Math.sin(T * 2.2);
      var nib = 0;
      if (st === 'wait') {
        nibT -= dt;
        if (nibT < 0.3 && nibT > 0) nib = -0.035 * (1 + 1.4 * (V.nib || 0)) * Math.sin((0.3 - nibT) / 0.3 * Math.PI);
        if (nibT <= 0) { nibT = rnd(1.4, 3.2) * (1 - 0.55 * (V.nib || 0)); ripple(bp.x, bp.z, 0.4, 0.8, 0.55); }
        ripT += dt; if (ripT > 1.7) { ripT = 0; ripple(bp.x, bp.z, 0.3, 1.2, 0.4); }
      } else if (st === 'bite') { ripT += dt; if (ripT > 0.22) { ripT = 0; ripple(bp.x, bp.z, 0.5, 0.7, 0.7); } }
      else if (st === 'reel') { ripT += dt; if (ripT > 0.3) { ripT = 0; ripple(bp.x, bp.z, 0.7, 0.8, 0.6); if (Math.random() < 0.5) splash(bp.x, bp.z, 2, 0.6); } }
      bobber.position.set(bp.x, bp.y + nib + 0.03, bp.z);
      bobber.rotation.set(wobble, 0, wobble * 0.6);
      if (st === 'cast') bobber.rotation.z += V.castK * 9;
      // sagging line: parabola between rod tip and bobber, sag shrinks while taut
      var dx = bp.x - tip.x, dy = bobber.position.y + 0.1 - tip.y, dz = bp.z - tip.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var sag = st === 'reel' ? 0.03 + 0.04 * Math.abs(Math.sin(T * 8)) : st === 'bite' ? 0.05 : st === 'cast' ? 0.05 : Math.min(0.5, 0.06 * dist);
      for (i = 0; i < LN; i++) {
        k = i / (LN - 1);
        lpos[i * 3] = tip.x + dx * k; lpos[i * 3 + 1] = tip.y + dy * k - sag * 4 * k * (1 - k); lpos[i * 3 + 2] = tip.z + dz * k;
      }
      lineGeo.attributes.position.needsUpdate = true; line.visible = true;
    } else { bobber.visible = false; line.visible = false; ripT = 0; }

    shadow.visible = false;   // Stage 16 D2: old circling shadow replaced by FishLife

    /* ---- catch celebration: fish arcs out of the water, then is held overhead */
    if (catchT >= 0 && catchInfo) {
      catchT += dt;
      if (st !== 'result' && catchT > 0.05) { held.visible = false; catchT = -1; }
      else {
        headPos(calc, catchInfo.junk ? 1.3 : 1.62);
        var f = clamp(catchT / 0.45, 0, 1), e = ss(f);
        if (f < 1) {
          held.position.set(catchInfo.sx + (calc.x - catchInfo.sx) * e, 0.05 + (calc.y - 0.05) * e + Math.sin(f * Math.PI) * 0.9, catchInfo.sz + (calc.z - catchInfo.sz) * e);
          held.rotation.set(0, 0, f * TAU * 1.5);
          held.scale.setScalar(Math.max(0.01, 0.5 + 0.5 * f) * (catchInfo.junk ? 1.1 : catchInfo.big));
        } else {
          if (f >= 1 && catchT - dt < 0.45) {   // arrival frame: confetti + toast
            if (!catchInfo.junk) {
              confetti(calc.x, calc.y + 0.1, calc.z, (catchInfo.perfect ? 22 : 14) + (catchInfo.q === 'gold' ? 14 : catchInfo.q === 'silver' ? 7 : 0) + (catchInfo.big > 1.4 ? 8 : 0));
                            
            }
          }
          var pu = catchT - 0.45, pp = 1 + 0.35 * Math.exp(-pu * 6) * Math.sin(pu * 22);
          held.position.set(calc.x, calc.y + 0.05 * Math.abs(Math.sin(pu * 7)) * (catchInfo.junk ? 0 : 1), calc.z);
          held.rotation.set(0, (catchInfo.junk ? 0.5 : 0.2) * Math.sin(pu * 3), (catchInfo.junk ? 0.3 : 0.12) * Math.sin(pu * 6));
          held.scale.setScalar((catchInfo.junk ? 1.1 : catchInfo.big) * pp);
        }
      }
    } else if (held.visible) held.visible = false;
    stepRings(dt); stepParts(dt);
  }

  /* ------------------------------------------------------------ Round 3 stage 13: living lake (FishLife) on top of Game.FishSchool (js/fish_school.js) */
  var FL = G.FishLife = {}, FM = G.FishModels, WM = G.WorldMap, FDt = G.FishData, FS = G.FishSchool;
  /* body types: 0 slender, 1 round, 2 flat, 3 long -> [profile exponent, width k] ; per look: [length, width, fin, bend, body] */
  var BODYK = [[0.85, 1], [0.62, 1.15], [0.95, 1.3], [1.05, 0.7]];
  var LOOK = { perch: [0.8, 0.34, 0.5, 0.55, 0], trout: [1, 0.28, 0.55, 0.55, 0], carp: [1.1, 0.4, 0.5, 0.45, 1], bream: [0.85, 0.5, 0.45, 0.45, 2], pike: [1.3, 0.22, 0.5, 0.6, 3], catfish: [1.1, 0.34, 0.4, 0.6, 0], eel: [1.5, 0.1, 0.1, 1.2, 3], koi: [1.1, 0.38, 0.7, 0.5, 1], snake: [1.5, 0.13, 0.2, 1.1, 3], goby: [0.7, 0.3, 0.4, 0.6, 1], knife: [1.3, 0.2, 0.5, 0.4, 3], tilapia: [0.85, 0.46, 0.45, 0.5, 1], sprat: [0.5, 0.2, 0.4, 0.7, 0], pangas: [1.2, 0.3, 0.5, 0.5, 0], lang: [1.4, 0.28, 0.6, 0.55, 3] };
  var CAPS = [40, 40, 40, 40];   // shadow count is gameplay (bite odds), so it must not depend on the quality tier
  var sim = null, fish = null, hot = null, mesh = null, mat = null, aP = null, aQ = null, aR = null, life = false, lifeT = 0, spTimer = 0, N = 0, GW = 0, px = 0, pz = 0, pInit = false, pFlee = 0, tmpNear = [];
  function lookName(id) { try { return FM.lookOf(id); } catch (e) { return 'trout'; } }
  function shape(id) { return LOOK[lookName(id)] || LOOK.trout; }
  function sizeOf(id) { var d = FDt && FDt.get(id), r = d && d.tier === 'gold' ? 1.18 : d && d.tier === 'silver' ? 1.08 : 1; return (0.75 + clamp(((d && d.price) || 60) / 900, 0, 1) * 0.6) * r; }
  function qLevel() { return G.Quality && G.Quality.level ? G.Quality.level() : 0; }
  function tileD(x, z) { return sim ? sim.td(x, z) : 0; }
  function eligible() {   // species that fit time / season / weather / bait right now
    var T = G.Time, out = [], i, d, bk = null, bi = F.baitId ? Items.get(F.baitId) : null;
    if (bi && bi.bait) bk = bi.bait;
    for (i = 0; i < FDt.species.length; i++) {
      d = FDt.species[i];
      if (d.seasons.indexOf(T.season) < 0 || T.hour < d.h[0] || T.hour >= d.h[1] || (d.weather && d.weather.indexOf(T.weather) < 0) || d.legend) continue;
      out.push({ id: d.id, w: (12 - d.diff * 1.5) * (bk && d.bait === bk ? 3 : 1) });
    }
    return out;
  }
  function pickSp(list) {
    var t = 0, i, r; for (i = 0; i < list.length; i++) t += list[i].w;
    r = Math.random() * t; for (i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) return list[i].id; }
    return list.length ? list[0].id : 'sarat';
  }
  function refreshSpecies(force) {
    var el = eligible(), h, f, i;
    for (h = 0; h < hot.length; h++) { var H = hot[h]; H.sp = []; if (!el.length) continue; var a = pickSp(el), b = pickSp(el); H.sp = a === b ? [a] : [a, b]; }
    for (i = 0; i < fish.length; i++) {
      f = fish[i]; if (f.eng) continue;
      if (f.h >= 0 && hot[f.h] && hot[f.h].sp.length) { if (force || !f.id || hot[f.h].sp.indexOf(f.id) < 0 && el.every(function (e) { return e.id !== f.id; })) setSp(f, hot[f.h].sp[i % hot[f.h].sp.length]); }
      else if (!f.id) setSp(f, 'sarat');
    }
  }
  function setSp(f, id) {
    var s = shape(id), z = sizeOf(id);
    f.id = id; f.size = z; f.body = s[4]; f.len = s[0] * z;
    aP.setXYZW(f.i, f.len, s[1] * BODYK[s[4]][1], s[2], s[3]); aQ.array[f.i * 4 + 3] = BODYK[s[4]][0];
  }
  var tex = null;
  function softTex() {   // 32x32 soft alpha: gaussian-ish across the body width, fading at head and tail
    var c = document.createElement('canvas'), x, y, a, d = null, ctx;
    c.width = 32; c.height = 32; ctx = c.getContext('2d'); d = ctx.createImageData(32, 32);
    for (y = 0; y < 32; y++) for (x = 0; x < 32; x++) {
      var ax = Math.abs(x / 31 * 2 - 1), ay = Math.abs(y / 31 * 2 - 1); a = Math.pow(clamp(1 - ax * ax, 0, 1), 0.9) * clamp((1 - ay) * 5, 0, 1) * 255;
      d.data[(y * 32 + x) * 4] = 255; d.data[(y * 32 + x) * 4 + 1] = 255; d.data[(y * 32 + x) * 4 + 2] = 255; d.data[(y * 32 + x) * 4 + 3] = a;
    }
    ctx.putImageData(d, 0, 0); tex = new THREE.CanvasTexture(c); return tex;
  }
  FL.build = function () {
    if (life || !FDt || !FDt.species || !FS || !WM || !WM.rows) return;
    var grid = FS.buildGrid(WM.rows); if (grid.water.length <= 40) return;
    var q = qLevel(), S = 14, geo = new THREE.InstancedBufferGeometry(), pos = [], au = [], as = [], idx = [], i, j;
    N = CAPS[q < 0 ? 0 : q > 3 ? 3 : q]; GW = grid.W;
    sim = FS.create({ grid: grid, cap: N, nAtt: 4 }); fish = sim.fish; hot = sim.att;
    for (i = 0; i <= S; i++) for (j = -1; j <= 1; j += 2) { pos.push(0, 0, 0); au.push(i / S); as.push(j); }
    for (i = 0; i < S; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1)); geo.setAttribute('aS', new THREE.Float32BufferAttribute(as, 1));
    geo.setIndex(idx);
    aP = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); aQ = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); aR = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
    aP.setUsage(THREE.DynamicDrawUsage); aQ.setUsage(THREE.DynamicDrawUsage); aR.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aP', aP); geo.setAttribute('aQ', aQ); geo.setAttribute('aR', aR);
    mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uShallow: { value: new THREE.Color(0x4f8a9a) }, uDeep: { value: new THREE.Color(0x14323f) }, uOp: { value: 0.46 }, uTex: { value: softTex() } },
      /* aP = (length, width, head fin, bend amount); aQ = (phase, tail freq (speed-linked), alpha, profile exponent); aR = (depth 0..1, ripple seed) */
      vertexShader: 'attribute float aU; attribute float aS; attribute vec4 aP; attribute vec4 aQ; attribute vec2 aR; uniform float uT; varying float vA; varying float vD; varying vec2 vUv;\n' +
        'void main(){ float u=aU; float body=u>0.2?sin(3.14159*pow((u-0.2)/0.8,aQ.w)):0.0; float fin=u<0.24?aP.z*(1.0-u/0.24):0.0;\n' +
        ' float hw=max(max(body*0.5,u<0.3?0.05:0.0),fin*0.55)*aP.y*1.25; float tail=(0.1+(1.0-u)*(1.0-u)*0.9);\n' +
        ' float wv=sin(u*5.0-uT*aQ.y+aQ.x)*aP.w*0.1*tail;\n' +
        ' vec3 p=vec3((u-0.5)*aP.x,0.0,aS*hw*aP.x+wv*aP.x); vA=aQ.z; vD=aR.x; vUv=vec2(aS*0.5+0.5,u);\n' +
        ' vec4 w=modelMatrix*instanceMatrix*vec4(p,1.0);\n' +
        ' w.x+=sin(w.z*2.6+uT*1.5+aR.y)*0.018; w.z+=cos(w.x*2.3+uT*1.2+aR.y)*0.018;\n' +   // faint ripple distortion
        ' gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'uniform vec3 uShallow; uniform vec3 uDeep; uniform float uOp; uniform sampler2D uTex; varying float vA; varying float vD; varying vec2 vUv;\n' +
        'void main(){ float a=texture2D(uTex,vUv).a; vec3 c=mix(uShallow,uDeep,vD); gl_FragColor=vec4(c,uOp*vA*a*mix(0.45,1.0,vD)); }'
    });
    mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.raycast = function () {};
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
    if (G.Scenes && G.Scenes.outdoorOnly) G.Scenes.outdoorOnly(mesh);
    for (i = 0; i < N; i++) { aQ.array[i * 4] = fish[i].ph; aQ.array[i * 4 + 1] = 5; aQ.array[i * 4 + 3] = 0.85; aR.array[i * 2 + 1] = fish[i].ph2 * 3; }
    life = true; refreshSpecies(true); mesh.count = N;
  };
  /* A cast at (x,z): shadows within 2.5 tiles. s = sum(1 - d/2.5) (more and closer = bigger), m = bite multiplier 1.5..2.5 (1 with none), biter = chosen shadow index (weighted by closeness, not the ones darting). */
  FL.probe = function (x, z) {
    var out = { hot: -1, near: false, species: [], count: 0, s: 0, m: 1, biter: -1, id: null }, i, n, d, w, tot = 0, r, f;
    if (!life) return out;
    sim.near(x, z, 2.5, tmpNear); n = tmpNear.length; out.count = n;
    if (!n) return out;
    for (i = 0; i < n; i++) { f = fish[tmpNear[i]]; d = Math.sqrt((f.x - x) * (f.x - x) + (f.z - z) * (f.z - z)); w = 1 - d / 2.5; out.s += w; if (f.id && out.species.indexOf(f.id) < 0) out.species.push(f.id); if (f.fl <= 0) tot += w * w + 0.02; }
    out.near = true; out.m = 1.5 + clamp((out.s - 0.3) / 2.2, 0, 1); out.hot = out.s >= 1.4 ? 0 : -1;
    r = Math.random() * tot;
    for (i = 0; i < n; i++) { f = fish[tmpNear[i]]; if (f.fl > 0) continue; d = Math.sqrt((f.x - x) * (f.x - x) + (f.z - z) * (f.z - z)); r -= (1 - d / 2.5) * (1 - d / 2.5) + 0.02; if (r <= 0 || i === n - 1) { out.biter = f.i; out.id = f.id; break; } }
    return out;
  };
  var eng = null, engStart = 0, engD0 = 1;
  function engage(plan) {
    var bp = V.bobPos, best = plan.shadow >= 0 && fish[plan.shadow] && !fish[plan.shadow].eng ? fish[plan.shadow] : null, i, bd = 1e9, d, f;
    if (!best) for (i = 0; i < fish.length; i++) {   // fallback: the nearest free shadow, preferring the right species
      f = fish[i]; if (f.eng) continue; d = (f.x - bp.x) * (f.x - bp.x) + (f.z - bp.z) * (f.z - bp.z);
      if (plan.def && f.id === plan.def.id) d *= 0.25;
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return;
    d = Math.sqrt((best.x - bp.x) * (best.x - bp.x) + (best.z - bp.z) * (best.z - bp.z));
    if (d > 4.5) {   // open-water visitor: appear at the edge of view, faded in
      var a = Math.random() * TAU, rr = 3.2, nx = bp.x + Math.cos(a) * rr, nz = bp.z + Math.sin(a) * rr;
      if (tileD(nx, nz) < 1.2) { nx = bp.x - Math.cos(a) * rr; nz = bp.z - Math.sin(a) * rr; }
      if (tileD(nx, nz) < 1.2) { nx = bp.x; nz = bp.z + 0.1; }
      best.x = nx; best.z = nz; best.al = 0;
    }
    best.eng = 1; best.fl = 0; if (plan.def) setSp(best, plan.def.id);
    eng = best; engD0 = Math.max(0.8, Math.sqrt((best.x - bp.x) * (best.x - bp.x) + (best.z - bp.z) * (best.z - bp.z)));
    engStart = V.waitTot || 6; best.hd = Math.atan2(bp.z - best.z, bp.x - best.x);
  }
  function release(flee) {
    if (!eng) return; var f = eng; eng = null; f.eng = 0;
    if (flee) { f.fl = 2.2; var bp = V.bobPos; f.hd = Math.atan2(f.z - bp.z, f.x - bp.x); f.want = f.hd; f.tsp = 1.6; }
  }
  E.on('fish:cast', function () { release(false); });
  E.on('fish:caught', function () { if (eng) { eng.al = 0; var p = sim.randomWater(3); eng.x = p.x; eng.z = p.z; eng.lx = p.x; eng.lz = p.z; } release(false); });
  E.on('fish:junk', function () { release(false); });
  E.on('fish:escaped', function () { release(true); });
  E.on('fish:lost', function () { release(true); });
  E.on('fish:stopped', function () { release(true); });
  function wrapA(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function stepLife(dt) {
    var i, f, h, bp = V.bobPos, st = F.state, plan = V.plan, P = G.Player;
    lifeT += dt; spTimer -= dt;
    mesh.visible = !G.Scenes || G.Scenes.outdoor !== false;   // Scenes.outdoorOnly forces hidden indoors but never shows it again
    if (spTimer <= 0) { spTimer = 25; refreshSpecies(false); }
    if (P && P.pos) {   // running along the shore scares nearby shadows (run speed is 3.6 tiles/s)
      if (pInit) { var vx = (P.pos.x - px) / Math.max(dt, 0.001), vz = (P.pos.z - pz) / Math.max(dt, 0.001); if (vx * vx + vz * vz > 9 && tileD(P.pos.x, P.pos.z) < 2.5 && (pFlee -= dt) <= 0) { sim.startle(P.pos.x, P.pos.z, 4, eng); pFlee = 0.5; } }
      px = P.pos.x; pz = P.pos.z; pInit = true;
    }
    if (st === 'wait' && prevSt === 'cast' && stT < 0.3 && bp) sim.startle(bp.x, bp.z, 0.9, plan && plan.shadow >= 0 ? fish[plan.shadow] : null);   // a bobber landing very close makes shadows dart
    if (st === 'wait' && !eng && plan && plan.kind === 'fish' && plan.seen !== false && V.bobOn && stT < 0.3 && prevSt === 'wait') engage(plan);
    if (st === 'off' || st === 'idle') release(true);
    var tm = G.Time, hr = tm ? tm.hour : 12, op = 0.46;
    if (tm && tm.weather === 'rain') op *= 0.65;
    if (hr >= 20.5 || hr < 5.5) op *= 0.55; else if (hr >= 19 || hr < 6.5) op *= 0.8;
    mat.uniforms.uOp.value += (op - mat.uniforms.uOp.value) * Math.min(1, dt * 2);
    mat.uniforms.uT.value = lifeT;
    var lineOut = lineIsOut(), fr = lineOut ? FOCUS_R2 : 0, adt, fx0, fz0;
    sim.focus(bp.x, bp.z, lineOut ? FOCUS_R : 0);
    sim.step(dt);
    var m = mesh.instanceMatrix.array, ch, sh, o, dp, lx0 = 1e9, lx1 = -1e9, lz0 = 1e9, lz1 = -1e9;
    for (i = 0; i < fish.length; i++) {
      f = fish[i]; adt = dt;
      if (f.x < lx0) lx0 = f.x; if (f.x > lx1) lx1 = f.x; if (f.z < lz0) lz0 = f.z; if (f.z > lz1) lz1 = f.z;
      if (fr > 0 && !f.eng) { fx0 = f.x - bp.x; fz0 = f.z - bp.z; if (fx0 * fx0 + fz0 * fz0 > fr) { if ((sim.sn + i) % 12 !== 0) continue; adt = dt * 12; } }   // far from the bobber: 5 Hz, staggered
      if (f.eng && eng === f) {
        var ex = bp.x - f.x, ez = bp.z - f.z, ed = Math.sqrt(ex * ex + ez * ez), want = Math.atan2(ez, ex), rr;
        if (st === 'wait') {
          var left = V.waitT, pr = clamp(1 - (left - 1.6) / Math.max(1, engStart - 1.6), 0, 1);
          rr = left < 1.6 ? 0.28 + 0.4 * Math.abs(Math.sin(left * 3.2)) : 0.9 + (engD0 - 0.9) * (1 - ss(pr));
          f.tsp = ed > rr + 0.15 ? 1.1 : 0.35;
          f.hd += clamp(wrapA(want - f.hd), -3 * dt, 3 * dt);
        } else if (st === 'bite') { f.tsp = 0.2; f.hd += clamp(wrapA(want - f.hd), -6 * dt, 6 * dt); if (ed < 0.15) f.tsp = 0; }
        else if (st === 'reel') { var an = lifeT * 2.4 + f.ph; f.hd += clamp(wrapA(an + 1.57 - f.hd), -4 * dt, 4 * dt); f.x += (bp.x + Math.cos(an) * 0.6 - f.x) * Math.min(1, dt * 5); f.z += (bp.z + Math.sin(an) * 0.6 - f.z) * Math.min(1, dt * 5); }
        else f.tsp = 0.3;
        f.spd += (f.tsp - f.spd) * Math.min(1, dt * 2.5);
        if (st !== 'reel') { f.x += Math.cos(f.hd) * f.spd * dt; f.z += Math.sin(f.hd) * f.spd * dt; }
      }
      f.al += (1 - f.al) * Math.min(1, adt * 1.5);
      ch = Math.cos(f.hd); sh = Math.sin(f.hd); o = i * 16;
      m[o] = ch; m[o + 1] = 0; m[o + 2] = sh; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = -sh; m[o + 9] = 0; m[o + 10] = ch; m[o + 11] = 0; m[o + 12] = f.x; m[o + 13] = 0.03; m[o + 14] = f.z; m[o + 15] = 1;
      dp = clamp((tileD(f.x, f.z) - 1) / 5, 0, 1);   // deeper water = darker, more opaque shadow; near the bank it fades out
      aQ.array[i * 4] = f.ph; aQ.array[i * 4 + 1] = 4 + f.spd * 7; aQ.array[i * 4 + 2] = f.al * (f.id ? 1 : 0); aR.array[i * 2] = dp;
    }
    mesh.instanceMatrix.needsUpdate = true; aQ.needsUpdate = true; aP.needsUpdate = true; aR.needsUpdate = true;
    if (lx1 >= lx0) { lkx = (lx0 + lx1) / 2; lkz = (lz0 + lz1) / 2; lkr = Math.sqrt((lx1 - lx0) * (lx1 - lx0) + (lz1 - lz0) * (lz1 - lz0)) / 2 + 1.5; }
  }
  /* Stage 36: shadows step at 20 Hz with interpolated matrices (every frame while a line is out), and sleep while the lake is off screen. */
  var lkx = 0, lkz = 0, lkr = 0, lifeSim = null;
  var FOCUS_R = 6, FOCUS_R2 = 36;   // tiles around the bobber where shadows keep the full rate
  function fishBusy() { return F.state !== 'off' && F.state !== 'idle'; }
  function lineIsOut() { var s = F.state; return V.bobOn && (s === 'cast' || s === 'wait' || s === 'bite' || s === 'reel'); }
  function lifeStep(dt) { stepLife(dt > 0.1 ? 0.1 : dt); }
  G.Loop.onFrame(function (dt) {
    if (!life) { if (G.World && G.World.tileType) FL.build(); if (!life) return; }
    if (dt > 0.1) dt = 0.1;
    if (!lifeSim) lifeSim = G.SimTier ? G.SimTier.sim(lifeStep, { meshes: [mesh], hz: function () { return lineIsOut() ? 60 : 20; }, sleep: function () { return lkr > 0 && !fishBusy() && !G.SimTier.seen(lkx, 0.03, lkz, lkr); } }) : lifeStep;
    var pt0 = G.Prof && G.Prof.on ? performance.now() : 0;
    lifeSim(dt);
    if (pt0) G.Prof.mark(pt0);
  }, 103);
  FL.speciesOf = function (i) { return fish && fish[i] ? fish[i].id : null; };
  FL.stats = function () { return { fish: fish ? fish.length : 0, hot: hot ? hot.length : 0, draw: life ? 1 : 0, visible: !!(mesh && mesh.visible), count: mesh ? mesh.count : 0, opacity: mat ? mat.uniforms.uOp.value : 0 }; };

  FX.splash = splash; FX.confetti = confetti; FX.ripple = ripple;
})();
