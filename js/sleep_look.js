/* Togie Valley - sleep_look.js (Round 3 stage 25): Game.SleepLook, the hat and the eyes while sleeping. Transient state only: the Look data and saves are never touched.
 * Everything is derived every frame from the running clip (hat_off / bed_in / faint / bed_out + AnimClips.lieAmt), so nothing can stay stuck:
 *   hat: p 0 = on the head (CharAnim springs), 1 = lying on the chest (child of the spine, rotated flat and scaled to fit the chest); in between it travels in an arc.
 *   eyes: ch.eyesShut = true keeps the blink lids closed (char_anim.js); the bun is hidden while lying (derived from the look, not remembered).
 * remote(ch, lying, dt): same hat / eyes for a remote sleeper (avatars.js, lying comes from the synced SleepVote state; no new messages).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.AnimClips || !G.Player || !G.Loop) { console.error('[sleep_look] missing dependencies'); return; }
  var C = G.AnimClips, hero = G.Player.hero, SL = G.SleepLook = {}, HALF = Math.PI / 2;
  var CHEST_Y = 0.11, FRONT = 0.2, R_MAX = 0.15, LIFT = 0.13, idle = 0, last = 0;   // spine-local chest centre, chest surface z, max hat radius on the chest, lift above the head

  function ss(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); }
  /** Cached per hat geometry: lowest point, centre and the scale that makes the hat fit on the chest. */
  function info(m) {
    var g = m && m.geometry, b, i, r;
    if (!g || !g.attributes || !g.attributes.position || !g.attributes.position.count) return null;
    i = g.userData.sl; if (i) return i;
    g.computeBoundingBox(); b = g.boundingBox; r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
    return (g.userData.sl = { minY: b.min.y, cx: (b.max.x + b.min.x) / 2, cz: (b.max.z + b.min.z) / 2, s: Math.min(0.7, Math.max(0.28, R_MAX / r)) });
  }
  SL.info = info;
  /** p 0..1 head -> chest, lf 0..1 hat held above the head. Idempotent: writes the full transform while off the head. */
  SL.pose = function (ch, p, lf) {
    var g = ch.attach.hat, J = ch.joints, n, s, y0, a, cx, cy, cz;
    if (p <= 0.001) {
      if (g.parent !== J.head) { J.head.add(g); g.scale.set(1, 1, 1); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); }
      if (lf > 0) g.position.y += lf * LIFT;
      return;
    }
    if (g.parent !== J.spine) J.spine.add(g);
    n = (ch.parts.hat && ch.parts.hat.visible) ? info(ch.parts.hat) : null;
    s = n ? n.s : 0.4; cx = n ? -n.cx * s : 0; cy = CHEST_Y + (n ? n.cz * s : 0); cz = FRONT - (n ? n.minY * s : 0.15);
    y0 = J.head.position.y + lf * LIFT; a = Math.sin(Math.PI * p);
    g.position.set(p * cx, y0 + (cy - y0) * p + a * 0.06, p * cz + a * 0.08);
    g.rotation.set(p * HALF, 0, 0); g.scale.setScalar(1 + (s - 1) * p);
  };

  G.Loop.onFrame(function (dt) {
    var a = C.active(), u = C.u(), ln = C.lieAmt, p, lf = 0, J = hero.joints;
    dt = Math.min(dt, 0.1);
    if (a === 'hat_off') { lf = ss((u - 0.22) / 0.2); p = ss((u - 0.45) / 0.4); idle = 0; }
    else if (a === 'bed_in') { p = 1; idle = 0; }
    else if (a === 'faint') { p = ss((u - 0.55) / 0.3); idle = 0; }
    else if (a === 'bed_out') { p = 1 - ss((u - 0.17) / 0.15); lf = 1 - ss((u - 0.3) / 0.07); idle = 0; }
    else { idle += dt; p = (ln > 0.1 || (idle < 0.5 && last >= 0.99)) ? 1 : 0; }
    last = p;
    SL.pose(hero, p, lf);
    hero.eyesShut = ln > 0.4 || (a === 'faint' && u > 0.65);
    J.bun.visible = hero.look.hairStyle === 'bun' && ln <= 0.1;
  }, 100.6);

  /** Remote sleeper: hat drifts to the chest within 0.5 s of lying down and comes back the same way. */
  SL.remote = function (ch, lying, dt) {
    var k = ch.slK || 0;
    k += (lying ? dt : -dt) / 0.5; k = k < 0 ? 0 : (k > 1 ? 1 : k); ch.slK = k;
    SL.pose(ch, ss(k), 0);
    ch.eyesShut = !!lying;
    ch.joints.bun.visible = ch.look.hairStyle === 'bun' && k < 0.1;
  };
})();
