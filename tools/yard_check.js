/* Stage 17 DECOR a: node tools/yard_check.js - yard decor area: free grass, outside farm soil at every land tier, solids/bushes/paths clear, BFS reachability kept, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('yard: FAIL ' + m); } else n++; }
global.window = {}; window.Game = { Events: { emit: function () {}, on: function () {} } };
var PL = require(path.join(root, 'js/placement_logic.js')), WMap = require(path.join(root, 'js/world_map.js')), rows = WMap.rows, H = rows.length, W = rows[0].length;
var Layout = require(path.join(root, 'js/layout.js')), SLay = require(path.join(root, 'js/scenery_layout.js'));
var lfSrc = fs.readFileSync(path.join(root, 'js/land_farm.js'), 'utf8'), LAYOUT = new Function(lfSrc.split('/*LAYOUT-BEGIN*/')[1].split('/*LAYOUT-END*/')[0] + '; return LAYOUT;')();
function ch(x, z) { return x < 0 || z < 0 || x >= W || z >= H ? null : rows[z].charAt(x); }
var base = { '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', p: 'pier', B: 'grass', s: 'pier', ',': 'sand', o: 'stone' };
function type(x, z) { var c = ch(x, z); return c ? (base[c] || 'building') : null; }
var marks = {}, names = { D: 'door', B: 'bin', C: 'shopCounter', K: 'workshopCounter', M: 'fishStall', s: 'seat' }, x, z, blocked = {}, occupied = {};
for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var nm = names[ch(x, z)]; if (nm) (marks[nm] = marks[nm] || []).push({ tx: x, tz: z }); }
var lay = Layout.scatter({ W: W, H: H, seed: 1234, type: type, markers: function (k) { return marks[k] || []; }, isFarm: function (a, b) { return a > 11 && a < 28 && b > 6 && b < 19; } });
lay.solids.forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; }); lay.solids.concat(lay.bushTiles).forEach(function (c) { occupied[c[0] + ',' + c[1]] = 1; });
SLay.styleScatter(lay.trees, rows);
var sc = SLay.build({ rows: rows, features: WMap.features, seed: 777, avoid: lay.trees, blocked: function (a, b) { return !!occupied[a + ',' + b]; } });
sc.solids.forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; }); sc.bushes.forEach(function (b) { occupied[Math.floor(b.x) + ',' + Math.floor(b.z)] = 1; });
if (fs.existsSync(path.join(root, 'tools/extra_solids.json'))) JSON.parse(fs.readFileSync(path.join(root, 'tools/extra_solids.json'), 'utf8')).forEach(function (c) { blocked[c[0] + ',' + c[1]] = 1; });
// farm soil at every tier (core soil, locked plots, 3 land strips)
var soil = {}; for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (ch(x, z) === 't' || ch(x, z) === 'l') soil[x + ',' + z] = 1;
LAYOUT.tiers.forEach(function (t) { var r = t.rect, sk = {}; t.skip.forEach(function (c) { sk[c[0] + ',' + c[1]] = 1; }); for (z = r[1]; z <= r[3]; z++) for (x = r[0]; x <= r[2]; x++) if (!sk[x + ',' + z]) soil[x + ',' + z] = 1; });
// yard tiles = static rule + free of solids / bushes (interactable tiles are '=' or markers, excluded by the grass rule)
var yard = {}, cnt = 0, hb = PL.houseBox(rows);
need(!!hb, 'farmhouse footprint found');
for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (PL.yardStatic(rows, x, z) && !blocked[x + ',' + z] && !occupied[x + ',' + z]) { yard[x + ',' + z] = 1; cnt++; }
need(cnt > 81, 'yard is wider than the old 9x9 box: ' + cnt + ' tiles');
Object.keys(yard).forEach(function (k) {
  var c = k.split(','), tx = +c[0], tz = +c[1];
  need(ch(tx, tz) === '.' && type(tx, tz) === 'grass', 'grass only ' + k);
  need(!soil[k], 'outside farm soil at every tier ' + k);
  need(Math.max(hb[0] - tx, tx - hb[2], hb[1] - tz, tz - hb[3]) <= 6, 'within 6 tiles of the farmhouse ' + k);
});
need(!yard['11,12'] && !yard['7,10'] && !yard['9,13'] && !yard['10,14'] && !yard['12,15'], 'bin / annex / door path / plot sign / well tiles excluded');
// BFS reachability with every yard tile treated as solid (conservative): everything reachable without it stays reachable
function walk(x2, z2, solidYard) { var t = type(x2, z2), c = ch(x2, z2); return (t === 'grass' || t === 'path' || t === 'soil' || t === 'pier' || t === 'sand' || t === 'stone') && c !== 'B' && !blocked[x2 + ',' + z2] && !(solidYard && yard[x2 + ',' + z2]); }
function flood(solidYard) {
  var door = marks.door[0], s = [door.tx, door.tz + 1], seen = {}, q = [s], D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], c;
  seen[s.join(',')] = 1;
  while (q.length) { c = q.shift(); D8.forEach(function (d) { var nx = c[0] + d[0], nz = c[1] + d[1], k = nx + ',' + nz; if (seen[k] || !walk(nx, nz, solidYard)) return; if (d[0] && d[1] && (!walk(c[0] + d[0], c[1], solidYard) || !walk(c[0], c[1] + d[1], solidYard))) return; seen[k] = 1; q.push([nx, nz]); }); }
  return seen;
}
var free = flood(false), tight = flood(true), lost = 0;
// yard items never block walking at runtime; this conservative run treats every yard tile as solid and still requires every target to stay reachable
Object.keys(free).forEach(function (k) { if (!yard[k] && !tight[k] && !PL.YARD.skip[k] && (ch(+k.split(',')[0], +k.split(',')[1]) !== '.')) lost++; });
need(lost === 0, 'no path / stone / soil / pier tile is cut off by yard tiles (lost ' + lost + ')');
['door', 'bin', 'shopCounter', 'workshopCounter', 'fishStall'].forEach(function (k) { (marks[k] || []).forEach(function (m) { need(!!tight[m.tx + ',' + (m.tz + 1)], k + ' stand tile reachable'); }); });
Object.keys(soil).forEach(function (k) { if (free[k]) need(!!tight[k], 'soil reachable ' + k); });
// wiring
var pj = fs.readFileSync(path.join(root, 'js/placement.js'), 'utf8'), mj = fs.readFileSync(path.join(root, 'js/menus.js'), 'utf8');
need(/yardStatic/.test(pj) && /Ngoài sân/.test(pj) && /Trong nhà/.test(pj) && /yard_outline/.test(pj), 'placement.js uses yardStatic, tabs and outline');
need(/'outdoor'\) tiles\.splice|'outdoor'\)\) tiles\.splice/.test(mj), 'menu entry shown outdoors');
console.log('yard_check: ' + n + ' checks, ' + errs + ' failures (' + cnt + ' yard tiles)');
process.exit(errs ? 1 : 0);
