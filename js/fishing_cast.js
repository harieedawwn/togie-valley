/* Togie Valley - fishing_cast.js (Round 2 stage 3): tap routing for fishing. Depends on fishing.js, interact.js, player.js, world.js, scenes.js, render.js, ui.js.
 * Interact.tapHook(e) -> true = tap consumed. Rules:
 *  - fishing (cast/wait): tap on non-water = Fishing.reelIn() and the tap is consumed; tap on water = ignored. bite/reel/result: taps are minigame input.
 *  - idle: tap on water + rod in hand = turn and cast (<= 7 tiles) or walk to the nearest shore tile then cast; no rod = toast; non-water = normal tap (seated: stands up and walks).
 * Also wraps Interact.useFacing so the action button casts toward water in front. No effect indoors. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.FishOdds || !G.Fishing || !G.Interact || !G.Player || !G.World || !G.Scenes || !G.Render || !G.UI) { console.error('[fishing_cast] missing deps'); return; }
  var F = G.Fishing, I = G.Interact, P = G.Player, W = G.World, Scenes = G.Scenes, UI = G.UI;
  var RANGE = 7, pend = 0;

  function isWater(tx, tz) { return W.tileType(tx + 0.5, tz + 0.5) === 'water'; }
  function say() { UI.toast('Hãy cầm cần câu nhé', 'star'); }
  function busy() { return P.isLocked() || (G.Seat && G.Seat.busy()); }
  function distTo(tx, tz) { var dx = tx + 0.5 - P.pos.x, dz = tz + 0.5 - P.pos.z; return Math.sqrt(dx * dx + dz * dz); }
  function touchesWater(tx, tz) { return isWater(tx + 1, tz) || isWater(tx - 1, tz) || isWater(tx, tz + 1) || isWater(tx, tz - 1); }

  /* Walk to the nearest reachable shore tile that is within range of the water tile, then cast automatically. */
  function walkAndCast(tx, tz) {
    var pt = P.tile(), list = [], x, z, d, my = ++pend, i;
    for (z = tz - RANGE; z <= tz + RANGE; z++) for (x = tx - RANGE; x <= tx + RANGE; x++) {
      if (isWater(x, z) || !Scenes.isWalkableTile(x, z) || !touchesWater(x, z)) continue;
      d = Math.sqrt((x - tx) * (x - tx) + (z - tz) * (z - tz));
      if (d > RANGE - 1) continue;
      list.push({ x: x, z: z, s: Math.sqrt((x - pt.tx) * (x - pt.tx) + (z - pt.tz) * (z - pt.tz)) + d * 0.1 });
    }
    list.sort(function (a, b) { return a.s - b.s; });
    for (i = 0; i < list.length && i < 8; i++) {
      if (P.walkTo(list[i].x, list[i].z, function () {
        if (my !== pend || !isWater(tx, tz)) return;
        if (F.heldRod()) F.castAt(tx, tz); else say();
      })) return;
    }
    UI.toast('Chưa tới được chỗ đó', 'warn');
  }

  I.tapHook = function (e) {
    if (Scenes.current !== 'outdoor') return false;
    var st = F.state, tile = G.Render.screenToTile(e.x, e.y, 0), water;
    if (st !== 'off' && st !== 'idle') {   // a line is out
      if (st === 'bite' || st === 'reel' || st === 'result') return true;
      water = tile && isWater(tile.tx, tile.tz);
      if (!water) F.reelIn();
      return true;
    }
    if (!tile) return false;
    if (!isWater(tile.tx, tile.tz)) { pend++; return false; }
    if (busy()) return false;
    if (!F.heldRod()) { say(); return true; }
    if (distTo(tile.tx, tile.tz) <= RANGE) { pend++; F.castAt(tile.tx, tile.tz); return true; }
    walkAndCast(tile.tx, tile.tz);
    return true;
  };

  /* Action button / Space: cast toward the water in front (random water tile along the facing line (shallow to deep), within range); while a line is out: pull in during the wait, ignore otherwise. */
  var useFacing = I.useFacing, DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  I.useFacing = function () {
    var st = F.state, d, t, k, hit = -1;
    if (st !== 'off' && st !== 'idle') { F.tapWait(); return true; }
    if (Scenes.current === 'outdoor' && !busy() && F.heldRod()) {
      d = DIR[P.facing] || DIR.s; t = P.tile();
      hit = G.FishOdds.facingK(isWater, t.tx, t.tz, d, RANGE, Math.random());   // any depth, same on every device
      if (hit > 0) {
        pend++; F.castAt(t.tx + d[0] * hit, t.tz + d[1] * hit); return true;
      }
    }
    return useFacing.apply(I, arguments);
  };
})();
