/* Togie Valley - land_house.js (Stage 16 G3): "Nâng cấp nhà" service for the Land office. Game.LandHouse.
 * 3 tiers: 1 east wing inside + 2nd window + taller wing, 2 west annex outside + wider interior, 3 porch + deeper room.
 * Paying sets Land tier at once; the new house appears next morning (Day.onStart). While building: stakes + sign + dust at the house.
 * Built tier persists in the `house` save section (field `tier`); paid tier = Game.Land.get('house'). Dev (Land.set outside a purchase) is instant.
 * Exterior = one merged mesh + outline per build (2 draws), site = 3 draws while pending. LAYOUT is verified by tools/house_land_check.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Land || !G.House) { console.error('[landhouse] missing deps'); return; }
  var E = G.Events, LH = G.LandHouse = { built: 0 };

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    center: [9.5, 11.5],              // outdoor house model center (3x3 footprint x8-10, z10-12, door faces +z)
    annex: { tiles: [[7, 10], [7, 11]], tier: 2 },   // tiles blocked by the west annex from tier 2 on
    porchPosts: [[8.7, 13.35], [10.3, 13.35]],       // thin posts beside the door approach (tile 9,13 stays free)
    site: [6.2, 9.6, 11.4, 13.9]                     // construction site rect [x0, z0, x1, z1] around the house
  };
  /*LAYOUT-END*/
  LH.layout = LAYOUT;
  function W() { return G.World; }
  LH.blockedFor = function (b) { return b >= LAYOUT.annex.tier ? LAYOUT.annex.tiles : []; };

  function applyBlocks(b) {
    var w = W(); if (!w || !w.setBlocked) return;
    LAYOUT.annex.tiles.forEach(function (c) { w.setBlocked(c[0], c[1], b >= LAYOUT.annex.tier); });
    if (G.Solids) G.Solids.refresh();
  }
  LH.setBuilt = function (b) {
    b = Math.max(0, Math.min(G.Land.MAX, b | 0));
    if (b === LH.built && G.House.tier === b) { return; }
    LH.built = b; applyBlocks(b); G.House.setTier(b); buildExterior(); refreshSite();
    if (G.Save && G.Save.request) G.Save.request();
  };

  /* ------------------------------------------------------------------ Land service */
  var purchasing = false;
  G.Land.register('house', {
    tiers: [
      { name: 'Căn nhà rộng hơn', cost: 1200, desc: 'Nới thêm một gian phía đông, thêm cửa sổ và ống khói cao. Thi công một đêm.', preview: function (p, n) { LH.preview(p, n); } },
      { name: 'Gian phụ phía tây', cost: 3500, desc: 'Thêm gian phụ bên ngoài, nhà trong rộng gấp đôi ban đầu với cửa sổ mới. Thi công một đêm.', preview: function (p, n) { LH.preview(p, n); } },
      { name: 'Hiên nhà và phòng sâu', cost: 8000, desc: 'Thêm hiên có mái che trước cửa và kéo dài căn phòng về phía trước. Thi công một đêm.', preview: function (p, n) { LH.preview(p, n); } }
    ],
    canApply: function (n) {
      if (LH.built < G.Land.get('house')) return 'Chú Tâm đang thi công, sáng mai bạn quay lại nhé!';
      return true;
    },
    apply: function () { purchasing = true; return true; }
  });
  E.on('land:changed', function (e) {
    if (!e || e.service !== 'house') return;
    if (purchasing) { purchasing = false; refreshSite(); return; }
    LH.setBuilt(e.tier);   // dev tools / internal: instant
  });
  if (G.Day && G.Day.onStart) G.Day.onStart(16, function () {
    var t = G.Land.get('house');
    if (LH.built >= t) return;
    LH.setBuilt(t); burst();
    if (G.House.addSummaryLine) G.House.addSummaryLine('Nhà đã xây xong, vào xem gian mới nào!', 'sprout');
    
  });
  E.on('save:loaded', function () {
    var paid = G.Land.get('house'), b = Math.min(G.House.tier || 0, paid);
    LH.built = -1; LH.setBuilt(b); refreshSite();
  });
  E.on('save:reset', function () { LH.built = -1; LH.setBuilt(0); });

  /* ------------------------------------------------------------------ preview (small canvas: house plan of the tier + outdoor note) */
  LH.preview = function (parent, n) {
    var HM = G.HouseMap, t = Math.min(n, 3), S = 24, W0 = HM.TIERS[t][0], D0 = HM.TIERS[t][1], c = document.createElement('canvas'), g, x, z, ow = HM.TIERS[0][0], od = HM.TIERS[0][1];
    if (!c.getContext) return;
    var old = { rows: HM.rows, w: HM.width, d: HM.depth, spots: HM.spots, sp: HM.spawns, tier: HM.tier };
    HM.setTier(t); var rows = HM.rows.slice(); HM.setTier(old.tier);
    c.width = 13 * S + 8; c.height = 8 * S + 8; g = c.getContext('2d');
    c.style.cssText = 'display:block;margin:8px auto;max-width:100%;border:2px solid #8c5a34;border-radius:8px;background:#fff1d0';
    var col = { '.': '#e8c58f', r: '#e8715d', B: '#7fb6e8', K: '#c98b4f', O: '#5a4a52', C: '#c98b4f', T: '#c98b4f', D: '#8c5a34', P: '#6fb35a' };
    for (z = 0; z < D0; z++) for (x = 0; x < W0; x++) {
      g.fillStyle = col[rows[z].charAt(x)] || '#e8c58f'; g.fillRect(4 + x * S, 4 + z * S, S - 1, S - 1);
      if (x >= ow || z >= od) { g.fillStyle = 'rgba(255,170,40,0.55)'; g.fillRect(4 + x * S, 4 + z * S, S - 1, S - 1); }
    }
    g.strokeStyle = '#d2691e'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(4 + 1, 4 + 1, W0 * S - 3, D0 * S - 3);
    parent.appendChild(c);
    var cap = document.createElement('div'); cap.className = 'land-req'; cap.textContent = 'Mặt bằng trong nhà (' + W0 + 'x' + D0 + '). Phần màu cam là diện tích mới.'; parent.appendChild(cap);
  };

  /* ------------------------------------------------------------------ exterior (merged mesh + outline) */
  var group = null, ext = null, siteMesh = null, board = null, puffs = null, PN = 10, P = [], dummy = null, burstT = 0, BOX = null;
  function pt(L, w, h, d, c, x, y, z, ry, rz) { L.push(G.Models.part(BOX, c, [x, y, z], [0, ry || 0, rz || 0], [w, h, d])); }
  function buildExterior() {
    if (!group) return;
    if (ext) { group.remove(ext); ext.geometry.dispose(); ext = null; }
    var b = LH.built; if (b <= 0) return;
    var cx = LAYOUT.center[0], cz = LAYOUT.center[1], L = [], wall = 0xf3e2c0, wood = 0x7a4a2b, glass = 0x9fd3e6, roof = 0xc4573a, stone = 0x9a8a7a;
    // tier 1: a window on the east wall + flower box under the front windows
    pt(L, 0.06, 0.55, 0.62, wood, cx + 1.31, 1.1, cz + 0.1); pt(L, 0.08, 0.43, 0.5, glass, cx + 1.33, 1.1, cz + 0.1);
    pt(L, 0.7, 0.14, 0.16, 0xc98b4f, cx - 0.85, 0.72, cz + 1.42); pt(L, 0.6, 0.1, 0.12, 0xe8715d, cx - 0.85, 0.82, cz + 1.42);
    if (b >= 2) {   // tier 2: west annex on tiles (7,10),(7,11) with a lean-to roof and a window
      var ax = 7.6, az = 11.0;
      pt(L, 1.3, 1.1, 1.9, wall, ax, 0.55, az); pt(L, 1.4, 0.2, 2.0, 0xb9b0a4, ax, 0.1, az);
      pt(L, 1.6, 0.12, 2.15, roof, ax - 0.1, 1.28, az, 0, 0.22);
      pt(L, 0.06, 0.5, 0.7, wood, ax - 0.66, 0.7, az); pt(L, 0.08, 0.38, 0.58, glass, ax - 0.68, 0.7, az);
    }
    if (b >= 3) {   // tier 3: porch canopy + posts + lantern + flower pots (door approach tile stays free)
      LAYOUT.porchPosts.forEach(function (p) { pt(L, 0.1, 1.5, 0.1, 0x8c5a34, p[0], 0.75, p[1]); pt(L, 0.3, 0.3, 0.3, 0xe8715d, p[0], 0.16, p[1] + 0.25); pt(L, 0.26, 0.2, 0.26, 0x6fb35a, p[0], 0.4, p[1] + 0.25); });
      pt(L, 2.3, 0.12, 0.9, roof, cx, 1.62, 13.0, 0, 0); pt(L, 2.1, 0.08, 0.1, 0x8c5a34, cx, 1.5, 13.4);
      pt(L, 0.14, 0.2, 0.14, 0xffd166, cx, 1.35, 13.4);
    }
    ext = new THREE.Mesh(G.Models.mergeParts(L), G.Models.material('prop')); ext.name = 'land_house_ext';
    G.Render.addOutline(ext, true, true); group.add(ext);
  }

  /* ------------------------------------------------------------------ site visuals (stakes, sign, dust) */
  function refreshSite() {
    if (!group) return;
    var pending = LH.built < G.Land.get('house');
    group.children.forEach(function (c) { if (c === siteMesh || c === board) c.visible = pending; });
    if (puffs) puffs.visible = pending || burstT > 0;
  }
  function burst() { burstT = 2.6; if (puffs) puffs.visible = true; }
  function tick(dt) {
    if (!puffs || !puffs.visible) return;
    var i, p, u, sc, s = LAYOUT.site;
    if (burstT > 0) { burstT -= dt; if (burstT <= 0 && LH.built >= G.Land.get('house')) { puffs.visible = false; return; } }
    for (i = 0; i < PN; i++) {
      p = P[i]; p.t += dt * (burstT > 0 ? 1.8 : 1); if (p.t >= 1) { p.t = 0; p.x = s[0] + 0.4 + Math.random() * (s[2] - s[0] - 0.8); p.z = s[1] + 0.4 + Math.random() * (s[3] - s[1] - 0.8); }
      u = p.t; sc = Math.sin(u * Math.PI) * (0.35 + 0.25 * (i % 3) * 0.5);
      dummy.position.set(p.x, 0.15 + u * 0.9, p.z); dummy.scale.set(sc, sc * 0.8, sc); dummy.updateMatrix(); puffs.setMatrixAt(i, dummy.matrix);
    }
    puffs.instanceMatrix.needsUpdate = true;
  }
  function makeBoard() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 96; var g = c.getContext('2d');
    g.fillStyle = '#e0a868'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#6b4a32'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
    g.fillStyle = '#4a2f1e'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Đang xây dựng', 128, 40); g.font = 'bold 24px sans-serif'; g.fillText('Mai xong nhé!', 128, 72);
    return new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide }));
  }
  LH.build = function () {
    if (group || typeof THREE === 'undefined' || !G.Decor || !G.Decor.group || !G.Models || !G.Render) return;
    BOX = new THREE.BoxGeometry(1, 1, 1);
    group = new THREE.Group(); group.name = 'land_house'; G.Decor.group.add(group);
    var s = LAYOUT.site, L = [], i;
    [[s[0], s[1]], [s[2], s[1]], [s[0], s[3]], [s[2], s[3]]].forEach(function (p) { pt(L, 0.1, 0.7, 0.1, 0xc98b4f, p[0], 0.35, p[1]); pt(L, 0.14, 0.08, 0.14, 0xe8715d, p[0], 0.72, p[1]); });
    for (i = 0; i < 3; i++) pt(L, 1.0, 0.07, 0.05, i % 2 ? 0xffd166 : 0x6b4a32, 6.9, 0.12 + i * 0.07, 13.4);   // plank pile
    pt(L, 0.08, 0.9, 0.08, 0x8c5a34, 6.4, 0.45, 13.4); pt(L, 0.08, 0.9, 0.08, 0x8c5a34, 7.4, 0.45, 13.4);
    siteMesh = new THREE.Mesh(G.Models.mergeParts(L), G.Models.material('prop')); siteMesh.name = 'land_house_site'; G.Render.addOutline(siteMesh, true); group.add(siteMesh);
    board = makeBoard(); board.position.set(6.9, 1.15, 13.43); group.add(board);
    puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xe9dcc0 }), PN);
    puffs.name = 'land_house_dust'; puffs.visible = false; puffs.frustumCulled = false; group.add(puffs);
    dummy = new THREE.Object3D(); for (i = 0; i < PN; i++) P.push({ t: i / PN, x: 0, z: 0 });
    if (G.Loop && G.Loop.onFrame) G.Loop.onFrame(function (dt) { tick(dt); }, 10.8);
    buildExterior(); refreshSite();
  };
})();
