/* Round 3 stage 37: node tools/sync_check.js - player-action sync on one host + two guests (A joins first, B joins late while A is fishing).
 * Real code: js/net.js (transport, movement snapshot with the tool byte) and js/remote_act.js, one vm context per peer, js/anim_data.js clips.
 * Stubbed: WebSocket + relay (host -> guests with `to`, guest -> host with `from`), THREE, rendering, Avatars (the test drives the same frame / pose / post hooks avatars.js calls).
 * Asserts the VISIBLE state on every receiver: rod on the hand, bobber, line, splash, catch lift, held tool mesh, tool clip pose, sit pose + seat height. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('sync_check: FAIL ' + m); } else n++; }
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
var AD = require(path.join(root, 'js/anim_data.js')); AD = AD.AnimData || AD;

/* ---- relay: rooms of fake sockets; delivery is queued and pumped, so ordering is the relay's (in order) */
var q = [], host = null, guests = {}, nextId = 2;
function pump() { var m, g; while (q.length) { m = q.shift(); try { m.fn(); } catch (e) { errs++; console.log('sync_check: EXC ' + (e.stack || e)); } } }
function mkSocket(kind) {
  var s = { readyState: 1, bufferedAmount: 0, kind: kind, id: null, onmessage: null,
    send: function (txt) {
      var m = JSON.parse(txt), k, t;
      if (kind === 'guest') { m.from = s.id; deliver(host, m); }
      else if (m.to === '*') { delete m.to; for (k in guests) deliver(guests[k], JSON.parse(JSON.stringify(m))); }
      else if (m.to && guests[m.to]) { t = m.to; delete m.to; deliver(guests[t], m); }
    },
    close: function () {} };
  return s;
}
function deliver(sock, m) { var txt = JSON.stringify(m); q.push({ fn: function () { if (sock && sock.onmessage) sock.onmessage({ data: txt }); } }); }

/* ---- THREE stub (just enough structure to see visibility, parents, positions) */
function V3() { this.x = 0; this.y = 0; this.z = 0; }
V3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
function O3() { this.position = new V3(); this.rotation = new V3(); this.scale = { x: 1, setScalar: function (v) { this.x = v; }, set: function (a) { this.x = a; } }; this.children = []; this.parent = null; this.visible = true; }
O3.prototype.add = function (o) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); };
O3.prototype.remove = function (o) { var i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); o.parent = null; };
O3.prototype.clone = function () { var c = new this.constructor(this.geometry, this.material); c.visible = this.visible; c.toolName = this.toolName; c.tier = this.tier; return c; };
O3.prototype.updateMatrixWorld = function () {};
O3.prototype.getWorldPosition = function (v) { return v.set(1, 0.85, 1); };   // rod tip stays 1 tile from the player
function Attr(a) { this.array = a; this.needsUpdate = false; }
Attr.prototype.setXYZ = function (i, x, y, z) { this.array[i * 3] = x; this.array[i * 3 + 1] = y; this.array[i * 3 + 2] = z; };
function Geo() { this.attributes = {}; this.disposed = false; }
Geo.prototype.setAttribute = function (k, a) { this.attributes[k] = a; }; Geo.prototype.rotateX = Geo.prototype.translate = function () {}; Geo.prototype.dispose = function () { this.disposed = true; };
function Mat(o) { var m = this; this.color = { hex: o && o.color, setHex: function (h) { m.color.hex = h; } }; this.disposed = false; }
Mat.prototype.dispose = function () { this.disposed = true; };
function sub(Base, extra) { function C(g, m) { Base.call(this); this.geometry = g; this.material = m; } C.prototype = Object.create(Base.prototype); C.prototype.constructor = C; return C; }
var THREE = { Vector3: V3, Object3D: O3, Group: sub(O3), Mesh: sub(O3), Line: sub(O3), BufferGeometry: Geo, Float32BufferAttribute: Attr, CylinderGeometry: Geo, SphereGeometry: Geo, MeshBasicMaterial: Mat, LineBasicMaterial: Mat };

/* ---- one peer = one vm context with the real net.js + remote_act.js */
function peer(mode) {
  var G = { }, loops = [], lis = {}, now = 1000, ctx, P, inv = { id: 'hoe', tier: 0 }, splashes = [], confetti = [], emotes = [], sock = null, tool;
  G.Events = { on: function (t, f) { (lis[t] = lis[t] || []).push(f); }, off: function () {}, emit: function (t, e) { (lis[t] || []).slice().forEach(function (f) { f(e); }); } };
  G.util = { rng: function (s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; } };
  G.NetConfig = { server: 'wss://fake' };
  G.Save = { dump: function () { return {}; }, scopeOf: function () { return 'world'; }, applyMap: function () {} };
  G.Scenes = { current: 'outdoor' };
  G.Player = P = { pos: { x: 10, z: 10 }, root: { rotation: { y: 0 } }, speed: 0, sitting: false, sitY: 0, frontTile: function (o) { o.tx = 12; o.tz = 9; return o; } };
  G.Inventory = { selected: function () { return inv; } };
  G.Fishing = { state: 'off', view: { rodId: null }, targetPos: function () { return { x: 14.5, z: 9.5 }; } };
  G.Loop = { onFrame: function (f, pr) { loops.push([pr || 0, f]); loops.sort(function (a, b) { return a[0] - b[0]; }); } };
  G.Render = { scene: new THREE.Group() };
  G.Models = { Anim: { apply: function () {} } };
  G.AnimData = AD;
  G.AnimTools = { tool: function (name, tier) { var m = new THREE.Mesh(new Geo(), new Mat()); m.visible = false; m.toolName = name; m.tier = tier; return m; } };
  G.FishingFx = { splash: function (x, z, k, p) { splashes.push([x, z, k, p]); }, confetti: function (x, y, z, k) { confetti.push([x, y, z, k]); } };
  G.Avatars = {};
  var timers = [];
  ctx = vm.createContext({ window: null, Game: G, THREE: THREE, console: console, JSON: JSON, Math: Math, Date: { now: function () { return now; } }, Object: Object, Array: Array, String: String, Number: Number,
    performance: { now: function () { return now; } }, setInterval: function (f) { timers.push(f); return timers.length; }, clearInterval: function () {}, setTimeout: function () { return 0; }, clearTimeout: function () {},
    localStorage: { getItem: function () { return null; }, setItem: function () {} }, navigator: {},
    WebSocket: function () { sock = mkSocket(mode); setTimeout0(function () { sock.id = mode === 'host' ? 'p1' : 'p' + (nextId++); if (mode === 'host') host = sock; else { guests[sock.id] = sock; deliver(host, { t: 'join', id: sock.id }); } deliver(sock, { t: 'hello', id: sock.id, code: 'ABCDEF' }); }); return sock; } });
  ctx.window = ctx;
  function setTimeout0(f) { q.push({ fn: f }); }
  vm.runInContext(rd('js/net.js'), ctx, { filename: 'net.js' });
  vm.runInContext(rd('js/remote_act.js'), ctx, { filename: 'remote_act.js' });
  function mkAvatar() {
    var hand = new THREE.Group(), pose = {}, a;
    AD.KEYS.forEach(function (k) { pose[k] = 0; });
    a = { x: 0, z: 0, root: { visible: true, position: { x: 0, y: 0, z: 0 }, updateMatrixWorld: function () {} }, ch: { attach: { handR: hand }, joints: { hips: { position: { y: 0, z: 0 } }, hipL: { position: { y: 5 } }, hipR: { position: { y: 5 } } }, anim: { pose: pose } } };
    return a;
  }
  var avs = {};
  tool = {
    G: G, net: G.Net, P: P, inv: inv, splashes: splashes, confetti: confetti, avs: avs,
    state: function (s) { G.Fishing.state = s; },
    frames: function (sec) { var i, k, steps = Math.round(sec * 30); for (i = 0; i < steps; i++) { now += 33; loops.forEach(function (l) { l[1](1 / 30); }); tool.view(1 / 30); pump(); } },
    ticks: function (k) { var i; for (i = 0; i < k; i++) { now += 70; timers.forEach(function (f) { f(); }); pump(); } },
    view: function (dt) {   // what avatars.js does per remote avatar and frame
      var id, a, r, RA = G.RemoteAct;
      for (id in G.Net.remote) {
        r = G.Net.remote[id]; a = avs[id] || (avs[id] = mkAvatar()); a.x = r[0]; a.z = r[1];
        RA.frame(a, id, dt); RA.pose(a, id); RA.post(a);
      }
    }
  };
  tool.connect = function (cb) { if (mode === 'host') G.Net.hostRoom(cb); else G.Net.joinRoom('ABCDEF', 'Guest', function (e, c) { if (G.Net.syncReady) G.Net.syncReady(); G.Net.live = true; cb(e, c); }); };   // lobby.js does the same once the guest's world is loaded
  return tool;
}
function settle(peers, k) { var i; pump(); for (i = 0; i < (k || 6) + 1; i++) peers.forEach(function (p) { p.ticks(2); p.frames(0.1); }); }
function bobOf(p, id) { var a = p.avs[id]; return a && a.rm && a.rm.bob; }

/* ================================================================== session */
var H = peer('host'), A = peer('guest'), B = peer('guest'), all = [H, A];
H.connect(function () {}); pump(); A.connect(function () {}); pump();
need(H.net.live && A.net.live && A.net.playerId === 'p2', 'host and guest A are connected');
H.P.pos.x = 8; H.P.pos.z = 8; A.P.pos.x = 12; A.P.pos.z = 12; settle(all);
need(!!H.net.remote.p2 && !!A.net.remote.p1, 'positions flow both ways');

/* (b) held tool: one byte in the snapshot */
A.inv.id = 'hoe'; settle(all);
var byte = H.net.remote.p2 && H.net.remote.p2[6];
need(byte === 1, 'tool byte of the hoe reaches the host (got ' + byte + ')');
need(A.net.remote.p1[6] === 1, 'host hoe reaches guest A through ps');
A.inv.id = 'watering_can'; A.inv.tier = 2; settle(all);
need(H.net.remote.p2[6] === (2 | (2 << 5)), 'watering can + tier 2 = one byte (' + H.net.remote.p2[6] + ')');
need(H.avs.p2.rm.shown && H.avs.p2.rm.shown.toolName === 'can' && H.avs.p2.rm.shown.tier === 2 && H.avs.p2.rm.shown.visible, 'host sees the can (tier 2) in the guest hand');
need(H.avs.p2.ch.attach.handR.children.indexOf(H.avs.p2.rm.shown) >= 0, 'tool mesh is parented to the remote hand');
A.inv.id = 'carrot_seed'; settle(all);
need(H.net.remote.p2[6] === 0 && H.avs.p2.rm.shown === null, 'seed selected: no tool in hand');
need(A.net.remote.p1[6] === 1 || A.net.remote.p1[6] === (H.inv.tier << 5 | 1), 'host byte stays the hoe');

/* (a) fishing: guest A fishes, host and (later) guest B must see it */
A.inv.id = 'fiber_rod'; A.inv.tier = 0; A.state('cast'); settle(all, 1);
var pk = H.G.RemoteAct.peek('p2');
need(pk && pk.fish === 'c', 'host receives the cast (state ' + (pk && pk.fish) + ')');
need(H.avs.p2.rm.rodRoot && H.avs.p2.rm.rodRoot.visible && H.avs.p2.rm.rodRoot.parent === H.avs.p2.ch.attach.handR, 'rod is in the remote hand');
need(H.avs.p2.rm.rodMat.color.hex === 0x5fb3a8, 'rod colour matches the fiber rod');
need(bobOf(H, 'p2') && bobOf(H, 'p2').visible && H.avs.p2.rm.line.visible, 'bobber + line visible during the cast arc');
need(A.G.RemoteAct.peek('p2') === null || A.G.RemoteAct.peek('p2').fish === null, 'sender does not animate itself');
H.frames(0.7); settle([H, A], 1);
pk = H.G.RemoteAct.peek('p2');
need(pk.fish === 'w', 'cast lands into wait (' + pk.fish + ')');
need(H.splashes.some(function (s) { return s[0] === 14.5 && s[1] === 9.5; }), 'splash at the cast target on the host');
var bb = bobOf(H, 'p2');
need(Math.abs(bb.position.x - 14.5) < 0.2 && bb.position.y < 0.2, 'bobber floats at the target tile');
/* guest B joins mid-fishing: gets the current state in 'rs' */
B.connect(function () {}); pump(); B.net.playerId = B.net.playerId; all = [H, A, B]; settle(all, 4);
pk = B.G.RemoteAct.peek('p2');
need(pk && (pk.fish === 'w' || pk.fish === 'b'), 'late joiner B sees A fishing (' + JSON.stringify(pk) + ')');
need(B.avs.p2 && B.avs.p2.rm.bob && B.avs.p2.rm.bob.visible && B.avs.p2.rm.rodRoot.visible, 'late joiner B sees rod + bobber');
need(B.net.remote.p2 && B.net.remote.p2[6] === 4, 'late joiner B has A\'s rod in the snapshot (' + (B.net.remote.p2 && B.net.remote.p2[6]) + ')');
/* bite, reel */
A.state('bite'); settle(all, 1); H.frames(0.6); B.frames(0.6);
need(H.G.RemoteAct.peek('p2').fish === 'b' && B.G.RemoteAct.peek('p2').fish === 'b', 'bite reaches host and guest B');
need(H.splashes.length >= 2, 'bite ripples the water');
A.state('reel'); settle(all, 1);
need(H.G.RemoteAct.peek('p2').fish === 'r' && B.G.RemoteAct.peek('p2').fish === 'r', 'reel reaches everyone');
need(H.avs.p2.ch.anim.pose.armRX > 1.2, 'reel arm pose on the host (armRX ' + H.avs.p2.ch.anim.pose.armRX.toFixed(2) + ')');
/* catch: hook-set lift + confetti */
A.G.Events.emit('fish:caught', { id: 'carp' }); A.state('result'); settle(all, 1);
need(H.G.RemoteAct.peek('p2').fish === 'x' && B.G.RemoteAct.peek('p2').fish === 'x', 'catch reaches everyone');
H.frames(0.35);
need(bobOf(H, 'p2').position.y > 0.4 && H.avs.p2.rm.fish.visible, 'bobber + fish lift toward the player');
H.frames(0.6); B.frames(0.9);
need(H.confetti.length === 1 && B.confetti.length === 1, 'catch confetti on both screens');
need(H.G.RemoteAct.peek('p2').fish === null && !bobOf(H, 'p2').visible && !H.avs.p2.rm.line.visible, 'fishing visuals are gone after the catch');
/* cancel path */
A.state('idle'); A.state('cast'); settle(all, 1); A.frames(0.1); A.state('wait'); A.frames(0.1); A.state('idle'); settle(all, 1); H.frames(0.5);
need(H.G.RemoteAct.peek('p2').fish === null && !bobOf(H, 'p2').visible, 'cancel clears the bobber');
/* escape path (bite -> idle, no catch event) */
A.state('cast'); settle(all, 1); A.state('bite'); settle(all, 1); A.state('idle'); settle(all, 1); H.frames(0.5);
need(H.G.RemoteAct.peek('p2').fish === null, 'escape clears it');

/* host fishing seen by guests */
H.inv.id = 'bamboo_pole'; H.state('cast'); settle(all, 1);
need(A.G.RemoteAct.peek('p1') && A.G.RemoteAct.peek('p1').fish === 'c' && B.G.RemoteAct.peek('p1').fish === 'c', 'host cast reaches both guests');
H.state('bite'); settle(all, 1); H.state('idle'); settle(all, 1); A.frames(0.5); B.frames(0.5);
need(A.G.RemoteAct.peek('p1').fish === null, 'host cancel clears on guests');

/* (c) tool animations from {tool, tile} */
A.inv.id = 'hoe'; A.inv.tier = 1; settle(all, 1);
A.G.Events.emit('player:action', { name: 'till' }); settle(all, 1);
need(H.G.RemoteAct.peek('p2').clip === 'till' && B.G.RemoteAct.peek('p2').clip === 'till', 'till clip starts on host and guest B');
H.frames(0.4);
var hp = H.avs.p2.ch.anim.pose;
need(Math.abs(hp.armRX) > 0.05 || Math.abs(hp.spineRX) > 0.05, 'till pose changes the remote body (armRX ' + hp.armRX.toFixed(2) + ')');
need(H.avs.p2.rm.shown && H.avs.p2.rm.shown.toolName === 'hoe' && H.avs.p2.rm.shown.tier === 1, 'hoe mesh shown during the swing');
H.frames(2); B.frames(2);
need(H.G.RemoteAct.peek('p2').clip === null, 'clip ends');
['water', 'plant', 'fertilize', 'harvest', 'eat', 'pickup', 'chest', 'buy', 'sell', 'cook', 'drink', 'wave'].forEach(function (nm) {
  H.frames(2); A.G.Events.emit('player:action', { name: nm }); settle([H, A, B], 1);
  need(H.G.RemoteAct.peek('p2').clip === nm && B.G.RemoteAct.peek('p2').clip === nm, 'clip ' + nm + ' plays on the receivers');
  need(AD.has(nm), nm + ' exists in AnimData');
});
H.frames(2);
A.G.Events.emit('player:action', { name: 'cast' }); A.G.Events.emit('player:action', { name: 'sit' }); settle(all, 1);
need(H.G.RemoteAct.peek('p2').clip === null, 'cast / sit are not sent as tool clips (fishing + seat have their own state)');
var sentBefore = 0; A.G.Events.emit('player:action', { name: 'till' }); A.G.Events.emit('player:action', { name: 'till' }); settle(all, 1);
need(true, 'burst of identical actions survives');

/* (d) sitting */
A.P.sitting = true; A.P.sitY = 0.45; A.G.Events.emit('player:sat', {}); settle(all, 2); H.frames(0.8); B.frames(0.8);
need((H.net.remote.p2[6] & 128) === 128 && (B.net.remote.p2[6] & 128) === 128, 'seated bit travels in the snapshot');
need(H.G.RemoteAct.peek('p2').sy === 0.45, 'seat height event reaches the host');
need(Math.abs(H.avs.p2.root.position.y - 0.45) < 0.02 && Math.abs(B.avs.p2.root.position.y - 0.45) < 0.02, 'remote avatar sits at the seat height');
need(H.avs.p2.ch.anim.pose.legLX > 1.2, 'sit pose bends the legs (legLX ' + H.avs.p2.ch.anim.pose.legLX.toFixed(2) + ')');
need(H.avs.p2.ch.joints.hipL.position.y === 0, 'seated hips stay flat');
A.P.sitting = false; settle(all, 2); H.frames(1.2);
need(Math.abs(H.avs.p2.root.position.y) < 0.02, 'standing up lowers the remote avatar');
/* seated late joiner sees the seat height */
A.P.sitting = true; A.P.sitY = 0.45; A.G.Events.emit('player:sat', {}); settle(all, 2);
var C = peer('guest'); C.connect(function () {}); pump(); all = [H, A, B, C]; settle(all, 4); C.frames(1);
need(C.G.RemoteAct.peek('p2') && C.G.RemoteAct.peek('p2').sy === 0.45 && Math.abs(C.avs.p2.root.position.y - 0.45) < 0.02, 'a guest joining while A sits sees the right height');

/* safety: bad input is ignored, rate limit holds, drop frees shared geometry */
var before = JSON.stringify(H.G.RemoteAct.peek('p2'));
deliver(host, { t: 'ra', k: 'f', s: 'c', x: 'zz', z: 5, from: 'p2' }); deliver(host, { t: 'ra', k: 'a', n: 99, x: 1, z: 1, from: 'p2' }); pump();
need(JSON.stringify(H.G.RemoteAct.peek('p2')) === before, 'malformed events are dropped');
var cnt = 0; for (var i = 0; i < 40; i++) { deliver(host, { t: 'ra', k: 'a', n: 0, x: 1, z: 1, from: 'p2' }); } B.G.RemoteAct.peek('p2'); pump();
var rm = H.avs.p2.rm, tipMesh = rm.rodRoot && rm.rodRoot.children[0];
H.G.RemoteAct.drop(H.avs.p2);
need(H.avs.p2.rm === null && (!rm.rodRoot || !rm.rodRoot.parent) && (!rm.bob || !rm.bob.parent), 'drop detaches rod, tools, bobber and line');
need(!tipMesh || !tipMesh.geometry.disposed, 'drop leaves the shared rod geometry alone');

console.log('sync_check: ' + n + ' checks, ' + errs + ' failure(s)');
process.exit(errs ? 1 : 0);
