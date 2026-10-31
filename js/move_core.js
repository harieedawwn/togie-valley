/* Togie Valley - move_core.js (Round 3 stage 3): node-readable movement core shared by js/player.js and tools/collision_fuzz.js.
 * MC.stand(x, z, r, walk, thin): square body of half-size r fits on walkable tiles and clears every thin solid (Game.ThinSolids.hit).
 * MC.move(pos, dx, dz, r, walk, thin): sub-steps no longer than MAXSTEP (0.2 tile), each axis resolved separately (blocked axis = push-out/slide). */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined' && window.Game) || {}, MC = { MAXSTEP: 0.2, MAXDT: 1 / 20 };
  MC.tile = function (v) { return Math.floor(v); };
  MC.stand = function (x, z, r, walk, thin) {
    var a = Math.floor(x - r), b = Math.floor(x + r), c = Math.floor(z - r), d = Math.floor(z + r);
    if (!walk(a, c) || !walk(b, c) || !walk(a, d) || !walk(b, d)) return false;
    return !(thin && thin(x, z, r));
  };
  MC.move = function (pos, dx, dz, r, walk, thin) {
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MC.MAXSTEP)), sx = dx / n, sz = dz / n, i, x, z;
    for (i = 0; i < n; i++) {
      x = pos.x + sx; if (MC.stand(x, pos.z, r, walk, thin)) pos.x = x;
      z = pos.z + sz; if (MC.stand(pos.x, z, r, walk, thin)) pos.z = z;
    }
  };
  /* Bicycle capsule: segment of half-length hl along the unit heading (hx,hz), radius r (~1.1 tile long, r 0.3). Tested as 3 spaced square bodies
   * (centre + both ends, spacing <= r, so no gaps) = slightly conservative. moveCap: sub-steps <= MAXSTEP, axes resolved separately (slide);
   * a turn that leaves the capsule inside a solid is pushed out a little (never tunnels, never traps). */
  MC.CAP_HL = 0.25; MC.CAP_R = 0.3;
  MC.standCap = function (x, z, hx, hz, hl, r, walk, thin) {
    return MC.stand(x, z, r, walk, thin) && MC.stand(x + hx * hl, z + hz * hl, r, walk, thin) && MC.stand(x - hx * hl, z - hz * hl, r, walk, thin);
  };
  var PUSH = [1, 0, -1, 0, 0, 1, 0, -1, 0.7, 0.7, -0.7, 0.7, 0.7, -0.7, -0.7, -0.7];
  MC.moveCap = function (pos, dx, dz, hx, hz, hl, r, walk, thin) {
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MC.MAXSTEP)), sx = dx / n, sz = dz / n, i, j, x, z, k;
    if (!MC.standCap(pos.x, pos.z, hx, hz, hl, r, walk, thin)) {   // rotated into a solid: nudge out by up to 0.12
      for (k = 1; k <= 3; k++) for (j = 0; j < 16; j += 2) {
        x = pos.x + PUSH[j] * 0.04 * k; z = pos.z + PUSH[j + 1] * 0.04 * k;
        if (MC.standCap(x, z, hx, hz, hl, r, walk, thin)) { pos.x = x; pos.z = z; k = 9; break; }
      }
    }
    for (i = 0; i < n; i++) {
      x = pos.x + sx; if (MC.standCap(x, pos.z, hx, hz, hl, r, walk, thin)) pos.x = x;
      z = pos.z + sz; if (MC.standCap(pos.x, z, hx, hz, hl, r, walk, thin)) pos.z = z;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MC; else G.MoveCore = MC;
})();
