/* Togie Valley - land_office.js (Stage 16 G1): "Phòng Địa Ốc" land-and-building office + Game.Land service registry.
 * Visuals: small timber house, sign, blueprint table, theodolite, survey stakes + string, short stone path, surveyor NPC "Chú Tâm".
 * Draw calls: static 2 (mesh + outline), sign 1, NPC about 12 => about 15. Interact event `interact:landoffice`.
 * Game.Land: register(service, {tiers, canApply, apply}) / get / set / tiers / isRegistered / open. Services: 'house', 'farm'.
 * Save keys: land.house, land.farm (tier numbers 0..3). The upgrades themselves live in later stages (register their service). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Save || !G.State) { console.error('[land] missing deps'); return; }
  var E = G.Events, MAXT = 3;
  var Land = G.Land = { MAX: MAXT, services: ['house', 'farm'], standTile: null, layout: null };
  var tier = { house: 0, farm: 0 }, defs = { house: null, farm: null };

  function clampT(n) { n = Math.round(+n); return n >= 0 ? Math.min(MAXT, n) : 0; }
  function valid(s) { return s === 'house' || s === 'farm'; }
  Land.register = function (service, def) {
    if (!valid(service) || !def || !def.tiers || !def.tiers.length || typeof def.apply !== 'function') { console.error('[land] bad register ' + service); return; }
    defs[service] = { tiers: def.tiers, canApply: def.canApply || function () { return true; }, apply: def.apply };
    E.emit('land:registered', { service: service });
  };
  Land.isRegistered = function (service) { return !!defs[service]; };
  Land.tiers = function (service) { return defs[service] ? defs[service].tiers : null; };
  Land.get = function (service) { return valid(service) ? tier[service] : 0; };
  Land.set = function (service, n) {
    if (!valid(service)) return;
    tier[service] = clampT(n); E.emit('land:changed', { service: service, tier: tier[service] });
    if (G.Save.request) G.Save.request();
  };
  // Stage 33: another player's purchase (host-validated): same apply() as a local buy (construction site), no money
  Land.remote = function (service, n) {
    var d = defs[service], t = d && d.tiers[n - 1];
    if (!d || !t || n <= tier[service]) return false;
    try { d.apply(n, t); } catch (e) { console.error('[land] remote apply', e); }
    Land.set(service, n); return true;
  };
  // normalise canApply result -> {ok, reason}
  function can(service, n) {
    var d = defs[service], r;
    try { r = d.canApply(n, tier[service]); } catch (e) { console.error('[land] canApply', e); r = false; }
    if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || '' };
    if (typeof r === 'string') return { ok: false, reason: r };
    return r === false ? { ok: false, reason: 'Bạn chưa đủ điều kiện.' } : { ok: true, reason: '' };
  }
  // buy tier n (must be next one): checks money + canApply, calls apply, then charges. Returns true on success.
  Land.purchase = function (service, n) {
    var d = defs[service], t = d && d.tiers[n - 1], S = G.State, UI = G.UI;
    if (!d || !t || n !== tier[service] + 1) return false;
    var c = can(service, n);
    if (!c.ok) { UI.toast(c.reason || 'Bạn chưa đủ điều kiện.', 'warn'); return false; }
    if (S.money < t.cost) { UI.toast('Bạn chưa đủ vàng.', 'coin'); return false; }
    var r; try { r = d.apply(n, t); } catch (e) { console.error('[land] apply', e); r = false; }
    if (r === false) return false;
    S.spendMoney(t.cost); Land.set(service, n);
    E.emit('land:upgraded', { service: service, tier: n, cost: t.cost });
    UI.sfx('pop');
    return true;
  };
  G.Save.register('land.house', { save: function () { return tier.house; }, load: function (v) { tier.house = clampT(v); }, reset: function () { tier.house = 0; } });
  G.Save.register('land.farm', { save: function () { return tier.farm; }, load: function (v) { tier.farm = clampT(v); }, reset: function () { tier.farm = 0; } });

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    ext: [6, 20, 12, 25],                               // visual footprint [x0, z0, x1, z1] tiles (exclusive max)
    house: [7, 21, 10, 23],                             // timber house footprint (blocked)
    blocked: [[7, 21], [8, 21], [9, 21], [7, 22], [8, 22], [9, 22], [9, 23], [10, 23]],   // house, NPC tile, table
    npc: [9, 23], table: [10, 23], stand: [9, 24],
    path: [[8, 23], [8, 24], [9, 24], [10, 24], [11, 24]],
    door: [8, 23]
  };
  /*LAYOUT-END*/
  Land.layout = LAYOUT; Land.standTile = { tx: LAYOUT.stand[0], tz: LAYOUT.stand[1], facing: 'n' };

  /* ------------------------------------------------------------------ panel (DOM only, no THREE needed) */
  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function coin(sz) { return G.Icons && G.Icons.ui ? G.Icons.ui('coin', sz) : ''; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  var TXT = {
    house: { tab: 'Nâng cấp nhà', verb: 'Nâng cấp', title: 'Nâng cấp nhà', own: 'Nhà hiện tại', soon: 'Chú Tâm đang vẽ bản thiết kế nhà mới. Bạn quay lại sau nhé!' },
    farm: { tab: 'Mở rộng đất', verb: 'Mở rộng', title: 'Mở rộng đất', own: 'Đất hiện tại', soon: 'Chú Tâm đang đo đạc mảnh đất mới. Bạn quay lại sau nhé!' }
  };
  function openPanel(startSvc) {
    var UI = G.UI, S = G.State, svc = startSvc || 'house', p = el('div', 'tv-wide tv-land'), h = el('h2', null, p), gold = el('span', 'gold', h);
    el('span', null, h).textContent = 'Phòng Địa Ốc'; h.insertBefore(h.lastChild, gold);
    var tabs = el('div', 'land-tabs tv-hscroll', p), list = el('div', 'land-list tv-scroll', p), row = el('div', 'tv-row', p), tb = {};
    function btn(label, parent, fn, cls) { var b = el('button', 'land-btn' + (cls ? ' ' + cls : ''), parent); b.type = 'button'; b.textContent = label; b.addEventListener('click', function () { UI.sfx('tap'); fn(); }); return b; }
    function render() {
      gold.innerHTML = coin(18) + fmt(S.money);
      Land.services.forEach(function (s) { tb[s].classList.toggle('on', s === svc); });
      var T = TXT[svc], d = defs[svc], cur = tier[svc], keep = list.scrollTop; list.innerHTML = '';
      if (!d) {
        var c0 = el('div', 'land-card soon', list);
        el('div', 'land-badge', c0, 'Sắp có'); el('div', 'land-name', c0, T.title); el('div', 'land-req', c0, T.soon);
        return;
      }
      el('div', 'land-cur', list, T.own + ': <b>bậc ' + cur + '/' + d.tiers.length + '</b>');
      d.tiers.forEach(function (t, i) {
        var n = i + 1, st = n <= cur ? 'owned' : (n === cur + 1 ? 'next' : 'locked'), card = el('div', 'land-card ' + st, list), top = el('div', 'land-top', card);
        el('div', 'land-no', top, String(n)); var nm = el('div', 'land-name', top); nm.textContent = t.name || ('Bậc ' + n);
        if (t.desc) el('div', 'land-desc', card).textContent = t.desc;
        if (typeof t.preview === 'function') { try { t.preview(card, n); } catch (e) { console.error('[land] preview', e); } }
        var rq = Array.isArray(t.req) ? t.req : (t.req ? [t.req] : []);
        rq.forEach(function (r) { el('div', 'land-req', card).textContent = 'Yêu cầu: ' + r; });
        el('div', 'land-cost', card, coin(26) + '<b>' + fmt(t.cost) + '</b>');
        if (st === 'owned') { el('div', 'land-badge ok', card, 'Đã sở hữu'); return; }
        if (st === 'locked') { el('div', 'land-badge lock', card, 'Đang khóa - cần hoàn thành bậc ' + (n - 1) + ' trước'); return; }
        var c = can(svc, n);
        if (!c.ok) { el('div', 'land-badge lock', card, 'Chưa đủ điều kiện'); if (c.reason) el('div', 'land-req bad', card).textContent = c.reason; return; }
        btn(T.verb + ' bậc ' + n, card, function () {
          if (S.money < t.cost) { UI.toast('Bạn chưa đủ vàng.', 'coin'); return; }
          UI.confirm({ title: T.title + '?', text: 'Bậc ' + n + ' "' + (t.name || n) + '" giá ' + fmt(t.cost) + ' vàng. Bạn muốn làm luôn chứ?', yes: 'Đồng ý', no: 'Để sau' }, function (ok) {
            if (ok) Land.purchase(svc, n);
            setTimeout(function () { if (p.isConnected) render(); else openPanel(svc); }, 30);
          });
        }, S.money < t.cost ? 'poor' : '');
      });
      list.scrollTop = keep;
    }
    Land.services.forEach(function (s) { tb[s] = btn(TXT[s].tab, tabs, function () { svc = s; render(); }, 'tab'); });
    btn('Đóng', row, function () { UI.closePanel(); });
    var off = E.on('state:changed', function (e) { if (e && e.key === 'money') gold.innerHTML = coin(18) + fmt(S.money); });
    UI.openPanel(p, { onClose: function () { off(); if (G.Save.request) G.Save.request(); } });
    render();
  }
  Land.open = openPanel;

  var LINES = [
    ['Chào bạn! Chú là Tâm, thợ đo đạc ở Phòng Địa Ốc đây.', 'Nhà cửa hay đất đai, cứ để chú lo cho nhé.'],
    ['Ô, bạn ghé chơi đấy à? Vào xem bản vẽ với chú nào.', 'Muốn sửa nhà hay mở rộng đất thì cứ nói, chú đo liền!'],
    ['Đất tốt thì trồng gì cũng tươi. Bạn đã tính mở rộng vườn chưa?', 'Chú có sẵn bản vẽ đây, xem thử nhé.']
  ];
  E.on('interact:landoffice', function () {
    var UI = G.UI, T = G.Time, w = T && T.weather, ln = LINES[Math.floor(Math.random() * LINES.length)];
    if (w === 'rain') ln = ['Trời mưa mà bạn vẫn ghé, chăm chỉ quá!', 'Vào đây tránh mưa, xem bản vẽ với chú một lát nhé.'];
    else if (w === 'snow') ln = ['Tuyết rơi lạnh quá, bạn nhớ giữ ấm nhé!', 'Vào đây xem bản vẽ cho ấm, chú pha trà sau.'];
    UI.dialog({ name: 'Chú Tâm', voice: 'smith', lines: ln, onDone: function () { openPanel(); } });
  });

  /* ------------------------------------------------------------------ 3D build (skipped in node / without renderer) */
  if (typeof THREE === 'undefined' || !G.Render || !G.Models || !G.World) { Land.ready = false; return; }
  var R = G.Render, Mo = G.Models, W = G.World;
  var LO = G.LandOffice = { group: null, npc: null, stats: null, ready: false };
  var C = { wood: 0xc98b4f, wood2: 0xd9a066, dark: 0x8c5a34, dark2: 0x6b4a32, cream: 0xf4e9d2, stone: 0xb7b2a6, stone2: 0x9a958b, iron: 0x5a4a52,
    roof: 0xb5654a, roof2: 0xc9785a, glass: 0x9fd3e6, red: 0xd9825b, rope: 0xd8c08a, gold: 0xffd166, paper: 0xf6f0dc, blue: 0x5f8fc4, green: 0x5fb86a, sand: 0xd8c08a, sand2: 0xcdb27a };
  var PETAL = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2, 0xff8f6b];
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8), SPH = new THREE.SphereGeometry(0.5, 8, 6), PI = Math.PI, seed = 1616;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function bx(L, w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOX, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function cy(L, r, h, c, x, y, z, rx, ry, rz) { L.push(Mo.part(CYL, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [r * 2, h, r * 2])); }
  function sp(L, r, c, x, y, z, sy) { L.push(Mo.part(SPH, c, [x, y, z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function flowers(L, x, z, n, w) { var i; for (i = 0; i < n; i++) sp(L, 0.035 + rnd() * 0.02, PETAL[(rnd() * 5) | 0], x + (rnd() - 0.5) * w, 0.07 + rnd() * 0.05, z + (rnd() - 0.5) * w); sp(L, 0.1, C.green, x, 0.04, z, 0.5); }
  function stake(L, x, z, h) { bx(L, 0.07, h, 0.07, C.wood2, x, h / 2, z); bx(L, 0.09, 0.05, 0.09, C.dark, x, h + 0.02, z); bx(L, 0.2, 0.1, 0.02, C.red, x + 0.1, h - 0.1, z, 0, 0, 0.25); }
  function line(L, x0, z0, x1, z1, y, c) {
    var dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz); bx(L, len, 0.02, 0.02, c, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -Math.atan2(dz, dx), 0);
  }

  function statics(L) {
    var i, t, x, z;
    // flat stone path: slightly varied sand slabs + pebbles
    LAYOUT.path.forEach(function (p) {
      bx(L, 0.94, 0.05, 0.94, (p[0] + p[1]) % 2 ? C.sand : C.sand2, p[0] + 0.5, 0.025, p[1] + 0.5, 0, (rnd() - 0.5) * 0.08, 0);
      sp(L, 0.07, C.stone, p[0] + 0.2 + rnd() * 0.6, 0.06, p[1] + 0.2 + rnd() * 0.6, 0.5);
    });
    // house: base, plaster walls (x 7..10, z 21..23), timber frame, door, windows
    bx(L, 3.2, 0.2, 2.2, C.stone2, 8.5, 0.1, 22);
    bx(L, 3.0, 2.1, 2.0, C.cream, 8.5, 1.25, 22);
    for (i = 0; i < 4; i++) bx(L, 0.14, 2.1, 0.14, C.dark, i % 2 ? 9.98 : 7.02, 1.25, i < 2 ? 21.02 : 22.98);
    bx(L, 3.0, 0.12, 0.14, C.dark, 8.5, 2.28, 22.98); bx(L, 3.0, 0.12, 0.14, C.dark, 8.5, 2.28, 21.02); bx(L, 3.0, 0.1, 0.14, C.dark, 8.5, 0.34, 22.98);
    bx(L, 0.14, 0.12, 2.0, C.dark, 7.02, 2.28, 22); bx(L, 0.14, 0.12, 2.0, C.dark, 9.98, 2.28, 22);
    bx(L, 0.8, 1.5, 0.08, C.wood2, 8.5, 0.95, 23.02); bx(L, 0.92, 0.08, 0.1, C.dark, 8.5, 1.74, 23.03); sp(L, 0.04, C.gold, 8.78, 0.95, 23.08);
    [7.58, 9.42].forEach(function (wx) { bx(L, 0.5, 0.5, 0.06, C.dark, wx, 1.2, 23.03); bx(L, 0.4, 0.4, 0.07, C.glass, wx, 1.2, 23.04); bx(L, 0.03, 0.4, 0.08, C.dark, wx, 1.2, 23.05); bx(L, 0.46, 0.08, 0.2, C.wood, wx, 0.88, 23.12); flowers(L, wx, 23.13, 3, 0.36); });
    bx(L, 0.06, 0.5, 0.5, C.dark, 6.98, 1.2, 22); bx(L, 0.07, 0.4, 0.4, C.glass, 6.97, 1.2, 22);
    // gable steps + roof (ridge along x at z 22)
    for (i = 0; i < 3; i++) { t = 1.9 - i * 0.65; bx(L, 0.1, 0.26, t, C.cream, 7.06, 2.4 + i * 0.26, 22); bx(L, 0.1, 0.26, t, C.cream, 9.94, 2.4 + i * 0.26, 22); }
    bx(L, 3.5, 0.1, 1.5, C.roof, 8.5, 2.9, 22.58, 0.56, 0, 0); bx(L, 3.5, 0.1, 1.5, C.roof2, 8.5, 2.9, 21.42, -0.56, 0, 0);
    bx(L, 3.5, 0.1, 0.14, C.dark2, 8.5, 3.28, 22);
    // blueprint table on tile (10,23): top, legs, sheet with blue lines, rolled tube
    bx(L, 0.92, 0.07, 0.72, C.wood2, 10.5, 0.78, 23.5);
    [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].forEach(function (o) { bx(L, 0.07, 0.76, 0.07, C.dark, 10.5 + o[0], 0.38, 23.5 + o[1]); });
    bx(L, 0.7, 0.012, 0.5, C.paper, 10.48, 0.825, 23.5, 0, 0.05, 0);
    for (i = 0; i < 3; i++) bx(L, 0.5, 0.014, 0.02, C.blue, 10.48, 0.832, 23.36 + i * 0.1, 0, 0.05, 0);
    bx(L, 0.02, 0.014, 0.34, C.blue, 10.32, 0.832, 23.5, 0, 0.05, 0);
    cy(L, 0.05, 0.5, C.paper, 10.78, 0.88, 23.62, PI / 2, 0, 0.3); cy(L, 0.052, 0.04, C.red, 10.78, 0.88, 23.86, PI / 2, 0, 0.3);
    // theodolite tripod on tile (11,22)
    x = 11.5; z = 22.5;
    for (i = 0; i < 3; i++) { t = i * 2.094 + 0.4; bx(L, 0.04, 1.1, 0.04, C.wood, x + Math.cos(t) * 0.14, 0.52, z + Math.sin(t) * 0.14, Math.sin(t) * 0.22, 0, -Math.cos(t) * 0.22); }
    cy(L, 0.1, 0.12, C.iron, x, 1.12, z); cy(L, 0.07, 0.18, C.iron2 || C.stone2, x, 1.26, z); bx(L, 0.05, 0.05, 0.22, C.iron, x, 1.3, z + 0.1);
    // survey stakes + string lines (north and west only: keep the walk side clear)
    stake(L, 6.4, 20.6, 0.55); stake(L, 11.5, 20.7, 0.55); stake(L, 6.5, 24.5, 0.5); stake(L, 11.55, 24.6, 0.5);
    line(L, 6.4, 20.6, 11.5, 20.7, 0.4, C.rope); line(L, 6.4, 20.6, 6.5, 24.5, 0.4, C.rope);
    // sack of pegs + flower tufts + rocks
    cy(L, 0.18, 0.34, C.rope, 6.55, 0.17, 21.2); stake(L, 6.5, 21.2, 0.7);
    flowers(L, 6.6, 22.6, 5, 0.6); flowers(L, 10.7, 21.5, 5, 0.7); flowers(L, 7.2, 23.9, 4, 0.5); sp(L, 0.2, C.stone, 10.8, 0.1, 21.1, 0.6);
  }
  function mesh(L, name) { var m = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); m.name = name; R.addOutline(m, true, true); return m; }
  function paintSign(cv, text) {
    var g = cv.getContext('2d'); g.fillStyle = '#c98b4f'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#6b4a32'; g.lineWidth = 6; g.strokeRect(3, 3, cv.width - 6, cv.height - 6);
    g.fillStyle = '#fff1d0'; g.font = '800 30px "Baloo 2", "Google Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cv.width / 2, cv.height / 2 + 2);
  }
  function sign() {
    var cv = document.createElement('canvas'), text = 'PHÒNG ĐỊA ỐC'; cv.width = 256; cv.height = 64; paintSign(cv, text);
    var tex = new THREE.CanvasTexture(cv), m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(8.5, 2.0, 23.06); m.name = 'land_sign'; LO.group.add(m);
    function redraw() { paintSign(cv, text); tex.needsUpdate = true; }
    if (document.fonts && document.fonts.load) { document.fonts.load('800 30px "Baloo 2"', text).then(redraw, redraw); if (document.fonts.ready) document.fonts.ready.then(redraw); }
  }
  function buildNpc() {
    var h = Mo.character({ skin: 0xe0ac82, hair: 0x2f2a2e, shirt: 0xe8934a, pants: 0xb59a6a, boots: 0x5a4030, belt: 0x6b4a32, hairStyle: 'short' });
    h.root.position.set(LAYOUT.npc[0] + 0.5, 0, LAYOUT.npc[1] + 0.5); h.root.rotation.y = 0;   // faces south (+z) toward the stand tile
    var L = [];   // sun hat: crown + wide brim + band
    sp(L, 0.26, 0xf0d58a, 0, 0.05, 0, 0.7); cy(L, 0.42, 0.04, 0xf0d58a, 0, -0.04, 0); cy(L, 0.27, 0.06, 0xd9825b, 0, 0.0, 0);
    var hm = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); R.addOutline(hm, true); if (h.attach && h.attach.hat) h.attach.hat.add(hm);
    LO.group.add(h.root); LO.npc = { h: h, w: -1, next: 2 + Math.random() * 3 };
  }
  function onFrame(dt) {
    var n = LO.npc; if (!n) return;
    var j = n.h.joints.shoulderR, e = 0;
    n.h.update(dt, 0);
    if (n.w < 0) { n.next -= dt; if (n.next <= 0) n.w = 0; return; }
    n.w += dt; e = Math.max(0, Math.min(1, Math.min(n.w, 1.6 - n.w) * 4));
    j.rotation.x = -2.5 * e; j.rotation.z = Math.sin(n.w * 12) * 0.3 * e;
    if (n.w > 1.6) { n.w = -1; n.next = 5 + Math.random() * 6; }
  }
  LO.build = function () {
    if (LO.ready) return;
    var parent = (G.Scenery && G.Scenery.group) || (G.Decor && G.Decor.group) || W.group, L = [];
    LO.group = new THREE.Group(); LO.group.name = 'land_office'; parent.add(LO.group);
    LAYOUT.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    statics(L); LO.group.add(mesh(L, 'land_static')); sign(); buildNpc();
    W.registerInteractable({ id: 'landoffice', type: 'landoffice', tile: { tx: LAYOUT.npc[0], tz: LAYOUT.npc[1] }, facing: 'n', hint: 'Nói chuyện với chú Tâm', stand: { tx: LAYOUT.stand[0], tz: LAYOUT.stand[1] } });
    LO.stats = { parts: L.length, draws: 15 }; LO.ready = true; Land.ready = true;
    G.Loop.onFrame(onFrame, 10.6);
  };
})();
