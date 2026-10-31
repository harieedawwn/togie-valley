#!/usr/bin/env node
/* Togie Valley - tools/hair_coverage.js (Round 4 stage 4). Ray test: for every hair style x 3 hair colours x every hat, builds the REAL head
 * (Models.character -> head mesh + spring parts + bun + hat, in head space) and casts rays from the upper hemisphere (yaw every 15 deg,
 * elevation 10 deg .. highest camera pitch, plus the lowest / highest rig pitch) at the head centre. Back faces are culled like the game
 * material (FrontSide); the first front-facing hit must be hair / hat / spring part, never skin. Skin is allowed only in the face window
 * (|yaw| <= FACE_YAW and elevation <= FACE_ELEV, the forehead / face seen from the front). A first hit on the inside of a hair shell
 * (back face before any front face) is reported too. Usage: node tools/hair_coverage.js [-v] */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.resolve(__dirname, '..'), verbose = process.argv.indexOf('-v') > 0;
var THREE = require(path.join(root, 'vendor', 'three.min.js'));
var sb = { console: console, THREE: THREE, Math: Math };
sb.window = sb;
sb.Game = {
  util: {}, Events: { on: function () { return function () {}; }, emit: function () {} },
  Render: {
    addSmoothNormals: function () {},
    addOutline: function (mesh) { var h = new THREE.Mesh(mesh.geometry, {}); h.name = 'outline'; mesh.userData.outline = h; mesh.add(h); return h; },
    toonMaterial: function () { return { uniforms: {} }; }, addBlobShadow: function () { return { remove: function () {} }; }
  }
};
vm.createContext(sb);
function load(f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }); }
['js/look.js', 'js/head_model.js', 'js/models.js'].forEach(load);
var Models = sb.Game.Models, HM = sb.Game.HeadModel, Look = sb.Game.Look;
// label every merged vertex range so skin triangles can be told from hair / hat triangles
var skinGeos = [HM.skinPart(0xf6cfa8).geo], i0, ears = HM.earParts(0xf6cfa8);
for (i0 = 0; i0 < ears.length; i0++) skinGeos.push(ears[i0].geo);
var origMerge = Models.mergeParts;
Models.mergeParts = function (parts) {
  var geo = origMerge(parts), tri = [], k, n, t;
  for (k = 0; k < parts.length; k++) {
    n = (parts[k].geo.index ? parts[k].geo.index.count : parts[k].geo.attributes.position.count) / 3;
    for (t = 0; t < n; t++) tri.push(parts[k].geo === skinGeos[0] ? 1 : skinGeos.indexOf(parts[k].geo) > 0 ? 2 : 0);
  }
  geo.userData.skinTri = tri;
  return geo;
};
load('js/char_kit.js');
if (!Models.character || !sb.Game.CharKit) { console.error('hair_coverage: Models / CharKit did not load'); process.exit(1); }

var FACE_YAW = 70 * Math.PI / 180, FACE_ELEV = 25 * Math.PI / 180, D2R = Math.PI / 180;
var OUT_PITCH = 38, IN_PITCH = 58, LO_PITCH = 14, HI_PITCH = IN_PITCH + 0.3 / D2R;   // rig: outdoor 38, indoor 58, tilt -0.3..+0.3 rad, outdoor never under 14
var elevs = [], e, yaws = [], y;
for (e = 10; e <= HI_PITCH + 0.01; e += 5) elevs.push(e);
elevs.push(LO_PITCH, OUT_PITCH, IN_PITCH, HI_PITCH);
for (y = 0; y < 360; y += 15) yaws.push(y);

/* triangle soup in head space: {a,b,c (9 floats), skin, hat/hair}; includes head mesh, spring parts, bun, hat */
function soup(look) {
  var o = Look.resolve(look), ch = Models.character(o), tris = [], head = ch.joints.head;
  ch.root.updateMatrixWorld(true);
  var inv = new THREE.Matrix4().copy(head.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), q = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  head.traverse(function (obj) {
    if (!obj.isMesh || obj.name === 'outline' || !obj.visible) return;
    for (var p = obj; p; p = p.parent) if (p.visible === false) return;
    var g = obj.geometry, P = g && g.attributes && g.attributes.position; if (!P || !P.count) return;
    if (obj === ch.parts.face) return;   // face decals sit on the skin inside the face window
    m.multiplyMatrices(inv, obj.matrixWorld);
    var I = g.index, n = (I ? I.count : P.count) / 3, t, k, ix, st = g.userData.skinTri;
    for (t = 0; t < n; t++) {
      for (k = 0; k < 3; k++) { ix = I ? I.getX(t * 3 + k) : t * 3 + k; v.set(P.getX(ix), P.getY(ix), P.getZ(ix)).applyMatrix4(m); q[k * 3] = v.x; q[k * 3 + 1] = v.y; q[k * 3 + 2] = v.z; }
      tris.push({ v: q.slice(), skin: st ? st[t] : 0 });   // 0 hair / hat, 1 skull skin, 2 ear
    }
  });
  return tris;
}
// Moller-Trumbore, both sides; returns t and the facing (dot of the triangle normal with the ray)
function hit(t, ox, oy, oz, dx, dy, dz) {
  var v = t.v, e1x = v[3] - v[0], e1y = v[4] - v[1], e1z = v[5] - v[2], e2x = v[6] - v[0], e2y = v[7] - v[1], e2z = v[8] - v[2];
  var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  var inv = 1 / det, tx = ox - v[0], ty = oy - v[1], tz = oz - v[2], u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (dx * qx + dy * qy + dz * qz) * inv;
  if (w < -1e-7 || u + w > 1 + 1e-7) return null;
  var d = (e2x * qx + e2y * qy + e2z * qz) * inv; if (d <= 1e-6) return null;
  // winding normal e1 x e2; front face when it points against the ray
  var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  return { d: d, front: nx * dx + ny * dy + nz * dz < 0 };
}
var CY = HM.CY, fails = 0, total = 0, byKey = {}, cases = 0;
function runLook(look, tag) {
  var tris = soup(look), a, b, bad = [], need = 0, yw, el, ox, oy, oz, dx, dy, dz, cy, sy, ce, se, best, bestAny, h, k, skinHits = 0;
  for (a = 0; a < yaws.length; a++) for (b = 0; b < elevs.length; b++) {
    yw = yaws[a] * D2R; el = elevs[b] * D2R; ce = Math.cos(el); se = Math.sin(el);
    var wy = yaws[a] > 180 ? yaws[a] - 360 : yaws[a], face = Math.abs(wy * D2R) <= FACE_YAW + 1e-9 && el <= FACE_ELEV + 1e-9;
    // direction from outside towards the head centre; yaw 0 = in front of the face (+z)
    ox = Math.sin(yw) * ce * 2; oy = CY + se * 2; oz = Math.cos(yw) * ce * 2; dx = -ox; dy = CY - oy; dz = -oz;
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
    best = null; bestAny = null;
    for (k = 0; k < tris.length; k++) {
      h = hit(tris[k], ox, oy, oz, dx, dy, dz); if (!h) continue;
      if (!bestAny || h.d < bestAny.d) bestAny = { d: h.d, skin: tris[k].skin, front: h.front };
      if (h.front && (!best || h.d < best.d)) best = { d: h.d, skin: tris[k].skin };
    }
    if (face) continue;
    need++;
    if (!best || best.skin === 1) { bad.push({ yaw: wy, el: elevs[b], why: !best ? 'miss' : 'skin' }); }
    else if (bestAny && !bestAny.front && !bestAny.skin && bestAny.d < best.d - 1e-5) bad.push({ yaw: wy, el: elevs[b], why: 'inside' });
  }
  // grid pass: parallel rays across the whole head disc (the camera never aims exactly at the centre); the point that is hit decides
  var gi, gj, ux, uy, uz, vx, vy, vz, off1, off2, px, py, pz, hx, hy, hz, hp, hyaw, GR = 0.27, GN = 9;
  for (a = 0; a < yaws.length; a++) for (b = 0; b < elevs.length; b++) {
    yw = yaws[a] * D2R; el = elevs[b] * D2R; ce = Math.cos(el); se = Math.sin(el);
    dx = -Math.sin(yw) * ce; dy = -se; dz = -Math.cos(yw) * ce;
    ux = Math.cos(yw); uy = 0; uz = -Math.sin(yw);                 // horizontal axis of the disc
    vx = dy * uz - dz * uy; vy = dz * ux - dx * uz; vz = dx * uy - dy * ux;   // other axis (dir x u)
    for (gi = 0; gi < GN; gi++) for (gj = 0; gj < GN; gj++) {
      off1 = (gi / (GN - 1) * 2 - 1) * GR; off2 = (gj / (GN - 1) * 2 - 1) * GR; if (off1 * off1 + off2 * off2 > GR * GR) continue;
      ox = -dx * 2 + ux * off1 + vx * off2; oy = CY - dy * 2 + uy * off1 + vy * off2; oz = -dz * 2 + uz * off1 + vz * off2;
      best = null;
      for (k = 0; k < tris.length; k++) { h = hit(tris[k], ox, oy, oz, dx, dy, dz); if (h && h.front && (!best || h.d < best.d)) best = { d: h.d, skin: tris[k].skin }; }
      if (!best || best.skin !== 1) continue;
      hx = ox + dx * best.d; hy = oy + dy * best.d - CY; hz = oz + dz * best.d;
      hp = Math.asin(hy / Math.sqrt(hx * hx + hy * hy + hz * hz)); hyaw = Math.abs(Math.atan2(hx, hz));
      // skin is fine in the face window, at the temples / ears (below the side hairline) and at the nape below the back hairline
      if (hyaw <= FACE_YAW && hp <= 28 * D2R) continue;
      var tt = Math.min(1, Math.max(0, (hyaw - 110 * D2R) / (70 * D2R)));   // hairline: -3 deg at the temples, easing to -30 deg at the nape
      if (hp <= (-3 - 27 * tt * tt * (3 - 2 * tt)) * D2R) continue;
      bad.push({ yaw: yaws[a] > 180 ? yaws[a] - 360 : yaws[a], el: elevs[b], why: 'skin@pt(yaw' + Math.round(hyaw / D2R) + ',pitch' + Math.round(hp / D2R) + ')' }); need++; break;
    }
  }
  cases++; total += need;
  if (bad.length) { fails += bad.length; byKey[tag] = { bad: bad, need: need }; }
}
var HAIRC = [0, 5, 6], hs, hc, ht, tag;
for (hs = 0; hs < Look.IDS.hairStyle.length; hs++) for (hc = 0; hc < HAIRC.length; hc++) for (ht = 0; ht < Look.IDS.hat.length; ht++) {
  tag = Look.IDS.hairStyle[hs] + '/hair' + HAIRC[hc] + '/' + Look.IDS.hat[ht];
  runLook({ skin: 0, hairStyle: Look.IDS.hairStyle[hs], hair: HAIRC[hc], eyes: 0, nose: 'none', hat: Look.IDS.hat[ht], acc: [], top: 'overalls', topColor: 0, bottom: 'pants', pantsColor: 0 }, tag);
}
var keys = Object.keys(byKey);
if (keys.length) {
  var agg = {};   // group by style/hat (colour does not change geometry)
  keys.forEach(function (k) { var s = k.split('/'), g = s[0] + '/' + s[2]; if (!agg[g]) agg[g] = byKey[k]; });
  Object.keys(agg).forEach(function (g) {
    var r = agg[g], sample = r.bad.slice(0, verbose ? 40 : 6).map(function (x) { return x.why + '@yaw' + x.yaw + ',el' + x.el; }).join(' ');
    console.error('FAIL ' + g + ': ' + r.bad.length + '/' + r.need + ' dirs (' + (100 * r.bad.length / r.need).toFixed(1) + '% uncovered)  ' + sample);
  });
}
console.log('hair_coverage: ' + cases + ' looks, ' + yaws.length + ' yaws x ' + elevs.length + ' elevations (' + elevs[0] + '..' + HI_PITCH.toFixed(1) + ' deg), ' + total + ' scalp/nape rays, failing directions: ' + fails);
process.exit(fails ? 1 : 0);
