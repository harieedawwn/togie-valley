/* Togie Valley - ui_kit.js (Round 3 stage 26). Part 1: font readiness + keyboard scrolling for the shared scroll classes.
 * API: Game.Kit { panel, coin, fmt, scroll(el, horizontal), btn, card, row, pill, tabs, toggle, slider, modal, sheet, toast, esc } (marks a node as a .tv-scroll body, keyboard focusable). Depends on: nothing (loads after ui.js). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) { console.error('[ui_kit] missing Game'); return; }
  var Kit = G.Kit || (G.Kit = {});

  /* fonts: start loading both families now so panels never paint in a fallback face; swap handles the rest */
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 16px "Google Sans"', 'Chọn ngoại hình').catch(function () { /* offline */ });
    document.fonts.load('800 16px "Baloo 2"', 'Chọn ngoại hình').catch(function () { /* offline or blocked */ });
  }

  Kit.scroll = function (node, horizontal) {
    if (!node) return node;
    node.classList.add(horizontal ? 'tv-hscroll' : 'tv-scroll');
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    return node;
  };

  /* keyboard: arrows / page keys / home / end scroll the open panel body (the game's own key handlers stay untouched) */
  function target() {
    var look = document.querySelector('.lk-wrap .lk-body'), scrims, i, p;
    if (look) return look;
    scrims = document.querySelectorAll('.tv-scrim');
    for (i = scrims.length - 1; i >= 0; i--) { p = scrims[i].querySelector('.tv-scroll'); if (p) return p; }
    return null;
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key, t = e.target, tag = t && t.tagName, box, step, y;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'PageDown' && k !== 'PageUp' && k !== 'Home' && k !== 'End') return;
    box = target();
    if (!box || box.scrollHeight <= box.clientHeight) return;
    step = (k === 'PageDown' || k === 'PageUp') ? box.clientHeight * 0.85 : 56;
    y = k === 'Home' ? -1e6 : k === 'End' ? 1e6 : (k === 'ArrowUp' || k === 'PageUp') ? -step : step;
    box.scrollTop += y; e.preventDefault();
  });

  /* ------------------------------------------------ components (stage 26 part 2). All return DOM nodes; no per-frame work. */
  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined && html !== null) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sfx(n) { try { if (G.UI && G.UI.sfx) G.UI.sfx(n); } catch (e) { /* audio optional */ } }
  function icon(n, px) { return n && G.Icons && G.Icons.ui && (!G.Icons.has || G.Icons.has(n)) ? G.Icons.ui(n, px || 22) : ''; }
  function root() { return document.getElementById('ui') || document.body; }
  Kit.esc = esc;

  /* btn(label, kind 'primary'|'secondary'|'danger'|'blue'|'orange'|'icon', onClick, iconName) */
  Kit.btn = function (label, kind, fn, ico) {
    var b = el('button', 'k-btn' + (kind && kind !== 'primary' ? ' ' + kind : ''), null, icon(ico) + (label ? '<span>' + esc(label) + '</span>' : ''));
    b.type = 'button';
    if (kind === 'icon' && label) b.setAttribute('aria-label', label);
    if (fn) b.addEventListener('click', function () { sfx('tap'); fn(b); });
    return b;
  };
  Kit.card = function (html, parent) { return el('div', 'k-card', parent, html); };
  /* row({icon, title, sub, end, onClick}) -> div, or button when clickable */
  Kit.row = function (o, parent) {
    var r = el(o.onClick ? 'button' : 'div', 'k-row', parent, (o.icon ? '<span class="k-ico">' + icon(o.icon, 28) + '</span>' : '') +
      '<span class="k-txt">' + esc(o.title || '') + (o.sub ? '<span class="k-sub">' + esc(o.sub) + '</span>' : '') + '</span>' + (o.end !== undefined ? '<span class="k-end">' + esc(o.end) + '</span>' : ''));
    if (o.onClick) { r.type = 'button'; r.addEventListener('click', function () { sfx('tap'); o.onClick(r); }); }
    return r;
  };
  Kit.pill = function (text, tone, parent) { return el('span', 'k-pill' + (tone ? ' ' + tone : ''), parent, esc(text)); };
  /* tabs(items [{id,label}], active, onChange) -> {el, set(id)}; sideways scroll + arrow keys */
  Kit.tabs = function (items, active, fn) {
    var bar = el('div', 'k-tabs tv-hscroll', null), btns = {}, cur = active;
    bar.setAttribute('role', 'tablist');
    function set(id, silent) {
      cur = id;
      items.forEach(function (it) { var on = it.id === id; btns[it.id].classList.toggle('on', on); btns[it.id].setAttribute('aria-selected', on ? 'true' : 'false'); btns[it.id].tabIndex = on ? 0 : -1; });
      if (btns[id] && btns[id].scrollIntoView) { try { btns[id].scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* old webview */ } }
      if (!silent && fn) fn(id);
    }
    items.forEach(function (it) { var b = btns[it.id] = el('button', 'k-tab', bar, esc(it.label)); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', function () { sfx('tap'); set(it.id); }); });
    bar.addEventListener('keydown', function (e) {
      var i = -1; items.forEach(function (it, k) { if (it.id === cur) i = k; });
      if (e.key === 'ArrowRight' && i < items.length - 1) { set(items[i + 1].id); btns[items[i + 1].id].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && i > 0) { set(items[i - 1].id); btns[items[i - 1].id].focus(); e.preventDefault(); }
    });
    set(active, true);
    return { el: bar, set: set };
  };
  /* toggle({on, label, onChange}) -> button[role=switch] */
  Kit.toggle = function (o) {
    var b = el('button', 'k-toggle'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', o.on ? 'true' : 'false'); if (o.label) b.setAttribute('aria-label', o.label);
    b.addEventListener('click', function () { var v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); sfx('tap'); if (o.onChange) o.onChange(v); });
    return b;
  };
  /* slider({min,max,step,value,label,onInput}) -> input[type=range] */
  Kit.slider = function (o) {
    var s = el('input', 'k-slider'); s.type = 'range'; s.min = o.min !== undefined ? o.min : 0; s.max = o.max !== undefined ? o.max : 100; s.step = o.step || 1; s.value = o.value !== undefined ? o.value : 0;
    if (o.label) s.setAttribute('aria-label', o.label);
    s.addEventListener('input', function () { if (o.onInput) o.onInput(parseFloat(s.value)); });
    return s;
  };
  /* modal({title, body: node|html, actions: [{label, kind, onClick, keep}], sheet, width, onClose}) -> {el, body, close}. Esc and scrim tap close. */
  var modals = [];
  Kit.modal = function (o) {
    o = o || {};
    var scrim = el('div', 'k-ui k-scrim' + (o.sheet ? ' sheet' : ''), root()), box = el('div', 'k-modal', scrim), body, bar, closed = false, h;
    if (o.width) box.style.setProperty('--k-w', o.width + 'px');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    if (o.title) { h = el('h2', null, box, esc(o.title)); box.setAttribute('aria-label', o.title); }
    body = el('div', 'k-body tv-scroll', box);
    if (o.body && o.body.nodeType) body.appendChild(o.body); else if (o.body) body.innerHTML = o.body;
    if (o.actions && o.actions.length) bar = el('div', 'k-bar', box);
    function close() {
      if (closed) return; closed = true;
      var i = modals.indexOf(api); if (i >= 0) modals.splice(i, 1);
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      if (o.onClose) o.onClose();
    }
    var api = { el: box, body: body, bar: bar, close: close };
    (o.actions || []).forEach(function (a) { bar.appendChild(Kit.btn(a.label, a.kind || 'primary', function () { if (a.onClick) a.onClick(api); if (!a.keep) close(); }, a.icon)); });
    scrim.addEventListener('pointerdown', function (e) { if (e.target === scrim && o.dismiss !== false) close(); });
    modals.push(api); sfx('pop');
    return api;
  };
  Kit.sheet = function (o) { o = o || {}; o.sheet = true; return Kit.modal(o); };
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modals.length) { modals[modals.length - 1].close(); e.preventDefault(); } }, true);
  /* toast(msg, iconName): max 3 stacked, auto fade after 2.6 s */
  var toastBox = null;
  Kit.toast = function (msg, ico) {
    if (!toastBox) toastBox = el('div', 'k-ui k-toasts', root());
    while (toastBox.children.length >= 3) toastBox.removeChild(toastBox.firstChild);
    var t = el('div', 'k-toast', toastBox, icon(ico) + '<span>' + esc(msg) + '</span>');
    t.setAttribute('role', 'status');
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320); }, 2600);
    return t;
  };
  /* ------------------------------------------------ panel scaffold (stage 27): header (title, coin chip, close X) + optional nav tabs + main + sticky bar.
   * panel({title, cls, coin, detail}) -> {el, title, setCoin(n), nav, main, detail, side, tabs, list, sub, bar, mode(hasDetail), reset(), open(opts), close()}.
   * Layout (css): portrait = detail above tabs + list; landscape (.split) = list left, detail right; phone portrait = bottom sheet; laptop = centred, max 560-760px.
   * Body parts: list is the one .tv-scroll container, tabs a .tv-hscroll row, bar the bottom action bar (stays visible). Fill with reset(), then append. */
  Kit.fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  Kit.coin = function (n, px) { return icon('coin', px || 18) + '<b>' + Kit.fmt(n) + '</b>'; };
  Kit.panel = function (o) {
    o = o || {};
    var p = el('div', 'tv-wide k-ui kp' + (o.cls ? ' ' + o.cls : '')), head = el('div', 'kp-head', p), t = el('div', 'kp-title', head, esc(o.title || '')), chip = o.coin ? el('span', 'kp-coin', head) : null;
    var x = el('button', 'k-btn icon danger kp-x', head, icon('close', 22)), sub = el('div', 'kp-sub', p), nav = el('div', 'kp-nav', p), main = el('div', 'kp-main', p), bar = el('div', 'k-bar kp-bar', p);
    var detail = el('div', 'kp-detail', main), side = el('div', 'kp-side', main), tabs = el('div', 'kp-tabs', side), list = el('div', 'kp-list', side);
    t.setAttribute('role', 'heading'); x.type = 'button'; x.setAttribute('aria-label', 'Đóng');
    x.addEventListener('click', function () { sfx('tap'); if (G.UI) G.UI.closePanel(); });
    Kit.scroll(list);
    var api = { el: p, title: t, nav: nav, main: main, detail: detail, side: side, tabs: tabs, list: list, sub: sub, bar: bar };
    api.setCoin = function (n) { if (chip) chip.innerHTML = Kit.coin(n, 20); };
    api.mode = function (hasDetail) { detail.hidden = !hasDetail; main.classList.toggle('split', !!hasDetail); return api; };
    api.reset = function () { detail.innerHTML = ''; tabs.innerHTML = ''; list.innerHTML = ''; bar.innerHTML = ''; list.scrollTop = 0; return api; };
    api.close = function () { if (G.UI) G.UI.closePanel(); };
    api.open = function (opts) { var n = G.UI.openPanel(p, opts); if (p.parentNode) p.parentNode.classList.add('kp-scrim'); return n; };
    api.mode(!!o.detail);
    return api;
  };
  /* ------------------------------------------------ tooltips (stage 28): [title] shown as one kit pop, mouse hover only (touch never sees it). One reused node, no per-frame work. */
  var tip = null, tipFor = null, tipTxt = '';
  function tipHide() { if (tipFor) { if (!tipFor.getAttribute('title') && tipTxt) tipFor.setAttribute('title', tipTxt); tipFor = null; } if (tip) tip.classList.remove('on'); }
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var t = e.target && e.target.closest ? e.target.closest('[title]') : null;
    if (!t || t === tipFor) return;
    tipHide();
    tipTxt = t.getAttribute('title'); if (!tipTxt) return;
    t.removeAttribute('title'); tipFor = t;
    if (!tip) { tip = document.createElement('div'); tip.className = 'k-ui k-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = tipTxt;
    var r = t.getBoundingClientRect(), w = tip.offsetWidth, x = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)), y = r.top - tip.offsetHeight - 8;
    tip.style.left = x + 'px'; tip.style.top = (y < 6 ? r.bottom + 8 : y) + 'px'; tip.classList.add('on');
  }, true);
  document.addEventListener('pointerout', function (e) { if (tipFor && e.pointerType === 'mouse' && !(e.relatedTarget && tipFor.contains(e.relatedTarget))) tipHide(); }, true);
  document.addEventListener('pointerdown', tipHide, true);
})();
