/* Togie Valley - bike_core.js (Round 3 stage 42): pure, node-readable bicycle rules (no THREE, no DOM).
 * Game.BikeCore: speed model (two cascaded lags: starts slowly, ~2 s to 90 % of TOP = 2.2 x walking speed, firm braking),
 * limited turn rate that shrinks with speed, mount / dismount / tap rules, and the host-authoritative ownership state
 * S = {r: riderId | '', x, z, ry} (one rider at a time). Used by js/bike.js; tools/bike_check.js simulates it.
 */
(function () {
  'use strict';
  var MS = (typeof module !== 'undefined' && module.exports) ? require('./move_speed.js') : (window.Game && window.Game.MoveSpeed);
  if (!MS) { if (typeof console !== 'undefined') console.error('[bike_core] missing MoveSpeed'); return; }
  var PI = Math.PI, TAU = PI * 2, B = {};

  B.TOP = MS.WALK * 2.2;         // 4.4 tiles/s (was 1.5 x = 3.0, BELOW the 3.6 run speed: that is why it felt like walking)
  B.K_UP = 1.945;                // 1 - e^-x(1 + x) = 0.9 at x = 3.89  ->  t90 = 3.89 / 1.945 = 2.0 s
  B.K_DOWN = 4.5;                // braking lag (about 1 s to a standstill from top speed)
  B.TURN_SLOW = 7;               // rad/s at standstill
  B.TURN_FAST = 2.4;             // rad/s at top speed
  B.RADIUS = 0.3;                // wheel radius (visual)
  B.NEAR = 1.25;                 // tiles: mount reach
  B.REACH_HOST = 3.5;            // host accepts a guest's mount request within this distance of the bike

  /* Rider anchors in bike-local metres: f = forward, y = up, x = lateral (hero left = +x). The bike mesh (js/bike.js buildGeo) is built FROM these,
   * and solve() derives the rider pose FROM these (hero rig: hips at LEG, torso 0.28, shoulders 0.24 up / 0.19 out, arm 0.215, leg 0.27). */
  B.AN = { saddle: { f: 0, y: 0.46 }, grip: { f: 0.28, y: 0.62, x: 0.17 }, crank: { f: 0.1, y: 0.25, r: 0.05, x: 0.11 }, head: { f: 0.28, y: 0.56 }, basket: { f: 0.54, y0: 0.62, r: 0.14, h: 0.15 } };
  B.RIG = { LEG: 0.24, TORSO: 0.28, SHY: 0.24, ARM: 0.215, SEAT: 0.03 };   // mirrors js/models.js
  /** Writes the seated pose into pose (bob, spineRX, headRX, armLX/RX, legLX/RX) for crank angle ang (rad). Hips on the saddle, hands on the grips, feet on the pedals. */
  B.solve = function (pose, ang) {
    var A = B.AN, R = B.RIG, hy = A.saddle.y + R.SEAT, s, best = 9, bs = 0.3, d, sy, sf, e, phi, a;
    for (s = 0.28; s <= 0.46; s += 0.02) {   // slight forward lean: the smallest that lets the arms reach the grips
      sf = R.SHY * Math.sin(s); sy = hy + R.SHY * Math.cos(s);
      d = Math.sqrt((A.grip.f - A.saddle.f - sf) * (A.grip.f - A.saddle.f - sf) + (A.grip.y - sy) * (A.grip.y - sy)); e = Math.abs(d - R.ARM);
      if (e < best - 0.004) { best = e; bs = s; }
    }
    s = bs; sf = A.saddle.f + R.SHY * Math.sin(s); sy = hy + R.SHY * Math.cos(s);
    phi = Math.atan2(A.grip.f - sf, sy - A.grip.y);
    pose.bob = hy - R.LEG; pose.spineRX = s; pose.headRX = -s * 0.7; pose.armLX = pose.armRX = phi + s; pose.armLZ = pose.armRZ = 0;
    a = ang; pose.legLX = Math.atan2(A.crank.f + A.crank.r * Math.cos(a) - A.saddle.f, hy - (A.crank.y + A.crank.r * Math.sin(a)));
    a = ang + PI; pose.legRX = Math.atan2(A.crank.f + A.crank.r * Math.cos(a) - A.saddle.f, hy - (A.crank.y + A.crank.r * Math.sin(a)));
    return pose;
  };
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function wrapPi(a) { a %= TAU; if (a > PI) a -= TAU; else if (a < -PI) a += TAU; return a; }
  B.wrapPi = wrapPi;

  B.newState = function (h) { return { v: 0, a1: 0, h: h || 0, turn: 0 }; };

  /** One fixed step. (dx,dz) = wanted direction (any length, may be 0), want = the walking speed the input asks for (0 = no input),
   *  moved = distance really moved last tick (-1 unknown), rem = tiles left on a tap path (-1 none). Writes out {dx,dz,speed}. */
  B.step = function (st, dx, dz, want, dt, moved, rem, out) {
    var has = want > 0 && (dx || dz), target = want <= 0 ? 0 : want >= MS.WALK * 0.99 ? B.TOP : B.TOP * want / MS.WALK, k, a, d, lim, sc;
    if (rem >= 0 && target > 0) target = Math.min(target, rem * 2 + 0.4);   // ease off before a tapped destination
    if (moved >= 0 && st.v * dt > 0.004 && moved < st.v * dt * 0.3) { sc = Math.exp(-8 * dt); st.v *= sc; st.a1 *= sc; }   // blocked: scrub speed
    if (has) {
      d = wrapPi(Math.atan2(dx, dz) - st.h);
      lim = (B.TURN_SLOW + (B.TURN_FAST - B.TURN_SLOW) * clamp01(st.v / B.TOP)) * dt;
      if (d > lim) d = lim; else if (d < -lim) d = -lim;
      st.h = wrapPi(st.h + d); st.turn = d / dt;
    } else st.turn *= Math.exp(-8 * dt);
    k = target < st.v ? B.K_DOWN : B.K_UP; a = 1 - Math.exp(-k * dt);
    st.a1 += (target - st.a1) * a; st.v += (st.a1 - st.v) * a;
    if (target === 0 && st.v < 0.05) { st.v = 0; st.a1 = 0; }
    out.dx = Math.sin(st.h); out.dz = Math.cos(st.h); out.speed = st.v;
    return out;
  };
  B.lean = function (st) { return -Math.max(-0.16, Math.min(0.16, st.turn * 0.05 * clamp01(st.v / B.TOP))); };   // lean into the turn (turning left = negative z)

  /* ------------------------------------------------------------ rules */
  /** c = {occupied, locked, sitting, fishing, outdoor, near} */
  B.canMount = function (c) { return !!(c.outdoor && !c.occupied && !c.locked && !c.sitting && !c.fishing && c.near); };
  /** Action button: riding -> always dismount; otherwise mount when allowed. */
  B.actionKind = function (c) { return c.riding ? 'dismount' : (B.canMount(c) ? 'mount' : null); };
  /** Screen tap: while riding it only steers (never dismounts); on a free parked bike it walks there and mounts. */
  B.tapKind = function (c) { return c.riding ? 'steer' : (c.onBike && !c.occupied ? 'mount' : 'walk'); };

  /* ------------------------------------------------------------ ownership (host-authoritative) */
  B.free = function (x, z, ry) { return { r: '', x: x || 0, z: z || 0, ry: ry || 0 }; };
  B.mount = function (S, id) { if (S.r || !id) return false; S.r = id; return true; };
  B.dismount = function (S, id, x, z, ry) { if (!id || S.r !== id) return false; S.r = ''; S.x = x; S.z = z; S.ry = ry; return true; };
  B.leave = B.dismount;   // a rider who disconnects frees the bike where it stood
  B.valid = function (m) {   // receiver-side sanitising of a {r,x,z,y} message -> {r,x,z,ry} | null
    if (!m || typeof m !== 'object') return null;
    var r = m.r === '' ? '' : (typeof m.r === 'string' && /^p\d{1,2}$/.test(m.r) ? m.r : null);
    if (r === null || !isFinite(m.x) || !isFinite(m.z) || !isFinite(m.y) || Math.abs(m.x) > 5000 || Math.abs(m.z) > 5000) return null;
    return { r: r, x: +m.x, z: +m.z, ry: +m.y };
  };
  B.msg = function (S) { return { t: 'bk', r: S.r, x: Math.round(S.x * 100) / 100, z: Math.round(S.z * 100) / 100, y: Math.round(S.ry * 100) / 100 }; };

  if (typeof module !== 'undefined' && module.exports) module.exports = B; else window.Game.BikeCore = B;
})();
