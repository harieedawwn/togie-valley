/* Round 3 stage 39: node tools/name_check.js - display names: sanitising, duplicate suffix, rename rate limit, host/guest sync (real js/net.js per peer, stubbed WebSocket relay). */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('name_check: FAIL ' + m); } else n++; }
var src = fs.readFileSync(path.join(__dirname, '../js/net.js'), 'utf8'), clock = 1000, ivs = [], host = null, guests = {}, q = [], nextId = 2;
function deliver(s, m) { var t = JSON.stringify(m); q.push(function () { if (s && s.onmessage) s.onmessage({ data: t }); }); }
function pump() { while (q.length) q.shift()(); }
function mkPeer(kind) {
  var store = {}, sock = { readyState: 1, bufferedAmount: 0, id: null, close: function () {}, send: function (txt) {
    var m = JSON.parse(txt), k, t;
    if (kind === 'guest') { m.from = sock.id; deliver(host.sock, m); }
    else if (m.to === '*') { delete m.to; for (k in guests) deliver(guests[k].sock, JSON.parse(JSON.stringify(m))); }
    else if (m.to && guests[m.to]) { t = m.to; delete m.to; deliver(guests[t].sock, m); }
  } };
  var G = { util: {}, Events: { on: function () {}, emit: function () {} }, Player: { pos: { x: 1, z: 1 }, speed: 0 }, Save: { dump: function () { return {}; } }, NetConfig: { server: 'wss://x' } };
  var ctx = { window: { Game: G }, console: console, JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array, String: String, RegExp: RegExp, performance: { now: function () { return clock; } },
    localStorage: { getItem: function (k) { return store[k] == null ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); } },
    setInterval: function (f) { ivs.push(f); return ivs.length; }, clearInterval: function () {}, setTimeout: function () { return 0; }, clearTimeout: function () {},
    WebSocket: function () { return sock; } };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { G: G, Net: G.Net, sock: sock, store: store, kind: kind };
}
function connect(p, name) {   // drive Net.hostRoom / joinRoom with a fake socket that says hello once handlers are attached
  var err = 'x';
  var Net = p.Net; var done = function (e) { err = e; };
  var ws = p.sock;
  if (p.kind === 'host') { Net.hostRoom(done); host = p; }
  else { nextId++; Net.joinRoom('ABC123', name, done); }
  var h = { t: 'hello', id: p.kind === 'host' ? 'p1' : 'p' + (nextId - 1), code: 'ABC123' };
  ws.id = h.id; if (p.kind === 'guest') guests[h.id] = p;
  if (p.kind === 'guest') deliver(host.sock, { t: 'join', id: h.id });
  ws.onmessage({ data: JSON.stringify(h) });
  pump(); return err;
}
function tick() { clock += 70; ivs.slice().forEach(function (f) { f(); }); pump(); }
function ticks(k) { while (k--) tick(); }

/* ---- pure sanitising */
var P = mkPeer('host'), N = P.Net;
need(N.cleanName('  Lan   Anh ') === 'Lan Anh', 'trim + collapse spaces');
need(N.cleanName('') === 'Togie' && N.cleanName('   ') === 'Togie' && N.cleanName(null) === 'Togie', 'never empty');
need(N.cleanName('a\u0000b\u001f\u007fc\u200bd\u202ee') === 'abcde', 'control / zero-width / bidi stripped: ' + JSON.stringify(N.cleanName('a\u0000b\u001f\u007fc\u200bd\u202ee')));
need(N.cleanName('Nguyễn Thị Hồng Nhung Phương').length <= 14, 'max 14');
need(N.cleanName('Trần Thị Mỹ Linh').indexOf('Trần') === 0, 'Vietnamese letters kept');
need(N.cleanName('Nguye\u0302\u0303n') === 'Nguyễn', 'NFC normalised');
need(N.cleanName('abcdefghijklm\ud83d\ude00') === 'abcdefghijklm', 'no half emoji at the cut');
need(N.cleanName('<img src=x onerror=1>') === '<img src=x one', 'html kept as plain text (clamped), rendered via textContent/fillText');
need(N.uniqueName('Lan', []) === 'Lan' && N.uniqueName('Lan', ['lan']) === 'Lan 2' && N.uniqueName('Lan', ['Lan', 'Lan 2']) === 'Lan 3', 'duplicate suffix');
need(N.uniqueName('Abcdefghijklmn', ['Abcdefghijklmn']).length <= 14, 'suffix stays within 14');

/* ---- room: host + 2 guests */
var H = P; need(connect(H, '') === null, 'host room opens'); need(H.Net.name === 'Togie', 'host default name');
H.store['togie-valley/mp-name'] = 'Lan'; 
var A = mkPeer('guest'), B = mkPeer('guest');
need(connect(A, 'Lan') === null, 'guest A joins'); ticks(3);
need(connect(B, '  lan  ') === null, 'guest B joins'); ticks(3);
need(H.Net.names[A.Net.playerId] === 'Lan' && H.Net.names[B.Net.playerId] === 'lan 2', 'host dedups B against A: ' + JSON.stringify(H.Net.names));
need(B.Net.name === 'lan 2' && A.Net.names[B.Net.playerId] === 'lan 2' && B.Net.names.p1 === 'Togie', 'everyone sees the final names: ' + JSON.stringify(A.Net.names));
/* host renames to a taken name */
clock += 3000; var r = H.Net.setName('Lan'); ticks(3);
need(r.ok && H.Net.name === 'Lan 3' && A.Net.names.p1 === 'Lan 3' && B.Net.names.p1 === 'Lan 3', 'host rename deduped + broadcast: ' + H.Net.name);
need(H.store['togie-valley/mp-name'] === 'Lan', 'requested name stored for next time');
/* guest rename live */
clock += 3000; r = A.Net.setName('Minh'); ticks(3);
need(r.ok && H.Net.names[A.Net.playerId] === 'Minh' && B.Net.names[A.Net.playerId] === 'Minh' && A.Net.name === 'Minh', 'guest rename syncs to host and other guest');
/* rate limit (sender side + host side) */
clock += 500; r = A.Net.setName('Nam'); ticks(2);
need(!r.ok && r.wait && A.Net.name === 'Minh' && H.Net.names[A.Net.playerId] === 'Minh', 'sender limited to 1 per 2 s');
A.sock.send(JSON.stringify({ t: 'name', name: 'Hack' })); pump(); ticks(2);   // bypass the client limiter
need(H.Net.names[A.Net.playerId] === 'Minh', 'host also rate-limits a guest that bypasses the client');
clock += 2500; A.sock.send(JSON.stringify({ t: 'name', name: 'Bé\u0000\u200b<b>Xin chào rất dài ok' })); pump(); ticks(2);
var got = H.Net.names[A.Net.playerId];
need(got.length <= 14 && !/[\u0000-\u001f\u200b]/.test(got) && B.Net.names[A.Net.playerId] === got, 'host sanitises hostile rename: ' + JSON.stringify(got));
need(A.Net.name === got, 'guest adopts the host-approved name');
/* receiver sanitises a hostile ps */
var evil = { t: 'ps', p: {}, n: { p1: 'x\u0000y' + new Array(40).join('z'), __proto__: 'bad', p9: 'ok', pq: 'no' } };
B.sock.onmessage({ data: JSON.stringify(evil).replace('"__proto__"', '"__proto__"') });
need(B.Net.names.p1.length <= 14 && B.Net.names.p1.indexOf('\u0000') < 0 && !B.Net.names.pq, 'guest clamps names it receives');
/* leave frees the name; empty never leaves a blank */
clock += 3000; H.Net.setName(''); need(H.Net.name.length > 0, 'empty rename keeps a name');
/* real code path (stubs would hide it): names are drawn as text */
var av = fs.readFileSync(path.join(__dirname, '../js/avatars.js'), 'utf8'), ui = fs.readFileSync(path.join(__dirname, '../js/ui_layout.js'), 'utf8');
need(/fillText\(name/.test(av) && !/innerHTML[^;]*Net\.name/.test(av + ui), 'avatars use fillText; no innerHTML with names');
need(/list\.textContent = ''/.test(ui) && !/s\.replace\(\/\[&<>/.test(ui), 'room list built with textContent');
console.log('name_check: ' + n + ' ok, ' + errs + ' failed');
process.exit(errs ? 1 : 0);
