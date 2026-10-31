/* Togie Valley - tools/seat_fit_check.js (Round 4 stage 2): node tools/seat_fit_check.js
 * Every seat type (6 pier variants + 6 furniture seats) has explicit data; in the sit pose the pelvis (underside of the hip / thigh) rests on the seat surface read from the mesh (<= 0.02),
 * the spine touches the backrest, long tops drape, the sideways exit clears the seat. The leg underside is re-derived from the leg profile in js/char_kit.js (FK of AnimData.SIT). */
'use strict';
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0, TOL = 0.02;
function need(ok, m) { if (!ok) { errs++; console.log('seat_fit: FAIL ' + m); } else n++; }
global.window = global; global.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function () {}, request: function () {} }, State: {} };
require(path.join(root, 'js/furniture.js')); require(path.join(root, 'js/anim_data.js')); require(path.join(root, 'js/seat.js'));
var F = Game.Furniture, S = Game.Seat, AD = Game.AnimData, SP = AD.SIT, ck = fs.readFileSync(path.join(root, 'js/char_kit.js'), 'utf8');

// 1. lowest point of the leg in the sit pose, from the real lathe profiles (lathe point [r, y] -> ring bottom y cos(th) - r sin(th); boots: z scaled 1.45, shifted 0.035)
function arr(re, long) { var m = ck.match(re); need(!!m, 'char_kit profile found ' + re); return m ? new Function('long', 'return ' + m[1])(long) : []; }
var lg = arr(/var lg = (\[\[.*?\]\]);/, true), shoe = arr(/var shoe = (\[\[.*?\]\]);/), th = SP.leg, low = 0;
lg.forEach(function (q) { low = Math.min(low, q[1] * Math.cos(th) - q[0] * Math.sin(th)); });
shoe.forEach(function (q) { low = Math.min(low, q[1] * Math.cos(th) + (0.035 - 1.45 * q[0]) * Math.sin(th)); });
var under = -low;
need(Math.abs(under - SP.under) <= 0.004, 'AnimData.SIT.under ' + SP.under + ' matches the leg profile ' + under.toFixed(3));
need(Math.abs(S.SIT.minY - (AD.LEG + SP.bob - SP.under)) < 1e-9 && Math.abs(S.SIT.minZ + SP.back) < 1e-9, 'Seat.SIT derives from AnimData.SIT');
var hipY = AD.LEG + SP.bob;   // hip joint above the root

function pelvis(rootY) { return rootY + hipY - under; }   // underside of hip / thigh in world y
function surfaceAt(prims, x, z, lo, hi) {   // highest prim top under (x, z) between lo..hi
  var best = -1;
  prims.forEach(function (p) { if (p.y1 > lo && p.y1 < hi && x >= p.x0 - 1e-6 && x <= p.x1 + 1e-6 && z >= p.z0 - 1e-6 && z <= p.z1 + 1e-6) best = Math.max(best, p.y1); });
  return best;
}

// 2. pier seats: all 6 stool variants, mesh from Seat.itemPrims
need(S.PIER.length === 6, 'six pier seat types in Seat.PIER');
S.PIER.forEach(function (t, k) {
  var it = { kind: 'stool', v: t.v, r: 0.7, ox: 5.5, oz: 5.5, ry: k * Math.PI / 2, tile: { tx: 5, tz: 5 }, block: false }, prims, ext, top, front = null, hw = 0;
  need(t.v === k && typeof t.id === 'string' && isFinite(t.top) && isFinite(t.dz) && (t.back === null || isFinite(t.back)), t.id + ' explicit data {id,v,top,dz,back}');
  S.items = [it]; prims = S.itemPrims(it).map(function (p) {
    var r = p.t === 'box' ? { hx: p.w / 2, hz: p.d / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 } : p.t === 'cyl' ? { hx: Math.max(p.rt, p.rb), hz: Math.max(p.rt, p.rb), y0: p.y - p.h / 2, y1: p.y + p.h / 2 } : null;
    return r && { x0: p.x - r.hx, x1: p.x + r.hx, z0: p.z - r.hz, z1: p.z + r.hz, y0: r.y0, y1: r.y1 };
  }).filter(Boolean);
  top = surfaceAt(prims, 0, t.dz, 0.1, 0.35);
  need(Math.abs(top - t.top) <= 0.006, t.id + ' seat top from the mesh ' + top.toFixed(3) + ' = data ' + t.top);
  var pose = S.pierPose(5, 5);
  need(!!pose && pose.type === t.id, t.id + ' pierPose finds the item');
  need(Math.abs(pelvis(pose.y) - (0.1 + top)) <= TOL, t.id + ' pelvis ' + pelvis(pose.y).toFixed(3) + ' on seat top ' + (0.1 + top).toFixed(3));
  prims.forEach(function (p) { if (p.y0 > top + 0.03 && p.z1 < 0.05 && p.x1 > -0.24 && p.x0 < 0.24) front = front === null ? p.z1 : Math.max(front, p.z1); });
  if (t.back === null) need(front === null, t.id + ' has no backrest'); else {
    need(front !== null && Math.abs(front - t.back) <= 0.01, t.id + ' backrest face ' + (front === null ? 'none' : front.toFixed(3)) + ' = data ' + t.back);
    need(t.dz - SP.back >= front - 0.006 && t.dz - SP.back <= front + 0.02, t.id + ' spine touches the backrest (gap ' + (t.dz - SP.back - front).toFixed(3) + ')');
  }
  prims.forEach(function (p) { hw = Math.max(hw, Math.abs(p.x0), Math.abs(p.x1)); });
  need(Math.abs(pose.exit[0] * pose.exit[0] + pose.exit[1] * pose.exit[1] - S.STEP_OUT * S.STEP_OUT) < 1e-9 && hw + 0.08 <= S.STEP_OUT + 0.005 && S.STEP_OUT + 0.1 <= 0.5, t.id + ' sideways exit clears the seat (half width ' + hw.toFixed(2) + ')');
  need(Math.abs(pose.exit[0] * Math.sin(it.ry) + pose.exit[1] * Math.cos(it.ry)) < 1e-9, t.id + ' exit is perpendicular to the facing');
});
// every variant the layout can produce is covered
var seen = {}, lay = S.layout([0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return { tx: 3 + i * 2, tz: 4 }; }), function () { return 'pier'; }, function () { return 'n'; });
lay.items.forEach(function (it) { if (it.kind === 'stool') seen[it.v] = 1; });
need(Object.keys(seen).every(function (v) { return S.PIER[v]; }), 'layout variants ' + Object.keys(seen).join('') + ' all have Seat.PIER data');

// 3. furniture seats (every registered seat item)
var seats = F.ITEMS.filter(function (it) { return it.seat; }), ids = seats.map(function (i) { return i.id; }).sort().join();
need(ids === 'armchair,bench_garden,chair_cushion,chair_wood,sofa,stool', 'furniture seat set = ' + ids);
seats.forEach(function (it) {
  var sd = it.seat, parts = F.parts(it.id), cell = [10, 20], centre = [10 + it.w / 2, 20 + it.d / 2], i, pose, real, gap;
  need(isFinite(sd.y) && isFinite(sd.dz) && (sd.back === null || isFinite(sd.back)) && sd.n >= 1, it.id + ' explicit seat data {y,dz,back,n}');
  for (i = 0; i < sd.n; i++) {
    pose = S.furnPose(it, 0, centre, [10 + (sd.n > 1 ? i : 0), 20]); real = 0;
    parts.forEach(function (p) {
      var hx = p[5] / 2, hy = p[6] / 2, hz = p[7] / 2, top = p[3] + hy;
      if (Math.max(p[5], p[6], p[7]) <= 0.3 && Math.min(p[5], p[6], p[7]) <= 0.1) return;   // soft trim (pillows, balls)
      if (pose.local.x >= p[2] - hx - 1e-6 && pose.local.x <= p[2] + hx + 1e-6 && pose.local.z >= p[4] - hz - 1e-6 && pose.local.z <= p[4] + hz + 1e-6 && top > 0.3 && top < 0.7) real = Math.max(real, top);
    });
    need(Math.abs(pelvis(pose.y) - real) <= TOL, it.id + ' slot' + i + ' pelvis ' + pelvis(pose.y).toFixed(3) + ' on seat top ' + real.toFixed(3));
    if (sd.back !== null) { gap = pose.local.z - SP.back - sd.back; need(gap >= 0 && gap <= 0.02, it.id + ' slot' + i + ' spine touches the backrest (gap ' + gap.toFixed(3) + ')'); }
  }
});

// 4. long tops / skirts: hem below the thigh underside drapes (<= 0.03), plain outfits need no lift
var lows = []; ck.replace(/low = \[\[0, (-?[\d.]+)\]/g, function (m, v) { lows.push(+v); return m; });
need(lows.length === 4, 'char_kit hem profiles found (' + lows.join(',') + ')');
var kinds = [{ bottom: 'skirt' }, { top: 'baba' }, { top: 'tee' }, {}];
Game.CharKit = { lowY: function (o) { return lows[kinds.indexOf(o)]; } };
var lifts = kinds.map(function (o) { return S.sitLift(o); });
need(lifts[0] > 0 && lifts[0] <= 0.03 + 1e-9 && lifts[1] > 0 && lifts[1] <= 0.03 + 1e-9 && lifts[2] === 0 && lifts[3] === 0, 'sitLift skirt/baba drape, tee/plain none (' + lifts.map(function (v) { return v.toFixed(3); }).join(' ') + ')');
need(S.sitLift(null) === 0, 'sitLift without a look = 0');

console.log('seat_fit_check: ' + n + ' checks, ' + errs + ' failures (leg underside ' + under.toFixed(3) + ', hip ' + hipY.toFixed(3) + ')');
process.exit(errs ? 1 : 0);
