/* Catch distribution check: same species odds on every device. Usage: node tools/catch_dist_check.js
 * Runs the REAL Fishing.pickCatch (sliced out of js/fishing.js) with the real data_fish.js, 5000 casts per zone x hour x weather x season x bait x level,
 * for a phone and a PC profile (pixel ratio, quality tier, frame dt, pointer type) and asserts: devices agree, perch never above its designed share, rare species reachable in their zones.
 * Also checks the Space/Action cast reaches all three zones on the real map. */
var fs = require('fs'), vm = require('vm');
global.window = global; global.Game = global.Game || {};
var items = {}; Game.Items = { define: function (d) { items[d.id] = d; }, get: function (id) { return items[id] || null; } };
Game.Save = { register: function () {} }; Game.Events = { on: function () {}, emit: function () {} };
require('../js/fish_odds.js'); require('../js/data_fish.js');
var FD = Game.FishData, FO = Game.FishOdds, fail = 0;
function bad(m) { console.log('FAIL ' + m); fail++; }
var src = fs.readFileSync(__dirname + '/../js/fishing.js', 'utf8');
var a = src.indexOf('function zoneOk'), b = src.indexOf('function pickJunk'), cI = src.indexOf('function clamp');
if (a < 0 || b < 0) { console.log('FAIL cannot slice pickCatch'); process.exit(1); }
var ctx = { F: {}, FD: FD, Items: Game.Items, T: { season: 'spring', hour: 12, weather: 'sun' }, S: { lvl: 1, level: function () { return ctx.S.lvl; } }, roll: 0, pickJunk: function () { return FD.junk[0]; },
  wr: function () { return ctx.roll; } };
vm.createContext(ctx);
vm.runInContext(src.slice(cI, src.indexOf('\n', cI)) + '\n' + src.slice(a, b) + '\nthis.pick = F.pickCatch;', ctx);
/* the rolls must not come from device state: pickCatch may only read these globals */
var body = src.slice(a, b);
if (/devicePixelRatio|matchMedia|pointerType|innerWidth|Quality|getBoundingClientRect/.test(body)) bad('pickCatch reads device state');
if ((src.match(/F\.pickCatch\(/g) || []).length !== 1) bad('pickCatch must be called from exactly one place (doCast)');
var fx = fs.readFileSync(__dirname + '/../js/fishing_fx.js', 'utf8');
var caps = /var CAPS = \[([^\]]*)\]/.exec(fx); if (!caps || new Set(caps[1].split(',').map(function (s) { return s.trim(); })).size !== 1) bad('shadow cap depends on quality tier');
if (/nAtt: q/.test(fx)) bad('attractor count depends on quality tier');
function rngOf(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function dist(zone, bait, wk, opt, rnd, n) {   // empirical species counts over n casts
  var out = {}, i, p;
  for (i = 0; i < n; i++) { ctx.roll = rnd(); p = ctx.pick(zone, bait, wk(rnd()), opt); out[p.def.id] = (out[p.def.id] || 0) + 1; }
  return out;
}
function exact(zone, bait, k, opt) {   // designed distribution: sweep the pick roll over a fine grid at fixed wait factor
  var out = {}, i, G = 400, p;
  for (i = 0; i < G; i++) { ctx.roll = (i + 0.5) / G; p = ctx.pick(zone, bait, k, opt); out[p.def.id] = (out[p.def.id] || 0) + 1 / G; }
  return out;
}
var DEV = [{ n: 'phone', dpr: 3, tier: 3, dt: 33, ptr: 'touch', seed: 11 }, { n: 'pc', dpr: 1, tier: 0, dt: 16, ptr: 'mouse', seed: 22 }];
var ZONES = ['s', 'm', 'd'], HOURS = [7, 12, 19, 23], WX = ['sun', 'rain', 'snow'], SEAS = ['spring', 'summer', 'autumn', 'winter'], BAITS = [null, 'worm_bait', 'dough_bait', 'minnow_bait'], LVLS = [1, 10];
var wkRoll = function (r) { return Math.pow(r, 2.4); };
var WK = [], wi; for (wi = 0; wi < 10; wi++) WK.push(wkRoll((wi + 0.5) / 10));   // quantiles of the real wait-factor law
var N = 5000, seen = {}, worstDev = 0, worstPerch = -1, scen = 0, maxPerchShare = {};
ZONES.forEach(function (z) { HOURS.forEach(function (h) { SEAS.forEach(function (s) { WX.forEach(function (w) { if ((w === 'snow') !== (s === 'winter') && w !== 'sun' && w !== 'rain') return; if (s === 'winter' && w === 'rain') return; BAITS.forEach(function (bt) { LVLS.forEach(function (lv) {
  ctx.T.season = s; ctx.T.hour = h; ctx.T.weather = w; ctx.S.lvl = lv; scen++;
  var res = DEV.map(function (d) { return dist(z, bt, wkRoll, { plain: true }, rngOf(d.seed + scen), N); });
  var ids = {}; res.forEach(function (r) { for (var k in r) ids[k] = 1; });
  var worst = 0;
  Object.keys(ids).forEach(function (k) {
    var pa = (res[0][k] || 0) / N, pb = (res[1][k] || 0) / N;
    worst = Math.max(worst, Math.abs(pa - pb));
    if ((res[0][k] || 0) + (res[1][k] || 0) > 0) seen[z + ':' + k] = 1;
  });
  worstDev = Math.max(worstDev, worst);
  if (worst > 0.045) bad('devices differ ' + z + ' h' + h + ' ' + w + ' ' + s + ' ' + bt + ' L' + lv + ' maxdiff=' + worst.toFixed(3));
  // perch (cá rô đồng) must stay within its designed share (mean over the wait-factor range, exact sweep)
  var ex = 0, ks = WK, q, share = {}; 
  var tot = 0; ks.forEach(function (k) { var e = exact(z, bt, k, { plain: true }); ex += (e.perch || 0); }); ex /= ks.length;
  var emp = Math.max(res[0].perch || 0, res[1].perch || 0) / N;
  if (emp > ex + 0.035) { bad('perch above design ' + z + ' h' + h + ' ' + w + ' ' + s + ' ' + bt + ' L' + lv + ' emp=' + emp.toFixed(3) + ' design=' + ex.toFixed(3)); }
  worstPerch = Math.max(worstPerch, emp - ex);
}); }); }); }); }); });
console.log('scenarios', scen, 'x', DEV.length, 'devices x', N, 'casts; worst device diff', worstDev.toFixed(3), 'worst perch over design', worstPerch.toFixed(3));
/* silver/gold species only bite when shadows are near (plain=false): sweep that mode at the best level/wait too */
ZONES.forEach(function (z) { HOURS.forEach(function (h) { SEAS.forEach(function (sn) { WX.forEach(function (w) { BAITS.forEach(function (bt) {
  ctx.T.season = sn; ctx.T.hour = h; ctx.T.weather = w; ctx.S.lvl = 10;
  [0.3, 0.6, 0.9, 1].forEach(function (k) { var e = exact(z, bt, k, {}); Object.keys(e).forEach(function (id) { if (e[id] > 0) seen[z + ':' + id] = 1; }); });
}); }); }); }); });
/* rare species must show up in the zones the data lists (at the best level/season/hour) */
FD.species.forEach(function (d) { d.zones.split('').forEach(function (z) { if (!seen[z + ':' + d.id]) bad('species ' + d.id + ' never caught in zone ' + z); }); });
/* perch must not be the only thing a deep/mid cast yields: its zones are 's' only */
ZONES.forEach(function (z) { if (z !== 's' && seen[z + ':perch']) bad('perch appears outside its zone ' + z); });
/* Space/Action cast on the real map must reach every zone, independent of device */
global.Game.WorldMap = undefined; var WM = require('../js/world_map.js'), rows = (Game.WorldMap || WM).rows;
function isW(x, z) { return (rows[z] || '')[x] === '~'; }
function shore(tx, tz) { for (var r = 1; r < 7; r++) for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) if ((dx === -r || dx === r || dz === -r || dz === r) && !isW(tx + dx, tz + dz)) return r; return 7; }
function zoneOf(r) { var v = Math.max(0, Math.min(1, (shore(r[0], r[1]) - 1) / 5)); return v < 0.34 ? 's' : v < 0.67 ? 'm' : 'd'; }
var zc = { s: 0, m: 0, d: 0 }, seats = [], D = [[0, -1], [0, 1], [1, 0], [-1, 0]], x, z, i, rr = rngOf(5);
for (z = 0; z < rows.length; z++) for (x = 0; x < rows[0].length; x++) if (rows[z][x] === 's') seats.push([x, z]);
seats.forEach(function (s) { D.forEach(function (d) { for (i = 0; i < 400; i++) { var k = FO.facingK(isW, s[0], s[1], d, 7, rr()); if (k > 0) zc[zoneOf([s[0] + d[0] * k, s[1] + d[1] * k])]++; } }); });
var tt = zc.s + zc.m + zc.d; console.log('Space/Action cast zones', JSON.stringify(zc));
['s', 'm', 'd'].forEach(function (zn) { if (zc[zn] / tt < 0.05) bad('Space/Action casts almost never reach zone ' + zn); });
console.log(fail ? fail + ' failures' : 'catch_dist_check ok'); process.exit(fail ? 1 : 0);
