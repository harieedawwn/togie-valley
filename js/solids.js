/* Stage 17 BUGFIX a: single place that keeps every visible solid blocked (node-readable core + browser wiring).
 * Outdoor: stone well, plot signs (per farm tier), house annex (per house tier) are re-asserted after loads/upgrades.
 * Indoor: non-flat floor furniture footprints block walking; seats/beds keep one interaction tile free. */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined' && window.Game) || {}, S = {}, hset = {};
  var WELL = { tx: 12, tz: 14 }, SIGNS = { 0: [[12, 14], [27, 14]], 2: [10, 14], 3: [29, 13] }, ANNEX = [[7, 10], [7, 11]];
  function key(x, z) { return x + ',' + z; }
  function needsAccess(it) { return it.cat === 'seat' || /bed/.test(it.id); }
  /** Blocked local house tiles {"ix,iz":1} for a placement list. Flat items (rugs, mats) never block. */
  S.houseSet = function (list, furn, PL, hm) {
    var set = {}, access = [];
    (list || []).forEach(function (p) {
      var it = p.k === 'f' && furn.get(p.id); if (!it || it.flat) return;
      var cells = PL.cells(p); cells.forEach(function (c) { set[key(c[0], c[1])] = 1; });
      if (needsAccess(it)) access.push(cells);
    });
    access.forEach(function (cells) {   // keep an interaction tile free: some neighbour must be walkable and unblocked
      var free = cells.some(function (c) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var x = c[0] + d[0], z = c[1] + d[1]; return hm.isWalkable(x, z) && !set[key(x, z)]; }); });
      if (!free) delete set[key(cells[0][0], cells[0][1])];
    });
    return set;
  };
  /** World tiles that must be blocked outdoors for farm tier f / house tier h (signs/annex data mirrors land_farm.js / land_house.js). */
  S.outdoorTiles = function (f, h, o) {
    o = o || {}; var well = o.well || WELL, signs = o.signs ? o.signs(f) : [f >= 2 ? SIGNS[2] : SIGNS[0][0], f >= 3 ? SIGNS[3] : SIGNS[0][1]];
    var out = [[well.tx, well.tz]].concat(signs); if (h >= 2) out = out.concat(ANNEX); return out;
  };
  S.houseBlocked = function (ix, iz) { return hset[key(ix, iz)] === 1; };
  S.set = function () { return hset; };
  S.applyOutdoor = function () {
    var w = G.World, f = G.LandFarm ? G.LandFarm.built : 0, h = G.LandHouse ? G.LandHouse.built : 0;
    if (!w || !w.setBlocked) return;
    S.outdoorTiles(f, h, { well: G.Farm && G.Farm.WELL, signs: G.LandFarm && G.LandFarm.signsFor }).forEach(function (c) { w.setBlocked(c[0], c[1], true); });
  };
  S.refresh = function () {
    var P = G.Placement;
    hset = (P && G.Furniture && G.PlaceLogic && G.HouseMap) ? S.houseSet(P.list(), G.Furniture, G.PlaceLogic, G.HouseMap) : {};
    S.applyOutdoor();
  };
  if (G.Events && G.Events.on) ['save:loaded', 'house:tier', 'land:changed', 'furniture:placed', 'scene:changed'].forEach(function (n) { G.Events.on(n, function () { S.refresh(); }); });
  if (typeof module !== 'undefined' && module.exports) module.exports = S; else G.Solids = S;
})();
