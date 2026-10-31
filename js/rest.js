/* Togie Valley - rest.js (Round 4 stage 8): 'nằm nghỉ'. Before 19:00 a bed only rests: same lying pose, no Zzz, no morning summary; the clock runs 40x until 19:00 and energy recovers slowly (half the sleep rate).
 * From 19:00 lying in bed is real sleep (house.js / js/sleep_vote.js). Also require()-able in node (pure core, tools/sleep_vote_check.js + energy_night_check.js).
 * Connected: the HOST decides on every frame from its own player list: fast-forward only while ALL connected players lie in a bed (fresh 'rs.hb' heartbeat <= 5 s, lying flag, host-side bed vote);
 * any change stops it at once, restarting needs 1 s of "all lying" (2+ players). Guests never accelerate: they mirror the host clock + speed from 'clk' (net.js). Messages: see CONTRACT.md 'Rest'.
 * Game.Rest {core, resting(), start(t) (solo), n, m}. Loads after sleep_vote.js. */
(function (root) {
  'use strict';
  var RC = { END: 19, SPEED: 40, STALE: 5000, DEBOUNCE: 1000, SLEEP_PER_H: 1 / 8, REST_PER_H: 1 / 16 };   // energy: sleep = 1/8 of max per game hour, rest = half
  /* io: {ids() -> connected player ids (host included), inBed(id) -> bool (host-side bed vote / own pose)} */
  RC.make = function (io) {
    var m = { hb: {}, since: -1, fast: false, n: 0, m: 0 };
    m.beat = function (id, lying, now) { m.hb[id] = { l: !!lying, t: now }; };
    m.drop = function (id) { delete m.hb[id]; };
    m.lying = function (id, now) { var h = m.hb[id]; return !!h && h.l && now - h.t <= RC.STALE && !!io.inBed(id); };
    /** Every host frame: true = the clock may run fast now. Stops in the same call as the cause; (re)starts after DEBOUNCE ms of "all lying" (0 when alone). */
    m.tick = function (now, hour) {
      var ids = io.ids(), n = 0, i, ok;
      for (i = 0; i < ids.length; i++) if (m.lying(ids[i], now)) n++;
      m.n = n; m.m = ids.length;
      ok = hour < RC.END && m.m > 0 && n === m.m;
      if (!ok) { m.since = -1; m.fast = false; }
      else {
        if (m.since < 0) m.since = now;
        if (!m.fast && now - m.since >= (m.m > 1 ? RC.DEBOUNCE : 0)) m.fast = true;
      }
      return m.fast;
    };
    return m;
  };
  /** Whole energy points gained while resting: acc += perH * maxE * dH. */
  RC.energy = function (perH) { var st = { acc: 0 }; st.tick = function (dH, maxE) { var n; st.acc += (perH || RC.REST_PER_H) * maxE * dH; n = Math.floor(st.acc + 1e-9); st.acc -= n; return n; }; return st; };
  if (typeof module !== 'undefined' && module.exports) module.exports = RC;
  if (typeof window === 'undefined' || !window.Game) return;

  var G = window.Game;
  if (!G.Net || !G.Time || !G.BedSleep || !G.SleepVote || !G.House || !G.Player || !G.Loop || !G.State || !G.UI || !G.Events) { console.error('[rest] missing dependencies'); return; }
  var Net = G.Net, T = G.Time, BS = G.BedSleep, SV = G.SleepVote, H = G.House, P = G.Player, S = G.State, UI = G.UI;
  var R = G.Rest = { core: RC, n: 0, m: 1 }, soloLying = false, busy = false, down = null, hud = null, hudTxt = '', hudAt = 0, lastKey = '', hbAt = 0, hbL = -1, lastH = T.hour, en = RC.energy(RC.REST_PER_H), ids = [];

  function me() { return Net.playerId || 'p1'; }
  function isHost() { return Net.live && Net.mode === 'host'; }
  function isGuest() { return Net.live && Net.mode === 'guest'; }
  function isLying() { var l = soloLying || SV.inBed(); return !!l && !P.sitting && (!G.Scenes || G.Scenes.current === 'house'); }
  R.resting = function () { return isLying() && T.hour < RC.END; };
  var core = RC.make({
    ids: function () { var k; ids.length = 0; ids.push(me()); if (isHost()) for (k in Net.names) if (k !== me()) ids.push(k); return ids; },
    inBed: function (id) { return id === me() ? isLying() : SV.lyingOf(id); }
  });

  /* ---- label: 'Đang nằm nghỉ [n/m ·] hh:mm', shown to everybody while somebody rests (before 19:00) */
  function showHud(force) {
    var now = Date.now(), txt = '', ui;
    if (!force && now - hudAt < 250) return;
    hudAt = now;
    if (T.hour < RC.END && (R.n > 0 || isLying())) txt = 'Đang nằm nghỉ' + (R.m > 1 ? ' ' + R.n + '/' + R.m : '') + ' · ' + T.clock();
    if (txt === hudTxt) return;
    hudTxt = txt;
    if (!hud) { ui = document.getElementById('ui'); if (!ui) return; hud = document.createElement('div'); hud.id = 'tv-restlabel'; hud.className = 'k-ui k-pill orange'; ui.appendChild(hud); }
    hud.textContent = txt; hud.style.display = txt ? '' : 'none';
  }
  function share(force) {   // host: numbers for everybody (HUD only)
    var key = core.n + '/' + core.m + (core.fast ? 'f' : '');
    R.n = core.n; R.m = Math.max(1, core.m);
    if (key === lastKey && !force) return;
    lastKey = key;
    if (isHost() && Net.count() > 1) Net.broadcast({ t: 'rs.st', n: core.n, m: core.m });
  }
  Net.on('rs.st', function (m) { if (Net.mode === 'guest') { R.n = Math.max(0, m.n | 0); R.m = Math.max(1, m.m | 0); } });
  Net.on('rs.hb', function (m, from) { if (isHost() && Net.names[from]) core.beat(from, m.l === 1 || m.l === true, Date.now()); });
  Net.on('net:join', function () { if (isHost()) share(true); });
  Net.on('net:leave', function (m) { if (isHost() && m && m.id) core.drop(m.id); });
  Net.on('net:closed', function () { R.n = 0; R.m = 1; lastKey = ''; core.fast = false; core.since = -1; T.setSpeed(1); });

  /* ---- solo rest (not connected): climb in, lie, tap the floor to get up; at 19:00 it turns into real sleep */
  function onDown(e) { down = e.isPrimary && e.target && e.target.tagName === 'CANVAS' ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; }
  function onUp(e) {
    var d = down; down = null;
    if (!d || !soloLying || !e.isPrimary || e.target.tagName !== 'CANVAS') return;
    if (Math.abs(e.clientX - d.x) < 12 && Math.abs(e.clientY - d.y) < 12 && Date.now() - d.t < 500) leave();
  }
  function bind() { document.addEventListener('pointerdown', onDown, true); document.addEventListener('pointerup', onUp, true); }
  function unbind() { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('pointerup', onUp, true); down = null; }
  function leave() { soloLying = false; unbind(); BS.out(function () { P.unlock('sleep'); busy = false; }); }
  /** house.js doSleep (not connected, before 19:00): false = could not start. */
  R.start = function (t) {
    var done = false;
    if (busy || soloLying) return true;
    busy = true; P.stop(); P.lock('sleep');
    function inBed() { if (done) return; done = true; soloLying = true; bind(); }
    if (!BS.ready() || !BS.enter(t, inBed)) { P.unlock('sleep'); busy = false; return false; }
    setTimeout(inBed, 8000);
    return true;
  };

  /* ---- every frame, before the clock (-60): host / solo decide the speed, everybody recovers energy while lying */
  G.Loop.onUpdate(function () {
    var now = Date.now(), dH, n, lying = isLying();
    if (Net.mode !== 'guest' || !Net.live) {
      core.beat(me(), lying, now);
      T.setSpeed(core.tick(now, T.hour) ? RC.SPEED : 1);
      share();
    } else if (now - hbAt >= 1000 || (lying ? 1 : 0) !== hbL) {   // guest heartbeat: once a second + at once when the pose changes
      hbAt = now; hbL = lying ? 1 : 0; Net.send({ t: 'rs.hb', l: hbL });
    }
    if (soloLying && T.hour >= RC.END && !SV.multi()) { soloLying = false; unbind(); busy = false; H.sleepLying(); }
    showHud();
  }, -60);
  G.Loop.onUpdate(function () {   // after the clock: energy by game time (whole points)
    var dH = T.hour - lastH;
    lastH = T.hour;
    if (dH > 0 && dH < 6 && R.resting() && S.energy < S.maxEnergy) { var n = en.tick(dH, S.maxEnergy); if (n > 0) S.setEnergy(S.energy + n); }
  }, -45);
  G.Events.on('time:hourChanged', function () { showHud(true); });
})(typeof window !== 'undefined' ? window : this);
