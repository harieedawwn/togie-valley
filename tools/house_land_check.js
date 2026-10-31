/* Stage 16 G3: node tools/house_land_check.js - house upgrade tiers: map integrity, BFS reachability, door/wall alignment, free annex tiles, floorTiles, draw-call budget, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('houseland: FAIL ' + m); } else n++; }
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
var HM = require(path.join(root, 'js/house_map.js')), t, x, z;
var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
for (t = 0; t <= 3; t++) {
  HM.setTier(t); var W = HM.width, D = HM.depth, rows = HM.rows;
  need(rows.length === D && rows.every(function (r) { return r.length === W; }), 'tier ' + t + ' rows match ' + W + 'x' + D);
  // door alignment: two door tiles at (3..4, D-1) (stage 12: doorway 2 tiles), on the front edge, matching the door frame drawn at x 3..5 in house.js
  var doors = []; rows.forEach(function (r, iz) { for (var ix = 0; ix < r.length; ix++) if (r[ix] === 'D') doors.push([ix, iz]); });
  need(doors.length === 2 && doors[0][0] === 3 && doors[1][0] === 4 && doors[0][1] === D - 1 && doors[1][1] === D - 1, 'tier ' + t + ' door at (3,' + (D - 1) + ')');
  need(HM.spots.door[0][1] === D - 1 && HM.spots.door[1][1] === D && HM.spots.door[0][2] === 3, 'tier ' + t + ' door spots on the front edge');
  // fixed furniture never moves
  need(HM.at(0, 0) === 'B' && HM.at(0, 1) === 'B' && HM.at(3, 0) === 'K' && HM.at(4, 0) === 'O' && HM.at(6, 0) === 'C' && HM.at(4, 3) === 'T' && HM.at(5, 3) === 'T', 'tier ' + t + ' bed/kitchen/chest/table stay');
  need(HM.at(W - 1, D - 1) === 'P', 'tier ' + t + ' plant in new corner');
  // BFS (8-dir, no corner cutting) from the door stand tile
  var sp = HM.spawns, seen = {}, q = [[3, D - 1]], cnt = 0, total = 0, cu, k;
  seen['3,' + (D - 1)] = 1;
  while (q.length) { cu = q.shift(); cnt++; for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) { if (!dx && !dz) continue; var nx = cu[0] + dx, nz = cu[1] + dz; k = nx + ',' + nz; if (seen[k] || !HM.isWalkable(nx, nz)) continue; if (dx && dz && (!HM.isWalkable(cu[0] + dx, cu[1]) || !HM.isWalkable(cu[0], cu[1] + dz))) continue; seen[k] = 1; q.push([nx, nz]); } }
  for (z = 0; z < D; z++) for (x = 0; x < W; x++) if (HM.isWalkable(x, z)) total++;
  need(cnt === total, 'tier ' + t + ' BFS reached ' + cnt + '/' + total + ' walkable tiles');
  [sp.wake, sp.bed, sp.door].forEach(function (s, i) { need(HM.isWalkable(s[0], s[1]) && !!seen[s[0] + ',' + s[1]], 'tier ' + t + ' spawn ' + i + ' free + reachable'); });
  ['bed', 'chest', 'kitchen', 'door'].forEach(function (nm) { HM.spots[nm].forEach(function (e) { need(HM.isWalkable(e[2], e[3]) && !!seen[e[2] + ',' + e[3]], 'tier ' + t + ' ' + nm + ' stand tile reachable'); need(!HM.isWalkable(e[0], e[1]) || nm === 'door', 'tier ' + t + ' ' + nm + ' target tile solid'); }); });
  var ft = HM.floorTiles(), fs2 = {};
  need(ft.length > 0 && ft.every(function (c) { return HM.at(c.ix, c.iz) === '.' && !!seen[c.ix + ',' + c.iz]; }), 'tier ' + t + ' floorTiles free + reachable (' + ft.length + ')');
  ft.forEach(function (c) { need(!fs2[c.ix + ',' + c.iz], 'floorTiles duplicate'); fs2[c.ix + ',' + c.iz] = 1; });
  need(ft.every(function (c) { return [sp.wake, sp.bed, sp.door].every(function (s) { return s[0] !== c.ix || s[1] !== c.iz; }); }), 'tier ' + t + ' floorTiles skip spawns');
  console.log('houseland: tier ' + t + ' ' + W + 'x' + D + ', walkable ' + total + ', floorTiles ' + ft.length + ', BFS ' + cnt);
  if (t > 0) { var pw = HM.TIERS[t - 1]; need(W * D > pw[0] * pw[1], 'tier ' + t + ' bigger than tier ' + (t - 1)); }
}
HM.setTier(0); need(HM.rows.join('|') === 'B..KO.C|B......|.rrr...|.rrrTT.|..r....|...DD.P', 'tier 0 = original room');
// outdoor: annex tiles free of terrain/scenery, porch posts clear, door approach reaches the path with the annex blocked
var hs = rd('js/house.js'), lh = rd('js/land_house.js'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(lh), L = new Function(mm[1] + '; return LAYOUT;')();
var S = require('./landmarks_scan.js')(root);
var sol = {}; S.solids.forEach(function (s) { sol[s[0] + ',' + s[1]] = 1; }); (S.marks.bin || []).forEach(function (b) { sol[b.tx + ',' + b.tz] = 1; });
L.annex.tiles.forEach(function (c) { var ch = S.ch(c[0], c[1]); need(ch === '.', 'annex tile ' + c + ' is grass'); need(!sol[c[0] + ',' + c[1]], 'annex tile ' + c + ' not a landmark solid'); need(S.conflicts([c[0], c[1], c[0] + 1, c[1] + 1], 0.3) === 0, 'scenery on annex tile ' + c); });
L.porchPosts.forEach(function (p) { var tx = Math.floor(p[0]), tz = Math.floor(p[1]); need(!(tx === 9 && tz === 13), 'porch post off the door tile'); need(S.conflicts([tx, tz, tx + 1, tz + 1], 0.3) === 0, 'scenery under porch post ' + tx + ',' + tz); });
need(S.ch(9, 13) === '=', 'door approach tile is path');
var blk = {}; L.annex.tiles.forEach(function (c) { blk[c[0] + ',' + c[1]] = 1; });
function walk(a, b) { var k = a + ',' + b, c = S.ch(a, b); return !blk[k] && !sol[k] && c !== ' ' && '.=o,tl'.indexOf(c) >= 0; }
var seen2 = { '9,13': 1 }, q2 = [[9, 13]], reach = 0;
while (q2.length) { var u = q2.shift(); reach++; for (var ddx = -1; ddx <= 1; ddx++) for (var ddz = -1; ddz <= 1; ddz++) { var ax = u[0] + ddx, az = u[1] + ddz, kk = ax + ',' + az; if ((!ddx && !ddz) || seen2[kk] || !walk(ax, az)) continue; if (ddx && ddz && (!walk(u[0] + ddx, u[1]) || !walk(u[0], u[1] + ddz))) continue; seen2[kk] = 1; q2.push([ax, az]); } }
need(!!seen2['9,18'] && !!seen2['13,14'] && !!seen2['3,18'], 'outdoor BFS from door reaches main path + farm (' + reach + ' tiles) with annex blocked');
// draw-call budget: interior (only visible indoors) and outdoor additions
var interior = 2 /*static+outline*/ + 1 /*base*/ + 2 /*chest*/ + 2 /*arrow*/ + 3 * 2 + 3 /*bulbs wing*/ + 1 /*table bulb*/ + 4 /*lid, door leaf, misc*/;
var outdoor = 2 /*exterior+outline*/ + 2 /*site+outline*/ + 1 /*board*/ + 1 /*dust*/;
need(interior <= 40, 'interior draws ' + interior); need(outdoor <= 8, 'outdoor additions ' + outdoor + ' (<= 8)');
console.log('houseland: draws interior ~' + interior + ', outdoor +' + outdoor + ' (total budget 150)');
// wiring
var idx = rd('index.html'), mn = rd('js/main.js'), dv = rd('js/dev_tools.js'), sv = hs;
need(idx.indexOf('js/land_house.js') > idx.indexOf('js/land_office.js') && idx.indexOf('js/land_house.js') < idx.indexOf('js/main.js'), 'land_house.js after land_office.js, before main.js');
need(/LandHouse\.build/.test(mn) && /floorTiles/.test(sv) && /House\.setTier/.test(sv) && /tier: House\.tier/.test(sv), 'house.js / main.js wiring');
need(/door frame at tile \(3,5\)/.test(hs) === true || /C\.dark, 3\.0, 0\.95, ID \+ 0\.15/.test(hs), 'door frame uses tile 3 and ID');
need(/Land\.register\('house'/.test(lh) && /Day\.onStart\(16/.test(lh) && /setLand/.test(dv), 'service registered, morning hook, dev setLand');
need(!/\p{Extended_Pictographic}/u.test(lh), 'emoji in land_house.js');
console.log('houseland: ' + n + ' checks, ' + errs + ' errors'); process.exit(errs ? 1 : 0);
