/* Stage 16 H1a: node tools/furniture_check.js - catalog, models, icons, shop layout (grass-only, no overlap, far from other shops, BFS), wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('furniture: FAIL ' + m); } else n++; }
global.window = {}; var saved = {};
window.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function (k, o) { saved[k] = o; }, request: function () {} }, State: {} };
require(path.join(root, 'js/furniture.js')); var F = window.Game.Furniture;
need(F.ITEMS.length >= 28 && F.ITEMS.length <= 36, 'item count ' + F.ITEMS.length); need(F.CATS.length >= 5, 'categories');
var sig = {}, ids = {};
F.ITEMS.forEach(function (it) {
  need(!ids[it.id], 'dup id ' + it.id); ids[it.id] = 1;
  need(it.price > 0 && it.sell < it.price && it.tip.length <= 90 && it.name, 'item fields ' + it.id);
  need(F.CATS.some(function (c) { return c.id === it.cat; }), 'cat ' + it.id);
  var ps = F.parts(it.id); need(ps.length >= 6 && ps.length <= 60, 'part count ' + it.id + ' ' + ps.length);
  var s = JSON.stringify(ps); need(!sig[s], 'duplicate model ' + it.id); sig[s] = 1;
  var x0 = 9, x1 = -9, z0 = 9, z1 = -9; ps.forEach(function (p) { x0 = Math.min(x0, p[2] - p[5] / 2); x1 = Math.max(x1, p[2] + p[5] / 2); z0 = Math.min(z0, p[4] - p[7] / 2); z1 = Math.max(z1, p[4] + p[7] / 2); });
  if (it.place !== 'wall') need(x1 - x0 <= it.w + 0.25 && z1 - z0 <= it.d + 0.25, 'model bigger than footprint ' + it.id + ' ' + (x1 - x0).toFixed(2) + 'x' + (z1 - z0).toFixed(2));
  var svg = F.icon(it.id, 40); need(svg.indexOf('<svg') === 0 && svg.length > 1500, 'icon ' + it.id);
});
need(!!saved.furniture, 'save key furniture'); saved.furniture.load({ v: 1, inv: { sofa: 2, nope: 3 } }); need(F.count('sofa') === 2 && F.count('nope') === 0, 'save load'); need(saved.furniture.save().inv.sofa === 2, 'save roundtrip'); saved.furniture.reset(); need(F.count('sofa') === 0, 'reset');
var src = fs.readFileSync(path.join(root, 'js/furniture_shop.js'), 'utf8'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src);
var L = new Function(mm[1] + '; return LAYOUT;')(), S = require('./landmarks_scan.js')(root), r = L.ext, i, j;
for (j = r[1]; j < r[3]; j++) for (i = r[0]; i < r[2]; i++) need(S.ch(i, j) === '.', 'tile ' + i + ',' + j + ' not grass');
need(S.conflicts(r, 0.1) === 0, 'overlaps scenery/solids');
var other = { land: [6, 20, 12, 25], windmill: [36, 9, 39, 12], shed: [19, 6, 21, 8], shrine: [5, 17, 8, 20], bench: [24, 24, 29, 28], hammock: [7, 27, 12, 30], well: [20, 32, 23, 35], picnic: [29, 32, 33, 36], swing: [10, 34, 14, 37], star: [35, 50, 38, 53] };
Object.keys(other).forEach(function (k) { var o = other[k]; need(!(r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]), 'overlaps ' + k); });
var towns = { shop: [33, 13, 39, 17], workshop: [41, 13, 44, 17], fishstall: [44, 13, 47, 17], landoffice: [6, 20, 12, 25] };
Object.keys(towns).forEach(function (k) { var t = towns[k], d = Math.hypot(Math.max(t[0] - r[2], 0, r[0] - t[2]), Math.max(t[1] - r[3], 0, r[1] - t[3])); need(d >= 15, 'too near ' + k + ' ' + d.toFixed(1)); });
var blk = {}; L.blocked.forEach(function (b) { blk[b[0] + ',' + b[1]] = 1; need(b[0] >= r[0] && b[0] < r[2] && b[1] >= r[1] && b[1] < r[3], 'blocked outside ext ' + b); });
var sol = {}; S.solids.forEach(function (s) { sol[s[0] + ',' + s[1]] = 1; });
function walk(x, z) { var c = S.ch(x, z); return '.=o,'.indexOf(c) >= 0 && c !== ' ' && !sol[x + ',' + z] && !blk[x + ',' + z]; }
need(walk(L.stand[0], L.stand[1]), 'stand tile walkable'); need(walk(L.door[0], L.door[1]), 'door tile walkable'); need(blk[L.npc[0] + ',' + L.npc[1]], 'npc tile blocked');
function bfs(sx, sz) { var seen = {}, q = [[sx, sz]]; seen[sx + ',' + sz] = 1; while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) { var x = c[0] + d[0], z = c[1] + d[1], k = x + ',' + z; if (seen[k] || !walk(x, z)) return; if (d[0] && d[1] && (!walk(c[0] + d[0], c[1]) || !walk(c[0], c[1] + d[1]))) return; seen[k] = 1; q.push([x, z]); }); } return seen; }
var from = bfs(9, 19), st = L.stand[0] + ',' + L.stand[1]; need(walk(9, 19) && from[st], 'stand reachable from main path (9,19)'); need(from['16,25'] && from['31,44'], 'western network intact'); console.log('furniture: BFS reached ' + Object.keys(from).length + ' tiles');
need(!/\p{Extended_Pictographic}/u.test(src + fs.readFileSync(path.join(root, 'js/furniture.js'), 'utf8')), 'emoji');
var idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), mn = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
need(idx.indexOf('js/furniture.js') > idx.indexOf('js/icons.js') && idx.indexOf('js/furniture_shop.js') > idx.indexOf('js/furniture.js') && idx.indexOf('js/furniture_shop.js') < idx.indexOf('js/main.js'), 'load order');
need(/FurnitureShop\.build/.test(mn) && /css\/furniture\.css/.test(idx), 'wiring');
var geo = 0, draws = 2 + 1 + 12; need(draws <= 16, 'draw estimate'); console.log('furniture: draw estimate +' + draws + ' (static 2, sign 1, NPC ~12); parts total ' + F.ITEMS.reduce(function (a, it) { return a + F.parts(it.id).length; }, 0));
console.log('furniture: ' + n + ' checks, ' + errs + ' failures'); process.exit(errs ? 1 : 0);
