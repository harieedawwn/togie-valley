/* Stage 17 BUGFIX a: node tools/solids_check.js - blocked grid for farm tiers 0-3 x house tiers 0-3: well/signs/annex stay blocked,
 * floor furniture blocks (flat items do not), seats keep an interaction tile, door + BFS reachability intact, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('solids: FAIL ' + m); } else n++; }
global.window = {};
window.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function () {}, request: function () {} }, State: {} };
var HM = require(path.join(root, 'js/house_map.js')); require(path.join(root, 'js/furniture.js'));
var F = window.Game.Furniture, PL = require(path.join(root, 'js/placement_logic.js')), S = require(path.join(root, 'js/solids.js'));
PL.setCtx({ hm: HM, furn: F, yardOK: function () { return false; } });
var WELL = [12, 14], ft, fi, hi, list, solid, set, i, p;
function has(arr, c) { return arr.some(function (a) { return a[0] === c[0] && a[1] === c[1]; }); }
for (fi = 0; fi <= 3; fi++) for (hi = 0; hi <= 3; hi++) {
  var out = S.outdoorTiles(fi, hi), tag = ' (farm ' + fi + ', house ' + hi + ')';
  need(has(out, WELL), 'well blocked' + tag);
  need(has(out, fi >= 2 ? [10, 14] : [12, 14]) && has(out, fi >= 3 ? [29, 13] : [27, 14]), 'plot signs blocked' + tag);
  need(hi >= 2 ? has(out, [7, 10]) && has(out, [7, 11]) : !has(out, [7, 10]), 'annex tiles' + tag);
  HM.setTier(hi); list = [];
  var ids = F.ITEMS.map(function (it) { return it.id; }), rug = ids.filter(function (id) { return F.get(id).flat; })[0];
  HM.floorTiles().forEach(function (t) {
    ids.forEach(function (id) { var it = F.get(id); if (it.place === 'wall' || it.place === 'yard' || list.length > 40) return; });
  });
  ft = HM.floorTiles();
  for (i = 0; i < ft.length; i += 2) {
    var id2 = ids.filter(function (id) { var it = F.get(id); return (it.place === 'floor' || it.place === 'any') && !it.flat; })[i % 5];
    p = { id: id2, k: 'f', x: ft[i].ix, z: ft[i].iz, r: 0 };
    if (!PL.validate(list, p, -1)) list.push(p);
  }
  if (rug) { p = { id: rug, k: 'f', x: ft[1].ix, z: ft[1].iz, r: 0 }; if (!PL.validate(list, p, -1)) list.push(p); }
  set = S.houseSet(list, F, PL, HM); solid = set;
  need(list.length > 0, 'furniture placed' + tag);
  list.forEach(function (q) {
    var it = F.get(q.id), cells = PL.cells(q);
    if (it.flat) need(cells.every(function (c) { return !set[c[0] + ',' + c[1]] || list.some(function (o) { return o !== q && !F.get(o.id).flat && PL.cells(o).some(function (d) { return d[0] === c[0] && d[1] === c[1]; }); }); }), 'flat item not blocking' + tag);
    else if (it.cat !== 'seat' && !/bed/.test(it.id)) need(cells.every(function (c) { return set[c[0] + ',' + c[1]]; }), 'footprint blocked ' + q.id + tag);
    else need(cells.some(function (c) { return set[c[0] + ',' + c[1]]; }) || cells.length === 1, 'seat blocks tiles ' + q.id + tag);
  });
  var door = HM.spawns.door; need(!set[door[0] + ',' + door[1]], 'door tile free' + tag);
  need(PL.reachable(solid), 'BFS reachable' + tag);
}
need(Object.keys(S.houseSet([], F, PL, HM)).length === 0, 'empty list = nothing blocked');
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
need(/js\/solids\.js/.test(rd('index.html')), 'solids.js in index.html');
need(/Solids\.houseBlocked/.test(rd('js/house.js')), 'house walkable uses Solids');
need(/never unblock it/.test(rd('js/land_farm.js')) && /Solids\.refresh/.test(rd('js/land_house.js')), 'land modules re-apply solids');
console.log('solids: ' + n + ' checks ok, ' + errs + ' failed'); process.exit(errs ? 1 : 0);
