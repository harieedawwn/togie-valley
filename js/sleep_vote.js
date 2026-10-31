/* Togie Valley - sleep_vote.js (Round 3 stage 6): Minecraft-style multiplayer sleep. Also require()-able in node (pure core, tools/sleep_vote_check.js).
 * Host-authoritative: a player asks the host for a sleep spot (Game.Beds.claim), lies down and tells the host; the day rolls only when EVERY connected
 * player is asleep (k1) or fainted after 02:00 (k2, hour >= 26). Awake players keep playing, the clock never skips. A faint before 02:00 wakes after 3 game hours.
 * Messages: see CONTRACT.md section 'Sleep vote'. Game.SleepVote {multi, inBed, state {id:[spot,k]}, n, m, start, faintBed}. Loads after night.js (before avatars.js). */
(function (root) {
  'use strict';
  var VC = { COUNT_H: 26, WAKE_H: 3, LATE: 24, SLEEP_H: 19 };   // before SLEEP_H (19:00) lying only rests (js/rest.js): the day never rolls
  /* io: {spots() -> ids in preference order, claim(spot, id) -> bool, release(spot, id)} */
  VC.make = function (io) {
    var m = { st: {}, conn: {}, going: false };
    function used(sid) { var k; for (k in m.st) if (m.st[k].s === sid) return true; return false; }
    function pick(want, id) {
      var l = io.spots(), i;
      if (want && l.indexOf(want) >= 0 && !used(want) && io.claim(want, id)) return want;
      for (i = 0; i < l.length; i++) if (!used(l[i]) && io.claim(l[i], id)) return l[i];
      return null;
    }
    m.join = function (id) { m.conn[id] = 1; };
    m.leave = function (id) { m.out(id); delete m.conn[id]; };
    m.request = function (id, want) {
      var s;
      if (!m.conn[id] || m.going) return null;
      if (m.st[id]) return m.st[id].s;
      s = pick(want, id); if (!s) return null;
      m.st[id] = { s: s, k: 0, h: 0 };
      return s;
    };
    m.lie = function (id) { var e = m.st[id]; if (!e || m.going) return false; if (e.k === 0) e.k = 1; return true; };
    m.out = function (id) { var e = m.st[id]; if (!e) return false; if (e.s) io.release(e.s, id); delete m.st[id]; return true; };
    m.faint = function (id, hour) {
      var e = m.st[id], s;
      if (!m.conn[id] || m.going) return null;
      if (e) { e.k = 2; e.h = hour; return e.s; }
      s = pick(null, id); if (!s) return null;
      m.st[id] = { s: s, k: 2, h: hour };
      return s;
    };
    m.counted = function (id, hour) { var e = m.st[id]; return !!e && (e.k === 1 || (e.k === 2 && hour >= VC.COUNT_H)); };
    m.total = function () { return Object.keys(m.conn).length; };
    m.asleep = function (hour) { var n = 0, k; for (k in m.conn) if (m.counted(k, hour)) n++; return n; };
    m.ready = function (hour) { var t = m.total(); return !m.going && hour >= VC.SLEEP_H && t > 0 && m.asleep(hour) === t; };
    m.wakeDue = function (hour) { var a = [], k; for (k in m.st) if (m.st[k].k === 2 && hour >= m.st[k].h + VC.WAKE_H) a.push(k); return a; };
    m.modeOf = function (id, hour) { var e = m.st[id]; return e && e.k === 2 ? 'faint' : hour >= VC.LATE ? 'late' : 'full'; };
    m.fainted = function () { var a = [], k; for (k in m.st) if (m.st[k].k === 2) a.push(k); return a; };
    m.roll = function () { var k; for (k in m.st) m.out(k); m.going = false; };
    m.snapshot = function (hour) { var s = {}, k; for (k in m.st) s[k] = [m.st[k].s, m.st[k].k]; return { s: s, n: m.asleep(hour), m: m.total() }; };
    return m;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = VC;
  if (typeof window === 'undefined' || !window.Game) return;

  var G = window.Game;
  if (!G.Net || !G.Beds || !G.BedSleep || !G.House || !G.Time || !G.Player || !G.UI || !G.Events) { console.error('[sleep_vote] missing dependencies'); return; }
  var Net = G.Net, B = G.Beds, BS = G.BedSleep, H = G.House, T = G.Time, P = G.Player, UI = G.UI;
  var SV = G.SleepVote = { core: VC, state: {}, n: 0, m: 1 };
  var vote = null, pending = null, lying = false, busy = false, lastKey = '', hud = null, hudTxt = '';
  var io = {
    spots: function () { return B.spots().map(function (s) { return s.id; }); },
    claim: function (sid, id) { return B.claim(sid, id); },
    release: function (sid, id) { if (B.occupantOf(sid) === id) B.release(sid); }
  };

  function me() { return Net.playerId || 'p1'; }
  SV.multi = function () { return !!(Net.live && Net.mode !== 'solo'); };
  SV.inBed = function () { return lying; };
  SV.lyingOf = function (id) { var e = vote && vote.st[id]; return !!e && e.k >= 1; };   // host: is this player in a bed (rest.js)
  function isHost() { return Net.mode === 'host'; }

  /* ---- HUD: small counter under the top bar, shown while some (not all) players sleep */
  function showHud() {
    var txt = T.hour >= VC.SLEEP_H && SV.n > 0 && SV.n < SV.m ? 'Đang ngủ ' + SV.n + '/' + SV.m : '', ui;
    if (txt === hudTxt) return;
    hudTxt = txt;
    if (!hud) {
      ui = document.getElementById('ui'); if (!ui) return;
      hud = document.createElement('div'); hud.id = 'tv-sleepcount';
      hud.className = 'k-ui k-pill orange';
      ui.appendChild(hud);
    }
    hud.textContent = txt; hud.style.display = txt ? '' : 'none';
  }
  function apply(s) { SV.state = (s && s.s) || {}; SV.n = (s && s.n) | 0; SV.m = Math.max(1, (s && s.m) | 0); showHud(); }

  /* ---- host side */
  function ensure() {
    var ids = Object.keys(Net.names), k;
    if (!vote || vote.code !== Net.code) { vote = VC.make(io); vote.code = Net.code; }
    if (ids.indexOf(me()) < 0) ids.push(me());
    for (k in vote.conn) if (ids.indexOf(k) < 0) vote.leave(k);
    ids.forEach(function (id) { if (!vote.conn[id]) vote.join(id); });
    return vote;
  }
  function publish(force) {
    var snap, key;
    if (!vote) return;
    snap = vote.snapshot(T.hour); key = JSON.stringify(snap);
    if (key === lastKey && !force) return;
    lastKey = key; apply(snap);
    if (Net.count() > 1) Net.broadcast({ t: 'sl.st', s: snap.s, n: snap.n, m: snap.m });
  }
  function hostCheck() {
    var h = T.hour, due, i, f;
    if (!isHost() || !Net.live) return;
    ensure();
    if (vote.ready(h)) {   // everyone sleeps: the host rolls the day for all
      vote.going = true; f = vote.fainted();
      publish(true);
      if (Net.count() > 1) Net.broadcast({ t: 'sl.go', h: h, f: f });
      beginDay(vote.modeOf(me(), h));
      return;
    }
    due = vote.wakeDue(h);
    for (i = 0; i < due.length; i++) {
      vote.out(due[i]);
      if (due[i] === me()) SV.wakeFaint(); else Net.sendTo(due[i], { t: 'sl.wk', p: due[i] });
    }
    publish();
  }
  function reply(id, s, f) { Net.sendTo(id, s ? { t: 'sl.ok', p: id, s: s, f: f ? 1 : 0 } : { t: 'sl.no', p: id }); }
  Net.on('sl.req', function (m, from) {
    if (!isHost() || !Net.names[from]) return;
    ensure(); reply(from, vote.request(from, typeof m.s === 'string' ? m.s : null), false); publish();
  });
  Net.on('sl.fa', function (m, from) {
    if (!isHost() || !Net.names[from]) return;
    ensure(); reply(from, vote.faint(from, T.hour), true); hostCheck();
  });
  Net.on('sl.in', function (m, from) { if (!isHost()) return; ensure(); vote.lie(from); hostCheck(); });
  Net.on('sl.out', function (m, from) { if (!isHost()) return; ensure(); vote.out(from); hostCheck(); });
  Net.on('net:join', function () { if (isHost()) { ensure(); publish(true); } });
  Net.on('net:leave', function () { if (isHost()) { ensure(); hostCheck(); } });
  G.Events.on('time:minuteStep', function () { if (isHost() && vote) hostCheck(); });
  G.Events.on('time:hourChanged', function () { hudTxt = null; showHud(); });

  /* ---- everyone: the day roll */
  function beginDay(mode) {
    lying = false; unbind();
    if (mode === 'faint' && G.Night && G.Night.endFaint) G.Night.endFaint();
    H.mpWake(mode, isHost());
  }
  SV.rolled = function () { if (vote) { vote.roll(); publish(true); } };   // host: House calls this once Day.sleep ran
  Net.on('sl.go', function (m) {
    var mine = SV.state[me()], mode;
    if (Net.mode !== 'guest' || !mine) return;
    mode = m.f && m.f.indexOf(me()) >= 0 ? 'faint' : (+m.h >= VC.LATE ? 'late' : 'full');
    beginDay(mode);
  });
  Net.on('sl.st', function (m) { if (Net.mode === 'guest') apply(m); });
  Net.on('net:closed', function () { lying = false; unbind(); pending = null; SV.state = {}; SV.n = 0; SV.m = 1; vote = null; showHud(); });

  /* ---- spot requests (host answers itself, guests ask over the relay) */
  function ask(type, want, cb) {
    var s;
    if (isHost()) {
      ensure(); s = type === 'sl.fa' ? vote.faint(me(), T.hour) : vote.request(me(), want);
      publish(); cb(s); if (type === 'sl.fa') hostCheck(); return;
    }
    if (pending) { cb(null); return; }
    pending = { cb: cb, tmo: setTimeout(function () { var p = pending; pending = null; if (p) p.cb(null, true); }, 4000) };
    Net.send(type === 'sl.fa' ? { t: 'sl.fa' } : { t: 'sl.req', s: want || '' });
  }
  function answer(m, ok) {
    var p = pending;
    if (!p || m.p !== me()) return;
    pending = null; clearTimeout(p.tmo); p.cb(ok ? m.s : null);
  }
  Net.on('sl.ok', function (m) { answer(m, true); });
  Net.on('sl.no', function (m) { answer(m, false); });
  Net.on('sl.wk', function (m) { if (m.p === me()) SV.wakeFaint(); });

  /* ---- local player goes to bed */
  var down = null;
  function onDown(e) { down = e.isPrimary && e.target && e.target.tagName === 'CANVAS' ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }
  function onUp(e) {
    var d = down; down = null;
    if (!d || !lying || !e.isPrimary || e.target.tagName !== 'CANVAS') return;
    if (Math.abs(e.clientX - d.x) < 12 && Math.abs(e.clientY - d.y) < 12 && Date.now() - d.t < 500) leave();
  }
  function bind() { document.addEventListener('pointerdown', onDown, true); document.addEventListener('pointerup', onUp, true); }
  function unbind() { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('pointerup', onUp, true); down = null; }
  function leave() {   // tap on the floor: get up again
    lying = false; unbind();
    if (isHost()) { ensure(); vote.out(me()); hostCheck(); } else Net.send({ t: 'sl.out' });
    BS.out(function () { P.unlock('sleep'); busy = false; });
  }
  /** Bed interaction (house.js doSleep) while connected: ask the host for a spot, climb in, report lying. */
  SV.start = function (t) {
    var want = BS.idOf(t), done = false;
    if (busy || lying) return;
    busy = true; P.stop(); P.lock('sleep');
    function fail(txt) { UI.toast(txt, 'warn'); P.unlock('sleep'); busy = false; }
    function inBed() {
      if (done) return; done = true; lying = true; bind();
      if (isHost()) { ensure(); vote.lie(me()); hostCheck(); } else Net.send({ t: 'sl.in' });
    }
    ask('sl.req', want, function (sid, timeout) {
      if (!sid) { fail(timeout ? 'Chưa liên lạc được với chủ phòng.' : 'Hết chỗ ngủ - hãy đặt thêm nệm'); return; }
      if (!BS.enterId(sid, inBed, sid !== want)) { SV.release(sid); fail('Hết chỗ ngủ - hãy đặt thêm nệm'); return; }
      setTimeout(inBed, 8000);
    });
  };
  SV.release = function (sid) {   // spot could not be used: give it back
    if (isHost()) { ensure(); vote.out(me()); publish(); } else Net.send({ t: 'sl.out' });
    io.release(sid, me());
  };
  /** Night.js: the player fainted. cb(ok): ok = a spot was claimed and taken (BedSleep.take), false = none free. */
  SV.faintBed = function (cb) {
    ask('sl.fa', null, function (sid) { cb(!!sid && BS.take(sid)); });
  };
  SV.wakeFaint = function () { if (G.Night && G.Night.wakeFaint) G.Night.wakeFaint(); };
})(typeof window !== 'undefined' ? window : this);
