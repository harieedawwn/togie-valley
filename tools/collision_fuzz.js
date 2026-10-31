/* node tools/collision_fuzz.js - 100000 random steps (diagonals, dt spikes, repeated pushes) around the bridge and pier edges using the real
 * js/move_core.js + js/thin_solids.js. A tunnelling event = the body ends a step overlapping water, a blocked tile or a rail/post solid.
 * Also runs a naive single-step mover as a sanity check that the fuzz can detect leaks (informational). Exit 1 when events > 0. */
var path = require('path'), root = path.join(__dirname, '..');
var WM = require(path.join(root, 'js/world_map.js')), MC = require(path.join(root, 'js/move_core.js')), TS = require(path.join(root, 'js/thin_solids.js'));
var rows = WM.rows, R = 0.26, N = 100000, WALK = { '.': 1, '=': 1, 't': 1, 'p': 1, ',': 1, 'o': 1, 's': 1 };
TS.init(rows, WM.features.bridge);
function walk(tx, tz) { return !!(rows[tz] && WALK[rows[tz].charAt(tx)]); }
function thin(x, z, r) { return TS.hit(x, z, r); }
var seed = 12345; function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
var starts = [], x, z, dx, dz, k;
for (z = 0; z < rows.length; z++) for (x = 0; x < rows[z].length; x++) {
  if ('ps'.indexOf(rows[z].charAt(x)) < 0 && !(x >= 26 && x <= 35 && z >= 16 && z <= 21)) continue;
  for (k = 0; k < 6; k++) { var sx = x + rnd(), sz = z + rnd(); if (MC.stand(sx, sz, R, walk, thin)) starts.push([sx, sz]); }
}
var DT = [1 / 60, 1 / 60, 1 / 30, 1 / 20, 0.1, 0.25, 0.5], ANG = [0, 1, 2, 3, 4, 5, 6, 7];
function run(mover) {
  var pos = { x: 0, z: 0 }, ev = 0, i, hold = 0, ang = 0, s, dt, sp, d;
  seed = 12345;
  for (i = 0; i < N; i++) {
    if (i % 40 === 0) { s = starts[Math.floor(rnd() * starts.length)]; pos.x = s[0]; pos.z = s[1]; }
    if (hold <= 0) { ang = rnd() < 0.6 ? ANG[Math.floor(rnd() * 8)] * Math.PI / 4 : rnd() * Math.PI * 2; hold = 1 + Math.floor(rnd() * 12); }   // diagonals + repeated pushes
    hold--; dt = DT[Math.floor(rnd() * DT.length)]; sp = 2 + rnd() * 8; d = sp * dt;
    mover(pos, Math.cos(ang) * d, Math.sin(ang) * d);
    if (!MC.stand(pos.x, pos.z, R, walk, thin)) { ev++; s = starts[Math.floor(rnd() * starts.length)]; pos.x = s[0]; pos.z = s[1]; }
  }
  return ev;
}
var real = run(function (p, dx, dz) { MC.move(p, dx, dz, R, walk, thin); });
var naive = run(function (p, dx, dz) { var x = p.x + dx, z = p.z + dz; if (walk(Math.floor(x), Math.floor(z))) { p.x = x; p.z = z; } });   // old style: one big step, centre-tile check only
/* bicycle capsule (length ~1.1, r 0.3): heading follows the push direction, same fuzz, no tunnelling (capsule must stand after every step) */
var HL = MC.CAP_HL, CR = MC.CAP_R, capEv = 0, ci, cs, cpos = { x: 0, z: 0 }, cang = 0, chold = 0, cdt, cd, chx, chz;
seed = 12345;
for (ci = 0; ci < N; ci++) {
  if (ci % 40 === 0) { cs = starts[Math.floor(rnd() * starts.length)]; cpos.x = cs[0]; cpos.z = cs[1]; }
  if (chold <= 0) { cang = rnd() < 0.6 ? ANG[Math.floor(rnd() * 8)] * Math.PI / 4 : rnd() * Math.PI * 2; chold = 1 + Math.floor(rnd() * 12); }
  chold--; cdt = DT[Math.floor(rnd() * DT.length)]; cd = (2 + rnd() * 8) * cdt; chx = Math.cos(cang); chz = Math.sin(cang);
  var wasIn = MC.standCap(cpos.x, cpos.z, chx, chz, HL, CR, walk, thin);
  MC.moveCap(cpos, chx * cd, chz * cd, chx, chz, HL, CR, walk, thin);
  if (wasIn && !MC.standCap(cpos.x, cpos.z, chx, chz, HL, CR, walk, thin)) { capEv++; cs = starts[Math.floor(rnd() * starts.length)]; cpos.x = cs[0]; cpos.z = cs[1]; }
}
real += capEv;
console.log('collision_fuzz: ' + N + ' steps, ' + starts.length + ' start points, ' + TS.rects.length + ' thin solids, tunnelling events (walk + capsule ' + capEv + '): ' + real + ' (naive baseline: ' + naive + ')');
process.exit(real ? 1 : 0);
