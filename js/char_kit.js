/* Togie Valley - char_kit.js (Round 3 stage 16). Designed hair, clothes, hats and head/torso accessories for Game.Models.character.
 * Load right after models.js. models.js build functions delegate to Game.CharKit.{head,bun,torso,arm,leg,hat} (old code stays as fallback).
 * Hair = skull-hugging cap (HeadModel) + layered chunky "locks" (tapered teardrops): darker underside, lighter highlight band, fringe, nape, whorl.
 * Hair-hiding rules: with a hat the crown locks / whorl are dropped, fringe + side + nape locks stay (thin, under the hat shell offset);
 * tied styles (pony / twin) move their tie below the hat rim (RIM_SIDE / RIM_BACK). Head accessories sit on top of the lock layer (off = g + 0.04).
 * Hats are shells built on the head surface (HM.point) so they fit every hair style: body offset 0.07 > hair (0.022 + 0.03 lock). */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Models || !G.Models.kit || !G.HeadModel) { console.error('[char_kit] Models/HeadModel missing (load after models.js)'); return; }
  var M = G.Models, X = M.kit, HM = G.HeadModel, merge = M.mergeParts, part = M.part, dk = X.dk, lt = X.lt, hasAcc = X.hasAcc;
  var PI = Math.PI, TAU = PI * 2, CY = HM.CY, RY = HM.RY, _c = new THREE.Color();
  var mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mC = new THREE.Matrix4();

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sm(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function gs(x, c, s) { var d = (x - c) / s; return Math.exp(-d * d); }
  function mul(c, k) { c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c; }

  /* ------------------------------------------------------------------ hair */
  function hairFns(hair) {   // F(tone) -> colour fn: darker underside, lighter crown + highlight band, per-lock tone
    var b = new THREE.Color(hair), cache = {};
    return function (tone) {
      var k = tone.toFixed(2);
      return cache[k] || (cache[k] = function (x, y, z) {
        var dy = (y - CY) / RY, t = 0.1 * sm(0.1, 1, dy) + 0.2 * gs(dy, 0.6, 0.14), u = (1 - 0.26 * sm(0.25, -0.6, dy)) * tone;
        return _c.setRGB(Math.min(1, (b.r + (1 - b.r) * t) * u), Math.min(1, (b.g + (1 - b.g) * t) * u), Math.min(1, (b.b + (1 - b.b) * t) * u));
      });
    };
  }
  var LK = null, PIP = new THREE.SphereGeometry(1, 6, 3);   // tiny round bits (buttons, petals): 24 triangles
  function lockGeo() {   // tapered teardrop, tip toward -y (24 triangles)
    if (LK) return LK;
    var g = new THREE.SphereGeometry(1, 6, 3), p = g.attributes.position, i, y;
    for (i = 0; i < p.count; i++) { y = p.getY(i); if (y < 0) { p.setX(i, p.getX(i) * (1 + y * 0.7)); p.setZ(i, p.getZ(i) * (1 + y * 0.5)); } }
    g.computeVertexNormals();
    return (LK = g);
  }
  var LOCK_FLAT = 0.55;   // r04: skull-hugging locks sit flatter on the cap, so the silhouette is the smooth cap instead of a ring of bumps
  function lock(P, f, yaw, pitch, off, w, len, th, roll) {   // follows the skull: long axis along the meridian, tip pointing down the head
    var m = HM.facing(yaw, pitch, off, 1, 1, 1);
    m.multiply(mA.makeRotationZ(roll || 0)).multiply(mB.makeScale(w, len, th * LOCK_FLAT));
    P.push({ geo: lockGeo(), color: f, matrix: m });
  }
  function hang(P, f, pos, yaw, w, len, th, flare, roll) {   // hangs vertically from pos, tip flares outward
    var m = new THREE.Matrix4().makeTranslation(pos[0], pos[1], pos[2]);
    m.multiply(mA.makeRotationY(yaw)).multiply(mB.makeRotationX(-(flare || 0))).multiply(mC.makeRotationZ(roll || 0)).multiply(mA.makeScale(w, len, th));
    P.push({ geo: lockGeo(), color: f, matrix: m });
  }
  function onHead(P, geo, color, yaw, pitch, off, lx, ly, lz, roll, sx, sy, sz) {
    var m = HM.facing(yaw, pitch, off, 1, 1, 1);
    m.multiply(mA.makeTranslation(lx, ly, lz)).multiply(mB.makeRotationZ(roll || 0)).multiply(mC.makeScale(sx, sy, sz));
    P.push({ geo: geo, color: color, matrix: m });
  }

  function fringe(P, F, g, n, ys, tipA, tipB, sw, wl, hat) {
    var i, t, tip, pc, len;
    for (i = 0; i < n; i++) {
      t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      tip = tipA + (tipB - tipA) * (0.5 + 0.5 * Math.sin(i * 2.1 + 0.5));
      pc = (0.95 + tip) / 2; len = (0.95 - tip) * 0.12;
      lock(P, F(0.9 + 0.1 * (i % 2)), t * ys, pc, g, wl, len, 0.032, t * 0.3 + sw);
    }
    for (i = 0; i < n - 1 && !hat; i += 2) {   // second (hidden under any hat: skipped), shorter row over the first: layered chunky bangs
      t = ((i + 0.5) / (n - 1)) * 2 - 1;
      lock(P, F(1.04), t * ys, 0.82, g + 0.004, wl * 1.5, 0.075, 0.03, t * 0.28 + sw);
    }
  }
  function sides(P, F, g, pc, len, w) { var s; for (s = -1; s <= 1; s += 2) lock(P, F(0.94), s * 1.15, pc, g, w, len, 0.034, s * 0.1); }
  function nape(P, F, g, n, pc, len, w) {
    var i, t;
    for (i = 0; i < n; i++) { t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; lock(P, F(0.84 + 0.07 * (i % 2)), PI + t * 1.15, pc + 0.07 * (i % 2), g + 0.004, w, len, 0.036, t * 0.25); }
  }
  function whorl(P, F, g, n, rot) {   // outer swirl + a fused centre tuft so the crown pole (cap fan) is never left bare
    var k; for (k = 0; k < n; k++) lock(P, F(1.07), rot + k * TAU / n, 1.2, g + 0.003, 0.058, 0.1, 0.03, 0.32);
    lock(P, F(1.05), rot + 0.5, 1.46, g + 0.006, 0.075, 0.085, 0.034, 0.5); lock(P, F(1.05), rot + 0.5 + PI, 1.46, g + 0.006, 0.075, 0.085, 0.034, 0.5);
  }

  /* Stage 17: spring parts. headSplit / torsoSplit run the same builders but pull the loose parts (tails, curtain hair, bow, scarf end,
   * backpack) into SPLIT.items so models.js puts each on its own pivot (Game.CharSec swings them). Plain head() / torso() still merge everything. */
  var SPLIT = null;
  function emit(P, T, kind, host, pivot, amp) {
    var i, tr, f, m;
    if (!SPLIT) { for (i = 0; i < T.length; i++) P.push(T[i]); return; }
    tr = new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
    for (i = 0; i < T.length; i++) {
      m = T[i]; m.matrix.premultiply(tr); f = m.color;
      if (typeof f === 'function') m.color = (function (g, a, b, c) { return function (x, y, z) { return g(x + a, y + b, z + c); }; })(f, pivot[0], pivot[1], pivot[2]);   // keep the colour gradient in head space
    }
    SPLIT.items.push({ kind: kind, host: host, pivot: pivot, amp: amp, geo: merge(T) });
  }
  var RIM_SIDE = { straw: 0.45, la: 0.3, beret: 0.15, beanie: -0.07, cap: -0.1 };   // where a side tie (twin tails) may sit under each hat
  var RIM_BACK = { straw: 0.34, la: 0.26, beret: 0.1, beanie: -0.15, cap: -0.12 };   // ponytail tie pitch at the back
  function tie(P, pos, rotX, side) {   // scrunchie ring around the tail root
    var m = new THREE.Matrix4().makeTranslation(pos[0], pos[1], pos[2]);
    m.multiply(mA.makeRotationX(rotX)).multiply(mB.makeRotationZ(side ? side * 0.5 : 0));
    P.push({ geo: new THREE.TorusGeometry(0.048, 0.02, 5, 10), color: 0xf4a0b5, matrix: m });
  }

  var FLOWER_P = { straw: 0.42, la: 0.33, beret: 0.27, beanie: 0.07, cap: 0.18 };   // flower pin pitch below each hat's rim at yaw 1.0
  var HAIR = {
    short: function (P, F, g, hat) {
      fringe(P, F, g, 7, 0.85, 0.36, 0.27, 0.22, 0.052, hat);
      sides(P, F, g, 0.35, 0.085, 0.05); nape(P, F, g, 5, 0.0, 0.075, 0.06);
      if (!hat) whorl(P, F, g, 4, 0.4);
    },
    bun: function (P, F, g, hat) {
      fringe(P, F, g, 7, 0.82, 0.38, 0.28, 0.3, 0.05, hat);
      sides(P, F, g, 0.35, 0.085, 0.048); nape(P, F, g, 5, 0.1, 0.07, 0.055);
      lock(P, F(1.04), PI - 0.28, 0.78, g, 0.05, 0.1, 0.03, -0.1); lock(P, F(1.04), PI + 0.28, 0.78, g, 0.05, 0.1, 0.03, 0.1); lock(P, F(1.08), PI, 0.88, g, 0.05, 0.1, 0.03, 0);
      if (!hat) whorl(P, F, g, 4, 0.9);
    },
    pony: function (P, F, g, hat, o) {
      var h = o.hat, pr = hat ? RIM_BACK[h] : 0.34, R = HM.point(PI, pr, g + 0.01).p, i, B = [[-0.06, -0.045, 0.078, 0.082, 0.072, 0, 0.95], [-0.16, -0.078, 0.07, 0.092, 0.066, 0.1, 1.0], [-0.255, -0.08, 0.05, 0.082, 0.05, -0.12, 1.05]];
      fringe(P, F, g, 7, 0.85, 0.34, 0.27, -0.25, 0.05, hat);
      sides(P, F, g, 0.35, 0.085, 0.048); nape(P, F, g, 5, 0.18, 0.07, 0.055);
      lock(P, F(1.04), PI - 0.3, 0.8, g, 0.05, 0.11, 0.03, -0.2); lock(P, F(1.04), PI + 0.3, 0.8, g, 0.05, 0.11, 0.03, 0.2);
      if (!hat) whorl(P, F, g, 5, 0.2);
      var T = [];
      tie(T, R, 2.2, 0);
      for (i = 0; i < B.length; i++) hang(T, F(B[i][6]), [R[0], R[1] + B[i][0], R[2] + B[i][1]], PI, B[i][2], B[i][3], B[i][4], 0.12, B[i][5]);
      emit(P, T, 'pony', 'head', [R[0], R[1], R[2]], 1);
    },
    twin: function (P, F, g, hat, o) {
      var h = o.hat, pr = hat ? RIM_SIDE[h] : 0.5, s, i, R, B = [[0.03, -0.07, 0.078, 0.088, 0.076, 0.95], [0.062, -0.165, 0.07, 0.092, 0.07, 1.0], [0.078, -0.245, 0.05, 0.078, 0.05, 1.05]];
      fringe(P, F, g, 7, 0.8, 0.31, 0.25, 0, 0.05, hat);
      sides(P, F, g, 0.12, 0.12, 0.052); nape(P, F, g, 5, 0.05, 0.075, 0.058);
      if (!hat) whorl(P, F, g, 4, 0.5);
      for (s = -1; s <= 1; s += 2) {
        R = HM.point(s * 1.5, pr, g + 0.01).p; var T = [];
        tie(T, R, 1.5, s);
        for (i = 0; i < B.length; i++) hang(T, F(B[i][5]), [R[0] + s * B[i][0], R[1] + B[i][1], R[2]], s * PI / 2, B[i][2], B[i][3], B[i][4], -0.15, -s * 0.12);
        emit(P, T, 'twin', 'head', [R[0], R[1], R[2]], 1);
      }
    },
    bob: function (P, F, g, hat) {
      var i, ys = [1.3, 2.0, 2.6], s, y, T = [], pv = HM.point(PI, -0.3, g).p;
      fringe(P, F, g, 8, 0.9, 0.27, 0.3, 0.1, 0.05, hat);
      for (s = -1; s <= 1; s += 2) {
        lock(P, F(0.96), s * 1.1, 0.02, g, 0.052, 0.11, 0.036, s * 0.08);
        for (i = 0; i < ys.length; i++) { y = s * ys[i]; hang(T, F(0.84 + 0.07 * (i % 2)), HM.point(y, -0.3, g).p, y, 0.078, 0.135, 0.062, 0.18, -s * 0.1); }
      }
      hang(T, F(0.86), HM.point(PI, -0.3, g).p, PI, 0.08, 0.135, 0.062, 0.18, 0);
      emit(P, T, 'curtain', 'head', [0, pv[1] + 0.03, 0], 0.55);
      if (!hat) whorl(P, F, g, 5, 0.1);
    },
    long: function (P, F, g, hat) {
      var i, ys = [1.3, 1.95, 2.6], s, y, T = [], pv = HM.point(PI, -0.42, g).p;
      fringe(P, F, g, 8, 0.9, 0.25, 0.3, -0.12, 0.05, hat);
      for (s = -1; s <= 1; s += 2) {
        hang(P, F(0.95), HM.point(s * 1.2, -0.05, g).p, s * 1.2, 0.058, 0.17, 0.045, 0.1, s * 0.05);
        for (i = 0; i < ys.length; i++) { y = s * ys[i]; hang(T, F(0.82 + 0.08 * (i % 2)), HM.point(y, -0.42, g).p, y, 0.078, 0.18, 0.06, 0.16, -s * 0.06); }
      }
      hang(T, F(0.84), HM.point(PI, -0.42, g).p, PI, 0.085, 0.18, 0.062, 0.16, 0);
      emit(P, T, 'curtain', 'head', [0, pv[1] + 0.04, 0], 0.55);
      if (!hat) whorl(P, F, g, 5, 0.6);
    }
  };

  function head(o) {
    var P = [], hat = o.hat || null, hs = o.hairStyle, g = HM.hairOff(!!hat), F = hairFns(o.hair), H = g + 0.04, i, s, q, cap;
    P.push(HM.skinPart(o.skin));
    if (hs !== 'bob' && hs !== 'long' && hs !== 'twin') for (i = 0, q = HM.earParts(o.skin); i < q.length; i++) P.push(q[i]);
    cap = HM.hairPart(o.hair, hs, !!hat); cap.color = F(0.9); P.push(cap);
    (HAIR[hs] || HAIR.short)(P, F, g, !!hat, o);
    if (hasAcc(o, 'flower')) flower(P, 1.0, hat ? FLOWER_P[hat] : 0.42, H);
    if (hasAcc(o, 'bow')) { var BT = []; bow(BT, 0.5, 1.05, H); emit(P, BT, 'bow', 'head', HM.point(0.5, 1.05, H).p.slice(), 1); }
    if (hasAcc(o, 'headband') || hasAcc(o, 'catear')) band(P, g, hasAcc(o, 'catear'));
    return merge(P);
  }

  function flower(P, yaw, pitch, off) {
    var k, a, g = PIP, pc = 0xffb7c5;
    for (k = 0; k < 5; k++) { a = k * TAU / 5; onHead(P, g, pc, yaw, pitch, off, Math.cos(a) * 0.044, Math.sin(a) * 0.044, 0.012, a, 0.034, 0.03, 0.017); }
    onHead(P, g, 0xffd54f, yaw, pitch, off, 0, 0, 0.026, 0, 0.026, 0.026, 0.02);
    onHead(P, lockGeo(), 0x8fc98a, yaw, pitch, off, 0.05, -0.045, 0.0, -1.0, 0.026, 0.06, 0.012);
  }
  function bow(P, yaw, pitch, off) {
    var g = X.sph6(), bc = 0xf08aa8, s;
    for (s = -1; s <= 1; s += 2) {
      onHead(P, g, bc, yaw, pitch, off, s * 0.07, 0.0, 0.012, s * 0.28, 0.07, 0.048, 0.03);
      onHead(P, g, lt(bc, 0.25), yaw, pitch, off, s * 0.074, 0.006, 0.024, s * 0.28, 0.042, 0.026, 0.012);
      onHead(P, lockGeo(), dk(bc, 0.88), yaw, pitch, off, s * 0.03, -0.055, 0.004, s * 0.5, 0.026, 0.06, 0.016);
    }
    onHead(P, g, dk(bc, 0.82), yaw, pitch, off, 0, 0, 0.022, 0, 0.034, 0.034, 0.03);
  }
  function band(P, g, cat) {
    var pts = [], i, t, k = 0.3, dx, dy, dz, q, off = g + 0.03, hc = cat ? 0xf3c9d8 : 0xf2a6c0, s, yaw, pit;
    for (i = 0; i <= 8; i++) {
      t = 0.08 + (PI - 0.16) * i / 8; dx = -Math.cos(t); dy = Math.sin(t) * Math.cos(k); dz = -Math.sin(t) * Math.sin(k);
      q = HM.point(Math.atan2(dx, dz), Math.asin(dy), off + 0.03 * Math.sin(t)).p; pts.push(new THREE.Vector3(q[0], q[1], q[2]));
    }
    P.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.019, 5, false), color: hc, matrix: new THREE.Matrix4() });
    if (cat) {
      for (s = -1; s <= 1; s += 2) {
        t = PI / 2 + s * 0.66; dx = -Math.cos(t); dy = Math.sin(t) * Math.cos(k); dz = -Math.sin(t) * Math.sin(k);
        yaw = Math.atan2(dx, dz); pit = Math.asin(dy);
        P.push({ geo: new THREE.ConeGeometry(0.075, 0.16, 4), color: hc, matrix: HM.facing(yaw, pit, off - 0.02, 1, 1, 1).multiply(mA.makeRotationX(PI / 2)).multiply(mB.makeTranslation(0, 0.07, 0)) });
        P.push({ geo: new THREE.ConeGeometry(0.04, 0.1, 4), color: 0xf08aa8, matrix: HM.facing(yaw, pit, off - 0.02, 1, 1, 1).multiply(mA.makeRotationX(PI / 2)).multiply(mB.makeTranslation(0, 0.058, 0.026)) });
      }
    }
  }

  function headSplit(o) {
    var r;
    SPLIT = { items: [] };
    try { r = { geo: head(o), items: SPLIT.items }; } finally { SPLIT = null; }
    return r;
  }
  function torsoSplit(o) {
    var r;
    SPLIT = { items: [] };
    try { r = { geo: torso(o), items: SPLIT.items }; } finally { SPLIT = null; }
    return r;
  }

  function bun(o) {   // swinging bun: main ball + layered lumps + tie ring (pivot sits at the back of the head)
    var P = [], b = new THREE.Color(o.hair), f = function (x, y, z) { var t = sm(-0.08, 0.1, y), u = 0.8 + 0.28 * t + 0.14 * sm(0.0, 0.1, y); return _c.setRGB(Math.min(1, b.r * u + (1 - b.r) * 0.14 * t), Math.min(1, b.g * u + (1 - b.g) * 0.14 * t), Math.min(1, b.b * u + (1 - b.b) * 0.14 * t)); };
    P.push(part(new THREE.SphereGeometry(0.105, 8, 6), f, [0, 0.045, -0.03]));
    P.push(part(PIP, f, [0.045, 0.085, -0.005], null, [0.062, 0.05, 0.062]));
    P.push(part(PIP, f, [-0.045, 0.06, -0.06], null, [0.058, 0.05, 0.05]));
    P.push(part(new THREE.TorusGeometry(0.066, 0.016, 4, 8), 0xf4a0b5, [0, -0.005, 0.062]));
    return merge(P);
  }

  /* ------------------------------------------------------------------ hats */
  function shell(topFn, botFn, off, lip, N, Mr) {   // open shell on the head surface; topFn null = starts at the crown pole
    var pos = [], idx = [], j, k, jn, a, b, ph, tp, bt, pt, pitch, of, base = topFn ? 0 : 1, rings = 0, g;
    if (!topFn) { pt = HM.point(0, PI / 2, off).p; pos.push(pt[0], pt[1], pt[2]); }
    for (k = topFn ? 0 : 1; k <= Mr + 1; k++, rings++) for (j = 0; j < N; j++) {
      ph = j / N * TAU; bt = botFn(ph); tp = topFn ? topFn(ph) : PI / 2;
      if (k <= Mr) { pitch = tp + (bt - tp) * (k / Mr); of = off; } else { pitch = bt - 0.035; of = lip; }
      pt = HM.point(ph, pitch, of).p; pos.push(pt[0], pt[1], pt[2]);
    }
    if (!topFn) for (j = 0; j < N; j++) idx.push(0, 1 + j, 1 + (j + 1) % N);
    for (k = 0; k < rings - 1; k++) for (j = 0; j < N; j++) {
      jn = (j + 1) % N; a = base + k * N; b = a + N;
      idx.push(a + j, b + j, b + jn, a + j, b + jn, a + jn);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function tone(c, lo, hi) { var b = new THREE.Color(c); return function (x, y, z) { var t = 0.5 + 0.5 * clamp((y - 0.2) / 0.3, 0, 1); return _c.setRGB(b.r * (lo + (hi - lo) * t), b.g * (lo + (hi - lo) * t), b.b * (lo + (hi - lo) * t)); }; }
  function panels(c, n) { var b = new THREE.Color(c); return function (x, y, z) { var k = (Math.floor((Math.atan2(x, z) + PI) / (TAU / n)) % 2) ? 1 : 0.93, t = 0.86 + 0.16 * clamp((y - 0.2) / 0.3, 0, 1); return _c.setRGB(Math.min(1, b.r * t * k), Math.min(1, b.g * t * k), Math.min(1, b.b * t * k)); }; }

  function hat(id) {
    var P = [], s, q, m, pts, i;
    if (id === 'straw') {
      var sp = X.lathe([[0.462, 0.352], [0.452, 0.34], [0.43, 0.346], [0.44, 0.362], [0.38, 0.372], [0.3, 0.374], [0.248, 0.385], [0.244, 0.43], [0.23, 0.485], [0.19, 0.525], [0.12, 0.55], [0, 0.558]], [0.4], 10, function (x, y, z) {
        var r = Math.sqrt(x * x + z * z), c = new THREE.Color(0xe8c872), w = 0.5 + 0.5 * Math.sin(r * 130);
        if (y < 0.352 && r > 0.3) return mul(c, 0.78);
        if (y < 0.349) return mul(c, 0.8);
        if (y > 0.376 && r > 0.25) return mul(c, 0.98 + 0.06 * w);
        return mul(c, 0.86 + 0.18 * sm(0.38, 0.56, y) + 0.04 * w);
      });
      P.push(sp);
      P.push(part(new THREE.CylinderGeometry(0.2495, 0.252, 0.05, 10, 1, true), 0xc24d3b, [0, 0.402, 0]));
      P.push(part(X.sph6(), 0xa63d2e, [0, 0.4, -0.262], null, [0.03, 0.03, 0.02]));
      P.push({ geo: lockGeo(), color: 0xc24d3b, matrix: new THREE.Matrix4().makeTranslation(0.03, 0.365, -0.262).multiply(mA.makeRotationZ(0.35)).multiply(mB.makeScale(0.018, 0.075, 0.01)) });
      P.push({ geo: lockGeo(), color: 0xa63d2e, matrix: new THREE.Matrix4().makeTranslation(-0.03, 0.365, -0.262).multiply(mA.makeRotationZ(-0.3)).multiply(mB.makeScale(0.018, 0.07, 0.01)) });
    } else if (id === 'la') {
      P.push(X.lathe([[0.405, 0.318], [0.435, 0.322], [0.448, 0.332], [0.436, 0.341], [0.33, 0.39], [0.22, 0.45], [0.12, 0.53], [0.05, 0.572], [0, 0.585]], [0.4, 0.45, 0.5], 12, function (x, y, z) {
        var r = Math.sqrt(x * x + z * z), c = new THREE.Color(0xf3e2b0), w = Math.sin(r * 105) > 0.55 ? 0.93 : 1;
        if (y < 0.345) return mul(new THREE.Color(0xd8b872), 0.92);
        return mul(c, w * (0.9 + 0.12 * sm(0.34, 0.58, y)));
      }));
      P.push(part(X.sph6(), 0xd8b872, [0, 0.585, 0], null, [0.03, 0.026, 0.03]));
      for (s = -1; s <= 1; s += 2) {   // chin strap: rim -> cheek -> under the chin, floats above the hair on the sides
        pts = [new THREE.Vector3(s * 0.33, 0.35, 0.03)];
        q = [[s * 1.32, 0.2, 0.082], [s * 1.0, -0.4, 0.062], [s * 0.5, -0.95, 0.042], [0, -1.05, 0.03]];
        for (i = 0; i < q.length; i++) { m = HM.point(q[i][0], q[i][1], q[i][2]).p; pts.push(new THREE.Vector3(m[0], m[1], m[2])); }
        P.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 9, 0.011, 3, false), color: 0xc24d3b, matrix: new THREE.Matrix4() });
      }
    } else if (id === 'beret') {
      var rim = function (ph) { return 0.37 + 0.05 * Math.cos(ph) + 0.05 * Math.sin(ph); };
      P.push({ geo: shell(null, rim, 0.07, 0.05, 20, 4), color: tone(0xb85a78, 0.82, 1), matrix: new THREE.Matrix4() });
      P.push(part(new THREE.SphereGeometry(0.335, 12, 6), function (x, y, z) { var t = sm(0.3, 0.55, y); return _c.setRGB(Math.min(1, 0.9 * (0.82 + 0.2 * t)), Math.min(1, 0.54 * (0.82 + 0.2 * t) + 0.04 * t), Math.min(1, 0.66 * (0.82 + 0.2 * t))); }, [0.03, 0.405, -0.012], [0, 0, 0.13], [1, 0.42, 1]));
      P.push(part(new THREE.CylinderGeometry(0.014, 0.022, 0.05, 6, 1), 0xb85a78, [0.042, 0.552, -0.012], [0, 0, 0.13]));
    } else if (id === 'beanie') {
      var rb = function (ph) { return 0.06 + 0.24 * (0.5 + 0.5 * Math.cos(ph)); }, rc = function (ph) { return rb(ph) + 0.2; };
      P.push({ geo: shell(null, rb, 0.07, 0.07, 18, 5), color: tone(0xf08a7e, 0.84, 1), matrix: new THREE.Matrix4() });
      P.push({ geo: shell(rc, rb, 0.088, 0.062, 18, 2), color: tone(0xf9b8a0, 0.9, 1.0), matrix: new THREE.Matrix4() });
      q = HM.point(0, PI / 2, 0.07).p;
      P.push(part(X.sph8(), 0xfff6e6, [q[0], q[1] + 0.035, q[2] - 0.01], null, [0.07, 0.065, 0.07]));
    } else if (id === 'cap') {
      var rc2 = function (ph) { return 0.12 + 0.3 * (0.5 + 0.5 * Math.cos(ph)); };
      P.push({ geo: shell(null, rc2, 0.068, 0.05, 20, 5), color: panels(0x6fc2b8, 6), matrix: new THREE.Matrix4() });
      q = HM.point(0, rc2(0) - 0.02, 0.06).p;
      P.push(part(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 12, 1, false, -PI / 2, PI), 0x4f9f96, [q[0], q[1], q[2] - 0.03], [0.2, 0, 0]));
      q = HM.point(0, PI / 2, 0.068).p;
      P.push(part(X.sph8(), 0x4f9f96, [q[0], q[1] + 0.006, q[2]], null, [0.03, 0.022, 0.03]));
    }
    return merge(P);
  }

  /* --------------------------------------------------------------- clothes */
  function folded(pr, ys, segs, colorFn, fn, amp, shade, p, s) {   // lathe + radial vertex displacement (+ matching vertex-colour shading)
    var pt = X.lathe(pr, ys, segs, null, p, s), pos = pt.geo.attributes.position, i, x, y, z, r, d;
    for (i = 0; i < pos.count; i++) {
      x = pos.getX(i); y = pos.getY(i); z = pos.getZ(i); r = Math.sqrt(x * x + z * z);
      if (r < 1e-5) continue;
      d = fn(Math.atan2(z, x), y) * amp; pos.setX(i, x * (1 + d / r)); pos.setZ(i, z * (1 + d / r));
    }
    pt.color = function (x, y, z) { var c = colorFn(x, y, z); return mul(c, 1 + shade * fn(Math.atan2(z - (p ? p[2] : 0), x - (p ? p[0] : 0)), y)); };
    return pt;
  }
  function profile(o) {
    var t = o.top, f = t === 'hoodie' ? 1.05 : (t === 'sweater' ? 1.07 : 1), low, i, pr;
    if (o.bottom === 'skirt') low = [[0, -0.14], [0.24, -0.14], [0.275, -0.12], [0.255, -0.06], [0.2, 0.0], [0.178, 0.06]];
    else if (t === 'baba') low = [[0, -0.085], [0.14, -0.085], [0.185, -0.065], [0.19, 0.0], [0.18, 0.06]];
    else if (t === 'tee') low = [[0, -0.04], [0.11, -0.04], [0.168, -0.022], [0.182, 0.03]];
    else low = [[0, -0.03], [0.1, -0.03], [0.15, -0.015], [0.178, 0.03]];
    pr = low.concat([[0.178, 0.1], [0.162, 0.17], [0.14, 0.23], [0.1, 0.265], [0.075, 0.285], [0, 0.295]]);
    if (f !== 1) for (i = 0; i < pr.length; i++) if (pr[i][1] > 0.0 && pr[i][1] < 0.26) pr[i][0] *= f;
    return pr;
  }
  function torsoFold(t, skirt) {
    return function (a, y) {
      var w = sm(-0.04, 0.05, y) * (1 - sm(0.17, 0.25, y)), f;
      if (t === 'hoodie') f = Math.sin(5 * a + 2 * Math.sin(y * 14)) * 0.9 * w;
      else if (t === 'sweater') f = Math.sin(16 * a) * 0.35 * (1 - sm(0.02, 0.05, y)) + Math.sin(y * 85) * 0.14 * sm(0.04, 0.1, y);
      else if (t === 'baba') f = Math.sin(2 * a + 1) * 0.5 * w + Math.sin(7 * a) * 0.5 * (1 - sm(-0.07, 0.0, y)) * sm(-0.09, -0.06, y);
      else f = Math.sin(3 * a + y * 24) * 0.6 * w;
      if (skirt) f += Math.sin(a * 9) * 1.6 * (1 - sm(-0.02, 0.07, y)) * sm(-0.14, -0.1, y);
      return f;
    };
  }
  function torso(o) {
    var P = [], t = o.top, sh = o.shirt, ps = o.pants, pr = profile(o), skirt = o.bottom === 'skirt', s, k, y, th, cream = 0xfff3d6;
    function R(yy) { return X.profR(pr, yy); }
    var trim = t === 'sweater' ? lt(sh, 0.42) : (t === 'hoodie' ? dk(sh, 0.88) : lt(sh, 0.5));
    var ys = [0.012, 0.035, 0.06, 0.14, 0.152].concat(skirt ? [-0.1, 0.0] : []).concat(t === 'baba' ? [-0.06] : []).concat(t === 'sweater' ? [0.13, 0.145, 0.175, 0.19] : []);
    var colFn = function (x, yy, z) {
      if (skirt && yy < 0.06 && t !== 'overalls') return yy < -0.11 ? lt(ps, 0.3) : X.grad(ps, yy, -0.14, 0.06);
      if (t === 'overalls') {
        if (yy < 0.14) return (skirt && yy < -0.11) ? lt(ps, 0.3) : X.grad(ps, yy, -0.14, 0.14);
        if (yy < 0.152) return lt(ps, 0.45);
      }
      if (t === 'tee' && yy > 0.028 && yy < 0.038) return X.grad(lt(sh, 0.25), yy, 0, 0.04);
      if (t === 'tee' && yy <= 0.028) return X.grad(dk(sh, 0.94), yy, -0.04, 0.03);
      if (t === 'hoodie' && yy < 0.04) return X.grad(trim, yy, -0.03, 0.04);
      if (t === 'sweater' && yy < 0.04) return X.grad(trim, yy, -0.03, 0.04);
      if (t === 'sweater' && ((yy > 0.13 && yy < 0.145) || (yy > 0.175 && yy < 0.19))) return X.grad(lt(sh, 0.6), yy, 0.12, 0.2);
      if (t === 'baba' && yy < -0.06) return X.grad(0xfff3d6, yy, -0.09, -0.04);
      return X.grad(sh, yy, -0.07, 0.29);
    };
    P.push(folded(pr, ys, 10, colFn, torsoFold(t, skirt), 0.0085, 0.035));
    if (t === 'overalls') {
      P.push(part(X.sph8(), function (x, yy) { return X.grad(ps, yy, 0.1, 0.26); }, [0, 0.19, R(0.19) - 0.003], null, [0.1, 0.064, 0.03]));
      P.push(part(X.sph6(), lt(ps, 0.22), [0, 0.176, R(0.176) + 0.016], null, [0.045, 0.028, 0.009]));
      for (s = -1; s <= 1; s += 2) {
        P.push(part(X.sph6(), ps, [0.063 * s, 0.245, R(0.245) - 0.002], [0, 0, 0.1 * s], [0.021, 0.05, 0.015]));
        P.push(part(X.sph6(), ps, [0.085 * s, 0.27, -0.01], null, [0.022, 0.014, 0.075]));
        P.push(part(PIP, 0xe8b84a, [0.067 * s, 0.226, R(0.226) + 0.011], null, [0.014, 0.014, 0.008]));
      }
    } else if (t === 'tee') {
      P.push(part(new THREE.TorusGeometry(0.098, 0.022, 4, 9), lt(sh, 0.5), [0, 0.268, 0], [PI / 2, 0, 0]));
      P.push(part(X.sph6(), lt(sh, 0.22), [0.06, 0.165, R(0.165) + 0.002], null, [0.036, 0.032, 0.008]));
    } else if (t === 'hoodie') {
      P.push(part(X.sph6(), dk(sh, 0.88), [0, 0.065, R(0.065) - 0.002], null, [0.125, 0.05, 0.03]));
      P.push(part(new THREE.TorusGeometry(0.107, 0.042, 4, 9), dk(sh, 0.9), [0, 0.262, 0], [PI / 2, 0, 0]));
      P.push(part(X.sph8(), dk(sh, 0.84), [0, 0.215, -0.108], null, [0.105, 0.088, 0.062]));
      for (s = -1; s <= 1; s += 2) {
        P.push(part(PIP, cream, [0.036 * s, 0.195, R(0.195) + 0.004], [0, 0, 0.04 * s], [0.011, 0.06, 0.011]));
        P.push(part(PIP, 0xe0d2b4, [0.038 * s, 0.135, R(0.135) + 0.004], null, [0.014, 0.014, 0.014]));
      }
    } else if (t === 'sweater') {
      P.push(part(new THREE.TorusGeometry(0.1, 0.034, 4, 9), lt(sh, 0.42), [0, 0.265, 0], [PI / 2, 0, 0]));
    } else if (t === 'baba') {
      P.push(part(new THREE.TorusGeometry(0.097, 0.03, 4, 9), dk(sh, 0.86), [0, 0.262, 0], [PI / 2, 0, 0]));
      for (k = 0; k < 5; k++) {   // diagonal frog-knot button line from the collar to the right side
        y = 0.25 - k * 0.045; th = -0.12 - k * 0.22;
        P.push(part(PIP, cream, [R(y) * Math.sin(th), y, R(y) * Math.cos(th) + 0.004], null, [0.013, 0.013, 0.01]));
      }
      for (s = -1; s <= 1; s += 2) P.push(part(X.sph6(), dk(sh, 0.9), [0.1 * s, 0.03, R(0.03) - 0.006], [0, 0.5 * s, 0], [0.05, 0.05, 0.015]));
    }
    if (hasAcc(o, 'scarf')) {
      P.push(part(new THREE.TorusGeometry(0.122, 0.042, 4, 9), 0xe8736a, [0, 0.26, 0], [PI / 2, 0, 0]));
      var ST = [];   // hanging end of the scarf: own pivot at the knot (spring)
      ST.push(part(X.sph6(), 0xe8736a, [0.075, 0.17, R(0.17) + 0.02], [0, 0, 0.08], [0.04, 0.095, 0.016]));
      ST.push(part(PIP, 0xd9604f, [0.055, 0.2, R(0.2) + 0.028], [0, 0, -0.12], [0.036, 0.07, 0.014]));
      ST.push(part(X.sph6(), 0xfff1d6, [0.075, 0.11, R(0.11) + 0.026], [0, 0, 0.08], [0.04, 0.012, 0.016]));
      emit(P, ST, 'scarf', 'spine', [0.065, 0.25, R(0.25) + 0.02], 1);
    }
    if (hasAcc(o, 'backpack')) {
      var BP = [];   // backpack body: own pivot at the top (spring sway + bounce)
      BP.push(part(X.sph8(), 0xd9a05b, [0, 0.15, -0.215], null, [0.125, 0.115, 0.072]));
      BP.push(part(PIP, 0xb9803e, [0, 0.235, -0.21], null, [0.13, 0.05, 0.075]));
      BP.push(part(PIP, 0xb9803e, [0, 0.13, -0.282], null, [0.075, 0.05, 0.02]));
      BP.push(part(PIP, 0xf3d58a, [0, 0.215, -0.28], null, [0.016, 0.02, 0.01]));
      emit(P, BP, 'pack', 'spine', [0, 0.24, -0.2], 1);
      if (t !== 'overalls') for (s = -1; s <= 1; s += 2) P.push(part(X.sph6(), 0x8a5a3a, [0.078 * s, 0.17, R(0.17) + 0.006], null, [0.017, 0.1, 0.014]));
    }
    return merge(P);
  }

  function armFold(t) { return function (a, y) { return Math.sin(y * 70 + a * 2) * gs(y, -0.085, 0.05) * (t === 'hoodie' || t === 'sweater' ? 1.3 : 0.8); }; }
  function arm(o) {
    var t = o.top, sh = o.shirt, SK = o.skin, short = t === 'tee', cuff = short ? -0.095 : (t === 'overalls' ? -0.16 : -0.175), m = t === 'baba' ? 1.07 : (t === 'sweater' ? 1.05 : (t === 'hoodie' ? 1.03 : 1)), flare = t === 'baba' ? 1.2 : 1;
    var pr = [[0, 0.058], [0.032 * m, 0.05], [0.055 * m, 0.025], [0.059 * m, 0.0], [(short ? 0.05 : 0.052) * m, cuff + 0.03], [0.056 * m * flare, cuff + 0.004],
      [0.04, cuff - 0.012], [0.04, -0.17], [0.056, -0.205], [0.058, -0.235], [0.03, -0.263], [0, -0.27]];
    var band = t === 'sweater' ? lt(sh, 0.42) : (t === 'hoodie' ? dk(sh, 0.86) : (t === 'baba' ? 0xfff3d6 : (t === 'overalls' ? lt(sh, 0.4) : lt(sh, 0.5))));
    var colFn = function (x, y, z) {
      if (y < cuff) return X.grad(SK, y, -0.27, 0.05);
      if (y < cuff + 0.026) return X.grad(band, y, -0.27, 0.06);
      return X.grad(sh, y, -0.27, 0.06);
    };
    return merge([folded(pr, [cuff + 0.004, cuff + 0.026], 8, colFn, armFold(t), 0.006, 0.045)]);
  }

  function leg(o) {
    var b = o.bottom, P = o.pants, SK = o.skin, BO = o.boots, SOLE = 0xf3e8d0, cut = b === 'shorts' ? -0.12 : (b === 'skirt' ? 1 : -9), parts = [], long = b === 'pants';
    var lg = [[0.045, 0.04], [0.07, 0.0], [0.064, -0.1], [0.062, -0.118], [long ? 0.072 : 0.058, -0.124], [long ? 0.072 : 0.058, -0.152], [0.04, -0.158], [0, -0.16]];
    parts.push(X.lathe(lg, [-0.12], 8, function (x, y, z) {
      if (long) { if (y < -0.122 && y > -0.152) return X.grad(lt(P, 0.28), y, -0.16, 0.04); return X.grad(P, y, -0.16, 0.04); }
      if (b === 'shorts' && y > cut) return X.grad(P, y, -0.16, 0.04);
      if (y < -0.108) return X.grad(0xfff6e6, y, -0.16, -0.1);   // sock
      return X.grad(SK, y, -0.16, 0.04);
    }));
    var shoe = [[0, -0.24], [0.06, -0.24], [0.075, -0.235], [0.08, -0.22], [0.07, -0.19], [0.062, -0.155], [0.056, -0.138], [0.058, -0.13], [0, -0.128]];
    parts.push(X.lathe(shoe, [-0.21], 8, function (x, y, z) {
      if (y < -0.214) return X.grad(SOLE, y, -0.24, -0.213);
      if (y > -0.15) return X.grad(lt(BO, 0.3), y, -0.15, -0.128);
      if (z > 0.075 && y < -0.19) return X.grad(lt(BO, 0.16), y, -0.22, -0.14);
      return X.grad(BO, y, -0.22, -0.14);
    }, [0, 0, 0.035], [1, 1, 1.45]));
    return merge(parts);
  }

  G.CharKit = { head: head, headSplit: headSplit, torsoSplit: torsoSplit, bun: bun, torso: torso, arm: arm, leg: leg, hat: hat, lowY: function (o) { return profile(o)[0][1]; }, version: 1 };
}());
