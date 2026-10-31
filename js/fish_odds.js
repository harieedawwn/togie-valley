/* Togie Valley - fish_odds.js (Round 3 stage 2): pure cast-quality + junk odds (no DOM), shared by fishing.js and tools/cast_odds.js.
 * Game.FishOdds: classify({casterDist, pierDist, shoreTouch, region}) -> 'good'|'bad', junkChance(q), rollJunk(q, r01) -> bool.
 * A cast is 'bad' only when hopeless: <= NEAR tiles from the caster or from a pier tile (post/edge), touching the shore, or in a tiny pond. Junk is rolled once, at bite time. */
(function (root) {
  var C = { NEAR: 1.5, TINY: 24, JUNK_BAD: 0.6, JUNK_GOOD: 0.01 };
  C.classify = function (c) {
    if (c.casterDist <= C.NEAR || c.pierDist <= C.NEAR || c.shoreTouch || c.region < C.TINY) return 'bad';
    return 'good';
  };
  /* typeAt(tx,tz) -> tile type string. Distance from the tile centre to the nearest pier/bridge plank rectangle (posts + edge), scanned within 2 tiles. */
  C.pierDist = function (typeAt, tx, tz) {
    var best = 9, dx, dz, ex, ez, d, cx = tx + 0.5, cz = tz + 0.5;
    for (dz = -2; dz <= 2; dz++) for (dx = -2; dx <= 2; dx++) {
      if (typeAt(tx + dx, tz + dz) !== 'pier') continue;
      ex = Math.max(tx + dx - cx, 0, cx - (tx + dx + 1)); ez = Math.max(tz + dz - cz, 0, cz - (tz + dz + 1));
      d = Math.sqrt(ex * ex + ez * ez); if (d < best) best = d;
    }
    return best;
  };
  /* A LAND tile (not water, not pier: piers have their own rule) among the 8 neighbours. */
  C.shoreTouch = function (typeAt, tx, tz) {
    var dx, dz, t;
    for (dz = -1; dz <= 1; dz++) for (dx = -1; dx <= 1; dx++) { t = typeAt(tx + dx, tz + dz); if ((dx || dz) && t !== 'water' && t !== 'pier') return true; }
    return false;
  };
  C.junkChance = function (q) { return q === 'bad' ? C.JUNK_BAD : C.JUNK_GOOD; };
  C.rollJunk = function (q, r) { return r < C.junkChance(q); };
  /* Action/Space cast (no pointer): water tile along the facing ray, any distance from the first water tile to the end of the contiguous water (<= range),
   * chosen by u in [0,1). Same for every device, so shallow, mid and deep zones are all reachable. -> k (1..range) or -1. */
  C.facingK = function (isWater, tx, tz, d, range, u) {
    var k, a = -1, b = -1;
    for (k = 1; k <= range; k++) { if (isWater(tx + d[0] * k, tz + d[1] * k)) { if (a < 0) a = k; b = k; } else if (a >= 0) break; }
    return a < 0 ? -1 : a + Math.min(b - a, Math.floor(u * (b - a + 1)));
  };
  root.Game = root.Game || {}; root.Game.FishOdds = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? (global.Game = global.Game || {}, { Game: global.Game }) : this));
