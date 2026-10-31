#!/usr/bin/env node
/* Togie Valley - tools/bike_check.js (Round 3 stage 42): node tools/bike_check.js
 * Simulates the real js/bike_core.js: acceleration curve (t90 ~ 2 s, top = 2.2 x walking speed, frame-rate independent), braking, limited turn rate,
 * mount / dismount / tap rules, and the host-authoritative ownership rules (one rider, late joiner, disconnect). Also greps the hooks in player/interact/net code. */
'use strict';
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('bike: FAIL ' + m); } else n++; }
function src(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
var MS = require(path.join(root, 'js/move_speed.js')), C = require(path.join(root, 'js/bike_core.js'));

/* ---- speed curve ---- */
need(Math.abs(C.TOP - 2.2 * MS.WALK) < 1e-9, 'top speed = 2.2 x walking speed (' + C.TOP + ')');
function run(hz, want, secs, st, out, stopAt) {
  var dt = 1 / hz, t = 0, t90 = -1, rec = { v03: 0, st: st };
  while (t < secs - 1e-9) {
    if (stopAt !== undefined && t >= stopAt) want = 0;
    C.step(st, 0, 1, want, dt, -1, -1, out); t += dt;
    if (t90 < 0 && st.v >= 0.9 * C.TOP) t90 = t;
    if (Math.abs(t - 0.3) < dt / 2) rec.v03 = st.v;
  }
  rec.t90 = t90; rec.v = st.v; return rec;
}
var o = { dx: 0, dz: 0, speed: 0 }, ref = null;
[30, 60, 90, 120, 144].forEach(function (hz) {
  var r = run(hz, MS.RUN, 8, C.newState(0), o);
  need(r.t90 > 1.8 && r.t90 < 2.2, 't90 at ' + hz + ' Hz = ' + r.t90.toFixed(2) + ' s (want about 2.0)');
  need(r.v > 0.995 * C.TOP && r.v <= C.TOP + 1e-9, 'reaches but never exceeds top speed @' + hz + ' Hz (' + r.v.toFixed(3) + ')');
  need(r.v03 < 0.2 * C.TOP, 'starts slowly: v(0.3 s) = ' + r.v03.toFixed(2) + ' @' + hz + ' Hz');
  if (ref === null) ref = r.t90; else need(Math.abs(r.t90 - ref) < 0.08, 'frame-rate independent t90 @' + hz + ' Hz');
});
var tap = run(60, MS.WALK, 8, C.newState(0), o);   // tap walk speed also tops out at the same speed
need(Math.abs(tap.v - C.TOP) < 0.02, 'relaxed-walk request still tops at 2.2 x walk');
var st = C.newState(0), prev = 99, mono = true, t = 0;
run(60, MS.RUN, 6, st, o);
while (t < 4) { C.step(st, 0, 1, 0, 1 / 60, -1, -1, o); t += 1 / 60; if (st.v > prev + 1e-9) mono = false; prev = st.v; }
need(mono && st.v === 0, 'decelerates smoothly (monotonic) to a stop within 4 s, v=' + st.v.toFixed(3));
st = C.newState(0); run(60, MS.RUN, 6, st, o); t = 0; while (t < 0.1) { C.step(st, 0, 1, 0, 1 / 60, -1, -1, o); t += 1 / 60; }
need(st.v > 0.85 * C.TOP, 'no instant stop: still ' + st.v.toFixed(2) + ' u/s 0.1 s after release');
/* turn rate at speed is limited, at rest it is quick */
st = C.newState(0); run(60, MS.RUN, 5, st, o); var h0 = st.h; t = 0;
while (t < 0.5 - 1e-9) { C.step(st, -1, 0, MS.RUN, 1 / 60, -1, -1, o); t += 1 / 60; }   // ask for a 90 degree left... (dx=-1)
need(Math.abs(C.wrapPi(st.h - h0)) < 1.3, 'turn at speed is limited (' + C.wrapPi(st.h - h0).toFixed(2) + ' rad in 0.5 s)');
st = C.newState(0); t = 0; while (t < 0.5 - 1e-9) { C.step(st, 1, 0, MS.RUN, 1 / 60, -1, -1, o); t += 1 / 60; }
need(Math.abs(C.wrapPi(st.h - 1.5708)) < 0.05, 'turn at a standstill is quick');
/* blocked: speed scrubs off; tapped destination: eases off */
st = C.newState(0); run(60, MS.RUN, 5, st, o); for (t = 0; t < 0.5; t += 1 / 60) C.step(st, 0, 1, MS.RUN, 1 / 60, 0, -1, o);
need(st.v < 0.5 * C.TOP, 'blocked against a wall loses speed (' + st.v.toFixed(2) + ')');
st = C.newState(0); run(60, MS.RUN, 5, st, o); C.step(st, 0, 1, MS.WALK, 1 / 60, -1, 0.5, o); for (t = 0; t < 0.5; t += 1 / 60) C.step(st, 0, 1, MS.WALK, 1 / 60, -1, 0.5, o);
need(st.v < 0.8 * C.TOP, 'eases off near a tapped destination (' + st.v.toFixed(2) + ')');

/* ---- pose derived from the anchors (hips on saddle, hands on grips, feet on pedals, head clear of handlebar + basket) ---- */
(function () {
  var A = C.AN, R = C.RIG, k, ang, pz = { bob: 0, spineRX: 0, headRX: 0, armLX: 0, armRX: 0, armLZ: 0, armRZ: 0, legLX: 0, legRX: 0 }, worst = { hand: 0, foot: 0, head: 9 };
  for (k = 0; k < 24; k++) {
    ang = k * Math.PI / 12; C.solve(pz, ang);
    var s = pz.spineRX, hy = R.LEG + pz.bob, sf = R.SHY * Math.sin(s), sy = hy + R.SHY * Math.cos(s);
    var hf = sf + R.ARM * Math.sin(pz.armLX - s), hyy = sy - R.ARM * Math.cos(pz.armLX - s);   // hand tip
    worst.hand = Math.max(worst.hand, Math.hypot(hf - A.grip.f, hyy - A.grip.y));
    [[pz.legLX, ang], [pz.legRX, ang + Math.PI]].forEach(function (l) {
      var ff = 0.27 * Math.sin(l[0]), fy = hy - 0.27 * Math.cos(l[0]);
      worst.foot = Math.max(worst.foot, Math.hypot(ff - (A.crank.f + A.crank.r * Math.cos(l[1])), fy - (A.crank.y + A.crank.r * Math.sin(l[1]))));
    });
    var cf = R.TORSO * Math.sin(s) + 0.15 * Math.sin(s + pz.headRX), cy = hy + R.TORSO * Math.cos(s) + 0.15 * Math.cos(s + pz.headRX);   // head centre
    worst.head = Math.min(worst.head, Math.hypot(cf - A.grip.f, cy - A.grip.y), Math.hypot(cf - (A.basket.f - A.basket.r), cy - (A.basket.y0 + A.basket.h)));
  }
  need(Math.abs(pz.bob + R.LEG - A.saddle.y - R.SEAT) < 1e-9, 'hips sit on the saddle anchor');
  need(pz.spineRX > 0.2 && pz.spineRX < 0.5, 'spine leans slightly forward (' + pz.spineRX.toFixed(2) + ' rad)');
  need(worst.hand < 0.045, 'hands reach the grips (worst miss ' + worst.hand.toFixed(3) + ')');
  need(worst.foot < 0.08, 'feet stay on the pedals through the crank turn (worst miss ' + worst.foot.toFixed(3) + ')');
  need(worst.head > 0.3, 'head/hat sphere (r 0.3 incl. hair, hat brim above) clears handlebar + basket (' + worst.head.toFixed(2) + ')');
})();

/* ---- mount / dismount / tap rules ---- */
var ok = { outdoor: true, near: true, occupied: false, locked: false, sitting: false, fishing: false, riding: false };
function w(o2) { var c = {}, k; for (k in ok) c[k] = ok[k]; for (k in o2) c[k] = o2[k]; return c; }
need(C.actionKind(ok) === 'mount', 'near the free bike: action = mount');
need(C.actionKind(w({ near: false })) === null, 'far from the bike: no action');
need(C.actionKind(w({ occupied: true })) === null, 'someone else riding: cannot mount');
need(C.actionKind(w({ outdoor: false })) === null && C.actionKind(w({ sitting: true })) === null && C.actionKind(w({ fishing: true })) === null && C.actionKind(w({ locked: true })) === null, 'no mount indoors / seated / fishing / locked');
need(C.actionKind(w({ riding: true })) === 'dismount' && C.actionKind(w({ riding: true, near: false, occupied: true })) === 'dismount', 'riding: the action is always dismount');
need(C.tapKind(w({ riding: true })) === 'steer' && C.tapKind(w({ riding: true, onBike: true })) === 'steer', 'tap while riding only steers (never dismounts)');
need(C.tapKind(w({ onBike: true })) === 'mount' && C.tapKind(w({ onBike: true, occupied: true })) === 'walk' && C.tapKind(w({})) === 'walk', 'tap on the free bike mounts, elsewhere walks');
var ps = src('js/player.js'), it = src('js/interact.js'), bk = src('js/bike.js'), ah = src('js/action_hint.js'), idx = src('index.html'), av = src('js/avatars.js');
var tapFn = it.slice(it.indexOf('function handleTap'), it.indexOf('I.handleTap')).replace(/\/\/.*$/gm, '');
need(/Bike\.riding\(\) \? null : I\.resolve/.test(tapFn) && !/dismount/i.test(tapFn), 'interact.handleTap routes riding taps to steering only');
need(/G\.Bike && G\.Bike\.onAction\(\)/.test(it) && /Bike\.riding\(\)\) return \{ icon: 'bike', label: 'Xuống xe'/.test(ah) && /label: 'Lên xe'/.test(ah), 'action button + hint wired (Lên xe / Xuống xe)');
need(/P\.ride\.step\(/.test(ps) && /P\.ride\.pose\(/.test(ps), 'player.js has the ride hooks');
var dm = bk.match(/\.dismount\(/g) || [];
need(!/input:tap/.test(bk) && /Bike\.dismount = /.test(bk) && /function force/.test(bk), 'bike.js never listens to taps; dismount only from the action button or forced events');
need(idx.indexOf('bike_core.js') > 0 && idx.indexOf('bike_core.js') < idx.indexOf('js/bike.js') && idx.indexOf('js/bike.js') > idx.indexOf('js/vn_life.js') && idx.indexOf('js/bike.js') < idx.indexOf('js/main.js'), 'index.html order: bike_core.js, bike.js after vn_life.js, before main.js');

/* ---- multiplayer ownership (host-authoritative) ---- */
var S = C.free(10, 5, 1);
need(C.mount(S, 'p2') && S.r === 'p2', 'first request wins');
need(!C.mount(S, 'p3') && S.r === 'p2', 'second rider refused while taken');
need(!C.mount(S, 'p1') && S.r === 'p2', 'host refused too while a guest rides');
need(!C.dismount(S, 'p3', 0, 0, 0) && S.r === 'p2', 'only the rider can dismount');
need(C.dismount(S, 'p2', 12.5, 7.25, 2) && S.r === '' && S.x === 12.5 && S.z === 7.25 && S.ry === 2, 'dismount leaves the bike where it stood');
C.mount(S, 'p3'); S.x = 20; S.z = 9;
var late = C.valid(JSON.parse(JSON.stringify(C.msg(S))));
need(late && late.r === 'p3' && late.x === 20 && late.z === 9, 'late joiner state message round-trips (rider + position)');
need(C.leave(S, 'p3', 20, 9, 0.5) && S.r === '' && S.x === 20, 'disconnected rider frees the bike where it stands');
need(!C.leave(S, 'p3', 0, 0, 0), 'leaving twice is harmless');
need(JSON.stringify(C.msg(S)).length < 70 && JSON.stringify({ t: 'bk.q', a: 1 }).length < 20, 'messages are tiny (' + JSON.stringify(C.msg(S)).length + ' bytes)');
need(C.valid({ t: 'bk', r: 'x', x: 1, z: 1, y: 0 }) === null && C.valid({ r: 'p2', x: NaN, z: 1, y: 0 }) === null && C.valid({ r: 'p2', x: 1e9, z: 1, y: 0 }) === null && C.valid({ r: '', x: 1, z: 2, y: 3 }) !== null, 'receiver rejects malformed state');
if (bk.indexOf("'bk.q'") > 0 && /Net\.on\('bk'/.test(bk)) {   // stage 3 wiring present
  need(/Net\.on\('bk\.q'/.test(bk) && /net:leave/.test(bk) && /net:join/.test(bk), 'host handles requests, leave and join');
  need(/remoteFrame/.test(av) && /remotePose/.test(av), 'avatars.js draws remote riders on the bike');
}
console.log('bike: ' + n + ' checks ok, ' + errs + ' failed'); process.exit(errs ? 1 : 0);
