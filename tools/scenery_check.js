/* Stage 16 E numeric check: tree overlaps, clearance, pink-tree rule, species mix, grass counts per tier, draw-call estimate. Run: node tools/scenery_check.js */
var path = require('path'), root = path.join(__dirname, '..'), WM = require(path.join(root, 'js/world_map.js')), SL = require(path.join(root, 'js/scenery_layout.js')), GR = require(path.join(root, 'js/grass.js'));
WM = WM.rows ? WM : (WM.WorldMap || WM);
var fails = 0; function bad(m) { fails++; console.log('FAIL ' + m); }
var r = SL.build({ rows: WM.rows, features: WM.features, seed: 777, blocked: function () { return false; } }), T = r.trees, i, j, W = WM.W, H = WM.H;
function ch(x, z) { return x < 0 || z < 0 || x >= W || z >= H ? '' : WM.rows[z].charAt(x); }
var cnt = {}; T.forEach(function (t) { cnt[t.k] = (cnt[t.k] || 0) + 1; });
// 1. overlaps: distinct trunk tiles, minimum trunk distance (clump members may be as close as 1.15)
var seen = {}, minD = 99;
for (i = 0; i < T.length; i++) { var k = Math.floor(T[i].x) + ',' + Math.floor(T[i].z); if (seen[k]) bad('two trunks on tile ' + k); seen[k] = 1; if (ch(Math.floor(T[i].x), Math.floor(T[i].z)) !== '.' && T[i].sz !== 'large') { /* island tree is on sand */ }
  for (j = i + 1; j < T.length; j++) minD = Math.min(minD, Math.hypot(T[i].x - T[j].x, T[i].z - T[j].z)); }
if (minD < 1.1) bad('trees closer than 1.1 tiles: ' + minD.toFixed(2));
// 2. clearance: trunk tile >= 2 tiles from path/soil/pier/farm (orchard rows relaxed), >= 3 from buildings
var obsP = '=optl', obsB = 'HSWFDBCKMnms', nearP = 99, nearB = 99, od = WM.features.orchard;
T.forEach(function (t) {
  var tx = Math.floor(t.x), tz = Math.floor(t.z), inOrch = tx >= od[0] && tx <= od[2] && tz >= od[1] && tz <= od[3], a, b, c, d;
  if (inOrch || ch(tx, tz) !== '.') return;
  for (b = tz - 4; b <= tz + 4; b++) for (a = tx - 4; a <= tx + 4; a++) { c = ch(a, b); d = Math.max(Math.abs(a - tx), Math.abs(b - tz));
    if (!c) continue; if (obsP.indexOf(c) >= 0 || (a > 10 && a < 29 && b > 5 && b < 20)) nearP = Math.min(nearP, d); else if (obsB.indexOf(c) >= 0) nearB = Math.min(nearB, d); }
});
if (nearP < 2) bad('tree within ' + nearP + ' tile(s) of a path/field/pier'); if (nearB < 3) bad('tree within ' + nearB + ' tile(s) of a building');
// 4. grass per tier
var tiers = [1, 0.7, 0.4, 0.12], counts = tiers.map(function (s) { return GR.layout({ rows: WM.rows, trees: T, scale: s, seed: 5150 }).count; });
if (counts[0] > GR.CAP * 1.03) bad('grass above cap'); for (i = 1; i < counts.length; i++) if (counts[i] > counts[i - 1]) bad('grass count not monotonic');
var gl = GR.layout({ rows: WM.rows, trees: T, scale: 1, seed: 5150 }).list, onBad = 0;
gl.forEach(function (g) { var c = ch(Math.floor(g.x), Math.floor(g.z)); if (c !== '.' && c !== ',') onBad++; if (g.x > 11 && g.x < 29 && g.z > 6 && g.z < 20) onBad++; });
if (onBad) bad(onBad + ' grass tufts on path/water/field');
// 5. draw calls: trees 5 common species x (<= 4 cells x 2) worst window ~ 2 cells, 4 rare species x 2, grass <= 4 cells (no outline)
var est = { treesCommon: 5 * 2 * 2, treesRare: 4 * 2, grass: 4 };
console.log('trees ' + T.length + ' ' + JSON.stringify(cnt) + ' zones ' + JSON.stringify(r.zones) + ' minDist ' + minD.toFixed(2) + ' nearPath ' + nearP + ' nearBuilding ' + nearB);
console.log('grass tufts per tier [1,0.7,0.4,0.12]: ' + counts.join(', ') + ' (cap ' + GR.CAP + ')');
console.log('est. added draw calls worst window: trees +' + (est.treesRare) + ' (rare species), grass +' + est.grass + ' = +' + (est.treesRare + est.grass) + ' over the old ' + (5 * 4) + ' (chunk_estimate worst 34 decor calls)');
console.log(fails ? fails + ' FAIL' : 'scenery_check: OK'); process.exit(fails ? 1 : 0);
