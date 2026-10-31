/* Togie Valley - joystick.js (Stage 15B, B1)
 * Game.Joystick: device-level "Kiểu điều khiển" (tap | float | fixed) + analog virtual stick feeding Game.Player.setStick.
 * Settings live in localStorage `togie-valley/controls` (outside the save). The same store also holds the camera mode (see camera_auto.js).
 * Floating (Cần trôi, R3 s9): a touch in the left half spawns the base at the touch point (shown after 100 ms or 10 px) and it stays anchored there until release;
 * a short tap (< 200 ms, < 10 px) is forwarded to Input.emitTap as a normal tap. Input skips those pointers via Input.takes, so the right-half camera finger is independent.
 * Fixed (Cần cố định): always-visible base, default bottom corner, movable in Settings (live preview), position stored per orientation (`fixpos`: {p|l: {x,y} viewport fractions}).
 * Depends on core.js, input.js, player.js. Loads after ui_scale.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Input || !G.Player || !G.Loop || !G.Events) { console.error('[joystick] missing deps'); return; }
  var E = G.Events, P = G.Player, In = G.Input;
  var KEY = 'togie-valley/controls';
  var MODES = [['tap', 'Chạm để đi'], ['float', 'Cần trôi'], ['fixed', 'Cần cố định']];
  var MODE_DESC = {
    tap: 'Chạm vào mặt đất để đi tới đó, nhấn giữ để đi theo ngón tay.',
    float: 'Chạm ở nửa trái màn hình, cần hiện ra đúng chỗ ngón tay và đứng yên ở đó. Nửa phải: kéo một ngón để xoay camera.',
    fixed: 'Cần luôn hiện ở một chỗ, kéo núm để di chuyển. Nửa phải: kéo một ngón để xoay camera.'
  };
  var SIZES = [['s', 'Nhỏ', 96], ['m', 'Vừa', 120], ['l', 'Lớn', 148]];
  var DEAD = 0.12, TAP_MOVE = 10, TAP_MS = 200, SHOW_MS = 100;

  /* ------------------------------------------------------------ store */
  var store = {};
  try { var raw = localStorage.getItem(KEY); if (raw) store = JSON.parse(raw) || {}; } catch (e) { store = {}; }
  if (typeof store !== 'object' || !store) store = {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
  function coarse() {
    try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0 && 'ontouchstart' in window; } catch (e) { return false; }
  }
  function validMode(m) { return m === 'tap' || m === 'float' || m === 'fixed'; }
  var mode = validMode(store.mode) ? store.mode : (coarse() ? 'float' : 'tap');
  var size = (store.size === 's' || store.size === 'm' || store.size === 'l') ? store.size : 'm';
  var opacity = typeof store.opacity === 'number' ? Math.min(1, Math.max(0.3, store.opacity)) : 0.85;
  var hand = store.hand === 'right' ? 'right' : 'left';

  var J = G.Joystick = {};
  /** Shared device-level store (camera_auto.js uses it too). */
  J.store = function (key, val) {
    if (val === undefined) return store[key];
    store[key] = val; save(); return val;
  };
  J.mode = function () { return mode; };
  J.size = function () { return size; };
  J.opacity = function () { return opacity; };
  J.hand = function () { return hand; };
  J.active = function () { return !!act; };
  /** Current stick output (screen space, y up). */
  J.vector = function (out) { out = out || { x: 0, y: 0, mag: 0 }; out.x = vx; out.y = vy; out.mag = vm; return out; };

  /* -------------------------------------------------------------- DOM */
  var layer = document.createElement('div');
  layer.id = 'tv-joy'; layer.setAttribute('aria-hidden', 'true');
  var base = document.createElement('div'); base.className = 'tv-joy-base';
  var ring = document.createElement('div'); ring.className = 'tv-joy-ring';
  var knob = document.createElement('div'); knob.className = 'tv-joy-knob';
  ring.appendChild(knob); base.appendChild(ring); layer.appendChild(base);
  document.body.appendChild(layer);

  /* ------------------------------------------------------------ state */
  var act = null;                 // active touch: { id, cx, cy (base centre, client px), px, py (finger), t0, far, vis }
  var vx = 0, vy = 0, vm = 0;
  var R = 48, D = 120;            // travel radius and base diameter in client px
  var fixedC = { x: 0, y: 0 };    // fixed base centre (client px), refreshed on layout
  var shown = false, lastTx = -1, lastTy = -1, lastKx = 1e9, lastKy = 1e9;

  function uiScale() { return (G.UiScale && G.UiScale.scale) ? G.UiScale.scale() : 1; }
  function applyLook() {
    var d = 120, i; for (i = 0; i < SIZES.length; i++) if (SIZES[i][0] === size) d = SIZES[i][2];
    D = d; R = d * 0.5 * 0.78;
    var s = layer.style;
    s.setProperty('--jd', d + 'px'); s.setProperty('--jk', Math.round(d * 0.44) + 'px');
    s.setProperty('--jo', String(opacity)); s.setProperty('--js', String(uiScale()));
    layer.className = 'tv-joy-' + mode + ' tv-joy-h' + (hand === 'right' ? 'r' : 'l') + (shown ? ' show' : '');
    layer.id = 'tv-joy';
    if (In.setJoy) In.setJoy(mode === 'tap' ? 'off' : mode);
    placeFixed(); measureFixed();
  }
  function orient() { return window.innerWidth > window.innerHeight ? 'l' : 'p'; }
  /** Stored fixed-stick centre for the current orientation as viewport fractions, or null (= CSS corner default). */
  J.fixedPos = function () { var fp = store.fixpos, o = fp && fp[orient()]; return o && typeof o.x === 'number' && typeof o.y === 'number' ? o : null; };
  function placeFixed() {
    var fp = mode === 'fixed' ? J.fixedPos() : null;
    layer.classList.toggle('tv-joy-custom', !!fp);
    if (fp) base.style.transform = 'translate3d(' + (fp.x * window.innerWidth - D / 2) + 'px,' + (fp.y * window.innerHeight - D / 2) + 'px,0)';
    else if (mode === 'fixed') base.style.transform = '';
  }
  /** Move the fixed stick (live): fx, fy = centre as viewport fractions; clamped so the whole base stays on screen. */
  J.setFixedPos = function (fx, fy) {
    var w = window.innerWidth || 1, h = window.innerHeight || 1, mx = (D / 2 + 6) / w, my = (D / 2 + 6) / h;
    var fp = store.fixpos && typeof store.fixpos === 'object' ? store.fixpos : (store.fixpos = {});
    fp[orient()] = { x: Math.min(1 - mx, Math.max(mx, +fx || 0)), y: Math.min(1 - my, Math.max(my, +fy || 0)) };
    save(); placeFixed(); measureFixed(); changed('fixpos', fp[orient()]);
  };
  J.resetFixedPos = function () { if (store.fixpos) delete store.fixpos[orient()]; save(); placeFixed(); measureFixed(); changed('fixpos', null); };
  function measureFixed() {
    if (mode !== 'fixed') return;
    var r = base.getBoundingClientRect();
    fixedC.x = r.left + r.width / 2; fixedC.y = r.top + r.height / 2;
  }
  function show(on) {
    if (on === shown) return;
    shown = on;
    layer.classList.toggle('show', on);
  }

  /* ------------------------------------------------------ pointer flow */
  function blocked() { return P.isLocked() || P.sitting || In.suspend || mode === 'tap'; }

  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function begin(id, cx, cy, px, py) {
    act = { id: id, cx: cx, cy: cy, px: px, py: py, x0: px, y0: py, t0: nowMs(), far: false, vis: mode === 'fixed' };
    lastTx = -1;
    E.emit('joystick:start', {});
  }
  function finish() {
    if (!act) return;
    act = null; vx = vy = vm = 0; lastKx = 1e9;
    P.setStick(0, 0, 0);
    knob.style.transform = 'translate3d(0,0,0)';
    if (mode === 'float') show(false);
    E.emit('joystick:end', {});
  }
  /** Float zone test shared with Input (Input.takes): this pointer belongs to the stick, not to tap/camera. */
  function wants(e) {
    if (mode !== 'float' || blocked() || e.target !== In.canvas) return false;
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    return e.clientX < window.innerWidth * ((G.Config.input && G.Config.input.joyZone) || 0.5);
  }
  In.takes = wants;
  function onDown(e) {
    if (act || !wants(e)) return;
    try { In.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    begin(e.pointerId, e.clientX, e.clientY, e.clientX, e.clientY);
  }
  function onMove(e) {
    if (!act || e.pointerId !== act.id) return;
    act.px = e.clientX; act.py = e.clientY;
    if (!act.far) { var dx = act.px - act.x0, dy = act.py - act.y0; if (dx * dx + dy * dy > TAP_MOVE * TAP_MOVE) act.far = true; }
  }
  function onUp(e) {
    if (!act || e.pointerId !== act.id) return;
    if (mode === 'float' && e.type === 'pointerup' && !act.far && nowMs() - act.t0 < TAP_MS) In.emitTap(act.px, act.py);   // short tap = normal tap
    finish();
  }
  function onFixedDown(e) {
    if (mode !== 'fixed' || act || blocked()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { base.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    measureFixed();
    begin(e.pointerId, fixedC.x, fixedC.y, e.clientX, e.clientY);
  }
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  base.addEventListener('pointerdown', onFixedDown);
  window.addEventListener('blur', function () { finish(); });
  window.addEventListener('resize', function () { setTimeout(applyLook, 80); });
  window.addEventListener('orientationchange', function () { setTimeout(applyLook, 120); });
  E.on('ui:scaled', function () { applyLook(); });

  /* ----------------------------------------------------------- per frame */
  G.Loop.onFrame(function () {
    var vis = mode === 'fixed' && !blocked();
    if (mode === 'fixed') show(vis);
    else if (mode === 'float' && !act && shown) show(false);
    if (act && blocked()) { finish(); return; }
    if (!act) return;
    var ox = act.px - act.cx, oy = act.py - act.cy, len = Math.sqrt(ox * ox + oy * oy);
    if (!act.vis && (act.far || nowMs() - act.t0 >= SHOW_MS)) { act.vis = true; lastTx = -1; show(true); }   // float base stays anchored at the touch point
    var n = Math.min(1, len / R), kx = ox, ky = oy;
    if (len > R) { kx = ox / len * R; ky = oy / len * R; }
    // dead zone + smooth response curve
    var m = n <= DEAD ? 0 : (n - DEAD) / (1 - DEAD);
    m = m * m * (3 - 2 * m) * 0.35 + m * 0.65;
    if (m > 0 && len > 0.001) { vx = ox / len; vy = -oy / len; vm = m; } else { vx = 0; vy = 0; vm = 0; }
    P.setStick(vx, vy, vm);
    if (mode === 'float' && (act.cx !== lastTx || act.cy !== lastTy)) {
      lastTx = act.cx; lastTy = act.cy;
      base.style.transform = 'translate3d(' + (act.cx - D / 2) + 'px,' + (act.cy - D / 2) + 'px,0)';
    }
    if (kx !== lastKx || ky !== lastKy) {
      lastKx = kx; lastKy = ky;
      knob.style.transform = 'translate3d(' + kx + 'px,' + ky + 'px,0)';
    }
  }, 110);

  /* ----------------------------------------------------------- setters */
  function changed(key, value) { E.emit('controls:changed', { key: key, value: value }); }
  J.setMode = function (m) {
    if (!validMode(m)) return;
    finish();
    mode = m; store.mode = m; save();
    base.style.transform = '';
    applyLook(); changed('mode', m);
  };
  J.setSize = function (s) {
    if (s !== 's' && s !== 'm' && s !== 'l') return;
    size = s; store.size = s; save(); applyLook(); changed('size', s);
  };
  J.setOpacity = function (o) {
    opacity = Math.min(1, Math.max(0.3, +o || 0.85)); store.opacity = opacity; save(); applyLook(); changed('opacity', opacity);
  };
  J.setHand = function (h) {
    hand = h === 'right' ? 'right' : 'left'; store.hand = hand; save(); applyLook(); changed('hand', hand);
  };

  /* ---------------------------------------------------------- settings UI */
  J.renderRow = function (body, el) {
    var has = G.Icons && G.Icons.has && G.Icons.has('gear');
    el('div', 'tv-sub', body, (has ? G.Icons.ui('gear', 20) + ' ' : '') + 'Kiểu điều khiển');
    var wrap = el('div', 'tv-uis', body), desc = el('div', 'tv-ctl-desc', body);
    var extra = el('div', 'tv-ctl-extra', body);
    var bm = [];
    MODES.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, o[1]);
      b.addEventListener('click', function () {
        J.setMode(o[0]); paint();
        
      });
      bm.push(b);
    });
    function seg(label, opts, cur, set) {
      el('div', 'tv-sub', extra, label);
      var w = el('div', 'tv-uis', extra), bs = [];
      opts.forEach(function (o) {
        var b = el('button', 'tv-btn alt', w, o[1]);
        b.addEventListener('click', function () { set(o[0]); bs.forEach(function (x, i) { x.className = 'tv-btn' + (opts[i][0] === cur() ? '' : ' alt'); }); });
        bs.push(b);
      });
      bs.forEach(function (x, i) { x.className = 'tv-btn' + (opts[i][0] === cur() ? '' : ' alt'); });
    }
    function paint() {
      bm.forEach(function (b, i) { b.className = 'tv-btn' + (MODES[i][0] === mode ? '' : ' alt'); });
      desc.textContent = MODE_DESC[mode];
      extra.innerHTML = '';
      if (mode === 'tap') return;
      seg('Cỡ cần', SIZES, J.size, J.setSize);
      el('div', 'tv-sub', extra, 'Độ rõ của cần');
      var rng = el('input', null, extra); rng.type = 'range'; rng.min = '30'; rng.max = '100'; rng.value = String(Math.round(opacity * 100)); rng.style.width = '100%';
      rng.addEventListener('input', function () { J.setOpacity(rng.value / 100); });
      if (mode === 'fixed') posEditor();
    }
    // live position editor for the fixed stick: a miniature of the screen (current orientation); drag the disc, the real stick follows
    function posEditor() {
      el('div', 'tv-sub', extra, 'Vị trí cần (kéo trong khung)');
      var pv = el('div', 'tv-joy-pv', extra), dot = document.createElement('i'), drag = false;
      var W = Math.min(260, Math.max(120, (extra.clientWidth || 260) - 10)), vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      pv.style.width = W + 'px'; pv.style.height = Math.round(W * vh / vw) + 'px';
      var dd = Math.max(14, Math.round(D * W / vw)); dot.style.width = dd + 'px'; dot.style.height = dd + 'px';
      pv.appendChild(dot);
      function draw() {
        var c = J.fixedPos(), fx, fy;
        if (c) { fx = c.x; fy = c.y; } else { measureFixed(); fx = fixedC.x / vw; fy = fixedC.y / vh; }
        dot.style.transform = 'translate3d(' + (fx * W - dd / 2) + 'px,' + (fy * pv.clientHeight - dd / 2) + 'px,0)';
      }
      function at(e) { var r = pv.getBoundingClientRect(); J.setFixedPos((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); draw(); }
      pv.addEventListener('pointerdown', function (e) { drag = true; try { pv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } at(e); });
      pv.addEventListener('pointermove', function (e) { if (drag) at(e); });
      pv.addEventListener('pointerup', function () { drag = false; });
      pv.addEventListener('pointercancel', function () { drag = false; });
      var rs = el('button', 'tv-btn alt', extra, 'Đặt lại vị trí');
      rs.addEventListener('click', function () { J.resetFixedPos(); draw(); });
      setTimeout(draw, 0);
    }
    paint();
    // camera sensitivity (one-finger drag, long-press camera): applies in every mode
    if (G.TouchCam) {
      el('div', 'tv-sub', body, 'Độ nhạy xoay camera');
      var cs = el('input', null, body); cs.type = 'range'; cs.min = '50'; cs.max = '200'; cs.value = String(Math.round(G.TouchCam.sensitivity() * 100)); cs.style.width = '100%';
      cs.addEventListener('input', function () { G.TouchCam.setSensitivity(cs.value / 100); });
      [['h', 'Đảo xoay ngang'], ['v', 'Đảo xoay dọc']].forEach(function (a) {
        el('div', 'tv-sub', body, a[1]);
        var w = el('div', 'tv-uis', body), off = el('button', 'tv-btn alt', w, 'Tắt'), on = el('button', 'tv-btn alt', w, 'Bật');
        function pt() { var v = G.TouchCam.invert(a[0]); off.className = 'tv-btn' + (v ? ' alt' : ''); on.className = 'tv-btn' + (v ? '' : ' alt'); }
        off.addEventListener('click', function () { G.TouchCam.setInvert(a[0], false); pt(); });
        on.addEventListener('click', function () { G.TouchCam.setInvert(a[0], true); pt(); });
        pt();
      });
    }
  };

  applyLook();
})();
