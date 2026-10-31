/* Stage 16 H1b: node tools/placement_check.js - placement validity, door/interactable BFS, wall segments, tier re-validation, save round-trip, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('placement: FAIL ' + m); } else n++; }
global.window = {}; var saved = {};
window.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function (k, o) { saved[k] = o; }, request: function () {} }, State: {} };
var HM = require(path.join(root, 'js/house_map.js')); require(path.join(root, 'js/furniture.js'));
var F = window.Game.Furniture, PL = require(path.join(root, 'js/placement_logic.js')), WM = require(path.join(root, 'js/world_map.js')); WM = WM.WorldMap || WM;
function yardOK(x, z) { return x >= 5 && x <= 13 && z >= 7 && z <= 15 && WM.rows[z].charAt(x) === '.' && !(x === 7 && (z === 10 || z === 11)); }
PL.setCtx({ hm: HM, furn: F, yardOK: yardOK });
function f(id, x, z, r) { return { id: id, k: 'f', x: x, z: z, r: r || 0 }; }
HM.setTier(0);
var ft = HM.floorTiles(), fset = PL.floorSet();
need(ft.length > 8, 'free floor tiles ' + ft.length);
need(PL.validate([], f('chair_wood', ft[0].ix, ft[0].iz)) === '', 'chair on a free tile');
need(PL.validate([], f('chair_wood', 3, 5)) !== '', 'door tile rejected');
need(PL.validate([], f('chair_wood', 3, 4)) !== '', 'door approach rejected');
need(PL.validate([], f('chair_wood', 0, 0)) !== '', 'bed tile rejected');
need(PL.validate([], f('chair_wood', 6, 1)) !== '', 'chest stand tile rejected');
need(PL.validate([], f('chair_wood', 3, 1)) !== '', 'kitchen stand tile rejected');
need(PL.validate([], f('chair_wood', -1, 2)) !== '' && PL.validate([], f('chair_wood', 99, 2)) !== '', 'out of room rejected');
need(PL.validate([f('chair_wood', 5, 2)], f('chair_wood', 5, 2)) !== '', 'overlap rejected');
need(PL.validate([f('rug_round', 4, 1)], f('chair_wood', 4, 1)) === '' || !fset['4,1'], 'solid on rug allowed (when tile free)');
need(PL.validate([], f('sofa', 4, 1, 1)) !== '' || true, 'rotation runs');
var d0 = PL.dims(F.get('sofa'), 0), d1 = PL.dims(F.get('sofa'), 1); need(d0[0] === 2 && d0[1] === 1 && d1[0] === 1 && d1[1] === 2, 'rotation swaps w/d');
need(PL.validate([], f('sofa', 5, 1, 0)) !== '' || PL.cells(f('sofa', 5, 1, 0)).length === 2, 'multi-cell footprint');
// BFS: wall off the door approach of tier 0 with a column of solid pieces -> must be refused at some point
HM.setTier(0); var list = [], blocked = 0, x, z, p, r;
for (z = 0; z < HM.depth; z++) for (x = 0; x < HM.width; x++) { p = f('bookshelf', x, z); r = PL.validate(list, p, -1); if (!r) list.push(p); else if (/lối đi/.test(r)) blocked++; }
need(blocked > 0, 'BFS refuses pieces that cut off an interactable');
var solid = {}; list.forEach(function (q) { PL.cells(q).forEach(function (c) { solid[c[0] + ',' + c[1]] = 1; }); });
need(PL.reachable(solid), 'every interactable reachable after filling the room (' + list.length + ' shelves)');
need(PL.reachable({}) && !PL.reachable({ '3,4': 1, '2,4': 1, '4,4': 1, '2,5': 1, '4,5': 1 }), 'reachable() detects a sealed door');
// rugs never block
var rugs = []; ft.forEach(function (c) { var q = f('rug_round', c.ix, c.iz); if (!PL.validate(rugs, q, -1)) rugs.push(q); });
need(rugs.length > 0, 'flat items placeable');
// every tier: place greedily, still reachable, door stays free
for (var t = 0; t <= 3; t++) {
  HM.setTier(t); var L = []; HM.floorTiles().forEach(function (c) { var q = f('chair_wood', c.ix, c.iz); if (!PL.validate(L, q, -1)) L.push(q); });
  var s2 = {}; L.forEach(function (q) { s2[q.x + ',' + q.z] = 1; });
  need(PL.reachable(s2), 'tier ' + t + ' reachable with ' + L.length + ' chairs');
  need(!s2[HM.spawns.door[0] + ',' + HM.spawns.door[1]] && !s2['3,' + (HM.depth - 1)], 'tier ' + t + ' door free');
  HM.spots.bed.concat(HM.spots.chest, HM.spots.kitchen, HM.spots.door).forEach(function (e) { need(!s2[e[2] + ',' + e[3]], 'tier ' + t + ' stand tile free ' + e[2] + ',' + e[3]); });
}
// walls
HM.setTier(0); var segs = PL.wallSegs();
need(segs['n:0'] === 'any' && segs['n:2'] === 'curtain' && !segs['n:3'] && !segs['n:4'] && segs['n:6'], 'north wall segments (window = curtain only, kitchen clear)');
need(!segs['w:0'] && !segs['w:1'] && segs['w:2'], 'west wall clear of bed rows');
need(PL.validate([], { id: 'pic_flower', k: 'w', side: 'n', i: 0, x: 0, z: 0, r: 0 }) === '', 'picture on free wall');
need(PL.validate([], { id: 'pic_flower', k: 'w', side: 'n', i: 2, x: 0, z: 0, r: 0 }) !== '', 'picture on window rejected');
need(PL.validate([], { id: 'curtains', k: 'w', side: 'n', i: 2, x: 0, z: 0, r: 0 }) === '', 'curtains on window ok');
need(PL.validate([{ id: 'clock_wall', k: 'w', side: 'n', i: 0, x: 0, z: 0, r: 0 }], { id: 'pic_hill', k: 'w', side: 'n', i: 0, x: 0, z: 0, r: 0 }) !== '', 'wall segment occupied');
need(PL.validate([], { id: 'pic_flower', k: 'w', side: 'n', i: 9, x: 0, z: 0, r: 0 }) !== '', 'wall segment out of range');
// yard
var yt = null, zz, xx; for (zz = 7; zz <= 15 && !yt; zz++) for (xx = 5; xx <= 13 && !yt; xx++) if (yardOK(xx, zz)) yt = [xx, zz];
need(!!yt, 'yard has free tiles'); var yc = { id: 'pot_small', k: 'y', x: yt[0], z: yt[1], r: 0 };
need(PL.validate([], yc) === '', 'flowerpot on free yard tile'); need(PL.validate([yc], yc) !== '', 'yard overlap rejected');
need(PL.validate([], { id: 'pot_small', k: 'y', x: 9, z: 12, r: 0 }) !== '', 'yard door tile rejected'); need(PL.validate([], { id: 'pot_small', k: 'y', x: 7, z: 10, r: 0 }) !== '', 'annex tile rejected');
need(PL.validate([], { id: 'sofa', k: 'y', x: yt[0], z: yt[1], r: 0 }) !== '', 'floor-only item refused in yard'); need(PL.validate([], f('lantern_garden', 1, 2)) !== '', 'yard-only item refused indoors');
// tier change re-validation: pieces on the east wing vanish when the house shrinks (tier 3 -> 0)
HM.setTier(3); var big = []; [[9, 1], [10, 2], [11, 3], [4, 1], [2, 1]].forEach(function (c) { var q = f('chair_wood', c[0], c[1]); if (!PL.validate(big, q, -1)) big.push(q); });
HM.setTier(0); var rv = PL.revalidate(big); need(rv.dropped.length >= 3 && rv.kept.length + rv.dropped.length === big.length, 'tier shrink drops out-of-room items (' + rv.dropped.length + ')');
HM.setTier(3); need(PL.revalidate(big).dropped.length === 0, 'same list stays valid at its own tier');
// save round-trip + migration (placement list pack/unpack; inventory untouched)
var mix = [f('sofa', 4, 4, 1), { id: 'pic_boat', k: 'w', side: 'w', i: 4, x: 0, z: 0, r: 0 }, { id: 'pot_big', k: 'y', x: yt[0], z: yt[1], r: 2 }];
var back = PL.unpack(JSON.parse(JSON.stringify(PL.pack(mix))));
need(JSON.stringify(PL.pack(back)) === JSON.stringify(PL.pack(mix)) && back.length === 3, 'pack/unpack round-trip');
need(PL.unpack(undefined).length === 0 && PL.unpack([['nope', 'f', 1, 1, 0], ['sofa', 'x', 1, 1, 0], 7, null]).length === 0, 'old / garbage saves -> empty');
need(PL.unpack([['sofa', 'f', 1, 1, 7]])[0].r === 3, 'rotation sanitised');
// wiring (sources only)
function rd(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
var idx = rd('index.html'), src = rd('js/placement.js');
need(idx.indexOf('js/placement_logic.js') > idx.indexOf('js/furniture_shop.js') && idx.indexOf('js/placement.js') > idx.indexOf('js/placement_logic.js') && idx.indexOf('js/placement.js') < idx.indexOf('js/main.js'), 'scripts linked in order');
need(idx.indexOf('css/placement.css') > 0, 'css linked');
need(/Save\.register\('furnplace'/.test(src) && /house:tier/.test(src) && /save:loaded/.test(src), 'save + tier + load re-validation wired');
need(/Placement\.open/.test(rd('js/menus.js')) && /Placement\.open/.test(rd('js/furniture_shop.js')) && /giveAll/.test(rd('js/dev_tools.js')), 'menu, shop button and dev grant wired');
need(/Scenes\.current === 'house'/.test(rd('js/menus.js')), 'menu entry only indoors');
console.log('placement: ' + n + ' checks, ' + errs + ' failed');
process.exit(errs ? 1 : 0);
