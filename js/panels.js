/* Togie Valley - panels.js (Stage 4): backpack/skills/settings/notebook tabs, UI.openContainer, title screen.
 * Depends on: ui, state, items, save, time, player. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Inventory || !G.Items || !G.State || !G.Save || !G.Containers || !G.Icons || !G.Kit) { console.error('[panels] dependencies missing'); return; }
  var Kit = G.Kit, UI = G.UI, Icons = G.Icons, E = G.Events, Inv = G.Inventory, Items = G.Items;
  var ui = document.getElementById('ui');

  function el(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function btn(label, parent, fn, cls) {
    var b = el('button', 'tv-btn' + (cls ? ' ' + cls : ''), parent, label);
    b.addEventListener('click', function (ev) { buzz(); UI.sfx('tap'); fn(ev); });
    return b;
  }

  /* ------------------------------------------------ slot rendering + long press */
  function paintSlot(b, slot, extra) {
    var def = slot && Items.get(slot.id);
    var arrived = b._init && slot && (b._id !== slot.id || slot.n > b._n);
    var cntPop = b._init && slot && slot.n > 1 && b._id === slot.id && slot.n !== b._n;
    b._init = true; b._id = slot ? slot.id : null; b._n = slot ? slot.n : 0;
    b.className = 'tv-slot' + (def ? ' cat-' + def.cat : ' empty') + (extra || '') + (arrived ? ' bump' : '');
    b.dataset.tier = slot && slot.tier ? slot.tier : 0;
    b.innerHTML = (def ? Icons.item(def, 40, slot.tier, slot.q) : '') + (slot && slot.tier && def && def.cat === 'tool' ? '<span class="tv-glint"><i></i></span>' : '') + (slot && slot.n > 1 ? '<span class="cnt' + (cntPop ? ' pop' : '') + '">' + slot.n + '</span>' : '');
    b.title = def ? def.name : '';
  }
  function describe(slot) {
    var def = slot && Items.get(slot.id);
    if (!def) return '';
    var q = slot.q && slot.q !== 'normal' ? ' (' + (slot.q === 'gold' ? 'vàng' : 'bạc') + ')' : '';
    var t = slot.tier ? ' · ' + Items.TIERS[slot.tier] : '';
    return '<b>' + Icons.item(def, 20, slot.tier, slot.q) + ' ' + esc(def.name) + esc(q) + esc(t) + '</b>' + esc(def.tip || '');
  }
  /* tap(ev) on short press, hold() after 420 ms (suppresses the tap) */
  function pressable(b, tap, hold) {
    var t = 0, fired = false;
    function clear() { clearTimeout(t); t = 0; }
    b.addEventListener('pointerdown', function () {
      fired = false; clear();
      if (hold) t = setTimeout(function () { t = 0; fired = true; buzz(); hold(); }, 420);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { b.addEventListener(n, clear); });
    b.addEventListener('click', function (ev) { if (fired) { fired = false; return; } buzz(); UI.sfx('tap'); tap(ev); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); if (hold) { fired = true; hold(); } });
  }

  function fly(fromEl, toEl, def) {
    if (!fromEl || !toEl || !def) return;
    var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    var f = el('div', 'tv-fly', document.body, Icons.item(def, 28));
    f.style.left = (a.left + a.width / 2 - 14) + 'px'; f.style.top = (a.top + a.height / 2 - 14) + 'px';
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      f.style.transform = 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(.8)'; f.style.opacity = '.3';
    }); });
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 340);
  }

  /* ------------------------------------------------ grid view of a container */
  function Grid(container, parent, handlers) {
    var wrap = el('div', 'tv-grid', parent), cells = [], self = this;
    this.cells = cells; this.container = container; this.pick = -1;
    function build() {
      wrap.innerHTML = ''; cells.length = 0;
      for (var i = 0; i < container.size; i++) (function (i) {
        var b = el('button', 'tv-slot', wrap);
        pressable(b, function () { handlers.tap(i, b, self); }, handlers.hold ? function () { handlers.hold(i, b, self); } : null);
        cells.push(b);
      })(i);
    }
    this.render = function () {
      if (cells.length !== container.size) build();
      for (var i = 0; i < cells.length; i++) paintSlot(cells[i], container.get(i), i === self.pick ? ' pick' : '');
    };
    build(); this.render();
  }

  /* ------------------------------------------------ tabs */
  var tabsPanel = null, menuKp = null, navUi = null, tabState = 'bag';
  function skillRow(parent, key, label, ico) {
    var p = G.State.progress(key), row = el('div', 'kp-skill', parent);
    var pct = p.need > 0 ? Math.min(100, Math.round(p.into / p.need * 100)) : 100;
    el('div', 'kp-sk-h', row, ico + '<span>' + esc(label) + '</span><b class="k-pill orange">Cấp ' + p.level + '</b>');
    var bar = el('div', 'tv-bar', row); el('i', null, bar).style.width = pct + '%';
    el('small', null, row, p.need > 0 ? p.into + ' / ' + p.need + ' XP' : 'Cấp tối đa!');
  }
  function edible(d) { return !!d && (d.cat === 'food' || d.cat === 'crop' || d.cat === 'fish'); }

  function renderBag(k) {
    var sel = -1, cur = Inv.selectedIndex(), grid, useBtn, sortBtn;
    k.mode(true);
    function showInfo(i) {
      var slot = Inv.get(i), def = slot && Items.get(slot.id), q, t;
      cur = i; k.detail.innerHTML = '';
      if (!def) { el('div', 'kp-empty', k.detail, 'Ô trống'); useBtn.disabled = true; return; }
      q = slot.q && slot.q !== 'normal' ? (slot.q === 'gold' ? 'vàng' : 'bạc') : '';
      t = slot.tier ? Items.TIERS[slot.tier] : '';
      el('div', 'kp-d-ico', k.detail, Icons.item(def, 64, slot.tier, slot.q));
      el('div', 'kp-d-info', k.detail, '<div class="kp-d-name">' + esc(def.name) + '</div><div class="kp-d-tip">' + esc(def.tip || '') + '</div><div class="kp-d-meta"><span>Số lượng: ' + slot.n + '</span>' +
        (q ? '<span>Chất lượng: ' + q + '</span>' : '') + (t ? '<span>' + esc(t) + '</span>' : '') + '</div>');
      useBtn.disabled = !edible(def);
    }
    function use() {
      var slot = Inv.get(cur), def = slot && Items.get(slot.id), si = Inv.selectedIndex();
      if (!edible(def) || !G.Economy || !G.Economy.eat) return;
      if (cur >= 6) { if (cur !== si) Inv.move(cur, si); } else Inv.select(cur);
      UI.closePanel(); G.Economy.eat();
    }
    sortBtn = Kit.btn('Sắp xếp', 'secondary', function () { sortInventory(); sel = -1; grid.pick = -1; grid.render(); showInfo(cur); }, 'sort');
    useBtn = Kit.btn('Dùng', 'primary', use); useBtn.classList.add('kp-main-btn');
    k.bar.appendChild(sortBtn); k.bar.appendChild(useBtn);
    grid = new Grid(Inv.container, k.list, {
      tap: function (i, b, g) {
        if (sel < 0) { if (Inv.get(i)) { sel = i; g.pick = i; showInfo(i); } }
        else {
          if (sel !== i) { Inv.move(sel, i); UI.sfx('pop'); }
          sel = -1; g.pick = -1; showInfo(i);
        }
        g.render();
      },
      hold: function (i) { showInfo(i); }
    });
    showInfo(cur);
    var off = E.on('inventory:changed', function () { if (grid.cells.length && document.body.contains(grid.cells[0])) { grid.render(); showInfo(cur); } else off(); });
  }
  function sortInventory() {
    var inv = Inv.container, all = [], i, s;
    for (i = 0; i < inv.size; i++) { s = inv.get(i); if (s) all.push(s); }
    var cats = Items.CATEGORIES;
    all.sort(function (a, b) {
      var da = Items.get(a.id), db = Items.get(b.id);
      var c = cats.indexOf(da.cat) - cats.indexOf(db.cat);
      if (c) return c;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return Items.QUALITIES.indexOf(b.q) - Items.QUALITIES.indexOf(a.q);
    });
    var sel = Inv.selectedIndex(), keepId = Inv.get(sel);
    for (i = 0; i < inv.size; i++) inv.slots[i] = null;
    all.forEach(function (x) { inv.add(x.id, x.n, x.q, x.tier); });
    inv.set(0, inv.get(0)); // fire change once more
    if (keepId) Inv.select(0);
  }
  function renderSkills(k) {
    var rows = el('div', 'kp-rows', k.list);
    skillRow(rows, 'farming', 'Làm nông', Icons.ui('sprout', 36)); skillRow(rows, 'fishing', 'Câu cá', Icons.item({ tpl: 'rod', c1: '#b9d46a', c2: '#e8b878' }, 36, 0, true));
  }
  function renderNotebook(k) {
    if (G.Notebook) { G.Notebook.render(k); return; }
    el('div', 'kp-empty', k.list, 'Sổ tay sẽ có ở đây.');
  }
  function renderSettings(k) {   // Round 3 s7: tabbed, see settings.js
    if (G.Settings) G.Settings.render(k.list); else el('div', 'kp-empty', k.list, 'Cài đặt chưa sẵn sàng.');
  }

  var TABS = [['bag', 'Túi đồ', renderBag], ['skills', 'Kỹ năng', renderSkills], ['book', 'Sổ tay', renderNotebook], ['set', 'Cài đặt', renderSettings]];
  function showTab(name) {
    if (!tabsPanel || !menuKp) return;
    if (titleEl) name = 'set';   // title: only Settings (the other tabs need a running game)
    tabState = name;
    menuKp.nav.style.display = titleEl ? 'none' : '';
    menuKp.reset(); menuKp.mode(false); menuKp.sub.innerHTML = '';
    if (navUi) navUi.set(name, true);
    TABS.forEach(function (t) { if (t[0] === name) { menuKp.title.textContent = t[1]; t[2](menuKp); } });
  }
  UI.openMenu = function (tab) {
    if (tabsPanel) { showTab(tab || tabState); return; }
    menuKp = Kit.panel({ title: 'Túi đồ', cls: 'kp-tall kp-menu' }); tabsPanel = menuKp.el;
    navUi = Kit.tabs(TABS.map(function (t) { return { id: t[0], label: t[1] }; }), tab || 'bag', function (id) { showTab(id); });
    menuKp.nav.appendChild(navUi.el);
    menuKp.open({ onClose: function () { tabsPanel = null; menuKp = null; navUi = null; } });
    showTab(tab || 'bag');
  };
  UI.openBackpack = function () { UI.openMenu('bag'); };
  E.on('ui:backpack', function () { if (titleEl || G.Player.isLocked()) return; if (tabsPanel) UI.closePanel(); else if (!UI.panelOpen) UI.openMenu('bag'); });
  E.on('ui:menu', function () { if (!UI.panelOpen && !titleEl) { if (G.Menus) G.Menus.openPause(); else UI.openMenu(); } });   // Stage 15C: tile grid

  /* ------------------------------------------------ openContainer(container, opts) */
  /* opts: {title, filter(slot)->bool, onChange(container), onClose} */
  UI.openContainer = function (container, opts) {
    opts = opts || {};
    if (!container || !container.get) { console.error('[panels] openContainer: bad container'); return null; }
    var k = Kit.panel({ title: opts.title || 'Rương', cls: 'kp-tall tv-chest' }), p = k.el, cols, c1, c2;
    p.kp = k;
    var tip = el('div', 'kp-info', null, 'Chạm: chuyển cả chồng · Giữ: chuyển một');
    function accepts(slot) { return !opts.filter || opts.filter(slot); }
    function changed() { if (opts.onChange) try { opts.onChange(container); } catch (e) { console.error(e); } }
    function transfer(from, to, i, mode, srcEl, toGrid) {
      var s = from.get(i);
      if (!s) return;
      if (to === container && !accepts(s)) { UI.toast('Món này không bỏ vào đây được.', 'no'); return; }
      var def = Items.get(s.id), n = s.n;
      if (mode === 'one') n = 1; else if (mode === 'half') n = Math.max(1, Math.floor(s.n / 2));
      if (def && def.cat === 'tool' && to !== Inv.container && to === container) { UI.toast('Dụng cụ phải mang theo bên mình nhé.', 'lock'); return; }
      var added = to.add(s.id, n, s.q, s.tier, to.ownerTag ? to.ownerTag() : undefined);   // shared sell bin / crate remember who put it in
      if (added <= 0) { UI.toast('Hết chỗ rồi!', 'box'); return; }
      from.removeAt(i, added);
      var tgt = toGrid.cells[0];
      for (var k2 = 0; k2 < toGrid.cells.length; k2++) { var ts = to.get(k2); if (ts && ts.id === s.id) { tgt = toGrid.cells[k2]; break; } }
      fly(srcEl, tgt, def);
      UI.sfx('pop'); changed();
    }
    var cg, bg;
    k.main.innerHTML = '';
    cols = el('div', 'kp-cols', k.main);
    c1 = el('div', 'kp-col', cols); el('div', 'tv-sub', c1, 'Rương'); Kit.scroll(el('div', 'kp-list', c1));
    c2 = el('div', 'kp-col', cols); el('div', 'tv-sub', c2, 'Túi đồ'); Kit.scroll(el('div', 'kp-list', c2));
    k.main.appendChild(tip);
    cg = new Grid(container, c1.lastChild, {
      tap: function (i, b) { transfer(container, Inv.container, i, 'all', b, bg); },
      hold: function (i, b) { var s = container.get(i); tip.innerHTML = describe(s); transfer(container, Inv.container, i, s && s.n > 4 ? 'half' : 'one', b, bg); }
    });
    var take = Kit.btn('Lấy hết', 'primary', function () {
      var moved = 0;
      for (var i = 0; i < container.size; i++) {
        var s = container.get(i); if (!s) continue;
        var a = Inv.container.add(s.id, s.n, s.q, s.tier);
        if (a > 0) { fly(cg.cells[i], bg.cells[0], Items.get(s.id)); container.removeAt(i, a); moved += a; }
      }
      if (moved) { UI.sfx('pop'); changed(); } else UI.toast(container.isEmpty() ? 'Không còn gì để lấy.' : 'Hết chỗ rồi!', 'box');
    });
    take.classList.add('kp-main-btn'); k.bar.appendChild(take);
    bg = new Grid(Inv.container, c2.lastChild, {
      tap: function (i, b) { transfer(Inv.container, container, i, 'all', b, cg); },
      hold: function (i, b) { var s = Inv.get(i); tip.innerHTML = describe(s); transfer(Inv.container, container, i, s && s.n > 4 ? 'half' : 'one', b, cg); }
    });
    var offs = [E.on('inventory:changed', function () { bg.render(); })];
    container.onChange(function () { if (document.body.contains(p)) cg.render(); });
    k.open({ onClose: function () { offs.forEach(function (o) { o(); }); if (opts.onClose) opts.onClose(); } });
    return p;
  };

  /* ------------------------------------------------ title screen */
  var titleEl = null;
  function closeTitle() {
    if (!titleEl) return;
    if (titleEl.parentNode) titleEl.parentNode.removeChild(titleEl);
    titleEl = null; document.body.classList.add('tv-playing');
    if (G.BootScene) G.BootScene.release();   // stage 30: title backdrop fades out
    G.Time.resume('title'); G.Player.unlock('title');
  }
  function decorateTitle(parent) { // drifting clouds, hills, falling leaves (pure CSS animation)
    var d = el('div', 'tv-deco', parent), i, f;
    d.setAttribute('aria-hidden', 'true');
    for (i = 1; i <= 4; i++) el('i', 'tv-cloud c' + i, d);
    el('i', 'tv-hill hill-a', d); el('i', 'tv-hill hill-b', d);
    for (i = 0; i < 9; i++) {
      f = el('i', 'tv-leaf l' + (i % 3 + 1), d);
      f.style.left = ((6 + i * 11) % 96) + '%';
      f.style.animationDuration = (9 + (i * 7) % 6) + 's';
      f.style.animationDelay = '-' + ((i * 5) % 12) + 's';
    }
  }
  function showTitle() {
    if (!ui || titleEl) return;
    titleEl = el('div', null, ui); titleEl.id = 'tv-title';
    if (G.Menus) { G.Time.pause('title'); G.Player.lock('title'); G.Menus.buildTitle(titleEl, closeTitle); return; }   // Stage 15C
    decorateTitle(titleEl);
    el('h1', null, titleEl, '<span class="logo-ico">' + Icons.item({ tpl: 'wheat' }, 64) + '</span><span class="w1">Togie</span><span class="w2">Valley</span>').setAttribute('aria-label', 'Togie Valley');
    el('p', null, titleEl, 'Một nông trại nhỏ ấm cúng đang chờ bạn.');
    G.Time.pause('title'); G.Player.lock('title');
    if (G.SaveSlots) { G.SaveSlots.buildTitle(titleEl, closeTitle); return; }   // Stage 14A: slot list replaces Continue / New game
    if (G.Save.has()) btn(Icons.ui('play', 22) + ' Tiếp tục', titleEl, function () { closeTitle(); });
    btn(Icons.ui('sprout', 22) + ' Game mới', titleEl, function () {
      function go() { closeTitle(); G.Save.newGame(); }
      if (G.Save.has()) UI.confirm({ title: 'Bắt đầu game mới?', text: 'Dữ liệu đã lưu sẽ bị thay thế.', yes: 'Game mới', no: 'Quay lại' }, function (ok) { if (ok) go(); });
      else go();
    }, 'alt');
  }
  // main.js loads after this file and emits game:ready after boot.
  E.once('game:ready', function () { if (G.Shot && G.Shot.on) return; showTitle(); if (window.tvSplashHide) window.tvSplashHide(); });

  /* debug helper: chest-style transfer with any container */
  UI.openDebugContainer = function () {
    var c = G.Containers.create(12);
    c.add('compost', 20); c.add('bread', 5); c.add('leaf_feed', 8);
    return UI.openContainer(c, { title: 'Rương thử nghiệm' });
  };
})();
