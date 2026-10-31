/* Togie Valley - minimap.js (Round 3 stage 10): small north-up minimap (top-right, under menu buttons) + full-world map panel on tap.
 * 2D canvas only. The static map (terrain, plots, footprints) is drawn ONCE into an offscreen canvas (S px per tile); a tick (<= 10/s) blits the window
 * around the player and draws icons (landmarks, friends, player arrow). Pure helpers are node-readable (tools/minimap_check.js).
 * API: Game.Minimap { window(px,pz,W,H,span,out), toMini(wx,wz,win,size,out), toBig(wx,wz,W,H,pw,ph,out), places(rows,ext), enabled(), setEnabled(b), open(), close() }.
 * Depends on: world_map, world, player, ui, ui_layout (#tv-hr), ui_scale, settings (toggle in Hiển thị). Load after settings.js. */
(function (root) {
  'use strict';
  var Mini = {}, S = 8, SPAN = 28;   // S = cache px per tile; SPAN = tiles visible in the small window

  /* ------------------------------------------------ pure mapping (world units: 1 tile = 1, tile tx covers x in [tx, tx+1)) */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /** Square window of `span` tiles around (px,pz), clamped inside the map: out = [x0, z0, span]. */
  Mini.window = function (px, pz, W, H, span, out) {
    var s = Math.min(span, W, H);
    out[0] = clamp(px - s / 2, 0, W - s); out[1] = clamp(pz - s / 2, 0, H - s); out[2] = s;
    return out;
  };
  /** World point -> pixel inside the small minimap (size x size px) for a window from Mini.window. */
  Mini.toMini = function (wx, wz, win, size, out) {
    var k = size / win[2];
    out[0] = (wx - win[0]) * k; out[1] = (wz - win[1]) * k;
    return out;
  };
  /** World point -> pixel on the whole-world map (pw x ph px). */
  Mini.toBig = function (wx, wz, W, H, pw, ph, out) { out[0] = wx / W * pw; out[1] = wz / H * ph; return out; };

  function bbox(rows, chars, minTx) {
    var x0 = 1e9, z0 = 1e9, x1 = -1, z1 = -1, z, x;
    for (z = 0; z < rows.length; z++) for (x = minTx || 0; x < rows[z].length; x++) {
      if (chars.indexOf(rows[z].charAt(x)) < 0) continue;
      if (x < x0) x0 = x; if (z < z0) z0 = z; if (x + 1 > x1) x1 = x + 1; if (z + 1 > z1) z1 = z + 1;
    }
    return x1 < 0 ? null : [(x0 + x1) / 2, (z0 + z1) / 2];
  }
  function mid(e) { return e ? [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2] : null; }
  /** Landmark icon centres in tiles: [{k, x, z}]. ext = {dinh:[x0,z0,x1,z1], furn:[x0,z0,x1,z1]} (both optional). */
  Mini.places = function (rows, ext) {
    var out = [], c;
    function add(k, p) { if (p) out.push({ k: k, x: p[0], z: p[1] }); }
    ext = ext || {};
    add('farm', bbox(rows, 'tl'));
    add('home', bbox(rows, 'HD'));
    add('shop', bbox(rows, 'SCn'));
    add('stall', bbox(rows, 'FMm'));
    add('pier', bbox(rows, 'ps', 46));   // fishing pier only (the stream bridge is west of x 46)
    c = mid(ext.furn); add('furn', c);
    c = mid(ext.dinh); add('dinh', c);
    return out;
  };
  Mini.NAMES = { home: 'Nhà', stall: 'Sạp cá', shop: 'Tiệm tạp hóa', furn: 'Tiệm nội thất', pier: 'Cầu câu cá', dinh: 'Đình làng', farm: 'Khu trồng trọt' };
  Mini.SPAN = SPAN; Mini.S = S;

  if (typeof module !== 'undefined' && module.exports) module.exports = Mini;
  if (typeof window === 'undefined') return;

  /* ------------------------------------------------ browser part */
  var G = window.Game;
  if (!G || !G.WorldMap || !G.World || !G.Player || !G.Loop || !G.UI || !G.Events || !G.Scenes || !G.UiScale || !document.getElementById('tv-hr')) { console.error('[minimap] missing deps'); return; }
  G.Minimap = Mini;
  var UI = G.UI, E = G.Events, US = G.UiScale, M = G.WorldMap, W = M.W, H = M.H, hr = document.getElementById('tv-hr');
  var KEY = 'togie-valley/minimap', on = true, INK = '#5b3a29';
  try { if (localStorage.getItem(KEY) === '0') on = false; } catch (e) { /* ignore */ }
  var FM = { xs: 0.6, s: 0.8, m: 1, l: 1.2, xl: 1.4 };
  var FRIEND = ['#42a5f5', '#ab47bc', '#ffa726', '#26a69a'];

  var cache = null, dirty = true, spots = [];
  var TCOL = { grass: '#9bd16f', water: '#67c6dc', path: '#e3c593', soil: '#a4713f', locked: '#c9b886', pier: '#b57a42', sand: '#f1e0a6', stone: '#b9b3a8',
    house: '#f0806a', shop: '#f2b84b', workshop: '#c99a62', stall: '#6bb6ee' };
  var BLD = { house: 1, shop: 1, workshop: 1, stall: 1 };
  function typeAt(tx, tz) { return G.World.tileType(tx + 0.5, tz + 0.5) || 'grass'; }
  function buildStatic() {
    var c, x, z, t, e, ext = (G.Landmarks && G.Landmarks.layout && G.Landmarks.layout.ext) || {}, k, d;
    if (!cache) { cache = document.createElement('canvas'); cache.width = W * S; cache.height = H * S; }
    c = cache.getContext('2d');
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) { t = typeAt(x, z); c.fillStyle = TCOL[t] || TCOL.grass; c.fillRect(x * S, z * S, S, S); }
    c.fillStyle = 'rgba(91,58,41,0.75)';
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      t = typeAt(x, z); if (!BLD[t]) continue;
      if (typeAt(x, z - 1) !== t) c.fillRect(x * S, z * S, S, 1.5);
      if (typeAt(x, z + 1) !== t) c.fillRect(x * S, (z + 1) * S - 1.5, S, 1.5);
      if (typeAt(x - 1, z) !== t) c.fillRect(x * S, z * S, 1.5, S);
      if (typeAt(x + 1, z) !== t) c.fillRect((x + 1) * S - 1.5, z * S, 1.5, S);
    }
    d = [];   // extra footprints: landmark buildings + furniture shop
    for (k in ext) d.push(ext[k]);
    if (G.FurnitureShop && G.FurnitureShop.layout && G.FurnitureShop.layout.ext) d.push(G.FurnitureShop.layout.ext);
    for (k = 0; k < d.length; k++) {
      e = d[k];
      c.fillStyle = '#d9b48a'; c.fillRect(e[0] * S, e[1] * S, (e[2] - e[0]) * S, (e[3] - e[1]) * S);
      c.strokeStyle = 'rgba(91,58,41,0.75)'; c.lineWidth = 1.5; c.strokeRect(e[0] * S + 0.75, e[1] * S + 0.75, (e[2] - e[0]) * S - 1.5, (e[3] - e[1]) * S - 1.5);
    }
    dirty = false;
  }
  function buildSpots() {
    var FS = G.FurnitureShop;
    spots = Mini.places(M.rows, { dinh: ext('dinh'), furn: FS && FS.layout && FS.layout.ext });
  }
  function ext(k) { var L = G.Landmarks && G.Landmarks.layout; return L && L.ext && L.ext[k]; }
  E.on('world:plotsChanged', function () { dirty = true; });

  /* ------------------------------------------------ icons (canvas paths; r = badge radius in px) */
  var GLYPH = {
    home: function (c, u) {
      c.fillStyle = '#fff1d0'; c.fillRect(-0.7 * u, -0.05 * u, 1.4 * u, 0.9 * u);
      c.fillStyle = '#e0603f'; c.beginPath(); c.moveTo(-u, 0); c.lineTo(0, -0.95 * u); c.lineTo(u, 0); c.closePath(); c.fill();
      c.fillStyle = INK; c.fillRect(-0.18 * u, 0.3 * u, 0.36 * u, 0.55 * u);
    },
    stall: function (c, u) {
      c.fillStyle = '#2f8fd0'; c.beginPath(); c.ellipse(-0.15 * u, 0, 0.8 * u, 0.5 * u, 0, 0, 6.2832); c.fill();
      c.beginPath(); c.moveTo(0.5 * u, 0); c.lineTo(1.05 * u, -0.55 * u); c.lineTo(1.05 * u, 0.55 * u); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-0.5 * u, -0.1 * u, 0.12 * u, 0, 6.2832); c.fill();
    },
    shop: function (c, u) {
      c.fillStyle = '#f2b84b'; c.fillRect(-0.8 * u, -0.1 * u, 1.6 * u, 0.95 * u);
      c.fillStyle = '#e0603f'; c.beginPath(); c.moveTo(-u, -0.1 * u); c.lineTo(-0.7 * u, -0.85 * u); c.lineTo(0.7 * u, -0.85 * u); c.lineTo(u, -0.1 * u); c.closePath(); c.fill();
      c.fillStyle = INK; c.fillRect(-0.2 * u, 0.25 * u, 0.4 * u, 0.6 * u);
    },
    furn: function (c, u) {
      c.fillStyle = '#8c5a34'; c.fillRect(-0.55 * u, -0.9 * u, 0.3 * u, 1.35 * u); c.fillRect(-0.55 * u, 0.05 * u, 1.2 * u, 0.4 * u);
      c.fillRect(-0.55 * u, 0.4 * u, 0.28 * u, 0.5 * u); c.fillRect(0.37 * u, 0.4 * u, 0.28 * u, 0.5 * u);
    },
    pier: function (c, u) {
      c.fillStyle = '#8c5a34'; c.fillRect(-u, 0.05 * u, 2 * u, 0.35 * u);
      c.fillRect(-0.8 * u, -0.6 * u, 0.28 * u, 1.4 * u); c.fillRect(0.52 * u, -0.6 * u, 0.28 * u, 1.4 * u);
      c.fillStyle = '#3f9fc4'; c.fillRect(-u, 0.55 * u, 2 * u, 0.25 * u);
    },
    dinh: function (c, u) {
      c.fillStyle = '#8c5a34'; c.fillRect(-0.7 * u, -0.1 * u, 0.28 * u, 0.95 * u); c.fillRect(0.42 * u, -0.1 * u, 0.28 * u, 0.95 * u);
      c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(-1.1 * u, -0.1 * u); c.quadraticCurveTo(-0.5 * u, -0.15 * u, 0, -0.95 * u);
      c.quadraticCurveTo(0.5 * u, -0.15 * u, 1.1 * u, -0.1 * u); c.closePath(); c.fill();
    },
    farm: function (c, u) {
      c.fillStyle = '#8a5a2f'; c.fillRect(-0.9 * u, 0.5 * u, 1.8 * u, 0.4 * u);
      c.fillStyle = '#3fa34d'; c.fillRect(-0.09 * u, -0.2 * u, 0.18 * u, 0.75 * u);
      c.beginPath(); c.moveTo(0, -0.1 * u); c.quadraticCurveTo(-0.2 * u, -0.9 * u, -0.95 * u, -0.6 * u); c.quadraticCurveTo(-0.7 * u, 0, 0, -0.1 * u); c.fill();
      c.beginPath(); c.moveTo(0, -0.1 * u); c.quadraticCurveTo(0.2 * u, -0.9 * u, 0.95 * u, -0.6 * u); c.quadraticCurveTo(0.7 * u, 0, 0, -0.1 * u); c.fill();
    }
  };
  function icon(c, k, x, y, r) {
    c.save(); c.translate(x, y);
    c.fillStyle = '#fff7e0'; c.strokeStyle = INK; c.lineWidth = Math.max(1.5, r * 0.18);
    c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.fill(); c.stroke();
    GLYPH[k](c, r * 0.62);
    c.restore();
  }
  function arrow(c, x, y, r, ang) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, -1.25 * r); c.lineTo(0.9 * r, 0.9 * r); c.lineTo(0, 0.4 * r); c.lineTo(-0.9 * r, 0.9 * r); c.closePath();
    c.fillStyle = '#ef5350'; c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, r * 0.3); c.lineJoin = 'round'; c.stroke(); c.fill();
    c.restore();
  }
  function dot(c, x, y, r, col, ch, fs) {
    c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1.5, r * 0.2); c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#fff'; c.font = '800 ' + fs + 'px "Baloo 2", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y + 0.5);
  }
  var ANG = { n: 0, e: 1.5708, s: 3.1416, w: 4.7124 };

  /* ------------------------------------------------ drawing one frame (scratch arrays: no allocations) */
  var win = [0, 0, SPAN], pt = [0, 0], pos = G.Player.pos;
  function paint(c, size, big, ir, fs) {
    var i, id, st, p, sx, sz, w = big ? size[0] : size, h = big ? size[1] : size;
    c.clearRect(0, 0, w, h);
    if (big) { c.drawImage(cache, 0, 0, w, h); }
    else { Mini.window(pos.x, pos.z, W, H, SPAN, win); c.drawImage(cache, win[0] * S, win[1] * S, win[2] * S, win[2] * S, 0, 0, w, h); }
    for (i = 0; i < spots.length; i++) {
      p = spots[i];
      if (big) Mini.toBig(p.x, p.z, W, H, w, h, pt); else { Mini.toMini(p.x, p.z, win, w, pt); if (pt[0] < -ir || pt[1] < -ir || pt[0] > w + ir || pt[1] > h + ir) continue; }
      icon(c, p.k, pt[0], pt[1], ir);
    }
    if (G.Net && G.Net.live && G.Net.mode !== 'solo') {
      for (id in G.Net.remote) {
        st = G.Net.remote[id];
        if (!st || st[3] !== 'outdoor') continue;
        if (big) Mini.toBig(st[0], st[1], W, H, w, h, pt); else Mini.toMini(st[0], st[1], win, w, pt);
        dot(c, clamp(pt[0], ir * 0.5, w - ir * 0.5), clamp(pt[1], ir * 0.5, h - ir * 0.5), ir, FRIEND[id.charCodeAt(id.length - 1) % 4], ((G.Net.names[id] || id).charAt(0) || '?').toUpperCase(), fs);
      }
    }
    if (big) Mini.toBig(pos.x, pos.z, W, H, w, h, pt); else Mini.toMini(pos.x, pos.z, win, w, pt);
    arrow(c, pt[0], pt[1], ir * 0.85, ANG[G.Player.facing] || 0);
  }

  /* ------------------------------------------------ small map element */
  var btn = document.createElement('button'), cv = document.createElement('canvas'), ctx = cv.getContext('2d'), dpr = 1, realPx = 0;
  btn.id = 'tv-minimap'; btn.type = 'button'; btn.setAttribute('aria-label', 'Bản đồ nhỏ. Chạm để mở bản đồ lớn.');
  btn.appendChild(cv); btn.style.display = 'none'; hr.appendChild(btn);
  var shown = false, fitHide = false;

  function desired() {
    var F = G.Fishing, P = G.Player;
    if (!on || fitHide || !document.body.classList.contains('tv-playing') || UI.panelOpen || G.Scenes.current !== 'outdoor') return false;
    if (P.isLocked && P.isLocked()) return false;
    if (F && (F.state === 'bite' || F.state === 'reel' || F.state === 'result')) return false;
    return true;
  }
  function size() {   // real px: ~22% of the short side, cap 112 phone / 140 else, x UI size step
    var vv = window.visualViewport, vw = (vv && vv.width) || window.innerWidth, vh = (vv && vv.height) || window.innerHeight;
    var cap = US.sizeClass() === 'phone' ? 112 : 140, f = FM[US.mode()] || 1;
    return Math.round(Math.min(cap * 1.2, Math.max(64, Math.min(cap, 0.22 * Math.min(vw, vh)) * f)));
  }
  function apply(real) {
    var sc = US.scale();
    realPx = real; dpr = Math.min(window.devicePixelRatio || 1, 2);
    btn.style.width = btn.style.height = (real / sc) + 'px';
    cv.width = cv.height = Math.round(real * dpr);
  }
  function fit() {   // never overlap the bottom widgets (joystick space, action button, hotbar): shrink, else hide
    var r = btn.getBoundingClientRect(), lim = 1e9, ids = ['tv-action', 'tv-hotbar', 'tv-joyspace'], i, b, q, rot = document.getElementById('tv-rot'), rr = rot && rot.getBoundingClientRect(), extra = rr && rr.height ? rr.height + 6 : 0, lft = rr && rr.width ? Math.min(r.left, rr.left) : r.left;
    for (i = 0; i < ids.length; i++) {
      b = document.getElementById(ids[i]); if (!b) continue;
      q = b.getBoundingClientRect();
      if (q.width > 0 && q.height > 0 && q.right > lft && q.left < r.right && q.top < lim) lim = q.top;
    }
    lim -= 8;
    if (r.top + r.height + extra <= lim) return true;
    var room = Math.floor(lim - r.top - extra);
    if (room < 56) return false;
    apply(room); return true;
  }
  function layout() {
    var ok;
    btn.style.display = '';
    apply(size());
    ok = fit();
    if (!ok) { fitHide = true; btn.style.display = 'none'; shown = false; return; }
    fitHide = false; shown = true;
    if (!cache || dirty) { buildStatic(); }
    if (!spots.length) buildSpots();
    draw();
  }
  function draw() {
    if (!shown) return;
    paint(ctx, cv.width, false, 7 * dpr, 10 * dpr);
  }
  function refresh() {
    var want = desired();
    if (want && !shown) layout();
    else if (!want && shown) { shown = false; btn.style.display = 'none'; }
  }

  /* ------------------------------------------------ big map panel */
  var big = null;
  function legendItem(parent, label, painter) {
    var row = document.createElement('div'), c = document.createElement('canvas'), t = document.createElement('span');
    row.className = 'mm-leg-i'; c.width = c.height = 40; painter(c.getContext('2d'));
    t.textContent = label; row.appendChild(c); row.appendChild(t); parent.appendChild(row);
  }
  function open() {
    if (UI.panelOpen || big || !cache) return;
    var p = document.createElement('div'), h = document.createElement('h2'), cb = document.createElement('canvas'), lg = document.createElement('div'), tip = document.createElement('p'), k;
    p.className = 'tv-wide mm-big'; h.textContent = 'Bản đồ'; p.appendChild(h);
    cb.width = W * S; cb.height = H * S; cb.className = 'mm-bigc'; cb.setAttribute('aria-label', 'Bản đồ cả thế giới. Chạm để đóng.'); p.appendChild(cb);
    lg.className = 'mm-leg'; p.appendChild(lg);
    for (k in Mini.NAMES) (function (key) { legendItem(lg, Mini.NAMES[key], function (c) { icon(c, key, 20, 20, 17); }); })(k);
    legendItem(lg, 'Bạn', function (c) { arrow(c, 20, 20, 14, 0); });
    legendItem(lg, 'Bạn bè', function (c) { dot(c, 20, 20, 15, FRIEND[0], 'A', 20); });
    tip.className = 'mm-tip'; tip.textContent = 'Chạm vào bản đồ để đóng.'; p.appendChild(tip);
    cb.addEventListener('click', function () { UI.sfx('tap'); UI.closePanel(); });
    big = { cv: cb, ctx: cb.getContext('2d'), dim: [W * S, H * S] };
    UI.openPanel(p, { onClose: function () { big = null; } });
    paint(big.ctx, big.dim, true, 13, 17);
  }
  UI.onPress(btn, function () { UI.sfx('tap'); open(); });
  Mini.open = open; Mini.close = function () { if (big) UI.closePanel(); };

  /* ------------------------------------------------ tick (<= 10/s) */
  var acc = 0, slow = 0;
  G.Loop.onFrame(function (dt) {
    acc += dt; if (acc < 0.1) return;
    acc = 0; slow++;
    if (big) { if (!big.cv.isConnected) big = null; else { if (dirty) buildStatic(); paint(big.ctx, big.dim, true, 13, 17); } }
    refresh();
    if (shown) {
      if (dirty) buildStatic();
      if (slow % 10 === 0 && !fit()) { fitHide = true; shown = false; btn.style.display = 'none'; return; }   // MP chip / rotation moved the column
      draw();
    } else if (fitHide && slow % 10 === 0) { fitHide = false; refresh(); if (!shown) fitHide = true; }
  }, 14);
  function relayout() { if (shown) layout(); }
  E.on('ui:scaled', relayout);
  window.addEventListener('resize', function () { setTimeout(relayout, 80); });
  window.addEventListener('orientationchange', function () { setTimeout(relayout, 400); });

  /* ------------------------------------------------ setting (Cài đặt > Hiển thị) */
  Mini.enabled = function () { return on; };
  Mini.setEnabled = function (b) {
    on = !!b;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!on) { shown = false; fitHide = false; btn.style.display = 'none'; } else refresh();
  };
  if (G.Settings && G.Settings.addTab) G.Settings.addTab('display', 'Hiển thị', function (body, el) {
    el('div', 'tv-sub', body, 'Bản đồ nhỏ');
    el('div', 'tv-ctl-desc', body, 'Bản đồ nhỏ ở góc phải màn hình. Chạm vào để xem cả thế giới.');
    var wrap = el('div', 'tv-uis', body), bs = [];
    function paintBtns() { bs.forEach(function (b, i) { b.className = 'tv-btn' + ((i === 0) === on ? '' : ' alt'); }); }
    [['Hiện', true], ['Ẩn', false]].forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, o[0]);
      b.addEventListener('click', function () { Mini.setEnabled(o[1]); paintBtns(); });
      bs.push(b);
    });
    paintBtns();
  });
})(typeof window !== 'undefined' ? window : this);
