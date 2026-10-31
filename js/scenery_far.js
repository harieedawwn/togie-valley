/* Togie Valley - scenery_far.js (Stage 14B): the far treeline of the scenery ring, restyled to match the near props.
 * Game.SceneryFar.build(ctx) is called by Scenery's buildRing (ctx = helpers from scenery.js). Returns {count, tris}. setDensity(d) thins it per tier.
 * Look: the same Decor tree shader as the near trees (3 toon bands, shared light/ambient/fog/season uniforms, seasonal canopy recolor), the same palette
 * (oak greens, palm greens, birch yellow-greens), three low-poly species (round, areca, poplar) with per-instance tint that drifts toward a cool haze with
 * distance from the map, darker underside (vertex colors) instead of flat colour, and sizes capped at 2.3-3.6 units (near large trees are 2.8-3.5, hero 1.0).
 * Only trees within OUTLINE_D of the map get the ink hull (outline mesh = same instance buffer with a smaller count: instances are ordered near-first).
 * Stage 14 (Round 3): 5 far buildings (nha la, nha san, choi, lo gach, mieu) + a moored boat in ONE merged mesh (1 draw, no outline, no flags, no collision).
 * Budget: ring triangles never rise above the old treeline estimate (count x 105 tris); the outline band shrinks until that holds. Draw calls 6 (was 2).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Decor) { console.error('[scenery_far] missing deps'); return; }
  var D = G.Decor, F = { meshes: [], count: 0, tris: 0, density: 1 };
  var OUTLINE_D = 6.5, OLD_TRIS_PER_TREE = 105, NOMINAL = { round: 2.5, areca: 2.8, poplar: 3.0 };
  var BARK = 0x8c5a34, BARK2 = 0x7a4f2e;
  var species = [], pendingDensity = 1, PI = Math.PI;

  /* ---- Round 3 stage 14: 5 far buildings + a moored boat on the outer ring (low detail, one merged mesh, no outline, no flags, no collision:
   * the ring is outside the walkable map). Spots are seeded; each avoids the lake side and picks the flattest of 60 tries; far trees are cleared around them. */
  var BTYPES = ['hut', 'san', 'choi', 'kiln', 'shrine'], BSIDES = [3, 0, 2, 1, 0], BSCALE = 1.45;
  function slopeAt(ctx, x, z) { var lo = 1e9, hi = -1e9, a, b, h; for (a = -1; a <= 1; a++) for (b = -1; b <= 1; b++) { h = ctx.hillH(x + a * 1.2, z + b * 1.2); if (h < lo) lo = h; if (h > hi) hi = h; } return [lo, hi - lo]; }
  function placeSpots(ctx) {
    var r = ctx.SL.rng(5151), MW = ctx.MW, MH = ctx.MH, spots = [], i, t, side, u, d, x, z, best, sl, sc, j, ok, z0 = -1;
    for (i = 0; i < BTYPES.length; i++) {
      best = null; side = BSIDES[i];
      for (t = 0; t < 60; t++) {
        u = 0.1 + r() * 0.8; d = 9 + r() * 9;
        x = side === 2 ? -d : side === 3 ? MW + d : u * MW; z = side === 0 ? -d : side === 1 ? MH + d : u * MH;
        if (ctx.rowAt(Math.floor(x), Math.floor(z)) === '~' || ctx.rowAt(Math.floor(x), Math.floor(z - 2)) === '~' || ctx.rowAt(Math.floor(x), Math.floor(z + 2)) === '~' || ctx.rowAt(Math.floor(x - 2), Math.floor(z)) === '~' || ctx.rowAt(Math.floor(x + 2), Math.floor(z)) === '~') continue;
        ok = true; for (j = 0; j < spots.length; j++) if ((spots[j].x - x) * (spots[j].x - x) + (spots[j].z - z) * (spots[j].z - z) < 169) { ok = false; break; }
        if (!ok) continue;
        sl = slopeAt(ctx, x, z); sc = sl[1] + r() * 0.15;
        if (!best || sc < best.sc) best = { sc: sc, x: x, z: z, y: sl[0] };
        if (sl[1] < 0.3) break;
      }
      if (best) spots.push({ type: BTYPES[i], x: best.x, z: best.z, y: best.y - 0.05, ry: Math.atan2(MW / 2 - best.x, MH / 2 - best.z) + (r() - 0.5) * 0.5, s: BSCALE * (0.92 + r() * 0.16) });
    }
    for (j = 0; j < MH; j++) if (ctx.rowAt(MW - 1, j) === '~') { z0 = j; break; }   // moored boat: just outside the first lake row on the east edge, hugging the bank
    if (z0 > 0) spots.push({ type: 'boat', x: MW + 5.5 + r() * 1.5, z: z0 + 1.3, y: -0.16, ry: 0, s: 1.35 });
    return spots;
  }
  function bHut(K) {
    var C = K.C; K.bx(2.6, 0.12, 2.0, C.wood, 0, 0.06, 0); K.bx(2.4, 1.0, 1.8, K.bambooH(C.bamA, C.bamB), 0, 0.62, 0);
    K.roof({ x: 0, z: 0, w: 2.8, d: 2.3, y: 1.12, rise: 0.95, over: 0.22, c1: C.thatchA, c2: C.thatchB, base: C.thatchBase, rw: 0.32, thick: 0.13, fringe: true, curve: 0.04, ridgeC: C.thatchB, tips: false, gable: C.thatchB });
    K.bx(0.5, 0.78, 0.05, C.door, 0.3, 0.51, 0.93);
  }
  function bSan(K) {
    var C = K.C, i; for (i = 0; i < 6; i++) K.cy(0.07, 1.3, C.wood, -1.05 + (i % 3) * 1.05, 0.65, i < 3 ? -0.7 : 0.7);
    K.bx(2.7, 0.12, 1.9, C.wood2, 0, 1.34, 0); K.bx(2.4, 0.95, 1.6, K.plank(C.wood2, C.wood), 0, 1.88, 0);
    K.roof({ x: 0, z: 0, w: 2.9, d: 2.3, y: 2.35, rise: 0.85, over: 0.2, c1: C.tile, c2: C.tile2, base: C.tileBase, rw: 0.22, curve: 0.12, ridgeC: C.ridge, tips: true, gable: C.plaster2 });
    K.bx(0.4, 0.07, 1.8, C.wood, 0.4, 0.67, 1.6, 0.84, 0, 0); K.bx(0.5, 0.7, 0.05, C.door, 0, 1.7, 0.82);
  }
  function bChoi(K) {
    var C = K.C, i, y, sx, sz;
    for (i = 0; i < 4; i++) { sx = i % 2 ? 0.58 : -0.58; sz = i < 2 ? 0.58 : -0.58; K.cy(0.05, 2.3, K.bambooV(C.bamA, C.bamB), sx, 1.15, sz); K.cy(0.03, 0.9, C.bamB, sx * 0.9, 2.78, sz * 0.9); }
    K.bx(1.5, 0.08, 1.5, C.bamB, 0, 2.3, 0); K.bx(1.5, 0.05, 0.04, C.bamA, 0, 2.62, -0.72); K.bx(0.04, 0.05, 1.5, C.bamA, -0.72, 2.62, 0); K.bx(0.04, 0.05, 1.5, C.bamA, 0.72, 2.62, 0);
    K.cn(1.05, 0.85, C.thatchA, 0, 3.4, 0, 0, 0, 4); K.cn(0.7, 0.5, C.thatchB, 0, 3.8, 0, 0, 0, 4);
    K.poleZY(-0.22, 0, 1.3, 2.3, 0.72, 0.025, C.bamB); K.poleZY(0.22, 0, 1.3, 2.3, 0.72, 0.025, C.bamB);
    for (i = 1; i < 6; i++) { y = i * 0.38; K.bx(0.44, 0.03, 0.04, C.bamA, 0, y, 1.3 - 0.58 * y / 2.3); }
  }
  function bKiln(K) {
    var C = K.C; K.bx(2.4, 0.9, 2.0, K.brickV(C.brick, C.brick2), 0, 0.45, 0); K.sp(1.05, C.brick, 0, 0.85, 0, 0.55);
    K.bx(0.7, 0.6, 0.1, C.dark, 0, 0.3, 1.03); K.bx(0.8, 0.1, 0.14, C.brick2, 0, 0.65, 1.04); K.bx(0.6, 0.35, 0.4, C.brick, -1.6, 0.18, 0.9); K.bx(0.5, 0.3, 0.36, C.brick2, -1.55, 0.5, 0.9);
  }
  function bShrine(K) {
    var C = K.C; K.bx(1.5, 0.22, 1.3, C.stone, 0, 0.11, 0); K.bx(1.05, 0.85, 0.85, C.plaster, 0, 0.65, 0); K.bx(0.4, 0.55, 0.05, C.red2, 0, 0.5, 0.45);
    K.roof({ x: 0, z: 0, w: 1.45, d: 1.15, y: 1.08, rise: 0.5, over: 0.15, c1: C.tile, c2: C.tile2, base: C.tileBase, rw: 0.2, discs: true, curve: 0.1, ridgeC: C.ridge, tips: true, gable: C.plaster });
    K.cy(0.1, 0.14, C.stone, 0, 0.3, 0.9);
  }
  function bBoat(K) {
    var C = K.C, hull = 0xb8794a; K.bx(1.7, 0.05, 0.46, C.straw, 0, 0.04, 0); K.bx(1.7, 0.3, 0.05, hull, 0, 0.18, 0.26, 0.24); K.bx(1.7, 0.3, 0.05, hull, 0, 0.18, -0.26, -0.24);
    K.bx(0.46, 0.26, 0.4, hull, 0.98, 0.26, 0, 0, 0, 0.5); K.bx(0.46, 0.26, 0.4, hull, -0.98, 0.26, 0, 0, 0, -0.5);
    K.bx(1.72, 0.04, 0.06, C.red, 0, 0.33, 0.33, 0.24); K.bx(1.72, 0.04, 0.06, C.red, 0, 0.33, -0.33, -0.24); K.cy(0.05, 1.2, C.dark, 0.8, 0.3, -0.95);
  }
  var BUILD = { hut: bHut, san: bSan, choi: bChoi, kiln: bKiln, shrine: bShrine, boat: bBoat };
  function makeBuildings(ctx, spots) {
    var K, g, gs = [], n = 0, i, o, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), pos, nor, col, mesh;
    if (!G.VNKit || !G.Models || !spots.length) return;
    spots.forEach(function (sp) {
      K = G.VNKit.make();
      if (sp.type !== 'boat') K.bx(2.9, 1.0, 2.5, 0xb7b2a6, 0, -0.45, 0);   // plinth hides the slope under the building
      BUILD[sp.type](K); g = K.merge();
      g.applyMatrix4(m.compose(p.set(sp.x, sp.y, sp.z), q.setFromEuler(e.set(0, sp.ry, 0)), sc.setScalar(sp.s)));
      gs.push(g); n += g.attributes.position.count;
    });
    pos = new Float32Array(n * 3); nor = new Float32Array(n * 3); col = new Float32Array(n * 3); o = 0;
    gs.forEach(function (x) { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); col.set(x.attributes.color.array, o * 3); o += x.attributes.position.count; x.dispose(); });
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    mesh = ctx.staticMesh(g, G.Models.material('prop'), 'far_buildings', false);   // scenery.js helper: static, raycast off
    if (G.Scenery && G.Scenery.group) G.Scenery.group.add(mesh);
    F.meshes.push(mesh); F.buildings = spots; F.bTris = Math.round(n / 3);
  }

  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function build(ctx) {
    var SL = ctx.SL, P = ctx.P, M = ctx.M, MW = ctx.MW, MH = ctx.MH;
    function trunk(rt, rb, h, c, x, y, z) { return P(new THREE.CylinderGeometry(rt, rb, h, 5, 1, true), c, [x, y, z]); }
    function ico(r, c, x, y, z, sy) { return P(new THREE.IcosahedronGeometry(r, 0), c, [x, y, z], [0, 0, 0], [1, sy || 1, 1]); }
    function dark(g) {   // darker underside / rim from vertex colours: no extra cost, avoids the flat look
      var pa = g.attributes.position, ca = g.attributes.color, i, y0 = 1e9, y1 = -1e9, f, y;
      for (i = 0; i < pa.count; i++) { y = pa.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
      for (i = 0; i < pa.count; i++) {
        f = 0.8 + 0.2 * sm(0.2, 0.9, (pa.getY(i) - y0) / Math.max(0.01, y1 - y0));
        ca.setXYZ(i, ca.getX(i) * f, ca.getY(i) * f, ca.getZ(i) * f);
      }
      return g;
    }
    var GEO = {
      round: function () {   // oak palette
        return dark(ctx.treeGeo(0.9, { trunk: [trunk(0.12, 0.2, 0.9, BARK, 0, 0.45, 0)],
          canopy: [ico(0.95, 0x6fbf68, 0, 1.65, 0, 0.88), ico(0.7, 0x5fb86a, 0.55, 1.45, 0.2, 0.9), ico(0.62, 0x78c870, -0.5, 1.5, -0.25, 0.9)] }));
      },
      areca: function () {   // areca/coconut palette: tall pale slim trunk, small flat crown
        return dark(ctx.treeGeo(1.7, { trunk: [trunk(0.05, 0.09, 1.7, 0xc2b48a, 0, 0.85, 0)],
          canopy: [ico(0.6, 0x4f9d4a, 0, 1.95, 0, 0.45), ico(0.42, 0x62b256, 0.12, 2.25, 0.05, 0.6)] }));
      },
      poplar: function () {  // birch palette, tall and slim
        return dark(ctx.treeGeo(1.0, { trunk: [trunk(0.07, 0.11, 1.0, 0xf1ede2, 0, 0.5, 0)],
          canopy: [ico(0.55, 0x9fd36a, 0, 1.9, 0, 1.7), ico(0.4, 0xb5df6f, 0.1, 2.6, 0.05, 1.3)] }));
      }
    };
    var SEASONAL = { round: 0.9, areca: 0.15, poplar: 0.9 }, spots = placeSpots(ctx);

    // placement: same grid / density rules as the old treeline, species + size + rotation + haze tint per tree
    var rr = SL.rng(4242), step = 2.2, gx, gz, x, z, d, p, it, sp, H, k, lists = { round: [], areca: [], poplar: [] };
    for (gz = -50; gz < MH + 50; gz += step) for (gx = -50; gx < MW + 50; gx += step) {
      x = gx + (rr() - 0.5) * 1.6; z = gz + (rr() - 0.5) * 1.6; d = ctx.dRect(x, z);
      if (d < 1.4 || d > 44) continue;
      if (ctx.rowAt(Math.floor(x), Math.floor(z)) === '~') continue;   // lake side: water skirt, no trees
      p = d < 10 ? 0.4 : 0.05;
      if (rr() > p * (0.6 + 0.8 * ctx.vn(x * 0.2, z * 0.2))) continue;
      sp = ctx.vn(x * 0.15 + 5, z * 0.15) < 0.55 ? 'areca' : (rr() < 0.22 ? 'poplar' : 'round');
      H = Math.min(3.6, Math.max(2.3, 2.3 + rr() * 1.1 + sm(0, 30, d) * 0.2));   // capped: never dwarfs the play area
      k = sm(2, 40, d);                                                              // 0 near the map .. 1 far: cool haze
      it = { x: x, y: ctx.hillH(x, z) - 0.05, z: z, ry: rr() * 6.283, s: H / NOMINAL[sp], lx: (rr() - 0.5) * 0.1, lz: (rr() - 0.5) * 0.1, d: d,
        tint: [1 - 0.16 * k + (rr() - 0.5) * 0.1, 1 - 0.03 * k + (rr() - 0.5) * 0.08, 1 + 0.07 * k + (rr() - 0.5) * 0.06, 0], sp: sp };
      lists[sp].push(it);
    }

    for (var ln in lists) lists[ln] = lists[ln].filter(function (tr) { var b; for (b = 0; b < spots.length; b++) if ((tr.x - spots[b].x) * (tr.x - spots[b].x) + (tr.z - spots[b].z) * (tr.z - spots[b].z) < 12) return false; return true; });   // clear the treeline around the far buildings
    makeBuildings(ctx, spots);
    // order each species: near band (shuffled) then far band (shuffled); thinning by density keeps a uniform prefix of each band
    var total = 0, tris = 0, nOutlined = 0, name, lst, geo, near, far, ms, i, j, t, a;
    var shuf = SL.rng(99);
    function shuffle(arr) { for (j = arr.length - 1; j > 0; j--) { a = Math.floor(shuf() * (j + 1)); t = arr[j]; arr[j] = arr[a]; arr[a] = t; } return arr; }
    var oldTris = 0, newFill = 0;
    for (name in lists) { total += lists[name].length; }
    oldTris = total * OLD_TRIS_PER_TREE;
    var outD = OUTLINE_D;
    function trisFor(od) {   // estimated triangles for a given outline band
      var s = 0, nm, l, g, n, no, q;
      for (nm in lists) {
        l = lists[nm]; g = GEO.__tris[nm]; no = 0;
        for (q = 0; q < l.length; q++) if (l[q].d < od) no++;
        s += g * (l.length + no);
      }
      return s;
    }
    GEO.__tris = {};
    for (name in lists) { geo = GEO[name](); GEO.__tris[name] = geo.attributes.position.count / 3; species.push({ name: name, geo: geo }); }
    while (outD > 0 && trisFor(outD) > oldTris) outD -= 0.5;   // budget: ring triangles must not rise
    if (outD < 0) outD = 0;

    species.forEach(function (s) {
      lst = lists[s.name]; if (!lst.length) return;
      near = []; far = [];
      for (i = 0; i < lst.length; i++) (lst[i].d < outD ? near : far).push(lst[i]);
      shuffle(near); shuffle(far);
      var all = near.concat(far);
      ms = D.instanced(s.geo, all, 0.35, outD <= 0, { tree: true, seasonal: SEASONAL[s.name], sepOutline: true });
      s.fill = ms[0]; s.out = ms[1] || null; s.near = near; s.far = far; s.all = all;
      F.meshes.push.apply(F.meshes, ms);
      s.fill.name = 'far_' + s.name; if (s.out) s.out.name = 'outline';
      if (s.out) s.out.count = near.length;
      tris += s.geo.attributes.position.count / 3 * (all.length + near.length);
      nOutlined += near.length;
    });
    F.count = total; F.tris = Math.round(tris); F.outlined = nOutlined; F.oldTris = oldTris; F.outlineBand = outD;
    if (pendingDensity < 1) F.setDensity(pendingDensity);
    return { count: total, tris: F.tris };
  }

  var M4 = null, Q = null, E = null, V = null, S3 = null;
  /* Thin the treeline for low tiers: rewrites the instance buffers (matrices + tint) with a uniform prefix of each band. */
  F.setDensity = function (d) {
    pendingDensity = d = Math.max(0, Math.min(1, d)); F.density = d;
    if (!species.length) return;
    if (!M4) { M4 = new THREE.Matrix4(); Q = new THREE.Quaternion(); E = new THREE.Euler(0, 0, 0, 'YXZ'); V = new THREE.Vector3(); S3 = new THREE.Vector3(); }
    var tris = 0, shown = 0;
    species.forEach(function (s) {
      if (!s.fill) return;
      var nn = Math.ceil(s.near.length * d), nf = Math.ceil(s.far.length * d), n = 0, i, o, list = [], ta = s.geo.attributes.iTint;
      for (i = 0; i < nn; i++) list.push(s.near[i]);
      for (i = 0; i < nf; i++) list.push(s.far[i]);
      for (i = 0; i < list.length; i++) {
        o = list[i];
        M4.compose(V.set(o.x, o.y, o.z), Q.setFromEuler(E.set(o.lx || 0, o.ry || 0, o.lz || 0)), S3.setScalar(o.s || 1));
        s.fill.setMatrixAt(i, M4);
        ta.setXYZW(i, o.tint[0], o.tint[1], o.tint[2], o.tint[3]);
        n++;
      }
      s.fill.count = n; s.fill.instanceMatrix.needsUpdate = true; ta.needsUpdate = true;
      if (s.out) { s.out.count = nn; s.out.visible = F.outlinesOn && d >= 0.5 && nn > 0; }
      tris += s.geo.attributes.position.count / 3 * (n + (s.out && s.out.visible ? nn : 0)); shown += n;
    });
    F.tris = Math.round(tris); F.shown = shown;
  };
  F.outlinesOn = true;
  F.setOutlines = function (on) {   // draw-call trim from perf.js
    F.outlinesOn = !!on;
    species.forEach(function (s) { if (s.out) s.out.visible = F.outlinesOn && F.density >= 0.5 && s.out.count > 0; });
  };
  F.build = build;
  F.stats = function () { return { trees: F.count, shown: F.shown === undefined ? F.count : F.shown, tris: F.tris, oldTris: F.oldTris, outlined: F.outlined, outlineBand: F.outlineBand, density: F.density }; };
  G.SceneryFar = F;
})();
