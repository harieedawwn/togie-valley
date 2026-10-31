/* Togie Valley - shop.js (Stage 8): shop, workshop, fish stall, shipping bin + fish crate, payout, eating, NPC lines.
 * Game.Economy: bin, crate (Containers), pending (tool upgrades), value(container), eat(). Save section 'economy'.
 * Depends on: data_shop.js, ui.js, panels.js, house.js (summary lines, optional), farm.js (optional)
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.ShopData || !G.UI || !G.Kit || !G.Inventory || !G.State || !G.Save || !G.Day || !G.Icons || !G.World || !G.Interact || !G.Player) { console.error('[shop] dependency missing'); return; }
  var Kit = G.Kit, E = G.Events, UI = G.UI, Items = G.Items, Inv = G.Inventory, S = G.State, Icons = G.Icons, D = G.ShopData, T = G.Time, P = G.Player;
  var Eco = G.Economy = { bin: G.Containers.create(24), crate: G.Containers.create(12), pending: [], tipIdx: 0 };

  function el(tag, cls, parent, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }
  function line(text, icon) { if (G.House && G.House.addSummaryLine) G.House.addSummaryLine(text, icon); }

  /* ------------------------------------------------------------- payout (bin + crate) */
  Eco.value = function (c) {
    var t = 0;
    for (var i = 0; i < c.size; i++) { var s = c.get(i); if (s) t += Items.price(s.id, s.q) * s.n; }
    return t;
  };
  /* Round 5: in multiplayer every stack carries its owner's name (slot.o, set in panels.js transfer); the host pays its own stacks and
   * sends each other player their share ('pay'). Shares of players who are offline wait in Eco.owed (saved) until they join again. */
  var Net = G.Net;
  function myTag() { return Net && Net.mode !== 'solo' && Net.name ? Net.name : undefined; }
  Eco.bin.ownerTag = Eco.crate.ownerTag = myTag;
  Eco.owed = {};
  function summarize(groups, order, total, label) {
    var out = order.slice(0, 4).map(function (id) { return [Items.get(id).name + ' x' + groups[id].n + ': +' + groups[id].v, 'coin']; });
    if (order.length > 4) out.push(['...và ' + (order.length - 4) + ' loại khác', 'box']);
    out.push([label + ': +' + total, 'coin']);
    return out;
  }
  function idOf(name) { var k; for (k in Net.names) if (Net.names[k] === name && k !== Net.playerId) return k; return null; }
  function sendPay(name, v, lines) {
    var id = idOf(name);
    if (id && Net.sendTo(id, { t: 'pay', v: v, lines: lines })) return;
    var o = Eco.owed[name] || (Eco.owed[name] = { v: 0, lines: [] });
    o.v += v; o.lines = o.lines.concat(lines).slice(-12);
  }
  function payout(c, label) {
    var by = {}, mine = myTag() || '', i, s, w;
    for (i = 0; i < c.size; i++) {
      s = c.get(i); if (!s) continue;
      w = !s.o || s.o === mine ? '' : s.o;
      var b = by[w] || (by[w] = { groups: {}, order: [], total: 0 }), v = Items.price(s.id, s.q) * s.n;
      if (!b.groups[s.id]) { b.groups[s.id] = { n: 0, v: 0 }; b.order.push(s.id); }
      b.groups[s.id].n += s.n; b.groups[s.id].v += v; b.total += v;
    }
    Object.keys(by).forEach(function (k) {
      var b = by[k], lines = summarize(b.groups, b.order, b.total, label);
      if (!k) { lines.forEach(function (l) { line(l[0], l[1]); }); S.addMoney(b.total); }
      else sendPay(k, b.total, lines);
    });
    c.clear();
  }
  G.Day.onEnd(20, function () { payout(Eco.bin, 'Thùng bán đồ'); payout(Eco.crate, 'Thùng cá'); });
  if (Net && Net.on) {
    Net.on('pay', function (m) {   // guest: my share of the shared bin / crate, sent by the host at bedtime
      if (Net.mode !== 'guest' || !m || !(m.v > 0)) return;
      var v = Math.min(10000000, m.v | 0);
      (m.lines instanceof Array ? m.lines : []).slice(0, 12).forEach(function (l) { if (l instanceof Array) line(String(l[0]).slice(0, 80), String(l[1] || 'coin')); });
      S.addMoney(v); UI.toast('Tiền bán đồ: +' + v, 'coin');
    });
    Net.on('net:join', function () {   // host: hand out shares kept for players who were offline (names arrive with the join)
      if (Net.mode !== 'host') return;
      setTimeout(function () {
        Object.keys(Eco.owed).forEach(function (name) {
          var id = idOf(name), o = Eco.owed[name];
          if (id && Net.sendTo(id, { t: 'pay', v: o.v, lines: o.lines })) delete Eco.owed[name];
        });
      }, 3000);
    });
  }

  /* ------------------------------------------------------------- workshop deliveries */
  function deliver(announce) {
    var keep = [], any = false;
    Eco.pending.forEach(function (p) {
      var d = Items.get(p.id);
      if (p.ready <= T.day && d && Inv.canAdd(p.id, 1, 'normal', p.tier)) {
        Inv.add(p.id, 1, 'normal', p.tier); any = true;
        if (announce) line('Xưởng: ' + d.name + ' của bạn đã xong (' + Items.TIERS[p.tier] + ')!', 'gear');
        
      } else keep.push(p);
    });
    var waiting = keep.some(function (p) { return p.ready <= T.day; });
    if (announce && waiting) line('Có dụng cụ đang chờ ở xưởng (túi đồ đã đầy).', 'box');
    Eco.pending = keep;
    return any;
  }
  G.Day.onStart(20, function () { deliver(true); });

  /* ------------------------------------------------------------- eating */
  var eating = false;
  function edible(d) { return d && (d.cat === 'food' || d.cat === 'crop' || d.cat === 'fish'); }
  function gain(d) { return d.energy || Math.min(30, Math.max(5, Math.round(d.price * 0.15))); }
  Eco.eat = function () {
    var s = Inv.selected(), d = s && Items.get(s.id);
    if (!edible(d) || eating || P.isLocked()) return false;
    if (S.energy >= S.maxEnergy) { UI.toast('Bạn chưa đói đâu nè.', 'energy'); return true; }
    var idx = Inv.selectedIndex(), g = gain(d);
    eating = true;
    P.playAction('eat', { duration: 0.8, item: d.id, drink: !!(d.icon && d.icon.tpl === 'bowl') }, function () {
      eating = false;
      var s2 = Inv.get(idx);
      if (!s2 || s2.id !== d.id) return;
      Inv.removeAt(idx, 1); S.restoreEnergy(g);
      UI.sfx('pop');
      E.emit('item:eaten', { id: d.id, energy: g });
    });
    return true;
  };
  E.on('ui:slotUse', function () { Eco.eat(); });
  E.on('input:action', function () {
    var s = Inv.selected(), d = s && Items.get(s.id);
    if (!edible(d) || P.isLocked()) return;
    var f = P.frontTile(), t = P.tile();
    if (G.Interact.resolve(f.tx, f.tz) || G.Interact.resolve(t.tx, t.tz)) return;
    Eco.eat();
  });

  /* ------------------------------------------------------------- NPC dialogue */
  function npcLines(kind) {
    var L = D.LINES[kind], i = Eco.tipIdx++, out = [];
    function pick(arr, salt) { return arr[(i + (salt || 0)) % arr.length]; }
    out.push(pick(L.greet, 1));
    // weather beats season when it is raining or snowing
    if (T.weather !== 'sun' && L[T.weather]) out.push(pick(L[T.weather], 0));
    else out.push(pick(L[T.season] || L.spring, 0));
    // time of day and player progress (each only now and then)
    if (T.hour >= 21) out.push(pick(L.night, 0));
    else if (T.hour < 8 && i % 2 === 0) out.push(pick(L.dawn, 0));
    else if (L.skilled && i % 3 === 2 && S.level(kind === 'fish' ? 'fishing' : 'farming') >= 3) out.push(pick(L.skilled, 0));
    out.push(pick(L.tips, 2));
    return out;
  }
  function talk(kind, name, next) {
    UI.dialog({ name: name, voice: kind, lines: npcLines(kind), onDone: next });
    Save().request();
  }
  function Save() { return G.Save; }

  /* ------------------------------------------------------------- store rows */
  function lockReason(r) {
    if (S.level(r.skill) < r.lvl) return (r.skill === 'fishing' ? 'Câu cá' : 'Làm nông') + ' Cấp ' + r.lvl;
    if (r.kind === 'permit') { for (var j = 1; j < r.idx; j++) if (!G.World.isPlotUnlocked(j)) return 'Hãy mua giấy phép trước đó đã'; }
    if (r.kind === 'pack' && r.size === 36 && Inv.size < 24) return 'Cần ba lô 24 ô trước';
    return '';
  }
  function owned(r) {
    if (r.kind === 'permit') return G.World.isPlotUnlocked(r.idx);
    if (r.kind === 'pack') return Inv.size >= r.size;
    return false;
  }
  function buy(r, qty) {
    var total = r.price * qty;
    if (S.money < total) { UI.toast('Bạn chưa đủ vàng.', 'coin'); return false; }
    if (r.kind === 'item') {
      if (!Inv.canAdd(r.id, qty)) { UI.toast('Túi đồ đầy rồi!', 'box'); return false; }
      S.spendMoney(total); Inv.add(r.id, qty);
    } else if (r.kind === 'permit') { S.spendMoney(total); G.World.unlockPlot(r.idx); }
    else { S.spendMoney(total); Inv.resize(r.size); }
    UI.sfx('pop');
    E.emit('shop:transaction', { kind: r.kind, id: r.id, n: qty, cost: total, by: G.Net.playerId });
    return true;
  }
  function have(id) { var n = 0, i, x; for (i = 0; i < Inv.size; i++) { x = Inv.get(i); if (x && x.id === id) n += x.n; } return n; }
  /* model of one store entry: {key, d, tier, name, tip, price, state 'buy'|'lock'|'own', note, stack (qty allowed), have, buy(qty)->bool} */
  function modelOf(r) {
    var d = Items.get(r.id), own = owned(r), why = own ? '' : lockReason(r), isItem = r.kind === 'item';
    return { key: r.kind + ':' + r.id, d: d, tier: 0, name: d.name, tip: d.tip || '', price: r.price, state: own ? 'own' : why ? 'lock' : 'buy', note: own ? 'Đã có' : why,
      stack: isItem && d.cat !== 'key' ? (d.stack || 99) : 1, have: isItem ? have(r.id) : 0, buy: function (q) { return buy(r, q); } };
  }
  function openStore(title, tabs, rowsFor, extra) {
    var k = Kit.panel({ title: title, coin: true, cls: 'kp-tall kp-shop', detail: true }), tab = tabs ? tabs[0][0] : '', sel = null, qty = 1, models = [], cur = null, tabUi = null;
    var ex = el('div', 'kp-extra', k.bar), buyBtn = Kit.btn('', 'primary', function () {
      if (cur && cur.state === 'buy' && cur.buy(qty)) { qty = 1; render(); }
    }), grid = el('div', 'kp-grid', k.list), ico, info, step;
    buyBtn.classList.add('kp-main-btn'); k.bar.appendChild(buyBtn);
    if (tabs) { tabUi = Kit.tabs(tabs.map(function (t) { return { id: t[0], label: t[1] }; }), tab, function (id) { tab = id; sel = null; qty = 1; render(); }); k.tabs.appendChild(tabUi.el); }
    if (extra) extra(ex);
    function renderDetail() {
      var m = cur, buyable = m && m.state === 'buy', total = m ? m.price * qty : 0, h;
      k.detail.innerHTML = '';
      if (!m) { k.detail.hidden = true; k.main.classList.remove('split'); buyBtn.disabled = true; buyBtn.innerHTML = ''; return; }
      k.mode(true);
      el('div', 'kp-d-ico', k.detail, Icons.item(m.d, 64, m.tier));
      info = el('div', 'kp-d-info', k.detail);
      el('div', 'kp-d-name', info).textContent = m.name;
      el('div', 'kp-d-tip', info).textContent = m.state === 'buy' ? m.tip : (m.note || m.tip);
      h = el('div', 'kp-d-meta', info);
      if (m.state !== 'buy' && m.tip) el('span', null, h).textContent = m.tip;
      if (m.stack > 1 || m.have) el('span', null, h).textContent = 'Đang có: ' + m.have;
      if (buyable && m.stack > 1) {
        step = el('div', 'kp-step', info);
        var mi = Kit.btn('-', 'secondary', function () { qty = Math.max(1, qty - 1); renderDetail(); }), pl = Kit.btn('+', 'secondary', function () { qty = Math.min(m.stack, qty + 1); renderDetail(); });
        mi.setAttribute('aria-label', 'Giảm'); pl.setAttribute('aria-label', 'Tăng');
        step.appendChild(mi); el('span', null, step).textContent = qty; step.appendChild(pl);
      }
      buyBtn.disabled = !buyable || S.money < total;
      buyBtn.innerHTML = buyable ? Icons.ui('coin', 24) + '<b>' + Kit.fmt(total) + '</b><span>Mua</span>' : (m.state === 'own' ? '<span>Đã có</span>' : Icons.ui('lock', 22) + '<span>Đang khóa</span>');
    }
    function renderGrid() {
      grid.innerHTML = '';
      models.forEach(function (m) {
        var c = el('button', 'kp-cell' + (m === cur ? ' on' : '') + (m.state === 'lock' ? ' lock' : '') + (m.state === 'buy' && S.money < m.price ? ' poor' : ''), grid);
        c.type = 'button';
        el('div', 'kp-ci', c, Icons.item(m.d, 56, m.tier)); el('div', 'kp-cn', c).textContent = m.name;
        el('div', 'kp-cp', c, m.state === 'lock' ? Icons.ui('lock', 16) : m.state === 'own' ? '' : Icons.ui('coin', 16) + Kit.fmt(m.price));
        if (m.have) el('div', 'kp-own', c).textContent = m.have;
        c.addEventListener('click', function () { UI.sfx('tap'); sel = m.key; qty = 1; cur = m; renderGrid(); renderDetail(); });
      });
    }
    function render() {
      var keep = k.list.scrollTop, i;
      k.setCoin(S.money);
      models = rowsFor(tab).map(function (r) { return r.model ? r.model() : modelOf(r); });
      cur = null;
      for (i = 0; i < models.length; i++) if (models[i].key === sel) cur = models[i];
      if (!cur) { for (i = 0; i < models.length; i++) if (models[i].state === 'buy') { cur = models[i]; break; } cur = cur || models[0] || null; sel = cur && cur.key; }
      renderGrid(); renderDetail(); k.list.scrollTop = keep;
    }
    var off = E.on('state:changed', function (e) { if (e && e.key === 'money') render(); });
    k.open({ onClose: function () { off(); G.Save.request(); } });
    render();
  }

  /* ------------------------------------------------------------- shipping bin / crate */
  function openBox(c, title, cat, note) {
    var tip;
    function upd() { tip.innerHTML = Kit.esc(note) + ' ' + Kit.coin(Eco.value(c), 18); }
    var p = UI.openContainer(c, {
      title: title, onChange: function () { upd(); G.Save.request(); },
      filter: function (s) { var d = s && Items.get(s.id); return !!d && (d.cat === cat || (cat === 'fish' && d.cat === 'junk')); }
    });
    if (!p) return;
    var v0 = Eco.value(c), offc = E.on('ui:closed', function () { offc(); if (Eco.value(c) > v0) P.playAction('sell', {}); });
    tip = p.kp.sub; upd();
  }
  G.Events.on('interact:bin', function () { openBox(Eco.bin, 'Thùng bán đồ', 'crop', 'Chỉ nhận nông sản. Nhận tiền khi bạn thức dậy.'); });

  /* ------------------------------------------------------------- shop / fish stall */
  E.on('interact:shop', function () {
    talk('shop', 'Cô chủ cửa hàng', function () {
      openStore('Cửa hàng', D.TABS, function (tab) { return D.rows(tab, T.season); });
    });
  });
  E.on('interact:fishstall', function () {
    talk('fish', 'Bác bán cá', function () {
      openStore('Sạp cá', null, function () { return D.rows('fish'); }, function (row) {
        row.appendChild(Kit.btn('Thùng cá', 'secondary', function () { UI.closePanel(); openBox(Eco.crate, 'Thùng cá', 'fish', 'Cá và đồ nhặt được. Nhận tiền khi bạn thức dậy.'); }, 'box'));
      });
    });
  });

  /* ------------------------------------------------------------- workshop */
  function bestTool(id) {
    var best = -1, bt = -1;
    for (var i = 0; i < Inv.size; i++) { var s = Inv.get(i); if (s && s.id === id && (s.tier || 0) > bt) { best = i; bt = s.tier || 0; } }
    return best < 0 ? null : { i: best, tier: bt };
  }
  function upgradeRow(id) {
    return {
      model: function () {
        var d = Items.get(id), U = D.TOOL_UP, b = bestTool(id), busy = Eco.pending.some(function (p) { return p.id === id; });
        var tier = b ? b.tier : 0, nx = tier + 1, note = '', state = 'lock', price = 0;
        if (busy) note = 'Đang nâng cấp. Sáng mai là xong.';
        else if (!b) note = 'Mang ' + d.name + ' đến đây để nâng cấp nhé.';
        else if (nx > 3) { note = 'Đã là hạng ' + Items.TIERS[3] + '. Cao nhất rồi!'; state = 'own'; }
        else if (S.level('farming') < U.lvl[nx - 1]) note = 'Làm nông Cấp ' + U.lvl[nx - 1];
        else { note = Items.TIERS[tier] + ' lên ' + Items.TIERS[nx] + '. Sáng mai là xong.'; state = 'buy'; price = U.cost[nx - 1]; }
        return { key: 'up:' + id, d: d, tier: Math.min(3, nx), name: d.name, tip: note, price: price, state: state, note: note, stack: 1, have: 0,
          buy: function () {
            if (S.money < price) { UI.toast('Bạn chưa đủ vàng.', 'coin'); return false; }
            var cur = bestTool(id);
            if (!cur || !S.spendMoney(price)) return false;
            Inv.removeAt(cur.i, 1);
            Eco.pending.push({ id: id, tier: nx, ready: T.day + 1 });
            UI.sfx('pop');
            E.emit('shop:transaction', { kind: 'upgrade', id: id, n: 1, cost: price, by: G.Net.playerId });
            return true;
          } };
      }
    };
  }
  E.on('interact:workshop', function () {
    var got = deliver(false);
    talk('smith', 'Thợ rèn', function () {
      openStore('Xưởng', null, function () { return D.TOOL_UP.ids.map(upgradeRow); });
    });
    if (got) { UI.sfx('pop'); P.playAction('pickup', {}); }
  });

  /* ------------------------------------------------------------- save */
  G.Save.register('economy', {
    save: function () { return { bin: Eco.bin.serialize(), crate: Eco.crate.serialize(), pending: Eco.pending, tip: Eco.tipIdx, owed: Eco.owed }; },
    load: function (o) {
      o = o || {};
      Eco.bin.load(o.bin || { size: 24, slots: [] }); Eco.crate.load(o.crate || { size: 12, slots: [] });
      Eco.pending = (o.pending || []).filter(function (p) { return p && Items.get(p.id); });
      Eco.tipIdx = o.tip || 0;
      Eco.owed = o.owed && typeof o.owed === 'object' ? o.owed : {};
    },
    reset: function () { Eco.bin.clear(); Eco.crate.clear(); Eco.pending = []; Eco.tipIdx = 0; Eco.owed = {}; }
  }, 'world');
})();
