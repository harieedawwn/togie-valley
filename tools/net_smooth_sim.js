'use strict';
// Headless sim for js/net_smooth.js: 15 Hz packets, 50-200 ms jitter, 3% loss, reordering, device clock offset; asserts smooth display.
var NS = require('../js/net_smooth.js'), fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('FAIL ' + m); } }
var seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function path(t, tele) {   // true host-clock path: walk 3.5 tiles/s in a circle-ish line, optional teleport at 20 s
  var s = 3.5, d = s * t / 1000, x = 10 + d, z = 10 + 3 * Math.sin(d / 8);
  if (tele && t > 20000) x += 30;   // real teleport at 20 s
  return [x, z];
}
function run(tele) {
  var HOSTOFF = 7345.6, ERRCLK = 0, clk = NS.clock(), e = NS.entity(), q = [], maxJump = 0, maxErr = 0, prev = null, jumps = [], t, i, a;
  // clock: 8+ pong samples with asymmetric jitter; guestLocal = hostTime - HOSTOFF
  for (i = 0; i < 12; i++) { var up = 25 + rnd() * 150, dn = 25 + rnd() * 150, rtt = up + dn; clk.add(HOSTOFF + (dn - up) / 2 + 0, rtt); }
  var off = clk.offset();   // hostTime - localTime estimate
  ERRCLK = off - HOSTOFF;   // the receiver's clock error in ms (guest local clock = host - HOSTOFF)
  ok(Math.abs(ERRCLK) < 80, 'clock offset error ' + (off - HOSTOFF).toFixed(1) + ' ms');
  ok(clk.ping() > 100 && clk.ping() < 260, 'ping median ' + clk.ping());
  var sent = 0, hostT, step = 1000 / 15;
  for (hostT = 1000; hostT < 40000; hostT += step) {   // host-clock send times; arrival in local clock
    if (rnd() < 0.03) continue;
    var p = path(hostT, tele), arrive = hostT + 50 + rnd() * 150;
    q.push({ arrive: arrive, ts: Math.round(hostT), x: Math.round(p[0] * 32) / 32, z: Math.round(p[1] * 32) / 32 });
  }
  q.sort(function (m, n) { return m.arrive - n.arrive; });   // delivery order (jitter reorders vs send order)
  var reord = 0; for (i = 1; i < q.length; i++) if (q[i].ts < q[i - 1].ts) reord++;
  ok(reord > 10, 'reordering present (' + reord + ')');
  var qi = 0, dt = 1000 / 60, tele_ok = 0;
  for (t = 1000; t < 40000; t += dt) {
    while (qi < q.length && q[qi].arrive <= t) { a = q[qi++]; NS.push(e, a.ts, a.x, a.z, 0, 3.5, 'outdoor'); }
    if (!e.b.length) continue;
    NS.update(e, (t + ERRCLK) - NS.DELAY, dt / 1000);   // t = host-clock 'now'; receiver's estimate is off by ERRCLK
    if (prev) {
      var j = Math.hypot(e.x - prev[0], e.z - prev[1]);
      if (j > 0.3) { if (tele && t > 20000 && t < 21500) tele_ok++; else jumps.push(t.toFixed(0) + ':' + j.toFixed(2)); }
      if (j > maxJump && !(tele && t > 20000 && t < 21500)) maxJump = j;
    }
    prev = [e.x, e.z];
    if (t > 3000 && !(tele && t > 19800 && t < 21500)) { var tp = path(t - NS.DELAY, tele); maxErr = Math.max(maxErr, Math.hypot(e.x - tp[0], e.z - tp[1])); }
  }
  return { maxJump: maxJump, maxErr: maxErr, jumps: jumps, tele_ok: tele_ok, e: e };
}
var r = run(false);
console.log('steady: maxJump ' + r.maxJump.toFixed(3) + ' maxErr(vs true pos 120 ms ago) ' + r.maxErr.toFixed(3));
ok(r.jumps.length === 0, 'no display jump > 0.3 tile: ' + r.jumps.slice(0, 5));
ok(r.maxErr < 0.5, 'steady position error ' + r.maxErr.toFixed(3));
var r3 = run(true); ok(r3.jumps.length === 0, 'no jump except teleport (tele run): ' + r3.jumps.slice(0, 5));
var r2 = run(true);
ok(r2.tele_ok >= 1, 'real teleport snaps (' + r2.tele_ok + ')');
// shortest-angle yaw + hold after extrapolation + scene change
var e = NS.entity(); NS.push(e, 1000, 0, 0, 3.0, 0, 'outdoor'); NS.push(e, 1100, 0, 0, -3.0, 0, 'outdoor'); NS.update(e, 1000, 0.016); NS.update(e, 1050, 0.5);
ok(Math.abs(Math.abs(e.ry) - Math.PI) < 0.3, 'yaw takes the short way, got ' + e.ry);
e = NS.entity(); NS.push(e, 1000, 0, 0, 0, 3.5, 'outdoor'); NS.push(e, 1100, 0.35, 0, 0, 3.5, 'outdoor'); NS.update(e, 1100, 0.016);
for (var k = 0; k < 120; k++) NS.update(e, 1100 + 16 * k, 0.016);
ok(Math.abs(e.x - 0.875) < 0.06, 'extrapolation capped at 150 ms (x=' + e.x.toFixed(2) + ')'); ok(e.ssp === 0 && e.sp < 0.05, 'speed 0 while holding');
console.log(fails ? fails + ' FAILED' : 'net_smooth_sim OK'); process.exit(fails ? 1 : 0);
