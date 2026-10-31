/* Round 3 stage 33: node tools/parity_check.js - scripted session on one host + two guests (A joins first, B joins late during rain at night):
 * till, plant, water, sleep, harvest, place furniture (incl. a same-tile clash), chest take, sell to the bin, fish, lamp toggle.
 * Real code: items, crops, state, save, furniture, placement_logic, land_office, sleep_vote, farm.js and world_sync.js, one vm context per peer.
 * Stubbed: rendering, relay (in-order bus), the Net wire (snapshot/clk logic copied from net.js), placement.js UI (list saver only), furn_live (saver only). */
var fs = require('fs'), path = require('path'), vm = require('vm'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('parity: FAIL ' + m); } else n++; }
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function any() { var f = function () {}; return new Proxy(f, { get: function (t, k) { return k === Symbol.toPrimitive ? function () { return 0; } : k === 'then' ? undefined : any(); }, apply: function () { return any(); }, construct: function () { return any(); } }); }
var VC = require(path.join(root, 'js/sleep_vote.js')), rows = require(path.join(root, 'js/world_map.js')); rows = (rows.WorldMap || rows).rows;
var soil = []; rows.forEach(function (r, z) { for (var x = 0; x < r.length; x++) if (r.charAt(x) === 't') soil.push([x, z]); });
need(soil.length >= 6, 'soil tiles on the map');
var queue = [], peers = {}, T0 = 0;
function pump() { var m, p; while (queue.length) { m = queue.shift(); p = peers[m.to]; if (p) p.net._in(m.msg, m.from); } }

function peer(id, mode) {
  var ls = {}, lis = {}, hs = {}, hooksE = [], hooksS = [], placed = [], lamp = {}, wx = 0, G = {}, Net;
  G.Events = { on: function (t, f) { (lis[t] = lis[t] || []).push(f); }, off: function () {}, emit: function (t, e) { (lis[t] || []).slice().forEach(function (f) { f(e); }); } };
  G.util = { rng: function (s) { return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } };
  var T = G.Time = { day: 1, hour: 8, season: 'spring', weather: 'sun', tomorrow: 'sun', seed: 7, DAY_START: 6, NIGHT_END: 26, setHour: function (h) { T.hour = h; }, seasonOf: function (d) { return ['spring', 'summer', 'autumn', 'winter'][Math.floor((d - 1) / 14) % 4]; }, weatherFor: function () { return 'sun'; },
    save: function () { return { day: T.day, season: T.season, weather: T.weather, tomorrow: T.tomorrow, hour: T.hour }; }, load: function (o) { T.day = o.day; T.season = o.season; T.weather = o.weather; T.tomorrow = o.tomorrow; T.hour = o.hour; }, reset: function () {} };
  G.Day = { onEnd: function (p, f) { hooksE.push([p, f]); hooksE.sort(function (a, b) { return a[0] - b[0]; }); }, onStart: function (p, f) { hooksS.push([p, f]); hooksS.sort(function (a, b) { return a[0] - b[0]; }); },
    sleep: function () {
      var info = { day: T.day, mode: 'full', hour: T.hour }, st;
      if (Net.mode === 'guest') { G.Events.emit('day:ended', info); G.Events.emit('day:started', { day: T.day, mode: 'full' }); return true; }   // like time.js: a guest never rolls the day
      hooksE.forEach(function (h) { h[1](info); }); G.Events.emit('day:ended', info);
      T.day++; T.season = T.seasonOf(T.day); T.weather = T.tomorrow; T.tomorrow = T.weatherFor(T.day + 1); T.hour = 6;
      st = { day: T.day, season: T.season, weather: T.weather, mode: 'full' }; hooksS.forEach(function (h) { h[1](st); }); G.Events.emit('day:started', st); return true;
    } };
  var guestsOf = function () { return Object.keys(peers).filter(function (k) { return k !== 'p1' && peers[k].joined; }); };
  Net = G.Net = { mode: mode, isHost: mode === 'host', playerId: id, live: mode === 'host', names: { p1: 'Host' }, remote: {}, looks: {}, ents: {},
    on: function (t, f) { (hs[t] = hs[t] || []).push(f); }, off: function () {},
    _in: function (m, from) { (hs[m.t] || []).slice().forEach(function (f) { f(m, from); }); },
    count: function () { return mode === 'host' ? 1 + guestsOf().length : 1 + Object.keys(peers).length - 1; },
    send: function (m) { if (mode !== 'guest') return false; queue.push({ to: 'p1', from: id, msg: JSON.parse(JSON.stringify(m)) }); return true; },
    sendTo: function (to, m) { if (mode !== 'host') return false; queue.push({ to: to, from: 'p1', msg: JSON.parse(JSON.stringify(m)) }); return true; },
    broadcast: function (m) { if (mode !== 'host') return false; guestsOf().forEach(function (g) { queue.push({ to: g, from: 'p1', msg: JSON.parse(JSON.stringify(m)) }); }); return true; },
    rand: function (tag, salt) { var s = 1, str = T.seed + '|' + T.day + '|' + (salt || 0) + '|' + tag, i; for (i = 0; i < str.length; i++) s = (Math.imul(s, 31) + str.charCodeAt(i)) | 0; return G.util.rng(s)(); } };
  G.Net.on('hi', function (m, from) { if (mode === 'host') { Net.names[from] = 'G'; peers[from].joined = true; Net.sendTo(from, { t: 'snap', world: snapOut() }); Net.sendTo(from, { t: 'clk', day: T.day, hour: T.hour, weather: T.weather, season: T.season, tm: T.tomorrow }); } });
  function snapOut() { var d = G.Save.dump('world'), w = {}, k; for (k in d) w[k] = JSON.stringify(d[k]); return w; }
  G.Net.on('snap', function (m) { var map = {}, k; for (k in m.world) { if (G.Save.scopeOf(k) === 'world') map[k] = JSON.parse(m.world[k]); } if (map.farm) map.farm.water = G.Farm.waterLeft(); G.Save.applyMap(map); G.Events.emit('net:snapshot', {}); G.Events.emit('weather:changed', { weather: T.weather }); Net.live = true; });   // like net.js applySnap
  G.Net.on('clk', function (m) {   // copy of net.js clk handling (day jump + weather change)
    if (mode !== 'guest' || !Net.live) return;
    if (m.day > T.day) { T.day = m.day; T.season = m.season; T.weather = m.weather; T.tomorrow = m.tm; T.hour = m.hour; G.Events.emit('day:started', { day: T.day, season: T.season, weather: T.weather, mode: 'net' }); }
    else if (m.weather && m.weather !== T.weather) { T.weather = m.weather; G.Events.emit('weather:changed', { weather: T.weather }); }
  });
  G.Events.on('day:started', function () { if (mode === 'host') Net.broadcast({ t: 'clk', day: T.day, hour: T.hour, weather: T.weather, season: T.season, tm: T.tomorrow }); });
  G.Events.on('weather:changed', function () { wx++; });
  G.wxCount = function () { return wx; };
  G.Loop = { onFrame: function () {}, onUpdate: function () {} }; G.Scenes = { current: 'outdoor' }; G.Player = { pos: { x: 10, z: 10 }, isLocked: function () { return false; } };
  G.UI = { toast: function () { G.toasts = (G.toasts || 0) + 1; }, sfx: function () {} };
  ['Render', 'Models', 'Interact', 'AnimData', 'Cooking', 'VI', 'FarmFx'].forEach(function (k) { G[k] = any(); });
  G.World = { tileType: function (x, z) { var c = (rows[Math.floor(z)] || '').charAt(Math.floor(x)); return c === 't' ? 'soil' : c === 'l' ? 'locked' : c === '~' ? 'water' : 'grass'; }, unlockedPlots: function () { return []; }, setPlots: function () {}, isBlocked: function () { return false; } };
  var ctx = { window: { Game: G, addEventListener: function () {}, removeEventListener: function () {} }, THREE: any(), console: console, Math: Math, JSON: JSON, Object: Object, Array: Array, Date: Date, setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function (f) { G._poll = f; return 0; }, document: any(),
    localStorage: { getItem: function (k) { return ls[k] === undefined ? null : ls[k]; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } }, performance: { now: function () { return 0; } } };
  vm.createContext(ctx);
  function load(f) { vm.runInContext(rd(f), ctx, { filename: f }); }
  ['js/items.js', 'js/save.js'].forEach(load);
  G.Save.register('time', T, 'world');
  ['js/state.js', 'js/house_map.js', 'js/furniture.js', 'js/placement_logic.js'].forEach(function (f) { try { load(f); } catch (e) { console.log('load ' + f + ': ' + e.message); } });
  if (!G.HouseMap && ctx.window.Game.HouseMap === undefined) { /* house_map exports through module.exports too; it also sets G.HouseMap */ }
  G.Save.register('state', G.State, 'player'); G.Save.register('inventory', G.Inventory, 'player');
  ['js/data_crops.js', 'js/data_fish.js', 'js/land_office.js'].forEach(function (f) { try { load(f); } catch (e) { console.log('load ' + f + ': ' + e.message); } });
  G.PlaceLogic.setCtx({ hm: G.HouseMap, furn: G.Furniture, yardOK: function () { return true; } });
  G.House = { chest: G.Containers.create(12) }; G.Economy = { bin: G.Containers.create(24), crate: G.Containers.create(12) };
  G.Save.register('house', { save: function () { return { chest: G.House.chest.serialize() }; }, load: function (o) { G.House.chest.load(o.chest); }, reset: function () {} }, 'world');
  G.Save.register('economy', { save: function () { return { bin: G.Economy.bin.serialize(), crate: G.Economy.crate.serialize() }; }, load: function (o) { G.Economy.bin.load(o.bin); G.Economy.crate.load(o.crate); }, reset: function () {} }, 'world');
  G.Save.register('furnplace', { save: function () { return { v: 1, list: placed }; }, load: function (s) { placed = (s && s.list) || []; }, reset: function () { placed = []; } }, 'world');
  G.Save.register('furnlive', { save: function () { return { v: 1, auto: true, ov: lamp }; }, load: function (s) { lamp = (s && s.ov) || {}; }, reset: function () { lamp = {}; } }, 'world');
  G.test = { place: function (p) { placed.push(p); }, lamp: lamp, setLamp: function (k, v) { lamp[k] = v; }, placedList: function () { return placed; } };
  try { load('js/farm.js'); } catch (e) { console.log('load farm.js: ' + e.message); }
  load('js/world_sync.js');
  G.Net.on('net:closed', function () {});
  peers[id] = { G: G, net: Net, joined: mode === 'host', ctx: ctx };
  return G;
}
function view(G) {   // serialized visible world: every world-scope saver, minus per-client noise (clock hour, personal can water), canonical order
  var d = G.Save.dump('world'), k, o = {};
  if (d.time) delete d.time.hour; if (d.farm) { delete d.farm.water; if (d.farm.tiles) d.farm.tiles.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }); }
  if (d.furnplace && d.furnplace.list) d.furnplace.list = d.furnplace.list.map(function (x) { return JSON.stringify(x); }).sort();
  Object.keys(d).sort().forEach(function (key) { o[key] = d[key]; });
  return JSON.stringify(o);
}
function firstDiff(a, b) { var i = 0; while (i < a.length && a[i] === b[i]) i++; return ' @' + i + ' H=...' + a.slice(Math.max(0, i - 80), i + 120) + '\n  X=...' + b.slice(Math.max(0, i - 80), i + 120); }
function same(label) { tick(); var a = view(H), b = view(A), c = B ? view(B) : a; need(a === b, label + ': host == guest A' + (a === b ? '' : firstDiff(a, b))); need(a === c, label + ': host == guest B' + (a === c ? '' : firstDiff(a, c))); }
function tick() { [H, A, B].forEach(function (g) { if (g && g._poll) g._poll(); }); H.Net.broadcast({ t: 'clk', day: H.Time.day, hour: H.Time.hour, weather: H.Time.weather, season: H.Time.season, tm: H.Time.tomorrow }); pump(); pump(); }   // the host's 2 s clk timer
function act(g, k, tx, tz, item, ex) { var m = { t: 'act', k: k, x: tx, z: tz, item: item, r: ++rid, tier: 0, f: 's', cap: 40 }, p; for (p in ex) m[p] = ex[p]; g.Net.send(m); pump(); pump(); }
var rid = 0, H = peer('p1', 'host'), A = peer('p2', 'guest'), B = null;
need(!!H.Farm && !!H.WorldSync && !!A.Farm, 'farm.js and world_sync.js loaded in every peer');
if (H.Farm) {
  H.Farm.refillCan && 0;
  H.Furniture.add('chair_wood', 3); H.Furniture.add('lamp_table' in {} ? 'x' : 'chair_wood', 0); H.House.chest.add('bread', 3);
  H.State && H.Inventory.add('hoe', 1);
  H.Net.live = true; H._poll(); A.Net.send({ t: 'hi' }); pump(); pump(); need(A.Net.live && A.WorldSync.armed(), 'guest A joined with a snapshot and is armed');
  same('after join');
  A.Net.remote = {}; H.Net.remote.p2 = [soil[0][0] + 0.5, soil[0][1] + 0.5, 0, 'outdoor', 0, 1];
  var t0 = soil[0], t1 = soil[1], t2 = soil[2];
  act(A, 'till', t0[0], t0[1], 'hoe'); act(A, 'till', t1[0], t1[1], 'hoe'); same('till');
  need(H.Farm.isTilled(t0[0], t0[1]) && A.Farm.isTilled(t0[0], t0[1]), 'tilled on host and guest');
  A.Inventory.add('parsnip_seeds', 5); act(A, 'plant', t0[0], t0[1], 'parsnip_seeds'); same('plant');
  act(A, 'water', t0[0], t0[1], 'watering_can', { cap: 10 }); same('water');
  // furniture: host places a chair; guest A places the same tile at the same time as the host -> the host decides
  var ft = H.HouseMap.floorTiles ? H.HouseMap.floorTiles() : [], p1 = ['chair_wood', 'f', ft[0] ? ft[0].ix : 3, ft[0] ? ft[0].iz : 3, 0];
  H.Furniture.remove('chair_wood', 1); H.test.place(p1);
  A.Furniture.remove('chair_wood', 1); A.test.place(p1.slice());   // A raced the host onto the same tile with the same piece
  tick(); tick(); same('same-tile clash');
  need(H.test.placedList().length === 1 && A.test.placedList().length === 1, 'exactly one piece on the contested tile (host ' + H.test.placedList().length + ', A ' + A.test.placedList().length + ')');
  need(H.Furniture.count('chair_wood') === A.Furniture.count('chair_wood'), 'furniture stock equal after the clash');
  // chest: A takes bread; sells (bin) a crop-like item; lamp toggle; fishing stays personal
  A.House.chest.remove('bread', 1); A.Inventory.add('bread', 1); tick(); same('chest take');
  need(H.House.chest.count('bread') === 2, 'host chest lost one bread');
  A.Inventory.add('parsnip', 2); A.Inventory.remove('parsnip', 2); A.Economy.bin.add('parsnip', 2); tick(); same('sell to bin');
  need(H.Economy.bin.count('parsnip') === 2, 'host bin has the sold items');
  A.test.setLamp('lamp1', 1); tick(); same('lamp toggle');
  var before = view(H); var fish = (A.Items.all('fish')[0] || { id: 'bread' }).id; A.Inventory.add(fish, 1); tick(); need(view(H) === before && A.Inventory.count(fish) === 1, 'fishing: catch is personal, world unchanged');
  // sleep vote -> host rolls the day; crop grows only because it was watered
  var vote = VC.make({ spots: function () { return ['house', 'b1', 'b2']; }, claim: function () { return true; }, release: function () {} }); ['p1', 'p2'].forEach(function (i) { vote.join(i); vote.request(i); vote.lie(i); });
  need(vote.ready(20), 'sleep vote ready for host + A');
  H.Day.sleep(); A.Day.sleep(); same('sleep day 1->2');
  need(A.Time.day === 2 && H.Time.day === 2, 'day change reached the guest');
  // B joins late: night + rain
  H.Time.weather = 'rain'; H.Time.hour = 22; B = peer('p3', 'guest'); B.Net.send({ t: 'hi' }); pump(); pump();
  H.Net.remote.p3 = [t2[0] + 0.5, t2[1] + 0.5, 0, 'outdoor', 0, 1];
  need(B.Net.live && B.Time.weather === 'rain' && B.wxCount() >= 1, 'late joiner sees rain (weather event fired)');
  same('late join (night, rain)');
  act(B, 'till', t2[0], t2[1], 'hoe'); act(A, 'water', t0[0], t0[1], 'watering_can', { cap: 10 }); same('B till + A water');
  H.Day.sleep(); A.Day.sleep(); B.Day.sleep(); same('sleep day 2->3');
  var tl = H.Farm.tileAt(t0[0], t0[1]); need(tl && tl.crop && tl.crop.ripe, 'parsnip is ripe on the host after 2 watered days');
  var tl2 = B.Farm.tileAt(t0[0], t0[1]); need(tl2 && tl2.crop && tl2.crop.ripe, 'ripe on late joiner too');
  H.Net.remote.p3 = [t0[0] + 0.5, t0[1] + 0.5, 0, 'outdoor', 0, 1];
  act(B, 'harvest', t0[0], t0[1], 'hoe'); same('harvest by B');
  need(!H.Farm.tileAt(t0[0], t0[1]).crop || !H.Farm.tileAt(t0[0], t0[1]).crop.ripe, 'harvested on the host');
  // reconnect: A drops and re-joins; it must converge again; a guest leaving mid-action leaves no half state
  A.Net._in({ t: 'net:closed' }, 'p1'); peers.p2.joined = false; H.Furniture.add('chair_wood', 1); tick();
  A.Net.send({ t: 'hi' }); peers.p2.joined = false; pump(); pump(); same('reconnect');
  // ws.op from a peer that never said hi is ignored
  var cnt = H.House.chest.count('bread'); H.Net._in({ t: 'ws.op', o: { chest: [['0', '', JSON.stringify(['bread', 9, 'normal', 0])]] }, r: 1 }, 'p9'); need(H.House.chest.count('bread') === cnt, 'unknown sender ignored');
}
console.log('parity: ' + n + ' checks, ' + errs + ' failures');
process.exit(errs ? 1 : 0);
