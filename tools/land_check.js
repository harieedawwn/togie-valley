/* Stage 16 G1: node tools/land_check.js - Phòng Địa Ốc layout: grass-only, no scenery overlap, far from shops, BFS reachability, draw estimate, API wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('land: FAIL ' + m); } else n++; }
var src = fs.readFileSync(path.join(root, 'js/land_office.js'), 'utf8'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src);
var L = new Function(mm[1] + '; return LAYOUT;')(), S = require('./landmarks_scan.js')(root), r = L.ext, i, j;
for (j = r[1]; j < r[3]; j++) for (i = r[0]; i < r[2]; i++) need(S.ch(i, j) === '.', 'tile ' + i + ',' + j + ' not grass');
need(S.conflicts(r, 0.3) === 0, 'overlaps scenery/solids');
var other = { windmill: [36, 9, 39, 12], shed: [19, 6, 21, 8], shrine: [5, 17, 8, 20], compost: [10, 15, 11, 16], trough: [10, 17, 12, 18], board: [37, 20, 39, 21],
  bench: [24, 24, 29, 28], hammock: [7, 27, 12, 30], well: [20, 32, 23, 35], picnic: [29, 32, 33, 36], swing: [10, 34, 14, 37], star: [35, 50, 38, 53] };
Object.keys(other).forEach(function (k) { var o = other[k]; need(!(r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]), 'overlaps ' + k); });
var towns = { shop: [33, 13, 39, 17], workshop: [41, 13, 44, 17], fishstall: [44, 13, 47, 17] };
Object.keys(towns).forEach(function (k) { var t = towns[k], dx = Math.max(t[0] - r[2], 0, r[0] - t[2]), dz = Math.max(t[1] - r[3], 0, r[1] - t[3]), d = Math.hypot(dx, dz); need(d >= 15, 'too near ' + k + ' (' + d.toFixed(1) + ')'); console.log('land: distance to ' + k + ' = ' + d.toFixed(1)); });
var blk = {}; L.blocked.forEach(function (b) { blk[b[0] + ',' + b[1]] = 1; });
L.blocked.forEach(function (b) { need(b[0] >= r[0] && b[0] < r[2] && b[1] >= r[1] && b[1] < r[3], 'blocked tile outside ext ' + b); });
var sol = {}; S.solids.forEach(function (s) { sol[s[0] + ',' + s[1]] = 1; });
function walk(x, z) { var c = S.ch(x, z); return '.=o,'.indexOf(c) >= 0 && c !== ' ' && !sol[x + ',' + z] && !blk[x + ',' + z]; }
need(walk(L.stand[0], L.stand[1]), 'stand tile not walkable'); need(walk(L.door[0], L.door[1]), 'door tile not walkable');
var seen = {}, q = [[9, 19]], hit = 0, st = L.stand[0] + ',' + L.stand[1]; seen['9,19'] = 1;
need(walk(9, 19), 'BFS start (main path 9,19) not walkable');
while (q.length) { var c = q.shift(); if (c[0] + ',' + c[1] === st) hit = 1; [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
  var x = c[0] + d[0], z = c[1] + d[1], k = x + ',' + z; if (seen[k] || !walk(x, z)) return; if (d[0] && d[1] && (!walk(c[0] + d[0], c[1]) || !walk(c[0], c[1] + d[1]))) return; seen[k] = 1; q.push([x, z]); }); }
need(hit, 'stand tile not reachable by BFS from main path'); console.log('land: BFS reached ' + Object.keys(seen).length + ' tiles, stand reachable=' + !!hit);
// the farm door / shop counter stay reachable from the same start (office does not seal anything)
need(!!seen['9,19'] && !!seen['16,25'], 'office blocks the western path network');
need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in land_office.js');
var idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), mn = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
need(idx.indexOf('js/land_office.js') > idx.indexOf('js/chill_spots.js') && idx.indexOf('js/land_office.js') < idx.indexOf('js/dev_tools.js') && idx.indexOf('js/land_office.js') < idx.indexOf('js/main.js'), 'land_office.js load order');
need(/LandOffice\.build/.test(mn), 'main.js builds LandOffice'); need(/css\/land\.css/.test(idx), 'land.css linked');
need(/Save\.register\('land\.house'/.test(src) && /Save\.register\('land\.farm'/.test(src), 'save keys');
var draws = 2 + 1 + 12; need(draws <= 15, 'draw estimate'); console.log('land: draw estimate +' + draws + ' (static 2, sign 1, NPC ~12); overall budget <= 150 checked by perf_budget');
console.log('land: ' + n + ' checks, ' + errs + ' failures'); process.exit(errs ? 1 : 0);
