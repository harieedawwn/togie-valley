/* Togie Valley - land_farm.js (Stage 16 G2): "Mở rộng đất" service for the Land office. Game.LandFarm.
 * 3 tiers enlarge the tillable field into free grass/sand: north strip, west strip, east strip (pure LAYOUT below, verified by tools/farm_land_check.js).
 * Paying sets Land tier at once; the soil appears next morning (Day.onStart). While building: stakes + sign + dust puffs at the site.
 * Built tier persists in the `farm` save section (field `land`); paid tier = Game.Land.get('farm'). Dev (Land.set outside a purchase) builds instantly.
 * Fence edges (shared by Decor.fenceList and FarmLook), plot signs and the west lip follow the field edge. Added draw calls: 3 while a site is active. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Land) { console.error('[landfarm] missing deps'); return; }
  var E = G.Events, LF = G.LandFarm = { built: 0 }, DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    // tier rects [x0, z0, x1, z1] inclusive, minus skip tiles (shed, bin, trough)
    tiers: [
      { rect: [13, 6, 26, 7], skip: [[19, 6], [20, 6], [19, 7], [20, 7]] },
      { rect: [11, 6, 12, 17], skip: [[11, 12], [11, 17], [12, 13]] },
      { rect: [27, 6, 28, 17], skip: [[28, 17]] }
    ],
    signs0: [[12, 14], [27, 14]],                 // original plot signs (west, east)
    signsW: [10, 14], signsE: [29, 13],           // sign tiles once the west (tier 2) / east (tier 3) strips are built
    lip0: [12.93, 11, 13, 17], lipW: [10.93, 6, 11, 17],
    view: [8, 3, 31, 20]                          // preview map window [x0, z0, x1, z1) tiles
  };
  /*LAYOUT-END*/
  LF.layout = LAYOUT;

  function tilesOf(n) {
    var t = LAYOUT.tiers[n - 1], out = [], x, z, sk = {};
    if (!t) return out;
    t.skip.forEach(function (s) { sk[s[0] + ',' + s[1]] = 1; });
    for (z = t.rect[1]; z <= t.rect[3]; z++) for (x = t.rect[0]; x <= t.rect[2]; x++) if (!sk[x + ',' + z]) out.push([x, z]);
    return out;
  }
  LF.tilesOf = tilesOf;
  function expSet(b) { var s = {}, n; for (n = 1; n <= b; n++) tilesOf(n).forEach(function (c) { s[c[0] + ',' + c[1]] = n; }); return s; }
  LF.expSet = expSet;
  LF.signsFor = function (b) { return [b >= 2 ? LAYOUT.signsW : LAYOUT.signs0[0], b >= 3 ? LAYOUT.signsE : LAYOUT.signs0[1]]; };
  LF.lipFor = function (b) { return (b >= 2 ? LAYOUT.lipW : LAYOUT.lip0).slice(); };
  // Fence edges [{x,z,i}] (i indexes DIRS) around locked plots and the built strips. tt(x,z) -> tile type, blocked(x,z) -> bool, W/H map size.
  LF.edges = function (b, tt, blocked, W, H) {
    var es = expSet(b), out = [], x, z, i, d, nx, nz, t, nt;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      t = tt(x, z); if (t !== 'locked' && !es[x + ',' + z]) continue;
      for (i = 0; i < 4; i++) {
        d = DIRS[i]; nx = x + d[0]; nz = z + d[1]; nt = tt(nx, nz);
        if (nt === 'locked' || es[nx + ',' + nz]) continue;
        if (t !== 'locked' && (nt !== 'grass' && nt !== 'sand' || blocked(nx, nz))) continue;   // strips: no fence along soil, paths, water, buildings, props
        out.push({ x: x, z: z, i: i });
      }
    }
    return out;
  };

  /* ------------------------------------------------------------------ world state */
  var orig = null, purchasing = false, sit = null;
  function W() { return G.World; }
  function tt(x, z) { return W().tileType(x + 0.5, z + 0.5); }
  LF.fenceEdges = function () { var w = W(); return LF.edges(LF.built, tt, w.isBlocked, w.W, w.H); };
  function allTiles() { var a = [], n; for (n = 1; n <= G.Land.MAX; n++) a = a.concat(tilesOf(n)); return a; }
  function refreshLook() {
    var w = W(), FL = G.FarmLook, sg = LF.signsFor(LF.built), old = FL && FL.layout ? FL.layout.signs : LAYOUT.signs0;
    var WL = G.Farm && G.Farm.WELL;
    old.forEach(function (s) { if (!(WL && s[0] === WL.tx && s[1] === WL.tz)) w.setBlocked(s[0], s[1], false); });   // tile (12,14) is also the well: never unblock it
    if (FL && FL.layout) { FL.layout.signs = sg.map(function (s) { return [s[0], s[1]]; }); FL.layout.lip = LF.lipFor(LF.built); }
    if (G.Decor && G.Decor.refreshFences) G.Decor.refreshFences();   // rebuilds fences + FarmLook (signs, lip, border flowers)
  }
  // Make exactly tiers 1..b real soil (b 0..3). Idempotent; instant.
  LF.setBuilt = function (b) {
    var w = W(); b = Math.max(0, Math.min(G.Land.MAX, b | 0));
    if (!w || !w.setTile || b === LF.built) return;
    if (!orig) { orig = {}; allTiles().forEach(function (c) { orig[c[0] + ',' + c[1]] = tt(c[0], c[1]); }); }
    var shrink = b < LF.built, n, es = expSet(b);
    allTiles().forEach(function (c) { var k = c[0] + ',' + c[1]; w.setTile(c[0], c[1], es[k] ? 'soil' : (orig[k] === 'sand' ? 'sand' : 'grass'), true); });
    LF.built = b; w.rebake();
    if (shrink && G.Farm && G.Farm.pruneInvalid) G.Farm.pruneInvalid();
    refreshLook(); refreshSite();
    if (G.Solids) G.Solids.refresh();
    if (G.Save && G.Save.request) G.Save.request();
  };

  /* ------------------------------------------------------------------ Land service */
  function siteOf(n) { var t = tilesOf(n), x0 = 99, z0 = 99, x1 = -1, z1 = -1; t.forEach(function (c) { x0 = Math.min(x0, c[0]); z0 = Math.min(z0, c[1]); x1 = Math.max(x1, c[0]); z1 = Math.max(z1, c[1]); }); return { x0: x0, z0: z0, x1: x1 + 1, z1: z1 + 1, tiles: t }; }
  LF.siteOf = siteOf;
  function freeNow(n) {
    var w = W(); return tilesOf(n).every(function (c) { var t = tt(c[0], c[1]); return (t === 'grass' || t === 'sand') && !w.isBlocked(c[0], c[1]); });
  }
  G.Land.register('farm', {
    tiers: [
      { name: 'Mảnh đất phía bắc', cost: 1500, desc: 'Mở thêm hai hàng đất ở phía bắc ruộng. Thi công một đêm, sáng mai là có đất mới.', preview: function (p, n) { LF.preview(p, n); } },
      { name: 'Dải đất phía tây', cost: 4000, desc: 'Thêm một dải đất ngay phía tây ruộng, hàng rào dời ra mép mới. Thi công một đêm.', preview: function (p, n) { LF.preview(p, n); } },
      { name: 'Dải đất phía đông', cost: 9000, desc: 'Mở rộng tới sát hồ ở phía đông, bảng chỉ dẫn dời ra rìa ruộng. Thi công một đêm.', preview: function (p, n) { LF.preview(p, n); } }
    ],
    canApply: function (n) {
      if (LF.built < G.Land.get('farm')) return 'Chú Tâm đang thi công, sáng mai bạn quay lại nhé!';
      if (!freeNow(n)) return 'Mảnh đất này đang có vật cản, chưa mở rộng được.';
      return true;
    },
    apply: function (n) { purchasing = true; return true; }
  });
  E.on('land:changed', function (e) {
    if (!e || e.service !== 'farm') return;
    if (purchasing) { purchasing = false; refreshSite(); return; }
    LF.setBuilt(e.tier);   // dev tools / internal: instant
  });
  if (G.Day && G.Day.onStart) G.Day.onStart(15, function () {
    var t = G.Land.get('farm');
    if (LF.built >= t) return;
    var site = siteOf(t); LF.setBuilt(t); burst(site);
    if (G.House && G.House.addSummaryLine) G.House.addSummaryLine('Đất mới đã xây xong, ra ruộng xem nào!', 'sprout');
    
  });
  E.on('save:loaded', function () { if (LF.built > G.Land.get('farm')) LF.setBuilt(G.Land.get('farm')); else refreshSite(); });

  /* ------------------------------------------------------------------ preview map (canvas) */
  LF.preview = function (parent, n) {
    var rows = G.WorldMap && G.WorldMap.rows, v = LAYOUT.view, S = 11, c = document.createElement('canvas'), g, x, z, es = expSet(n), col, ch, k;
    if (!rows || !c.getContext) return;
    c.width = (v[2] - v[0]) * S; c.height = (v[3] - v[1]) * S; g = c.getContext('2d');
    c.style.cssText = 'display:block;margin:8px auto;max-width:100%;border:2px solid #8c5a34;border-radius:8px;background:#fff1d0';
    var base = { '.': '#a9d98a', '=': '#e6c48f', t: '#a8774a', l: '#c9a06a', '~': '#8cc8e8', p: '#c98b4f', ',': '#f5e6ae', o: '#c9c2b0' };
    for (z = v[1]; z < v[3]; z++) for (x = v[0]; x < v[2]; x++) {
      ch = (rows[z] || '').charAt(x) || '.'; col = base[ch] || '#b9b0a4';
      g.fillStyle = col; g.fillRect((x - v[0]) * S, (z - v[1]) * S, S, S);
      k = x + ',' + z;
      if (es[k]) { g.fillStyle = es[k] === n ? 'rgba(255,170,40,0.85)' : '#a8774a'; g.fillRect((x - v[0]) * S, (z - v[1]) * S, S, S); }
    }
    g.strokeStyle = '#d2691e'; g.lineWidth = 2; g.setLineDash([4, 3]);
    var s = siteOf(n); g.strokeRect((s.x0 - v[0]) * S + 1, (s.z0 - v[1]) * S + 1, (s.x1 - s.x0) * S - 2, (s.z1 - s.z0) * S - 2);
    parent.appendChild(c);
    var cap = document.createElement('div'); cap.className = 'land-req'; cap.textContent = 'Khung cam: vùng đất mới'; parent.appendChild(cap);
  };

  /* ------------------------------------------------------------------ site visuals (stakes, sign, dust puffs) */
  var group = null, puffs = null, boardMesh = null, siteBox = null, burstT = 0, PN = 10, P = [], dummy = null;
  function refreshSite() {
    if (!group) return;
    var t = G.Land.get('farm'), pending = LF.built < t;
    group.visible = pending; if (!pending) { siteBox = null; if (burstT <= 0) puffs.visible = false; return; }
    var s = siteOf(t); siteBox = s; puffs.visible = true; layoutSite(s);
  }
  function layoutSite(s) {
    var Mo = G.Models, R = G.Render, L = [], i, BOX = layoutSite.box || (layoutSite.box = new THREE.BoxGeometry(1, 1, 1));
    function bx(w, h, d, c, x, y, z) { L.push(Mo.part(BOX, c, [x, y, z], [0, 0, 0], [w, h, d])); }
    [[s.x0 + 0.1, s.z0 + 0.1], [s.x1 - 0.1, s.z0 + 0.1], [s.x0 + 0.1, s.z1 - 0.1], [s.x1 - 0.1, s.z1 - 0.1]].forEach(function (p) { bx(0.1, 0.7, 0.1, 0xc98b4f, p[0], 0.35, p[1]); bx(0.14, 0.08, 0.14, 0xe8715d, p[0], 0.72, p[1]); });
    var cx = (s.x0 + s.x1) / 2, cz = s.z1 - 0.2;
    bx(0.08, 0.9, 0.08, 0x8c5a34, cx - 0.5, 0.45, cz); bx(0.08, 0.9, 0.08, 0x8c5a34, cx + 0.5, 0.45, cz);
    for (i = 0; i < 3; i++) bx(1.0, 0.07, 0.05, i % 2 ? 0xffd166 : 0x6b4a32, cx, 0.12 + i * 0.07, cz + 0.06);   // small plank pile
    if (LF.mesh) { LF.mesh.parent.remove(LF.mesh); LF.mesh.geometry.dispose(); }
    var m = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); m.name = 'land_farm_site'; R.addOutline(m, true, true); group.add(m); LF.mesh = m;
    boardMesh.position.set(cx, 1.15, cz + 0.02);
  }
  function makeBoard() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 96; var g = c.getContext('2d');
    g.fillStyle = '#e0a868'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#6b4a32'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
    g.fillStyle = '#4a2f1e'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Đang xây dựng', 128, 40); g.font = 'bold 24px sans-serif'; g.fillText('Mai xong nhé!', 128, 72);
    var tex = new THREE.CanvasTexture(c);
    return new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  }
  function burst(s) { if (!puffs) return; siteBox = s; burstT = 2.6; puffs.visible = true; }
  function tickPuffs(dt) {
    if (!puffs || !puffs.visible || !siteBox) return;
    var i, p, u, sc, s = siteBox;
    if (burstT > 0) { burstT -= dt; if (burstT <= 0 && !group.visible) { puffs.visible = false; return; } }
    for (i = 0; i < PN; i++) {
      p = P[i]; p.t += dt * (burstT > 0 ? 1.8 : 1); if (p.t >= 1) { p.t = 0; p.x = s.x0 + 0.4 + Math.random() * (s.x1 - s.x0 - 0.8); p.z = s.z0 + 0.4 + Math.random() * (s.z1 - s.z0 - 0.8); }
      u = p.t; sc = Math.sin(u * Math.PI) * (0.35 + 0.25 * (i % 3) * 0.5);
      dummy.position.set(p.x, 0.15 + u * 0.8, p.z); dummy.scale.set(sc, sc * 0.8, sc); dummy.updateMatrix(); puffs.setMatrixAt(i, dummy.matrix);
    }
    puffs.instanceMatrix.needsUpdate = true;
  }
  LF.build = function () {
    if (group || typeof THREE === 'undefined' || !G.Decor || !G.Decor.group || !G.Models || !G.Render) return;
    group = new THREE.Group(); group.name = 'land_farm'; group.visible = false; G.Decor.group.add(group);
    boardMesh = makeBoard(); group.add(boardMesh);
    puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xe9dcc0 }), PN);
    puffs.name = 'land_farm_dust'; puffs.visible = false; puffs.frustumCulled = false; G.Decor.group.add(puffs);
    dummy = new THREE.Object3D(); for (var i = 0; i < PN; i++) P.push({ t: i / PN, x: 0, z: 0 });
    if (G.Loop && G.Loop.onFrame) G.Loop.onFrame(function (dt) { tickPuffs(dt); }, 10.9);
    refreshSite();
  };
})();
