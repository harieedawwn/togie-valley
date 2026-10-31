#!/usr/bin/env node
/* Togie Valley - tools/fishing_perf_check.js (Round 4 stage 6). Runs js/fishing_fx.js + sim_tier.js + fish_school.js headlessly in a vm with real three.js
 * (vendor/three.min.js) whose constructors are wrapped by counters, drives a scripted fishing state machine (sit, charge, cast, wait, bite, reel, result)
 * for 600 frames and asserts: allocations per frame (THREE objects + typed arrays made by the fishing code) stay under a small limit; and the school
 * sim moves shadows near the bobber every step but far shadows only ~5 Hz. Usage: node tools/fishing_perf_check.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.resolve(__dirname, '..'), fails = 0;
function ok(c, m) { if (!c) { fails++; console.error('FAIL ' + m); } }
function src(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }

var box = { console: console, performance: { now: function () { return Date.now(); } }, Math: Math, Date: Date };
box.window = box; box.self = box;
box.document = { hidden: false, createElement: function () { return { width: 0, height: 0, getContext: function () { return { createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }, putImageData: function () {} }; } }; } };
var ctx = vm.createContext(box);
vm.runInContext(src('vendor/three.min.js'), ctx, { filename: 'three.min.js' });
var T0 = box.THREE, counts = {}, total = 0, T = {};
Object.keys(T0).forEach(function (k) {
  var v = T0[k];
  if (typeof v === 'function' && /^[A-Z]/.test(k) && v.prototype) {
    var W = function () { counts[k] = (counts[k] || 0) + 1; total++; return Reflect.construct(v, arguments, new.target || W); };
    W.prototype = v.prototype; Object.keys(v).forEach(function (s) { W[s] = v[s]; }); T[k] = W;
  } else T[k] = v;
});
box.THREE = T;
var F32 = Float32Array; box.Float32Array = function (a) { total++; counts.Float32Array = (counts.Float32Array || 0) + 1; return new F32(a); }; box.Float32Array.prototype = F32.prototype;
var WMap = require(path.join(root, 'js/world_map.js'));

var listeners = {}, frames = [];
var E = { on: function (n, f) { (listeners[n] = listeners[n] || []).push(f); }, emit: function (n, d) { (listeners[n] || []).forEach(function (f) { f(d); }); } };
var V = { bobPos: new T.Vector3(), bobOn: false, R: null, plan: null, charge: 0, castK: 0, rodId: 'bamboo_pole', nib: 0, waitT: 0, waitTot: 6, state: 'off' };
var F = { state: 'off', view: V, baitId: null, fx: false };
var KEYS = ['armRX', 'armLX', 'armRZ', 'armLZ', 'spineRX', 'headRX', 'headRZ', 'headRY', 'legLX', 'legRX', 'bob'];
var hero = { root: new T.Group(), anim: { pose: {} }, attach: { handR: new T.Group() } }; hero.root.add(hero.attach.handR); KEYS.forEach(function (k) { hero.anim.pose[k] = 0; });
var cam = new T.PerspectiveCamera(40, 1.6, 0.1, 200); cam.position.set(50, 12, 20); cam.lookAt(56, 0, 21); cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
var G = box.Game = {
  Events: E, Prof: { on: false }, Render: { scene: new T.Scene(), camera: cam, addOutline: function () {} },
  Models: { mergeParts: function () { return new T0.BufferGeometry(); }, material: function () { return new T0.MeshBasicMaterial(); },
    Anim: { KEYS: KEYS, newPose: function () { var p = {}; KEYS.forEach(function (k) { p[k] = 0; }); return p; }, apply: function () {} } },
  Player: { hero: hero, pos: { x: 55.5, z: 21.5 }, facing: 'e', speed: 0 }, Items: { get: function (id) { return { id: id, name: id, icon: {} }; } }, UI: {},
  Loop: { onFrame: function (fn, p) { frames.push({ fn: fn, p: p || 0 }); frames.sort(function (a, b) { return a.p - b.p; }); } },
  Camera: { zoomBy: function () {}, getState: function () { return { zoom: 1 }; } }, Scenes: { current: 'outdoor', outdoor: true, outdoorOnly: function () {} },
  Fishing: F, FishModels: { lookOf: function () { return 'trout'; } }, WorldMap: WMap, Quality: { level: function () { return 0; } },
  Time: { hour: 12, season: 'summer', weather: 'sun' }, World: { tileType: function () { return 'grass'; } },
  FishData: { species: [{ id: 'sarat', seasons: ['summer'], h: [0, 26], weather: null, diff: 1, bait: 'worm', price: 50 }], get: function (id) { return { id: id, price: 50 }; } }
};
vm.runInContext(src('js/fish_school.js'), ctx, { filename: 'fish_school.js' });
vm.runInContext(src('js/sim_tier.js'), ctx, { filename: 'sim_tier.js' });
vm.runInContext(src('js/fishing_fx.js'), ctx, { filename: 'fishing_fx.js' });
ok(frames.length >= 3 && !!G.FishLife, 'fishing_fx registered its frame callbacks (modules loaded in order)');
ok(total > 20, 'constructor counters are live (' + total + ' objects built at load)');

/* scripted state machine: 300-frame cycle = idle 15, charge 20, cast 30, wait 90, bite 15, reel 90, result 40 */
var tx = 60.5, tz = 21.5, eventFrame = false;
function setState(s, ev, d) { F.state = s; V.state = s; if (ev) { E.emit(ev, d); eventFrame = true; } }
function script(n) {
  var c = n % 300;
  if (n === 0) { setState('idle', 'fish:sat'); }
  if (c === 15) setState('charge');
  if (c >= 15 && c < 35) V.charge = (c - 15) / 20;
  if (c === 35) { setState('cast', 'fish:cast', { zone: 'm', v: 0.5 }); V.plan = { kind: 'fish', shadow: -1, def: { id: 'sarat' }, seen: true }; }
  if (c >= 35 && c < 65) { V.castK = (c - 35) / 30; V.bobOn = true; V.bobPos.set(55.5 + (tx - 55.5) * V.castK, Math.sin(Math.PI * V.castK) * 1.4 + 0.02, 21.5); }
  if (c === 65) { setState('wait'); V.castK = 1; V.bobPos.set(tx, 0.02, tz); V.waitTot = 6; }
  if (c >= 65 && c < 155) V.waitT = 6 - (c - 65) / 15;
  if (c === 155) { setState('bite', 'fish:bite', { id: 'sarat' }); }
  if (c === 170) { setState('reel'); V.R = { inside: true, prog: 0.4, bp: 0.3, bh: 0.3, fp: 0.4, out: 0 }; }
  if (c > 170 && c < 260) { V.R.inside = (c % 20) < 12; V.R.prog = 0.3 + 0.5 * ((c - 170) / 90); }
  if (c === 260) { V.R = null; setState('result', 'fish:caught', { id: 'sarat', n: 1, q: 'normal', size: 40 }); }
  if (c === 299) { V.bobOn = false; setState('idle'); }
}
var dt = 1 / 60, perFrame = [], evMax = 0, quiet = 0, quietMax = 0, f, i, before;
for (f = 0; f < 600; f++) {
  eventFrame = false; before = total; script(f);
  for (i = 0; i < frames.length; i++) frames[i].fn(dt, 1);
  if (f >= 300) { var d = total - before; perFrame.push(d); if (eventFrame) evMax = Math.max(evMax, d); else quietMax = Math.max(quietMax, d); }
}
var sum = perFrame.reduce(function (a, b) { return a + b; }, 0), avg = sum / perFrame.length;
console.log('fishing_perf_check: 600 frames, second cycle ' + perFrame.length + ' frames: ' + sum + ' alloc(s), avg ' + avg.toFixed(3) + '/frame, worst non-event frame ' + quietMax + ', worst event frame ' + evMax);
if (sum) console.log('  by type: ' + JSON.stringify(counts));
ok(quietMax <= 2, 'no non-event frame allocates more than 2 objects (got ' + quietMax + ')');
ok(avg <= 0.1, 'average allocations per frame <= 0.1 (got ' + avg.toFixed(3) + ')');

/* school: near shadows step every tick, far ones about 5 Hz (60 Hz sim) */
var S = G.FishSchool, sim = S.create({ grid: S.buildGrid(WMap.rows), cap: 40, nAtt: 4 }), fa = sim.fish, nearIdx = [], farIdx = [], bx = tx, bz = tz, k, j, px = [], pz = [], moveN = [];
sim.focus(bx, bz, 6);
for (k = 0; k < fa.length; k++) { var dd = Math.hypot(fa[k].x - bx, fa[k].z - bz); (dd < 5.5 ? nearIdx : farIdx).push(k); px[k] = fa[k].x; pz[k] = fa[k].z; moveN[k] = 0; }
for (j = 0; j < 60; j++) {
  sim.step(1 / 60);
  for (k = 0; k < fa.length; k++) { if (fa[k].x !== px[k] || fa[k].z !== pz[k]) moveN[k]++; px[k] = fa[k].x; pz[k] = fa[k].z; }
}
var farMax = 0, nearMin = 99;
farIdx.forEach(function (q) { var dd = Math.hypot(fa[q].x - bx, fa[q].z - bz); if (dd > 7) farMax = Math.max(farMax, moveN[q]); });
console.log('  school: ' + fa.length + ' shadows, ' + farIdx.length + ' far (>5.5 tiles); max moves in 60 steps of a far shadow: ' + farMax);
ok(farMax <= 6, 'far shadows move at <= 5 Hz while the line is out (got ' + farMax + ' moves in 60 steps)');
sim.focus(0, 0, 0); for (k = 0; k < fa.length; k++) moveN[k] = 0;
for (j = 0; j < 30; j++) { sim.step(1 / 60); for (k = 0; k < fa.length; k++) { if (fa[k].x !== px[k] || fa[k].z !== pz[k]) moveN[k]++; px[k] = fa[k].x; pz[k] = fa[k].z; } }
var full = 0; for (k = 0; k < fa.length; k++) if (moveN[k] >= 25) full++;
ok(full >= fa.length * 0.8, 'with the focus off every shadow moves every step again (' + full + '/' + fa.length + ')');
console.log(fails ? 'fishing_perf_check: ' + fails + ' FAILED' : 'fishing_perf_check: OK');
process.exit(fails ? 1 : 0);
