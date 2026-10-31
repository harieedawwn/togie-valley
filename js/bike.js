/* Togie Valley - bike.js (Round 3 stage 42): the rideable bicycle. One bicycle in the world, parked near the house; walk up and press the
 * Action button ("Lên xe") or tap it; the Action button then reads "Xuống xe" and is the ONLY way off (taps only steer). While riding: no tools,
 * no fishing, no buildings, no seats (Interact taps/actions are routed here). Speed model + rules: js/bike_core.js. Player hook: Player.ride.
 * Depends on bike_core, player, interact, world, scenes, net, ui, models, detail_kit, vn_kit (build() runs after VNLife from main.js).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.BikeCore || !G.Player || !G.Interact || !G.World || !G.Scenes || !G.Net || !G.UI || !G.Models || !G.DetailKit || !G.VNKit || !G.Loop || !G.Events || !G.Render) { console.error('[bike] missing deps'); return; }
  var C = G.BikeCore, P = G.Player, W = G.World, Scenes = G.Scenes, Net = G.Net, E = G.Events, U = G.util, I = G.Interact;
  var S = C.free(0, 0, 0), riding = false, pending = 0, st = C.newState(0), out = { dx: 0, dz: 0, speed: 0 }, lastX = 0, lastZ = 0;
  var Bike = { state: S, draws: 1 }, pendingT = 0;

  function me() { return Net.playerId || 'p1'; }
  function toast(t) { if (G.UI && G.UI.toast) G.UI.toast(t); }
  function tileOf(v) { return Math.floor(v); }
  function dist(x, z) { var dx = P.pos.x - x, dz = P.pos.z - z; return Math.sqrt(dx * dx + dz * dz); }

  /* ------------------------------------------------------------ rules glue */
  function ctx() {
    var f, fish = G.Fishing && G.Fishing.state && G.Fishing.state !== 'off';
    f = P.frontTile();
    return {
      riding: riding, occupied: !!S.r || !!pending, locked: P.isLocked(), sitting: P.sitting, fishing: !!fish, outdoor: Scenes.current === 'outdoor',
      near: dist(S.x, S.z) < C.NEAR || (f.tx === tileOf(S.x) && f.tz === tileOf(S.z)) || (P.tile().tx === tileOf(S.x) && P.tile().tz === tileOf(S.z))
    };
  }
  Bike.riding = function () { return riding; };
  Bike.canMount = function () { return C.canMount(ctx()); };

  /* ------------------------------------------------------------ ride hook for Player */
  var ride = {
    lean: 0,
    step: function (dx, dz, want, dt, rem) {
      var moved = (lastX === 0 && lastZ === 0) ? -1 : Math.sqrt((P.pos.x - lastX) * (P.pos.x - lastX) + (P.pos.z - lastZ) * (P.pos.z - lastZ));
      lastX = P.pos.x; lastZ = P.pos.z;
      return C.step(st, dx, dz, want, dt, moved, rem === undefined ? -1 : rem, out);
    },
    pose: function (hero, dt) { if (Bike.pose) Bike.pose(hero, dt, st); }
  };

  function beginRide() {
    pending = 0;
    P.placeAt({ x: S.x, z: S.z, yaw: S.ry });
    st = C.newState(S.ry); lastX = 0; lastZ = 0;
    riding = true; P.ride = ride; P.speed = 0; lastOut.x = S.x; lastOut.z = S.z; lastOut.h = S.ry;
    E.emit('bike:mount', {});
  }
  function endRide() {
    if (!riding) return;
    riding = false; P.ride = null; P.speed = 0; P.root.rotation.z = 0;
    E.emit('bike:dismount', {});
  }

  Bike.mount = function () {
    if (riding || !Bike.canMount()) { if (!riding && S.r && S.r !== me()) toast('Xe đang có người đi rồi nè!'); return false; }
    if (Net.mode === 'guest') { pending = 1; pendingT = 0; Net.send({ t: 'bk.q', a: 1 }); return true; }   // wait for the host's answer
    if (!C.mount(S, me())) return false;
    beginRide();
    if (Bike.sync) Bike.sync();
    return true;
  };
  Bike.dismount = function () {
    if (!riding) return false;
    var x = P.pos.x, z = P.pos.z, ry = st.h;
    C.dismount(S, me(), x, z, ry);   // optimistic on a guest; the host's broadcast confirms
    endRide();
    if (Net.mode === 'guest') Net.send({ t: 'bk.q', a: 0 }); else if (Bike.sync) Bike.sync();
    return true;
  };
  /** Action button / E key (Interact.useFacing calls this first). true = consumed. */
  var lastAct = -1e9, chain = false;
  Bike.onAction = function () {
    var now = (window.performance || Date).now(), rep = now - lastAct < 400, k;
    lastAct = now;
    if (rep && chain) return true;   // a held button / key repeat must not toggle again (and never reaches a tool)
    chain = false;
    k = C.actionKind(ctx());
    if (k === 'dismount') { chain = true; Bike.dismount(); return true; }
    if (k === 'mount') { chain = true; Bike.mount(); return true; }
    return false;
  };
  /** Anything that must end the ride without a button (scene change, sit, reset, disconnect): frees the bike where it stands. */
  var lastOut = { x: 0, z: 0, h: 0 };   // stage 12: last outdoor riding pose, so a forced dismount after a scene change never parks the bike inside a building
  function force() {
    if (!riding) return;
    if (G.Scenes.current === 'outdoor') C.dismount(S, me(), P.pos.x, P.pos.z, st.h); else C.dismount(S, me(), lastOut.x, lastOut.z, lastOut.h);
    endRide();
    if (Net.mode === 'guest') Net.send({ t: 'bk.q', a: 0 }); else if (Bike.sync) Bike.sync();
  }
  Bike.force = force;
  ['scene:changed', 'player:sat', 'save:loaded', 'save:reset'].forEach(function (n) { E.on(n, force); });
  G.Loop.onUpdate(function () { if (riding && G.Scenes.current === 'outdoor') { lastOut.x = P.pos.x; lastOut.z = P.pos.z; lastOut.h = st.h; } if (riding && (P.isLocked() || P.sitting)) { st.v = 0; st.a1 = 0; } });

  /* ------------------------------------------------------------ tap on the parked bike */
  I.register({
    id: 'bike', priority: 40,
    test: function (tx, tz, scene) { return scene === 'outdoor' && !riding && !S.r && tx === tileOf(S.x) && tz === tileOf(S.z) ? S : null; },
    stand: function () { return { tx: tileOf(S.x), tz: tileOf(S.z), facing: null }; },
    run: function () { Bike.mount(); }
  });

  /* ------------------------------------------------------------ visuals: ONE merged fused mesh (fill + ink in one draw call) */
  var PI = Math.PI, TAU = PI * 2, VN = G.VNKit, DK = G.DetailKit, Mo = G.Models, K0 = VN.C;
  var mesh = null, wheel = 0, wDrawn = 1e9, wIdx = null, wBase = null, wCz = null, wPos = null, wNor = null, wSmo = null, WY = 0.31;
  var rRy = 0, rLean = 0, remoteSeen = false, tPose = 0;

  function buildGeo() {
    var kb = VN.make(), kw = VN.make(), mer = new DK.Merger(), body, wh, g, i, a, FR = 0x4fb3c8;
    // frame, saddle, handlebar, rear rack and the small front basket (same recipe as the scenery bikes, wheels split out so they can spin)
    var A = C.AN, sf = A.saddle.f, sy = A.saddle.y, hf = A.head.f, hyy = A.head.y;   // frame, saddle, handlebar, rack, basket: all placed from the rider anchors (C.AN)
    kb.poleXY(-0.42, WY, sf, sy - 0.05, 0, 0.018, FR); kb.poleXY(sf, sy - 0.05, hf, hyy, 0, 0.018, FR); kb.poleXY(hf, hyy, 0.42, WY, 0, 0.018, FR);
    kb.poleXY(sf, sy - 0.05, A.crank.f, A.crank.y, 0, 0.018, FR); kb.poleXY(A.crank.f, A.crank.y, -0.42, WY, 0, 0.014, FR); kb.poleXY(hf, hyy, hf, A.grip.y - 0.02, 0, 0.014, FR);
    kb.bx(0.17, 0.045, 0.08, K0.dark, sf, sy - 0.02, 0); kb.bx(0.04, 0.03, A.grip.x * 2 + 0.04, K0.iron, A.grip.f, A.grip.y, 0); kb.bx(0.24, 0.025, 0.14, K0.iron, -0.45, 0.58, 0);
    kb.bx(0.1, 0.02, A.crank.x * 2 + 0.06, K0.dark, A.crank.f, A.crank.y, 0);   // pedal axle + pedals zone
    kb.basket(A.basket.f, 0, A.basket.r, A.basket.h, [0xe8715d, 0xffd166, 0x7fcf6a], A.basket.y0);
    [-0.42, 0.42].forEach(function (x) {
      kw.tor(0.3, K0.iron, x, WY, 0, 0, 0); kw.cy(0.03, 0.05, K0.iron, x, WY, 0, PI / 2);
      for (i = 0; i < 4; i++) kw.bx(0.56, 0.014, 0.02, K0.cream || K0.iron, x, WY, 0, 0, 0, i * PI / 4);
    });
    body = kb.merge(); wh = kw.merge();
    mer.add(body, 0, 0, 0, -PI / 2, 1);   // forward = +z (the hero's facing at yaw 0); the wheel axis becomes x
    a = mer.p.length / 3;
    mer.add(wh, 0, 0, 0, -PI / 2, 1);
    body.dispose(); wh.dispose();
    g = mer.geometry();
    return { geo: g, w0: a, n: g.attributes.position.count };
  }
  function buildMesh() {
    var b = buildGeo(), n = b.n, w0 = b.w0, nw = n - w0, i, j, c, vi, base;
    mesh = DK.mesh(b.geo, Mo.material('prop'), 'bicycle', true, true);   // fused: fill + ink hull share one geometry (attributes doubled)
    mesh.name = 'bicycle'; mesh.matrixAutoUpdate = true; mesh.visible = false;
    var F = mesh.geometry.attributes;
    wPos = F.position; wNor = F.normal; wSmo = F.smoothNormal;
    wIdx = new Int32Array(nw * 2); wBase = new Float32Array(nw * 2 * 9); wCz = new Float32Array(nw * 2);
    for (c = 0; c < 2; c++) for (j = 0; j < nw; j++) {
      vi = c * n + w0 + j; i = c * nw + j; base = i * 9;
      wIdx[i] = vi; wCz[i] = wPos.getZ(vi) > 0 ? 0.42 : -0.42;
      wBase[base] = wPos.getX(vi); wBase[base + 1] = wPos.getY(vi) - WY; wBase[base + 2] = wPos.getZ(vi) - wCz[i];
      wBase[base + 3] = wNor.getX(vi); wBase[base + 4] = wNor.getY(vi); wBase[base + 5] = wNor.getZ(vi);
      wBase[base + 6] = wSmo.getX(vi); wBase[base + 7] = wSmo.getY(vi); wBase[base + 8] = wSmo.getZ(vi);
    }
    G.Render.scene.add(mesh);
  }
  function spin(ang) {   // rotate both wheels (and their normals) about the x axis; no allocations
    if (Math.abs(ang - wDrawn) < 0.02) return;
    wDrawn = ang;
    var cs = Math.cos(ang), sn = Math.sin(ang), i, b, vi, dy, dz, pa = wPos.array, na = wNor.array, sa = wSmo.array, ny, nz;
    for (i = 0; i < wIdx.length; i++) {
      b = i * 9; vi = wIdx[i] * 3; dy = wBase[b + 1]; dz = wBase[b + 2];
      pa[vi] = wBase[b]; pa[vi + 1] = WY + dy * cs - dz * sn; pa[vi + 2] = wCz[i] + dy * sn + dz * cs;
      ny = wBase[b + 4]; nz = wBase[b + 5]; na[vi] = wBase[b + 3]; na[vi + 1] = ny * cs - nz * sn; na[vi + 2] = ny * sn + nz * cs;
      ny = wBase[b + 7]; nz = wBase[b + 8]; sa[vi] = wBase[b + 6]; sa[vi + 1] = ny * cs - nz * sn; sa[vi + 2] = ny * sn + nz * cs;
    }
    wPos.needsUpdate = true; wNor.needsUpdate = true; wSmo.needsUpdate = true;
  }
  function place(x, z, yaw, lean, vn) {
    mesh.position.set(x, 0.01 * vn * Math.abs(Math.sin(wheel * 2)), z);
    mesh.rotation.set(0, yaw, lean);
    spin(wheel);
    mesh.visible = Scenes.current === 'outdoor';
  }
  /* ride pose (seated, hands on the handlebar, legs swing a little with the wheel); shared by the hero and remote riders */
  function ridePose(pose, ang, vn, t) {   // anchors -> pose (C.solve); crank follows the wheel
    G.Models.Anim.idle(pose, t);
    C.solve(pose, ang * 0.9);
    pose.bob += 0.004 * vn * Math.abs(Math.sin(ang * 2));
  }
  Bike.pose = function (hero, dt, s) {   // local hero (Player frame, instead of hero.update)
    tPose += dt; var vn = Math.min(1, s.v / C.TOP);
    ridePose(hero.anim.pose, wheel, vn, tPose);
    P.root.rotation.z = C.lean(s);
    G.Models.Anim.apply(hero, hero.anim.pose);
  };
  Bike.remoteFrame = function (id, a, dt) {   // Avatars: returns 1 when this avatar is the rider (bike follows the interpolated avatar)
    if (!mesh || S.r !== id) return 0;
    var vn = Math.min(1, a.sp / C.TOP), d = dt > 0 ? C.wrapPi(a.ry - rRy) / dt : 0;
    rRy = a.ry; rLean += (-Math.max(-0.16, Math.min(0.16, d * 0.05 * vn)) - rLean) * (1 - Math.exp(-8 * dt));
    wheel = (wheel + a.sp * dt / C.RADIUS) % TAU;
    place(a.x, a.z, a.ry, rLean, vn); remoteSeen = true;
    return 1;
  };
  Bike.remotePose = function (a, dt) {
    tPose += dt; ridePose(a.ch.anim.pose, wheel, Math.min(1, a.sp / C.TOP), tPose);
    a.root.rotation.z = rLean;
    G.Models.Anim.apply(a.ch, a.ch.anim.pose);
  };

  /* ------------------------------------------------------------ placement: walkable grass near the house door, clear of every interactable */
  function clear3(tx, tz) { var i, j; for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) if (!W.isWalkableTile(tx + i, tz + j)) return false; return true; }
  function pickSpot() {
    var door = W.listInteractables('door')[0], list = W.listInteractables(), bx = door ? door.stand.tx : 9, bz = door ? door.stand.tz : 13, r, i, j, k, a, tx, tz, ok, any = null;
    for (r = 3; r <= 9; r++) for (j = -r; j <= r; j++) for (i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      tx = bx + i; tz = bz + j;
      if (!clear3(tx, tz)) continue;
      ok = true;
      for (k = 0; k < list.length && ok; k++) {
        a = list[k];
        if (Math.abs(a.tile.tx - tx) <= 2 && Math.abs(a.tile.tz - tz) <= 2) ok = false;
        else if (a.stand && Math.abs(a.stand.tx - tx) <= 2 && Math.abs(a.stand.tz - tz) <= 2) ok = false;
      }
      if (!ok) continue;
      if (W.tileType(tx + 0.5, tz + 0.5) === 'grass') return { tx: tx, tz: tz };
      if (!any) any = { tx: tx, tz: tz };
    }
    return any || { tx: bx + 3, tz: bz };
  }
  function park() { var t = pickSpot(); S.r = ''; S.x = t.tx + 0.5; S.z = t.tz + 0.5; S.ry = PI / 2; }
  Bike.build = function () {
    if (mesh) return;
    buildMesh(); park();
    place(S.x, S.z, S.ry, 0, 0);
  };
  E.on('save:reset', function () { if (mesh && !Net.live) park(); });
  G.Loop.onFrame(function (dt) {
    if (!mesh) return;
    var vn, rp;
    if (riding) {   // local rider: the bike is under the hero
      vn = Math.min(1, st.v / C.TOP); wheel = (wheel + P.speed * dt / C.RADIUS) % TAU;
      S.x = P.pos.x; S.z = P.pos.z; S.ry = st.h;
      place(P.root.position.x, P.root.position.z, P.root.rotation.y, P.root.rotation.z, vn);
    } else if (S.r) {   // someone else rides: Avatars.remoteFrame placed us this frame; fall back to the last known spot
      rp = Net.mode === 'host' ? Net.remote[S.r] : null;
      if (rp) { S.x = rp[0]; S.z = rp[1]; S.ry = rp[2]; }
      if (!remoteSeen) place(S.x, S.z, S.ry, 0, 0);
      remoteSeen = false;
    } else {   // parked
      mesh.position.set(S.x, 0, S.z); mesh.rotation.set(0, S.ry, 0); mesh.visible = Scenes.current === 'outdoor';
    }
  }, 101);
  /* ------------------------------------------------------------ multiplayer (host-authoritative; relay protocol untouched)
   * guest -> host {t:'bk.q', a:1|0} (mount / dismount request, no coordinates: the host uses the rider's own position stream)
   * host -> all   {t:'bk', r, x, z, y}  rider id ('' = free) + parked position; sent on every change and to a late joiner.
   * While ridden the bike follows the rider's interpolated avatar (Avatars.remoteFrame), so no extra position traffic. */
  Bike.sync = function () { if (Net.mode === 'host') Net.broadcast(C.msg(S)); };
  Net.on('bk.q', function (m, from) {   // host: validate, then decide
    if (Net.mode !== 'host' || !from || !m) return;
    var rp = Net.remote[from], ok = false;
    if (m.a === 1) {
      if (rp && rp[3] === 'outdoor' && Math.sqrt((rp[0] - S.x) * (rp[0] - S.x) + (rp[1] - S.z) * (rp[1] - S.z)) < C.REACH_HOST) ok = C.mount(S, from);
      if (ok) { Net.broadcast(C.msg(S)); return; }
    } else if (m.a === 0 && S.r === from) {
      if (rp) C.dismount(S, from, rp[0], rp[1], rp[2]); else C.dismount(S, from, S.x, S.z, S.ry);
      Net.broadcast(C.msg(S)); return;
    }
    Net.sendTo(from, C.msg(S));   // refused: the requester learns the real state
  });
  Net.on('bk', function (m) {   // guest: authoritative state from the host
    if (Net.mode !== 'guest') return;
    var c = C.valid(m);
    if (!c) return;
    if (c.r === me() && !pending && !riding) c.r = '';   // stale grant after we already got off
    S.r = c.r; S.x = c.x; S.z = c.z; S.ry = c.ry;
    if (pending) {
      if (c.r === me()) beginRide();
      else if (c.r) { pending = 0; toast('Xe đang có người đi rồi nè!'); }
    } else if (riding && c.r !== me()) endRide();   // the host took the bike away
  });
  Net.on('net:join', function (m) { if (Net.mode === 'host' && m && m.id) Net.sendTo(m.id, C.msg(S)); });   // late joiner gets the current state
  Net.on('net:leave', function (m) {   // host: a rider who disconnects frees the bike where it stands (S.x/z is tracked every frame)
    if (Net.mode === 'host' && m && S.r === m.id && C.leave(S, m.id, S.x, S.z, S.ry)) Net.broadcast(C.msg(S));
  });
  Net.on('net:closed', function () { if (riding) force(); if (S.r && S.r !== me()) S.r = ''; pending = 0; });
  Net.on('net:ready', function () { if (riding) force(); pending = 0; if (S.r && S.r !== me()) S.r = ''; });   // joined / hosted a room: start from a clean state
  G.Loop.onFrame(function (dt) { if (pending) { pendingT += dt; if (pendingT > 2.5) { pending = 0; pendingT = 0; } } }, 102);

  G.Bike = Bike;
})();
