/* Togie Valley - char_anim.js (Stage 10.5 Part 2)
 * Game.CharAnim: character polish layered on Models.Anim without touching its API.
 *  - Hero (frame priority 100.5, after Player 100, before FarmFx 101 / FishingFx 102): the deltas are added to hero.anim.pose,
 *    so tool/fishing poses (which copy that pose as their base) keep working.
 *    Double bounce, head counter-bob, lean spring (anticipation / settle), relaxed lagged arm swing, turn lean, breathing,
 *    blinking (hidden eyelid mesh), look-around / stretch after 5 s idle, hat + bun spring lag, grass dust puffs (8 pooled instances).
 *  - NPCs (Town.npcs, priority 11 after Town's own update): additive idle loops (shopkeeper hammer tap, fishmonger rod bob) + breathing + blink.
 * No non-uniform scale on toon meshes: only joint rotation, joint offsets and visibility.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Models || !G.Player || !G.Loop || !G.Render) { console.error('[char_anim] missing deps'); return; }
  var U = G.util, M = G.Models, A = M.Anim, R = G.Render, P = G.Player, KEYS = A.KEYS;
  var HALF = Math.PI / 2, TAU = Math.PI * 2;

  var CA = { puffsAlive: 0, enabled: true };

  /* ------------------------------------------------------------- helpers */
  function Spring(k, c) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  Spring.prototype.step = function (dt, target) {
    var n = dt > 0.012 ? 2 : 1, h = dt / n;
    for (var i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  };
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ss(a, b, x) { return U.smoothstep(a, b, x); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ------------------------------------------------------------ eyelids */
  var lidGeo = {};
  function lidGeometry(skin) {
    var key = 'lid_' + skin, g = lidGeo[key];
    if (!g) {
      var pr = G.HeadModel.lidParts(skin);   // skin lids + closed lash line on the new head (js/head_model.js)
      g = lidGeo[key] = M.mergeParts(pr);
    }
    return g;
  }
  function makeLids(ch) {
    var skin = ch.look ? ch.look.skin : 0xf6cfa8;
    var m = new THREE.Mesh(lidGeometry(skin), M.material('char'));
    m.userData.skin = skin;
    m.visible = false; m.raycast = function () {};
    ch.joints.head.add(m);
    return m;
  }

  /* --------------------------------------------------------------- dust */
  var NP = 8, puffs = [], pi = 0, puffMesh = null, puffMat = null;
  (function () {
    puffMat = new THREE.MeshBasicMaterial({ color: 0xf6e8c8 });
    puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), puffMat, NP);
    puffMesh.frustumCulled = false; puffMesh.count = 0; puffMesh.visible = false; puffMesh.raycast = function () {};
    puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); puffMesh.name = 'dustPuffs';
    R.scene.add(puffMesh);
    if (G.Scenes && G.Scenes.outdoorOnly) G.Scenes.outdoorOnly(puffMesh);
    for (var i = 0; i < NP; i++) puffs.push({ on: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, s: 0.12, l: 0, m: 0.5, c: 0xf6e8c8 });
  })();
  var _pc = new THREE.Color(), DUST = { grass: 0xf6e8c8, path: 0xd9b88a, soil: 0xc9a070, sand: 0xf3e0a8, stone: 0xdadada, snow: 0xffffff };
  function puff(x, z, n, vx, vz, big, tint) {
    var dn = G.Perf && G.Perf.density ? G.Perf.density.particle : 1;   // Quality tier gate
    if (dn < 1 && Math.random() > dn) return;
    for (var i = 0; i < (n || 1); i++) {
      var p = puffs[pi]; pi = (pi + 1) % NP;       // ring: the oldest slot is reused, so at most NP alive
      p.on = 1; p.x = x + rnd(-0.04, 0.04); p.z = z + rnd(-0.04, 0.04); p.y = 0.05;
      p.vx = (vx || 0) + rnd(-0.12, 0.12); p.vz = (vz || 0) + rnd(-0.12, 0.12); p.s = rnd(0.11, 0.15) * (big ? 1.7 : 1); p.c = tint || 0xf6e8c8; p.l = p.m = rnd(0.42, 0.55) * (big ? 1.15 : 1);
    }
  }
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function stepPuffs(dt) {
    var n = 0, i, p, u, k;
    for (i = 0; i < NP; i++) {
      p = puffs[i]; if (!p.on) continue;
      p.l -= dt;
      if (p.l <= 0) { p.on = 0; continue; }
      u = 1 - p.l / p.m;
      p.x += p.vx * dt; p.z += p.vz * dt; p.y += (0.16 - 0.1 * u) * dt; p.vx *= 1 - 3 * dt; p.vz *= 1 - 3 * dt;
      k = p.s * (0.45 + 0.75 * Math.sqrt(u)) * (1 - ss(0.55, 1, u));
      _m.compose(_p.set(p.x, p.y + k * 0.5, p.z), _q, _s.set(k, k * 0.8, k)); puffMesh.setMatrixAt(n, _m); _pc.setHex(p.c); puffMesh.setColorAt(n, _pc); n++;
    }
    CA.puffsAlive = n;
    puffMesh.count = n; puffMesh.visible = n > 0; puffMesh.instanceMatrix.needsUpdate = true; if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
    if (n) {
      var h = R.getTimeOfDay ? R.getTimeOfDay() : 12, d = 0.42 + 0.58 * ss(5, 8, h) * (1 - ss(18, 21, h));
      puffMat.color.setRGB(d, d, d);
    }
  }
  function killPuffs() { for (var i = 0; i < NP; i++) puffs[i].on = 0; }

  /* ---------------------------------------------------- shared controller */
  function ctl(ch, kind) {
    var f = {
      ch: ch, kind: kind, t: Math.random() * 10, lids: makeLids(ch), blinkT: 0, nextBlink: rnd(1.5, 4),
      headY: ch.joints.head.position.y, shY: ch.joints.shoulderL.position.y
    };
    return f;
  }
  function blink(f, dt) {
    f.nextBlink -= dt;
    if (f.nextBlink <= 0 && f.blinkT <= 0) {
      f.blinkT = 0.13; f.nextBlink = Math.random() < 0.18 ? 0.22 : rnd(2.2, 5.2);   // sometimes a double blink
    }
    if (f.blinkT > 0) f.blinkT -= dt;
    if ((f.blinkT > 0 || f.ch.eyesShut) && f.ch.look && f.lids.userData.skin !== f.ch.look.skin) { f.lids.userData.skin = f.ch.look.skin; f.lids.geometry = lidGeometry(f.ch.look.skin); }   // look changed
    f.lids.visible = f.blinkT > 0 || !!f.ch.eyesShut;   // eyesShut: Game.SleepLook (asleep / fainted)
  }
  function breathe(f, w) {
    var b = Math.sin(f.t * 2.1), J = f.ch.joints;
    J.shoulderL.position.y = f.shY + b * 0.007 * w; J.shoulderR.position.y = f.shY + b * 0.007 * w;
    return b;
  }

  /* ------------------------------------------------------------------- hero */
  var H = ctl(P.hero, 'hero');
  P.hero.anim.defer = true;   // Models.Anim.update skips its own apply: heroFrame applies the final pose once (saves one full joint write per frame)
  var D = A.newPose();
  var hatS = { x: new Spring(130, 9), y: new Spring(220, 12), z: new Spring(110, 8) };
  var bunS = { x: new Spring(75, 4.5), z: new Spring(60, 4), y: new Spring(60, 4) };
  var leanS = new Spring(190, 13), setS = new Spring(260, 14);
  var hs = {
    lean: leanS, set: setS,
    ls: 0, acc: 0, ly: null, yr: 0, still: true, maxSp: 0, antic: 0, stepIdx: null, lpBob: 0, lastHeadRY: 0, hv: 0,
    idleT: 0, next: 5, sp: null, spAmt: 0, busy: 0, spr: 0
  };
  var _v = new THREE.Vector3(), _e = new THREE.Euler();

  var SPK = ['look', 'stretch', 'hat', 'hum', 'shift', 'shift'], SPD = { look: 2.6, stretch: 2.1, hat: 1.7, hum: 3.2, shift: 2.6 };
  function pickSpecial() {
    var k = SPK[(Math.random() * SPK.length) | 0];
    if (G.Time && G.Time.weather === 'rain' && G.Scenes && G.Scenes.current === 'outdoor' && Math.random() < 0.5 && G.AnimClips && G.AnimData.has('shake')) { hs.idleT = 0; hs.next = 7 + rnd(0, 4); P.playAction('shake', {}); return; }
    hs.sp = { kind: k, t: 0, dur: SPD[k] };
  }

  function springPivot(obj, sx, sy, sz, piv) {
    _e.set(sx, 0, sz); obj.rotation.set(sx, 0, sz);
    _v.set(0, piv, 0).applyEuler(_e);
    obj.position.set(-_v.x, piv - _v.y + sy, -_v.z);
  }

  function stepSurface() {
    var G2 = G, sc = G2.Scenes && G2.Scenes.current, t;
    if (sc && sc !== 'outdoor') return 'room';
    t = G2.World && G2.World.tileType ? G2.World.tileType(P.pos.x, P.pos.z) : 'grass';
    if (t === 'pier') return 'wood';
    if (t === 'stone' || t === 'sand') return t;
    if (G2.Time && G2.Time.weather === 'snow') return 'snow';
    return t === 'path' || t === 'soil' ? 'path' : 'grass';
  }
  function footfall(side, speed) {
    if (G.Events) G.Events.emit('player:step', { surface: stepSurface(), speed: speed, foot: side });
    hatS.y.v += 0.2; hatS.z.v += side ? 1.3 : -1.3; hatS.x.v += 0.6;
    bunS.x.v -= 1.5; bunS.z.v += side ? 1.8 : -1.8;
    if (speed > 1.3 && G.Scenes && G.Scenes.current === 'outdoor' && G.World && G.World.tileType) {
      var r = P.hero.root, yw = r.rotation.y, fx = Math.sin(yw), fz = Math.cos(yw), lx = fz, lz = -fx, so = side ? 0.09 : -0.09;
      var x = r.position.x + lx * so - fx * 0.12, z = r.position.z + lz * so - fz * 0.12;
      var tt = G.World.tileType(x, z);
      if (DUST[tt]) { var big = P.moveMode === 'sprint' || speed > 4.4; puff(x, z, big ? 2 : 1, -fx * (big ? 0.5 : 0.25), -fz * (big ? 0.5 : 0.25), big, G.Time && G.Time.weather === 'snow' ? DUST.snow : DUST[tt]); }
    }
  }

  /* Locomotion polish shared by the hero and remote players (f = state from newLoco). Adds deltas into D. Walk / run / sprint, start-stop squash, lean, turn. */
  function newLoco() { return { ls: 0, acc: 0, ly: null, yr: 0, still: true, maxSp: 0, antic: 0, stepIdx: null, spr: 0, lean: new Spring(190, 13), set: new Spring(260, 14) }; }
  function loco(f, ch, D, dt, sp, sprT, sit, onStep) {
    var an = ch.anim, w1 = an.w[1], w2 = an.w[2], ph = an.phase, s = Math.sin(ph), c2 = Math.cos(ph), i; c2 *= c2;
    // yaw rate + acceleration (smoothed)
    var yaw = ch.root.rotation.y, dy = f.ly === null ? 0 : U.wrapAngle(yaw - f.ly) / dt;
    f.ly = yaw; if (Math.abs(dy) > 25) dy = 0;
    f.yr += (clamp(dy, -9, 9) - f.yr) * (1 - Math.exp(-10 * dt));
    var raw = (sp - f.ls) / dt; f.ls = sp; f.acc += (clamp(raw, -40, 40) - f.acc) * (1 - Math.exp(-12 * dt));
    var mv = w1 + w2;
    f.spr += ((sprT ? 1 : 0) - f.spr) * (1 - Math.exp(-8 * dt)); var spr = f.spr;   // sprint amount 0..1

    for (i = 0; i < KEYS.length; i++) D[KEYS[i]] = 0;

    if (!sit) {
      // start / stop events
      if (f.still && sp > 0.3) { f.still = false; f.antic = 0.17; f.maxSp = 0; }
      if (!f.still) { f.maxSp = Math.max(f.maxSp, sp); if (sp < 0.25) { f.still = true; if (f.maxSp > 1) f.set.v -= 0.5 + 0.12 * f.maxSp; } }
      // relaxed, lagged arm swing + slight outward hang
      var aw = w1 * (-0.82 * Math.sin(ph - 0.35) + 0.6 * s) + w2 * (-1.25 * Math.sin(ph - 0.3) + 1.0 * s);
      aw *= 1 + 0.45 * spr; D.armLX += aw; D.armRX -= aw;
      // stride shaping: creep = short shuffle steps, sprint = long driving stride (walk/run poses stay the base)
      var ampK = U.lerp(0.5, 1, ss(0.3, 1.8, sp)), sl = (1 - ampK) * w1 * 0.55 * s + spr * w2 * 0.22 * s;
      D.legLX += sl; D.legRX -= sl; aw *= ampK; D.armLZ += w1 * 0.06 + w2 * 0.07; D.armRZ += w1 * 0.06 + w2 * 0.07;
      // double bounce (walk about 0.05 peak-to-peak, run about 0.07)
      D.bob += w1 * 0.008 * c2 + w2 * (-0.05 * (1 - Math.abs(s)) * (1 + 0.8 * spr) + 0.005 * c2);
      // lean spring: forward with speed and acceleration, back when braking; anticipation crouch at start; settle at stop
      var lt = w1 * 0.05 + w2 * 0.035 + 0.13 * spr + clamp(0.007 * f.acc, -0.17, 0.17);
      f.lean.step(dt, lt);
      var ae = 0; if (f.antic > 0) { f.antic -= dt; ae = Math.sin(Math.PI * clamp(1 - f.antic / 0.17, 0, 1)); }
      f.set.step(dt, 0);
      D.spineRX += f.lean.x - 0.07 * ae - f.set.x * 2.5;
      D.headRX += -0.45 * f.lean.x + 0.05 * ae;
      D.bob += -0.025 * ae + f.set.x;
      // turning: lean into the curve, head leads, torso twist lags
      var tf = Math.min(1, sp / 1.5);
      D.spineRZ += -clamp(f.yr * 0.035, -0.14, 0.14) * tf;
      D.hipsRZ += -clamp(f.yr * 0.012, -0.05, 0.05) * tf;
      D.headRY += clamp(f.yr * 0.05, -0.25, 0.25);
      D.spineRY += -clamp(f.yr * 0.02, -0.12, 0.12) * tf;
      // footfalls
      var idx = Math.floor((ph - HALF) / Math.PI);
      if (f.stepIdx === null) f.stepIdx = idx;
      else if (idx !== f.stepIdx) { f.stepIdx = idx; if (mv > 0.5 && onStep) onStep(idx & 1, sp); }
    } else { f.still = true; f.lean.step(dt, 0); f.set.step(dt, 0); f.stepIdx = null; }

  }

  function heroFrame(dt) {
    if (!CA.enabled) { A.apply(P.hero, P.hero.anim.pose); return; }
    dt = Math.min(dt, 1 / 20); if (dt <= 0) return;
    var ch = P.hero, an = ch.anim, p = an.pose, J = ch.joints, sit = P.sitting || !!P.ride, k, i;   // riding a bicycle uses the seated locomotion rules
    var sp = P.speed, w0 = an.w[0], w1 = an.w[1], w2 = an.w[2], ph = an.phase, s = Math.sin(ph), c2 = Math.cos(ph); c2 *= c2;
    H.t += dt;

    loco(hs, ch, D, dt, sp, P.moveMode === 'sprint', sit, footfall);
    if (sit) { J.hipL.position.y = 0; J.hipR.position.y = 0; }
    carryAmt += ((carryDef && !sit && !(G.AnimClips && G.AnimClips.busy && G.AnimClips.busy()) ? 1 : 0) - carryAmt) * (1 - Math.exp(-9 * dt));
    if (carryAmt > 0.01) {
      var ca = carryAmt, sw2 = 1 - 0.75 * ca;
      D.armLX = D.armLX * sw2 + 1.05 * ca; D.armRX = D.armRX * sw2 + 1.05 * ca; D.armLZ -= 0.16 * ca; D.armRZ -= 0.16 * ca;
      D.spineRX -= 0.05 * ca; D.headRX += 0.04 * ca; D.bob += 0.004 * Math.abs(Math.sin(an.phase)) * ca * (w1 + w2);
    }
    if (carryDef || carryMesh) {
      if (!carryMesh && G.AnimTools && G.AnimTools.tool) carryMesh = G.AnimTools.tool('sack', 0, carryDef);
      if (carryMesh) { if (carryMesh.parent !== P.hero.attach.handR) { P.hero.attach.handR.add(carryMesh); carryMesh.position.set(0, 0.02, 0.12); } carryMesh.visible = carryAmt > 0.5; if (carryMesh.visible) carryMesh.rotation.x = p.armRX - p.spineRX; }
    }
    var mv = w1 + w2;

    // idle breathing (also seated), shoulders rise
    var b = breathe(H, w0 > 0.5 || sit ? 1 : 0);
    D.spineRX += b * 0.014 * (sit ? 0.6 : w0);
    D.armLZ += b * 0.012 * w0; D.armRZ -= b * 0.012 * w0;

    // idle specials after 5 s of standing still
    var can = !sit && sp < 0.05 && !P.isLocked() && hs.busy <= 0;
    if (hs.busy > 0) hs.busy -= dt;
    if (can) {
      hs.idleT += dt;
      if (!hs.sp && hs.idleT > hs.next) pickSpecial();
    } else { hs.idleT = 0; hs.next = 6 + rnd(0, 4); if (hs.sp) hs.sp.t = Math.max(hs.sp.t, hs.sp.dur); }
    var tgt = hs.sp && hs.sp.t < hs.sp.dur ? 1 : 0;
    hs.spAmt += (tgt - hs.spAmt) * (1 - Math.exp(-(tgt ? 9 : 7) * dt));
    if (hs.sp) {
      hs.sp.t += dt;
      var u = clamp(hs.sp.t / hs.sp.dur, 0, 1), env = hs.spAmt;
      if (hs.sp.kind === 'look') {
        var lk = Math.sin(u * TAU) * Math.min(1, Math.sin(u * Math.PI) * 2.2);
        D.headRY += 0.9 * lk * env; D.spineRY += 0.22 * lk * env; D.headRX -= 0.05 * env * Math.sin(u * Math.PI);
      } else if (hs.sp.kind === 'hat') {   // tug the hat brim, tilt the head, little hat bounce
        var he = ss(0, 0.25, u) * (1 - ss(0.7, 1, u)) * env, tug = Math.sin(u * 20) * ss(0.25, 0.4, u) * (1 - ss(0.6, 0.75, u));
        D.armRX += 2.55 * he + 0.1 * tug * he; D.armRZ += -0.5 * he; D.headRX -= 0.1 * he; D.headRZ += 0.1 * he; D.spineRX -= 0.03 * he;
        if (tug > 0.6 && !hs.sp.k) { hs.sp.k = 1; hatS.y.v += 0.5; hatS.z.v += 1.2; }
      } else if (hs.sp.kind === 'hum') {   // hum a tune: sway side to side, head bob, hands behind
        var hm = Math.min(1, Math.sin(u * Math.PI) * 2.5) * env, sw = Math.sin(u * TAU * 2.2);
        D.spineRZ += 0.07 * sw * hm; D.hipsRZ += 0.03 * sw * hm; D.headRZ -= 0.1 * sw * hm; D.headRX += 0.04 * Math.sin(u * TAU * 4.4) * hm; D.armLX -= 0.18 * hm; D.armRX -= 0.18 * hm; D.bob += 0.008 * Math.abs(Math.sin(u * TAU * 2.2)) * hm;
      } else if (hs.sp.kind === 'shift') {   // weight shift: hips settle onto one leg, shoulders counter, free knee relaxes, a breath out, then back
        var sh = ss(0, 0.32, u) * (1 - ss(0.62, 1, u)) * env, br = Math.sin(u * Math.PI) * env;
        D.hipsRZ += 0.07 * sh; D.spineRZ -= 0.055 * sh; D.headRZ += 0.045 * sh; D.hipsRY += 0.05 * sh; D.spineRY -= 0.04 * sh;
        D.legLX += 0.07 * sh; D.legRX -= 0.04 * sh; D.bob -= 0.009 * sh; D.armLZ += 0.04 * sh; D.armRZ -= 0.03 * sh; D.spineRX -= 0.025 * br; D.headRX += 0.02 * br;
      } else {
        var e = ss(0, 0.3, u) * (1 - ss(0.72, 1, u)) * env;
        D.armLX += 2.7 * e; D.armRX += 2.7 * e; D.armLZ += 0.28 * e; D.armRZ += 0.28 * e;
        D.spineRX -= 0.17 * e; D.headRX -= 0.32 * e; D.bob += 0.018 * e + 0.004 * Math.sin(u * 40) * e;
      }
      if (hs.sp.t >= hs.sp.dur && hs.spAmt < 0.02) { hs.sp = null; hs.idleT = 0; hs.next = 5 + rnd(0, 4); }
    }

    // write into the pose (so tool / fishing layers inherit it) and apply
    for (i = 0; i < KEYS.length; i++) { k = KEYS[i]; p[k] += D[k]; }
    A.apply(ch, p);

    // head counter-bob (lags the body bounce)
    hs.lpBob += (p.bob - hs.lpBob) * (1 - Math.exp(-5 * dt));
    J.head.position.y = H.headY - clamp((p.bob - hs.lpBob) * 0.55, -0.04, 0.04);

    // hat + bun secondary motion
    var hv = (p.headRY - hs.lastHeadRY) / dt; hs.lastHeadRY = p.headRY; hs.hv += (clamp(hv, -12, 12) - hs.hv) * (1 - Math.exp(-14 * dt));
    var ax = clamp(hs.acc, -30, 30);
    hatS.x.step(dt, clamp(-0.006 * ax, -0.2, 0.2)); hatS.y.step(dt, 0); hatS.z.step(dt, clamp(0.03 * hs.yr, -0.22, 0.22));
    bunS.x.step(dt, clamp(-0.012 * ax, -0.4, 0.4)); bunS.z.step(dt, clamp(0.05 * hs.yr, -0.35, 0.35)); bunS.y.step(dt, clamp(-0.04 * hs.hv, -0.4, 0.4));
    springPivot(ch.attach.hat, hatS.x.x, clamp(hatS.y.x, -0.03, 0.03), hatS.z.x, 0.38);
    if (J.bun) J.bun.rotation.set(bunS.x.x, bunS.y.x, bunS.z.x);

    blink(H, dt);
    stepPuffs(dt);
  }
  G.Loop.onFrame(heroFrame, 100.5);

  // Tool actions suppress idle specials for their duration (FarmFx wraps playAction too; wrapping order does not matter).
  var basePlay = P.playAction;
  P.playAction = function (name, opts, cb) {
    hs.busy = ((opts && opts.duration) || 0.4) + 0.6; hs.idleT = 0;
    return basePlay.call(P, name, opts, cb);
  };
  G.Events.on('scene:changed', function () { killPuffs(); hs.stepIdx = null; hs.ly = null; });

  /* ------------------------------------------------------------ remote players
   * Same locomotion polish as the hero, driven by the interpolated speed (avatars.js calls CharAnim.remote after ch.update): start / stop squash, lean,
   * bounce, turn lean, head counter-bob, breathing, blink; spring parts via Game.CharSec. No footstep sound / dust (those belong to the local hero). */
  CA.remote = function (ch, dt, sp, lying, far) {   // far (stage 36): skip secondary motion (blink, hair / hat springs)
    var f = ch.caR, an = ch.anim, p = an.pose, J = ch.joints, i, k, b;
    if (!f) { f = ch.caR = ctl(ch, 'remote'); f.lo = newLoco(); f.D = A.newPose(); f.lp = 0; }
    dt = Math.min(dt, far ? 0.1 : 1 / 20); if (dt <= 0) return;
    f.t += dt;
    if (!lying && CA.enabled) {
      var D = f.D;
      loco(f.lo, ch, D, dt, sp, sp > 4.6, false, null);
      b = breathe(f, an.w[0] > 0.5 ? 1 : 0);
      D.spineRX += b * 0.014 * an.w[0]; D.armLZ += b * 0.012 * an.w[0]; D.armRZ -= b * 0.012 * an.w[0];
      for (i = 0; i < KEYS.length; i++) { k = KEYS[i]; p[k] += D[k]; }
      A.apply(ch, p);
      f.lp += (p.bob - f.lp) * (1 - Math.exp(-5 * dt));
      J.head.position.y = f.headY - clamp((p.bob - f.lp) * 0.55, -0.04, 0.04);
    }
    if (far) return;
    blink(f, dt);
    if (G.CharSec) G.CharSec.step(ch, dt);
  };

  /* Carry pose (hero): CharAnim.carry(def) holds a sack in both arms in front of the chest while walking (def = item def for the sack colour, null/false = put down).
   * Arm swing is damped, body leans back a little, small bounce; hidden while an action clip runs. */
  var carryDef = null, carryAmt = 0, carryMesh = null;
  CA.carry = function (def) { carryDef = def || null; };

  /* -------------------------------------------------------------------- NPC */
  var npcs = [], npcDone = false;
  function mallet() {
    var pr = [], cyl = new THREE.CylinderGeometry(1, 1, 1, 8), box = new THREE.BoxGeometry(1, 1, 1);
    pr.push(M.part(cyl, 0xb98a56, [0, 0, 0.12], [HALF, 0, 0], [0.018, 0.26, 0.018]));
    pr.push(M.part(box, 0x7a5236, [0, 0, 0.25], null, [0.1, 0.075, 0.075]));
    return M.mergeParts(pr);
  }
  function miniRod() {
    var pr = [], cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
    pr.push(M.part(cyl, 0x9b6b3f, [0, 0, 0.22], [HALF, 0, 0], [0.016, 0.52, 0.016]));
    pr.push(M.part(new THREE.SphereGeometry(1, 8, 6), 0xe8574a, [0, -0.08, 0.5], null, [0.03, 0.03, 0.03]));
    pr.push(M.part(cyl, 0xe9e2d0, [0, -0.04, 0.5], null, [0.004, 0.08, 0.004]));
    return M.mergeParts(pr);
  }
  function propMesh(geo, ch) {
    var m = new THREE.Mesh(geo, M.material('prop')); R.addOutline(m, true); m.visible = false; ch.attach.handL.add(m); return m;
  }
  function addNpc(entry, kind) {
    if (!entry || !entry.h || entry.fx) return;
    var f = ctl(entry.h, kind); f.sp = null; f.spT = 0; f.next = rnd(3, 6);
    f.prop = kind === 'smith' ? propMesh(cached('mallet', mallet), entry.h) : propMesh(cached('rod', miniRod), entry.h);
    entry.fx = f; npcs.push(f);
  }
  var propCache = {};
  function cached(k, fn) { return propCache[k] || (propCache[k] = fn()); }

  function npcFrame(dt) {
    if (!npcDone && G.Town && G.Town.npcs && G.Town.npcs.shopkeeper) {
      addNpc(G.Town.npcs.shopkeeper, 'smith'); addNpc(G.Town.npcs.fishmonger, 'angler'); npcDone = true;
    }
    var NG = G.SimTier && G.SimTier.npc;   // stage 36: shared NPC step (see sim_tier.js)
    if (NG) { if (!NG.due) return; dt = NG.dt; }
    dt = Math.min(dt, 1 / 10);
    for (var i = 0; i < npcs.length; i++) {
      var f = npcs[i], J = f.ch.joints, b, u, e = 0;
      f.t += dt;
      b = breathe(f, 1);
      J.spine.rotation.x += b * 0.014;
      J.shoulderL.rotation.z += b * 0.012; J.shoulderR.rotation.z -= b * 0.012;
      if (f.sp === null) { f.next -= dt; if (f.next <= 0) { f.sp = 0; f.spDur = f.kind === 'smith' ? 2.0 : 3.2; } }
      else {
        f.sp += dt; u = clamp(f.sp / f.spDur, 0, 1); e = ss(0, 0.18, u) * (1 - ss(0.82, 1, u));
        if (f.kind === 'smith') {            // raise the mallet, tap three times, nod along
          var tap = Math.abs(Math.sin(Math.PI * 3 * u)) * e;
          J.shoulderL.rotation.x += -1.1 * e + 0.38 * tap; J.shoulderL.rotation.z += 0.12 * e;
          J.spine.rotation.x += 0.05 * e; J.head.rotation.x += 0.1 * tap + 0.06 * e;
        } else {                             // hold a little rod and bob it
          var bob = Math.sin(f.sp * 5.5) * e;
          J.shoulderL.rotation.x += -0.95 * e + 0.14 * bob; J.shoulderL.rotation.z += 0.14 * e;
          f.ch.attach.handL.rotation.x = -0.55 * e + 0.12 * bob;
          J.head.rotation.x += -0.08 * e + 0.04 * bob; J.head.rotation.y += 0.18 * e * Math.sin(f.sp * 1.3);
        }
        if (u >= 1) { f.sp = null; f.next = rnd(6, 11); e = 0; f.ch.attach.handL.rotation.x = 0; }
      }
      f.prop.visible = e > 0.02;
      blink(f, dt);
    }
  }
  G.Loop.onFrame(npcFrame, 11);

  CA.kick = function (hx, hz, bx, bz) { hatS.x.v += hx; hatS.z.v += hz; bunS.x.v += bx; bunS.z.v += bz; };   // impulses from the clip layer (overlapping action)
  CA.puff = puff;
  CA.hero = H;
  CA.attach = function (ch, kind) { return ctl(ch, kind || 'npc'); };
  G.CharAnim = CA;
})();
