/* Togie Valley - char_sec.js (Round 3 stage 17). Game.CharSec: spring-driven follow-through for the loose parts of any Models.character.
 * Parts come from models.js (`ch.fx` slots: pony / twin tails, curtain hair (bob, long), bow, scarf end, backpack), each on its own pivot group.
 * The drive is derived from the root itself (world velocity / acceleration in the character's frame, yaw rate, head turn rate, hips bounce), so the same
 * code serves the hero, NPCs and remote players (interpolated positions). Per slot: two rotation springs + one vertical spring, sub-stepped, clamped,
 * no allocation per frame (state objects are created once per slot / character). Slots sleep at rest (no writes). Quality.sway scales the amplitude (0 = parts stay still).
 * Load after models.js, char_anim.js and player.js. API: step(ch, dt), stats(). */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Models || !G.Loop || !G.Player || !G.util) { console.error('[char_sec] missing deps'); return; }
  var U = G.util, P = G.Player, LEG = 0.24, CS = { stepped: 0, enabled: true };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  // kind -> [stiffness, damping, wind flutter, min rx, max rx, body-bounce gain]
  var KIND = {
    pony: [62, 3.6, 0, -0.14, 0.62, 1.0],
    twin: [70, 4.0, 0, -0.1, 0.5, 1.0],
    curtain: [90, 7.0, 0, -0.08, 0.3, 0.6],
    bow: [190, 9.0, 0, -0.2, 0.2, 0.6],
    scarf: [55, 3.2, 0.05, -0.1, 0.9, 1.0],
    pack: [120, 9.5, 0, -0.05, 0.28, 1.0]
  };
  var DEF = KIND.pony;

  function newState() {
    return { init: 0, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, ax: 0, az: 0, yr: 0, hy: 0, hx: 0, hrv: 0, hxv: 0, by: 0, lb: 0, bv: 0, t: Math.random() * 20 };
  }

  CS.step = function (ch, dt) {
    var fx = ch.fx, n = fx ? fx.length : 0, i, any = false;
    if (!n || !CS.enabled) return;
    for (i = 0; i < n; i++) if (fx[i].on) { any = true; break; }
    if (!any) return;
    dt = Math.min(dt, 1 / 20); if (dt <= 0) return;
    var S = ch.cs || (ch.cs = newState()), r = ch.root, J = ch.joints, px = r.position.x, pz = r.position.z, yaw = r.rotation.y;
    var hy = J.head.rotation.y, hx = J.head.rotation.x, by = J.hips.position.y - LEG;
    var sw = G.Perf && G.Perf.density && G.Perf.density.sway !== undefined ? G.Perf.density.sway : 1;
    var vx, vz, k, af, al, vf, vl, sn, cs, d, yr, rxT, rzT, yT, a, kind, sl, q, h, m, kk, cc;
    if (!S.init) { S.init = 1; S.x = px; S.z = pz; S.yaw = yaw; S.hy = hy; S.hx = hx; S.by = by; S.lb = by; }
    S.t += dt;
    vx = (px - S.x) / dt; vz = (pz - S.z) / dt; S.x = px; S.z = pz;
    if (vx * vx + vz * vz > 200) { vx = 0; vz = 0; S.vx = 0; S.vz = 0; }   // teleport / scene change
    k = 12 * dt; if (k > 0.6) k = 0.6;   // first-order smoothing, about 12 /s
    S.ax += (clamp((vx - S.vx) / dt, -40, 40) - S.ax) * k; S.az += (clamp((vz - S.vz) / dt, -40, 40) - S.az) * k; S.vx = vx; S.vz = vz;
    d = U.wrapAngle(yaw - S.yaw) / dt; S.yaw = yaw; if (d > 25 || d < -25) d = 0;
    S.yr += (clamp(d, -9, 9) - S.yr) * k;
    d = (hy - S.hy) / dt; S.hy = hy; S.hrv += (clamp(d, -12, 12) - S.hrv) * k;
    d = (hx - S.hx) / dt; S.hx = hx; S.hxv += (clamp(d, -12, 12) - S.hxv) * k;
    S.lb += (by - S.lb) * 7 * dt; d = (by - S.by) / dt; S.by = by; S.bv += (clamp(d, -3, 3) - S.bv) * k;
    if (vx * vx + vz * vz + S.ax * S.ax + S.az * S.az > 1e-4) {   // standing still: no projection needed
      sn = Math.sin(yaw); cs = Math.cos(yaw);
      vf = vx * sn + vz * cs; vl = vx * cs - vz * sn; af = S.ax * sn + S.az * cs; al = S.ax * cs - S.az * sn;
    } else { vf = 0; vl = 0; af = 0; al = 0; }
    yT = -clamp((by - S.lb) * 0.9, -0.03, 0.03);
    h = dt > 0.012 ? 2 : 1; m = dt / h;
    for (i = 0; i < n; i++) {
      sl = fx[i]; if (!sl.on) continue;
      kind = KIND[sl.kind] || DEF; a = sl.amp * sw;
      q = sl.q || (sl.q = { rx: 0, vrx: 0, rz: 0, vrz: 0, y: 0, vy: 0, rest: 0 });
      // targets: stream back with speed, lag behind acceleration / turning / head motion, flutter in the wind
      rxT = 0.05 * vf + 0.011 * af + 0.04 * S.hxv - 0.06 * S.bv * kind[5] + (kind[2] ? kind[2] * Math.sin(S.t * 9 + i) * clamp(vf / 3, 0, 1) : 0);
      rzT = -0.014 * al - 0.012 * vl + 0.03 * S.yr + 0.035 * S.hrv;
      rxT = clamp(rxT * a, kind[3], kind[4]); rzT = clamp(rzT * a, -0.42, 0.42);
      if (q.rest && rxT * rxT + rzT * rzT < 2e-5 && yT * yT < 1e-6) continue;   // asleep: nothing drives it, nothing is written
      kk = kind[0]; cc = kind[1];
      for (d = 0; d < h; d++) {
        q.vrx += (kk * (rxT - q.rx) - cc * q.vrx) * m; q.rx += q.vrx * m;
        q.vrz += (kk * (rzT - q.rz) - cc * q.vrz) * m; q.rz += q.vrz * m;
        q.vy += (kk * 1.6 * (yT * a * kind[5] - q.y) - cc * 1.3 * q.vy) * m; q.y += q.vy * m;
      }
      q.rx = clamp(q.rx, kind[3] - 0.08, kind[4] + 0.12); q.rz = clamp(q.rz, -0.5, 0.5); q.y = clamp(q.y, -0.04, 0.04);
      q.rest = (q.rx * q.rx + q.rz * q.rz + q.y * q.y + 0.01 * (q.vrx * q.vrx + q.vrz * q.vrz + q.vy * q.vy) < 1e-6 && rxT * rxT + rzT * rzT < 2e-5) ? 1 : 0;
      if (q.rest) { q.rx = 0; q.rz = 0; q.y = 0; q.vrx = 0; q.vrz = 0; q.vy = 0; }
      sl.g.rotation.x = q.rx; sl.g.rotation.z = q.rz; sl.g.position.y = sl.py + q.y;
      CS.stepped++;
    }
  };
  CS.stats = function () { return { stepped: CS.stepped }; };

  G.Loop.onFrame(function (dt) { CS.stepped = 0; CS.step(P.hero, dt); }, 100.7);   // after Player 100, clips 100.4 and CharAnim 100.5 (joints final)
  G.Loop.onFrame(function (dt) {   // NPCs (shopkeeper, fishmonger): their idle gestures are applied at priority 11 / 11.5
    var T = G.Town, k, e, NG = G.SimTier && G.SimTier.npc;
    if (!T || !T.npcs) return;
    if (NG) { if (!NG.due || NG.far) return; dt = NG.dt; }   // stage 36: far NPCs skip secondary motion
    for (k in T.npcs) { e = T.npcs[k]; if (e && e.h) CS.step(e.h, dt); }
  }, 11.7);
  G.CharSec = CS;
})();
