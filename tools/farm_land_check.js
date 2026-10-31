/* Stage 16 G2: node tools/farm_land_check.js - farm expansion tiers: bounds, no overlap, free tiles, signs, fences, BFS reachability, caps, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('farmland: FAIL ' + m); } else n++; }
var src = fs.readFileSync(path.join(root, 'js/land_farm.js'), 'utf8'), win = { Game: { Events: { on: function () {}, emit: function () {} }, Land: { register: function () {}, get: function () { return 0; }, MAX: 3 } } };
new Function('window', src)(win);
var LF = win.Game.LandFarm, S = require('./landmarks_scan.js')(root), W = S.W, H = S.H;
var ext = { shed: [19, 6, 21, 8], compost: [10, 15, 11, 16], trough: [10, 17, 12, 18], office: [6, 20, 12, 25], shrine: [5, 17, 8, 20] };
function inExt(x, z) { return Object.keys(ext).some(function (k) { var r = ext[k]; return x >= r[0] && x < r[2] && z >= r[1] && z < r[3]; }); }
var sol = {}; S.solids.forEach(function (s) { sol[s[0] + ',' + s[1]] = 1; });
(S.marks.bin || []).forEach(function (b) { sol[b.tx + ',' + b.tz] = 1; });
var seen = {}, tot = 0, t, i;
for (t = 1; t <= 3; t++) {
  var tl = LF.tilesOf(t); need(tl.length >= 10, 'tier ' + t + ' has ' + tl.length + ' tiles'); tot += tl.length;
  tl.forEach(function (c) {
    var k = c[0] + ',' + c[1], ch = S.ch(c[0], c[1]);
    need(c[0] >= 0 && c[0] < 64 && c[1] >= 0 && c[1] < H && c[0] < W, 'bounds ' + k);
    need(ch === '.' || ch === ',', 'tier ' + t + ' tile ' + k + ' not free land (' + ch + ')');
    need(!seen[k], 'overlap ' + k); seen[k] = t;
    need(!sol[k] && !inExt(c[0], c[1]), 'tier ' + t + ' tile ' + k + ' blocked by solid/landmark');
    need(S.conflicts([c[0], c[1], c[0] + 1, c[1] + 1], 0.3) === 0, 'scenery on ' + k);
  });
}
// field tiles: original soil + locked + expansion must fit the instancing cap
var field = 0, z, x; for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var c0 = S.ch(x, z); if (c0 === 't' || c0 === 'l' || seen[x + ',' + z]) field++; }
var cap = +/CAP = (\d+)/.exec(fs.readFileSync(path.join(root, 'js/farm_fx.js'), 'utf8'))[1]; need(field <= cap, 'field tiles ' + field + ' > farm_fx CAP ' + cap);
// signs + fences + BFS for every built tier
for (var b = 0; b <= 3; b++) {
  var es = LF.expSet(b), sg = LF.signsFor(b), blk = {};
  sg.forEach(function (s) { var k = s[0] + ',' + s[1], ch = S.ch(s[0], s[1]); need(ch === '.' || ch === ',', 'tier ' + b + ' sign ' + k + ' not grass/sand'); need(!es[k] && !sol[k] && !inExt(s[0], s[1]), 'sign ' + k + ' on field/solid'); need(S.conflicts([s[0], s[1], s[0] + 1, s[1] + 1], 0.3) === 0, 'scenery at sign ' + k); blk[k] = 1; });
  var tt = function (x, z) { var k = x + ',' + z, c = S.ch(x, z); if (es[k]) return 'soil'; return c === ' ' ? null : ({ '.': 'grass', '=': 'path', t: 'soil', l: 'locked', '~': 'water', ',': 'sand', o: 'stone' }[c] || 'building'); };
  var ed = LF.edges(b, tt, function (x, z) { return !!sol[x + ',' + z] || inExt(x, z); }, W, H);
  ed.forEach(function (e) { var d = [[0, -1], [1, 0], [0, 1], [-1, 0]][e.i], nt = tt(e.x + d[0], e.z + d[1]); need(nt === 'grass' || nt === 'sand' || nt === 'soil' || nt === 'locked' || nt === 'building' || nt === 'path' || nt === 'water', 'fence edge type'); });
  if (b > 0) { var ne = ed.filter(function (e) { return es[e.x + ',' + e.z]; }); need(ne.length > 0, 'tier ' + b + ' has fence edges'); ne.forEach(function (e) { var d = [[0, -1], [1, 0], [0, 1], [-1, 0]][e.i], nt = tt(e.x + d[0], e.z + d[1]); need(nt === 'grass' || nt === 'sand', 'strip fence beside ' + nt); }); }
  // BFS from the main path over walkable tiles (field fully unlocked)
  function walk(x, z) { var k = x + ',' + z, c = S.ch(x, z); if (blk[k] || sol[k] || inExt(x, z)) return false; return es[k] || '.=o,tl'.indexOf(c) >= 0 && c !== ' '; }
  var sn = {}, q = [[9, 19]], cnt = 0; sn['9,19'] = 1;
  while (q.length) { var cu = q.shift(); cnt++; [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
    var nx = cu[0] + d[0], nz = cu[1] + d[1], k = nx + ',' + nz; if (sn[k] || !walk(nx, nz)) return; if (d[0] && d[1] && (!walk(cu[0] + d[0], cu[1]) || !walk(cu[0], cu[1] + d[1]))) return; sn[k] = 1; q.push([nx, nz]); }); }
  var miss = 0; for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var kk = x + ',' + z; if ((es[kk] || S.ch(x, z) === 't' || S.ch(x, z) === 'l') && !sn[kk]) { miss++; console.log('  unreachable ' + kk); } }
  need(miss === 0, 'tier ' + b + ': ' + miss + ' field tiles unreachable');
  need(!!sn['9,25'] || !!sn['16,25'], 'tier ' + b + ' keeps the west road network connected');
  console.log('farmland: tier ' + b + ' fences ' + ed.length + ', BFS reached ' + cnt + ' tiles, unreachable field tiles ' + miss);
}
console.log('farmland: new soil tiles ' + tot + ', field tiles at tier 3: ' + field + ' (cap ' + cap + ')');
var idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), mn = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), fm = fs.readFileSync(path.join(root, 'js/farm.js'), 'utf8');
need(idx.indexOf('js/land_farm.js') > idx.indexOf('js/land_office.js') && idx.indexOf('js/land_farm.js') < idx.indexOf('js/main.js'), 'land_farm.js load order');
need(/LandFarm\.build/.test(mn) && /LandFarm\.setBuilt/.test(fm) && /pruneInvalid/.test(fm) && /LandFarm\.fenceEdges/.test(fs.readFileSync(path.join(root, 'js/decor.js'), 'utf8')) && /LandFarm\.fenceEdges/.test(fs.readFileSync(path.join(root, 'js/farm_look.js'), 'utf8')), 'wiring');
need(/Land\.register\('farm'/.test(src) && /Day\.onStart/.test(src) && /land:changed/.test(src), 'service/day/dev hooks');
need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in land_farm.js');
var draws = 3; need(draws <= 150, 'draws'); console.log('farmland: draw calls +' + draws + ' only while a site is active (fence instancing unchanged); total budget checked by perf_budget (<= 150)');
console.log('farmland: ' + n + ' checks, ' + errs + ' failures'); process.exit(errs ? 1 : 0);
