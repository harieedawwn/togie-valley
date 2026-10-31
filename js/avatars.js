/* Togie Valley - avatars.js (Stage 17). Remote players as Models.character + name tag, registered in Game.Players.
 * Reads Net.remote ({id:[x,z,ry,scene,speed,ts]}), Net.ents (NetSmooth buffers, drawn 120 ms in the past) and Net.names each frame; only active while Net.live. Game.Avatars {count()}. Load after net.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Net || !G.Models || !G.Render || !G.Loop || !G.Players || !G.Look || !G.NetSmooth) { console.error('[avatars] missing deps'); return; }
  var Net = G.Net, NS = G.NetSmooth, av = {};

  function tagTex(name) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var x = c.getContext('2d'), w;
    x.font = '700 32px "Baloo 2", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    w = Math.min(244, x.measureText(name).width + 28);
    x.fillStyle = 'rgba(255,248,230,0.92)'; x.strokeStyle = '#5b3a29'; x.lineWidth = 4;
    x.beginPath(); if (x.roundRect) x.roundRect(128 - w / 2, 8, w, 48, 20); else x.rect(128 - w / 2, 8, w, 48);
    x.fill(); x.stroke();
    x.fillStyle = '#5b3a29'; x.fillText(name, 128, 33, 224);
    var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  function setName(a, name) {
    if (a.name === name) return;
    a.name = name;
    if (a.tag.material.map) a.tag.material.map.dispose();
    a.tag.material.map = tagTex(name); a.tag.material.needsUpdate = true;
  }
  function make(id, st) {
    var enc = Net.looks[id] || '';
    var ch = G.Models.character({ look: G.Look.resolve(G.Look.decode(enc)) });   // appearance travels with the player (missing look = default look)
    var mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
    var tag = new THREE.Sprite(mat); tag.scale.set(1.2, 0.3, 1); tag.position.y = 1.65; tag.renderOrder = 999;
    ch.root.add(tag);
    G.Render.scene.add(ch.root);
    var a = { id: id, ch: ch, tag: tag, name: null, enc: enc, x: st[0], z: st[1], ry: st[2], sp: 0, root: ch.root };
    ch.root.position.set(a.x, 0, a.z); ch.root.rotation.y = a.ry;
    setName(a, Net.names[id] || id);
    G.Players.add(id, a);
    return a;
  }
  function drop(id) {
    var a = av[id]; if (!a) return;
    if (a.tag.material.map) a.tag.material.map.dispose();
    a.tag.material.dispose(); if (G.RemoteAct) G.RemoteAct.drop(a); a.ch.dispose(); G.Players.remove(id); delete av[id];
  }
  /* Sleep pose (Game.SleepVote.state {id:[spot,k]}): lie on the back in the spot, hips at spot + lie. Pose is cached per spot (no per-frame allocation). */
  var HIPS = 0.26;
  function lieOf(a, id, dt) {
    var e = G.SleepVote && G.SleepVote.state[id], s, p;
    if (!e || e[1] < 1 || !e[0]) { a.lieId = null; return null; }
    if (a.lieId !== e[0]) { a.lieId = e[0]; a.lie = null; a.lt = 0; }
    if (!a.lie) {
      a.lt -= dt;
      if (a.lt > 0) return null;
      a.lt = 1; s = G.Beds.get(e[0]);
      if (s) a.lie = { x: s.x + s.lie.x + Math.sin(s.facing) * HIPS, y: s.lie.y + 0.11, z: s.z + s.lie.z + Math.cos(s.facing) * HIPS, yaw: s.facing };
    }
    return a.lie;
  }

  G.Loop.onFrame(function (dt) {
    var id, st, a, e, lp, ad, far, d2, ST = G.SimTier, rb;
    if (!Net.live || Net.mode === 'solo') { for (id in av) drop(id); return; }
    for (id in av) if (!Net.remote[id]) drop(id);
    dt = Math.min(dt, 0.1);
    for (id in Net.remote) {
      st = Net.remote[id];
      a = av[id] || (av[id] = make(id, st));
      setName(a, Net.names[id] || id);
      if ((Net.looks[id] || '') !== a.enc) { a.enc = Net.looks[id] || ''; a.ch.setLook(G.Look.resolve(G.Look.decode(a.enc))); }
      e = Net.ents[id];
      if (e && e.b.length) { NS.update(e, Net.hostNow() - NS.DELAY, dt); a.x = e.x; a.z = e.z; a.ry = e.ry; a.sp = e.sp; a.sc = e.sc; }   // ~120 ms in the past; speed drives the walk cycle
      else { a.x = st[0]; a.z = st[1]; a.ry = st[2]; a.sc = st[3]; a.sp = 0; }
      lp = lieOf(a, id, dt);
      if (lp) {
        a.root.rotation.set(-Math.PI / 2, lp.yaw, 0, 'YXZ'); a.root.position.set(lp.x, lp.y, lp.z);
        if (!a.lying) { a.lying = true; a.tag.position.set(0, 0.55, 1.1); }
        a.sp = 0;
      } else {
        if (a.lying) { a.lying = false; a.root.rotation.order = 'XYZ'; a.tag.position.set(0, 1.65, 0); }
        a.root.position.set(a.x, 0, a.z); a.root.rotation.set(0, a.ry, 0);
      }
      a.root.visible = a.sc === G.Scenes.current;
      if (G.RemoteAct) G.RemoteAct.frame(a, id, dt);   // stage 37: fishing / tool clips / sitting timers + bobber (runs even when culled)
      rb = G.Bike && G.Bike.remoteFrame ? G.Bike.remoteFrame(id, a, dt) : 0;   // stage 42: this avatar rides the bicycle (the bike follows it)
      if (!a.root.visible) continue;
      if (rb) { G.Bike.remotePose(a, dt); continue; }   // seated ride pose on the bike
      ad = dt; far = false;
      if (ST && !a.lying) {   // stage 36: off screen = asleep, far (> 12 tiles) = 10-15 Hz without secondary motion; position above is still interpolated every frame
        if (a.acc === undefined) a.acc = ST.stagger() * 0.066;
        if (!ST.seen(a.x, 0.9, a.z, 1.8)) { a.acc = 0; continue; }
        d2 = ST.d2(a.x, a.z);
        if (d2 > 144) { far = true; a.acc += dt; if (a.acc < (d2 > 576 ? 0.1 : 0.066)) continue; ad = a.acc > 0.1 ? 0.1 : a.acc; a.acc = 0; }
      }
      a.ch.update(ad, a.sp);
      if (G.RemoteAct && !a.lying) G.RemoteAct.pose(a, id);   // sit pose, fishing arms, tool clip, tool in hand (before CharAnim adds locomotion and applies)
      if (G.SleepLook) G.SleepLook.remote(a.ch, a.lying, ad);   // hat on the chest + closed eyes while lying (derived from the synced sleep state)
      if (G.CharAnim && G.CharAnim.remote) G.CharAnim.remote(a.ch, ad, a.sp, a.lying, far);
      if (G.RemoteAct && !a.lying) G.RemoteAct.post(a);   // same polish as the hero (lean, bounce, blink, spring parts), driven by the interpolated speed
    }
  }, 12);

  G.Avatars = { count: function () { var n = 0, k; for (k in av) n++; return n; } };
})();
