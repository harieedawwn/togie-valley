/* Togie Valley - models.js
 * Procedural models (vertex-colored, toon-shaded, outlined): chibi character rig + procedural animation,
 * ground patch, tree, cube house with roof, tile cursor.
 * Conventions: 1 tile = 1 unit, y up, characters face +z (character's left = +x).
 * Depends on: THREE r128, core.js, render.js.
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || !window.Game || !window.Game.Render || !window.Game.HeadModel) {
    console.error('[models] THREE, render.js or head_model.js missing');
    return;
  }

  var Game = window.Game, Render = Game.Render, util = Game.util;
  var Models = Game.Models = {};

  /* ----------------------------------------------------------------- helpers */
  var _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
  var _col = new THREE.Color();

  // part(geometry, color, position[x,y,z], rotation[rx,ry,rz], scale[sx,sy,sz]); color = hex | Color | fn(x,y,z)
  function part(geo, color, p, r, s) {
    var m = new THREE.Matrix4();
    _E.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, 'XYZ');
    _Q.setFromEuler(_E);
    _P.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
    _S.set(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1);
    m.compose(_P, _Q, _S);
    return { geo: geo, color: color, matrix: m };
  }

  function colorAt(c, x, y, z) {
    if (typeof c === 'function') c = c(x, y, z);
    if (c && c.isColor) return c;
    return _col.set(c);
  }

  // Bake parts (transform + color) into one non-indexed BufferGeometry with position/normal/color/smoothNormal.
  function mergeParts(parts) {
    var pos = [], nor = [], col = [];
    for (var k = 0; k < parts.length; k++) {
      var pt = parts[k];
      var g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
      g.applyMatrix4(pt.matrix);
      var p = g.attributes.position, n = g.attributes.normal, gc = pt.color === 'vertex' ? g.attributes.color : null;   // 'vertex' = geometry carries its own colours (head decals)
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        pos.push(x, y, z);
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        if (gc) col.push(gc.getX(i), gc.getY(i), gc.getZ(i));
        else { var c = colorAt(pt.color, x, y, z); col.push(c.r, c.g, c.b); }
      }
      g.dispose();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    Render.addSmoothNormals(geo);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
  Models.part = part;
  Models.mergeParts = mergeParts;

  var geoCache = Object.create(null);
  function cached(key, build) { return geoCache[key] || (geoCache[key] = build()); }

  // Shared materials (created lazily). Same-uniform sharing keeps draw state changes low.
  var mats = Object.create(null);
  function mat(name) {
    if (mats[name]) return mats[name];
    switch (name) {
      case 'char': mats[name] = Render.toonMaterial({ seasonal: 0.08, halftone: false, rim: 0.75 }); break;   // stage 20: no dot pattern on hair / skin / clothes
      case 'prop': mats[name] = Render.toonMaterial({ seasonal: 0, fade: true, rim: 0.5 }); break;          // Stage 10.7: see-through when between camera and hero
      case 'foliage': mats[name] = Render.toonMaterial({ seasonal: 0.85, fade: true, halftone: false, rim: 0.35 }); break;   // dots only on terrain + buildings
      case 'ground': mats[name] = Render.toonMaterial({ seasonal: 1 }); break;
      case 'flat': mats[name] = Render.toonMaterial({ seasonal: 0, halftone: false }); break;
      default: mats[name] = Render.toonMaterial({});
    }
    return mats[name];
  }
  Models.material = mat;

  function mix(a, b, t) { return _col.set(a).lerp(new THREE.Color(b), util.clamp(t, 0, 1)); }

  /* --------------------------------------------------------------- animation */
  var KEYS = ['bob', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'headRX', 'headRY', 'headRZ',
    'armLX', 'armLZ', 'armRX', 'armRZ', 'legLX', 'legRX'];
  // Pose values (radians; swing X values: positive = forward; armLZ/armRZ: positive = outward; bob in world units).

  var LEG = 0.24;        // leg length = hips height
  var TORSO_H = 0.28;

  var Anim = Models.Anim = {
    KEYS: KEYS,
    newPose: function () {
      var p = {};
      for (var i = 0; i < KEYS.length; i++) p[KEYS[i]] = 0;
      return p;
    },
    reset: function (p) { for (var i = 0; i < KEYS.length; i++) p[KEYS[i]] = 0; return p; },

    // t = time in seconds
    idle: function (p, t) {
      Anim.reset(p);
      var b = Math.sin(t * 2.0);
      p.bob = b * 0.006;
      p.spineRX = b * 0.015;
      p.headRX = -b * 0.012 + Math.sin(t * 0.6) * 0.02;
      p.headRY = Math.sin(t * 0.45) * 0.12;
      p.headRZ = Math.sin(t * 0.9) * 0.03;
      p.armLZ = 0.07 + b * 0.015;
      p.armRZ = 0.07 - b * 0.015;
      p.armLX = Math.sin(t * 1.3) * 0.03;
      p.armRX = -Math.sin(t * 1.3) * 0.03;
      return p;
    },

    // Stride data (stage 17): leg swing amplitude [walk, run] (rad), distance per full cycle [walk, run], swing-foot lift [walk, run] (joint offset), cross-fade rate (1/s, about 0.12 s to 95 %).
    SWING: [0.85, 1.2], CYCLE: [0.82, 1.15], LIFT: [0.03, 0.058], FADE: 24,
    TRI: 0.9,
    swing: function (s) { return (1 - Anim.TRI) * s + Anim.TRI * (0.63662 * Math.asin(s)); },   // s = sin(phase) -> sine/triangle blend in [-1, 1]
    // ph = walk phase (radians, one full cycle = two steps)
    walk: function (p, ph) {
      Anim.reset(p);
      var s = Math.sin(ph), c = Math.cos(ph), A = Anim.SWING[0], w = Anim.swing(s);   // w = leg angle waveform (sine blended with a triangle: near-constant foot speed in stance)
      p.legLX = w * A; p.legRX = -w * A;
      p.armLX = -s * 0.6; p.armRX = s * 0.6;
      p.armLZ = 0.10; p.armRZ = 0.10;
      p.bob = -LEG * (1 - Math.cos(A * Math.abs(w)));
      p.hipsRY = s * 0.10; p.spineRY = -s * 0.14;
      p.hipsRZ = c * 0.03; p.spineRZ = -c * 0.03;
      p.spineRX = 0.07; p.headRX = -0.05; p.headRY = s * 0.04;
      return p;
    },

    run: function (p, ph) {
      Anim.reset(p);
      var s = Math.sin(ph), c = Math.cos(ph), A = Anim.SWING[1], w = Anim.swing(s);
      p.legLX = w * A; p.legRX = -w * A;
      p.armLX = -s * 1.0; p.armRX = s * 1.0;
      p.armLZ = 0.25; p.armRZ = 0.25;
      p.bob = -LEG * (1 - Math.cos(A * Math.abs(w))) * 0.8 + 0.05 * (1 - Math.abs(s));
      p.hipsRY = s * 0.18; p.spineRY = -s * 0.25;
      p.hipsRZ = c * 0.04; p.spineRZ = -c * 0.04;
      p.spineRX = 0.2; p.headRX = -0.15; p.headRY = s * 0.06;
      return p;
    },

    // out = sum(poses[i] * weights[i])
    blend: function (out, poses, weights) {
      if (poses.length === 3) {   // fast path (idle / walk / run)
        var a = poses[0], b = poses[1], c = poses[2], w0 = weights[0], w1 = weights[1], w2 = weights[2], q;
        for (var m = 0; m < KEYS.length; m++) { q = KEYS[m]; out[q] = a[q] * w0 + b[q] * w1 + c[q] * w2; }
        return out;
      }
      for (var i = 0; i < KEYS.length; i++) {
        var k = KEYS[i], v = 0;
        for (var j = 0; j < poses.length; j++) v += poses[j][k] * weights[j];
        out[k] = v;
      }
      return out;
    },

    // Write a pose onto the character's joints.
    apply: function (ch, p) {
      var J = ch.joints;
      J.hips.position.y = LEG + p.bob;
      J.hips.rotation.set(0, p.hipsRY, p.hipsRZ);
      J.spine.rotation.set(p.spineRX, p.spineRY, p.spineRZ);
      J.head.rotation.set(p.headRX, p.headRY, p.headRZ);
      J.shoulderL.rotation.set(-p.armLX, 0, p.armLZ);
      J.shoulderR.rotation.set(-p.armRX, 0, -p.armRZ);
      J.hipL.rotation.set(-p.legLX, 0, 0);
      J.hipR.rotation.set(-p.legRX, 0, 0);
    },

    // Advance a character's animation. speed = ground speed in units/s (0 idle, ~2 walk, ~4+ run).
    update: function (ch, dt, speed) {
      var A = ch.anim;
      var runT = util.smoothstep(2.9, 3.7, speed);
      var walkT = util.smoothstep(0.15, 0.7, speed) * (1 - runT);
      var idleT = Math.max(0, 1 - walkT - runT);
      var k = 1 - Math.exp(-Anim.FADE * dt);
      A.w[0] += (idleT - A.w[0]) * k;
      A.w[1] += (walkT - A.w[1]) * k;
      A.w[2] += (runT - A.w[2]) * k;
      A.t += dt;
      var cycle = util.lerp(Anim.CYCLE[0], Anim.CYCLE[1], runT);   // distance per full cycle (two steps)
      A.phase += dt * (speed / cycle) * Math.PI * 2;
      if (A.w[0] > 0.002) Anim.idle(A.p0, A.t); else if (A.w[0] !== 0) { A.w[0] = 0; Anim.reset(A.p0); }   // skip the poses that carry no weight (saves most of the per-frame cost)
      if (A.w[1] > 0.002) Anim.walk(A.p1, A.phase); else if (A.w[1] !== 0) { A.w[1] = 0; Anim.reset(A.p1); }
      if (A.w[2] > 0.002) Anim.run(A.p2, A.phase); else if (A.w[2] !== 0) { A.w[2] = 0; Anim.reset(A.p2); }
      Anim.blend(A.pose, A.poses, A.w);
      if (!A.defer) Anim.apply(ch, A.pose);   // defer: the owner (CharAnim, for the hero) applies the final pose once per frame
      // swing foot lifts (joint offset, zero at foot contact: phase +-90 deg)
      var lw = A.w[1] * Anim.LIFT[0] + A.w[2] * Anim.LIFT[1], cp = Math.cos(A.phase), J = ch.joints;
      J.hipL.position.y = cp > 0 ? lw * cp * cp : 0; J.hipR.position.y = cp < 0 ? lw * cp * cp : 0;
    }
  };

  /* --------------------------------------------------------------- character */
  // Round 2 stage 2: look options (nose, acc[], top, bottom, hair styles, hats) extend the old options; old callers keep today's look.
  // Every new part is merged into the existing meshes (torso/head/face/arms/legs); only the hat (spring pivot) and the bun (swing pivot) stay separate.
  var CHAR_DEFAULTS = {
    skin: 0xf6cfa8, hair: 0x6b3f2a, shirt: 0x6fb6e8, pants: 0x4f6fa8, boots: 0x6b4a33,
    belt: 0x8a5a3a, eyes: 0x2b2233, hairStyle: 'bun', hat: null, scale: 1, shadow: true,
    nose: 'none', acc: [], top: 'overalls', bottom: 'pants'
  };
  var LOOK_KEYS = ['skin', 'hair', 'eyes', 'shirt', 'pants', 'hairStyle', 'hat', 'nose', 'acc', 'top', 'bottom'];
  // Hair-hiding rules. With a hat the hair cap is a little smaller (never cut: bed_sleep hides the hat), and bun / ponytail move
  // below the hat edge. Head-top accessories (bow, headband, cat ears) never coexist with a hat (Game.Look.validate).
  var BUN_Y = { none: 0.25, straw: 0.15, la: 0.12, beret: 0.06, beanie: 0.06, cap: 0.06 };
  var WHITE = new THREE.Color(0xffffff);
  function dk(c, k) { return new THREE.Color(c).multiplyScalar(k); }
  function lt(c, k) { return new THREE.Color(c).lerp(WHITE, k); }
  function hasAcc(o, a) { return o.acc && o.acc.indexOf(a) >= 0; }
  function headAccKey(o) { var s = '', i, l = ['flower', 'bow', 'headband', 'catear']; for (i = 0; i < l.length; i++) if (hasAcc(o, l[i])) s += l[i].charAt(0) + l[i].length; return s; }

  var G_SPH = null, G_BOX = null, G_SPH8 = null, G_SPH6 = null, HM = Game.HeadModel;
  function sph() { return G_SPH || (G_SPH = new THREE.SphereGeometry(1, 10, 8)); }
  function sph8() { return G_SPH8 || (G_SPH8 = new THREE.SphereGeometry(1, 8, 6)); }
  function box() { return G_BOX || (G_BOX = new THREE.BoxGeometry(1, 1, 1)); }
  function flowerParts(parts, p, n, col) {   // 5 petals + centre on a surface point p with outward normal n
    var ux = n[2], uy = 0, uz = -n[0], l = Math.sqrt(ux * ux + uz * uz) || 1, vx, vy, vz, k, a;
    ux /= l; uz /= l;
    vx = n[1] * uz - n[2] * uy; vy = n[2] * ux - n[0] * uz; vz = n[0] * uy - n[1] * ux;
    for (k = 0; k < 5; k++) {
      a = k * Math.PI * 2 / 5;
      parts.push(part(sph(), col, [p[0] + n[0] * 0.012 + 0.042 * (Math.cos(a) * ux + Math.sin(a) * vx), p[1] + n[1] * 0.012 + 0.042 * (Math.cos(a) * uy + Math.sin(a) * vy), p[2] + n[2] * 0.012 + 0.042 * (Math.cos(a) * uz + Math.sin(a) * vz)], null, [0.03, 0.03, 0.03]));
    }
    parts.push(part(sph(), 0xffd54f, [p[0] + n[0] * 0.022, p[1] + n[1] * 0.022, p[2] + n[2] * 0.022], null, [0.026, 0.026, 0.026]));
  }
  function buildHead(o) {
    if (Game.CharKit) return Game.CharKit.head(o);   // stage 16: designed hair / head accessories
    var parts = [], hat = !!o.hat, hs = o.hairStyle, tie = 0xf4a0b5, hf = HM.hairFn(o.hair), i, s, y0, q, g = HM.hairOff(hat);
    parts.push(HM.skinPart(o.skin));
    if (hs !== 'bob' && hs !== 'long' && hs !== 'twin') for (i = 0, q = HM.earParts(o.skin); i < q.length; i++) parts.push(q[i]);   // long styles cover the ears
    parts.push(HM.hairPart(o.hair, hs, hat));
    if (hs === 'pony') {
      q = HM.point(Math.PI, hat ? -0.02 : 0.3, g + 0.012); y0 = q.p;
      parts.push(part(sph8(), tie, y0, null, [0.04, 0.04, 0.04]));
      parts.push(part(sph8(), hf, [0, y0[1] - 0.06, y0[2] - 0.045], null, [0.07, 0.09, 0.065]));
      parts.push(part(sph8(), hf, [0, y0[1] - 0.15, y0[2] - 0.06], null, [0.062, 0.1, 0.058]));
      parts.push(part(sph8(), hf, [0, y0[1] - 0.24, y0[2] - 0.06], null, [0.048, 0.08, 0.044]));
    } else if (hs === 'twin') {
      for (s = -1; s <= 1; s += 2) {
        q = HM.point(s * 1.5, 0.45, g + 0.008).p;
        parts.push(part(sph8(), tie, q, null, [0.035, 0.035, 0.035]));
        parts.push(part(sph8(), hf, [q[0] + 0.025 * s, q[1] - 0.075, q[2]], null, [0.075, 0.085, 0.075]));
        parts.push(part(sph8(), hf, [q[0] + 0.035 * s, q[1] - 0.165, q[2]], null, [0.07, 0.085, 0.07]));
        parts.push(part(sph8(), hf, [q[0] + 0.035 * s, q[1] - 0.25, q[2]], null, [0.05, 0.065, 0.05]));
      }
    }
    if (hasAcc(o, 'flower')) { q = HM.point(0.95, 0.35, g + 0.004); flowerParts(parts, q.p, q.n, 0xffb7c5); }
    if (hasAcc(o, 'bow')) {
      var bc = 0xf08aa8, bp = HM.point(0.55, 1.0, g + 0.012).p;
      parts.push(part(sph(), bc, bp, [0, 0, 0.4], [0.075, 0.045, 0.035]));
      parts.push(part(sph(), bc, [bp[0] + 0.055, bp[1] + 0.022, bp[2]], [0, 0, 0.4], [0.07, 0.045, 0.03]));
      parts.push(part(sph(), bc, [bp[0] - 0.055, bp[1] - 0.022, bp[2]], [0, 0, 0.4], [0.07, 0.045, 0.03]));
      parts.push(part(sph(), dk(bc, 0.85), [bp[0], bp[1], bp[2] + 0.015], null, [0.034, 0.034, 0.034]));
    }
    if (hasAcc(o, 'headband') || hasAcc(o, 'catear')) {
      var cat = hasAcc(o, 'catear'), hc = cat ? 0xf3c9d8 : 0xf2a6c0;
      parts.push(part(new THREE.TorusGeometry(0.285, 0.02, 8, 24, Math.PI), hc, [0, HM.CY, -0.01], [-0.25, 0, 0], [1, 0.88, 1]));
      if (cat) {
        for (s = -1; s <= 1; s += 2) {
          parts.push(part(new THREE.ConeGeometry(0.07, 0.15, 3), hc, [0.15 * s, 0.485, -0.05], [0, 0, -0.28 * s]));
          parts.push(part(new THREE.ConeGeometry(0.036, 0.09, 3), 0xf08aa8, [0.15 * s, 0.485, -0.03], [0, 0, -0.28 * s]));
        }
      }
    }
    return mergeParts(parts);
  }

  // Hair bun is a separate mesh (pivot at the back of the head) so CharAnim can swing it.
  function buildBun(o) {
    if (Game.CharKit) return Game.CharKit.bun(o);
    return mergeParts([part(new THREE.SphereGeometry(0.105, 12, 10), HM.hairFn(o.hair), [0, 0.04, -0.025])]);
  }

  function buildFace(o) { return mergeParts(HM.faceParts(o)); }

  /* Round 3 stage 15C: body parts are lathe shapes (rounded, no boxes) with vertex-colour gradients (darker low, lighter high).
   * Joint positions, attach points and part names are unchanged; only the geometry inside each joint changed. */
  var _gc = new THREE.Color();
  function sph6() { return G_SPH6 || (G_SPH6 = new THREE.SphereGeometry(1, 6, 4)); }
  function grad(c, y, y0, y1) { return _gc.set(c).multiplyScalar(0.76 + 0.24 * Math.max(0, Math.min(1, (y - y0) / (y1 - y0)))); }
  function profR(pr, y) {   // radius of a [r,y] profile (ascending y) at height y
    for (var i = 1; i < pr.length; i++) if (y <= pr[i][1]) { var a = pr[i - 1], b = pr[i], t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; }
    return pr[pr.length - 1][0];
  }
  function lathePart(pr, ys, segs, color, p, s) {   // extra rings at ys so vertex-colour bands stay crisp
    var out = pr.slice().sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; }), i, lo = out[0][1], hi = out[out.length - 1][1];
    pr = out.slice();
    for (i = 0; i < ys.length; i++) if (ys[i] > lo && ys[i] < hi) out.push([profR(pr, ys[i]), ys[i]]);
    out.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    var pts = [];
    for (i = 0; i < out.length; i++) pts.push(new THREE.Vector2(out[i][0], out[i][1]));
    return part(new THREE.LatheGeometry(pts, segs), color, p, null, s);
  }
  function torsoProfile(o) {
    var t = o.top, f = t === 'hoodie' ? 1.05 : (t === 'sweater' ? 1.07 : 1), low, i, pr;
    if (o.bottom === 'skirt') low = [[0, -0.13], [0.24, -0.13], [0.27, -0.115], [0.25, -0.06], [0.2, 0.0], [0.178, 0.06]];
    else if (t === 'baba') low = [[0, -0.07], [0.13, -0.07], [0.17, -0.05], [0.185, 0.0], [0.18, 0.06]];
    else low = [[0, -0.03], [0.1, -0.03], [0.15, -0.015], [0.178, 0.03]];
    pr = low.concat([[0.178, 0.1], [0.162, 0.17], [0.14, 0.23], [0.1, 0.265], [0.075, 0.285], [0, 0.295]]);
    if (f !== 1) for (i = 0; i < pr.length; i++) if (pr[i][1] > 0.0 && pr[i][1] < 0.26) pr[i][0] *= f;
    return pr;
  }
  function buildTorso(o) {
    if (Game.CharKit) return Game.CharKit.torso(o);
    var parts = [], H = TORSO_H, t = o.top, sh = o.shirt, ps = o.pants, pr = torsoProfile(o), k, s, skirt = o.bottom === 'skirt', beltBand = (t === 'overalls' || t === 'tee') && !skirt;
    function R(y) { return profR(pr, y); }
    var hem = t === 'sweater' ? lt(sh, 0.4) : null;
    var colFn = function (x, y) {
      if (skirt && y < 0.06) return y < -0.1 ? lt(ps, 0.3) : grad(ps, y, -0.13, 0.06);
      if (beltBand && y > 0.012 && y < 0.06) return grad(o.belt, y, 0, 0.06);
      if (hem && y < 0.035) return grad(hem, y, -0.03, 0.035);
      return grad(sh, y, -0.07, 0.29);
    };
    parts.push(lathePart(pr, [0.012, 0.06].concat(hem ? [0.035] : []).concat(skirt ? [-0.1] : []), 12, colFn));
    if (t === 'overalls') {
      parts.push(part(sph8(), function (x, y) { return grad(ps, y, 0.08, 0.25); }, [0, 0.165, R(0.165) - 0.004], null, [0.1, 0.082, 0.032]));
      for (s = -1; s <= 1; s += 2) parts.push(part(sph6(), ps, [0.062 * s, 0.215, R(0.215) - 0.002], [0, 0, 0.12 * s], [0.02, 0.07, 0.02]));
    } else if (t === 'hoodie') {
      parts.push(part(sph8(), dk(sh, 0.9), [0, 0.07, R(0.07) - 0.004], null, [0.12, 0.05, 0.03]));
      parts.push(part(new THREE.TorusGeometry(0.105, 0.04, 6, 12), dk(sh, 0.92), [0, 0.262, 0], [Math.PI / 2, 0, 0]));
      parts.push(part(sph8(), dk(sh, 0.88), [0, 0.215, -0.11], null, [0.1, 0.085, 0.06]));
      parts.push(part(sph6(), 0xfff6e6, [0.035, 0.2, R(0.2) + 0.002], null, [0.011, 0.06, 0.011]));
      parts.push(part(sph6(), 0xfff6e6, [-0.035, 0.2, R(0.2) + 0.002], null, [0.011, 0.06, 0.011]));
    } else if (t === 'sweater') {
      parts.push(part(new THREE.TorusGeometry(0.1, 0.03, 6, 12), lt(sh, 0.4), [0, 0.265, 0], [Math.PI / 2, 0, 0]));
    } else if (t === 'baba') {
      for (k = 0; k < 5; k++) parts.push(part(sph6(), 0xfff3d6, [0, 0.25 - k * 0.06, R(0.25 - k * 0.06) + 0.004], null, [0.014, 0.014, 0.012]));
      parts.push(part(new THREE.TorusGeometry(0.095, 0.03, 6, 12), dk(sh, 0.9), [0, 0.262, 0], [Math.PI / 2, 0, 0]));
      for (s = -1; s <= 1; s += 2) parts.push(part(sph8(), dk(sh, 0.92), [0.095 * s, 0.03, R(0.03) - 0.006], [0, 0.5 * s, 0], [0.05, 0.05, 0.016]));
    }
    if (hasAcc(o, 'scarf')) {
      parts.push(part(new THREE.TorusGeometry(0.118, 0.04, 8, 14), 0xe8736a, [0, 0.262, 0], [Math.PI / 2, 0, 0]));
      parts.push(part(box(), 0xe8736a, [0.08, 0.17, R(0.17) + 0.016], [0, 0, 0.08], [0.075, 0.17, 0.03]));
      parts.push(part(box(), 0xfff1d6, [0.08, 0.1, R(0.1) + 0.02], [0, 0, 0.08], [0.077, 0.02, 0.032]));
    }
    if (hasAcc(o, 'backpack')) {
      parts.push(part(box(), 0xd9a05b, [0, 0.12, -0.2], null, [0.21, 0.18, 0.09]));
      parts.push(part(box(), 0xb9803e, [0, 0.205, -0.2], null, [0.215, 0.03, 0.095]));
      parts.push(part(box(), 0xb9803e, [0, 0.1, -0.255], null, [0.13, 0.08, 0.03]));
      if (t !== 'overalls') for (s = -1; s <= 1; s += 2) parts.push(part(sph6(), 0x8a5a3a, [0.075 * s, 0.17, R(0.17) + 0.004], null, [0.016, 0.1, 0.014]));
    }
    return mergeParts(parts);
  }

  function buildLeg(o) {
    if (Game.CharKit) return Game.CharKit.leg(o);
    var b = o.bottom, parts = [], P = o.pants, SK = o.skin, BO = o.boots, SOLE = 0xf3e8d0, cut = b === 'shorts' ? -0.12 : (b === 'skirt' ? 1 : -9);
    var leg = [[0, 0.045], [0.045, 0.04], [0.07, 0.0], [0.064, -0.1], [0.058, -0.15], [0.04, -0.158], [0, -0.16]];
    parts.push(lathePart(leg, [-0.117, -0.123], 8, function (x, y) {
      if (y > cut && b !== 'skirt') return grad(P, y, -0.16, 0.04);
      return grad(SK, y, -0.16, 0.04);
    }));
    var shoe = [[0, -0.24], [0.06, -0.24], [0.075, -0.235], [0.08, -0.226], [0.08, -0.213], [0.07, -0.19], [0.062, -0.155], [0.052, -0.14], [0, -0.13]];
    parts.push(lathePart(shoe, [-0.217, -0.21], 8, function (x, y) { return y < -0.214 ? grad(SOLE, y, -0.24, -0.213) : grad(BO, y, -0.22, -0.14); }, [0, 0, 0.035], [1, 1, 1.45]));
    return mergeParts(parts);
  }

  function buildArm(o) {
    if (Game.CharKit) return Game.CharKit.arm(o);
    var t = o.top, sh = o.shirt, SK = o.skin, short = t === 'tee', cuff = short ? -0.1 : -0.175, m = t === 'baba' ? 1.07 : (t === 'sweater' ? 1.04 : 1), parts = [];
    var pr = [[0, 0.058], [0.032 * m, 0.05], [0.055 * m, 0.025], [0.059 * m, 0.0], [short ? 0.047 : 0.05 * m, cuff + 0.01],
      [0.04, cuff - 0.012], [0.04, -0.17], [0.05, -0.19], [0.06, -0.215], [0.056, -0.245], [0.035, -0.262], [0, -0.27]];
    var band = t === 'sweater' ? lt(sh, 0.4) : (t === 'hoodie' ? dk(sh, 0.9) : null);
    parts.push(lathePart(pr, [cuff + 0.004, cuff - 0.004, cuff + 0.022], 8, function (x, y) {
      if (y < cuff) return grad(SK, y, -0.27, 0.05);
      if (band && y < cuff + 0.025) return grad(band, y, -0.27, 0.06);
      return grad(sh, y, -0.27, 0.06);
    }));
    return mergeParts(parts);
  }

  var HAT_K = [0.85, 0.8, 0.85], HAT_FIT = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.21 - 0.25 * HAT_K[1], 0), new THREE.Quaternion(), new THREE.Vector3(HAT_K[0], HAT_K[1], HAT_K[2]));
  function buildHat(id) {
    if (Game.CharKit) return Game.CharKit.hat(id);   // modelled in head space (no HAT_FIT)
    var parts = [], s;
    if (id === 'straw') {
      parts.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 20, 1), 0xe8c872, [0, 0.46, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.25, 0.29, 0.2, 16, 1), 0xe8c872, [0, 0.55, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.295, 0.295, 0.05, 16, 1), 0xc24d3b, [0, 0.485, 0]));
    } else if (id === 'la') {
      parts.push(part(new THREE.ConeGeometry(0.47, 0.3, 20, 1), 0xf3e2b0, [0, 0.56, 0]));
      parts.push(part(new THREE.TorusGeometry(0.465, 0.014, 6, 24), 0xd8b872, [0, 0.412, 0], [Math.PI / 2, 0, 0]));
      parts.push(part(sph(), 0xd8b872, [0, 0.715, 0], null, [0.028, 0.028, 0.028]));
    } else if (id === 'beret') {
      parts.push(part(new THREE.SphereGeometry(0.36, 16, 10), 0xe58aa8, [0, 0.545, -0.02], [0, 0, 0.14], [1, 0.38, 1]));
      parts.push(part(new THREE.CylinderGeometry(0.014, 0.02, 0.05, 6, 1), 0xb85a78, [0.012, 0.69, -0.02]));
    } else if (id === 'beanie') {
      var m = [0, 0.255, -0.012], r = [-0.22, 0, 0], sc = [1, 0.98, 1.04];
      parts.push(part(new THREE.SphereGeometry(0.345, 16, 10, 0, Math.PI * 2, 0, 1.3), 0xf08a7e, m, r, sc));
      parts.push(part(new THREE.SphereGeometry(0.352, 16, 4, 0, Math.PI * 2, 0.98, 0.32), lt(0xf08a7e, 0.4), m, r, sc));
      parts.push(part(sph(), 0xfff6e6, [0, 0.64, -0.04], null, [0.065, 0.065, 0.065]));
    } else if (id === 'cap') {
      parts.push(part(new THREE.SphereGeometry(0.335, 16, 10, 0, Math.PI * 2, 0, 1.45), 0x6fc2b8, [0, 0.29, -0.01], [-0.12, 0, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.022, 14, 1, false, -Math.PI / 2, Math.PI), 0x4f9f96, [0, 0.345, 0.3], [0.12, 0, 0]));
      parts.push(part(sph(), 0x4f9f96, [0, 0.625, -0.04], null, [0.025, 0.025, 0.025]));
    }
    for (s = 0; s < parts.length; s++) parts[s].matrix.premultiply(HAT_FIT);   // hats were modelled for the old, bigger head
    return mergeParts(parts);
  }

  Models.kit = { lathe: lathePart, grad: grad, profR: profR, dk: dk, lt: lt, hasAcc: hasAcc, sph8: sph8, sph6: sph6, sph: sph, box: box };   // shared with char_kit.js

  function addMesh(parent, geo, outline, thin) {
    var m = new THREE.Mesh(geo, mat('char'));
    if (outline) Render.addOutline(m, thin);
    parent.add(m);
    return m;
  }
  function setGeo(mesh, geo) { mesh.geometry = geo; if (mesh.userData.outline) mesh.userData.outline.geometry = geo; }

  // opts: skin, hair, shirt, pants, boots, belt, eyes, hairStyle, hat (null|'straw'|'la'|'beret'|'beanie'|'cap'), nose, acc[], top, bottom, scale, shadow.
  // opts.look (Game.Look.resolve output) overrides the same keys. ch.setLook(resolved) swaps the look on the live rig (attachments stay).
  Models.character = function (opts) {
    var o = {}, k, src = opts && opts.look;
    for (k in CHAR_DEFAULTS) o[k] = (src && src[k] !== undefined) ? src[k] : ((opts && opts[k] !== undefined) ? opts[k] : CHAR_DEFAULTS[k]);
    if (o.hat === 'none') o.hat = null;

    var root = new THREE.Group(); root.name = 'character';
    var hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = LEG; root.add(hips);
    var spine = new THREE.Group(); spine.name = 'spine'; hips.add(spine);
    var head = new THREE.Group(); head.name = 'head'; head.position.y = TORSO_H; spine.add(head);
    var shoulderL = new THREE.Group(); shoulderL.name = 'shoulderL'; shoulderL.position.set(0.19, 0.24, 0); spine.add(shoulderL);
    var shoulderR = new THREE.Group(); shoulderR.name = 'shoulderR'; shoulderR.position.set(-0.19, 0.24, 0); spine.add(shoulderR);
    var hipL = new THREE.Group(); hipL.name = 'hipL'; hipL.position.set(0.09, 0, 0); hips.add(hipL);
    var hipR = new THREE.Group(); hipR.name = 'hipR'; hipR.position.set(-0.09, 0, 0); hips.add(hipR);

    var empty = new THREE.BufferGeometry();   // placeholder until build(); needs real (empty) attributes so Render.addOutline can read position.count
    empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3)); empty.setAttribute('normal', new THREE.Float32BufferAttribute([], 3)); empty.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    var torso = addMesh(spine, empty, true);
    var headMesh = addMesh(head, empty, true);
    var face = addMesh(head, empty, false);
    var armL = addMesh(shoulderL, empty, true, true);
    var armR = addMesh(shoulderR, empty, true, true);
    var legL = addMesh(hipL, empty, true, true);
    var legR = addMesh(hipR, empty, true, true);

    var attach = {
      hat: new THREE.Group(), handL: new THREE.Group(), handR: new THREE.Group(), back: new THREE.Group()
    };
    attach.hat.name = 'attachHat'; head.add(attach.hat);
    attach.handL.name = 'attachHandL'; attach.handL.position.set(0, -0.215, 0); shoulderL.add(attach.handL);
    attach.handR.name = 'attachHandR'; attach.handR.position.set(0, -0.215, 0); shoulderR.add(attach.handR);
    attach.back.name = 'attachBack'; attach.back.position.set(0, 0.15, -0.18); spine.add(attach.back);

    // Spring parts (stage 17): pooled pivot groups with one mesh each (slots reused when the look changes). Game.CharSec drives them.
    var fx = [];
    function fxApply(items) {
      var i, j, sl, it;
      for (j = 0; j < fx.length; j++) { fx[j].on = false; fx[j].g.visible = false; }
      for (i = 0; i < items.length; i++) {
        it = items[i]; sl = null;
        for (j = 0; j < fx.length; j++) if (!fx[j].on && fx[j].host === it.host) { sl = fx[j]; break; }
        if (!sl) {
          sl = { g: new THREE.Group(), host: it.host, on: false, mesh: null, kind: '', amp: 1, px: 0, py: 0, pz: 0, q: null };
          sl.g.name = 'fx'; sl.mesh = addMesh(sl.g, empty, true, true);
          (it.host === 'head' ? head : spine).add(sl.g); fx.push(sl);
        }
        sl.on = true; sl.g.visible = true; sl.kind = it.kind; sl.amp = it.amp; sl.px = it.pivot[0]; sl.py = it.pivot[1]; sl.pz = it.pivot[2]; sl.q = null;
        sl.g.position.set(sl.px, sl.py, sl.pz); sl.g.rotation.set(0, 0, 0);
        setGeo(sl.mesh, it.geo);
      }
    }

    var bunJoint = new THREE.Group(); bunJoint.name = 'bun'; bunJoint.position.set(0, 0.25, -0.19); head.add(bunJoint);
    var bunMesh = null, hat = null;

    function build() {
      var kt = [o.shirt, o.pants, o.belt, o.top, o.bottom, hasAcc(o, 'scarf') ? 1 : 0, hasAcc(o, 'backpack') ? 1 : 0].join('_');
      var kh = [o.skin, o.hair, o.hairStyle, o.hat || '-', headAccKey(o)].join('_');
      var kf = [o.eyes, o.skin, o.nose, hasAcc(o, 'glasses') ? 1 : 0].join('_');
      var ka = [o.skin, o.shirt, o.top].join('_');
      var kl = [o.skin, o.pants, o.boots, o.bottom].join('_');
      var CK = Game.CharKit, items = [];
      if (CK && CK.headSplit) {   // stage 17: tails / curtain hair / bow / scarf end / backpack come out as separate spring parts (ch.fx)
        var rh = cached('headS_' + kh, function () { return CK.headSplit(o); }), rt = cached('torsoS_' + kt, function () { return CK.torsoSplit(o); });
        setGeo(torso, rt.geo); setGeo(headMesh, rh.geo); items = rh.items.concat(rt.items);
      } else {
        setGeo(torso, cached('torso_' + kt, function () { return buildTorso(o); }));
        setGeo(headMesh, cached('head_' + kh, function () { return buildHead(o); }));
      }
      fxApply(items);
      setGeo(face, cached('face_' + kf, function () { return buildFace(o); }));
      var armGeo = cached('arm_' + ka, function () { return buildArm(o); });
      var legGeo = cached('leg_' + kl, function () { return buildLeg(o); });
      setGeo(armL, armGeo); setGeo(armR, armGeo); setGeo(legL, legGeo); setGeo(legR, legGeo);
      bunJoint.visible = o.hairStyle === 'bun';
      if (bunJoint.visible) {
        if (!bunMesh) bunMesh = addMesh(bunJoint, empty, true, true);
        setGeo(bunMesh, cached('bun_' + o.hair, function () { return buildBun(o); }));
        bunJoint.position.y = BUN_Y[o.hat || 'none'];
      }
      if (o.hat) {
        if (!hat) hat = addMesh(attach.hat, empty, true);
        setGeo(hat, cached(o.hat === 'straw' ? 'hat' : 'hat_' + o.hat, function () { return buildHat(o.hat); }));
        hat.visible = true;
      } else if (hat) hat.visible = false;
      ch.parts.hat = hat;
    }

    root.scale.setScalar(o.scale);

    var ch = {
      root: root,
      joints: { root: root, hips: hips, spine: spine, head: head, shoulderL: shoulderL, shoulderR: shoulderR, hipL: hipL, hipR: hipR, bun: bunJoint },
      look: o,
      attach: attach,
      fx: fx,
      parts: { torso: torso, head: headMesh, face: face, armL: armL, armR: armR, legL: legL, legR: legR, hat: null },
      shadow: null,
      anim: null,
      setLook: function (r) {
        var i, key;
        for (i = 0; i < LOOK_KEYS.length; i++) { key = LOOK_KEYS[i]; o[key] = (r && r[key] !== undefined) ? r[key] : CHAR_DEFAULTS[key]; }
        if (o.hat === 'none') o.hat = null;
        build();
      },
      update: function (dt, speed) { Anim.update(ch, dt, speed || 0); },
      dispose: function () {
        if (ch.shadow) { ch.shadow.remove(); ch.shadow = null; }
        if (root.parent) root.parent.remove(root);
      }
    };
    build();
    var p0 = Anim.newPose(), p1 = Anim.newPose(), p2 = Anim.newPose();
    ch.anim = { t: 0, phase: 0, w: [1, 0, 0], p0: p0, p1: p1, p2: p2, poses: [p0, p1, p2], pose: Anim.newPose() };
    Anim.idle(ch.anim.pose, 0);
    Anim.apply(ch, ch.anim.pose);

    if (o.shadow) ch.shadow = Render.addBlobShadow(root, 0.3 * o.scale, 0.34);
    return ch;
  };

  /* ------------------------------------------------------------------ ground */
  var GRASS_A = 0x8bd067, GRASS_B = 0x9bd972;

  // Rectangular tile ground, w x d tiles centered on the origin (tile edges on integers), with a dirt skirt.
  // opts: seed, skirt (depth), colorFn(tx, tz, rng) -> hex|Color|null (null = grass).
  Models.groundPatch = function (w, d, opts) {
    opts = opts || {};
    var rng = util.rng(opts.seed || 1337);
    var depth = opts.skirt !== undefined ? opts.skirt : 0.7;
    var pos = [], nor = [], col = [], idx = [];
    var gA = new THREE.Color(GRASS_A), gB = new THREE.Color(GRASS_B), tmp = new THREE.Color();
    var ox = -Math.floor(w / 2), oz = -Math.floor(d / 2);

    function quad(ax, az, bx, bz, cx, cz, dx, dz, y, n, c0, c1) {
      // vertex order matches (TL, TR, BR, BL); c0 for first two, c1 for last two
      var base = pos.length / 3;
      pos.push(ax, y[0], az, bx, y[0], bz, cx, y[1], cz, dx, y[1], dz);
      for (var i = 0; i < 4; i++) nor.push(n[0], n[1], n[2]);
      col.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }

    var i, j;
    for (j = 0; j < d; j++) {
      for (i = 0; i < w; i++) {
        var tx = ox + i, tz = oz + j;
        var cc = opts.colorFn ? opts.colorFn(tx, tz, rng) : null;
        if (cc === null || cc === undefined) tmp.copy(gA).lerp(gB, rng() * 0.6 + ((tx + tz) & 1) * 0.25);
        else tmp.set(cc);
        quad(tx, tz, tx + 1, tz, tx + 1, tz + 1, tx, tz + 1, [0, 0], [0, 1, 0], tmp, tmp);
      }
    }

    var X0 = ox, X1 = ox + w, Z0 = oz, Z1 = oz + d;
    var top = new THREE.Color(0x9a6b45), bot = new THREE.Color(0x5b3f2e);
    function side(p0x, p0z, p1x, p1z) {
      var tx = p1x - p0x, tz = p1z - p0z, l = Math.sqrt(tx * tx + tz * tz);
      tx /= l; tz /= l;
      quad(p0x, p0z, p1x, p1z, p1x, p1z, p0x, p0z, [0, -depth], [-tz, 0, tx], top, bot);
    }
    if (depth > 0) {
      side(X0, Z1, X1, Z1);   // +z
      side(X1, Z0, X0, Z0);   // -z
      side(X1, Z1, X1, Z0);   // +x
      side(X0, Z0, X0, Z1);   // -x
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, mat('ground'));
    mesh.name = 'groundPatch';
    mesh.userData.bounds = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    return mesh;
  };

  /* -------------------------------------------------------------------- tree */
  function buildTree(variant) {
    var trunk = 0x7b5238, parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.17, 0.95, 8, 1), trunk, [0, 0.47, 0]));
    var leaf = function (x, y) { return mix(0x4a9648, 0x93cf5c, (y - 0.9) / 1.7); };
    var blob = new THREE.SphereGeometry(1, 14, 10);
    parts.push(part(blob, leaf, [0, 1.55, 0], null, [0.8, 0.8, 0.8]));
    parts.push(part(blob, leaf, [-0.55, 1.25, 0.2], null, [0.55, 0.55, 0.55]));
    parts.push(part(blob, leaf, [0.5, 1.3, -0.25], null, [0.6, 0.6, 0.6]));
    parts.push(part(blob, leaf, [0.1, 2.05, 0.1], null, [0.5, 0.5, 0.5]));
    return mergeParts(parts);
  }

  // opts: variant (0 round), scale, rotationY, shadow
  Models.tree = function (opts) {
    opts = opts || {};
    var v = opts.variant | 0;
    var mesh = new THREE.Mesh(cached('tree' + v, function () { return buildTree(v); }), mat('foliage'));
    mesh.name = 'tree';
    var s = opts.scale || 1;
    mesh.scale.setScalar(s);
    mesh.rotation.y = opts.rotationY || 0;
    Render.addOutline(mesh);
    if (opts.shadow !== false) mesh.userData.shadow = Render.addBlobShadow(mesh, 0.9 * s, 0.3);
    mesh.userData.dispose = function () {
      if (mesh.userData.shadow) { mesh.userData.shadow.remove(); mesh.userData.shadow = null; }
      if (mesh.parent) mesh.parent.remove(mesh);
    };
    return mesh;
  };

  /* ------------------------------------------------------------------- house */
  function buildHouse() {
    var parts = [];
    var stone = 0xb9b0a4, wall = 0xf3e2c0, roof = 0xc4573a, wood = 0x7a4a2b;
    parts.push(part(new THREE.BoxGeometry(2.74, 0.25, 2.74), stone, [0, 0.125, 0]));
    parts.push(part(new THREE.BoxGeometry(2.6, 1.45, 2.6), wall, [0, 0.975, 0]));
    var roofFn = function (x, y) { return mix(0xb44a30, 0xd4684a, (y - 1.7) / 1.3); };
    parts.push(part(new THREE.ConeGeometry(2.2, 1.3, 4, 1, true), roofFn, [0, 2.35, 0], [0, Math.PI / 4, 0]));
    parts.push(part(new THREE.BoxGeometry(0.55, 1.0, 0.1), 0x3a2a22, [0, 0.75, 1.33]));   // doorway; the leaf is hinged in js/world_react.js
    parts.push(part(new THREE.BoxGeometry(0.9, 0.08, 0.4), stone, [0, 0.04, 1.5]));
    parts.push(part(new THREE.BoxGeometry(0.62, 0.55, 0.06), wood, [0.85, 1.1, 1.31]));
    parts.push(part(new THREE.BoxGeometry(0.5, 0.43, 0.08), 0x9fd3e6, [0.85, 1.1, 1.33]));
    parts.push(part(new THREE.BoxGeometry(0.62, 0.55, 0.06), wood, [-0.85, 1.1, 1.31]));
    parts.push(part(new THREE.BoxGeometry(0.5, 0.43, 0.08), 0x9fd3e6, [-0.85, 1.1, 1.33]));
    return mergeParts(parts);
  }

  // 3x3-tile footprint centered on the mesh origin (place at x.5, z.5 to align to tiles). Door faces +z.
  Models.house = function (opts) {
    opts = opts || {};
    var mesh = new THREE.Mesh(cached('house', buildHouse), mat('prop'));
    mesh.name = 'house';
    Render.addOutline(mesh);
    if (opts.shadow !== false) mesh.userData.shadow = Render.addBlobShadow(mesh, 2.0, 0.28, 2.0);
    mesh.userData.dispose = function () {
      if (mesh.userData.shadow) { mesh.userData.shadow.remove(); mesh.userData.shadow = null; }
      if (mesh.parent) mesh.parent.remove(mesh);
    };
    return mesh;
  };

  /* ------------------------------------------------------------------ cursor */
  // Flat 1x1 tile highlight (no outline, no halftone). Place at tile center, y ~ 0.03.
  Models.tileCursor = function (color) {
    var geo = new THREE.BoxGeometry(0.92, 0.04, 0.92);
    Render.colorize(geo, color !== undefined ? color : 0xffe27a);
    var m = new THREE.Mesh(geo, mat('flat'));
    m.name = 'tileCursor';
    m.visible = false;
    return m;
  };
})();
