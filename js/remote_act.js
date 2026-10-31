/* Togie Valley - remote_act.js (Round 3 stage 37): what other players DO is visible on every screen.
 * Wire (relay protocol untouched, small JSON): sender -> host {t:'ra', k, ...}; host validates, rebroadcasts {t:'ra', id, k, ...} to all; late joiner gets {t:'rs', s:{id:{f:[st,x,z,rod], y}}}.
 *   k:'f' fishing  {s:'c' cast (x,z,d rod idx) | 'b' bite | 'r' reel | 'e' end (r: 0 cancel/lost, 1 caught, 2 junk)}
 *   k:'a' tool clip {n: index in CLIPS, x,z target tile}      k:'s' seat height {y}
 * Held tool + sitting ride in the movement snapshot: Net.toolByte() = tool idx (bits 0-4, 1-based in TOOLS) | tier << 5 | sit << 7 -> Net.remote[id][6].
 * Receivers run the same visuals from the tiny events: rod on the avatar's hand, cast arc, sagging line, bobber (nibble / bite / reel), splash, hook-set lift,
 * the same AnimData clips (sampled onto the avatar's pose) with the tool mesh, sit pose. Hooks live in avatars.js: frame / pose / post / drop.
 * No per-frame allocations. Load after avatars.js (and fishing_fx.js, anim_tools.js). */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Net || !G.Avatars || !G.Fishing || !G.Fishing.view || !G.AnimData || !G.Models || !G.Models.Anim || !G.Events || !G.Loop || !G.Player || !G.Render || !G.Inventory) { console.error('[remote_act] missing dependencies'); return; }
  var Net = G.Net, E = G.Events, P = G.Player, F = G.Fishing, V = F.view, D = G.AnimData, AT = G.AnimTools, A = G.Models.Anim, Inv = G.Inventory, CA = G.CharAnim, R = G.Render;
  var RA = G.RemoteAct = {};
  var TOOLS = ['hoe', 'watering_can', 'bamboo_pole', 'fiber_rod', 'carbon_rod', 'master_rod'];
  var ROD_COL = { bamboo_pole: 0xc9b45a, fiber_rod: 0x5fb3a8, carbon_rod: 0x4a525c, master_rod: 0xe0b040 };
  var CLIPS = ['till', 'water', 'plant', 'fertilize', 'harvest', 'eat', 'pickup', 'chest', 'buy', 'sell', 'cook', 'drink', 'shake', 'wave', 'levelup', 'interact'];
  var KEYS = D.KEYS, NK = KEYS.length, I = D.index, CAST_SEC = 0.55, LIFT = 0.7, ARM = 1.05;
  var S = {}, HS = {}, LIM = {}, out = D.newOut(), cr = { bob: 0, hipZ: 0, leg: 0 }, ft = { tx: 0, tz: 0 }, _tip = new THREE.Vector3();
  var SITV = null, SITH = null, GEO = null, MAT = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ss(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function q(v) { return Math.round(v * 8) / 8; }
  function toolIdx(id) { return TOOLS.indexOf(id) + 1; }

  /* ------------------------------------------------------------ sender (this player's own actions) */
  Net.toolByte = function () {
    var s = Inv.selected(), i = s ? toolIdx(s.id) : 0;
    return (i & 31) | (i ? (((s.tier | 0) & 3) << 5) : 0) | (P.sitting ? 128 : 0);
  };
  function keep(id, m) {   // host: the state a late joiner needs
    var h = HS[id] || (HS[id] = {});
    if (m.k === 'f') {
      if (m.s === 'c') h.f = ['w', m.x, m.z, m.d];
      else if (m.s === 'b' && h.f) h.f[0] = 'b';
      else if (m.s === 'r' && h.f) h.f[0] = 'r';
      else if (m.s === 'e') h.f = null;
    } else if (m.k === 's') h.y = m.y;
  }
  function send(m) {
    if (!Net.live || Net.mode === 'solo') return;
    m.t = 'ra';
    if (Net.mode === 'guest') Net.send(m);
    else { m.id = Net.playerId; keep(m.id, m); Net.broadcast(m); }
  }
  var lastFs = 'off', res = 0, lastAct = 0;
  E.on('fish:caught', function () { res = 1; });
  E.on('fish:junk', function () { res = 2; });
  var ACTIVE = { cast: 1, wait: 1, bite: 1, reel: 1 };
  G.Loop.onFrame(function () {
    var st = F.state, pv = lastFs, tp;
    if (st === pv) return;
    lastFs = st;
    if (st === 'cast') {
      tp = F.targetPos && F.targetPos();
      if (tp) send({ k: 'f', s: 'c', x: q(tp.x), z: q(tp.z), d: toolIdx((Inv.selected() || {}).id) || toolIdx(V.rodId) || 3 });
    } else if (st === 'bite') send({ k: 'f', s: 'b' });
    else if (st === 'reel') send({ k: 'f', s: 'r' });
    else if (ACTIVE[pv] && !ACTIVE[st]) { send({ k: 'f', s: 'e', r: res }); res = 0; }
  }, 103);
  E.on('player:action', function (e) {
    var n = e ? CLIPS.indexOf(e.name) : -1, now = Date.now(), r;
    if (n < 0 || now - lastAct < 120) return;
    lastAct = now; r = P.frontTile(ft) || ft;
    send({ k: 'a', n: n, x: r.tx | 0, z: r.tz | 0 });
  });
  E.on('player:sat', function () { send({ k: 's', y: Math.round((P.sitY || 0) * 100) / 100 }); });

  /* ------------------------------------------------------------ receive */
  function num(v, a, b) { v = +v; return v >= a && v <= b ? v : null; }
  function clean(m) {   // -> sanitized copy or null
    var o, x, z, v;
    if (!m || typeof m !== 'object') return null;
    if (m.k === 'f') {
      if (m.s === 'c') {
        x = num(m.x, 0, 255); z = num(m.z, 0, 255); v = num(m.d, 0, 8);
        if (x === null || z === null) return null;
        return { k: 'f', s: 'c', x: x, z: z, d: v === null ? 3 : v | 0 };
      }
      if (m.s === 'b' || m.s === 'r') return { k: 'f', s: m.s };
      if (m.s === 'e') return { k: 'f', s: 'e', r: clamp(m.r | 0, 0, 2) };
      return null;
    }
    if (m.k === 'a') {
      v = num(m.n, 0, CLIPS.length - 1); x = num(m.x, 0, 255); z = num(m.z, 0, 255);
      return v === null || x === null || z === null ? null : { k: 'a', n: v | 0, x: x | 0, z: z | 0 };
    }
    if (m.k === 's') { v = num(m.y, 0, 2); return v === null ? null : { k: 's', y: v }; }
    return null;
  }
  function st(id) { return S[id] || (S[id] = { f: null, clip: null, sy: 0 }); }
  function newFish(s, st0, x, z, rod) { s.f = { st: st0, t: 0, T: 0, x: x, z: z, rod: rod | 0 || 3, res: 0, bang: 0, rip: 0, fx: 0, dead: 0 }; return s.f; }
  function apply(id, m) {
    var s = st(id), f = s.f, nm;
    if (m.k === 'f') {
      if (m.s === 'c') { newFish(s, 'c', m.x, m.z, m.d); if (D.has('cast')) s.clip = { d: D.get('cast'), t: 0 }; }
      else if (f && f.st !== 'x') {
        if (m.s === 'b') { f.st = 'b'; f.t = 0; f.bang = 1; f.rip = 0; }
        else if (m.s === 'r') { f.st = 'r'; f.t = 0; }
        else if (m.s === 'e') { f.st = 'x'; f.t = 0; f.res = m.r; f.fx = 0; }
      }
    } else if (m.k === 'a') {
      nm = CLIPS[m.n];
      if (nm && D.has(nm)) s.clip = { d: D.get(nm), t: 0 };
    } else if (m.k === 's') s.sy = m.y;
  }
  Net.on('ra', function (m, from) {
    var o, l, now;
    if (Net.mode === 'host') {
      if (!from || !Net.names[from]) return;
      now = Date.now(); l = LIM[from] || (LIM[from] = { t: now, n: 0 });
      if (now - l.t > 1000) { l.t = now; l.n = 0; }
      if (++l.n > 14) return;   // rate limit: 14 events / s / player
      o = clean(m); if (!o) return;
      keep(from, o); apply(from, o);
      o.t = 'ra'; o.id = from; Net.broadcast(o);
    } else if (Net.mode === 'guest') {
      if (typeof m.id !== 'string' || m.id.length > 8 || m.id === Net.playerId) return;
      o = clean(m); if (o) apply(m.id, o);
    }
  });
  Net.on('net:join', function (m) {   // host: the newcomer gets everybody's current fishing + seat state
    var o = {}, k, h;
    if (Net.mode !== 'host') return;
    for (k in HS) { h = HS[k]; if (h.f || h.y) o[k] = { f: h.f || null, y: h.y || 0 }; }
    Net.sendTo(m.id, { t: 'rs', s: o });
  });
  Net.on('rs', function (m) {
    var k, h, s, f;
    if (Net.mode !== 'guest' || !m || !m.s || typeof m.s !== 'object') return;
    for (k in m.s) {
      if (k === Net.playerId || k.length > 8) continue;
      h = m.s[k]; if (!h || typeof h !== 'object') continue;
      s = st(k);
      s.sy = clamp(+h.y || 0, 0, 2);
      f = h.f;
      if (f instanceof Array && num(f[1], 0, 255) !== null && num(f[2], 0, 255) !== null) newFish(s, f[0] === 'b' ? 'b' : f[0] === 'r' ? 'r' : 'w', +f[1], +f[2], f[3]);
    }
  });
  Net.on('net:leave', function (m) { delete S[m.id]; delete HS[m.id]; delete LIM[m.id]; });
  function resetAll() { S = {}; HS = {}; LIM = {}; }
  Net.on('net:ready', resetAll);
  Net.on('net:closed', resetAll);

  /* ------------------------------------------------------------ visuals */
  function shared() {
    if (GEO) return;
    GEO = { rod: new THREE.CylinderGeometry(0.012, 0.024, 1.2, 6), a: new THREE.SphereGeometry(0.1, 10, 8), b: new THREE.SphereGeometry(0.075, 10, 8), fish: new THREE.SphereGeometry(0.1, 8, 6) };
    GEO.rod.rotateX(Math.PI / 2); GEO.rod.translate(0, 0, 0.6);
    MAT = { red: new THREE.MeshBasicMaterial({ color: 0xf0675a }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }), fish: new THREE.MeshBasicMaterial({ color: 0xf2a65a }), line: new THREE.LineBasicMaterial({ color: 0x5b3a29 }) };
  }
  function newRm() { return { ti: 0, tier: 0, sit: 0, sw: 0, syc: 0, fw: 0, rodRoot: null, rodMat: null, rodId: '', tip: null, bob: null, fish: null, line: null, lp: null, tm: {}, shown: null, hz: 0 }; }
  function buildRod(a, rm) {
    var m, root = new THREE.Group();
    shared();
    rm.rodMat = new THREE.MeshBasicMaterial({ color: 0xc9b45a });
    m = new THREE.Mesh(GEO.rod, rm.rodMat);
    rm.tip = new THREE.Object3D(); rm.tip.position.z = 1.2; m.add(rm.tip);
    root.add(m); root.visible = false; root.rotation.x = 0.3;
    a.ch.attach.handR.add(root); rm.rodRoot = root;
  }
  function buildBob(rm) {
    var g = new THREE.Group(), b;
    shared();
    g.add(new THREE.Mesh(GEO.a, MAT.red));
    b = new THREE.Mesh(GEO.b, MAT.white); b.position.y = -0.09; g.add(b);
    rm.fish = new THREE.Mesh(GEO.fish, MAT.fish); rm.fish.scale.set(1.3, 0.7, 0.7); rm.fish.position.y = -0.2; rm.fish.visible = false; g.add(rm.fish);
    g.visible = false; R.scene.add(g); rm.bob = g;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(15), 3));
    rm.line = new THREE.Line(geo, MAT.line); rm.line.frustumCulled = false; rm.line.visible = false;
    rm.lp = geo.attributes.position; R.scene.add(rm.line);
  }
  function tickFish(rm, f, dt, vis, a) {
    var FX = G.FishingFx;
    f.t += dt; f.T += dt;
    if (f.st === 'c') { if (f.t >= CAST_SEC) { f.st = 'w'; f.t = 0; if (FX && vis) FX.splash(f.x, f.z, 6, 0.5); } }
    else if (f.st === 'b') {
      if (f.bang) { f.bang = 0; if (AT && AT.emote && vis) AT.emote('bang', f.x, 0.9, f.z, 0.9, 1, 1); }
      f.rip -= dt; if (f.rip <= 0) { f.rip = 0.6; if (FX && vis) FX.splash(f.x, f.z, 2, 0.3); }
    } else if (f.st === 'x') {
      if (!f.fx) { f.fx = 1; if (FX && vis && f.res > 0) FX.splash(f.x, f.z, 10, 1); }
      if (f.res > 0) { if (f.t >= LIFT) { if (f.res === 1 && FX && vis) FX.confetti(a.x, 1.5, a.z, 10); f.dead = 1; } }
      else if (f.t >= 0.25) f.dead = 1;
    }
  }
  function fishVis(a, rm, f, vis) {
    var want = !!f || rm.ti >= 3, id, st0, T, bx, by, bz, k, u, i, s, sag;
    if (want && !rm.rodRoot) buildRod(a, rm);
    if (rm.rodRoot) {
      rm.rodRoot.visible = want && vis;
      id = f ? TOOLS[f.rod - 1] : TOOLS[rm.ti - 1];
      if (id !== rm.rodId) { rm.rodId = id; rm.rodMat.color.setHex(ROD_COL[id] || ROD_COL.bamboo_pole); }
      rm.rodRoot.rotation.x = 0.3 * rm.fw - 0.7 * (1 - rm.fw);
    }
    if (!f || !vis) { if (rm.bob) { rm.bob.visible = false; rm.line.visible = false; } return; }
    if (!rm.bob) buildBob(rm);
    a.root.updateMatrixWorld(true); rm.tip.getWorldPosition(_tip);
    st0 = f.st; T = f.T; bx = f.x; bz = f.z; by = 0.02 + Math.sin(T * 3) * 0.015;
    rm.fish.visible = false;
    if (st0 === 'c') {
      k = clamp(f.t / CAST_SEC, 0, 1);
      bx = _tip.x + (f.x - _tip.x) * k; bz = _tip.z + (f.z - _tip.z) * k; by = _tip.y + (0.02 - _tip.y) * k + Math.sin(Math.PI * k) * 1.4;
    } else if (st0 === 'w') { if (Math.sin(T * 1.3) > 0.8) by -= 0.03 * Math.abs(Math.sin(T * 9)); }
    else if (st0 === 'b') by -= 0.08 * Math.abs(Math.sin(T * 20));
    else if (st0 === 'r') { by -= 0.04 * Math.abs(Math.sin(T * 14)); bx += Math.sin(T * 9) * 0.08; }
    else if (st0 === 'x' && f.res > 0) {
      u = ss(clamp(f.t / LIFT, 0, 1));
      bx = f.x + (a.x - f.x) * u; bz = f.z + (a.z - f.z) * u; by = 0.02 + 1.48 * u + Math.sin(Math.PI * u) * 0.5;
      rm.fish.visible = true;
    }
    rm.bob.position.set(bx, by, bz); rm.bob.visible = true; rm.line.visible = true;
    sag = st0 === 'w' ? 0.22 : st0 === 'c' ? 0.1 : 0.05;
    for (i = 0; i < 5; i++) { s = i / 4; rm.lp.setXYZ(i, _tip.x + (bx - _tip.x) * s, _tip.y + (by - _tip.y) * s - sag * 4 * s * (1 - s), _tip.z + (bz - _tip.z) * s); }
    rm.lp.needsUpdate = true;
  }

  /* avatars.js hook 1 (every frame, before the visibility cull): state timers, bobber, line, rod */
  RA.frame = function (a, id, dt) {
    var rm = a.rm || (a.rm = newRm()), r = Net.remote[id], b = r ? (r[6] | 0) : 0, s = S[id], f, vis = a.root.visible;
    rm.ti = b & 31; rm.tier = (b >> 5) & 3; rm.sit = (b & 128) ? 1 : 0;
    rm.sw += (rm.sit - rm.sw) * (1 - Math.exp(-10 * dt));
    rm.syc += ((rm.sit && s ? s.sy : 0) - rm.syc) * (1 - Math.exp(-14 * dt));
    f = s ? s.f : null;
    if (s && s.clip) { s.clip.t += dt; if (s.clip.t > s.clip.d.dur + 0.05) s.clip = null; }
    if (f) { tickFish(rm, f, dt, vis, a); if (f.dead) { s.f = null; f = null; } }
    rm.fw += ((f ? 1 : 0) - rm.fw) * (1 - Math.exp(-8 * dt));
    fishVis(a, rm, f, vis);
  };

  function sitPose() {
    var d, i;
    if (SITV) return;
    d = D.get('sit'); D.sample(d, d.dur, out); SITV = new Float32Array(NK); SITH = new Uint8Array(NK);
    for (i = 0; i < NK; i++) { SITV[i] = out.v[i]; SITH[i] = out.has[i]; }
  }
  function toolMesh(a, rm, name, tier) {
    var key = name + tier, m = rm.tm[key], src;
    if (m) return m;
    if (!AT || !AT.tool) return null;
    src = name === 'bread' ? AT.tool('food', 0, { id: 'bread', icon: { tpl: 'bread' } }) : AT.tool(name, tier, null);
    if (!src) return null;
    m = rm.tm[key] = src.clone(true); m.visible = false; a.ch.attach.handR.add(m);
    return m;
  }

  /* avatars.js hook 2 (after ch.update, before CharAnim.remote adds locomotion and applies): sit pose, fishing arms, tool clip, tool in hand */
  RA.pose = function (a, id) {
    var rm = a.rm, s = S[id], f, c, p, J, i, kk, w, T, u, armR, armL, armRZ, armLZ, spine, head, d, env, bi, tS = 0, tilt = 0, tm = null, name, any = false;
    if (!rm) return;
    p = a.ch.anim.pose; J = a.ch.joints; f = s ? s.f : null; c = s ? s.clip : null;
    if (rm.sw > 0.01) {
      sitPose(); w = rm.sw;
      for (i = 0; i < NK; i++) if (SITH[i]) { kk = KEYS[i]; p[kk] += (SITV[i] - p[kk]) * w; }
      any = true;
    }
    if (rm.fw > 0.01 && f) {
      w = rm.fw; T = f.T; armR = ARM; armL = 0.72; armRZ = 0.12; armLZ = 0.1; spine = 0.06; head = 0.14;
      if (f.st === 'r') { armR = 1.32 + 0.06 * Math.sin(T * 9); armL = 0.85 + 0.5 * Math.sin(T * 11); armLZ = 0.1 + 0.18 * Math.cos(T * 11); }
      else if (f.st === 'b') armR = ARM + 0.1 * Math.abs(Math.sin(T * 18));
      else if (f.st === 'x' && f.res > 0) {
        u = ss(clamp(f.t / LIFT, 0, 1)); armR = ARM + (2.9 - ARM) * u; armL = 0.72 + (2.9 - 0.72) * u; armRZ = 0.12 + 0.28 * u; armLZ = 0.1 + 0.3 * u; spine = 0.06 - 0.12 * u; head = 0.14 - 0.34 * u;
      }
      p.armRX += (armR - p.armRX) * w; p.armLX += (armL - p.armLX) * w; p.armRZ += (armRZ - p.armRZ) * w; p.armLZ += (armLZ - p.armLZ) * w;
      p.spineRX += (spine - p.spineRX) * w; p.headRX += (head - p.headRX) * w;
      any = true;
    }
    if (c && c.t >= 0) {   // the same clip data the local hero plays, sampled at the clip clock
      d = c.d; D.sample(d, Math.min(c.t, d.dur), out);
      env = ss(c.t / Math.max(d.blendIn || 0.05, 0.01)) * (d.hold ? 1 : 1 - ss((c.t - (d.dur - (d.blendOut || 0.1))) / Math.max(d.blendOut || 0.1, 0.01)));
      for (i = 0; i < NK; i++) if (out.has[i]) { kk = KEYS[i]; p[kk] += (out.v[i] - p[kk]) * env; }
      if (out.has[I.crouch]) { D.crouch(out.v[I.crouch] * env, cr); p.bob += cr.bob; p.legLX += cr.leg; p.legRX += cr.leg; J.hips.position.z = cr.hipZ; rm.hz = 1; }
      if (out.has[I.stag]) { p.legLX += out.v[I.stag] * env; p.legRX -= out.v[I.stag] * env; }
      if (out.has[I.tS]) tS = out.v[I.tS] * env;
      if (out.has[I.tilt]) tilt = out.v[I.tilt] * env;
      any = true;
      if (d.tool && tS > 0.02) {
        name = d.tool; bi = (name === 'hoe' && rm.ti === 1) || (name === 'can' && rm.ti === 2) ? rm.tier : 0;
        tm = toolMesh(a, rm, name, bi);
        if (tm) { tm.scale.setScalar(Math.max(0.01, tS)); tm.rotation.x = d.upright ? p.armRX - p.spineRX + tilt : 0; }
      }
    }
    if (rm.hz && !(c && c.t >= 0 && out.has[I.crouch])) { J.hips.position.z = 0; rm.hz = 0; }
    if (!tm && rm.ti >= 1 && rm.ti <= 2 && !f) {   // the selected hoe / watering can rests in the hand
      tm = toolMesh(a, rm, rm.ti === 1 ? 'hoe' : 'can', rm.tier);
      if (tm) { tm.scale.setScalar(1); tm.rotation.x = 0; }
    }
    if (rm.shown && rm.shown !== tm) rm.shown.visible = false;
    if (tm) tm.visible = true;
    rm.shown = tm;
    a.root.position.y = rm.syc;
    if (any && !(CA && CA.remote && CA.enabled)) A.apply(a.ch, p);   // CharAnim off: nothing else writes the pose after this
  };

  /* avatars.js hook 3 (after CharAnim.remote): seated legs keep the hips flat like the hero */
  RA.post = function (a) {
    var rm = a.rm, J;
    if (!rm || rm.sw < 0.5) return;
    J = a.ch.joints; J.hipL.position.y = 0; J.hipR.position.y = 0;
  };

  /* avatars.js drop(): give back everything before ch.dispose() (it would free the shared geometry) */
  RA.drop = function (a) {
    var rm = a.rm, k;
    if (!rm) return;
    if (rm.rodRoot) { if (rm.rodRoot.parent) rm.rodRoot.parent.remove(rm.rodRoot); if (rm.rodMat) rm.rodMat.dispose(); }
    for (k in rm.tm) if (rm.tm[k].parent) rm.tm[k].parent.remove(rm.tm[k]);
    if (rm.bob) R.scene.remove(rm.bob);
    if (rm.line) { R.scene.remove(rm.line); rm.line.geometry.dispose(); }
    a.rm = null;
  };

  RA.peek = function (id) { var s = S[id]; return s ? { fish: s.f ? s.f.st : null, clip: s.clip ? s.clip.d.name : null, sy: s.sy } : null; };
})();
