/* Stage 17 DECOR b: node tools/seat_furn_check.js - seat data of placed furniture: seat height = real surface from the model parts, sit pose above the surface,
 * inside the footprint, no body/model overlap, correct facing for all 4 rotations and every seat slot (2-3 seat sofas), stand-up tiles outside the footprint, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('seat_furn: FAIL ' + m); } else n++; }
global.window = global; global.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function () {}, request: function () {} }, State: {} };
require(path.join(root, 'js/furniture.js')); require(path.join(root, 'js/seat.js'));
var F = Game.Furniture, S = Game.Seat, SIT = S.SIT, EPS = 1e-6, TRIM = 0.004;
function isTrim(p) { var m = Math.max(p[5], p[6], p[7]), k = Math.min(p[5], p[6], p[7]); return m <= 0.3 && k <= 0.1; }   // pillows, buttons, balls: soft decoration
function aabb(p) {   // item-local AABB of a part (corners rotated with three's XYZ Euler order, conservative for cylinders / ellipsoids)
  var hx = p[5] / 2, hy = p[6] / 2, hz = p[7] / 2, rx = p[8], ry = p[9], rz = p[10], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, j, c, x, y, z, t;
  for (i = 0; i < 8; i++) {
    x = (i & 1 ? hx : -hx); y = (i & 2 ? hy : -hy); z = (i & 4 ? hz : -hz);
    t = x * Math.cos(rz) - y * Math.sin(rz); y = x * Math.sin(rz) + y * Math.cos(rz); x = t;       // Rz first
    t = x * Math.cos(ry) + z * Math.sin(ry); z = -x * Math.sin(ry) + z * Math.cos(ry); x = t;       // then Ry
    t = y * Math.cos(rx) - z * Math.sin(rx); z = y * Math.sin(rx) + z * Math.cos(rx); y = t;        // then Rx
    c = [x + p[2], y + p[3], z + p[4]]; for (j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], c[j]); hi[j] = Math.max(hi[j], c[j]); }
  }
  return { x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1], z0: lo[2], z1: hi[2] };
}
var seats = F.ITEMS.filter(function (it) { return it.seat; });
need(seats.length >= 6, 'seat items: ' + seats.map(function (i) { return i.id; }).join(','));
seats.forEach(function (it) {
  var sd = it.seat, parts = F.parts(it.id).map(function (p) { return { p: p, b: aabb(p) }; }), r, i;
  need(sd && isFinite(sd.y) && isFinite(sd.dx) && isFinite(sd.dz) && sd.face && sd.n >= 1 && sd.pitch > 0, it.id + ' seat {y,dx,dz,face,n,pitch}');
  need(sd.n === Math.max(it.w, it.d) || it.w * it.d === sd.n, it.id + ' seat count matches footprint cells');
  for (r = 0; r < 4; r++) {
    var dims = (r & 1) ? [it.d, it.w] : [it.w, it.d], tx0 = 10, tz0 = 20, centre = [tx0 + dims[0] / 2, tz0 + dims[1] / 2], cells = [], a, b2, cw = Math.cos(r * Math.PI / 2), sw = Math.round(Math.sin(r * Math.PI / 2));
    cw = Math.round(cw);
    for (a = 0; a < dims[0]; a++) for (b2 = 0; b2 < dims[1]; b2++) cells.push([tx0 + a, tz0 + b2]);
    var slots = {};
    cells.forEach(function (cell) {
      var pose = S.furnPose(it, r, centre, cell), lp = pose.local, surfY = sd.ys ? sd.ys[pose.slot] : sd.y, tag = it.id + ' r' + r + ' slot' + pose.slot + ' cell ' + cell.join(',');
      slots[pose.slot] = (slots[pose.slot] || 0) + 1;
      // real surface from the parts: highest non-trim part top under the hip point, at seat level
      var real = 0; parts.forEach(function (q) { if (isTrim(q.p)) return; if (lp.x >= q.b.x0 - EPS && lp.x <= q.b.x1 + EPS && lp.z >= q.b.z0 - EPS && lp.z <= q.b.z1 + EPS && q.b.y1 > 0.3 && q.b.y1 < 0.7) real = Math.max(real, q.b.y1); });
      need(Math.abs(real - surfY) <= 0.006, tag + ' seat height ' + surfY + ' = surface from parts ' + real.toFixed(3));
      // sitting body bbox (hero-local -> item-local): above the surface
      need(pose.y + SIT.minY >= surfY - EPS, tag + ' body above seat surface');
      // inside the footprint (world rect of the item) for the facing yaw
      var yaw = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[pose.face], cy = Math.cos(yaw), sy = Math.sin(yaw), ok = true, xs = [-SIT.halfX, SIT.halfX], zs = [SIT.minZ, SIT.maxZ];
      xs.forEach(function (x) { zs.forEach(function (z) { var wx = pose.x + x * cy + z * sy, wz = pose.z - x * sy + z * cy; if (wx < tx0 - EPS || wx > tx0 + dims[0] + EPS || wz < tz0 - EPS || wz > tz0 + dims[1] + EPS) ok = false; }); });
      need(ok, tag + ' body inside footprint');
      // facing = item front after rotation
      need(pose.face === ['s', 'e', 'n', 'w'][r], tag + ' faces the item front (' + pose.face + ')');
      // body box (item-local) vs model parts: no penetration (> 4 mm) except soft decoration and the seat itself
      var bx0 = lp.x - SIT.halfX, bx1 = lp.x + SIT.halfX, bz0 = lp.z + SIT.minZ, bz1 = lp.z + SIT.maxZ, by0 = surfY, by1 = surfY + SIT.maxY - SIT.minY, bad = '';
      parts.forEach(function (q) { var o;
        if (isTrim(q.p) || q.b.y1 <= surfY + TRIM) return;
        o = [Math.min(bx1, q.b.x1) - Math.max(bx0, q.b.x0), Math.min(by1, q.b.y1) - Math.max(by0, q.b.y0), Math.min(bz1, q.b.z1) - Math.max(bz0, q.b.z0)];
        if (o[0] > TRIM && o[1] > TRIM && o[2] > TRIM) bad = q.p[0] + '@' + q.p.slice(2, 5).join(',');
      });
      need(!bad, tag + ' body clear of the model (' + bad + ')');
      // hip point stays inside its own tile (player tile does not change)
      need(Math.floor(pose.x) === cell[0] && Math.floor(pose.z) === cell[1], tag + ' sit position inside the tapped tile');
      // stand-up candidates: outside the footprint, front first
      var cs = S.standCandidates(cells, r, cell), foot = {}; cells.forEach(function (q) { foot[q.join(',')] = 1; });
      need(cs.length >= 3 && cs.every(function (c) { return !foot[c.tx + ',' + c.tz]; }), tag + ' stand tiles outside the footprint');
      var fd = [[0, 1], [1, 0], [0, -1], [-1, 0]][r];
      need(cs[0].tx === cell[0] + fd[0] && cs[0].tz === cell[1] + fd[1] && cs[0].facing === pose.face, tag + ' first stand tile is in front of the seat');
    });
    need(Object.keys(slots).length === sd.n, it.id + ' r' + r + ' every seat slot reachable (' + Object.keys(slots).length + '/' + sd.n + ')');
  }
});
// multi-seat: distinct slot positions, symmetric around the centre
var sofa = F.get('sofa'), p0 = S.furnPose(sofa, 0, [11, 20.5], [10, 20]), p1 = S.furnPose(sofa, 0, [11, 20.5], [11, 20]);
need(p0.slot === 0 && p1.slot === 1 && Math.abs((p0.x + p1.x) / 2 - 11) < EPS && Math.abs(p1.x - p0.x - sofa.seat.pitch) < EPS, 'sofa: two seats, cushion-centred');
// 3-seat generic case (data-driven): fake item with n = 3
var fake = { seat: { y: 0.5, ys: null, dx: 0, dz: 0, face: [0, 1], n: 3, pitch: 1 } }, xs3 = [0, 1, 2].map(function (i) { return S.furnPose(fake, 1, [10.5, 11.5], [10, 10 + i]); });
need(xs3.map(function (q) { return q.slot; }).join() === '2,1,0' && xs3.every(function (q) { return q.face === 'e'; }), '3-seat sofa rotated r1: slots run against z, faces east');
// wiring
var fl = fs.readFileSync(path.join(root, 'js/furn_live.js'), 'utf8'), pl = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
need(/Seat\.furnPose/.test(fl) && /standCandidates/.test(fl) && /sitAt\(cell\[0\], cell\[1\], pose/.test(fl), 'furn_live uses Seat.furnPose + standCandidates');
need(/sitYv/.test(pl) && /P\.sitAt = function \(tx, tz, o\)/.test(pl), 'player lifts the seated hero');
console.log('seat_furn_check: ' + n + ' checks, ' + errs + ' failures');
process.exit(errs ? 1 : 0);
