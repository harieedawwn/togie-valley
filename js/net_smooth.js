/* Togie Valley - net_smooth.js (Round 3 stage 11). Snapshot interpolation for remote movers + host clock estimate.
 * Game.NetSmooth {DELAY, EXTRAP, SNAP, q(), clock(), entity(), push(e,ts,x,z,ry,sp,sc), update(e,rt,dt)}. Pure logic (node-readable, tools/net_smooth_sim.js).
 * Times are host-clock ms. Load after core.js, BEFORE net.js (net.js reads it at call time) and before avatars.js. */
(function (root) {
  'use strict';
  var NS = {
    DELAY: 120,      // render this far in the past (ms)
    EXTRAP: 150,     // max extrapolation with last velocity (ms), then hold
    SNAP: 4,         // gap in tiles that snaps instead of easing
    MAXBUF: 16
  };
  NS.q = function (v, n) { return Math.round(v * n) / n; };   // quantise: positions q(v,32), yaw q(v,64), speed q(v,10)

  /* Clock: offset = hostTime - localTime, median of the last 8 ping/pong samples; ping = median rtt. */
  NS.clock = function () {
    var offs = [], rtts = [], prov = null;
    function med(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length; return n ? (n & 1 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
    return {
      add: function (offset, rtt) { offs.push(offset); rtts.push(rtt); if (offs.length > 8) { offs.shift(); rtts.shift(); } },
      provisional: function (o) { if (!offs.length && prov === null) prov = o; },   // first ps before any pong
      has: function () { return offs.length > 0 || prov !== null; },
      offset: function () { return offs.length ? med(offs) : (prov === null ? 0 : prov); },
      ping: function () { return rtts.length ? med(rtts) : -1; },
      reset: function () { offs.length = rtts.length = 0; prov = null; }
    };
  };

  NS.entity = function () { return { b: [], x: 0, z: 0, ry: 0, sp: 0, sc: '', init: false, sx: 0, sz: 0, sry: 0, ssp: 0, ssc: '' }; };

  /* Insert a snapshot sorted by ts; duplicates (same ts) and ancient packets are ignored. */
  NS.push = function (e, ts, x, z, ry, sp, sc) {
    var b = e.b, i = b.length;
    if (!(ts > 0) || !isFinite(x + z + ry + sp)) return false;
    while (i > 0 && b[i - 1].t > ts) i--;
    if (i > 0 && b[i - 1].t === ts) return false;
    b.splice(i, 0, { t: ts, x: x, z: z, ry: ry, sp: sp, sc: sc });
    if (b.length > NS.MAXBUF) b.shift();
    return true;
  };

  function wrap(d) { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  NS.wrap = wrap;

  /* Sample the buffer at render time rt into e.s* (target). Interpolates between the bracketing pair; past the newest
   * snapshot extrapolates with the last velocity for EXTRAP ms, then holds (speed 0). */
  function sample(e, rt) {
    var b = e.b, n = b.length, i, a, c, f, dt, v, p;
    if (!n) return false;
    if (rt <= b[0].t) { a = b[0]; e.sx = a.x; e.sz = a.z; e.sry = a.ry; e.ssp = a.sp; e.ssc = a.sc; return true; }
    for (i = n - 1; i > 0 && b[i].t > rt; i--) { /* find newest snapshot <= rt */ }
    a = b[i];
    if (i < n - 1) {
      c = b[i + 1];
      dt = c.t - a.t;
      if (c.sc !== a.sc || Math.abs(c.x - a.x) + Math.abs(c.z - a.z) > NS.SNAP * 1.5) { e.sx = a.x; e.sz = a.z; e.sry = a.ry; e.ssp = a.sp; e.ssc = a.sc; if (rt >= c.t) { e.sx = c.x; e.sz = c.z; e.sry = c.ry; e.ssp = c.sp; e.ssc = c.sc; } return true; }   // teleport / scene change: hold, then jump
      f = dt > 0 ? (rt - a.t) / dt : 1;
      e.sx = a.x + (c.x - a.x) * f; e.sz = a.z + (c.z - a.z) * f; e.sry = a.ry + wrap(c.ry - a.ry) * f; e.ssp = a.sp + (c.sp - a.sp) * f; e.ssc = a.sc;
      return true;
    }
    // newest snapshot is behind rt: extrapolate (velocity from the last two samples), then hold
    e.sx = a.x; e.sz = a.z; e.sry = a.ry; e.ssc = a.sc; e.ssp = a.sp;
    dt = rt - a.t;
    if (dt > NS.EXTRAP) { dt = NS.EXTRAP; e.ssp = 0; }
    if (i > 0 && dt > 0 && a.sp > 0.05) {
      p = b[i - 1]; v = a.t - p.t;
      if (v >= 20 && v <= 400 && a.sc === p.sc) { e.sx += (a.x - p.x) / v * dt; e.sz += (a.z - p.z) / v * dt; }
    }
    return true;
  }

  /* Per-frame: sample at rt, ease the displayed pose toward the target (corrections never pop), snap on > SNAP tiles or scene change.
   * Displayed e.x/z/ry/sp/sc. Walk cycle should use e.sp (interpolated speed), not message arrival. */
  NS.update = function (e, rt, dt) {
    var k, dx, dz, d, b = e.b, n = b.length;
    if (!sample(e, rt)) return false;
    // drop snapshots older than 1 s behind rt (keep the one before rt for bracketing)
    while (n > 2 && b[1].t < rt - 1000) { b.shift(); n--; }
    if (!e.init || e.sc !== e.ssc) { e.init = true; e.x = e.sx; e.z = e.sz; e.ry = e.sry; e.sp = e.ssp; e.sc = e.ssc; return true; }
    dx = e.sx - e.x; dz = e.sz - e.z; d = Math.sqrt(dx * dx + dz * dz);
    if (d > NS.SNAP) { e.x = e.sx; e.z = e.sz; e.ry = e.sry; e.sp = e.ssp; return true; }
    k = 1 - Math.exp(-22 * dt);
    e.x += dx * k; e.z += dz * k; e.ry += wrap(e.sry - e.ry) * k;
    e.sp += (e.ssp - e.sp) * (1 - Math.exp(-14 * dt));
    if (e.ssp === 0 && e.sp < 0.05) e.sp = 0;
    return true;
  };

  if (root.Game) root.Game.NetSmooth = NS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
