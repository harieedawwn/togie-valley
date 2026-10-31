/* Togie Valley - house_map.js (Stage 5 fix): interior collision data for the 'house' scene.
 * Plain data + tiny helpers, readable by the browser (Game.HouseMap) and by node (module.exports).
 * Legend: . floor  r rug (walkable)  D door tile (walkable)  B bed  C chest  K counter  O stove  T table  P plant (blocked).
 * Local tile (ix,iz): ix = column, iz = row. Spot entry = [ix, iz, standIx, standIz, facing].
 */
(function (root) {
  'use strict';
  var rows = [
    'B..KO.C',
    'B......',
    '.rrr...',
    '.rrrTT.',
    '..r....',
    '...DD.P'
  ];
  // Stage 16 G3: tier -> [width, depth]; tier 0 is the original 7x6 room (rows above, unchanged).
  var TIERS = [[7, 6], [10, 6], [13, 6], [13, 8]];
  function gen(t) {
    var W = TIERS[t][0], D = TIERS[t][1], g = [], x, z, r;
    for (z = 0; z < D; z++) { r = []; for (x = 0; x < W; x++) r.push('.'); g.push(r); }
    function put(x, z, c) { g[z][x] = c; }
    put(0, 0, 'B'); put(0, 1, 'B'); put(3, 0, 'K'); put(4, 0, 'O'); put(6, 0, 'C');
    [[1, 2], [2, 2], [3, 2], [1, 3], [2, 3], [3, 3], [2, 4]].forEach(function (c) { put(c[0], c[1], 'r'); });
    put(4, 3, 'T'); put(5, 3, 'T'); put(3, D - 1, 'D'); put(4, D - 1, 'D'); put(W - 1, D - 1, 'P');
    return g.map(function (a) { return a.join(''); });
  }
  var WALK = { '.': 1, 'r': 1, 'D': 1, 'b': 1 };   // 'b' = default bed hidden (a placed bed furniture replaced it)
  var Map = {
    rows: rows,
    width: rows[0].length,
    depth: rows.length,
    at: function (ix, iz) { var r = Map.rows; return (iz >= 0 && iz < r.length && ix >= 0 && ix < r[iz].length) ? r[iz].charAt(ix) : ' '; },
    isWalkable: function (ix, iz) { return !!WALK[Map.at(ix, iz)]; },
    spots: {
      bed: [[0, 0, 1, 0, 'w'], [0, 1, 1, 1, 'w']],
      chest: [[6, 0, 6, 1, 'n']],
      kitchen: [[3, 0, 3, 1, 'n'], [4, 0, 4, 1, 'n']],
      door: [[3, 5, 3, 5, 's'], [3, 6, 3, 5, 's'], [4, 5, 4, 5, 's'], [4, 6, 4, 5, 's']]
    },
    // spawns: [ix, iz, facing]; always free floor, facing into the room
    spawns: { wake: [1, 2, 'e'], bed: [1, 1, 'e'], door: [3, 4, 'n'] },
    tier: 0, TIERS: TIERS, bedHidden: false,
    // Stage 17 FURN: hide/restore the default bed solid (B <-> b); survives setTier
    setBedHidden: function (v) { Map.bedHidden = !!v; Map.rows = Map.rows.map(function (r) { return Map.bedHidden ? r.replace(/B/g, 'b') : r.replace(/b/g, 'B'); }); },
    // Rebuild rows/size/spots/spawns for a house tier 0..3 (in place, so references to Map stay valid).
    setTier: function (t) {
      t = Math.max(0, Math.min(3, t | 0)); var W = TIERS[t][0], D = TIERS[t][1];
      Map.rows = t === 0 ? ORIG.slice() : gen(t); Map.tier = t; Map.width = W; Map.depth = D;
      if (Map.bedHidden) Map.setBedHidden(true);
      Map.spots = { bed: [[0, 0, 1, 0, 'w'], [0, 1, 1, 1, 'w']], chest: [[6, 0, 6, 1, 'n']], kitchen: [[3, 0, 3, 1, 'n'], [4, 0, 4, 1, 'n']], door: [[3, D - 1, 3, D - 1, 's'], [3, D, 3, D - 1, 's'], [4, D - 1, 4, D - 1, 's'], [4, D, 4, D - 1, 's']] };
      Map.spawns = { wake: [1, 2, 'e'], bed: [1, 1, 'e'], door: [3, D - 2, 'n'] };
    },
    // Free floor tiles ('.' only: no furniture, rug, door, spawn or door-approach tiles), local coords [{ix,iz}]
    floorTiles: function () {
      var out = [], x, z, D = Map.depth, sp = Map.spawns, bad = {};
      [sp.wake, sp.bed, sp.door].forEach(function (a) { bad[a[0] + ',' + a[1]] = 1; });
      for (z = 0; z < D; z++) for (x = 0; x < Map.width; x++) {
        if (Map.at(x, z) !== '.' || bad[x + ',' + z] || z >= D - 2 && x >= 2 && x <= 5) continue;
        if (Map.spots.chest[0][3] === z && Map.spots.chest[0][2] === x) continue;   // chest stand tile
        if (Map.spots.kitchen.some(function (s) { return s[2] === x && s[3] === z; }) || Map.spots.bed.some(function (s) { return s[2] === x && s[3] === z; })) continue;
        out.push({ ix: x, iz: z });
      }
      return out;
    }
  };
  var ORIG = rows.slice();
  if (root.Game) root.Game.HouseMap = Map;
  if (typeof module !== 'undefined' && module.exports) module.exports = Map;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
