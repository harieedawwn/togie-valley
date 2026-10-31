/* Togie Valley - vn_life.js (Round 3 stage 14): more Vietnamese flora and street life. Game.VNLife.build() (after VillageVN).
 * Flora: dua (coconut palm, swaying) + one broadleaf geometry shared by xoai / mit / bang / phuong (species = canopy tint + fruit hue, red phuong, no pink),
 * rice paddy patches (lua), rau muong mats on water, dam but (hibiscus) hedges along paths, muop / bau trellises. Street: utility poles with sagging wires,
 * parked motorbikes, rusty corrugated-iron lean-tos (see street block). Placement is a pure LAYOUT block (node-testable): blocked tiles keep 8 free neighbours,
 * nothing lands on paths, farm plots, piers, fishing columns or footprints; counts x max(0.3, Quality.flower) at build.
 * Draw calls added: 5 here (coconut fill+outline, broadleaf fill+outline, one static merged mesh without outline that also holds the wires) + 1 far buildings (scenery_far.js) = 6. */
(function () {
  'use strict';
  var G = window.Game;
  /*LAYOUT-BEGIN*/
  function layoutLife(c) {
    var rows = c.rows, Wd = rows[0].length, Hd = rows.length, rnd = c.rng, dn = c.dens, mine = {}, picks = [], MARK = 'HSWFDBCKMsnmltp';
    var out = { coco: [], tree: [], hib: [], trel: [], paddy: [], kang: [], blocked: [] };
    (c.taken || []).forEach(function (t) { mine[t.x + ',' + t.z] = 1; picks.push([t.x, t.z]); });
    function cell(x, z) { return x < 0 || z < 0 || x >= Wd || z >= Hd ? ' ' : rows[z].charAt(x); }
    function isPath(ch) { return ch === '=' || ch === 'o'; }
    function water(x, z) { return x < 0 || z < 0 || x >= Wd || z >= Hd ? true : rows[z].charAt(x) === '~'; }
    function inBox(x, z) {
      var i, b; for (i = 0; i < c.boxes.length; i++) { b = c.boxes[i]; if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]) return true; }
      for (i = 0; i < c.ext.length; i++) { b = c.ext[i]; if (x >= b[0] - 1 && x < b[2] + 1 && z >= b[1] - 1 && z < b[3] + 1) return true; }
      return false;
    }
    function markNear(x, z, r) { var dx, dz; for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) if (MARK.indexOf(cell(x + dx, z + dz)) >= 0) return true; return false; }
    function ringFree(x, z) { var dx, dz; for (dz = -1; dz <= 1; dz++) for (dx = -1; dx <= 1; dx++) if (!c.walk(x + dx, z + dz) || mine[(x + dx) + ',' + (z + dz)]) return false; return true; }
    function treeClear(x, z, m) {
      var i, t, dx, dz, cx = x + 0.5, cz = z + 0.5;
      for (i = 0; i < c.trees.length; i++) { t = c.trees[i]; dx = t.x - cx; dz = t.z - cz; if (dx * dx + dz * dz < m * m) return false; }
      for (i = 0; i < c.props.length; i++) { t = c.props[i]; dx = t.x - cx; dz = t.z - cz; if (dx * dx + dz * dz < m * m * 0.64) return false; }
      return true;
    }
    function baseClear(x, z, m) { return cell(x, z) === '.' && !inBox(x, z) && !markNear(x, z, 2) && treeClear(x, z, m) && ringFree(x, z); }
    function pathDir(x, z) { var D = [[1, 0], [-1, 0], [0, 1], [0, -1]], i; for (i = 0; i < 4; i++) if (isPath(cell(x + D[i][0], z + D[i][1]))) return D[i]; return null; }
    function pathNear(x, z) { var dx, dz; for (dz = -1; dz <= 1; dz++) for (dx = -1; dx <= 1; dx++) if (isPath(cell(x + dx, z + dz))) return true; return false; }
    function far(x, z, m) { var i, p; for (i = 0; i < picks.length; i++) { p = picks[i]; if ((p[0] - x) * (p[0] - x) + (p[1] - z) * (p[1] - z) < m * m) return false; } return true; }
    function take(x, z, block) { picks.push([x, z]); if (block) { mine[x + ',' + z] = 1; out.blocked.push([x, z]); } }
    function shuffle(a) { var i, j, t; for (i = a.length - 1; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function cnt(n, min) { return Math.max(min || 0, Math.ceil(n * dn)); }
    function nearest(list, x, z) { var j, p, bd = 1e9, d, best = null; for (j = 0; j < list.length; j++) { p = list[j]; d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = p; } } return best; }
    function dWater(x, z) { var dx, dz; for (dz = -4; dz <= 4; dz++) for (dx = -4; dx <= 4; dx++) if (cell(x + dx, z + dz) === '~') return true; return false; }
    function dTown(x, z) { var dx, dz, ch; for (dz = -9; dz <= 9; dz++) for (dx = -9; dx <= 9; dx++) { ch = cell(x + dx, z + dz); if (ch === 'H' || ch === 'S' || ch === 'W') return true; } return false; }
    var x, z, i, j, k, e, last, s, pd, yd = [];
    for (z = 3; z < Hd - 3; z++) for (x = 3; x < Wd - 3; x++) if (!pathNear(x, z) && baseClear(x, z, 2.3)) yd.push({ x: x, z: z, nw: dWater(x, z) ? 1 : 0, nt: dTown(x, z) ? 1 : 0 });
    shuffle(yd);
    // ---- coconut palms (dua): near water first, never two of the same size side by side
    var qc = cnt(7, 2);
    for (i = 0; i < yd.length && qc > 0; i++) {
      e = yd[i]; if (!far(e.x, e.z, 4.2) || !ringFree(e.x, e.z) || (!e.nw && rnd() < 0.6)) continue;
      last = nearest(out.coco, e.x, e.z); s = 1.0 + rnd() * 0.4;   // Round 5: no small palms (was 0.85-1.35)
      if (last && Math.abs(last.s - s) < 0.14) s = last.s + (last.s > 1.2 ? -0.2 : 0.2);
      qc--; take(e.x, e.z, true);
      out.coco.push({ x: e.x, z: e.z, s: s, ry: rnd() * 6.28, lx: (rnd() - 0.5) * 0.1, lz: (rnd() - 0.5) * 0.1, tint: [0.9 + rnd() * 0.2, 0.94 + rnd() * 0.12, 0.88 + rnd() * 0.2, 0] });
    }
    // ---- broadleaf trees: xoai, mit, bang, phuong (never the same species as the nearest one, sizes differ)
    var SP = ['xoai', 'mit', 'bang', 'phuong'], q = [cnt(5, 1), cnt(4, 1), cnt(3, 1), cnt(3, 1)], left = q[0] + q[1] + q[2] + q[3], w, tot, pick, ok;
    var BASE = { xoai: 0.94, mit: 0.94, bang: 0.9, phuong: 0.98 };   // Round 5: +0.12, no small broadleaves
    for (i = 0; i < yd.length && left > 0; i++) {
      e = yd[i]; if (!far(e.x, e.z, 4.4) || !ringFree(e.x, e.z)) continue;
      last = nearest(out.tree, e.x, e.z); if (last && (last.x - e.x) * (last.x - e.x) + (last.z - e.z) * (last.z - e.z) > 64) last = null;
      w = []; tot = 0; ok = 0;
      for (j = 0; j < 4; j++) { w[j] = q[j] > 0 && !(last && last.k === SP[j]) ? 1 + (j === 3 ? 2 * e.nt : j === 2 ? 2 * e.nw : e.nt) : 0; tot += w[j]; }
      if (tot <= 0) continue;
      pick = rnd() * tot; for (k = 0; k < 4; k++) { pick -= w[k]; if (pick <= 0 && w[k] > 0) break; } if (k > 3) { for (k = 3; k > 0 && !w[k]; k--); }
      s = BASE[SP[k]] + rnd() * 0.2;
      if (last && Math.abs(last.s - s) < 0.1) s += 0.14;
      q[k]--; left--; take(e.x, e.z, true);
      out.tree.push({ k: SP[k], x: e.x, z: e.z, s: s, ry: rnd() * 6.28, lx: (rnd() - 0.5) * 0.08, lz: (rnd() - 0.5) * 0.08, r: rnd() });
    }
    // ---- path-side candidates (nearer the town first): hibiscus hedges, then street props
    var st = [];
    for (z = 2; z < Hd - 2; z++) for (x = 2; x < Wd - 2; x++) {
      pd = pathDir(x, z);
      if (pd && baseClear(x, z, 1.5)) st.push({ x: x, z: z, pd: pd, sc: rnd() + 0.9 * Math.min(1, Math.sqrt((x - 34) * (x - 34) + (z - 16) * (z - 16)) / 45) });
    }
    st.sort(function (a, b) { return a.sc - b.sc; });
    function nextStreet(n, arr, gap, mk) {
      var got = 0, jj, ee, lastE;
      for (jj = 0; jj < st.length && got < n; jj++) {
        ee = st[jj]; if (ee.used || !far(ee.x, ee.z, gap) || !ringFree(ee.x, ee.z)) continue;
        lastE = arr.length ? arr[arr.length - 1] : null;
        ee.used = true; got++; take(ee.x, ee.z, true);
        arr.push(mk(ee, lastE, got));
      }
    }
    nextStreet(cnt(4, 1), out.hib, 3.4, function (ee, lastE, n) { return { x: ee.x, z: ee.z, pd: ee.pd, v: lastE ? 1 - lastE.v : (rnd() * 2) | 0, r: rnd() }; });
    // ---- muop / bau trellises in yards near the houses
    var qt = cnt(3, 1);
    for (i = 0; i < yd.length && qt > 0; i++) {
      e = yd[i]; if (!e.nt || !far(e.x, e.z, 3.6) || !ringFree(e.x, e.z)) continue;
      last = out.trel.length ? out.trel[out.trel.length - 1] : null;
      qt--; take(e.x, e.z, true);
      out.trel.push({ x: e.x, z: e.z, v: last ? 1 - last.v : 0, ry: ((rnd() * 4) | 0) * Math.PI / 2 });
    }
    // ---- rice paddies: 2x2 grass patches, the 4x4 ring around stays walkable
    var qp = cnt(3, 1), cand = [], a, b, good, dd;
    for (z = 4; z < Hd - 5; z++) for (x = 4; x < Wd - 5; x++) {
      if (cell(x, z) !== '.') continue;
      good = true;
      for (b = 0; b < 2 && good; b++) for (a = 0; a < 2; a++) if (cell(x + a, z + b) !== '.' || inBox(x + a, z + b) || markNear(x + a, z + b, 2) || pathNear(x + a, z + b) || !treeClear(x + a, z + b, 1.8) || mine[(x + a) + ',' + (z + b)]) { good = false; break; }
      for (b = -1; b <= 2 && good; b++) for (a = -1; a <= 2; a++) if (!c.walk(x + a, z + b) || mine[(x + a) + ',' + (z + b)]) { good = false; break; }
      if (good) cand.push({ x: x, z: z, nw: dWater(x, z) ? 0 : 1, r: rnd() });
    }
    cand.sort(function (p1, p2) { return (p1.nw + p1.r * 0.8) - (p2.nw + p2.r * 0.8); });
    for (i = 0; i < cand.length && out.paddy.length < qp; i++) {
      e = cand[i]; if (!far(e.x + 1, e.z + 1, 6)) continue;
      take(e.x, e.z, true); take(e.x + 1, e.z, true); take(e.x, e.z + 1, true); take(e.x + 1, e.z + 1, true);
      out.paddy.push({ x: e.x + 1, z: e.z + 1, v: out.paddy.length % 2 });
    }
    // ---- rau muong mats on shallow water (never near piers / fishing columns / duck pond / other water plants)
    var piers = [], seats = [], wt = [];
    for (z = 0; z < Hd; z++) for (x = 0; x < Wd; x++) { k = cell(x, z); if (k === 'p') piers.push([x, z]); else if (k === 's') seats.push([x, z]); }
    function zone(px, pz) {
      var jj, p;
      for (jj = 0; jj < piers.length; jj++) { p = piers[jj]; if (Math.abs(p[0] - px) <= 5 && Math.abs(p[1] - pz) <= 5) return true; }
      for (jj = 0; jj < seats.length; jj++) { p = seats[jj]; if (Math.abs(p[0] - px) <= 3 && Math.abs(p[1] - pz) <= 15) return true; }
      return (px - 51.5) * (px - 51.5) + (pz - 12.5) * (pz - 12.5) < 49;
    }
    function shore(px, pz) { var r, dx, dz; for (r = 1; r <= 4; r++) for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) if ((Math.abs(dx) === r || Math.abs(dz) === r) && !water(px + dx, pz + dz)) return r; return 5; }
    function wfar(px, pz, m) { var l = (c.wAvoid || []).concat(out.kang), jj, p; for (jj = 0; jj < l.length; jj++) { p = l[jj]; if ((p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz) < m * m) return false; } return true; }
    for (z = 1; z < Hd - 1; z++) for (x = 1; x < Wd - 1; x++) if (cell(x, z) === '~' && !zone(x, z)) { j = shore(x, z); if (j >= 1 && j <= 2) wt.push({ x: x, z: z, sc: rnd() + Math.sqrt((x - 44) * (x - 44) + (z - 18) * (z - 18)) / 50 }); }
    wt.sort(function (p1, p2) { return p1.sc - p2.sc; });
    var qk = cnt(5, 2);
    for (i = 0; i < wt.length && out.kang.length < qk; i++) {
      e = wt[i]; if (!wfar(e.x + 0.5, e.z + 0.5, 4.2)) continue;
      out.kang.push({ x: e.x + 0.5 + (rnd() - 0.5) * 0.4, z: e.z + 0.5 + (rnd() - 0.5) * 0.4, seed: (rnd() * 1e6) | 0 });
    }
    /*STREET-BEGIN*/
    // ---- parked motorbikes (xe may), corrugated-iron lean-tos (chai ton), utility poles (cot dien) in a chain along one path
    out.moto = []; out.lean = []; out.poles = [];
    nextStreet(cnt(2, 1), out.moto, 4, function (ee, lastE) { return { x: ee.x, z: ee.z, pd: ee.pd, v: lastE ? (lastE.v + 1) % 3 : (rnd() * 3) | 0, r: rnd() }; });
    var ql = cnt(2, 1);
    for (i = 0; i < yd.length && ql > 0; i++) {
      e = yd[i]; if (!e.nt || !far(e.x, e.z, 4) || !ringFree(e.x, e.z)) continue;
      last = out.lean.length ? out.lean[out.lean.length - 1] : null;
      ql--; take(e.x, e.z, true);
      out.lean.push({ x: e.x, z: e.z, v: last ? 1 - last.v : 0, ry: ((rnd() * 4) | 0) * Math.PI / 2 });
    }
    var stMap = {}, chains = dn >= 0.8 ? 2 : 1, ch, want, chain, cur, nn, ax, az, nPole = dn >= 0.8 ? 5 : dn >= 0.5 ? 4 : 3;
    st.forEach(function (s2) { stMap[s2.x + ',' + s2.z] = s2; });
    for (ch = 0; ch < chains; ch++) {
      want = ch ? 3 : nPole; var best = null;
      for (i = 0; i < st.length; i++) {   // longest straight chain (up to `want` poles, 4 tiles apart) along one path; ties keep the town-nearest start
        e = st[i]; if (e.used || !far(e.x, e.z, 3) || !ringFree(e.x, e.z)) continue;
        ax = Math.abs(e.pd[1]); az = Math.abs(e.pd[0]);   // axis of the path beside this tile
        chain = [e]; cur = e;
        while (chain.length < want) {
          nn = stMap[(cur.x + ax * 4) + ',' + (cur.z + az * 4)];
          if (!nn || nn.used || nn.pd[0] !== e.pd[0] || nn.pd[1] !== e.pd[1] || !far(nn.x, nn.z, 3) || !ringFree(nn.x, nn.z)) break;
          chain.push(nn); cur = nn;
        }
        if (chain.length >= 3 && (!best || chain.length > best.length)) best = chain;
        if (best && best.length >= want) break;
      }
      if (!best) continue;
      best.forEach(function (p2) { p2.used = true; take(p2.x, p2.z, true); });
      out.poles.push(best.map(function (p2, j2) { return { x: p2.x, z: p2.z, pd: p2.pd, v: j2 === 1 ? 1 : 0 }; }));
    }
    /*STREET-END*/
    return out;
  }
  /*LAYOUT-END*/
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.WorldMap || !G.Scenery || !G.Decor || !G.VNKit || !G.DetailKit) { console.error('[vn_life] missing deps'); return; }
  var KIT = G.Scenery.kit, Mo = G.Models, W = G.World, WM = G.WorldMap, U = G.util, VN = G.VNKit, DK = G.DetailKit, C = VN.C, PI = Math.PI, sin = Math.sin, cos = Math.cos;
  var VL = G.VNLife = { group: null, layout: null, stats: null, layoutFn: layoutLife };

  function mk(fn) { var K = VN.make(); fn(K); return K.merge(); }
  function vgeo3(wood, canopy, fruit) {   // tree-shader geometry: aTree = (canopy mask, trunk weight, fruit mask); fruit blobs are white and take the per-instance iFruit hue
    var pos = [], nor = [], col = [], at = [], gs = [[wood, 0, 1, 0], [canopy, 1, 1, 0], [fruit, 0, 1, 1]], gi, gr, g, pa, na, ca, i, out = new THREE.BufferGeometry();
    for (gi = 0; gi < 3; gi++) {
      gr = gs[gi]; if (!gr[0].L.length) continue;
      g = Mo.mergeParts(gr[0].L); pa = g.attributes.position; na = g.attributes.normal; ca = g.attributes.color;
      for (i = 0; i < pa.count; i++) { pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); col.push(ca.getX(i), ca.getY(i), ca.getZ(i)); at.push(gr[1], gr[2], gr[3]); }
      g.dispose();
    }
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); out.setAttribute('aTree', new THREE.Float32BufferAttribute(at, 3));
    G.Render.addSmoothNormals(out); out.computeBoundingSphere();
    return out;
  }
  function cocoGeo() {
    var kw = VN.make(), kc = VN.make(), kf = VN.make(), i, a, cx = 0.4, cy = 3.05, GR = [0x6fbf5a, 0x5fae4e, 0x7fcf6a];
    kw.L.push(KIT.tube(function (t) { return [cx * t * t, cy * t, 0]; }, function (t) { return 0.1 - 0.05 * t; }, 8, 7, 0xb4a07a)); kw.L = kw.L.concat(KIT.roots(0.1, 3, 0.5, 0x8e8466));
    for (i = 0; i < 9; i++) { a = i * 0.7 + 0.2; kc.L.push(KIT.frond(1.1 + (i % 3) * 0.1, 0.17, i % 2 ? 0.6 : 0.28, 1.4, a, cx, cy + 0.03, 0, 0x4f9d4a, GR[i % 3], 5)); }
    for (i = 0; i < 5; i++) kw.sp(0.07, i % 2 ? 0x8aa046 : 0x9c7a3c, cx + cos(i * 1.26) * 0.12, cy - 0.14, sin(i * 1.26) * 0.12, 1.05);
    return vgeo3(kw, kc, kf);
  }
  function canopyGeo() {   // xoai / mit / bang / phuong share it: round layered crown + hanging fruit / blossom blobs
    var kw = VN.make(), kc = VN.make(), kf = VN.make(), i, a, B = [[1.0, 0, 2.35, 0, 0x6fbf68], [0.8, 0.8, 2.0, 0.15, 0x5fb86a], [0.78, -0.75, 2.05, -0.2, 0x78c870], [0.7, 0.1, 2.15, 0.8, 0x5fae62], [0.7, -0.1, 2.1, -0.78, 0x6fbf68], [0.6, 0.3, 2.95, 0.1, 0x82c978]];
    kw.tp(0.13, 0.2, 1.3, 7, 0x8c5a34, 0, 0.65, 0); kw.tp(0.07, 0.1, 0.7, 6, 0x7a4f2e, 0.18, 1.55, 0, 0, 0, -0.5); kw.tp(0.06, 0.09, 0.6, 6, 0x7a4f2e, -0.2, 1.5, 0.05, 0, 0, 0.55);
    for (i = 0; i < B.length; i++) kc.L.push(KIT.blob(B[i][0], B[i][4], B[i][1], B[i][2], B[i][3], 0.84));
    kw.L = kw.L.concat(KIT.roots(0.2, 4, 0.4, 0x7a4f2e));
    for (i = 0; i < 8; i++) { a = i * 0.85; kf.sp(0.085, 0xffffff, cos(a) * 1.0, 1.7 + (i % 3) * 0.14, sin(a) * 1.0, 1.3); }
    for (i = 0; i < 4; i++) kf.sp(0.09, 0xffffff, cos(i * 1.6 + 0.4) * 0.45, 3.2, sin(i * 1.6 + 0.4) * 0.45, 0.8);
    return vgeo3(kw, kc, kf);
  }
  var SPECIES = {   // canopy tint, fruit hue (phuong red: g and b low = no pink), seasonal recolour
    xoai: { tint: [0.84, 0.98, 0.78], fruit: [0.96, 0.7, 0.2] }, mit: { tint: [0.76, 0.86, 0.62], fruit: [0.62, 0.52, 0.22] },
    bang: { tint: [1.0, 0.92, 0.72], fruit: [0.42, 0.7, 0.38] }, phuong: { tint: [1.08, 1.04, 0.82], fruit: [0.92, 0.17, 0.1] }
  };
  /* ---- small prop geometries (local space) ---- */
  function hibGeo(v) {
    return mk(function (K) {
      var i, x, y, z, col = v ? 0xf08a3a : 0xd8453a;
      for (i = 0; i < 4; i++) K.ic(0.2 + (i % 2) * 0.04, i % 2 ? 0x4fa45c : 0x5fb86a, -0.42 + i * 0.28, 0.3 + (i % 2) * 0.05, 0, 0.95, i);
      for (i = 0; i < 7; i++) {
        x = -0.45 + i * 0.15; y = 0.46 + ((i * 3) % 4) * 0.08; z = i % 2 ? 0.17 : -0.17;
        K.tp(0.07, 0.022, 0.11, 6, col, x, y, z, i % 2 ? 0.9 : -0.9, 0, 0); K.sp(0.018, 0xffd84a, x, y + 0.04, z * 1.25, 1);
      }
    });
  }
  function trellisGeo(v) {
    return mk(function (K) {
      var i, px, pz, GL = [0x5fb86a, 0x6fc47a, 0x4fa45c];
      for (i = 0; i < 4; i++) K.cy(0.025, 1.7, i % 2 ? C.bamA : C.bamB, i < 2 ? -0.42 : 0.42, 0.85, i % 2 ? 0.2 : -0.2);
      K.cy(0.022, 0.95, C.bamA, 0, 1.7, 0.2, 0, 0, PI / 2); K.cy(0.022, 0.95, C.bamA, 0, 1.7, -0.2, 0, 0, PI / 2); K.cy(0.015, 0.95, C.bamB, 0, 1.05, 0.2, 0, 0, PI / 2); K.cy(0.015, 0.95, C.bamB, 0, 1.05, -0.2, 0, 0, PI / 2);
      for (i = 0; i < 10; i++) K.ic(0.13, GL[i % 3], -0.4 + (i % 5) * 0.2, 1.5 + (i % 2) * 0.16, i % 2 ? 0.18 : -0.18, 0.55, i);
      for (i = 0; i < 4; i++) {
        px = -0.3 + i * 0.2; pz = i % 2 ? 0.1 : -0.1;
        if (v) { K.sp(0.08, 0xe8e4b0, px, 1.2, pz, 1.5); K.sp(0.05, 0xe8e4b0, px, 1.4, pz, 1); } else K.tp(0.035, 0.05, 0.36, 6, 0xa8c860, px, 1.3, pz, 0, 0, 0.04 * (i - 1));
        K.sp(0.03, 0xffd84a, px + 0.1, 1.6, -pz, 1);
      }
    });
  }
  function paddyGeo(v) {
    return mk(function (K) {
      var r, cc, x, z, ripe = v ? [0xd8c860, 0xe6d46a] : [0x78c850, 0x8ad45e];
      K.bx(2, 0.09, 0.1, 0x8c6a3c, 0, 0.045, -0.95); K.bx(2, 0.09, 0.1, 0x8c6a3c, 0, 0.045, 0.95); K.bx(0.1, 0.09, 1.8, 0x8c6a3c, -0.95, 0.045, 0); K.bx(0.1, 0.09, 1.8, 0x8c6a3c, 0.95, 0.045, 0);
      K.bx(1.8, 0.02, 1.8, 0x8fc9b8, 0, 0.03, 0);
      for (r = 0; r < 6; r++) for (cc = 0; cc < 6; cc++) { x = -0.75 + cc * 0.3 + ((r * 7 + cc * 3) % 5 - 2) * 0.02; z = -0.75 + r * 0.3; K.cn(0.07, 0.26, ripe[(r + cc) % 2], x, 0.17, z, 0, 0, 5); }
    });
  }
  function kangGeo(seed) {
    var r = U.rng(seed), K = VN.make(), n = 7 + ((r() * 5) | 0), i, a, d, px, pz, LC = [0x6fcf5a, 0x58b84e, 0x82d868];
    for (i = 0; i < n; i++) {
      a = r() * 6.28; d = r() * 0.7; px = cos(a) * d; pz = sin(a) * d;
      K.ic(0.1, LC[(r() * 3) | 0], px, 0.03, pz, 0.45, r() * 3); K.cy(0.008, 0.14, 0x5aa84a, px, 0.1, pz); K.ic(0.05, LC[(r() * 3) | 0], px + 0.04, 0.17, pz, 0.5, r() * 3);
      if (r() < 0.35) K.tp(0.05, 0.012, 0.07, 5, 0xf4ecff, px, 0.2, pz);
    }
    return K.merge();
  }
  function motoGeo(v) {   // xe may, long axis +x
    var B = [C.red, C.blue, C.glaze][v], B2 = [C.cream, C.gold, C.cream][v];
    return mk(function (K) {
      var xs = [-0.5, 0.52], i;
      for (i = 0; i < 2; i++) { K.cy(0.23, 0.09, C.dark, xs[i], 0.23, 0, PI / 2); K.cy(0.1, 0.1, 0xd9dde2, xs[i], 0.23, 0, PI / 2); }
      K.bx(0.8, 0.14, 0.2, B, 0, 0.36, 0); K.bx(0.5, 0.1, 0.22, C.dark, -0.2, 0.55, 0); K.bx(0.32, 0.2, 0.2, B, 0.22, 0.52, 0, 0, 0, 0.3);
      K.bx(0.44, 0.04, 0.2, B, 0.52, 0.5, 0, 0, 0, -0.15); K.poleXY(0.5, 0.25, 0.4, 0.82, 0, 0.025, C.iron); K.bx(0.05, 0.04, 0.5, C.iron, 0.4, 0.84, 0);
      K.sp(0.07, 0xfff1c0, 0.5, 0.72, 0, 1); K.cy(0.035, 0.5, C.iron, -0.28, 0.2, 0.14, 0, 0, PI / 2); K.bx(0.3, 0.22, 0.3, B2, -0.56, 0.62, 0);
    });
  }
  function leanGeo(v) {   // chai ton: rusty corrugated-iron lean-to, open front toward +z
    var rust = function (x, y, z) { var f = Math.floor((x + z) * 13) % 2, k = Math.floor(x * 5 + z * 3); return k % 5 === 0 ? 0x8a4b33 : (f ? 0xb4623f : 0xc27a4e); };
    var rust2 = function (x, y, z) { var f = Math.floor((x + z) * 13) % 2; return Math.floor(y * 4) % 4 === 0 ? 0x8a4b33 : (f ? 0x9aa6a8 : 0x7fb0c4); };
    return mk(function (K) {
      var i;
      for (i = 0; i < 4; i++) K.cy(0.03, i < 2 ? 1.45 : 1.05, i % 2 ? C.bamA : C.bamB, i % 2 ? 0.46 : -0.46, i < 2 ? 0.72 : 0.52, i < 2 ? -0.38 : 0.38);
      K.bx(1.1, 0.04, 1.05, v ? rust2 : rust, 0, 1.28, 0, 0.3, 0, 0); K.bx(1.0, 1.15, 0.04, v ? rust : rust2, 0, 0.62, -0.42); K.bx(0.04, 1.0, 0.8, v ? rust2 : rust, -0.48, 0.55, 0);
      K.stool(0.1, 0.05, v ? 0x4fb3c8 : 0xe8715d, 0); K.jar(-0.25, -0.2, 0.13, C.clay, false); K.basket(0.3, -0.18, 0.14, 0.14, null, 0);
    });
  }
  function poleGeo(v) {   // cot dien: tapered pole, two cross-arms with insulators (arm along local x, wires run along local z)
    return mk(function (K) {
      var i;
      K.tp(0.05, 0.08, 3.6, 7, C.stone, 0, 1.8, 0); K.cy(0.087, 0.3, C.stone2, 0, 0.15, 0);
      K.bx(1.2, 0.07, 0.09, C.wood, 0, 3.4, 0); K.bx(0.8, 0.06, 0.08, C.wood, 0, 3.05, 0); K.poleXY(-0.5, 3.38, -0.08, 3.1, 0, 0.014, C.dark); K.poleXY(0.5, 3.38, 0.08, 3.1, 0, 0.014, C.dark);
      for (i = -1; i <= 1; i++) K.cy(0.03, 0.09, 0xeaf4f2, i * 0.45, 3.48, 0);
      if (v) { K.cy(0.17, 0.4, C.iron, 0.2, 2.65, 0); K.cy(0.18, 0.04, C.dark, 0.2, 2.87, 0); }
    });
  }
  var WIRE_Y = 3.53, _wm = null, _wq = null, _wd = null, _wp = null, _ws = null, _wz = null;
  function wireParts(L, a, b) {   // sagging wire a -> b = [x, z] (6 thin boxes; parabola sag)
    var n = 6, i, t, px = a[0], py = WIRE_Y, pz = a[1], x, y, z, len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), sag = 0.2 + 0.04 * len, sl;
    if (!_wm) { _wm = new THREE.Matrix4(); _wq = new THREE.Quaternion(); _wd = new THREE.Vector3(); _wp = new THREE.Vector3(); _ws = new THREE.Vector3(); _wz = new THREE.Vector3(0, 0, 1); }
    for (i = 1; i <= n; i++) {
      t = i / n; x = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t; y = WIRE_Y - sag * 4 * t * (1 - t);
      _wd.set(x - px, y - py, z - pz); sl = _wd.length(); _wd.normalize(); _wq.setFromUnitVectors(_wz, _wd);
      L.push({ geo: VN.BOXG, color: 0x3a2e2a, matrix: _wm.clone().compose(_wp.set((x + px) / 2, (y + py) / 2, (z + pz) / 2), _wq, _ws.set(0.026, 0.026, sl + 0.02)) });
      px = x; py = y; pz = z;
    }
  }

  function dens() { var q = G.Quality && G.Quality.tiers ? G.Quality.tiers[G.Quality.level()] : null; return q ? Math.max(0.3, q.flower) : 1; }
  function collectExt() {
    var ext = [], k, e, j, lay;
    for (k in G) { lay = G[k] && G[k].layout; if (!lay || !lay.ext) continue; for (j in lay.ext) { e = lay.ext[j]; if (e && e.length >= 4 && typeof e[0] === 'number') ext.push([e[0], e[1], e[2], e[3]]); } }
    return ext;
  }
  function pts(list) { var o = [], i; for (i = 0; i < (list || []).length; i++) o.push({ x: list[i].x, z: list[i].z }); return o; }

  function build() {
    var group = new THREE.Group(), mat = Mo.material('prop'), rng = U.rng(91919), ctx, L, g, m, mer, draws = 0, ext = collectExt(), taken = [], wAvoid = [], VV = G.VillageVN && G.VillageVN.layout;
    group.name = 'vn_life';
    if (VV) {
      VV.blocked.forEach(function (b) { taken.push({ x: b[0], z: b[1] }); });
      (VV.lotus || []).concat(VV.hyac || []).forEach(function (p) { wAvoid.push({ x: p.x, z: p.z }); });
      if (VV.moored) wAvoid.push({ x: VV.moored.x, z: VV.moored.z }); if (VV.drift) wAvoid.push({ x: VV.drift.x, z: VV.drift.z });
    }
    ctx = {
      rows: WM.rows, rng: rng, dens: dens(), boxes: [[3, 4, 14, 17], [9, 4, 32, 17]], ext: ext, taken: taken, wAvoid: wAvoid,
      walk: function (x, z) { return W.isWalkableTile(x, z) && !W.isBlocked(x, z); },
      trees: pts(G.Decor.layout && G.Decor.layout.trees).concat(pts(G.Scenery.layout && G.Scenery.layout.trees)), props: pts(G.Scenery.layout && G.Scenery.layout.props)
    };
    L = layoutLife(ctx); VL.layout = L;
    L.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    // swaying plants: coconut palms, then the four broadleaf species in one instanced geometry (2 + 2 draws)
    var coco = L.coco.map(function (v) { return { x: v.x + 0.5, z: v.z + 0.5, s: v.s, ry: v.ry, lx: v.lx, lz: v.lz, tint: v.tint }; });
    if (coco.length) { G.Decor.instanced(cocoGeo(), coco, 0.7, false, { tree: true, fade: 0.8, seasonal: 0.15 }); draws += 2; }
    var broad = L.tree.map(function (v) {
      var sd = SPECIES[v.k], j = 0.94 + v.r * 0.12;
      return { x: v.x + 0.5, z: v.z + 0.5, s: v.s, ry: v.ry, lx: v.lx, lz: v.lz, tint: [sd.tint[0] * j, sd.tint[1] * (1.04 - v.r * 0.08), sd.tint[2] * j, 0], fruit: sd.fruit };
    });
    if (broad.length) { G.Decor.instanced(canopyGeo(), broad, 0.5, false, { tree: true, fade: 0.8, seasonal: 0.85 }); draws += 2; }
    // static props (one merged mesh, no outline): hedges, trellises, paddies, rau muong, street kit
    mer = new DK.Merger();
    var GH = [hibGeo(0), hibGeo(1)], GT = [trellisGeo(0), trellisGeo(1)], GP = [paddyGeo(0), paddyGeo(1)];
    L.hib.forEach(function (p) { mer.add(GH[p.v], p.x + 0.5 - p.pd[0] * 0.28, 0, p.z + 0.5 - p.pd[1] * 0.28, p.pd[0] !== 0 ? PI / 2 : 0, 1); });
    L.trel.forEach(function (p) { mer.add(GT[p.v], p.x + 0.5, 0, p.z + 0.5, p.ry, 1); });
    L.paddy.forEach(function (p) { mer.add(GP[p.v], p.x, 0, p.z, 0, 1); });
    L.kang.forEach(function (p) { var q = kangGeo(p.seed); mer.add(q, p.x, -0.105, p.z, 0, 1); q.dispose(); });
    var GM = [motoGeo(0), motoGeo(1), motoGeo(2)], GLn = [leanGeo(0), leanGeo(1)], GPo = [poleGeo(0), poleGeo(1)], wl = [];
    L.moto.forEach(function (p) { mer.add(GM[p.v], p.x + 0.5 - p.pd[0] * 0.28, 0, p.z + 0.5 - p.pd[1] * 0.28, p.pd[0] !== 0 ? PI / 2 : 0, 1); });
    L.lean.forEach(function (p) { mer.add(GLn[p.v], p.x + 0.5, 0, p.z + 0.5, p.ry, 1); });
    L.poles.forEach(function (chain) {
      var tops = [], i2, o, a2, b2;
      chain.forEach(function (p) {
        var px = p.x + 0.5 - p.pd[0] * 0.3, pz = p.z + 0.5 - p.pd[1] * 0.3, ry = Math.atan2(Math.abs(p.pd[1]), Math.abs(p.pd[0]));
        mer.add(GPo[p.v], px, 0, pz, ry, 1); tops.push([px, pz, ry]);
      });
      for (i2 = 0; i2 + 1 < tops.length; i2++) for (o = -0.45; o <= 0.46; o += 0.45) {
        a2 = tops[i2]; b2 = tops[i2 + 1];
        wireParts(wl, [a2[0] + o * cos(a2[2]), a2[1] - o * sin(a2[2])], [b2[0] + o * cos(b2[2]), b2[1] - o * sin(b2[2])]);
      }
    });
    if (wl.length) { g = Mo.mergeParts(wl); mer.add(g, 0, 0, 0, 0, 1); g.dispose(); }
    GM.concat(GLn, GPo).forEach(function (x) { x.dispose(); });
    g = mer.geometry();
    if (g) { m = DK.mesh(g, mat, 'vn_life_props', false); group.add(m); draws++; }
    GH.concat(GT, GP).forEach(function (x) { x.dispose(); });
    G.Scenery.group.add(group); VL.group = group;
    VL.stats = { draws: draws, coco: L.coco.length, tree: L.tree.length, hib: L.hib.length, trel: L.trel.length, paddy: L.paddy.length, kang: L.kang.length, moto: L.moto.length, lean: L.lean.length, poles: L.poles.map(function (c) { return c.length; }), blocked: L.blocked.length };
  }
  VL.build = build;
})();
