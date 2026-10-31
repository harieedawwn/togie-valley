/* Togie Valley - net.js (Stage 14A prep + Stage 17 transport).
 * Game.Net {mode:'solo'|'host'|'guest', isHost, playerId, code, hostRoom(cb), joinRoom(code,name,cb), leave(), send, sendTo, broadcast, on, off, remote, names, looks, sendLook}; Net.rand(tag, salt) -> seeded float in [0,1) derived from Time.seed + Time.day + tag + salt.
 * Game.Players: local() -> Game.Player, get(id), list(), localId(). Remote players would be added with add(id, obj) later.
 * Load after time.js (rand reads Game.Time lazily at call time). See MULTIPLAYER_PREP.md.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.util) { console.error('[net] core.js missing'); return; }

  var Net = G.Net = { mode: 'solo', isHost: true, playerId: 'p1', code: null, live: false, remote: {}, names: {}, looks: {}, name: 'Togie' };

  /* Gameplay randomness that must agree between peers: one persistent stream per tag, keyed by (Time.seed, day, tag, salt). */
  var streams = {};
  Net.rand = function (tag, salt) {
    var T = G.Time, seed = (T && T.seed) || 1, day = (T && T.day) || 1, key = seed + '|' + day + '|' + (salt || 0), s = streams[tag];
    if (!s || s.key !== key) {
      var h = 2166136261, str = key + '|' + tag, i;
      for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      s = streams[tag] = { key: key, f: G.util.rng(h >>> 0) };
    }
    return s.f();
  };

  var extra = {};
  G.Players = {
    local: function () { return G.Player; },
    localId: function () { return Net.playerId; },
    get: function (id) { return id === Net.playerId ? G.Player : (extra[id] || null); },
    list: function () { var a = [{ id: Net.playerId, player: G.Player, local: true }]; for (var k in extra) a.push({ id: k, player: extra[k], local: false }); return a; },
    add: function (id, obj) { if (id !== Net.playerId) extra[id] = obj; },
    remove: function (id) { delete extra[id]; }
  };
  /* ------------------------------------------------ Stage 17 transport (relay protocol: see CONTRACT.md) */
  var NS = G.NetSmooth, clk = NS ? NS.clock() : null, tNo = 0, lastTx = 0, maxPsTs = 0;
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  Net.ents = {};   // id -> NetSmooth entity (snapshot buffer + displayed pose), read by avatars.js
  Net.hostNow = function () { return nowMs() + (Net.mode === 'guest' && clk ? clk.offset() : 0); };   // host clock estimate (ms)
  Net.ping = function () { return Net.mode === 'guest' && clk ? clk.ping() : (Net.mode === 'host' ? 0 : -1); };   // median rtt of the last 8 pongs, -1 = unknown
  function feed(id, ts, x, z, ry, sp, sc) { if (!NS) return; var e = Net.ents[id] || (Net.ents[id] = NS.entity()); NS.push(e, ts, x, z, ry, sp, sc); }
  var ws = null, hb = 0, posT = 0, handlers = {}, peers = {}, lastSent = '', dirty = false, closedFired = false, upSeen = false;
  var NAME_KEY = 'togie-valley/mp-name';

  /* Display names (stage 39): max 14 chars, whitespace collapsed, control / zero-width / bidi chars stripped, never empty. Always rendered as text (canvas fillText / textContent), never HTML. */
  var NAME_MAX = 14, CTRL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
  Net.NAME_MAX = NAME_MAX;
  Net.cleanName = function (s) {
    s = String(s == null ? '' : s);
    if (s.normalize) { try { s = s.normalize('NFC'); } catch (e) { /* ignore */ } }
    s = s.replace(/\s+/g, ' ').replace(CTRL, '').trim().slice(0, NAME_MAX);
    var c = s.length ? s.charCodeAt(s.length - 1) : 0;
    if (c >= 0xd800 && c <= 0xdbff) s = s.slice(0, -1);   // never cut an emoji in half
    return s.trim() || 'Togie';
  };
  Net.uniqueName = function (name, taken) {   // 'Lan' -> 'Lan 2' when another player already has it (case-insensitive)
    var low = {}, i, n = 2, sfx, cand;
    for (i = 0; i < taken.length; i++) low[String(taken[i]).toLowerCase()] = 1;
    name = Net.cleanName(name);
    if (!low[name.toLowerCase()]) return name;
    for (;; n++) { sfx = ' ' + n; cand = name.slice(0, NAME_MAX - sfx.length).trim() + sfx; if (!low[cand.toLowerCase()]) return cand; }
  };
  Net.defaultName = function () { try { var S = G.SaveSlots, i = S && S.activeIndex ? S.activeIndex() : -1, n = i >= 0 && S.name ? S.name(i) : ''; return n ? Net.cleanName(n) : 'Togie'; } catch (e) { return 'Togie'; } };
  Net.savedName = function () { try { var v = localStorage.getItem(NAME_KEY); return v ? Net.cleanName(v) : Net.defaultName(); } catch (e) { return Net.defaultName(); } };
  Net.saveName = function (n) { try { localStorage.setItem(NAME_KEY, Net.cleanName(n)); } catch (e) { /* ignore */ } };
  var lastRename = -1e9;
  Net.setName = function (val) {   // rename from UI: -> {ok, name} | {ok:false, wait:true}; 1 change / 2 s; saved, then host rebroadcasts (guest asks the host, who may add a suffix)
    var t = nowMs(), nm = Net.cleanName(val);
    if (t - lastRename < 2000) return { ok: false, wait: true, name: Net.name };
    lastRename = t; Net.saveName(nm);
    if (Net.mode === 'host') { Net.name = Net.uniqueName(nm, hostOthers('p1')); Net.names.p1 = Net.name; namesDirty = true; dirty = true; }
    else if (Net.mode === 'guest') { Net.name = nm; raw_({ t: 'name', name: nm }); }
    else Net.name = nm;
    return { ok: true, name: Net.name };
  };
  Net.currentName = function () { return Net.mode === 'solo' ? Net.savedName() : Net.name; };
  Net.bindNameInput = function (inp) {   // shared by Settings > Phòng and the character creator: commits on change / Enter, empty or too-fast edits revert
    inp.maxLength = NAME_MAX; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'Tên hiển thị'); inp.value = Net.currentName();
    function commit() {
      var cur = Net.currentName(), r;
      if (!inp.value.trim() || Net.cleanName(inp.value) === cur) { inp.value = cur; return; }
      r = Net.setName(inp.value);
      if (!r.ok) { if (G.UI && G.UI.toast) G.UI.toast('Đợi 2 giây rồi đổi tên tiếp nhé.', 'warn'); inp.value = cur; return; }
      inp.value = r.name;
    }
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); } e.stopPropagation(); });
    return inp;
  };
  function hostOthers(id) { var o = [], k; if (id !== 'p1') o.push(Net.name); for (k in peers) if (k !== id && peers[k].name) o.push(peers[k].name); return o; }
  Net.configured = function () { var c = G.NetConfig; return !!(c && c.server && String(c.server).indexOf('REPLACE_ME') < 0); };
  Net.count = function () { var n = 1, k; if (Net.mode === 'host') { for (k in peers) n++; } else if (Net.mode === 'guest') { for (k in Net.remote) n++; } return n; };

  Net.on = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); return function () { Net.off(type, fn); }; };
  Net.off = function (type, fn) { var a = handlers[type]; if (!a) return; if (!fn) { delete handlers[type]; return; } var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  function emit(type, msg, from) { var a = handlers[type], i; if (!a) return; a = a.slice(); for (i = 0; i < a.length; i++) { try { a[i](msg, from); } catch (e) { console.error('[net] handler ' + type, e); } } }

  function raw(o, lossy) { if (ws && ws.readyState === 1) {
    if (lossy && ws.bufferedAmount > 65536) return false;   // backed up: skip this movement packet, the next one carries newer state
     try { ws.send(JSON.stringify(o)); return true; } catch (e) { /* ignore */ } } return false; }
  Net.send = function (msg) { if (Net.mode !== 'guest') return false; return raw(msg); };
  Net.sendTo = function (id, msg) { if (Net.mode !== 'host') return false; msg.to = id; return raw(msg); };
  Net.broadcast = function (msg, lossy) { if (Net.mode !== 'host') return false; msg.to = '*'; return raw(msg, lossy); };

  function raw_(o) { return raw(o); }
  function stopTimers() { clearInterval(hb); clearInterval(posT); hb = posT = 0; }
  function reset() { Net.ents = {}; tNo = 0; lastTx = 0; maxPsTs = 0; if (clk) clk.reset(); Net.looks = {}; looksDirty = false; snapReady = false; snapQueued = null; snapBuf = null; stopTimers(); peers = {}; Net.remote = {}; Net.names = {}; Net.code = null; lastSent = ''; dirty = false; }
  Net.leave = function () {
    var s = ws; ws = null; closedFired = true;
    if (s) { s.onopen = s.onmessage = s.onerror = s.onclose = null; try { s.close(); } catch (e) { /* ignore */ } }
    reset(); Net.live = false; Net.mode = 'solo'; Net.isHost = true; Net.playerId = 'p1';
  };

  function connect(path, cb) {
    var done = false, url, tmo = 0;
    function finish(err, d) { if (done) return; done = true; clearTimeout(tmo); cb(err, d); }
    if (!Net.configured()) { finish('not_set_up'); return; }
    if (ws) Net.leave();
    closedFired = false; upSeen = false;
    url = String(G.NetConfig.server).replace(/\/+$/, '') + path;
    var s;
    try { s = ws = new WebSocket(url); } catch (e) { ws = null; finish('unreachable'); return; }
    tmo = setTimeout(function () {   // relay still waking up: give up this attempt after 8 s so the caller can retry
      if (upSeen || s !== ws) return;
      ws = null; s.onopen = s.onmessage = s.onerror = s.onclose = null; try { s.close(); } catch (e) { /* ignore */ }
      finish('unreachable');
    }, 8000);
    s.onmessage = function (ev) {
      if (s !== ws) return;
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (!upSeen) {
        if (m.t === 'hello') { upSeen = true; finish(null, m); }
        else if (m.t === 'err') { finish(m.reason || 'unreachable'); }
        return;
      }
      route(m);
    };
    s.onerror = function () { /* onclose follows */ };
    s.onclose = function () {
      if (s !== ws) return;
      ws = null;
      if (!upSeen) { finish('unreachable'); return; }
      stopTimers();
      if (!closedFired) { closedFired = true; emit('net:closed', { reason: 'drop' }); }
    };
  }

  function startTimers() {
    stopTimers();
    hb = setInterval(function () { raw({ t: 'ping' }); }, 25000);
    posT = setInterval(tick, 66);   // 15 Hz
  }

  /* local state -> [x,z,ry,sc,sp], quantised (x,z 1/32 tile, ry 1/64 rad, sp 0.1); sent as pos {x,z,ry,sc,sp,ts} / ps p:{id:[x,z,ry,sc,sp,ts]}, ts = host-clock ms */
  function localState() {
    var P = G.Player, q = NS ? NS.q : function (v, n) { return Math.round(v * n) / n; };
    if (!P || !P.pos) return null;
    return [q(P.pos.x, 32), q(P.pos.z, 32), q(P.root ? P.root.rotation.y : 0, 64), (G.Scenes && G.Scenes.current) || 'outdoor', q(P.speed || 0, 10)];
  }
  function tick() {
    var st = localState(), key, t = nowMs(), ts, changed, tl = Net.toolByte ? Net.toolByte() : 0;
    if (!st || !Net.live) return;
    tNo++;
    ts = Math.round(Net.hostNow());
    key = st.join(',') + ',' + tl;   // stage 37: tool id + tier + seated bit (one byte) ride the movement snapshot
    changed = key !== lastSent;
    if (Net.mode === 'guest') {
      if (tNo === 1 || tNo === 5 || tNo === 9 || tNo === 13 || tNo % 30 === 0) raw({ t: 'tp', c: Math.round(t * 10) / 10 });   // clock probes: burst at join, then every 2 s
      if ((changed || t - lastTx >= 250) && (!clk || clk.has() || tNo > 20)) {   // changed-only + 4 Hz keepalive
        var m = { t: 'pos', x: st[0], z: st[1], ry: st[2], sc: st[3], sp: st[4], tl: tl };
        if (clk && clk.has()) m.ts = ts;
        if (raw(m, true)) { lastSent = key; lastTx = t; }
      }
    } else if (Net.mode === 'host') {
      if (++clkTick >= (G.Time && G.Time.speed > 1 ? 3 : 30)) { clkTick = 0; sendClk(); }   // Stage 17: clock every 2 s (every 0.2 s while the rest fast-forward runs)
      if (changed) { lastSent = key; dirty = true; lastSt = st.concat(ts, tl); }
      else if (t - lastTx >= 250) { lastSt = st.concat(ts, tl); dirty = true; }   // keepalive
      if (dirty && Object.keys(peers).length) {
        if (!lastSt) lastSt = st.concat(ts, tl);
        var p = {}, k;
        p.p1 = lastSt;
        for (k in peers) if (Net.remote[k]) p[k] = Net.remote[k];
        var out = { t: 'ps', p: p };
        if (namesDirty) out.n = hostNames();
        if (looksDirty) out.l = hostLooks();
        if (Net.broadcast(out, true)) { dirty = false; lastTx = t; namesDirty = false; looksDirty = false; }   // one batched message per tick for all players
      } else if (dirty) dirty = false;
    }
  }
  var lastSt = null;
  var namesDirty = false, looksDirty = false;
  /* Look sync (Round 2 stage 2): encoded look strings (Game.Look.encode, <= 80 chars). guest -> host {t:'hi',look} / {t:'look',look}; host -> all in 'ps' as l:{id:str}. */
  function myLook() { return G.Look ? G.Look.encode(G.Look.get()) : ''; }
  function cleanLook(s) { return typeof s === 'string' && s.length <= 80 ? s : ''; }
  function sendLook() {
    if (!Net.live) return;
    if (Net.mode === 'guest') raw({ t: 'look', look: myLook() });
    else if (Net.mode === 'host') { Net.looks.p1 = myLook(); looksDirty = true; dirty = true; }
  }
  Net.sendLook = sendLook;   // lobby calls it once the guest's own slot (and look) is loaded
  G.Events.on('look:changed', sendLook);
  function hostLooks() { var l = { p1: Net.looks.p1 || myLook() }, k; for (k in peers) if (Net.looks[k]) l[k] = Net.looks[k]; return l; }
  function hostNames() { var n = { p1: Net.name }, k; for (k in peers) n[k] = peers[k].name; return n; }

  function route(m) {
    var t = m.t, id;
    if (Net.mode === 'host') {
      if (t === 'join') { peers[m.id] = { name: 'Togie', rt: -1e9 }; return; }
      if (t === 'leave') {
        delete peers[m.id]; delete Net.remote[m.id]; delete Net.ents[m.id]; delete Net.names[m.id]; delete Net.looks[m.id]; dirty = true; namesDirty = true;
        emit('net:leave', { id: m.id }); return;
      }
      id = m.from;
      if (t === 'hi') {
        if (!peers[id]) peers[id] = {};
        peers[id].name = Net.uniqueName(m.name, hostOthers(id)); Net.names[id] = peers[id].name; namesDirty = true; dirty = true;
        Net.looks[id] = cleanLook(m.look); looksDirty = true;   // everyone gets the full look map again
        emit('net:join', { id: id, name: peers[id].name }); return;
      }
      if (t === 'name') {   // rename: ignored when the sender never said hi or renames faster than 1 per 2 s
        if (!peers[id] || !peers[id].name) return;
        var rt = nowMs(); if (rt - (peers[id].rt || -1e9) < 2000) return;
        peers[id].rt = rt; var nn = Net.uniqueName(m.name, hostOthers(id));
        if (nn !== peers[id].name) { peers[id].name = nn; Net.names[id] = nn; namesDirty = true; dirty = true; emit('net:rename', { id: id, name: nn }); }
        return;
      }
      if (t === 'look') { if (peers[id]) { Net.looks[id] = cleanLook(m.look); looksDirty = true; dirty = true; } return; }
      if (t === 'pos') {
        if (!peers[id]) return;
        var hn = Net.hostNow(), pts = +m.ts, old = Net.remote[id], arr;
        if (!(pts > 0) || Math.abs(pts - hn) > 3000) pts = Math.round(hn);   // no/implausible stamp: use arrival time
        arr = [+m.x || 0, +m.z || 0, +m.ry || 0, String(m.sc || 'outdoor'), +m.sp || 0, pts, (+m.tl | 0) & 255];
        feed(id, pts, arr[0], arr[1], arr[2], arr[4], arr[3]);
        if (!old || pts >= old[5]) { Net.remote[id] = arr; dirty = true; }   // reordered older packet only feeds the buffer
        return;
      }
    } else if (Net.mode === 'guest') {
      if (t === 'closed') { if (!closedFired) { closedFired = true; emit('net:closed', { reason: 'host' }); } try { ws && ws.close(); } catch (e) { /* ignore */ } return; }
      if (t === 'ps' && m.p) {
        var r = {}, k, a, ts, hn, mx = 0;
        if (clk && !clk.has() && m.p.p1 && m.p.p1[5] > 0) clk.provisional(m.p.p1[5] - nowMs());
        hn = Net.hostNow();
        for (k in m.p) {
          a = m.p[k];
          if (k === Net.playerId || !(a instanceof Array)) continue;
          ts = +a[5]; if (!(ts > 0)) { ts = Math.round(hn); a[5] = ts; }
          if (ts > mx) mx = ts;
          r[k] = a; feed(k, ts, +a[0] || 0, +a[1] || 0, +a[2] || 0, +a[4] || 0, String(a[3] || 'outdoor'));
        }
        if (mx >= maxPsTs) { maxPsTs = mx; Net.remote = r; for (k in Net.ents) if (!r[k]) delete Net.ents[k]; }
        if (m.n && typeof m.n === 'object') {
          for (k in m.n) if (/^p\d{1,2}$/.test(k) && typeof m.n[k] === 'string') Net.names[k] = Net.cleanName(m.n[k]);   // receiver sanitises again
          if (Net.names[Net.playerId]) Net.name = Net.names[Net.playerId];   // host may have added a suffix
        }
        if (m.l && typeof m.l === 'object') { var lk = {}; for (k in m.l) if (k !== Net.playerId) lk[k] = cleanLook(m.l[k]); Net.looks = lk; }
        emit('net:ps', m, m.from); return;
      }
    }
    if (t) emit(t, m, m.from);
  }

  /* ------------------------------------------------ Stage 17 world sync (snapshot + clock) */
  var CHUNK = 40000, MAXMSG = 60000, snapBuf = null, snapReady = false, snapQueued = null, clkTick = 0;

  function sendSnap(id) {   // host -> one guest: world-scope savers as JSON strings, split into snapc chunks when large
    var dump = G.Save.dump('world'), w = {}, k, text, n, i;
    for (k in dump) { try { w[k] = JSON.stringify(dump[k]); } catch (e) { /* skip */ } }
    text = JSON.stringify({ t: 'snap', world: w });
    if (text.length <= MAXMSG) { Net.sendTo(id, { t: 'snap', world: w }); return; }
    n = Math.ceil(text.length / CHUNK);
    for (i = 0; i < n; i++) Net.sendTo(id, { t: 'snapc', i: i, n: n, d: text.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  function applySnap() {   // guest: memory only, never written to disk (Save.now keeps the slot's own world keys)
    var w = snapQueued, map = {}, k; snapQueued = null;
    if (!w) return;
    for (k in w) { if (G.Save.scopeOf(k) !== 'world') continue; try { map[k] = JSON.parse(w[k]); } catch (e) { /* skip bad section */ } }
    if (map.farm && G.Farm && G.Farm.waterLeft) map.farm.water = G.Farm.waterLeft();   // the watering can stays personal
    G.Save.applyMap(map);
    G.Events.emit('net:snapshot', {});
    if (G.Time) G.Events.emit('weather:changed', { weather: G.Time.weather });   // late joiner in rain/snow: HUD + audio follow
  }
  function gotSnap(world) { snapQueued = world; if (snapReady) applySnap(); }
  Net.syncReady = function () { snapReady = true; if (snapQueued) applySnap(); };   // lobby: the guest's own world has finished loading
  Net.on('snap', function (m) { if (Net.mode === 'guest' && m.world && typeof m.world === 'object') gotSnap(m.world); });
  Net.on('snapc', function (m) {
    if (Net.mode !== 'guest' || !(m.n > 0 && m.n <= 200) || !(m.i >= 0 && m.i < m.n) || typeof m.d !== 'string') return;
    if (!snapBuf || snapBuf.n !== m.n) snapBuf = { n: m.n, got: 0, parts: [] };
    if (snapBuf.parts[m.i] === undefined) { snapBuf.parts[m.i] = m.d; snapBuf.got++; }
    if (snapBuf.got === snapBuf.n) {
      var o = null; try { o = JSON.parse(snapBuf.parts.join('')); } catch (e) { o = null; }
      snapBuf = null;
      if (o && o.t === 'snap' && o.world) gotSnap(o.world);
    }
  });
  Net.on('net:join', function (m) { if (Net.mode === 'host') sendSnap(m.id); });
  /* Clock probe: guest {t:'tp',c:localMs} -> host {t:'tq',c,s:hostMs} to that guest; offset = s + rtt/2 - now, median of 8. */
  Net.on('tp', function (m, from) { if (Net.mode === 'host' && from && typeof m.c === 'number') Net.sendTo(from, { t: 'tq', c: m.c, s: Math.round(nowMs() * 10) / 10 }); });
  Net.on('tq', function (m) {
    var now = nowMs(), rtt = now - m.c;
    if (Net.mode !== 'guest' || !clk || typeof m.c !== 'number' || typeof m.s !== 'number' || !(rtt >= 0 && rtt < 10000)) return;
    clk.add(m.s + rtt / 2 - now, rtt);
  });

  function sendClk() {
    var T = G.Time;
    if (Net.mode !== 'host' || !T || !Object.keys(peers).length) return;
    Net.broadcast({ t: 'clk', day: T.day, hour: Math.round(T.hour * 1000) / 1000, weather: T.weather, season: T.season, tm: T.tomorrow, sp: T.speed > 1 ? T.speed : 0 });
  }
  G.Events.on('day:started', function () { if (Net.mode === 'host') sendClk(); });
  G.Events.on('time:speed', function () { if (Net.mode === 'host') sendClk(); });
  Net.on('clk', function (m) {   // guest: day changes only come from here; between messages Time interpolates itself
    var T = G.Time, old, h;
    if (Net.mode !== 'guest' || !snapReady || !T || !(m.day > 0)) return;
    h = +m.hour; if (!(h >= T.DAY_START && h < (T.NIGHT_END || T.DAY_END))) h = T.DAY_START;
    if (m.day > T.day) {
      old = T.season; T.day = m.day | 0; T.season = m.season || T.seasonOf(T.day); T.weather = m.weather || 'sun'; T.tomorrow = m.tm || T.weatherFor(T.day + 1);
      T.setHour(h);
      if (T.season !== old) { G.Render.setSeason(T.season); G.Events.emit('season:changed', { season: T.season, from: old, day: T.day }); }
      G.Events.emit('day:started', { day: T.day, season: T.season, weather: T.weather, mode: 'net', lostMoney: 0 });
    } else if (m.day === T.day) {
      T.mirror(h, +m.sp);   // the host's fast-forward speed + clock: mirrored (display only), expires if the host goes quiet
      if (m.weather && m.weather !== T.weather) { T.weather = m.weather; G.Events.emit('weather:changed', { weather: T.weather }); }
    }
  });

  Net.hostRoom = function (cb) {
    cb = cb || function () {};
    connect('/host', function (err, h) {
      if (err) { emit('net:error', { reason: err }); cb(err); return; }
      reset(); Net.mode = 'host'; Net.live = true; Net.isHost = true; Net.playerId = h.id || 'p1'; Net.code = h.code; Net.name = Net.savedName(); lastRename = -1e9;
      Net.names = { p1: Net.name }; namesDirty = true; Net.looks = { p1: myLook() }; looksDirty = true;
      startTimers(); emit('net:ready', { code: Net.code, id: Net.playerId }); cb(null, Net.code);
    });
  };
  Net.joinRoom = function (code, name, cb) {
    cb = cb || function () {};
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { cb('no_room'); return; }
    connect('/join/' + code, function (err, h) {
      if (err) { emit('net:error', { reason: err }); cb(err); return; }
      reset(); Net.mode = 'guest'; Net.isHost = false; Net.playerId = h.id; Net.code = h.code || code; Net.name = Net.cleanName(name);
      Net.saveName(Net.name);
      lastRename = nowMs() - 2000; raw({ t: 'hi', name: Net.name, look: myLook() });
      startTimers(); emit('net:ready', { code: Net.code, id: Net.playerId }); cb(null, Net.code);
    });
  };
})();
