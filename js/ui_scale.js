/* Togie Valley - ui_scale.js (Stage 14C, R3 s7): device-level "Cỡ giao diện" (Rất nhỏ / Nhỏ / Vừa / Lớn / Rất lớn = base x 0.6/0.8/1/1.2/1.4; base phone 0.8, tablet 0.95, desktop 1).
 * Scales #ui with transform: scale(var(--ui-scale)); #ui is enlarged by 1/scale so it still fills the viewport.
 * Sets --ui-scale, --uvw, --uvh (1vw / 1vh in scaled px) on #ui. Stored in localStorage togie-valley/uiscale (not in the save). */
(function () {
  'use strict';
  var G = window.Game, root = document.getElementById('ui');
  if (!G || !root) { console.error('[ui_scale] missing deps'); return; }
  var KEY = 'togie-valley/uiscale', US = G.UiScale = {};
  var OPTIONS = [['xs', 'Rất nhỏ'], ['s', 'Nhỏ'], ['m', 'Vừa'], ['l', 'Lớn'], ['xl', 'Rất lớn']];
  var MULT = { xs: 0.6, s: 0.8, m: 1, l: 1.2, xl: 1.4 };   // times the device base: phone 0.8, tablet 0.95, desktop 1.0
  var BASE = { phone: 0.8, tablet: 0.95, desktop: 1.0 };
  var mode = 'm';   // R3 s7: default 'm' everywhere; old stored 'auto' means 'm'
  try { var v = localStorage.getItem(KEY); if (v && MULT[v]) mode = v; } catch (e) { /* ignore */ }

  var ZOOM = !!(window.CSS && CSS.supports && CSS.supports('zoom', '0.8'));
  function viewport() {
    var vv = window.visualViewport;
    return { w: Math.round((vv && vv.width) || window.innerWidth), h: Math.round((vv && vv.height) || window.innerHeight) };
  }
  /* R2 s6: size class by width + pointer type. phone: < 600 wide, or touch with short side < 600 (landscape phone); tablet: touch or < 1100 wide; else desktop. */
  var COARSE = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  US.sizeClass = function () {
    var vp = viewport(), coarse = !!(COARSE && COARSE.matches);
    if (vp.w < 600 || (coarse && Math.min(vp.w, vp.h) < 600)) return 'phone';
    return coarse || vp.w < 1100 ? 'tablet' : 'desktop';
  };
  US.scale = function () {
    return BASE[US.sizeClass()] * MULT[mode];   // buttons stay >= 48 real px via --tap (48px / scale)
  };
  US.mode = function () { return mode; };
  US.apply = function () {
    var s = US.scale(), vp = viewport(), st = root.style;
    var sc = US.sizeClass();
    root.classList.remove('sz-phone', 'sz-tablet', 'sz-desktop'); root.classList.add('sz-' + sc);
    st.setProperty('--ui-scale', String(s));
    st.setProperty('--uvw', (vp.w / s / 100) + 'px');
    st.setProperty('--uvh', (vp.h / s / 100) + 'px');
    st.width = (vp.w / s) + 'px'; st.height = (vp.h / s) + 'px';
    /* Stage 15A-2 (A3): a fractional transform scale rasterised borders/inset shadows/radii at sub-pixel sizes (notched corners).
       Use CSS zoom (layout-level, crisp borders) where supported, transform only as a fallback. */
    if (ZOOM) { st.transform = 'none'; st.transformOrigin = ''; st.zoom = s === 1 ? '' : String(s); }
    else { st.zoom = ''; st.transformOrigin = '0 0'; st.transform = s === 1 ? 'none' : 'scale(' + s + ')'; }
    if (G.Events) G.Events.emit('ui:scaled', { scale: s, mode: mode, cls: sc });
  };
  US.setMode = function (m) {
    if (!MULT[m]) return;
    mode = m;
    try { localStorage.setItem(KEY, m); } catch (e) { /* ignore */ }
    US.apply();
  };
  US.renderRow = function (body, el) {
    el('div', 'tv-sub', body, (G.Icons && G.Icons.has && G.Icons.has('gear') ? G.Icons.ui('gear', 20) + ' ' : '') + 'Cỡ giao diện');
    var wrap = el('div', 'tv-uis', body), buttons = [];
    function paint() {
      buttons.forEach(function (b, i) { b.className = 'tv-btn' + (OPTIONS[i][0] === mode ? '' : ' alt'); });
    }
    el('div', 'tv-ctl-desc', body, 'Chỉnh to nhỏ của nút và chữ trên màn hình. Áp dụng ngay.');
    if (G.Kit) { var pv = el('div', 'k-ui k-card st-prev', body, '<span class="k-pill green">Xem thử</span><b>Chữ và nút sẽ to như thế này</b>'); pv.appendChild(G.Kit.btn('Nút', 'primary')); }   // live preview: #ui itself rescales on every choice
    OPTIONS.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, o[1]);
      b.addEventListener('click', function () {
        US.setMode(o[0]); paint();
        
      });
      buttons.push(b);
    });
    paint();
  };
  var t = 0;
  function later() { clearTimeout(t); t = setTimeout(US.apply, 60); }
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', function () { later(); setTimeout(US.apply, 350); });   // iOS reports stale sizes right after rotation
  if (window.visualViewport) window.visualViewport.addEventListener('resize', later);
  US.apply();
})();
