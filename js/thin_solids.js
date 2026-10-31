/* Togie Valley - thin_solids.js (Round 3 stage 3): solids narrower than a tile that match the pier/bridge meshes (outdoors only).
 * Bridge rails (js/scenery.js: z 18.06 / 19.94, posts 0.1 wide) and pier posts (js/town.js pier(): water-edge corners with (px+pz) even, r 0.1).
 * S.hit(x, z, r): does a square body of half-size r overlap one of them? S.build(rows, bridge) is pure (used by tools/collision_fuzz.js). */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined' && window.Game) || {}, S = { rects: [] }, RZ = [18.06, 19.94], PH = 0.05, PR = 0.1;
  function at(rows, x, z) { return rows[z] ? rows[z].charAt(x) : ''; }
  S.build = function (rows, bridge) {
    var out = [], seen = {}, dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], x, z, i, d, e;
    function pier(c) { return c === 'p' || c === 's'; }
    function post(px, pz) { var k = px + ',' + pz; if (seen[k] || (px + pz) % 2) return; seen[k] = 1; out.push([px - PR, pz - PR, px + PR, pz + PR]); }
    if (bridge) RZ.forEach(function (rz) { out.push([bridge[0] - 1 - 0.01, rz - PH, bridge[1] + 2 + 0.01, rz + PH]); });
    for (z = 0; z < rows.length; z++) for (x = 0; x < rows[z].length; x++) {
      if (!pier(at(rows, x, z))) continue;
      for (i = 0; i < 4; i++) {
        d = dirs[i]; if (at(rows, x + d[0], z + d[1]) !== '~') continue;
        if (!d[0]) { e = z + (d[1] > 0 ? 1 : 0); post(x, e); post(x + 1, e); } else { e = x + (d[0] > 0 ? 1 : 0); post(e, z); post(e, z + 1); }
      }
    }
    return out;
  };
  S.init = function (rows, bridge) { S.rects = S.build(rows, bridge); return S.rects; };
  S.hit = function (x, z, r) {
    var a = S.rects, i, q;
    for (i = 0; i < a.length; i++) { q = a[i]; if (x + r > q[0] && x - r < q[2] && z + r > q[1] && z - r < q[3]) return true; }
    return false;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else { G.ThinSolids = S; if (G.WorldMap) S.init(G.WorldMap.rows, G.WorldMap.features.bridge); }
})();
