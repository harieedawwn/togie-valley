/* Togie Valley - look_ui.js (Round 2 stage 2). Appearance editor: Game.LookUI.open(cb). cb runs after "Xong".
 * Also binds the look to the save (section 'look', player scope) and to the hero rig (look:changed -> Player.hero.setLook).
 * Live 3D preview: a second scene is drawn with the game's own WebGL renderer into a small render target, read back and shown on a 2D canvas
 * (no second WebGL context). ~15 fps, only while the editor is open. Load after saveslots.js / panels.js (needs ui.js, save.js, player.js). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Look || !G.UI || !G.Save || !G.Models || !G.Render) { console.error('[look_ui] missing deps'); return; }
  var Look = G.Look, UI = G.UI, E = G.Events, R = G.Render, M = G.Models;

  /* ------------------------------------------------ save + hero binding */
  G.Save.register('look', {
    save: function () { return { v: 1, look: Look.encode(Look.get()), chosen: Look.chosen() }; },
    load: function (o) {
      Look.set(Look.decode(o && o.look), true);
      Look.markChosen(!!(o && o.chosen));
      E.emit('look:changed', { look: Look.get() });
    },
    reset: function () { Look.reset(); }
  }, 'player');
  function applyHero() {
    var h = G.Player && G.Player.hero;
    if (h && h.setLook) h.setLook(Look.resolve(Look.get()));
  }
  E.on('look:changed', applyHero);
  applyHero();

  /* ------------------------------------------------ DOM helpers */
  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function hex(c) { var s = c.toString(16); while (s.length < 6) s = '0' + s; return '#' + s; }
  function tap(b, fn) { b.addEventListener('click', function () { UI.sfx('tap'); fn(); }); return b; }

  /* ------------------------------------------------ preview (shared renderer, render target) */
  var PW = 336, PH = 400, pv = null;
  function pvInit(canvas) {
    var r = R.renderer, U = R.uniforms;
    if (!r || typeof r.readRenderTargetPixels !== 'function') return null;
    var p = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(26, PW / PH, 0.1, 30), yaw: 0.5, drag: false, lastX: 0, t: 0, acc: 0 };
    p.cam.position.set(0, 0.64, 3.5); p.cam.lookAt(0, 0.6, 0);
    p.rt = new THREE.WebGLRenderTarget(PW, PH, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
    p.buf = new Uint8Array(PW * PH * 4);
    p.flip = new Uint8ClampedArray(PW * PH * 4);
    p.ctx = canvas.getContext('2d'); p.img = new ImageData(p.flip, PW, PH);
    p.ch = M.character({ look: Look.resolve(Look.get()), shadow: false });
    p.scene.add(p.ch.root);
    var base = M.mergeParts([M.part(new THREE.CylinderGeometry(0.52, 0.56, 0.06, 28, 1), 0xb5dcc0, [0, -0.03, 0])]);
    var disc = new THREE.Mesh(base, M.material('char')); p.scene.add(disc); p.disc = disc;
    // fixed, daytime lighting for the preview (saved/restored around each draw; no allocation per frame)
    p.sv = { ld: new THREE.Vector3(), lc: new THREE.Color(), am: new THREE.Color(), fr: new THREE.Vector2(), clear: new THREE.Color() };
    p.day = { ld: new THREE.Vector3(0.3, 0.8, 0.5).normalize(), lc: new THREE.Color(0.42, 0.38, 0.26), am: new THREE.Color(0.62, 0.66, 0.76) };
    p.U = U;
    canvas.addEventListener('pointerdown', function (e) { p.drag = true; p.lastX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    canvas.addEventListener('pointermove', function (e) { if (!p.drag) return; p.yaw += (e.clientX - p.lastX) * 0.012; p.lastX = e.clientX; });
    var up = function () { p.drag = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    return p;
  }
  function pvDraw(p, dt) {
    var r = R.renderer, U = p.U, s = p.sv, y, row = PW * 4, prev;
    if (!r) return;
    try { if (r.getContext && r.getContext().isContextLost()) return; } catch (e0) { return; }
    if (!p.drag) p.yaw += dt * 0.7;
    p.ch.root.rotation.y = p.yaw;
    p.ch.update(dt, 0);
    s.ld.copy(U.uLightDir.value); s.lc.copy(U.uLightColor.value); s.am.copy(U.uAmbient.value); s.fr.copy(U.uFogRange.value);
    var sa = U.uSeasonAmt.value;
    U.uLightDir.value.copy(p.day.ld); U.uLightColor.value.copy(p.day.lc); U.uAmbient.value.copy(p.day.am); U.uFogRange.value.set(500, 1000); U.uSeasonAmt.value = 0;
    r.getClearColor(s.clear); var ca = r.getClearAlpha(); prev = r.getRenderTarget();
    try {
      r.setRenderTarget(p.rt); r.setClearColor(0x000000, 0); r.clear();
      r.render(p.scene, p.cam);
      r.readRenderTargetPixels(p.rt, 0, 0, PW, PH, p.buf);
    } finally {
      r.setRenderTarget(prev); r.setClearColor(s.clear, ca);
      U.uLightDir.value.copy(s.ld); U.uLightColor.value.copy(s.lc); U.uAmbient.value.copy(s.am); U.uFogRange.value.copy(s.fr); U.uSeasonAmt.value = sa;
    }
    for (y = 0; y < PH; y++) p.flip.set(p.buf.subarray((PH - 1 - y) * row, (PH - y) * row), y * row);   // GL rows are bottom-up
    p.ctx.putImageData(p.img, 0, 0);
  }
  function pvFree(p) {
    if (!p) return;
    p.ch.dispose(); p.scene.remove(p.disc); p.rt.dispose();
  }

  /* ------------------------------------------------ editor */
  var TABS = [['hair', 'Tóc'], ['face', 'Mặt'], ['hat', 'Mũ'], ['acc', 'Phụ kiện'], ['cloth', 'Áo quần'], ['preset', 'Bộ gợi ý']];
  var TS = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var TICON = {   // tab icons: small stroke SVGs (no assets); cloth / preset reuse the shared icon set when present
    hair: TS + '<path d="M5 15c0-6 3-10 7-10s7 4 7 10c-3-1-5-4-6-7-1 3-4 6-8 7z"/></svg>',
    face: TS + '<circle cx="12" cy="12" r="8.5"/><path d="M9 10v1M15 10v1M8.5 14.5c2 2.5 5 2.5 7 0"/></svg>',
    hat: TS + '<path d="M3 17h18M6 17c0-6 2-10 6-10s6 4 6 10"/></svg>',
    acc: TS + '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 13.5c1-1 2-1 3 0M3.5 13L5 8M20.5 13L19 8"/></svg>'
  };
  function tabIcon(id) { var n = id === 'cloth' ? 'shirt' : id === 'preset' ? 'star' : null; return TICON[id] || (n && G.Icons && G.Icons.has && G.Icons.has(n) ? G.Icons.ui(n, 22) : ''); }
  var openState = null;

  function open(cb) {
    if (openState) return;
    var cur = Look.get(), tab = 'hair', raf = 0, lastT = 0, acc = 0, closed = false, P = G.Player;
    var wrap = el('div', 'lk-wrap k-ui', document.body), card = el('div', 'lk-card', wrap);
    var head = el('h2', 'lk-title', card, 'Chọn ngoại hình');
    if (G.Net && G.Net.bindNameInput) G.Net.bindNameInput(el('input', 'lk-name', head));
    var left = el('div', 'lk-left', card), right = el('div', 'lk-right', card), foot = el('div', 'lk-foot k-bar', card);
    var canvas = el('canvas', 'lk-prev', left); canvas.width = PW; canvas.height = PH; canvas.setAttribute('aria-label', 'Xem trước nhân vật');
    var rot = el('div', 'lk-rot', left);
    [['‹', -0.7, 'Xoay trái'], ['›', 0.7, 'Xoay phải']].forEach(function (r) {
      var rb = el('button', 'k-btn icon secondary', rot, r[0]); rb.type = 'button'; rb.setAttribute('aria-label', r[2]);
      tap(rb, function () { if (pv) pv.yaw += r[1]; });
    });
    el('div', 'lk-hint', left, 'Kéo để xoay');
    var tabs = el('div', 'lk-tabs k-tabs tv-hscroll', right), body = el('div', 'lk-body tv-scroll', right), tabBtns = {};
    openState = { wrap: wrap };
    if (P && P.lock) P.lock('look');
    try { pv = pvInit(canvas); } catch (err) { console.error('[look_ui] preview', err); pv = null; }
    if (!pv) canvas.style.display = 'none';

    function done() {
      if (closed) return; closed = true;
      cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true);
      Look.markChosen(true); if (G.Save.request) G.Save.request();
      pvFree(pv); pv = null;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      openState = null;
      if (P && P.unlock) P.unlock('look');
      if (typeof cb === 'function') cb();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } }
    document.addEventListener('keydown', onKey, true);

    function change(l, note) {
      cur = Look.validate(l);
      Look.set(cur);
      if (pv) pv.ch.setLook(Look.resolve(cur));
      if (note) UI.toast(note, 'check');
      render();
    }
    function chips(parent, ids, labels, now, pick) {
      var row = el('div', 'lk-row', parent);
      ids.forEach(function (id, i) {
        var b = el('button', 'lk-chip' + (now === id ? ' on' : ''), row, labels[i]); b.type = 'button'; b.setAttribute('aria-pressed', now === id ? 'true' : 'false');
        tap(b, function () { pick(id); });
      });
    }
    function swatches(parent, colors, now, pick, label) {
      var row = el('div', 'lk-row lk-sws', parent);
      colors.forEach(function (c, i) {
        var b = el('button', 'lk-sw' + (now === i ? ' on' : ''), row); b.type = 'button'; b.style.background = hex(c);
        b.setAttribute('aria-label', label + ' ' + (i + 1)); b.setAttribute('aria-pressed', now === i ? 'true' : 'false');
        tap(b, function () { pick(i); });
      });
    }
    function sec(t) { el('div', 'lk-sec', body, t); }
    function set(k, v) { var l = JSON.parse(JSON.stringify(cur)); l[k] = v; change(l); }

    function render() {
      var i, k, L = Look.LABEL, I = Look.IDS, Pl = Look.PAL;
      for (k in tabBtns) { tabBtns[k].className = 'lk-tab k-tab' + (k === tab ? ' on' : ''); tabBtns[k].setAttribute('aria-selected', k === tab ? 'true' : 'false'); }
      body.innerHTML = ''; body.scrollTop = 0;
      if (tab === 'hair') {
        sec('Kiểu tóc'); chips(body, I.hairStyle, L.hairStyle, cur.hairStyle, function (v) { set('hairStyle', v); });
        sec('Màu tóc'); swatches(body, Pl.hair, cur.hair, function (v) { set('hair', v); }, 'Màu tóc');
      } else if (tab === 'face') {
        sec('Màu da'); swatches(body, Pl.skin, cur.skin, function (v) { set('skin', v); }, 'Màu da');
        sec('Màu mắt'); swatches(body, Pl.eyes, cur.eyes, function (v) { set('eyes', v); }, 'Màu mắt');
        sec('Mũi'); chips(body, I.nose, L.nose, cur.nose, function (v) { set('nose', v); });
      } else if (tab === 'hat') {
        sec('Mũ'); chips(body, I.hat, L.hat, cur.hat, function (v) {
          var had = cur.acc.length, l = Look.setHat(cur, v);
          change(l, v !== 'none' && l.acc.length < had ? 'Phụ kiện đội đầu được cất đi để đội mũ.' : null);
        });
      } else if (tab === 'acc') {
        sec('Phụ kiện (tối đa 2)');
        var row = el('div', 'lk-row', body);
        I.acc.forEach(function (id, i2) {
          var on = cur.acc.indexOf(id) >= 0, b = el('button', 'lk-chip' + (on ? ' on' : ''), row, L.acc[i2]); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
          tap(b, function () {
            var hadHat = cur.hat !== 'none', l = Look.toggleAcc(cur, id);
            change(l, hadHat && l.hat === 'none' ? 'Đã cất mũ để đeo phụ kiện này.' : null);
          });
        });
      } else if (tab === 'cloth') {
        sec('Áo'); chips(body, I.top, L.top, cur.top, function (v) { set('top', v); });
        sec('Màu áo'); swatches(body, Pl.top, cur.topColor, function (v) { set('topColor', v); }, 'Màu áo');
        sec('Quần / váy'); chips(body, I.bottom, L.bottom, cur.bottom, function (v) { set('bottom', v); });
        sec('Màu quần / váy'); swatches(body, Pl.pants, cur.pantsColor, function (v) { set('pantsColor', v); }, 'Màu quần');
      } else {
        sec('Bộ gợi ý');
        var grid = el('div', 'lk-presets', body);
        Look.presets.forEach(function (p) {
          var b = el('button', 'lk-pre', grid), dots = el('span', 'lk-dots', b);
          b.type = 'button';
          [Pl.skin[p.look.skin], Pl.top[p.look.topColor], Pl.pants[p.look.pantsColor], Pl.hair[p.look.hair]].forEach(function (c) { el('i', null, dots).style.background = hex(c); });
          el('span', 'lk-pn', b, p.name);
          tap(b, function () { change(p.look); });
        });
      }
    }

    TABS.forEach(function (t) {
      var b = el('button', 'lk-tab k-tab', tabs, tabIcon(t[0]) + '<span>' + t[1] + '</span>'); b.type = 'button'; b.setAttribute('role', 'tab'); tabBtns[t[0]] = b;
      tap(b, function () { tab = t[0]; render(); });
    });
    var rnd = el('button', 'k-btn secondary lk-btn', foot, 'Ngẫu nhiên'), ok = el('button', 'k-btn lk-btn', foot, 'Xong');
    rnd.type = ok.type = 'button';
    tap(rnd, function () { change(Look.random()); });
    tap(ok, done);
    render();

    function frame(t) {
      if (closed) return;
      raf = requestAnimationFrame(frame);
      var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016;
      lastT = t; acc += dt;
      if (acc < 0.066 || !pv) return;   // ~15 fps
      pvDraw(pv, acc); acc = 0;
    }
    raf = requestAnimationFrame(frame);
  }

  G.LookUI = { open: open, isOpen: function () { return !!openState; } };
})();
