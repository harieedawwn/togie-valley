/* Round 3 stage 4: node tools/mattress_check.js - old mattress data, decay by day, pack/unpack of the placement day, Game.Beds registry (old save lists the built-in bed), wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('mattress: FAIL ' + m); } else n++; }
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
global.window = {};
var list = [], G = window.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function () {}, request: function () {} }, State: {}, Time: { day: 5 }, House: { OX: 100, OZ: 100, bedHidden: false }, Placement: { list: function () { return list.slice(); } } };
require(path.join(root, 'js/house_map.js')); require(path.join(root, 'js/furniture.js'));
var F = G.Furniture, PL = require(path.join(root, 'js/placement_logic.js')); G.PlaceLogic = PL; PL.setCtx({ hm: G.HouseMap, furn: F, yardOK: function () { return false; } });
var it = F.get('mattress_old');
need(it && it.name === 'Nệm cũ' && it.price === 120 && it.cat === 'seat' && it.w === 1 && it.d === 2 && it.place === 'floor' && it.decay, 'shop data');
need(it.sell === 36 && F.sellPrice('mattress_old') === 36, 'sell 30 percent');
need(!it.bed && !F.get('bed_single').decay && !F.get('bed_double').decay && F.get('bed_single').sell === 225, 'beds stay permanent');
need(F.byCat('seat').indexOf(it) >= 0 && PL.kindFor(it, 'outdoor') === 'f', 'in category, indoor only');
need(F.decayStage(5, 5) === 0 && F.decayStage(5, 6) === 1 && F.decayStage(5, 7) === 2 && F.decayStage(5, 8) === 3 && F.decayStage(5, 4) === 0 && F.decayStage(undefined, 5) === 0, 'decayStage by day');
var sig = {}, sag = [], s;
for (s = 0; s <= 3; s++) { var parts = F.parts('mattress_old', s); sig[JSON.stringify(parts)] = 1; need(parts.length >= 5 && parts.length <= 14, 'stage ' + s + ' part count ' + parts.length); sag.push(parts[1][6]); }
need(Object.keys(sig).length === 4, 'four distinct variants');
need(sag[0] > sag[1] && sag[1] > sag[2] && sag[2] > sag[3], 'sag grows with stage');
need(F.parts('mattress_old') === F.parts('mattress_old', 0) || JSON.stringify(F.parts('mattress_old')) === JSON.stringify(F.parts('mattress_old', 0)), 'default parts = stage 0');
var pk = PL.pack([{ id: 'mattress_old', k: 'f', x: 2, z: 3, r: 1, d: 5 }, { id: 'bed_single', k: 'f', x: 4, z: 1, r: 0 }]), up = PL.unpack(pk);
need(up.length === 2 && up[0].d === 5 && up[1].d === undefined && pk[1].length === 5, 'pack/unpack keeps placement day');
need(PL.unpack([['mattress_old', 'f', 2, 3, 1]])[0].d === undefined && PL.unpack([['chair_wood', 'f', 2, 3, 1, 9]])[0].d === undefined, 'old saves load unchanged');
require(path.join(root, 'js/beds.js')); var Bd = G.Beds;
need(Bd && Bd.spots, 'Beds API');
var sp = Bd.spots();
need(sp.length === 1 && sp[0].id === 'house' && sp[0].kind === 'house' && sp[0].occupant === null && sp[0].lie.y > 0, 'old save (nothing placed) lists the built-in bed');
list = [{ id: 'mattress_old', k: 'f', x: 2, z: 3, r: 0, d: 5 }, { id: 'mattress_old', k: 'f', x: 4, z: 3, r: 0, d: 2 }, { id: 'chair_wood', k: 'f', x: 1, z: 1, r: 0 }];
sp = Bd.spots(); need(sp.length === 2 && sp[1].kind === 'mattress' && sp[1].id === 'mattress_old@2,3', 'placed mattress listed, broken one and chairs skipped');
need(Math.abs(sp[1].x - 102.5) < 1e-9 && Math.abs(sp[1].z - 104) < 1e-9, 'world centre');
need(Bd.claim('mattress_old@2,3', 'p2') && !Bd.claim('mattress_old@2,3', 'p3') && Bd.claim('mattress_old@2,3', 'p2') && Bd.spots()[1].occupant === 'p2', 'claim');
need(Bd.release('mattress_old@2,3') && !Bd.release('mattress_old@2,3') && Bd.spots()[1].occupant === null, 'release');
need(!Bd.claim('nope', 'p2'), 'unknown spot');
Bd.claim('mattress_old@2,3', 'p2'); list = []; Bd.spots(); need(Bd.occupantOf('mattress_old@2,3') === null, 'occupancy pruned');
G.House.bedHidden = true; list = [{ id: 'bed_double', k: 'f', x: 2, z: 2, r: 0 }];
sp = Bd.spots(); need(sp.length === 1 && sp[0].kind === 'bed', 'placed bed replaces built-in');
var ix = rd('index.html'); need(ix.indexOf('js/beds.js') > ix.indexOf('js/placement.js') && ix.indexOf('js/beds.js') > ix.indexOf('js/furniture.js'), 'beds.js after its deps in index.html');
need(/decayTick/.test(rd('js/placement.js')) && /Nệm cũ đã hỏng và bị bỏ đi/.test(rd('js/placement.js')), 'placement decay wired');
console.log('mattress_check: ' + n + ' ok, ' + errs + ' failed'); process.exit(errs ? 1 : 0);
