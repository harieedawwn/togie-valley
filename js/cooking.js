/* Togie Valley - cooking.js (Stage 12): kitchen panel, cooking, timed food buffs + HUD chip.
 * Game.Cooking: open(), canCook(id), cook(id), buff (active {id,kind,until,v,gold} | null), mul(kind), bonus(kind), recipes.
 * Events: cook:done {id}, buff:changed {buff}. Save key 'cooking' {buff}. Buffs are cleared when a new day starts.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Items || !G.CookData || !G.Inventory || !G.State || !G.UI || !G.Icons || !G.Time || !G.Kit) { console.error('[cooking] dependencies missing'); return; }
  var Kit = G.Kit, E = G.Events, Items = G.Items, Inv = G.Inventory, S = G.State, UI = G.UI, Icons = G.Icons, T = G.Time, D = G.CookData;
  var C = { buff: null, recipes: D.recipes };
  var KIND = { speed: 'Nhanh chân', farm: 'Tay nông giỏi', fish: 'Cá dễ cắn câu' };

  function el(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ------------------------------------------------------------- ingredients */
  function fishSlots() {
    var out = [], i, s, d;
    for (i = 0; i < Inv.size; i++) {
      s = Inv.get(i); d = s && Items.get(s.id);
      if (d && d.cat === 'fish') out.push({ i: i, p: d.price || 0 });
    }
    out.sort(function (a, b) { return a.p - b.p; });
    return out;
  }
  function have(ing) {
    if (ing.id) return Inv.count(ing.id);
    var n = 0, i, s;
    for (i = 0; i < Inv.size; i++) { s = Inv.get(i); if (s && Items.get(s.id) && Items.get(s.id).cat === ing.cat) n += s.n; }
    return n;
  }
  function ingName(ing) { return ing.id ? Items.get(ing.id).name : 'Cá bất kỳ'; }
  function ingIcon(ing, px) {
    return ing.id ? Icons.item(ing.id, px) : Icons.item({ tpl: 'fish', c1: '#6bb6ee', c2: '#f3e6a0' }, px);
  }
  function lockReason(r) { return S.level(r.skill) < r.lvl ? (r.skill === 'farming' ? 'Làm nông' : 'Câu cá') + ' Cấp ' + r.lvl : ''; }
  C.canCook = function (id) {
    var r = D.get(id), i;
    if (!r || lockReason(r)) return false;
    for (i = 0; i < r.ing.length; i++) if (have(r.ing[i]) < r.ing[i].n) return false;
    return true;
  };
  C.cook = function (id) {
    var r = D.get(id), i, j, k, fs;
    if (!r) return false;
    if (lockReason(r)) { UI.toast('Cần ' + lockReason(r) + ' để nấu món này.', 'lock'); return false; }
    if (!C.canCook(id)) { UI.toast('Chưa đủ nguyên liệu rồi.', 'warn'); return false; }
    if (!Inv.canAdd(id, 1, 'normal')) { UI.toast('Túi đồ đầy mất rồi!', 'bag'); return false; }
    for (i = 0; i < r.ing.length; i++) {
      if (r.ing[i].id) Inv.remove(r.ing[i].id, r.ing[i].n);
      else for (j = 0; j < r.ing[i].n; j++) { fs = fishSlots(); if (fs.length) Inv.removeAt(fs[0].i, 1); }
    }
    k = Inv.add(id, 1, 'normal');
    UI.sfx('pop');
    E.emit('cook:done', { id: id });
    return k > 0;
  };

  /* ------------------------------------------------------------- buffs */
  C.mul = function (kind) { return C.buff && C.buff.kind === kind && C.buff.v ? C.buff.v : 1; };
  C.bonus = function (kind) { return C.buff && C.buff.kind === kind && C.buff.gold ? C.buff.gold : 0; };
  function setBuff(b) {
    C.buff = b;
    if (G.Player) G.Player.speedMul = C.mul('speed');
    renderChip();
    E.emit('buff:changed', { buff: b });
  }
  function applyBuff(id) {
    var d = Items.get(id), b = d && d.buff;
    if (!b) return;
    setBuff({ id: id, kind: b.kind, until: Math.min(26, T.hour + b.hours), v: b.v || 0, gold: b.gold || 0 });
    
  }
  E.on('item:eaten', function (p) { applyBuff(p.id); G.Save.request(); });
  E.on('time:minuteStep', function () { if (C.buff && T.hour >= C.buff.until) setBuff(null); else renderChip(); });
  E.on('day:started', function () { if (C.buff) setBuff(null); });

  var chip = null, right = UI.hud && UI.hud.energy && UI.hud.energy.parentNode;
  if (right) { chip = el('div', 'tv-card tv-hud-chip', right); chip.id = 'tv-buff'; chip.style.display = 'none'; }
  function renderChip() {
    var b = C.buff, left;
    if (!chip) return;
    if (!b) { chip.style.display = 'none'; return; }
    left = Math.max(1, Math.ceil(b.until - T.hour));
    chip.style.display = '';
    chip.innerHTML = '<span class="ico">' + Icons.item(b.id, 26) + '</span><span class="txt"><b>' + (KIND[b.kind] || '') + '</b><i>còn ' + left + ' giờ</i></span>';
  }

  /* ------------------------------------------------------------- kitchen panel */
  var panel = null, kp = null, cookSel = null;
  function render() {
    if (!panel || !kp) return;
    var k = kp, keep = k.list.scrollTop, cur = null, grid;
    k.reset();
    D.recipes.forEach(function (r) { if (r.id === cookSel) cur = r; });
    if (!cur) { cur = D.recipes[0]; cookSel = cur && cur.id; }
    grid = el('div', 'kp-grid', k.list);
    D.recipes.forEach(function (r) {
      var lock = lockReason(r), ok = C.canCook(r.id), cell = el('button', 'kp-cell' + (r.id === cookSel ? ' on' : '') + (lock ? ' lock' : ''), grid);
      cell.type = 'button';
      el('div', 'kp-ci', cell, Icons.item(r.id, 56)); el('div', 'kp-cn', cell).textContent = r.name;
      el('div', 'kp-cp', cell, lock ? Icons.ui('lock', 16) : ok ? Icons.ui('check', 16) : '');
      cell.addEventListener('click', function () { UI.sfx('tap'); cookSel = r.id; render(); });
    });
    if (cur) {
      var lk = lockReason(cur), can = C.canCook(cur.id), b = cur.buff, ings = '';
      cur.ing.forEach(function (g) {
        var h = have(g);
        ings += '<span class="ing' + (h >= g.n ? ' ok' : '') + '">' + ingIcon(g, 22) + ingName(g) + ' ' + Math.min(h, 99) + '/' + g.n + '</span>';
      });
      el('div', 'kp-d-ico', k.detail, Icons.item(cur.id, 64));
      el('div', 'kp-d-info', k.detail, '<div class="kp-d-name">' + cur.name + '</div><div class="ings">' + ings + '</div><div class="kp-d-meta"><span>' + Icons.ui('energy', 16) + ' +' + cur.energy + '</span><span>' +
        (KIND[b.kind] || '') + ' ' + b.hours + ' giờ</span></div><div class="kp-d-tip">' + cur.tip + (mixedSeasons(cur) ? ' Nguyên liệu thuộc nhiều mùa khác nhau: hãy tích trữ từ mùa trước nhé.' : '') + '</div>' + (lk ? '<div class="kp-d-meta kp-d-warn">' + lk + '</div>' : ''));
      var cb = Kit.btn(lk ? 'Đang khóa' : 'Nấu', 'primary', function () { if (C.cook(cur.id)) render(); else UI.sfx('tap'); }, lk ? 'lock' : 'cook');
      cb.classList.add('kp-main-btn'); cb.disabled = !!lk || !can; k.bar.appendChild(cb);
    }
    k.list.scrollTop = keep;
  }
  /* Round 5: true when the recipe's crop ingredients never share a season (stock up a season ahead). */
  function mixedSeasons(r) {
    var CR = G.Crops, common = null;
    if (!CR) return false;
    r.ing.forEach(function (g) {
      var c = g.id && CR.get(g.id);
      if (!c) return;
      common = common ? common.filter(function (x) { return c.seasons.indexOf(x) >= 0; }) : c.seasons.slice();
    });
    return !!common && !common.length;
  }
  C.open = function () {
    kp = Kit.panel({ title: 'Bếp nhà', cls: 'kp-tall kp-cook', detail: true }); panel = kp.el;
    render();
    kp.open({ onClose: function () { panel = null; kp = null; } });
    return panel;
  };
  E.on('inventory:changed', function () { if (panel) render(); });

  /* ------------------------------------------------------------- save */
  G.Save.register('cooking', {
    save: function () { return { buff: C.buff }; },
    load: function (o) { setBuff(o && o.buff && Items.get(o.buff.id) && o.buff.until > T.hour ? o.buff : null); },
    reset: function () { setBuff(null); }
  }, 'player');
  G.Cooking = C;
})();
