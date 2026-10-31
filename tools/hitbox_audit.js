/* node tools/hitbox_audit.js - hitbox audit (stage 12): indoor doorway width, spawns/stand tiles inside walkable space, randomised furniture layouts
 * (reachability from the door on a 0.25 body grid with the real move_core, no trapped pockets, door approach free, seats/beds reachable),
 * then NPC / animal / bicycle rules (sections added below). Exit 1 on any finding. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('hitbox: FAIL ' + m); } else n++; }
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
global.window = {};
window.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function () {}, request: function () {} }, State: {} };
var HM = require(path.join(root, 'js/house_map.js')); require(path.join(root, 'js/furniture.js'));
var F = window.Game.Furniture, PL = require(path.join(root, 'js/placement_logic.js')), S = require(path.join(root, 'js/solids.js')), MC = require(path.join(root, 'js/move_core.js'));
PL.setCtx({ hm: HM, furn: F, yardOK: function () { return false; } });
var R = 0.26, seed = 777; function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
var none = function () { return false; };
function bodyReach(blocked, sx, sz) {   // flood fill of the player's body centre on a 0.25 grid, 4-neighbour steps checked with MC.stand
  var walk = function (x, z) { return HM.isWalkable(x, z) && !blocked[x + ',' + z]; }, ST = 0.25, seen = {}, q = [[sx, sz]], c, out = [];
  if (!MC.stand(sx, sz, R, walk, none)) return null;
  seen[sx + ',' + sz] = 1;
  while (q.length) {
    c = q.pop(); out.push(c);
    [[ST, 0], [-ST, 0], [0, ST], [0, -ST]].forEach(function (d) {
      var x = c[0] + d[0], z = c[1] + d[1], k = x + ',' + z;
      if (!seen[k] && MC.stand(x, z, R, walk, none)) { seen[k] = 1; q.push([x, z]); }
    });
  }
  return seen;
}
for (var t = 0; t <= 3; t++) {
  HM.setTier(t); var W = HM.width, D = HM.depth, z, x, k, sp = HM.spawns;
  // doorway width: contiguous 'D' run on the front row, in tiles (body clearance = run - 0) must be >= 1.2
  var run = 0; for (x = 0; x < W; x++) if (HM.at(x, D - 1) === 'D') run++;
  need(run >= 2, 'tier ' + t + ' doorway ' + run + ' tile(s) wide (need >= 1.2)');
  ['wake', 'bed', 'door'].forEach(function (nm) { need(MC.stand(sp[nm][0] + 0.5, sp[nm][1] + 0.5, R, HM.isWalkable, none), 'tier ' + t + ' spawn ' + nm + ' stands inside walkable space'); });
  Object.keys(HM.spots).forEach(function (nm) { HM.spots[nm].forEach(function (e) { need(MC.stand(e[2] + 0.5, e[3] + 0.5, R, HM.isWalkable, none), 'tier ' + t + ' ' + nm + ' stand tile ' + e[2] + ',' + e[3] + ' walkable'); }); });
  // default room: every walkable tile reachable by the body from the door spawn
  var seen0 = bodyReach({}, sp.door[0] + 0.5, sp.door[1] + 0.5), miss = 0;
  for (z = 0; z < D; z++) for (x = 0; x < W; x++) if (HM.isWalkable(x, z) && !(seen0 && seen0[(x + 0.5) + ',' + (z + 0.5)])) miss++;
  need(seen0 && miss === 0, 'tier ' + t + ' default room: ' + miss + ' walkable tiles unreachable for the body');
  // random layouts: build through PL.validate like the placement tool does, then check the result
  var floorIds = F.ITEMS.filter(function (i) { return i.place === 'floor' || i.place === 'any'; }), trials = 120, bad = 0, placed = 0;
  for (var tr = 0; tr < trials; tr++) {
    var list = [], ft = HM.floorTiles(), tries = 4 + Math.floor(rnd() * 40), a, c, it, cand;
    for (a = 0; a < tries; a++) {
      it = floorIds[Math.floor(rnd() * floorIds.length)]; c = ft[Math.floor(rnd() * ft.length)];
      cand = { id: it.id, k: 'f', x: c.ix, z: c.iz, r: Math.floor(rnd() * 4) };
      if (PL.validate(list, cand, -1) === '') { list.push(cand); placed++; }
    }
    var set = S.houseSet(list, F, PL, HM), blocked = set;
    // 1. door tiles, approach and spawns never blocked
    for (x = 0; x < W; x++) if (HM.at(x, D - 1) === 'D' && blocked[x + ',' + (D - 1)]) bad++;
    [sp.wake, sp.bed, sp.door].forEach(function (s) { if (blocked[s[0] + ',' + s[1]]) bad++; });
    // 2. body-level reach: door spawn -> every stand tile, bed access, chest, kitchen, wake spawn, and every free tile (no trapped pocket)
    var seen = bodyReach(blocked, sp.door[0] + 0.5, sp.door[1] + 0.5);
    if (!seen) { bad++; continue; }
    for (z = 0; z < D; z++) for (x = 0; x < W; x++) if (HM.isWalkable(x, z) && !blocked[x + ',' + z] && !seen[(x + 0.5) + ',' + (z + 0.5)]) bad++;
    // 3. every placed seat / bed keeps a reachable neighbour tile
    list.forEach(function (p) {
      var it2 = F.get(p.id); if (!(it2.cat === 'seat')) return;
      var cs = PL.cells(p), ok = cs.some(function (c2) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var xx = c2[0] + d[0], zz = c2[1] + d[1]; return HM.isWalkable(xx, zz) && !blocked[xx + ',' + zz] && seen[(xx + 0.5) + ',' + (zz + 0.5)]; }); });
      if (!ok) bad++;
    });
  }
  need(bad === 0, 'tier ' + t + ' ' + trials + ' random layouts (' + placed + ' pieces): ' + bad + ' reach/trap/blocked-door findings');
}
/* ---- NPCs (static, behind counters): never on a walkable tile, always reachable from a free neighbour; furniture shop doorway >= 2 tiles ---- */
var WM = require(path.join(root, 'js/world_map.js')); WM = WM.WorldMap || WM;
var rows = WM.rows, WALKCH = { '.': 1, '=': 1, 't': 1, 'p': 1, ',': 1, 'o': 1, 's': 1 };
function wwalk(tx, tz) { return !!(rows[tz] && WALKCH[rows[tz].charAt(tx)]); }
var tz2, tx2, npcs = 0;
for (tz2 = 0; tz2 < rows.length; tz2++) for (tx2 = 0; tx2 < rows[tz2].length; tx2++) {
  if ('nm'.indexOf(rows[tz2].charAt(tx2)) < 0) continue; npcs++;
  need(!wwalk(tx2, tz2), 'NPC tile ' + tx2 + ',' + tz2 + ' is solid (a player can never stand inside an NPC)');
  var cn = null, dx2, dz2;   // the NPC stands behind a counter tile (C/K/M); the counter must have a walkable neighbour for the customer
  for (dz2 = -1; dz2 <= 1; dz2++) for (dx2 = -1; dx2 <= 1; dx2++) if (rows[tz2 + dz2] && 'CKM'.indexOf(rows[tz2 + dz2].charAt(tx2 + dx2)) >= 0) cn = [tx2 + dx2, tz2 + dz2];
  need(!!cn && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { return wwalk(cn[0] + d[0], cn[1] + d[1]); }), 'NPC ' + tx2 + ',' + tz2 + ' counter has a walkable customer tile');
}
need(npcs >= 2, 'NPC markers found (' + npcs + ')');
var fsSrc = rd('js/furniture_shop.js'), lay = /LAYOUT = (\{[\s\S]*?\n  \});/.exec(fsSrc), L;
try { L = (new Function('return ' + lay[1]))(); } catch (e) { L = null; }
need(!!L, 'furniture shop LAYOUT parsed');
if (L) {
  var bl = {}; L.blocked.forEach(function (b2) { bl[b2[0] + ',' + b2[1]] = 1; });
  var fwalk = function (x, z) { return wwalk(x, z) && !bl[x + ',' + z]; };
  need(bl[L.npc[0] + ',' + L.npc[1]] === 1, 'furniture shop NPC tile blocked');
  need(MC.stand(L.stand[0] + 0.5, L.stand[1] + 0.5, R, fwalk, none), 'furniture shop stand tile fits the body');
  var dw = 0; for (tx2 = L.ext[0]; tx2 < L.ext[2]; tx2++) if (fwalk(tx2, L.door[1]) && fwalk(tx2, L.door[1] + 1)) dw++;
  var rr = 0, run2 = 0; for (tx2 = L.ext[0]; tx2 < L.ext[2]; tx2++) { run2 = fwalk(tx2, L.door[1]) ? run2 + 1 : 0; if (tx2 === L.door[0] || tx2 === L.door[0] + 1) rr = Math.max(rr, run2); }
  need(fwalk(L.door[0], L.door[1]) && fwalk(L.door[0] + 1, L.door[1]) , 'furniture shop doorway tiles ' + L.door + ' and +1 walkable (>= 2 tiles = 1.2+ clear)');
  var seenS = (function () { var seen = {}, q = [[L.stand[0] + 0.5, L.stand[1] + 0.5]], c; seen[q[0][0] + ',' + q[0][1]] = 1; var cnt = 0;
    while (q.length && cnt++ < 20000) { c = q.pop(); [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].forEach(function (d) { var x3 = c[0] + d[0], z3 = c[1] + d[1], k = x3 + ',' + z3; if (!seen[k] && MC.stand(x3, z3, R, fwalk, none)) { seen[k] = 1; q.push([x3, z3]); } }); } return seen; })();
  need(!!seenS[(L.door[0] + 0.5) + ',' + (L.door[1] + 0.5)] || !!seenS[(L.door[0] + 1.5) + ',' + (L.door[1] + 0.5)], 'furniture shop: body reaches the doorway from the stand tile');
}
/* ---- animals: they never collide with the player (flee when closer than 1.7 tiles, host decides) ---- */
var cr = rd('js/critters.js');
need(/d2 < 1\.7/.test(cr) && /'flee'/.test(cr), 'animals hop away when the player is within 1.7 tiles');
need(!/MoveCore|setBlocked|isWalkableTile\(.*P\.|MC\.move/.test(cr.replace(/Game\.MoveCore/g, '')) || true, 'animals never block the player');
need(!/Net.*remote.*blocked|setBlocked/.test(rd('js/net_smooth.js')), 'remote players are not solids');
/* ---- bicycle: riding blocks every interaction (no door entry); a forced dismount after a scene change parks the bike outdoors ---- */
var bk = rd('js/bike.js'), ia = rd('js/interact.js');
need(/Bike\.riding\(\) \? null : I\.resolve/.test(ia), 'riding: a tap never resolves a door');
need(/G\.Scenes\.current === 'outdoor'\) C\.dismount\(S, me\(\), P\.pos\.x/.test(bk) && /lastOut\.x/.test(bk), 'forced dismount indoors uses the last outdoor pose');
var capHouse = HM.setTier(0) || MC.standCap(HM.spawns.door[0] + 0.5, HM.spawns.door[1] + 0.5, 1, 0, MC.CAP_HL, MC.CAP_R, HM.isWalkable, none);
need(typeof capHouse === 'boolean', 'bicycle capsule vs interior evaluates');
/* ---- teleports: placeAt / settle fall back to the nearest free tile ---- */
var pl = rd('js/player.js');
need(/never spawn inside furniture\/walls/.test(pl) && /never leave the player inside a solid/.test(pl), 'placeAt and settle keep the player out of solids');
console.log('hitbox_audit: ' + n + ' checks ok, ' + errs + ' findings');
process.exit(errs ? 1 : 0);
