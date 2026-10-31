/* Togie Valley - village_vn.js (Round 2 stage 8): Vietnamese countryside streets, plants and water. Game.VillageVN.build() (after ChillSpots).
 * Plants (instanced, tree shader, swaying): cau (areca), chuoi (banana), tre (bamboo stand). Street props (one static merged mesh): bamboo fences, lantern posts,
 * laundry lines, bicycles, clay jars, baskets / thung, plastic stools. Water: sen (lotus) + luc binh (hyacinth) patches, a moored ghe (merged) and a drifting ghe.
 * Placement is a pure LAYOUT block (node-testable): every blocked tile has 8 free neighbours (cannot cut the map), props stay off paths, plots, piers, fishing columns, footprints.
 * Tiers: counts x max(0.3, Quality.flower) at build; drifting boat hidden on tier 3. Draw calls added: 12 (see stats.draws). */
(function () {
  'use strict';
  var G = window.Game;
  /*LAYOUT-BEGIN*/
  function layoutVillage(c) {
    var rows = c.rows, Wd = rows[0].length, Hd = rows.length, rnd = c.rng, dn = c.dens, mine = {}, MARK = 'HSWFDBCKMsnmltp';
    var out = { veg: [], street: [], blocked: [], lotus: [], hyac: [], moored: null, drift: null }, picks = [];
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
    var x, z, i, k, pd, s;
    // ---- street props: grass tiles that touch a path (nearer the town first)
    var st = [];
    for (z = 2; z < Hd - 2; z++) for (x = 2; x < Wd - 2; x++) {
      pd = pathDir(x, z);
      if (pd && baseClear(x, z, 1.5)) st.push({ x: x, z: z, pd: pd, sc: rnd() + 0.9 * Math.min(1, Math.sqrt((x - 34) * (x - 34) + (z - 16) * (z - 16)) / 45) });
    }
    st.sort(function (a, b) { return a.sc - b.sc; });
    function nextStreet(n, kind, need) {
      var got = 0, j, e, vv;
      for (j = 0; j < st.length && got < n; j++) {
        e = st[j]; if (e.used || !far(e.x, e.z, 3.4) || !ringFree(e.x, e.z)) continue;
        if (need) { vv = need(e); if (!vv) continue; }
        e.used = true; got++;
        take(e.x, e.z, kind.block);
        out.street.push({ k: kind.k, x: e.x, z: e.z, pd: e.pd, v: (rnd() * 3) | 0, r: rnd() });
        if (vv && vv.extra) { take(vv.extra[0], vv.extra[1], true); out.street[out.street.length - 1].x2 = vv.extra[0]; out.street[out.street.length - 1].z2 = vv.extra[1]; }
      }
    }
    nextStreet(cnt(2, 1), { k: 'laundry', block: true }, function (e) {   // two poles two tiles apart along the path, middle tile stays free
      var al = [Math.abs(e.pd[1]), Math.abs(e.pd[0])], bx = e.x + al[0] * 2, bz = e.z + al[1] * 2, mx = e.x + al[0], mz = e.z + al[1];
      if (cell(bx, bz) !== '.' || !baseClear(bx, bz, 1.5) || !c.walk(mx, mz) || cell(mx, mz) !== '.' || mine[mx + ',' + mz] || !far(bx, bz, 3.4)) return null;
      var pd2 = pathDir(bx, bz); if (!pd2 || pd2[0] !== e.pd[0] || pd2[1] !== e.pd[1]) return null;
      return { extra: [bx, bz] };
    });
    nextStreet(cnt(3, 1), { k: 'lantern', block: true });
    nextStreet(cnt(5, 1), { k: 'fence', block: true });
    nextStreet(cnt(2, 1), { k: 'bike', block: true });
    nextStreet(cnt(6, 2), { k: 'jars', block: false });
    nextStreet(cnt(5, 2), { k: 'baskets', block: false });
    nextStreet(cnt(4, 1), { k: 'stools', block: false });
    // ---- plants on yards (grass tiles with no path beside them)
    var yd = [];
    function dWater(x, z) { var dx, dz; for (dz = -4; dz <= 4; dz++) for (dx = -4; dx <= 4; dx++) if (cell(x + dx, z + dz) === '~') return true; return false; }
    function dTown(x, z) { var dx, dz, ch; for (dz = -9; dz <= 9; dz++) for (dx = -9; dx <= 9; dx++) { ch = cell(x + dx, z + dz); if (ch === 'H' || ch === 'S' || ch === 'W') return true; } return false; }
    for (z = 3; z < Hd - 3; z++) for (x = 3; x < Wd - 3; x++) if (!pathNear(x, z) && baseClear(x, z, 2.3)) yd.push({ x: x, z: z, nw: dWater(x, z), nt: dTown(x, z) });
    shuffle(yd);
    /* Round 5: natural clumps instead of evenly sprinkled singles. A clump = one species, 2-4 plants 1.9-2.7 tiles apart around a bigger
     * centre plant; clumps keep >= 6 tiles between centres so open yards stay between them. Same quotas, same blocking rules. */
    var quota = { cau: cnt(12, 3), chuoi: cnt(9, 3), tre: cnt(12, 3) }, names = ['cau', 'chuoi', 'tre'], left = quota.cau + quota.chuoi + quota.tre;
    var okYd = {}; yd.forEach(function (q) { okYd[q.x + ',' + q.z] = q; });
    function plant(kk, px, pz, sc) {
      quota[kk]--; left--; take(px, pz, true);
      out.veg.push({ k: kk, x: px, z: pz, s: sc, ry: rnd() * 6.28, lx: (rnd() - 0.5) * 0.12, lz: (rnd() - 0.5) * 0.12, tint: [0.88 + rnd() * 0.26, 0.92 + rnd() * 0.16, 0.84 + rnd() * 0.26, 0] });
    }
    var lastK = -1;
    for (i = 0; i < yd.length && left > 0; i++) {
      var e = yd[i], w = [], tot = 0, pick, j, n, tries, ang, dist, qx, qz, cand;
      if (!far(e.x, e.z, 6) || !ringFree(e.x, e.z)) continue;
      for (j = 0; j < 3; j++) { w[j] = quota[names[j]] > 0 && j !== lastK ? (j === 0 ? 1 + 2 * e.nt : j === 1 ? 1 + 2 * e.nw : 0.3 + 3 * e.nw) : 0; tot += w[j]; }
      if (tot <= 0) { for (j = 0; j < 3; j++) { w[j] = quota[names[j]] > 0 ? 1 : 0; tot += w[j]; } }
      if (tot <= 0) break;
      pick = rnd() * tot; for (k = 0; k < 3; k++) { pick -= w[k]; if (pick <= 0 && w[k] > 0) break; } if (k > 2) { for (k = 2; k > 0 && !w[k]; k--); }
      lastK = k;
      plant(names[k], e.x, e.z, 1.08 + rnd() * 0.24);   // clump centre: the tallest
      n = Math.min(quota[names[k]], 1 + ((rnd() * 3) | 0));
      for (tries = 0; tries < 14 && n > 0; tries++) {
        ang = rnd() * 6.2832; dist = 1.9 + rnd() * 0.8; qx = Math.round(e.x + Math.cos(ang) * dist); qz = Math.round(e.z + Math.sin(ang) * dist);
        cand = okYd[qx + ',' + qz];
        if (!cand || !far(qx, qz, 1.9) || !ringFree(qx, qz)) continue;
        plant(names[k], qx, qz, 0.9 + rnd() * 0.18); n--;
      }
    }
    // ---- water: patches + boats (never near piers / fishing columns / duck pond)
    var piers = [], seats = [];
    for (z = 0; z < Hd; z++) for (x = 0; x < Wd; x++) { k = cell(x, z); if (k === 'p') piers.push([x, z]); else if (k === 's') seats.push([x, z]); }
    function zone(x, z) {
      var j, q; for (j = 0; j < piers.length; j++) { q = piers[j]; if (Math.abs(q[0] - x) <= 5 && Math.abs(q[1] - z) <= 5) return true; }
      for (j = 0; j < seats.length; j++) { q = seats[j]; if (Math.abs(q[0] - x) <= 3 && Math.abs(q[1] - z) <= 15) return true; }
      return (x - 51.5) * (x - 51.5) + (z - 12.5) * (z - 12.5) < 49;
    }
    function shore(x, z) { var r, dx, dz; for (r = 1; r <= 4; r++) for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) if ((Math.abs(dx) === r || Math.abs(dz) === r) && !water(x + dx, z + dz)) return r; return 5; }
    var wt = [];
    for (z = 1; z < Hd - 1; z++) for (x = 1; x < Wd - 1; x++) if (cell(x, z) === '~' && !zone(x, z)) wt.push({ x: x, z: z, sh: shore(x, z), sc: rnd() * 0.5 + Math.sqrt((x - 44) * (x - 44) + (z - 18) * (z - 18)) / 50 });
    wt.sort(function (a, b) { return a.sc - b.sc; });   // nearer the village first
    function wfar(x, z, m) { var j, q, l = [out.lotus, out.hyac], a, b; for (a = 0; a < 2; a++) for (b = 0; b < l[a].length; b++) { q = l[a][b]; if ((q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < m * m) return false; }
      if (out.moored && (out.moored.x - x) * (out.moored.x - x) + (out.moored.z - z) * (out.moored.z - z) < m * m) return false;
      if (out.drift && (out.drift.x - x) * (out.drift.x - x) + (out.drift.z - z) * (out.drift.z - z) < m * m) return false; return true; }
    function fp(cx, cz, ax, az, ex) {   // boat footprint all water?
      var hl = 1.3 + ex, hw = 0.5 + ex, a, b, px, pz;
      for (a = -1; a <= 1; a++) for (b = -1; b <= 1; b++) { px = cx + ax * hl * a - az * hw * b; pz = cz + az * hl * a + ax * hw * b; if (!water(Math.floor(px), Math.floor(pz))) return false; }
      return true;
    }
    for (i = 0; i < wt.length && !out.moored; i++) {   // moored ghe: close to a bank, axis parallel to it
      var m = wt[i], dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], nd = null, r2, jj, ax, az, cx = m.x + 0.5, cz = m.z + 0.5;
      if (m.sh > 2) continue;
      for (r2 = 1; r2 <= 3 && !nd; r2++) for (jj = 0; jj < 4; jj++) if (!water(m.x + dirs[jj][0] * r2, m.z + dirs[jj][1] * r2)) { nd = dirs[jj]; break; }
      if (!nd) continue; ax = -nd[1]; az = nd[0];
      if (!fp(cx, cz, ax, az, 0.35) || !water(Math.floor(cx + ax * 2.0), Math.floor(cz + az * 2.0))) continue;
      out.moored = { x: cx, z: cz, ax: ax, az: az };
    }
    for (i = 0; i < wt.length && !out.drift; i++) {   // drifting ghe: open water, 5x5 water around, far from the moored one
      var d2 = wt[i], ok = true, dx2, dz2;
      if (d2.sh < 3 || !wfar(d2.x + 0.5, d2.z + 0.5, 12)) continue;
      for (dz2 = -2; dz2 <= 2 && ok; dz2++) for (dx2 = -2; dx2 <= 2; dx2++) if (!water(d2.x + dx2, d2.z + dz2) || zone(d2.x + dx2, d2.z + dz2)) { ok = false; break; }
      if (ok) out.drift = { x: d2.x + 0.5, z: d2.z + 0.5, ry: rnd() * 6.28, ph: rnd() * 6.28 };
    }
    var nl = cnt(7, 2), nh = cnt(6, 2);
    for (i = 0; i < wt.length && (out.lotus.length < nl || out.hyac.length < nh); i++) {
      var q2 = wt[i]; if (q2.sh < 2 || q2.sh > 4 || !wfar(q2.x + 0.5, q2.z + 0.5, 4.5)) continue;
      if (out.lotus.length < nl && (out.hyac.length >= nh || q2.sh >= 3 || rnd() < 0.5)) out.lotus.push({ x: q2.x + 0.5 + (rnd() - 0.5) * 0.4, z: q2.z + 0.5 + (rnd() - 0.5) * 0.4, seed: (rnd() * 1e6) | 0 });
      else if (out.hyac.length < nh) out.hyac.push({ x: q2.x + 0.5 + (rnd() - 0.5) * 0.4, z: q2.z + 0.5 + (rnd() - 0.5) * 0.4, seed: (rnd() * 1e6) | 0 });
    }
    return out;
  }
  /*LAYOUT-END*/
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.WorldMap || !G.Scenery || !G.Decor || !G.VNKit || !G.DetailKit || !G.Loop) { console.error('[village_vn] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, WM = G.WorldMap, U = G.util, VN = G.VNKit, DK = G.DetailKit, C = VN.C, PI = Math.PI, sin = Math.sin, cos = Math.cos;
  var V = G.VillageVN = { group: null, layout: null, stats: null, layoutFn: layoutVillage };
  var WY = -0.16;   // boat base (hull bottom just under the water plane -0.12)

  function mk(fn) { var K = VN.make(); fn(K); var g = K.merge(); return g; }
  function vgeo(wood, canopy) {   // tree-shader geometry: aTree = (canopy mask, trunk weight, fruit mask)
    var pos = [], nor = [], col = [], at = [], gs = [[wood, 0, 1, 0], [canopy, 1, 1, 0]], gi, gr, g, pa, na, ca, i, out = new THREE.BufferGeometry();
    for (gi = 0; gi < 2; gi++) {
      gr = gs[gi]; if (!gr[0].L.length) continue;
      g = Mo.mergeParts(gr[0].L); pa = g.attributes.position; na = g.attributes.normal; ca = g.attributes.color;
      for (i = 0; i < pa.count; i++) { pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); col.push(ca.getX(i), ca.getY(i), ca.getZ(i)); at.push(gr[1], gr[2], gr[3]); }
      g.dispose();
    }
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); out.setAttribute('aTree', new THREE.Float32BufferAttribute(at, 3));
    R.addSmoothNormals(out); out.computeBoundingSphere();
    return out;
  }
  /* Round 5: crowns use the arched ribbon frond of the scenery palms (Scenery.kit.frond) instead of flat boards (they read as a flat 'X' from the camera). */
  function fr(len, w, up, droop, a, x, y, z, c1, c2, n) { return G.Scenery.kit.frond(len, w, up, droop, a, x, y, z, c1, c2, n); }
  function arecaGeo() {   // cau: slender ringed trunk, round crown of arching fronds, orange nut bunch
    var kw = VN.make(), kc = VN.make(), i, a, GR = [0x7ccb66, 0x8ad46e, 0x6bbd5e];
    for (i = 0; i < 3; i++) kw.tp(0.062 - 0.007 * i, 0.07 - 0.007 * i, 0.92, 7, i % 2 ? 0xa6b57b : 0xb8c48c, 0, 0.46 + 0.9 * i, 0);
    for (i = 1; i < 6; i++) kw.tor(0.062 - 0.006 * i * 0.5, 0x8e9a62, 0, 0.45 * i + 0.02, 0, PI / 2);
    kc.tp(0.075, 0.058, 0.4, 7, 0x86c95c, 0, 2.9, 0);
    for (i = 0; i < 10; i++) { a = i * 0.628 + (i % 2) * 0.2; kc.L.push(fr(i % 2 ? 1.05 : 1.2, 0.2, i % 3 === 0 ? 1.0 : (i % 3 === 1 ? 0.7 : 0.45), 1.7, a, 0, 3.02, 0, 0x3f8f4e, GR[i % 3], 6)); }
    for (i = 0; i < 6; i++) kc.ic(0.045, i % 2 ? 0xe8715d : 0xf2a24a, cos(i * 1.05) * 0.11, 2.72, sin(i * 1.05) * 0.11, 1);
    return vgeo(kw, kc);
  }
  function bananaGeo() {   // chuoi: tall layered pseudo-stem, broad leaves that rise then fold over, purple bud + yellow hands
    var kw = VN.make(), kc = VN.make(), i, a, G2 = [0x8ad46e, 0x7ccb66, 0x9ade78];
    kw.tp(0.15, 0.19, 0.8, 8, 0x9bc968, 0, 0.4, 0); kw.tp(0.11, 0.15, 0.8, 8, 0x8cbc5d, 0, 1.2, 0);
    kw.cy(0.015, 0.45, 0x6a8f4a, 0.17, 1.3, 0.14); kw.ic(0.1, 0x8a3f6a, 0.17, 1.02, 0.14, 1.4);
    for (i = 0; i < 5; i++) kw.ic(0.06, 0xe9d24a, 0.17 + cos(i * 1.3) * 0.08, 1.2, 0.14 + sin(i * 1.3) * 0.08, 2.2);
    for (i = 0; i < 8; i++) { a = i * 0.785 + 0.3; kc.L.push(fr(i % 2 ? 1.25 : 1.45, 0.36, i % 2 ? 1.0 : 1.35, i % 2 ? 2.1 : 1.9, a, 0, 1.58, 0, 0x4f9d4a, G2[i % 3], 7)); }
    return vgeo(kw, kc);
  }
  function bambooGeo() {   // tre: leaning culms with feathery leaf sprays along the top half
    var kw = VN.make(), kc = VN.make(), i, j, ai, m, hh, lx, lz, bx, bz, cx, cz, tx, ty, tz, b, f2;
    for (i = 0; i < 7; i++) {
      ai = i * 0.9 + 0.2; m = 0.06 + (i % 3) * 0.05; hh = 2.6 + ((i * 5) % 4) * 0.34; bx = cos(ai) * 0.14; bz = sin(ai) * 0.14; lz = -m * cos(ai); lx = m * sin(ai);
      cx = bx - 0.5 * hh * sin(lz); cz = bz + 0.5 * hh * sin(lx);
      kw.tp(0.028, 0.04, hh, 6, kw.bambooV(i % 2 ? 0x9ccc58 : 0x86bd4c, i % 2 ? 0x86bd4c : 0x9ccc58), cx, 0.5 * hh * cos(lz), cz, lx, 0, lz);
      for (j = 0; j < 6; j++) {
        f2 = 0.55 + j * 0.09; tx = bx - hh * f2 * sin(lz); tz = bz + hh * f2 * sin(lx); ty = hh * f2 * cos(lz);
        b = ai + j * 2.1 + i * 0.7;
        kc.L.push(fr(0.5 + (j % 3) * 0.08, 0.075, 0.45, 1.5, b, tx, ty, tz, 0x4f9d4a, j % 2 ? 0x8ad46e : 0x7ccb66, 4));
      }
    }
    return vgeo(kw, kc);
  }
  /* ---- street prop geometries (local space, +x along the prop) ---- */
  function fenceGeo(v) {
    return mk(function (K) {
      var i, x;
      K.cy(0.035, 0.8, C.bamA, -0.47, 0.4, 0); K.cy(0.035, 0.8, C.bamA, 0.47, 0.4, 0); K.cy(0.022, 0.98, C.bamB, 0, 0.25, 0, 0, 0, PI / 2); K.cy(0.022, 0.98, C.bamB, 0, 0.58, 0, 0, 0, PI / 2);
      if (v === 0) { for (i = 0; i < 6; i++) { x = -0.36 + i * 0.145; K.cy(0.02, i % 2 ? 0.6 : 0.7, i % 2 ? C.bamB : C.bamA, x, 0.33, 0); } }
      else { for (i = 0; i < 4; i++) { x = -0.33 + i * 0.22; K.cy(0.014, 0.62, C.bamA, x, 0.4, 0.02, 0, 0, 0.6); K.cy(0.014, 0.62, C.bamB, x + 0.11, 0.4, -0.02, 0, 0, -0.6); } }
    });
  }
  function lanternGeo() { return mk(function (K) { K.cy(0.032, 2.1, C.bamB, 0, 1.05, 0); K.ic(0.13, C.stone, 0, 0.05, 0, 0.45); K.cy(0.02, 0.55, C.bamA, 0.27, 1.95, 0, 0, 0, PI / 2); K.lantern(0.5, 1.72, 0, 1.25); }); }
  function laundryGeo() {
    return mk(function (K) {
      var CL = [0xfff1d0, 0x7fb0c4, 0xe8715d, 0xffd166, 0xb79cf2, 0x7fcf7a], i, x, y, h, w;
      K.cy(0.035, 1.95, C.bamB, -1, 0.975, 0); K.cy(0.035, 1.95, C.bamB, 1, 0.975, 0); K.poleXY(-1, 1.75, 0, 1.66, 0, 0.01, C.dark); K.poleXY(0, 1.66, 1, 1.75, 0, 0.01, C.dark);
      for (i = 0; i < 5; i++) {
        x = -0.72 + i * 0.37; y = x < 0 ? 1.75 - 0.09 * (x + 1) : 1.66 + 0.09 * x; h = i % 2 ? 0.34 : 0.42; w = i % 2 ? 0.16 : 0.3;
        K.bx(w, h, 0.015, CL[(i * 2 + 1) % 6], x, y - h / 2 - 0.02, 0, 0, 0, (i - 2) * 0.03);
        if (i % 2) K.bx(w, h, 0.015, CL[(i * 2 + 3) % 6], x + 0.17, y - h / 2 - 0.02, 0, 0, 0, 0.04);
      }
    });
  }
  function bikeGeo(fr) {
    return mk(function (K) {
      K.tor(0.3, C.iron, -0.42, 0.31, 0, 0, 0); K.tor(0.3, C.iron, 0.42, 0.31, 0, 0, 0); K.cy(0.03, 0.05, C.iron, -0.42, 0.31, 0, PI / 2); K.cy(0.03, 0.05, C.iron, 0.42, 0.31, 0, PI / 2);
      K.poleXY(-0.42, 0.31, -0.15, 0.62, 0, 0.018, fr); K.poleXY(-0.15, 0.62, 0.3, 0.7, 0, 0.018, fr); K.poleXY(0.3, 0.7, 0.42, 0.31, 0, 0.018, fr); K.poleXY(-0.15, 0.62, 0.0, 0.28, 0, 0.018, fr); K.poleXY(0.0, 0.28, -0.42, 0.31, 0, 0.014, fr);
      K.bx(0.17, 0.045, 0.08, C.dark, -0.15, 0.66, 0); K.bx(0.04, 0.03, 0.36, C.iron, 0.3, 0.76, 0); K.bx(0.24, 0.025, 0.14, C.iron, -0.45, 0.58, 0); K.basket(0.44, 0, 0.14, 0.15, null, 0.66);
    });
  }
  function jarsGeo(v) {
    return mk(function (K) {
      var A = v === 1 ? C.glaze : C.clay, B = v === 2 ? C.clay : C.glaze;
      K.jar(0, 0, 0.2, A, true); K.jar(0.34, 0.08, 0.15, B, false); K.jar(-0.1, 0.3, 0.13, v === 1 ? C.clay : A, false);
    });
  }
  function basketsGeo(v) {
    return mk(function (K) {
      var GD = [[0xe8715d, 0xffd166, 0x7fcf7a], [0xff9b50, 0xe8715d], [0x7fcf7a, 0x5fb86a]];
      K.basket(0, 0, 0.26, 0.2, GD[v], 0); K.basket(0.4, 0.12, 0.32, 0.1, v === 2 ? [0xf2e6c8] : null, 0); K.basket(-0.05, 0.36, 0.14, 0.2, null, 0);
    });
  }
  function stoolsGeo(v) {
    var P = [[0xe8715d, 0x4fb3c8], [0x7fcf7a, 0xffd166], [0xb79cf2, 0xff9b50]][v];
    return mk(function (K) {
      K.cy(0.2, 0.03, C.cream, 0, 0.42, 0); K.cy(0.018, 0.4, C.iron, 0, 0.21, 0); K.cy(0.12, 0.02, C.iron, 0, 0.01, 0);
      K.stool(-0.32, 0.04, P[0], 0); K.stool(0.3, 0.1, P[1], 0); K.stool(0.0, 0.36, P[0], 0);
    });
  }
  /* ---- water geometries ---- */
  function lotusGeo(seed) {
    var r = U.rng(seed), n = 5 + ((r() * 4) | 0), i, K = VN.make(), a, d, s, f = 1 + ((r() * 3) | 0), j, px, pz, FL = [0xff9bb3, 0xfff1f0, 0xf47aa0], LC = [0x5fb86a, 0x6fc47a, 0x4fa45c];
    for (i = 0; i < n; i++) { a = r() * 6.28; d = 0.15 + r() * 0.75; s = 0.26 + r() * 0.22; K.tp(s, s * 0.92, 0.018, 10, LC[(r() * 3) | 0], cos(a) * d, 0.0, sin(a) * d); K.cy(s * 0.12, 0.012, 0x4a9a58, cos(a) * d, 0.012, sin(a) * d); }
    for (i = 0; i < f; i++) {
      a = r() * 6.28; d = 0.1 + r() * 0.55; px = cos(a) * d; pz = sin(a) * d; var fc = FL[(r() * 3) | 0], hgt = 0.36 + r() * 0.2;
      K.cy(0.012, hgt, 0x5aa86a, px, hgt / 2, pz);
      for (j = 0; j < 6; j++) K.cn(0.05, 0.17, fc, px + cos(j * 1.047) * 0.07, hgt + 0.06, pz + sin(j * 1.047) * 0.07, 0.7 * sin(j * 1.047), -0.7 * cos(j * 1.047), 5);
      for (j = 0; j < 4; j++) K.cn(0.04, 0.13, 0xfff6e0, px + cos(j * 1.57 + 0.5) * 0.035, hgt + 0.08, pz + sin(j * 1.57 + 0.5) * 0.035, 0.3 * sin(j * 1.57 + 0.5), -0.3 * cos(j * 1.57 + 0.5), 5);
      K.sp(0.025, C.gold, px, hgt + 0.07, pz, 1);
    }
    return K.merge();
  }
  function hyacGeo(seed) {
    var r = U.rng(seed), n = 6 + ((r() * 5) | 0), i, j, K = VN.make(), a, d, px, pz, LC = [0x7fcf6a, 0x68b85a, 0x8fd678];
    for (i = 0; i < n; i++) {
      a = r() * 6.28; d = r() * 0.65; px = cos(a) * d; pz = sin(a) * d;
      for (j = 0; j < 4; j++) K.ic(0.11, LC[(r() * 3) | 0], px + cos(j * 1.57 + i) * 0.1, 0.03, pz + sin(j * 1.57 + i) * 0.1, 0.5);
      K.ic(0.08, 0x9ad878, px, 0.07, pz, 0.8);
      if (r() < 0.4) { K.cy(0.01, 0.2, 0x6fbf5a, px, 0.17, pz); for (j = 0; j < 3; j++) K.ic(0.04, 0xb79cf2, px, 0.26 + j * 0.05, pz, 1); }
    }
    return K.merge();
  }
  function boatGeo(hull, stripe, moored) {
    return mk(function (K) {
      K.bx(1.7, 0.05, 0.46, C.straw, 0, 0.04, 0); K.bx(1.7, 0.3, 0.05, hull, 0, 0.18, 0.26, 0.24); K.bx(1.7, 0.3, 0.05, hull, 0, 0.18, -0.26, -0.24);
      K.bx(0.46, 0.26, 0.4, hull, 0.98, 0.26, 0, 0, 0, 0.5); K.bx(0.46, 0.26, 0.4, hull, -0.98, 0.26, 0, 0, 0, -0.5);
      K.bx(1.72, 0.04, 0.06, stripe, 0, 0.33, 0.33, 0.24); K.bx(1.72, 0.04, 0.06, stripe, 0, 0.33, -0.33, -0.24);
      K.bx(0.14, 0.04, 0.6, C.wood2, 0.15, 0.24, 0); K.bx(0.14, 0.04, 0.6, C.wood2, -0.45, 0.24, 0);
      K.sp(0.045, 0xffffff, 1.14, 0.42, 0.16, 1); K.sp(0.045, 0xffffff, 1.14, 0.42, -0.16, 1); K.sp(0.02, C.dark, 1.17, 0.42, 0.16, 1); K.sp(0.02, C.dark, 1.17, 0.42, -0.16, 1);   // mat ghe (painted eyes)
      K.cy(0.018, 1.6, C.bamB, -0.2, 0.42, 0.2, 0, 0.12, PI / 2 - 0.12);
      if (moored) { K.cy(0.03, 0.9, C.dark, 1.9, 0.3, 0); K.cy(0.008, 0.9, C.straw, 1.45, 0.28, 0, 0, 0, PI / 2 - 0.12); K.nonla(-0.45, 0.3, 0, 0.2, false); }
      else { K.tor(0.14, C.straw, -0.7, 0.1, 0.05, PI / 2); K.tor(0.09, C.bamB, -0.7, 0.14, 0.05, PI / 2); }
    });
  }

  function dens() { var q = G.Quality && G.Quality.tiers ? G.Quality.tiers[G.Quality.level()] : null; return q ? Math.max(0.3, q.flower) : 1; }
  function collectExt() {
    var ext = [], k, e, j, lay;
    for (k in G) { lay = G[k] && G[k].layout; if (!lay || !lay.ext) continue; for (j in lay.ext) { e = lay.ext[j]; if (e && e.length >= 4 && typeof e[0] === 'number') ext.push([e[0], e[1], e[2], e[3]]); } }
    return ext;
  }
  function pts(list) { var o = [], i; for (i = 0; i < (list || []).length; i++) o.push({ x: list[i].x, z: list[i].z }); return o; }

  function build() {
    var group = new THREE.Group(), mat = Mo.material('prop'), rng = U.rng(80808), ctx, L, i, e, g, mer, m, draws = 0, ext = collectExt();
    group.name = 'village_vn';
    ctx = {
      rows: WM.rows, rng: rng, dens: dens(), boxes: [[3, 4, 14, 17], [9, 4, 32, 17]], ext: ext,
      walk: function (x, z) { return W.isWalkableTile(x, z) && !W.isBlocked(x, z); },
      trees: pts(G.Decor.layout && G.Decor.layout.trees).concat(pts(G.Scenery.layout && G.Scenery.layout.trees)), props: pts(G.Scenery.layout && G.Scenery.layout.props)
    };
    L = layoutVillage(ctx); V.layout = L;
    L.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    // plants: one instanced fill + outline pair per species (6 calls)
    var sp = { cau: [], chuoi: [], tre: [] }, geo = { cau: arecaGeo, chuoi: bananaGeo, tre: bambooGeo }, sway = { cau: 0.7, chuoi: 0.8, tre: 1.0 }, seas = { cau: 0.15, chuoi: 0.2, tre: 0.3 };
    L.veg.forEach(function (v) { sp[v.k].push({ x: v.x + 0.5, z: v.z + 0.5, s: v.s, ry: v.ry, lx: v.lx, lz: v.lz, tint: v.tint }); });
    ['cau', 'chuoi', 'tre'].forEach(function (k) { if (sp[k].length) { G.Decor.instanced(geo[k](), sp[k], sway[k], false, { tree: true, fade: 0.8, seasonal: seas[k] }); draws += 2; } });
    // street props: one merged mesh + outline
    mer = new DK.Merger();
    var GF = [fenceGeo(0), fenceGeo(1), fenceGeo(0)], GL = lanternGeo(), GW = laundryGeo(), GB = [bikeGeo(C.red), bikeGeo(C.blue), bikeGeo(C.glaze)],
      GJ = [jarsGeo(0), jarsGeo(1), jarsGeo(2)], GK = [basketsGeo(0), basketsGeo(1), basketsGeo(2)], GS = [stoolsGeo(0), stoolsGeo(1), stoolsGeo(2)];
    L.street.forEach(function (p) {
      var cx = p.x + 0.5 - p.pd[0] * 0.28, cz = p.z + 0.5 - p.pd[1] * 0.28, ry, mx, mz;
      ry = p.pd[0] !== 0 ? PI / 2 : 0;   // run parallel to the path
      if (p.k === 'fence') mer.add(GF[p.v], cx, 0, cz, ry, 1);
      else if (p.k === 'lantern') mer.add(GL, cx, 0, cz, Math.atan2(-p.pd[1], p.pd[0]), 1);
      else if (p.k === 'laundry') { mx = (p.x + p.x2) / 2 + 0.5 - p.pd[0] * 0.3; mz = (p.z + p.z2) / 2 + 0.5 - p.pd[1] * 0.3; mer.add(GW, mx, 0, mz, p.pd[0] !== 0 ? PI / 2 * -1 : 0, 1); }
      else if (p.k === 'bike') mer.add(GB[p.v], cx, 0, cz, ry, 1);
      else if (p.k === 'jars') mer.add(GJ[p.v], p.x + 0.5 - p.pd[0] * 0.2 + (p.r - 0.5) * 0.2 * Math.abs(p.pd[1]), 0, p.z + 0.5 - p.pd[1] * 0.2 + (p.r - 0.5) * 0.2 * Math.abs(p.pd[0]), p.r * 6.28, 1);
      else if (p.k === 'baskets') mer.add(GK[p.v], p.x + 0.5 - p.pd[0] * 0.2, 0, p.z + 0.5 - p.pd[1] * 0.2, p.r * 6.28, 1);
      else if (p.k === 'stools') mer.add(GS[p.v], p.x + 0.5 - p.pd[0] * 0.08, 0, p.z + 0.5 - p.pd[1] * 0.08, p.r * 6.28, 1);
    });
    g = mer.geometry();
    if (g) { m = DK.mesh(g, mat, 'village_street', true, true); group.add(m); draws += 2; }
    [GF, GB, GJ, GK, GS].forEach(function (a) { a.forEach(function (x) { x.dispose(); }); }); GL.dispose(); GW.dispose();
    // water: lotus + hyacinth + moored ghe in one static mesh; the drifting ghe is its own mesh
    mer = new DK.Merger();
    L.lotus.forEach(function (p) { var q = lotusGeo(p.seed); mer.add(q, p.x, -0.085, p.z, 0, 1); q.dispose(); });
    L.hyac.forEach(function (p) { var q = hyacGeo(p.seed); mer.add(q, p.x, -0.11, p.z, 0, 1); q.dispose(); });
    if (L.moored) { var bg = boatGeo(0xb8794a, 0xd8453a, true); mer.add(bg, L.moored.x, WY, L.moored.z, Math.atan2(-L.moored.az, L.moored.ax), 1); bg.dispose(); }
    g = mer.geometry();
    if (g) { m = DK.mesh(g, mat, 'village_water', true, true); group.add(m); draws += 2; }
    var drift = null;
    if (L.drift) {
      var dg = boatGeo(0x5f9fc8, 0xf2c14e, false); drift = DK.mesh(dg, mat, 'village_drift_boat', true, true); drift.matrixAutoUpdate = true;   // animated: keep the auto matrix
      drift.position.set(L.drift.x, WY, L.drift.z); drift.rotation.y = L.drift.ry; group.add(drift); draws += 2;
    }
    G.Scenery.group.add(group); V.group = group;
    V.stats = { draws: draws, veg: L.veg.length, street: L.street.length, blocked: L.blocked.length, lotus: L.lotus.length, hyac: L.hyac.length, moored: !!L.moored, drift: !!L.drift };
    // drifting boat: slow circle + rock (no allocations per frame); static on tier 3, throttled on tiers >= 2
    var tt = 0, acc = 0, Pl = G.Player;
    function tier() { return G.Quality && G.Quality.level ? G.Quality.level() : 0; }
    function update(dt) {
      var dx, dz, tr = tier(), ph;
      if (!drift) return;
      if (G.Scenes && G.Scenes.current !== 'outdoor') return;
      drift.visible = tr < 3; if (tr >= 3) return;
      acc += dt; if (tr >= 2 && acc < 1 / 20) return; tt += acc; acc = 0;
      if (Pl && Pl.pos) { dx = Pl.pos.x - L.drift.x; dz = Pl.pos.z - L.drift.z; if (dx * dx + dz * dz > 1600) return; }
      ph = L.drift.ph;
      drift.position.set(L.drift.x + 0.7 * sin(tt * 0.06 + ph), WY + 0.02 * sin(tt * 0.9 + ph), L.drift.z + 0.5 * sin(tt * 0.045 + ph * 1.7));
      drift.rotation.set(0.025 * sin(tt * 0.7 + ph), L.drift.ry + 0.14 * sin(tt * 0.08 + ph), 0.03 * sin(tt * 0.6 + 1));
    }
    if (drift) G.Loop.onFrame(update, 12.4);
  }
  V.build = build;
})();
