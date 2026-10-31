/* Togie Valley - ui_layout.js (Round 2 stage 6): HUD regions, hotbar fitting, joystick anchor, desktop keys + first-launch hint, multiplayer HUD.
 * Regions (inside #tv-hud, flex column): #tv-top [#tv-hl coin+energy+mp | clock | #tv-hr menu+rotate], #tv-mid (hint), #tv-bot [#tv-joyspace | #tv-hotbar | #tv-action].
 * Size classes (sz-phone/tablet/desktop) come from Game.UiScale; sizes are CSS variables in css/layout.css. */
(function () {
  'use strict';
  var G = window.Game, UI = G && G.UI, US = G && G.UiScale, E = G && G.Events, root = document.getElementById('ui');
  if (!G || !UI || !UI.hud || !US || !E || !root) { console.error('[ui_layout] missing deps'); return; }
  var H = UI.hud, hud = H.root, Inv = G.Inventory, Net = G.Net;
  function el(tag, id, parent) { var n = document.createElement(tag); if (id) n.id = id; if (parent) parent.appendChild(n); return n; }

  /* ---------------------------------------------------------- regions */
  var top = el('div', 'tv-top', hud), hl = el('div', 'tv-hl', top), hr = el('div', 'tv-hr', top);
  var mid = el('div', 'tv-mid', hud), bot = el('div', 'tv-bot', hud), joySpace = el('div', 'tv-joyspace', bot);
  hl.appendChild(H.money); hl.appendChild(H.energy);
  top.insertBefore(H.clock, hr);
  hr.appendChild(H.menu); hr.appendChild(document.getElementById('tv-rot'));
  bot.appendChild(H.hotbar); bot.appendChild(H.action);
  var oldRight = document.getElementById('tv-right'); if (oldRight && oldRight.parentNode) oldRight.parentNode.removeChild(oldRight);
  var tool = document.createElement('div'); tool.id = 'tv-toolname'; H.hotbar.insertBefore(tool, H.hotbar.firstChild);

  /* ---------------------------------------------------------- hotbar: always ONE row; slots shrink (>= 40 real px), the rest hide behind the more-button */
  var slots = [].slice.call(H.hotbar.querySelectorAll('.tv-slot:not(.tv-slot-more)'));
  function visibleSlots() { return slots.filter(function (b) { return !b.classList.contains('tv-empty'); }); }
  var toolId = null, toolT = 0;
  function hideTool() { tool.classList.remove('show'); }
  function paintTool() {   // the name fades in on a NEW selection and out after 1.6 s
    var it = Inv.selected && Inv.selected(), def = it && G.Items.get(it.id), id = def ? it.id : null;
    tool.textContent = def ? def.name : '';
    tool.style.display = def ? '' : 'none';
    if (id !== toolId) { toolId = id; clearTimeout(toolT); if (id) { tool.classList.add('show'); toolT = setTimeout(hideTool, 1600); } else hideTool(); }
  }
  function fit() {
    var vis = visibleSlots(), sc = US.scale() || 1, cs = getComputedStyle(root);
    var phone = root.classList.contains('sz-phone'), gap = phone ? 4 : 6, pad = phone ? 12 : 20;
    var slotMax = parseFloat(cs.getPropertyValue('--slot-px')) || 52, slotMin = 40 / sc;
    var total = bot.clientWidth || (window.innerWidth / sc);
    var avail = bot.classList.contains('stack') ? total : total - joySpace.offsetWidth - H.action.offsetWidth - 16;
    var fitCells = Math.max(2, Math.floor((avail - pad + gap) / (slotMin + gap)));   // cells incl. the more-button
    var k = Math.min(vis.length, fitCells - 1), hide = vis.length - k, i;
    var slot = Math.max(slotMin, Math.min(slotMax, (avail - pad + gap) / (k + 1) - gap));
    for (i = 0; i < slots.length; i++) slots[i].style.display = '';
    for (i = vis.length - 1; i >= 0 && hide > 0; i--) if (!vis[i].classList.contains('sel')) { vis[i].style.display = 'none'; hide--; }
    H.hotbar.style.setProperty('--hb-slot', Math.floor(slot * 10) / 10 + 'px');
  }
  /* ---------------------------------------------------------- joystick anchor (real px, read by css/layout.css) */
  var JD = { s: 96, m: 120, l: 148 };
  function anchor() {
    var J = G.Joystick, fixed = J && J.mode && J.mode() === 'fixed', s = US.scale(), d = fixed ? (JD[J.size()] || 120) : 0;
    var right = !!(J && J.hand && J.hand() === 'right' && fixed);
    root.classList.toggle('hand-r', right);
    joySpace.style.width = d ? (d / s) + 'px' : '0px'; joySpace.style.height = d ? (d / s) + 'px' : '0px';
    if (!d) return;
    var r = joySpace.getBoundingClientRect(), st = document.documentElement.style;
    st.setProperty('--tv-joy-l', Math.round(r.left) + 'px');
    st.setProperty('--tv-joy-r', Math.round(window.innerWidth - r.right) + 'px');
    st.setProperty('--tv-joy-b', Math.round(window.innerHeight - r.bottom) + 'px');
  }
  function layout() {
    var portrait = root.clientHeight > root.clientWidth;
    bot.classList.toggle('stack', portrait);
    fit(); anchor();
  }
  var lt = 0;
  function later() { clearTimeout(lt); lt = setTimeout(layout, 0); }
  E.on('ui:scaled', layout); E.on('inventory:changed', function () { paintTool(); later(); });
  E.on('save:loaded', later); E.on('save:reset', later);
  E.on('controls:changed', function () { layout(); E.emit('ui:scaled', { scale: US.scale(), mode: US.mode() }); });
  window.addEventListener('resize', later); window.addEventListener('orientationchange', later);
  paintTool(); layout();
  if (window.requestAnimationFrame) requestAnimationFrame(layout); setTimeout(layout, 300);   // first frames: widths may not be laid out yet

  /* ---------------------------------------------------------- keys: 1-9 hotbar, Esc menu */
  function typing(t) { var tag = t && t.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable); }
  function playing() { return document.body.classList.contains('tv-playing'); }
  function locked() { return !!(G.Player && G.Player.isLocked && G.Player.isLocked()); }
  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || !playing()) return;
    if (e.key === 'Escape') {
      if (UI.panelOpen || locked()) return;   // existing handlers close the top panel / pull the line in
      e.preventDefault(); e.stopPropagation(); E.emit('ui:menu', {}); return;
    }
    if (e.key.length === 1 && e.key >= '1' && e.key <= '9' && !UI.panelOpen && !locked()) {
      var b = visibleSlots()[+e.key - 1];
      if (b) { Inv.select(slots.indexOf(b)); UI.sfx('tap'); }
    }
  }, true);

  /* ---------------------------------------------------------- desktop one-line hint (first launch, dismissible) */
  var HKEY = 'togie-valley/deskhint', coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches), seen = false;
  try { seen = localStorage.getItem(HKEY) === '1'; } catch (e) { /* ignore */ }
  if (!coarse && !seen) {
    var poll = setInterval(function () {
      if (!playing()) return;
      clearInterval(poll);
      var h = el('div', 'tv-deskhint', mid); h.className = 'tv-card';
      h.innerHTML = '<span>WASD / mũi tên: đi · E hoặc Space: tương tác · 1-9: chọn đồ · Esc: menu · Lăn chuột: thu phóng</span>';
      var x = document.createElement('button'); x.className = 'tv-btn alt'; x.setAttribute('aria-label', 'Đóng'); x.innerHTML = G.Icons.ui('close', 20); h.appendChild(x);
      function gone() { clearTimeout(tm); if (h.parentNode) h.parentNode.removeChild(h); try { localStorage.setItem(HKEY, '1'); } catch (e2) { /* ignore */ } }
      x.addEventListener('click', gone); var tm = setTimeout(gone, 25000);
    }, 600);
  }

  /* ---------------------------------------------------------- multiplayer HUD: lobby chip moves into the top-left region, plus a compact player list */
  var list = null, dot = null, timer = 0;
  function names() {
    var out = [(Net.name || 'Togie') + ' (bạn)'], k;
    for (k in Net.names) if (k !== Net.playerId && Net.names[k]) out.push(Net.names[k]);
    return out;
  }
  function paintList() {
    var chip = hr.querySelector('.mp-pop');
    if (!chip) { if (list && list.parentNode) list.parentNode.removeChild(list); list = null; clearInterval(timer); timer = 0; return; }
    if (!list) { list = el('div', 'tv-mplist', hl); list.className = 'tv-card'; }
    var n = names(), more = n.length > 4 ? n.length - 4 : 0;
    list.textContent = '';   // names are text, never HTML
    n.slice(0, 4).forEach(function (s) { el('span', null, list).textContent = s; });
    if (more) el('span', null, list).textContent = '+' + more;
    top.classList.toggle('mp-off', !Net.live);
  }
  function adopt() {
    var chip = root.querySelector(':scope > .mp-pop');
    if (chip) { hr.insertBefore(chip, hr.firstChild); chip.setAttribute('aria-label', 'Người chơi trong phòng'); if (!timer) timer = setInterval(paintList, 2000); paintList(); }
  }
  try { new MutationObserver(function () { adopt(); paintList(); }).observe(root, { childList: true }); } catch (e) { /* ignore */ }
  ['net:ready', 'net:join', 'net:leave', 'net:closed', 'net:error'].forEach(function (t) { if (Net && Net.on) Net.on(t, function () { setTimeout(paintList, 0); }); });
  adopt();
})();
