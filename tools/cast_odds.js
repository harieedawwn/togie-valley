/* Cast odds sim on the REAL map + the real Game.FishOdds rules. Usage: node tools/cast_odds.js */
global.window = global; global.Game = global.Game || {};
var WM = require('../js/world_map.js'), O = require('../js/fish_odds.js');
var rows = (global.Game.WorldMap || WM).rows, W = rows[0].length, H = rows.length;
function typeAt(tx, tz) { var c = (rows[tz] || '')[tx]; return !c ? null : c === '~' ? 'water' : (c === 'p' || c === 's') ? 'pier' : 'grass'; }
function region(tx, tz, cap) {
  var seen = {}, q = [[tx, tz]], n = 0, c, i, d, D = [[1, 0], [-1, 0], [0, 1], [0, -1]], k;
  seen[tx + ',' + tz] = 1;
  while (q.length && n < cap) { c = q.pop(); n++; for (i = 0; i < 4; i++) { d = D[i]; k = (c[0] + d[0]) + ',' + (c[1] + d[1]); if (!seen[k] && typeAt(c[0] + d[0], c[1] + d[1]) === 'water') { seen[k] = 1; q.push([c[0] + d[0], c[1] + d[1]]); } } }
  return n;
}
function quality(tx, tz, px, pz) {   // same inputs fishing.js castQuality feeds to FishOdds.classify
  var dx = tx + 0.5 - px, dz = tz + 0.5 - pz;
  return O.classify({ casterDist: Math.sqrt(dx * dx + dz * dz), pierDist: O.pierDist(typeAt, tx, tz), shoreTouch: O.shoreTouch(typeAt, tx, tz), region: region(tx, tz, O.TINY) });
}
var seats = [], x, z;
for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (rows[z][x] === 's') seats.push([x, z]);
var seat = seats[0], good = null, bad = null, seatCast = null, bridgeCast = null, d, dz;
for (d = 3; d < 10 && !seatCast; d++) for (dz = -2; dz <= 2 && !seatCast; dz++) if (typeAt(seat[0] + d, seat[1] + dz) === 'water' && quality(seat[0] + d, seat[1] + dz, seat[0] + 0.5, seat[1] + 0.5) === 'good') seatCast = [seat[0] + d, seat[1] + dz];
// good spot: deep lake tile >= 3 tiles from any land/pier, standing on shore far away; bad: tile beside the pier; bridge: stream tile next to the bridge
for (z = 0; z < H && !good; z++) for (x = 0; x < W && !good; x++) if (typeAt(x, z) === 'water' && quality(x, z, x - 5.5, z + 0.5) === 'good') good = [x, z, x - 5.5, z + 0.5];
bad = [seat[0] + 1, seat[1] + 1];
console.log('seat', seat, 'seatCast', seatCast, 'good', good, 'bad', bad);
function run(name, q) {
  var n = 2000, junk = 0, i;
  for (i = 0; i < n; i++) if (O.rollJunk(q, (i * 0.6180339887 + 0.5 / n) % 1)) junk++;   // low-discrepancy rolls: stable, no sampling noise
  var pct = junk / n * 100; console.log(name + ': quality=' + q + ' junk=' + pct.toFixed(1) + '%'); return pct;
}
var qg = quality(good[0], good[1], good[2], good[3]), qb = typeAt(bad[0], bad[1]) === 'water' ? quality(bad[0], bad[1], seat[0] + 0.5, seat[1] + 0.5) : 'bad';
var qs = quality(seatCast[0], seatCast[1], seat[0] + 0.5, seat[1] + 0.5);
var fail = 0, pg = run('good spot', qg), pb = run('bad spot (beside pier)', 'bad'), ps = run('seat cast', qs);
if (qg !== 'good' || qs !== 'good' || qb !== 'bad') { console.log('FAIL classification', qg, qs, qb); fail++; }
if (pg > 1 || ps > 1) { console.log('FAIL good junk > 1%'); fail++; }
if (pb < 55 || pb > 65) { console.log('FAIL bad junk not 55-65%'); fail++; }
console.log(fail ? fail + ' failures' : 'cast_odds ok');
process.exit(fail ? 1 : 0);
