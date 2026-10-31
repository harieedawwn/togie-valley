/* Togie Valley - fish_school.js (Round 3 stage 13): pure school simulation (no DOM, no THREE), shared by fishing_fx.js (FishLife) and tools/school_sim.js.
 * Game.FishSchool: buildGrid(rows) -> {W,H,wat,dist,water[]}; create({grid,cap,rnd,nAtt}) -> sim; sim.step(dt), sim.startle(x,z,r,skip), sim.near(x,z,r,out), sim.fish[], sim.att[].
 * Boids (separation + alignment + cohesion + smooth wander + shore repulsion + weak pull to drifting attractors) steered at 20 Hz in 4 staggered groups; heading turns at a
 * limited rate every frame. No orbit path is stored: circling emerges from cohesion + near-constant speed + the turn limit. Spatial hash (cell 3 tiles) = cheap neighbours. */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2, CELL = 3, R2 = 9, SEP = 0.8, SEP2 = SEP * SEP, TURN = 1.7, FLEE_TURN = 5.5, TICK = 0.0125;
  var S = {};
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapA(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  /* BFS distance (tiles) from every water tile to land / pier / bank; water[] = lake tiles (biggest water body) at least 2.5 tiles from shore. */
  S.buildGrid = function (rows) {
    var H = rows.length, W = rows[0].length, wat = new Uint8Array(W * H), dist = new Float32Array(W * H), comp = new Int16Array(W * H), water = [], q = [], i, j, k, m, c = 0, best = 0, bc = 0, sz, st, u, ux, uz, n2;
    var DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) wat[j * W + i] = rows[j].charAt(i) === '~' ? 1 : 0;
    for (k = 0; k < dist.length; k++) { dist[k] = wat[k] ? 999 : 0; if (!wat[k]) q.push(k); }
    for (k = 0; k < q.length; k++) {
      var cur = q[k], cx = cur % W, cz = (cur / W) | 0;
      for (m = 0; m < 4; m++) { var nx = cx + DX[m], nz = cz + DZ[m]; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; var ni = nz * W + nx; if (wat[ni] && dist[ni] > dist[cur] + 1) { dist[ni] = dist[cur] + 1; q.push(ni); } }
    }
    for (k = 0; k < wat.length; k++) {
      if (!wat[k] || comp[k]) continue; c++; sz = 0; st = [k]; comp[k] = c;
      while (st.length) {
        u = st.pop(); ux = u % W; uz = (u / W) | 0; sz++;
        for (m = 0; m < 4; m++) { var x2 = ux + DX[m], z2 = uz + DZ[m]; if (x2 < 0 || z2 < 0 || x2 >= W || z2 >= H) continue; n2 = z2 * W + x2; if (wat[n2] && !comp[n2]) { comp[n2] = c; st.push(n2); } }
      }
      if (sz > best) { best = sz; bc = c; }
    }
    for (k = 0; k < wat.length; k++) if (comp[k] === bc && dist[k] >= 2.5) water.push(k);
    return { W: W, H: H, wat: wat, dist: dist, water: water, rows: rows };
  };

  S.create = function (o) {
    var g = o.grid, rnd = o.rnd || Math.random, cap = o.cap, W = g.W, H = g.H, dist = g.dist, wat = g.wat, i, k;
    var cols = Math.ceil(W / CELL), rws = Math.ceil(H / CELL), head = new Int32Array(cols * rws), next = new Int32Array(cap);
    var sim = { fish: [], att: [], t: 0, grid: g, ticks: 0 }, fish = sim.fish, att = sim.att, clock = 0, grp = 0;
    function td(x, z) { var a = Math.floor(x), b = Math.floor(z); return (a < 0 || b < 0 || a >= W || b >= H) ? 0 : Math.min(dist[b * W + a], 9); }
    function tile(k2) { return { x: k2 % W + 0.5, z: ((k2 / W) | 0) + 0.5 }; }
    sim.td = td;
    /* attractor candidates: deep water, pier posts (water next to planks), reed-like bank pockets (water next to sand) */
    var cand = { deep: [], pier: [], reed: [] };
    function near(ch, x, z, r) { var a, b; for (b = -r; b <= r; b++) for (a = -r; a <= r; a++) { var xx = x + a, zz = z + b; if (xx >= 0 && zz >= 0 && xx < W && zz < H && g.rows[zz].charAt(xx) === ch) return true; } return false; }
    for (k = 0; k < wat.length; k++) {
      if (!wat[k]) continue;
      var d = dist[k], x = k % W, z = (k / W) | 0;
      if (d >= 5) cand.deep.push(k);
      else if (d >= 1.5 && d <= 3.2) { if (near('p', x, z, 2)) cand.pier.push(k); else if (near(',', x, z, 3)) cand.reed.push(k); }
    }
    var kinds = ['deep', 'pier', 'reed', 'deep'], na = o.nAtt || 4, tries, kd, list;
    function pickCand(kind, kmin) {
      list = cand[kind].length ? cand[kind] : (g.water.length ? g.water : cand.deep);
      for (tries = 0; tries < 12; tries++) { var kk = list[(rnd() * list.length) | 0]; if (dist[kk] >= kmin) return tile(kk); }
      return tile(list[(rnd() * list.length) | 0]);
    }
    for (i = 0; i < na; i++) { kd = kinds[i % 4]; var c0 = pickCand(kd, 1.4); att.push({ x: c0.x, z: c0.z, gx: c0.x, gz: c0.z, kind: kd, mvT: 30 + rnd() * 60, sp: [] }); }
    for (i = 0; i < cap; i++) {
      var a0 = att[i % na], px = a0.x + (rnd() - 0.5) * 3, pz = a0.z + (rnd() - 0.5) * 3;
      if (td(px, pz) < 1.5) { px = a0.x; pz = a0.z; }
      fish.push({ i: i, x: px, z: pz, hd: rnd() * TAU, want: 0, spd: 0.5, tsp: 0.5, base: 0.42 + rnd() * 0.4, fl: 0, ph: rnd() * TAU, ph2: rnd() * TAU, h: i % na,
        id: null, len: 1, body: 0, size: 1, al: 0, eng: 0, nb: 0, lx: px, lz: pz, ad: 0 });
      fish[i].want = fish[i].hd;
    }
    function rebuild() {
      var n = fish.length, f, c;
      head.fill(-1);
      for (var q = 0; q < n; q++) { f = fish[q]; c = clamp((f.z / CELL) | 0, 0, rws - 1) * cols + clamp((f.x / CELL) | 0, 0, cols - 1); next[q] = head[c]; head[c] = q; }
    }
    function steer(f, dt) {
      var cx = clamp((f.x / CELL) | 0, 0, cols - 1), cz = clamp((f.z / CELL) | 0, 0, rws - 1), a, b, j, o2, dx, dz, d2;
      var sx = 0, sz = 0, ax = 0, az = 0, qx = 0, qz = 0, n = 0, len, vx, vz, tsp = f.base;
      for (b = Math.max(0, cz - 1); b <= Math.min(rws - 1, cz + 1); b++) for (a = Math.max(0, cx - 1); a <= Math.min(cols - 1, cx + 1); a++) {
        for (j = head[b * cols + a]; j >= 0; j = next[j]) {
          if (j === f.i) continue;
          o2 = fish[j]; dx = o2.x - f.x; dz = o2.z - f.z; d2 = dx * dx + dz * dz;
          if (d2 > R2) continue;
          n++; qx += dx; qz += dz; ax += Math.cos(o2.hd); az += Math.sin(o2.hd);
          if (d2 < SEP2) { d2 = Math.max(d2, 0.02); sx -= dx / d2 * SEP2; sz -= dz / d2 * SEP2; }
        }
      }
      f.nb = n;
      if (f.fl > 0) { f.fl -= dt; f.tsp = 1.5; return; }   // darting: keep the flee heading, then calm down
      vx = 0; vz = 0;
      len = Math.sqrt(sx * sx + sz * sz); if (len > 1) { sx /= len; sz /= len; } vx += sx * 2; vz += sz * 2;
      if (n) {
        len = Math.sqrt(ax * ax + az * az) || 1; vx += ax / len * 0.9; vz += az / len * 0.9;
        qx /= n; qz /= n; len = Math.sqrt(qx * qx + qz * qz); if (len > 0.001) { var cw = Math.min(1, len / 2); vx += qx / len * cw * 1.1; vz += qz / len * cw * 1.1; }
      }
      var w = Math.sin(clock * 0.37 + f.ph) + 0.6 * Math.sin(clock * 0.91 + f.ph2), wh = f.hd + w * 0.8;   // smooth-noise wander
      vx += Math.cos(wh) * 0.6; vz += Math.sin(wh) * 0.6;
      var bd = 1e9, bi = -1;
      for (j = 0; j < att.length; j++) { dx = att[j].x - f.x; dz = att[j].z - f.z; d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; bi = j; } }
      if (bi >= 0 && bd < 144 && bd > 2.25) { len = Math.sqrt(bd); vx += (att[bi].x - f.x) / len * Math.min(1, len / 4) * (n ? 0.3 : 0.55); vz += (att[bi].z - f.z) / len * Math.min(1, len / 4) * (n ? 0.3 : 0.55); }
      var dd = td(f.x, f.z), ahead = td(f.x + Math.cos(f.hd) * 1.2, f.z + Math.sin(f.hd) * 1.2), m = Math.min(dd, ahead);
      if (m < 3) {   // away from shore / pier / shallow: gradient of the distance field
        var gx = td(f.x + 1, f.z) - td(f.x - 1, f.z), gz = td(f.x, f.z + 1) - td(f.x, f.z - 1); len = Math.sqrt(gx * gx + gz * gz);
        if (len > 0.01) { var sw = (3 - m) / 1.4 * 3; vx += gx / len * sw; vz += gz / len * sw; }
        tsp = Math.max(tsp, 0.55);
      }
      len = Math.sqrt(vx * vx + vz * vz); if (len > 0.001) f.want = Math.atan2(vz, vx);
      f.tsp = tsp * (1 + 0.22 * Math.sin(clock * 0.3 + f.ph2));
    }
    var fcx = 0, fcz = 0, fr2 = 0;   // focus (fishing): shadows farther than the radius move every 12th step with the accumulated dt (5 Hz at 60 Hz), staggered by index
    sim.sn = 0;
    sim.focus = function (x, z, r) { fcx = x; fcz = z; fr2 = r * r; };
    function moveAll(dt0) {
      var q, f, lim, da, nx, nz, dt, fx, fz;
      for (q = 0; q < fish.length; q++) {
        f = fish[q]; if (f.eng) continue;   // an engaged shadow is driven by the bite logic
        dt = dt0; fx = f.x - fcx; fz = f.z - fcz;
        if (fr2 > 0 && fx * fx + fz * fz > fr2) { f.ad += dt0; if ((sim.sn + q) % 12 !== 0) continue; dt = f.ad > 0.25 ? 0.25 : f.ad; f.ad = 0; } else if (f.ad) { dt = dt0 + (f.ad > 0.25 ? 0.25 : f.ad); f.ad = 0; }
        lim = (f.fl > 0 ? FLEE_TURN : TURN) * dt; da = wrapA(f.want - f.hd); f.hd += clamp(da, -lim, lim);
        f.spd += (f.tsp - f.spd) * Math.min(1, dt * 2.5);
        nx = f.x + Math.cos(f.hd) * f.spd * dt; nz = f.z + Math.sin(f.hd) * f.spd * dt;
        if (td(nx, nz) < 1.0) {   // never leave the water: bounce back towards deeper tiles
          var gx = td(f.x + 1, f.z) - td(f.x - 1, f.z), gz = td(f.x, f.z + 1) - td(f.x, f.z - 1);
          f.want = Math.atan2(gz, gx); f.hd += clamp(wrapA(f.want - f.hd), -0.5, 0.5); f.fl = 0; f.spd *= 0.5; nx = f.x; nz = f.z;
          if (td(nx, nz) < 0.6) { nx = f.lx; nz = f.lz; }
        } else if (td(nx, nz) >= 1.5) { f.lx = nx; f.lz = nz; }
        f.x = nx; f.z = nz;
      }
    }
    function drift(dt) {
      var j, h, dx, dz, dd, sp, c1;
      for (j = 0; j < att.length; j++) {
        h = att[j]; h.mvT -= dt;
        if (h.mvT <= 0) { c1 = pickCand(h.kind, 1.4); h.gx = c1.x; h.gz = c1.z; h.mvT = 50 + rnd() * 70; }
        dx = h.gx - h.x; dz = h.gz - h.z; dd = Math.sqrt(dx * dx + dz * dz);
        if (dd > 0.2) { sp = Math.min(0.14, dd) * dt; if (td(h.x + dx / dd * 0.5, h.z + dz / dd * 0.5) < 1.2) { h.gx = h.x; h.gz = h.z; } else { h.x += dx / dd * sp; h.z += dz / dd * sp; } }
      }
    }
    /* advance the school by dt seconds (frame dt, clamped by the caller) */
    sim.step = function (dt) {
      var acc = (sim._acc || 0) + dt, q, n = 0;
      clock += dt; sim.t = clock; sim.sn++;
      while (acc >= TICK && n < 10) {
        acc -= TICK; n++;
        if (grp === 0) rebuild();
        for (q = grp; q < fish.length; q += 4) steer(fish[q], 0.05);
        grp = (grp + 1) & 3; sim.ticks++;
      }
      sim._acc = acc;
      drift(dt); moveAll(dt);
    };
    /* scare fish within r of (x,z) (not the one in `skip`): they turn away fast and dart for ~2 s */
    sim.startle = function (x, z, r, skip) {
      var q, f, dx, dz, c = 0;
      for (q = 0; q < fish.length; q++) {
        f = fish[q]; if (f === skip || f.eng) continue;
        dx = f.x - x; dz = f.z - z;
        if (dx * dx + dz * dz < r * r) { f.want = Math.atan2(dz, dx) + (rnd() - 0.5) * 0.8; f.fl = 1.6 + rnd() * 1.2; f.tsp = 1.5; c++; }
      }
      return c;
    };
    /* indices of free shadows within r of (x,z): fills out[] (length reset) */
    sim.near = function (x, z, r, out) {
      var q, f, dx, dz; out.length = 0;
      for (q = 0; q < fish.length; q++) { f = fish[q]; if (f.eng) continue; dx = f.x - x; dz = f.z - z; if (dx * dx + dz * dz < r * r) out.push(q); }
      return out;
    };
    sim.randomWater = function (minD) {
      var t = 0, kk; do { kk = g.water[(rnd() * g.water.length) | 0]; t++; } while (dist[kk] < minD && t < 40);
      return tile(kk);
    };
    rebuild();
    return sim;
  };
  root.Game = root.Game || {}; root.Game.FishSchool = S;
  if (typeof module !== 'undefined') module.exports = S;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? (global.Game = global.Game || {}, { Game: global.Game }) : this));
