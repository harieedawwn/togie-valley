/* Togie Valley - scenery_layout.js (Stage 10.5 Part 3): pure decor layout for the 90x60 map, no THREE.
 * Browser: Game.SceneryLayout; node: module.exports (tools/check.js uses it for the reachability + emptiness checks).
 * build(o): o = {rows, features, blocked(tx,tz)->bool (solids already placed by Layout.scatter), seed, avoid:[{x,z,s,r?}] (existing trees for spacing)}
 *   -> {trees:[{x,z,ry,s,k:'oak'|'birch'|'fruit'|'willow'|'banana'|'palm'|'bamboo', sz:'sap'|'med'|'large'|'giant', lx,lz (lean), tint:[r,g,b,trunkShift], fruit:[r,g,b], r (canopy radius, tiles)}], bushes, flowers, rocks:[{x,z,ry,s}], reeds, lilies:[{x,z,ry,s}],
 *       props:[{name,x,z,ry,s?}], solids:[[tx,tz]]}
 * Solid things (trees, rocks, solid props) are in `solids`, bushes (passable) in `bushTiles`; flowers/reeds/lilies never block.
 */
(function (root) {
  'use strict';
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function inEllipse(e, x, z, grow) {   // soft-edged ellipse: returns 0..1 (1 = core)
    var dx = (x + 0.5 - e[0]) / e[2], dz = (z + 0.5 - e[1]) / e[3], d = Math.sqrt(dx * dx + dz * dz);
    d *= 1 + (vnoise(x * 0.4 + e[0], z * 0.4 + e[1]) - 0.5) * (grow || 0.35);
    return d >= 1 ? 0 : Math.min(1, (1 - d) * 2.2);
  }

  /* Stage 10.7 trees. HERO = hero height in world units (about 1.0, 1.17 with hat). Each species has a nominal model height h and canopy
   * radius cr (model units); an instance gets scale s = height / h, where height = HERO x a size-class factor:
   * (Round 5: sapling class no longer used) medium 2.2-2.8, large 2.8-3.5, giant 3.8-4.4 (mature trees = medium/large/giant = 2.2-4.4x the hero). */
  var HERO = 1.0;
  var SPECIES = {   // h = nominal model height, cr = canopy radius (model units), lean = max lean range (rad)
    oak:     { h: 3.4, cr: 1.8, lean: 0.12, tints: [[1, 1, 1], [0.92, 1.06, 0.82], [1.12, 1, 0.78], [0.82, 0.98, 0.92], [1.05, 1.04, 0.9], [0.9, 1, 1.02]], shift: [-0.12, 0.3] },
    birch:   { h: 3.7, cr: 0.95, lean: 0.14, tints: [[1, 1, 1], [1.1, 1.04, 0.8], [0.9, 1.05, 0.9], [1.15, 0.98, 0.7], [0.95, 1, 0.95]], shift: [-0.25, 0.4] },
    fruit:   { h: 2.9, cr: 1.45, lean: 0.1, tints: [[1, 1, 1], [0.9, 1.04, 0.9], [1.08, 1, 0.85], [0.85, 1, 1]], shift: [-0.1, 0.2] },
    willow:  { h: 3.4, cr: 1.6, lean: 0.14, tints: [[1, 1, 1], [0.95, 1.05, 0.8], [0.85, 1, 0.9], [1.05, 1, 0.7], [0.92, 1.02, 0.95]], shift: [-0.1, 0.25] },
    banana:  { h: 2.4, cr: 1.1, lean: 0.12, tints: [[1, 1, 1], [0.92, 1.05, 0.85], [1.08, 1.02, 0.8], [0.88, 1, 0.95]], shift: [-0.1, 0.2] },
    palm:    { h: 4.4, cr: 1.5, lean: 0.2, tints: [[1, 1, 1], [0.9, 1.04, 0.88], [1.08, 1, 0.82], [0.85, 1, 0.95]], shift: [-0.15, 0.3] },
    bamboo:  { h: 4.0, cr: 0.9, lean: 0.1, tints: [[1, 1, 1], [1.08, 1.03, 0.82], [0.9, 1.04, 0.92], [1.1, 1, 0.75]], shift: [-0.2, 0.3] }
  };
  var FRUITS = [[1, 1, 1], [1.1, 2.4, 0.9], [0.55, 0.9, 2.2], [1.1, 3.0, 0.5]];   // apple red, orange, plum, pear yellow (multiplies the baked red fruit)
  var CLASSES = { sap: [1.2, 1.7], med: [2.5, 3.1], large: [3.2, 3.9], giant: [4.2, 4.9] };
  /** Sets size class, scale, lean, trunk shift, canopy tint (and fruit hue) on tree t of species kind. cls optional; r = rng. */
  function style(t, kind, r, cls) {
    var sp = SPECIES[kind] || SPECIES.oak, q = r(), c = cls || (q < 0.47 ? 'med' : q < 0.93 ? 'large' : 'giant'), hr = CLASSES[c];
    t.k = kind; t.sz = c;
    t.s = HERO * (hr[0] + r() * (hr[1] - hr[0])) / sp.h;
    t.ry = r() * 6.2832;
    t.lx = (r() - 0.5) * sp.lean; t.lz = (r() - 0.5) * sp.lean;                 // tilt, never two alike
    var tn = sp.tints[Math.floor(r() * sp.tints.length)], sh = sp.shift, j = (r() - 0.5) * 0.06;
    t.tint = [tn[0] + j, tn[1] - j * 0.5, tn[2] + j * 0.3, sh[0] + r() * (sh[1] - sh[0])];   // canopy tint (+ small jitter) + trunk height shift (model units)
    if (kind === 'fruit') t.fruit = FRUITS[Math.floor(r() * FRUITS.length)];
    t.r = sp.cr * t.s;                                                          // canopy radius in tiles (for spacing only; never blocks)
    return t;
  }

  /** Styles the trees of Layout.scatter (Decor) once rows are known: green species only (no fruit), tropical ones near water. Deterministic. */
  function styleScatter(trees, rows) {
    var r = rng(9091), i, t, q, kind;
    function wet(x, z) { for (var dz = -3; dz <= 3; dz++) for (var dx = -3; dx <= 3; dx++) { var rw = rows[z + dz]; if (rw && rw.charAt(x + dx) === '~') return true; } return false; }
    for (i = 0; i < trees.length; i++) {
      t = trees[i]; q = r();
      if (wet(Math.floor(t.x), Math.floor(t.z))) kind = q < 0.4 ? 'willow' : q < 0.7 ? 'palm' : q < 0.88 ? 'banana' : 'oak';
      else kind = q < 0.5 ? 'oak' : q < 0.8 ? 'palm' : 'birch';
      style(t, kind, r, kind === 'banana' ? 'med' : undefined);
    }
    return trees;
  }

  function build(o) {
    var rows = o.rows, F = o.features, W = rows[0].length, H = rows.length, rnd = rng(o.seed || 777), x, z, i, j, k;
    var out = { trees: [], bushes: [], flowers: [], rocks: [], reeds: [], lilies: [], props: [], solids: [], bushTiles: [] }, trng = rng((o.seed || 777) + 4142), avoid = o.avoid || [];
    var occ = new Uint8Array(W * H), keep = new Uint8Array(W * H);
    var RES = o.reserve || [[36, 9, 39, 12], [19, 6, 21, 8], [5, 17, 8, 20], [10, 15, 11, 16], [10, 17, 12, 18], [37, 20, 39, 21], [40, 21, 42, 23], [35, 21, 37, 23]];   // landmark footprints (Landmarks.LAYOUT.ext): 2-tile tree clearance
    function inRes(a, b, m) { for (var q = 0; q < RES.length; q++) if (a >= RES[q][0] - m && a < RES[q][2] + m && b >= RES[q][1] - m && b < RES[q][3] + m) return true; return false; }
    function ch(a, b) { return a < 0 || b < 0 || a >= W || b >= H ? '' : rows[b].charAt(a); }
    function isFarm(a, b) { return a > 10 && a < 29 && b > 5 && b < 20; }
    // keep-out margins so decor never narrows walking corridors or crowds buildings
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      var c = ch(x, z), r = 0;
      if ('=op'.indexOf(c) >= 0) r = 1; else if ('tl'.indexOf(c) >= 0) r = 1; else if ('HSWFDBCKMnms'.indexOf(c) >= 0) r = 2;
      if (!r) continue;
      for (j = -r; j <= r; j++) for (i = -r; i <= r; i++) if (x + i >= 0 && z + j >= 0 && x + i < W && z + j < H) keep[(z + j) * W + x + i] = 1;
    }
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) if (isFarm(x, z)) keep[z * W + x] = 1;
    function free(a, b) { return ch(a, b) === '.' && !occ[b * W + a] && !keep[b * W + a] && !inRes(a, b, 1) && !o.blocked(a, b); }
    function take(a, b) { occ[b * W + a] = 1; out.solids.push([a, b]); }
    function jit(a, b, s0, s1) { return { x: a + 0.5 + (rnd() - 0.5) * 0.5, z: b + 0.5 + (rnd() - 0.5) * 0.5, ry: rnd() * 6.28, s: s0 + rnd() * (s1 - s0) }; }
    // natural spacing: reject a tree whose canopy would crowd another (distance < 0.62 x sum of canopy radii, min 1.9 tiles)
    function spaced(x, z, rr) {
      var i2, tt, d2, lim;
      for (i2 = 0; i2 < out.trees.length; i2++) { tt = out.trees[i2]; lim = Math.max(1.9, 0.62 * (tt.r + rr)); d2 = (tt.x - x) * (tt.x - x) + (tt.z - z) * (tt.z - z); if (d2 < lim * lim) return false; }
      for (i2 = 0; i2 < avoid.length; i2++) { tt = avoid[i2]; lim = Math.max(1.9, 0.62 * ((tt.r || 1.5) + rr)); d2 = (tt.x - x) * (tt.x - x) + (tt.z - z) * (tt.z - z); if (d2 < lim * lim) return false; }
      return true;
    }
    function tree(a, b, kind, cls) {
      var t = { x: a + 0.5 + (rnd() - 0.5) * 0.5, z: b + 0.5 + (rnd() - 0.5) * 0.5 };
      style(t, kind, trng, cls);
      if (!spaced(t.x, t.z, t.r)) return false;
      out.trees.push(t); take(a, b); return true;
    }
    function bush(a, b) { out.bushes.push(jit(a, b, 0.8, 1.2)); occ[b * W + a] = 1; out.bushTiles.push([a, b]); }   // Stage 14A: passable, occupies the tile for spacing only
    function rock(a, b) { out.rocks.push(jit(a, b, 0.7, 1.3)); take(a, b); }
    function flower(a, b, n) { for (var q = 0; q < n; q++) { var f = jit(a, b, 0.8, 1.2); f.x = a + rnd(); f.z = b + rnd(); out.flowers.push(f); } }
    function prop(name, a, b, ry, solid, s) { out.props.push({ name: name, x: a + 0.5, z: b + 0.5, ry: ry || 0, s: s || 1 }); if (solid !== false) { if (!occ[b * W + a]) take(a, b); } }
    function nearWater(a, b, rad) { for (var jj = -rad; jj <= rad; jj++) for (var ii = -rad; ii <= rad; ii++) if (ch(a + ii, b + jj) === '~') return true; return false; }

    // 1. points of interest (placed first so random decor avoids them)
    var bx = F.bridge;
    [[bx[0] - 1, 17], [bx[1] + 1, 20]].forEach(function (t) { prop('lamp', t[0], t[1], 0); });
    [[50, 16], [54, 16], [50, 21], [54, 21], [68, 16], [72, 16], [68, 21], [72, 21]].forEach(function (t) { if (ch(t[0], t[1]) === 'p') prop('lamp', t[0], t[1], 0); });
    if (ch(70, 17) === 'p') prop('bench', 70, 17, Math.PI);
    if (ch(70, 20) === 'p') prop('crate', 70, 20, 0.2);
    if (ch(72, 19) === 'p') prop('barrel', 72, 19, 0);
    if (ch(56, 17) === '~') { /* walkway is 2 wide; no props on it */ }
    var pk = F.picnic;
    prop('table', pk[0], pk[1], 0); prop('bench', pk[0], pk[1] - 1, 0); prop('bench', pk[0], pk[1] + 1, Math.PI); prop('crate', pk[0] - 1, pk[1] + 1, 0.4, false);
    var cf = F.campfire;
    prop('firepit', cf[0], cf[1], 0); prop('log', cf[0] - 2, cf[1] - 1, 0.5); prop('log', cf[0] + 2, cf[1] - 1, -0.5); prop('log', cf[0], cf[1] + 3, 1.57);
    prop('lamp', cf[0] + 3, cf[1] + 2, 0); prop('lamp', cf[0] - 3, cf[1] + 2, 0);
    var lk = F.lookout; prop('bench', lk[0], lk[1] - 1, 0); prop('lamp', lk[0] + 1, lk[1] + 1, 0);
    var pw = F.plazaW; prop('sign', pw[0] + 1, pw[1] - 2, 0.3); prop('barrel', pw[0] - 1, pw[1] + 2, 0);
    [[17, 21, 0.2], [45, 21, -0.2], [8, 16, 0.4]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('sign', t[0], t[1], t[2]); });
    [[6, 10], [6, 11]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('woodpile', t[0], t[1], 0); });
    [[8, 25], [9, 25], [8, 26]].forEach(function (t, n) { if (ch(t[0], t[1]) === '.') prop('hay', t[0], t[1], n * 0.9); });
    [[7, 2], [9, 2], [10, 3]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('hive', t[0], t[1], 0.3); });
    [[6, 2], [11, 2]].forEach(function (t) { if (ch(t[0], t[1]) === '.') prop('stump', t[0], t[1], 0); });
    // viewpoints at the ends of the lake trails
    [[6, -1], [28, 0]].forEach(function (t, n) {
      var bestx = -1; for (x = 0; x < W; x++) if (ch(x, t[0]) === 'o' && x > 40) bestx = x;
      if (bestx > 0) { prop('bench', bestx, t[0], Math.PI / 2); if (ch(bestx - 1, t[0] - 1) === '.' || ch(bestx - 1, t[0] - 1) === ',') prop('lamp', bestx - 1, t[0] - 1, 0); }
    });
    // flower beds around the plaza and the lookout
    [[F.plazaW[0], F.plazaW[1], 4], [F.lookout[0], F.lookout[1], 3], [F.picnic[0], F.picnic[1], 3], [F.campfire[0], F.campfire[1], 5]].forEach(function (p) {
      for (z = p[1] - p[2]; z <= p[1] + p[2]; z++) for (x = p[0] - p[2]; x <= p[0] + p[2]; x++)
        if (ch(x, z) === '.' && Math.hypot(x - p[0], z - p[1]) > 2.4 && rnd() < 0.45) flower(x, z, 1 + (rnd() < 0.5 ? 1 : 0));
    });

    // Stage 16 E: tree clearance maps (Chebyshev distance, capped at LIM) to path/soil/farm/pier tiles (dP) and to buildings/markers (dB)
    var LIM = 4, dP = new Uint8Array(W * H), dB = new Uint8Array(W * H);
    (function () {
      var a, b, i2, j2, c2, bp, bb, dd;
      for (b = 0; b < H; b++) for (a = 0; a < W; a++) {
        bp = bb = LIM;
        for (j2 = -(LIM - 1); j2 <= LIM - 1; j2++) for (i2 = -(LIM - 1); i2 <= LIM - 1; i2++) {
          c2 = ch(a + i2, b + j2); if (!c2) continue;
          dd = Math.max(Math.abs(i2), Math.abs(j2));
          if ('=optl'.indexOf(c2) >= 0 || isFarm(a + i2, b + j2)) { if (dd < bp) bp = dd; }
          else if ('HSWFDBCKMnms'.indexOf(c2) >= 0) { if (dd < bb) bb = dd; }
        }
        dP[b * W + a] = bp; dB[b * W + a] = bb;
      }
    })();
    function resOK(a, b) { return !inRes(a, b, 2); }
    function roomOK(a, b, r) { var big = r > 1.5; return resOK(a, b) && dP[b * W + a] >= (big ? 3 : 2) && dB[b * W + a] >= (big ? 4 : 3); }
    function tree2(a, b, kind, cls, o) {   // Poisson-style: styled first, rejected when it crowds a path/building (unless relax) or another canopy (gap overrides the min distance)
      o = o || {};
      var t = { x: a + 0.5 + (rnd() - 0.5) * 0.5, z: b + 0.5 + (rnd() - 0.5) * 0.5 }, i2, tt, lim, d2;
      style(t, kind, trng, cls);
      if (!resOK(a, b) || (!o.relax && !roomOK(a, b, t.r))) return false;
      for (i2 = 0; i2 < out.trees.length + avoid.length; i2++) {
        tt = i2 < out.trees.length ? out.trees[i2] : avoid[i2 - out.trees.length];
        lim = o.gap || Math.max(1.9, 0.62 * ((tt.r || 1.5) + t.r)); d2 = (tt.x - t.x) * (tt.x - t.x) + (tt.z - t.z) * (tt.z - t.z);
        if (d2 < lim * lim) return false;
      }
      out.trees.push(t); take(a, b); return true;
    }
    function gradeCls(m) { var q = trng(); return m > 0.8 ? (q < 0.35 ? 'giant' : 'large') : m > 0.5 ? (q < 0.6 ? 'large' : 'med') : 'med'; }   // bigger inside, smaller at edges (Round 5: no saplings, smallest = med)
    function mix(dom, acc, m) { var q = trng(), k = q < 0.55 + 0.35 * m ? dom : acc[Math.floor(trng() * acc.length)]; return [k, gradeCls(m)]; }   // one dominant species + a few accents
    function ell(e, x, z) { return inEllipse(e, x, z, 0.45); }

    // 2. orchard: staggered rows, all fruit trees
    var od = F.orchard;
    for (z = od[1]; z <= od[3]; z++) for (x = od[0]; x <= od[2]; x++) if ((x + (Math.floor(z / 3) & 1)) % 3 === 1 && z % 3 === 0 && free(x, z)) {
      var rowIdx = Math.floor((z - od[1]) / 3);
      tree2(x, z, 'fruit', trng() < 0.8 ? 'med' : 'large', { relax: true, gap: 1.9 });
    }
    for (z = od[1]; z <= od[3]; z++) for (x = od[0]; x <= od[2]; x++) if (ch(x, z) === '.' && !occ[z * W + x] && rnd() < 0.18) flower(x, z, 1);

    // 3. groves (one dominant species, a few accents; dart-throwing Poisson spacing; size grows toward the core) + understory
    var zones = [{ e: F.grove, dom: 'oak', acc: ['birch', 'palm'], clr: F.clearing }], DOMS = [['palm', ['birch', 'oak']], ['oak', ['birch', 'fruit']], ['birch', ['oak', 'palm']]];
    F.forests.forEach(function (e, n) { zones.push({ e: e, dom: DOMS[n % 3][0], acc: DOMS[n % 3][1], clr: null }); });
    zones.forEach(function (zn) {
      var e = zn.e, tries = Math.round(e[2] * e[3] * 12), q, a, b, m, p;
      for (q = 0; q < tries; q++) {
        a = Math.floor(e[0] - e[2] + rnd() * e[2] * 2); b = Math.floor(e[1] - e[3] + rnd() * e[3] * 2);
        if (!free(a, b)) continue;
        m = ell(e, a, b); if (!m) continue;
        if (zn.clr && Math.hypot(a + 0.5 - zn.clr[0], b + 0.5 - zn.clr[1]) < zn.clr[2] + 1.2) continue;
        p = mix(zn.dom, zn.acc, m); if (p[0] === 'fruit') p[0] = 'oak';   // no fruit trees outside the orchard
        tree2(a, b, p[0], p[1]);
      }
      for (z = Math.floor(e[1] - e[3]) - 1; z <= Math.ceil(e[1] + e[3]) + 1; z++) for (x = Math.floor(e[0] - e[2]) - 1; x <= Math.ceil(e[0] + e[2]) + 1; x++) {
        m = ell(e, x, z); if (!m || ch(x, z) !== '.' || occ[z * W + x]) continue;
        if (zn.clr && Math.hypot(x + 0.5 - zn.clr[0], z + 0.5 - zn.clr[1]) < zn.clr[2] + 1.2) continue;
        q = rnd();
        if (q < 0.16 * (0.5 + m) && free(x, z)) bush(x, z); else if (q < 0.34) flower(x, z, 1); else if (q > 0.985 && free(x, z)) rock(x, z);
      }
    });

    // 3b. spring corners: two deliberate fruit-tree clusters (>= 3 fruit trees + one green accent), away from every grove
    function inAnyZone(a, b) { for (var q = 0; q < zones.length; q++) if (inEllipse([zones[q].e[0], zones[q].e[1], zones[q].e[2] + 3, zones[q].e[3] + 3], a, b, 0)) return true; return false; }
    function openDisc(a, b, rad) { for (var jj = -rad; jj <= rad; jj++) for (var ii = -rad; ii <= rad; ii++) if (!free(a + ii, b + jj) || !roomOK(a + ii, b + jj, 1) || inAnyZone(a + ii, b + jj)) return false; return true; }
    var corners = 0, guesses = [[6, 6], [6, 53], [84, 54], [40, 55], [34, 4], [84, 5]], gi, rr0, ax, az, cl, added, tr0, ok;
    for (gi = 0; gi < guesses.length && corners < 2; gi++) {
      ok = false;
      for (rr0 = 0; rr0 <= 9 && !ok; rr0++) for (az = guesses[gi][1] - rr0; az <= guesses[gi][1] + rr0 && !ok; az++) for (ax = guesses[gi][0] - rr0; ax <= guesses[gi][0] + rr0 && !ok; ax++)
        if (Math.max(Math.abs(ax - guesses[gi][0]), Math.abs(az - guesses[gi][1])) === rr0 && ax > 2 && az > 2 && ax < W - 3 && az < H - 3 && openDisc(ax, az, 2)) ok = true;
      if (!ok) continue;
      ax--; az--;   // loops post-increment after the hit
      added = []; cl = 0;
      for (tr0 = 0; tr0 < 40 && cl < 5; tr0++) {
        var qa = ax + Math.floor((rnd() - 0.5) * 7), qb = az + Math.floor((rnd() - 0.5) * 7), n0 = out.trees.length;
        if (Math.hypot(qa - ax, qb - az) > 3.4 || !free(qa, qb) || inAnyZone(qa, qb)) continue;
        if (tree2(qa, qb, cl === 4 ? 'birch' : 'fruit', cl < 2 ? 'large' : 'med', { gap: 2.1 })) { added.push([qa, qb, cl === 4 ? 0 : 1]); cl++; }
      }
      if (added.filter(function (t3) { return t3[2]; }).length < 3) { added.forEach(function (t3) { out.trees.pop(); out.solids.pop(); occ[t3[1] * W + t3[0]] = 0; }); }
      else corners++;
    }

    // 4. flower meadows
    F.meadows.forEach(function (e) {
      for (z = Math.floor(e[1] - e[3]) - 1; z <= Math.ceil(e[1] + e[3]) + 1; z++) for (x = Math.floor(e[0] - e[2]) - 1; x <= Math.ceil(e[0] + e[2]) + 1; x++) {
        var m = inEllipse(e, x, z, 0.5); if (!m || ch(x, z) !== '.' || occ[z * W + x]) continue;
        var q = rnd();
        if (q < 0.04 && free(x, z)) bush(x, z);
        else if (q < 0.2 + 0.7 * m) flower(x, z, 1 + (rnd() < 0.55 * m ? 1 : 0) + (rnd() < 0.25 * m ? 1 : 0));
      }
    });

    // 5. Vietnam-flavoured shore clumps (Poisson-spaced seeds >= 5.5 tiles apart): willow + palms, palm + banana, bamboo, banana patch
    var THEMES = {
      willow: [['willow', 'large'], ['palm', 'med'], ['banana', 'med'], ['banana', 'med']],
      palm: [['palm', 'large'], ['palm', 'med'], ['palm', 'med'], ['banana', 'med'], ['banana', 'med']],
      bamboo: [['bamboo', 'med'], ['bamboo', 'med'], ['bamboo', 'med'], ['bamboo', 'med'], ['bamboo', 'med']],
      banana: [['banana', 'med'], ['banana', 'med'], ['banana', 'med'], ['palm', 'med']]
    };
    function clump(sx, sz, theme) {
      var mem = THEMES[theme], n = 0, k2, tr, a, b, gap;
      for (k2 = 0; k2 < mem.length; k2++) {
        gap = mem[k2][0] === 'bamboo' || mem[k2][0] === 'banana' ? 1.15 : 0;
        for (tr = 0; tr < 12; tr++) {
          a = Math.floor(sx + (rnd() - 0.5) * 5); b = Math.floor(sz + (rnd() - 0.5) * 5);
          if (free(a, b) && nearWater(a, b, 3) && tree2(a, b, mem[k2][0], mem[k2][1], { gap: gap })) { n++; break; }
        }
      }
      return n;
    }
    var seeds = [], sx, sz, rr2, theme, qi;
    for (qi = 0; qi < 6000 && seeds.length < 12; qi++) {
      sx = Math.floor(rnd() * W); sz = Math.floor(rnd() * H);
      if (ch(sx, sz) !== '.' || !nearWater(sx, sz, 3) || !free(sx, sz) || !roomOK(sx, sz, 1.2)) continue;
      if (seeds.some(function (s2) { return Math.hypot(s2[0] - sx, s2[1] - sz) < 5.5; })) continue;
      rr2 = rnd(); theme = rr2 < 0.45 ? 'willow' : rr2 < 0.7 ? 'palm' : rr2 < 0.88 ? 'bamboo' : 'banana';
      seeds.push([sx, sz]); clump(sx, sz, theme);
    }

    // 6. map-edge belt: a thin Poisson belt of green trees, one dominant species per 15x15 block, smaller on the inner side
    var belt = 0, ALL3 = ['oak', 'palm', 'birch'];
    for (qi = 0; qi < 6000 && belt < 34; qi++) {
      x = Math.floor(rnd() * W); z = Math.floor(rnd() * H);
      var edge0 = Math.min(x, z, W - 1 - x, H - 1 - z);
      if (edge0 > 7 || !free(x, z)) continue;
      var mB = 1 - edge0 / 8, domB = ALL3[Math.floor(hash(Math.floor(x / 15), Math.floor(z / 15)) * 3)], pB = mix(domB, ALL3.filter(function (s3) { return s3 !== domB; }), mB);
      if (tree2(x, z, pB[0], pB[1])) belt++;
    }

    // 7. general fill without trees: bushes, rocks, flowers so no big flat area stays empty
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      if (ch(x, z) !== '.' || occ[z * W + x] || isFarm(x, z)) continue;
      var q2 = rnd(), a2 = rnd(), freeNow = free(x, z), wet = nearWater(x, z, 4);
      if (freeNow && q2 < 0.09 && a2 < 0.6) bush(x, z);
      else if (freeNow && q2 < 0.085 && a2 > 0.93) rock(x, z);
      else if (q2 < (wet ? 0.3 : 0.22)) flower(x, z, 1 + (a2 < 0.3 ? 1 : 0));
    }
    out.zones = { corners: corners, shore: seeds.length, belt: belt };
    // rocks along the stream banks
    for (z = 0; z < 36; z++) for (x = 20; x < 56; x++) if (free(x, z) && nearWater(x, z, 1) && x < 47 && rnd() < 0.07) rock(x, z);

    // 6. reeds on shore water tiles, lily pads in the shallows (never next to planks)
    var near = function (a, b, set, rad) { for (var jj = -rad; jj <= rad; jj++) for (var ii = -rad; ii <= rad; ii++) if (set.indexOf(ch(a + ii, b + jj)) >= 0) return true; return false; };
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      if (ch(x, z) !== '~' || near(x, z, 'pH', 2)) continue;
      var landDir = null, dd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (k = 0; k < 4; k++) { var cc = ch(x + dd[k][0], z + dd[k][1]); if (cc === ',' || cc === '.' || cc === 'o') { landDir = dd[k]; break; } }
      if (landDir && rnd() < 0.34) { out.reeds.push({ x: x + 0.5 + landDir[0] * 0.3 + (rnd() - 0.5) * 0.3, z: z + 0.5 + landDir[1] * 0.3 + (rnd() - 0.5) * 0.3, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.6 }); }
      else if (!landDir && near(x, z, ',.', 3) && rnd() < 0.1 && x < 86) out.lilies.push({ x: x + 0.5 + (rnd() - 0.5) * 0.5, z: z + 0.5 + (rnd() - 0.5) * 0.5, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
    }
    // island: a lone tree and reeds
    var isl = []; for (z = 8; z < 20; z++) for (x = 72; x < 84; x++) if (ch(x, z) === ',') isl.push([x, z]);
    if (isl.length > 4) { var mid = isl[Math.floor(isl.length / 2)]; var t0 = { x: mid[0] + 0.5, z: mid[1] + 0.5 }; style(t0, 'willow', trng, 'large'); out.trees.push(t0); }
    // ChillSpots + LandOffice footprints: nothing placed inside (filtered after the fact so the RNG stream and other layouts stay identical)
    var RZ = [[6, 20, 12, 25], [24, 24, 29, 28], [7, 27, 12, 30], [20, 32, 23, 35], [29, 32, 33, 36], [10, 34, 14, 37], [35, 50, 38, 53], [36, 44, 43, 49]];
    function inRz(px, pz, pad) { for (var q = 0; q < RZ.length; q++) if (px > RZ[q][0] - pad && px < RZ[q][2] + pad && pz > RZ[q][1] - pad && pz < RZ[q][3] + pad) return true; return false; }
    ['trees', 'bushes', 'rocks', 'props'].forEach(function (k) { out[k] = out[k].filter(function (p) { return !inRz(p.x !== undefined ? p.x : p.tx + 0.5, p.z !== undefined ? p.z : p.tz + 0.5, 0.4); }); });
    out.solids = out.solids.filter(function (c) { return !inRz(c[0] + 0.5, c[1] + 0.5, 0.45); });
    out.bushTiles = out.bushTiles.filter(function (c) { return !inRz(c[0] + 0.5, c[1] + 0.5, 0.45); });
    return out;
  }

  var L = { build: build, vnoise: vnoise, rng: rng, style: style, styleScatter: styleScatter, SPECIES: SPECIES, CLASSES: CLASSES, HERO: HERO };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (root.Game) root.Game.SceneryLayout = L;
})(typeof window !== 'undefined' ? window : this);
