/* Togie Valley - world_sync.js (Round 3 stage 33): host-authoritative live sync of the shared world that farm.js does not cover:
 * placed furniture, shared furniture stock, house chest, shipping bin + crate, lamp overrides, land permits, plus guest day-change catch-up.
 * Every section is a flat {key: value} map; a client diffs it against the last synced copy (poll, 400 ms) and sends compact ops.
 * Guest -> host {t:'ws.op', o:{section:[ops]}, r}; host validates ALL ops (atomic) -> broadcasts {t:'ws.ev', o, by}, or answers the actor
 * {t:'ws.fix', r, s:{section: authoritative map}} (conflict: the host decided, the actor is rolled back and refunded).
 * Ops: set ['+'|'-', key] | delta [key, d] | cas [key, old, new] | max [key, n]. Solo skips everything. Depends on net, save, state, furniture, placement_logic, land_office.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Net || !G.Save || !G.Save.dumpKey || !G.Containers || !G.Furniture || !G.PlaceLogic || !G.Land || !G.Inventory) { console.error('[wsync] missing dependencies'); return; }
  var E = G.Events, Net = G.Net, Save = G.Save, F = G.Furniture, PL = G.PlaceLogic, Land = G.Land, WS = G.WorldSync = {};
  var last = null, queue = [], rid = 0, inflight = {}, ORDER = ['furniture', 'furnplace', 'chest', 'bin', 'crate', 'furnlive', 'land'];

  function toast(t) { if (G.UI && G.UI.toast) G.UI.toast(t, 'warn'); }
  function keys(o) { return Object.keys(o).sort(); }

  /* ------------------------------------------------------------ sections */
  function containerSec(getC) {
    return {
      kind: 'cas', container: true,
      get: function () {
        var c = getC(), o = {}; if (!c) return o;
        c.serialize().slots.forEach(function (s, i) { if (s) o[i] = JSON.stringify(s.o ? [s.id, s.n, s.q || 'normal', s.tier | 0, s.o] : [s.id, s.n, s.q || 'normal', s.tier | 0]); });
        return o;
      },
      has: function (k) { var c = getC(); return !!c && /^\d+$/.test(k) && +k < c.size; },
      valid: function (v) {
        var a; try { a = JSON.parse(v); } catch (e) { return false; }
        return a instanceof Array && typeof a[0] === 'string' && (!G.Items || !!G.Items.get(a[0])) && a[1] === (a[1] | 0) && a[1] >= 1 && a[1] <= 99;
      },
      put: function (flat) {
        var c = getC(), slots = [], i, a; if (!c) return;
        for (i = 0; i < c.size; i++) { a = flat[i] ? JSON.parse(flat[i]) : null; slots.push(a ? { id: a[0], n: a[1], q: a[2], tier: a[3], o: typeof a[4] === 'string' ? a[4] : undefined } : null); }
        c.load({ size: c.size, slots: slots });
      }
    };
  }
  var SEC = {
    furniture: {   // shared furniture stock (buy / place / pick up), deltas so two players never overwrite each other
      kind: 'delta',
      get: function () { var inv = (Save.dumpKey('furniture') || {}).inv || {}, o = {}, k; for (k in inv) if (inv[k] > 0) o[k] = inv[k] | 0; return o; },
      valid: function (k) { return !!F.get(k); },
      put: function (flat) { Save.applyMap({ furniture: { v: 1, inv: flat } }); }
    },
    furnplace: {   // placed furniture: key = JSON of the packed entry, so move = '-' old + '+' new; the host validates every '+'
      kind: 'set',
      get: function () { var l = (Save.dumpKey('furnplace') || {}).list || [], o = {}, i; for (i = 0; i < l.length; i++) o[JSON.stringify(l[i])] = 1; return o; },
      valid: function (k, cur) {
        var a, c, list, r;
        try { a = JSON.parse(k); } catch (e) { return false; }
        c = PL.unpack([a]); if (c.length !== 1) return false;
        list = PL.unpack(keys(cur).map(function (x) { return JSON.parse(x); }));
        r = PL.validate(list, c[0], -1); return !r;
      },
      put: function (flat) {
        var l = keys(flat).map(function (k) { return JSON.parse(k); });
        Save.applyMap({ furnplace: { v: 1, list: l } });
        E.emit('net:section', { k: 'furnplace' }); E.emit('furniture:placed', { n: l.length, remote: true });
      }
    },
    chest: containerSec(function () { return G.House && G.House.chest; }),
    bin: containerSec(function () { return G.Economy && G.Economy.bin; }),
    crate: containerSec(function () { return G.Economy && G.Economy.crate; }),
    furnlive: {   // lamp / light overrides (key -> '0' | '1'); the 'auto' flag follows each client's own clock
      kind: 'cas',
      get: function () { var ov = (Save.dumpKey('furnlive') || {}).ov || {}, o = {}, k; for (k in ov) o[k] = ov[k] ? '1' : '0'; return o; },
      has: function (k) { return k.length <= 40; },
      valid: function (v) { return v === '0' || v === '1'; },
      put: function (flat) {
        var cur = Save.dumpKey('furnlive') || {}, ov = {}, k; for (k in flat) ov[k] = flat[k] === '1' ? 1 : 0;
        Save.applyMap({ furnlive: { v: 1, auto: cur.auto, ov: ov } });
      }
    },
    land: {   // permits only ever go up: key = service, value = tier
      kind: 'max',
      get: function () { return { farm: Land.get('farm') | 0, house: Land.get('house') | 0 }; },
      valid: function (k) { return k === 'farm' || k === 'house'; },
      put: function (flat) { var k; for (k in flat) if ((flat[k] | 0) > (Land.get(k) | 0)) Land.remote(k, flat[k] | 0); }
    }
  };

  function snapAll() { var o = {}, i; for (i = 0; i < ORDER.length; i++) o[ORDER[i]] = SEC[ORDER[i]].get(); return o; }

  /* ------------------------------------------------------------ diff / apply */
  function diff(name, a, b) {
    var kind = SEC[name].kind, ops = [], k, u = {}, d;
    a = a || {}; b = b || {};
    if (kind === 'set') {
      for (k in b) if (!a[k]) ops.push(['+', k]);
      for (k in a) if (!b[k]) ops.push(['-', k]);
      return ops;
    }
    for (k in a) u[k] = 1; for (k in b) u[k] = 1;
    for (k in u) {
      if (kind === 'delta') { d = (b[k] | 0) - (a[k] | 0); if (d) ops.push([k, d]); }
      else if (kind === 'cas') { if ((a[k] || '') !== (b[k] || '')) ops.push([k, a[k] || '', b[k] || '']); }
      else if ((b[k] | 0) > (a[k] | 0)) ops.push([k, b[k] | 0]);
    }
    return ops;
  }
  /* New flat map after ops, or null if any op is invalid. trust = an authoritative event from the host: no conflict checks. */
  function nextFlat(name, cur, ops, trust) {
    var S = SEC[name], nf = {}, k, i, o, v;
    if (!(ops instanceof Array) || ops.length > 80) return null;
    for (k in cur) nf[k] = cur[k];
    for (i = 0; i < ops.length; i++) {
      o = ops[i]; if (!(o instanceof Array)) return null;
      if (S.kind === 'set') {
        k = String(o[1]); if (k.length > 120) return null;
        if (o[0] === '+') { if (!trust && (nf[k] || !S.valid(k, nf))) return null; nf[k] = 1; }
        else if (o[0] === '-') { if (!trust && !nf[k]) return null; delete nf[k]; }
        else return null;
      } else if (S.kind === 'delta') {
        k = String(o[0]); if (o[1] !== (o[1] | 0) || !S.valid(k)) return null;
        v = (nf[k] | 0) + o[1];
        if (v < 0 || v > 99) { if (!trust) return null; v = v < 0 ? 0 : 99; }
        if (v) nf[k] = v; else delete nf[k];
      } else if (S.kind === 'cas') {
        k = String(o[0]); v = String(o[2] || '');
        if (!S.has(k) || (v && !S.valid(v))) return null;
        if (!trust && (nf[k] || '') !== String(o[1] || '')) return null;
        if (v) nf[k] = v; else delete nf[k];
      } else {
        k = String(o[0]); v = o[1] | 0;
        if (!S.valid(k) || v < 1 || v > 3) return null;
        if (!trust && v !== (nf[k] | 0) + 1) return null;
        if (v > (nf[k] | 0)) nf[k] = v;
      }
    }
    return nf;
  }

  /* ------------------------------------------------------------ send / receive */
  function flush() {   // local changes of every section -> ops (host: broadcast, guest: request)
    if (!last) return;
    var cur = snapAll(), o = {}, any = false, i, k, ops, r;
    for (i = 0; i < ORDER.length; i++) { k = ORDER[i]; ops = diff(k, last[k], cur[k]); if (ops.length) { o[k] = ops; any = true; } }
    if (!any) return;
    if (Net.mode === 'host') { last = cur; if (Net.count() > 1) Net.broadcast({ t: 'ws.ev', o: o, by: Net.playerId }); }
    else if (Net.mode === 'guest') {
      r = ++rid; inflight[r] = o; delete inflight[r - 8];
      if (Net.send({ t: 'ws.op', o: o, r: r })) last = cur; else delete inflight[r];   // failed send keeps the old baseline: retried on the next poll
    }
  }
  function applyTrusted(o) {
    var cur, k, nf;
    flush(); cur = snapAll();
    for (k in o) {
      if (!SEC[k]) continue;
      nf = nextFlat(k, cur[k], o[k], true);
      if (nf) { SEC[k].put(nf); if (last) last[k] = SEC[k].get(); }
    }
  }
  Net.on('ws.op', function (m, from) {   // host: validate everything first, then apply everything (or nothing)
    var cur, nxt = {}, k, ok = true, fix = {}, i;
    if (Net.mode !== 'host' || !m || !m.o || typeof m.o !== 'object' || !Net.names[from] || !last) return;
    flush(); cur = snapAll();
    for (k in m.o) { if (!SEC[k]) { ok = false; continue; } nxt[k] = nextFlat(k, cur[k], m.o[k], false); if (!nxt[k]) ok = false; }
    if (!ok) { for (k in m.o) if (SEC[k]) fix[k] = cur[k]; Net.sendTo(from, { t: 'ws.fix', r: m.r, s: fix }); return; }
    for (i = 0; i < ORDER.length; i++) { k = ORDER[i]; if (nxt[k]) { SEC[k].put(nxt[k]); last[k] = SEC[k].get(); } }
    Net.broadcast({ t: 'ws.ev', o: m.o, by: from });
  });
  Net.on('ws.ev', function (m) {
    if (Net.mode !== 'guest' || !m || !m.o) return;
    if (!last) { if (queue.length < 200) queue.push(m); return; }   // snapshot not applied yet: replay right after it
    if (m.by !== Net.playerId) applyTrusted(m.o);
  });
  function undoSlots(ops) {   // the host refused a chest/bin move: take back what this player moved between bag and container
    var Inv = G.Inventory;
    ops.forEach(function (o) {
      var a, b, same, took, gave;
      try { a = o[1] ? JSON.parse(o[1]) : null; b = o[2] ? JSON.parse(o[2]) : null; } catch (e) { return; }
      same = a && b && a[0] === b[0] && a[2] === b[2] && (a[3] | 0) === (b[3] | 0);
      took = a ? (same ? Math.max(0, a[1] - b[1]) : a[1]) : 0;
      gave = b ? (same ? Math.max(0, b[1] - a[1]) : b[1]) : 0;
      if (took) Inv.remove(a[0], took, a[2]);
      if (gave) Inv.add(b[0], gave, b[2], b[3]);
    });
  }
  Net.on('ws.fix', function (m) {
    var sent, k;
    if (Net.mode !== 'guest' || !m || !m.s || !last) return;
    sent = inflight[m.r]; delete inflight[m.r];
    for (k in m.s) {
      if (!SEC[k] || !m.s[k] || typeof m.s[k] !== 'object') continue;
      try {
        if (sent && sent[k] && SEC[k].container) undoSlots(sent[k]);
        if (sent && sent[k] && SEC[k].kind === 'max' && G.State) sent[k].forEach(function (o) { var t = Land.tiers(o[0]); if (t && t[o[1] - 1]) G.State.addMoney(t[o[1] - 1].cost); });
        SEC[k].put(m.s[k]); last[k] = SEC[k].get();
      } catch (e) { console.error('[wsync] fix', e); }
    }
    toast('Có người vừa đổi chỗ đó trước bạn, đã hoàn lại.');
  });

  /* ------------------------------------------------------------ arming, polling, day catch-up */
  E.on('net:snapshot', function () {   // guest: the world just replaced -> new baseline, then replay events that raced the snapshot
    var q = queue; queue = []; inflight = {}; last = snapAll();
    q.forEach(function (m) { if (m.by !== Net.playerId) applyTrusted(m.o); });
  });
  Net.on('net:closed', function () { last = null; queue = []; inflight = {}; });
  function poll() {
    if (Net.mode === 'solo') { last = null; queue = []; return; }
    if (!Net.live) return;
    if (Net.mode === 'host' && !last) last = snapAll();
    flush();
  }
  WS.poll = poll;
  setInterval(poll, 400);
  E.on('day:started', function () {   // decay / breakage is a pure function of the day on every client: re-baseline instead of echoing it
    if (last) last = snapAll();
    if (Net.mode === 'guest') {   // guests never run Day hooks: finish pending land construction like the host's start hooks do
      if (G.LandFarm && G.LandFarm.built < Land.get('farm')) G.LandFarm.setBuilt(Land.get('farm'));
      if (G.LandHouse && G.LandHouse.built < Land.get('house')) G.LandHouse.setBuilt(Land.get('house'));
    }
  });
  WS.snapshot = snapAll; WS.armed = function () { return !!last; };
})();
