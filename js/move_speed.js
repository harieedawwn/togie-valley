/* Stage 17 BUGFIX c: one speed table for keyboard, joystick and tap-to-move (node-readable).
 * Cause of the "fast joystick": a full stick fed SPRINT (5.2) while the keyboard fed RUN (3.6), and the stick eased with another accel.
 * Now every input tops out at RUN, uses the same easing, and the loop's fixed 1/60 step keeps it independent of display refresh. */
(function () {
  'use strict';
  var WALK = 2.0, RUN = 3.6, ACCEL = 10, M = { WALK: WALK, RUN: RUN, SPRINT: RUN, ACCEL: ACCEL };
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  M.smoothstep = smooth;
  M.keyboard = function () { return RUN; };
  /** m = stick magnitude 0..1: creep -> walk (0..0.55), walk -> run (0.55..0.88), full deflection = run. */
  M.stick = function (m) { return m < 0.55 ? lerp(0.5, WALK, m / 0.55) : lerp(WALK, RUN, clamp01((m - 0.55) / 0.33)); };
  M.tap = function (mode, rem) { return mode >= 2 ? RUN : mode === 1 ? WALK : lerp(WALK, RUN, smooth(3, 7, rem)); };
  M.hold = function (hd) { return lerp(WALK, RUN, smooth(1.6, 4.0, hd)); };
  M.ease = function (speed, want, dt) { return speed + (want - speed) * (1 - Math.exp(-ACCEL * dt)); };
  if (typeof module !== 'undefined' && module.exports) module.exports = M; else window.Game.MoveSpeed = M;
})();
