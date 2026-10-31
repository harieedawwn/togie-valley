#!/usr/bin/env node
/* Togie Valley - tools/school_sim.js (Round 3 stage 13): 60 simulated seconds of FishSchool on the real water map, several seeds. Exit 1 on NaN / fish outside water / no schooling / no circling. */
'use strict';
var S = require('../js/fish_school.js'), WM = require('../js/world_map.js'), g = S.buildGrid(WM.rows), bad = 0;
function mk(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
var CAPS = [40, 16];
console.log('seed cap  NaN  outside  nn-dist(start->end)  mean-nb  circling(best school)  startle-ok');
[1, 7, 42, 1234].forEach(function (seed, si) {
  var cap = CAPS[si % 2], sim = S.create({ grid: g, cap: cap, rnd: mk(seed), nAtt: 4 }), t, nan = 0, out = 0, nn0 = 0, nn1 = 0, circ = 0, circN = 0, best = 0, nbs = 0, nbN = 0, dt = 1 / 60, i;
  function nn() { var s = 0; sim.fish.forEach(function (a) { var b = 99; sim.fish.forEach(function (c) { if (c !== a) { var d = Math.hypot(a.x - c.x, a.z - c.z); if (d < b) b = d; } }); s += b; }); return s / sim.fish.length; }
  function circling() {   // connected components (link < 3 tiles); |mean sign of angular motion| about each centroid
    var seen = {}, res = 0, f;
    sim.fish.forEach(function (a) {
      if (seen[a.i]) return; var comp = [a], st = [a]; seen[a.i] = 1;
      while (st.length) { var u = st.pop(); sim.fish.forEach(function (c) { if (!seen[c.i] && Math.hypot(u.x - c.x, u.z - c.z) < 3) { seen[c.i] = 1; comp.push(c); st.push(c); } }); }
      if (comp.length < 4) return;
      var cx = 0, cz = 0, m = 0; comp.forEach(function (c) { cx += c.x; cz += c.z; }); cx /= comp.length; cz /= comp.length;
      comp.forEach(function (c) { var rx = c.x - cx, rz = c.z - cz, rl = Math.hypot(rx, rz) || 1, vx = Math.cos(c.hd), vz = Math.sin(c.hd); m += (rx * vz - rz * vx) / rl; });
      res = Math.max(res, Math.abs(m / comp.length));
    });
    return res;
  }
  nn0 = nn();
  for (t = 0; t < 60 * 60; t++) {
    sim.step(dt);
    if (t === 600) sim.startle(sim.fish[0].x, sim.fish[0].z, 3, null);
    if (t % 20 === 0) {
      sim.fish.forEach(function (f) { if (!(isFinite(f.x) && isFinite(f.z) && isFinite(f.hd) && isFinite(f.spd))) nan++; else if (!g.wat[Math.floor(f.z) * g.W + Math.floor(f.x)]) out++; nbs += f.nb; nbN++; });
      if (t > 1200) { var c = circling(); circ += c; circN++; if (c > best) best = c; }
    }
  }
  nn1 = nn();
  var fleeOk = sim.fish.every(function (f) { return f.fl < 3; });
  console.log(seed + '    ' + cap + '   ' + nan + '    ' + out + '        ' + nn0.toFixed(2) + ' -> ' + nn1.toFixed(2) + '        ' + (nbs / nbN).toFixed(2) + '     avg ' + (circ / circN).toFixed(2) + ' best ' + best.toFixed(2) + '       ' + fleeOk);
  if (nan || out || nn1 >= nn0 * 0.95 && nn1 > 2.5 || !(best > 0)) bad++;
});
console.log(bad ? 'FAIL' : 'OK'); process.exit(bad ? 1 : 0);
