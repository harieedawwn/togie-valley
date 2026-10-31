/* Togie Valley - reel_core.js (Stage 16 D4): pure reel-minigame logic (no DOM), shared by fishing.js and tools/reel_sim.js.
 * Game.ReelCore: tierOf(def, isJunk), make(opts, rnd) -> R, step(R, dt, held, rnd) -> 'win'|'lose'|null, P (tunables).
 * Fixed 1/120 s substeps => frame-rate independent. Positions are 0..1 (0 = bottom). */
(function (root) {
  var C = {};
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(rnd, a, b) { return a + rnd() * (b - a); }

  /* Bar physics per input kind: up/down acceleration, damping, max speed, zone-height multiplier, edge forgiveness. */
  C.P = {
    touch: { up: 2.5, down: 1.8, damp: 2.1, vmax: 0.8, barMul: 1.5, margin: 0.045, gain: 0.30, drain: 0.075, grace: 1.4 },
    mouse: { up: 2.6, down: 1.9, damp: 2.1, vmax: 0.85, barMul: 1.5, margin: 0.04, gain: 0.30, drain: 0.078, grace: 1.3 }
  };
  /* Fish behaviour per tier: idle [min,max] s, dist [min,max] per move, spd base (+ per diff), accel smoothing. */
  C.TIERS = {
    trash:  { gm: 1, dm: 1, idle: [3.0, 7.0], dist: [0.03, 0.09], spd: 0.05, k: 0.00 },
    normal: { gm: 0.8, dm: 1.8, idle: [1.6, 3.6], dist: [0.08, 0.24], spd: 0.10, k: 0.015 },
    silver: { gm: 0.46, dm: 2.9, idle: [0.0, 0.12], dist: [0.10, 0.28], spd: 0.3, k: 0.015 },
    gold:   { gm: 0.72, dm: 2.0, idle: [0.25, 0.7], dist: [0.20, 0.42], spd: 0.6, k: 0.03 }
  };
  C.tierOf = function (def, isJunk) { return isJunk ? 'trash' : (def && (def.tier === 'silver' || def.tier === 'gold') ? def.tier : 'normal'); };

  C.make = function (o, rnd) {
    var P = C.P[o.touch ? 'touch' : 'mouse'], bh = clamp(o.bar * P.barMul, 0.18, 0.6);
    return {
      tier: o.tier, diff: o.diff || 1, beh: o.beh || 'smooth', touch: !!o.touch, bh: bh, P: P,
      bp: 0.1, bv: 0, fp: 0.5, fv: 0, ft: 0.5, ph: 'idle', pt: lerp(rnd, 0.6, 1.4), prog: 0.35, out: 0, time: 0, inside: true, jump: 0, lastProg: 0.35
    };
  };

  function pickMove(R, rnd) {
    var T = C.TIERS[R.tier], dist = lerp(rnd, T.dist[0], T.dist[1]), up = rnd() < 0.5;
    if (R.beh === 'sinker') up = rnd() < 0.3; else if (R.beh === 'floater') up = rnd() < 0.7;
    if (R.fp > 0.85) up = false; else if (R.fp < 0.15) up = true;       // fish never sticks to an edge
    R.ft = clamp(R.fp + (up ? dist : -dist), 0.05, 0.95);
    R.sp = T.spd + T.k * R.diff;
    R.ph = 'move'; R.pt = 4;
  }
  function sub(R, h, held, rnd) {
    var P = R.P, T = C.TIERS[R.tier];
    // fish
    R.pt -= h;
    if (R.ph === 'idle') { if (R.pt <= 0) pickMove(R, rnd); R.fv += (0 - R.fv) * Math.min(1, 6 * h); }
    else {
      var d = R.ft - R.fp, want = Math.abs(d) < 0.01 ? 0 : (d > 0 ? R.sp : -R.sp);
      R.fv += (want - R.fv) * Math.min(1, 6 * h);
      if (Math.abs(d) < 0.01 || R.pt <= 0) { R.ph = 'idle'; R.pt = lerp(rnd, T.idle[0], T.idle[1]); }
    }
    R.fp = clamp(R.fp + R.fv * h, 0.04, 0.96);
    // bar: hold = rise, release = fall; damped, no bounce, clamped to the track
    R.bv += (held ? P.up : -P.down) * h;
    R.bv *= Math.exp(-P.damp * h);
    R.bv = clamp(R.bv, -P.vmax, P.vmax);
    R.bp += R.bv * h;
    if (R.bp < 0) { R.bp = 0; if (R.bv < 0) R.bv = 0; }
    if (R.bp > 1 - R.bh) { R.bp = 1 - R.bh; if (R.bv > 0) R.bv = 0; }
    // progress (forgiving drain during the first seconds)
    R.inside = R.fp >= R.bp - P.margin && R.fp <= R.bp + R.bh + P.margin;
    if (R.inside) R.prog += (P.gain - 0.02 * R.diff) * T.gm * h;
    else { R.prog -= (P.drain + 0.012 * R.diff) * T.dm * h * (R.time < P.grace ? 0.3 : 1); R.out += h; }
    R.prog = Math.min(1, R.prog);
    R.time += h;
  }
  C.step = function (R, dt, held, rnd) {
    dt = clamp(dt, 0, 0.1);                       // tab switch / hitch can never skip the game
    var n = Math.max(1, Math.ceil(dt * 120)), h = dt / n, i;
    R.lastProg = R.prog;
    for (i = 0; i < n; i++) {
      sub(R, h, held, rnd);
      if (R.prog >= 1) return 'win';
      if (R.prog <= 0 || R.time > 75) return 'lose';
    }
    return null;
  };
  root.Game = root.Game || {}; root.Game.ReelCore = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? (global.Game = global.Game || {}, { Game: global.Game }) : this));
