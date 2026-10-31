/* Togie Valley - furniture_shop.js (Stage 16 H1a): "Tiệm nội thất" building, shopkeeper "Cô Lụa", shop panel.
 * Visuals: pastel cottage with striped awning, sign, display sofa/lamp/pot on the porch, welcome rug (1 merged mesh + outline, sign plane, NPC => about +15 draws).
 * Interactable `furnishop` -> event `interact:furnishop` -> dialogue -> panel (tabs, grid, preview, buy). Decor goes to Game.Furniture inventory. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Furniture || !G.State || !G.Kit) { console.error('[furnishop] missing deps'); return; }
  var E = G.Events, F = G.Furniture;
  var FS = G.FurnitureShop = { group: null, npc: null, stats: null, ready: false, layout: null, standTile: null };

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    ext: [36, 44, 43, 49],                                  // visual footprint [x0, z0, x1, z1] tiles (exclusive max)
    house: [37, 44, 42, 46],                                // cottage footprint (blocked)
    blocked: [[37, 44], [38, 44], [39, 44], [40, 44], [41, 44], [37, 45], [38, 45], [39, 45], [40, 45], [41, 45], [37, 46], [40, 46], [41, 46], [42, 46]],   // cottage, lamp display, NPC, sofa display
    npc: [40, 46], stand: [40, 47], door: [38, 46]
  };
  /*LAYOUT-END*/
  FS.layout = LAYOUT; FS.standTile = { tx: LAYOUT.stand[0], tz: LAYOUT.stand[1], facing: 'n' };

  /* ------------------------------------------------------------------ panel (DOM only) */
  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  var PLACE = { floor: 'Đặt trong nhà', wall: 'Treo tường', yard: 'Đặt ngoài sân', any: 'Trong nhà hoặc sân' };
  function openPanel() {
    var UI = G.UI, S = G.State, Kit = G.Kit, cat = F.CATS[0].id, sel = F.byCat(cat)[0].id;
    var k = Kit.panel({ title: 'Tiệm nội thất', coin: true, cls: 'kp-tall kp-furn', detail: true }), grid = el('div', 'kp-grid', k.list);
    var tabUi = Kit.tabs(F.CATS.map(function (c) { return { id: c.id, label: c.name }; }), cat, function (id) {
      cat = id; var l = F.byCat(cat); if (!sel || F.get(sel).cat !== cat) sel = l[0].id; render();
    });
    k.tabs.appendChild(tabUi.el);
    if (G.Placement) k.bar.appendChild(Kit.btn('Trang trí', 'secondary', function () { UI.closePanel(); G.Placement.open(); }));
    var buy = Kit.btn('', 'primary', function () {
      var it = F.get(sel), r = F.buy(sel); if (!it) return;
      if (r.ok) { UI.sfx('pop'); if (G.Audio && G.Audio.sfx) try { G.Audio.sfx('coin'); } catch (e) {} } else { UI.sfx('blip'); UI.toast(r.reason || 'Chưa mua được.', 'warn'); }
      render();
    });
    buy.classList.add('kp-main-btn'); k.bar.appendChild(buy);
    function renderPrev() {
      var it = sel && F.get(sel), sz, n; if (!it) return;
      sz = it.d ? it.w + ' x ' + it.d + ' ô' : '';
      n = F.count(it.id);
      k.detail.innerHTML = '<div class="kp-d-ico">' + F.icon(it.id, 96) + '</div><div class="kp-d-info"><div class="kp-d-name"></div><div class="kp-d-tip"></div><div class="kp-d-meta"></div></div>';
      k.detail.querySelector('.kp-d-name').textContent = it.name; k.detail.querySelector('.kp-d-tip').textContent = it.tip;
      k.detail.querySelector('.kp-d-meta').textContent = PLACE[it.place] + (sz ? ' · ' + sz : '') + (n ? ' · Đang có: ' + n : '');
      buy.disabled = false; buy.classList.toggle('poor', S.money < it.price);
      buy.innerHTML = Kit.coin(it.price, 24) + '<span>Mua</span>';
    }
    function render() {
      var keep = k.list.scrollTop;
      k.setCoin(S.money); grid.innerHTML = '';
      F.byCat(cat).forEach(function (it) {
        var c = el('button', 'kp-cell' + (it.id === sel ? ' on' : '') + (S.money < it.price ? ' poor' : ''), grid), n = F.count(it.id); c.type = 'button';
        el('div', 'kp-ci', c, F.icon(it.id, 56)); el('div', 'kp-cn', c).textContent = it.name; el('div', 'kp-cp', c, Kit.coin(it.price, 16));
        if (n) el('div', 'kp-own', c).textContent = n;
        c.addEventListener('click', function () { UI.sfx('tap'); sel = it.id; render(); });
      });
      renderPrev(); k.list.scrollTop = keep;
    }
    var off = E.on('state:changed', function (e) { if (e && e.key === 'money') render(); });
    k.open({ onClose: function () { if (off) off(); if (G.Save.request) G.Save.request(); } });
    render();
  }
  FS.open = openPanel;
  var LINES = [
    ['Chào bạn! Mời vào xem đồ nội thất xinh của tiệm cô nhé.', 'Mua về là có sẵn trong túi đồ trang trí của bạn đấy.'],
    ['Ô, khách quen đây rồi! Hôm nay có ghế mới về nè.', 'Cứ xem thoải mái, thích món nào cô gói ngay.'],
    ['Nhà đẹp là tại mình chọn đồ khéo đấy.', 'Một chậu cây nhỏ thôi cũng làm góc nhà tươi hẳn.']
  ];
  E.on('interact:furnishop', function () {
    var w = G.Time && G.Time.weather, ln = LINES[Math.floor(Math.random() * LINES.length)];
    if (w === 'rain') ln = ['Trời mưa mà bạn vẫn ghé, cô pha trà cho ấm nhé.', 'Mưa thế này ở nhà bày biện nội thất là nhất.'];
    else if (w === 'snow') ln = ['Tuyết rơi lạnh quá, vào tiệm cho ấm bạn ơi.', 'Một tấm thảm dày hay chiếc ghế bành sẽ hợp mùa này lắm.'];
    G.UI.dialog({ name: 'Cô Lụa', voice: 'smith', lines: ln, onDone: function () { openPanel(); } });
  });

  /* ------------------------------------------------------------------ 3D build (skipped in node / without renderer) */
  if (typeof THREE === 'undefined' || !G.Render || !G.Models || !G.World) { return; }
  var R = G.Render, Mo = G.Models, W = G.World;
  var C = { cream: 0xf4e9d2, wall: 0xcfe6df, wall2: 0xb4d6cd, dark: 0x8c5a34, dark2: 0x6b4a32, wood: 0xc98b4f, wood2: 0xd9a066, stone: 0xb7b2a6, stone2: 0x9a958b, roof: 0x6fa08f, roof2: 0x85b5a3,
    glass: 0x9fd3e6, red: 0xd9825b, cream2: 0xfff8ea, gold: 0xffd166, green: 0x5fb86a, sand: 0xd8c08a, sand2: 0xcdb27a, pink: 0xf2a1b3, yellow: 0xffd166 };
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8), SPH = new THREE.SphereGeometry(0.5, 8, 6), PI = Math.PI, seed = 4242;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function bx(L, w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOX, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function sp(L, r, c, x, y, z, sy) { L.push(Mo.part(SPH, c, [x, y, z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function cy(L, r, h, c, x, y, z) { L.push(Mo.part(CYL, c, [x, y, z], [0, 0, 0], [r * 2, h, r * 2])); }
  function flowers(L, x, z, n, w) { var i, pet = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2]; for (i = 0; i < n; i++) sp(L, 0.035 + rnd() * 0.02, pet[(rnd() * 4) | 0], x + (rnd() - 0.5) * w, 0.08 + rnd() * 0.05, z + (rnd() - 0.5) * w); sp(L, 0.1, C.green, x, 0.04, z, 0.5); }
  var SH = { box: BOX, cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), tap: new THREE.CylinderGeometry(0.3, 0.5, 1, 10), sph: new THREE.SphereGeometry(0.5, 10, 7) };
  function addModel(L, id, ox, oy, oz) {   // shop-window display: a catalog model, offset only (no rotation)
    var key = { b: SH.box, c: SH.cyl, k: SH.tap, s: SH.sph };
    F.parts(id).forEach(function (q) { L.push(Mo.part(key[q[0]], q[1], [q[2] + ox, q[3] + oy, q[4] + oz], [q[8], q[9], q[10]], [q[5], q[6], q[7]])); });
  }
  function statics(L) {
    var i, x, z;
    // porch path + welcome rug
    [[38, 46], [38, 47], [39, 47], [40, 47], [41, 47], [37, 47], [36, 47]].forEach(function (t) { bx(L, 0.94, 0.05, 0.94, (t[0] + t[1]) % 2 ? C.sand : C.sand2, t[0] + 0.5, 0.025, t[1] + 0.5, 0, (rnd() - 0.5) * 0.08, 0); });
    // cottage: stone plinth, mint walls, timber posts, door, big display window
    bx(L, 5.3, 0.2, 2.3, C.stone2, 39.5, 0.1, 45);
    bx(L, 5.0, 2.1, 2.0, C.wall, 39.5, 1.25, 45);
    for (i = 0; i < 6; i++) bx(L, 0.14, 2.1, 0.14, C.dark, 37.03 + i * 0.99, 1.25, 45.98);
    bx(L, 5.0, 0.12, 0.14, C.dark, 39.5, 2.3, 45.98); bx(L, 5.0, 0.1, 0.14, C.dark, 39.5, 0.34, 45.98);
    bx(L, 0.14, 2.1, 2.0, C.dark, 37.03, 1.25, 45); bx(L, 0.14, 2.1, 2.0, C.dark, 41.97, 1.25, 45);
    bx(L, 0.8, 1.5, 0.08, C.wood2, 38.5, 0.95, 46.02); bx(L, 0.92, 0.08, 0.1, C.dark, 38.5, 1.74, 46.03); sp(L, 0.04, C.gold, 38.78, 0.95, 46.08);
    bx(L, 0.5, 0.5, 0.04, C.wall2, 38.5, 1.3, 46.06); bx(L, 0.34, 0.34, 0.05, C.glass, 38.5, 1.3, 46.07);
    bx(L, 2.1, 1.2, 0.07, C.dark, 40.9, 1.2, 46.03); bx(L, 1.94, 1.04, 0.08, C.glass, 40.9, 1.2, 46.04); bx(L, 0.05, 1.04, 0.09, C.dark, 40.9, 1.2, 46.05); bx(L, 1.94, 0.05, 0.09, C.dark, 40.9, 1.2, 46.05);
    bx(L, 2.2, 0.08, 0.2, C.wood, 40.9, 0.56, 46.13);
    // tiny window display (behind glass): lamp + clock on the sill
    addModel(L, 'lamp_table', 40.35, 0.6, 46.12); sp(L, 0.12, C.pink, 41.35, 0.72, 46.12, 0.9);
    // striped awning over door and window (alternating red/cream)
    for (i = 0; i < 10; i++) bx(L, 0.5, 0.05, 0.6, i % 2 ? C.cream2 : C.red, 37.25 + i * 0.5, 1.9, 46.3, 0.5, 0, 0);
    for (i = 0; i < 10; i++) sp(L, 0.25, i % 2 ? C.cream2 : C.red, 37.25 + i * 0.5, 1.7, 46.55, 0.45);
    // roof (ridge along x), eaves
    bx(L, 5.6, 0.1, 1.5, C.roof, 39.5, 2.9, 45.6, 0.56, 0, 0); bx(L, 5.6, 0.1, 1.5, C.roof2, 39.5, 2.9, 44.4, -0.56, 0, 0); bx(L, 5.6, 0.1, 0.14, C.dark2, 39.5, 3.28, 45);
    for (i = 0; i < 3; i++) { bx(L, 0.1, 0.26, 1.9 - i * 0.65, C.wall, 37.05, 2.4 + i * 0.26, 45); bx(L, 0.1, 0.26, 1.9 - i * 0.65, C.wall, 41.95, 2.4 + i * 0.26, 45); }
    // side plant boxes + lantern at the door
    bx(L, 0.5, 0.14, 0.2, C.wood, 37.55, 0.8, 46.12); flowers(L, 37.55, 46.13, 4, 0.4);
    // display on tile (37,46): floor lamp + small pot; (41,46)-(42,46): sofa; rugs on the path side
    addModel(L, 'lamp_floor', 37.35, 0, 46.55); addModel(L, 'pot_small', 37.75, 0, 46.7);
    addModel(L, 'sofa', 42.0, 0, 46.52); addModel(L, 'rug_round', 39.0, 0.0, 48.1);
    addModel(L, 'plant_tall', 36.55, 0, 45.4); addModel(L, 'stool', 36.6, 0, 46.3);
    flowers(L, 42.55, 44.5, 5, 0.6); flowers(L, 36.4, 44.4, 4, 0.5); sp(L, 0.2, C.stone, 42.4, 0.1, 47.6, 0.6);
  }
  function mesh(L, name) { var m = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); m.name = name; R.addOutline(m, true, true); return m; }
  function paintSign(cv, text) {
    var g = cv.getContext('2d'); g.fillStyle = '#6fa08f'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#6b4a32'; g.lineWidth = 6; g.strokeRect(3, 3, cv.width - 6, cv.height - 6);
    g.fillStyle = '#fff1d0'; g.font = '800 28px "Baloo 2", "Google Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cv.width / 2, cv.height / 2 + 2);
  }
  function sign() {
    var cv = document.createElement('canvas'), text = 'TIỆM NỘI THẤT'; cv.width = 256; cv.height = 64; paintSign(cv, text);
    var tex = new THREE.CanvasTexture(cv), m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(39.5, 2.2, 46.06); m.name = 'furni_sign'; FS.group.add(m);
    function redraw() { paintSign(cv, text); tex.needsUpdate = true; }
    if (document.fonts && document.fonts.load) { document.fonts.load('800 28px "Baloo 2"', text).then(redraw, redraw); if (document.fonts.ready) document.fonts.ready.then(redraw); }
  }
  function signpost() {   // one textured plane (post + board), non-blocking; points east along the stone road
    var cv = document.createElement('canvas'), g; cv.width = 256; cv.height = 256; g = cv.getContext('2d');
    function paint() {
      g.clearRect(0, 0, 256, 256); g.fillStyle = '#8c5a34'; g.fillRect(118, 70, 20, 186);
      g.fillStyle = '#c98b4f'; g.fillRect(10, 20, 236, 80); g.strokeStyle = '#6b4a32'; g.lineWidth = 6; g.strokeRect(10, 20, 236, 80);
      g.fillStyle = '#3b2a1c'; g.font = '800 30px "Baloo 2", "Google Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Tiệm nội thất →', 128, 62);
    }
    paint();
    var tex = new THREE.CanvasTexture(cv), m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    m.position.set(19.5, 0.65, 43.2); m.name = 'furni_signpost'; FS.group.add(m);
    function redraw() { paint(); tex.needsUpdate = true; }
    if (document.fonts && document.fonts.load) document.fonts.load('800 30px "Baloo 2"', 'Tiệm nội thất →').then(redraw, redraw);
  }
  function buildNpc() {
    var h = Mo.character({ skin: 0xf1c9a5, hair: 0x7a4a2e, shirt: 0x6fa8a0, pants: 0x8c6a4a, boots: 0x5a4030, belt: 0xfff8ea, hairStyle: 'bun' });
    h.root.position.set(LAYOUT.npc[0] + 0.5, 0, LAYOUT.npc[1] + 0.5); h.root.rotation.y = 0;
    var L = [], k; for (k = 0; k < 5; k++) { var a = k / 5 * PI * 2; sp(L, 0.05, 0xf2a1b3, Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08); } sp(L, 0.04, 0xffd166, 0, 0.03, 0);   // hair flower
    var fm = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); fm.position.set(0.17, 0.12, 0.08); if (h.attach && h.attach.hat) h.attach.hat.add(fm); else h.root.add(fm);
    FS.group.add(h.root); FS.npc = { h: h, w: -1, next: 2 + Math.random() * 3 };
  }
  function onFrame(dt) {
    var n = FS.npc; if (!n) return;
    var j = n.h.joints.shoulderR, e;
    n.h.update(dt, 0);
    if (n.w < 0) { n.next -= dt; if (n.next <= 0) n.w = 0; return; }
    n.w += dt; e = Math.max(0, Math.min(1, Math.min(n.w, 1.6 - n.w) * 4));
    j.rotation.x = -2.5 * e; j.rotation.z = Math.sin(n.w * 12) * 0.3 * e;
    if (n.w > 1.6) { n.w = -1; n.next = 5 + Math.random() * 6; }
  }
  FS.build = function () {
    if (FS.ready) return;
    var parent = (G.Scenery && G.Scenery.group) || (G.Decor && G.Decor.group) || W.group, L = [];
    FS.group = new THREE.Group(); FS.group.name = 'furniture_shop'; parent.add(FS.group);
    LAYOUT.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    statics(L); FS.group.add(mesh(L, 'furni_static')); sign(); signpost(); buildNpc();
    W.registerInteractable({ id: 'furnishop', type: 'furnishop', tile: { tx: LAYOUT.npc[0], tz: LAYOUT.npc[1] }, facing: 'n', hint: 'Ghé Tiệm nội thất', stand: { tx: LAYOUT.stand[0], tz: LAYOUT.stand[1] } });
    FS.stats = { parts: L.length, draws: 16 }; FS.ready = true;
    G.Loop.onFrame(onFrame, 10.7);
  };
})();
