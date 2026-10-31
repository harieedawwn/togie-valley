/* Togie Valley - grass.js (Stage 16 E): lush ground grass. Game.Grass.build() once (main.js, after DetailExtra).
 * layout(o) is pure (browser + node): seeded dense low tufts per grass tile, noise patches, denser near trees and water,
 * thin beside paths / pier / buildings, sparse on sand, none on paths / soil / farm. Count scales with the quality tier (o.scale 0..1, cap CAP x scale).
 * build(): one tree-shader instanced tuft geometry (per-instance tint + seasonal colour + wind sway from Decor.instanced), no outline,
 * chunked into 30-tile cells (at most 6 meshes on the whole map, about 4 on screen). Static: tier changes apply on next launch.
 * layout(o) = {rows, trees:[{x,z,r}], scale, seed, reserve?} -> {list:[{x,z,ry,s,tint:[r,g,b,0]}], count, tiles}. */
(function (root) {
  'use strict';
  var CAP = 3600, MEAN = 1.45;
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vn(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function layout(o) {
    var rows = o.rows, W = rows[0].length, H = rows.length, rnd = rng((o.seed || 5150) + 7), scale = Math.max(0, Math.min(1, o.scale === undefined ? 1 : o.scale)), trees = o.trees || [];
    var wgt = new Float32Array(W * H), boost = new Float32Array(W * H), x, z, i, j, list = [], sum = 0, tiles = 0;
    function ch(a, b) { return a < 0 || b < 0 || a >= W || b >= H ? '' : rows[b].charAt(a); }
    function isFarm(a, b) { return a > 10 && a < 29 && b > 5 && b < 20; }
    trees.forEach(function (t) {   // denser under and around every canopy
      var rad = Math.ceil((t.r || 1.5) * 1.1 + 1), tx = Math.floor(t.x), tz = Math.floor(t.z), a, b, d;
      for (b = tz - rad; b <= tz + rad; b++) for (a = tx - rad; a <= tx + rad; a++) {
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        d = Math.hypot(a + 0.5 - t.x, b + 0.5 - t.z); if (d < (t.r || 1.5) * 1.1 + 0.8) boost[b * W + a] = Math.max(boost[b * W + a], 1.9);
      }
    });
    function near(a, b, set, rad) { for (var jj = -rad; jj <= rad; jj++) for (var ii = -rad; ii <= rad; ii++) if (set.indexOf(ch(a + ii, b + jj)) >= 0) return true; return false; }
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      var c = ch(x, z), w;
      if (c === ',') { w = near(x, z, '.', 1) ? 0.12 : 0; }          // sand: only a fringe where it meets grass
      else if (c !== '.' || isFarm(x, z)) continue;
      else {
        w = 0.55 + 0.9 * vn(x * 0.15 + 5, z * 0.15);                  // noise patches: lush / thin
        if (boost[z * W + x]) w *= boost[z * W + x];
        if (near(x, z, '~', 2)) w *= 1.6;                              // lush by the water
        if (near(x, z, '=opHSWFDBCKMtl', 1)) w *= 0.3;                 // thin beside paths, pier, soil, buildings
        else if (near(x, z, ',', 1)) w *= 0.6;
      }
      if (w > 0) { wgt[z * W + x] = w; sum += w * MEAN; tiles++; }
    }
    var k = Math.min(1, CAP * scale / Math.max(1, sum)) * scale > 0 ? Math.min(1, CAP * scale / Math.max(1, sum)) : 0;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      var n = wgt[z * W + x] * MEAN * k; if (!n) continue;
      var cnt = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0), pt = vn(x * 0.09 + 11, z * 0.09);
      for (j = 0; j < cnt; j++) {
        var s = 0.8 + rnd() * 0.6 + (boost[z * W + x] ? 0.15 : 0), jt = (rnd() - 0.5) * 0.08;
        list.push({ x: x + 0.05 + rnd() * 0.9, z: z + 0.05 + rnd() * 0.9, ry: rnd() * 6.2832, s: s, tint: [0.9 + 0.2 * pt + jt, 1.0 + 0.08 * (1 - pt) - jt, 0.9 + 0.1 * pt - jt * 0.5, 0] });
      }
    }
    return { list: list, count: list.length, tiles: tiles };
  }

  var Gr = { layout: layout, CAP: CAP, count: 0 };
  Gr.build = function () {
    var G = root.Game;
    if (Gr.group) return Gr.group;
    if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.Decor || !G.WorldMap || !G.Scenery) { console.error('[grass] missing deps'); return null; }
    var Mo = G.Models, P = Mo.part, D = G.Decor, i, a, h, m, parts = [], pos, at = [], col, y, f;
    var cs = [0x6fbf5f, 0x86d070, 0x5fae58, 0x7cc968, 0x93d97a, 0x68b85c, 0x80cc6c];
    for (i = 0; i < 7; i++) {   // 7 open 3-sided blades fanned out, leaning away from the centre
      a = i * 0.898 + 0.3; h = 0.2 + (i % 3) * 0.07; m = 0.22 + (i % 2) * 0.2;
      parts.push(P(new THREE.ConeGeometry(0.035, h, 3, 1, true), cs[i], [Math.cos(a) * 0.07 + (i === 6 ? 0 : 0), h / 2, Math.sin(a) * 0.07], [m * Math.sin(a), 0, -m * Math.cos(a)]));
    }
    var g = Mo.mergeParts(parts); pos = g.attributes.position; col = g.attributes.color;
    for (i = 0; i < pos.count; i++) {   // darker roots, brighter tips
      y = pos.getY(i); f = 0.72 + 0.55 * Math.min(1, y / 0.3); col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f); at.push(1, 1, 0);
    }
    g.setAttribute('aTree', new THREE.Float32BufferAttribute(at, 3)); g.computeBoundingSphere();
    var q = G.Quality && G.Quality.tiers ? G.Quality.tiers[G.Quality.level ? G.Quality.level() : 0] : null, scale = q && q.flower !== undefined ? Math.max(0.12, q.flower) : 1;
    var all = (G.Decor.layout ? G.Decor.layout.trees : []).concat(G.Scenery.layout ? G.Scenery.layout.trees : []);
    var lay = layout({ rows: G.WorldMap.rows, trees: all, scale: scale, seed: 5150 });
    var grp = new THREE.Group(); grp.name = 'grass';
    var before = D.group.children.length;
    D.instanced(g, lay.list, 1.1, true, { tree: true, seasonal: 0.85, chunk: 30, group: 'grass' });
    Gr.group = grp; Gr.count = lay.count; Gr.scale = scale; Gr.meshes = D.group.children.length - before;
    return grp;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Gr;
  if (root.Game) root.Game.Grass = Gr;
})(typeof window !== 'undefined' ? window : this);
