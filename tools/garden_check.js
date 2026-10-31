#!/usr/bin/env node
/* Togie Valley - tools/garden_check.js (Round 3 stage 31). 1) plot state machine over every order of till/water/seed, 2) the real layer through
 * boot_scene.create() with a stub renderer + DOM: taps -> raycast -> plot, grow once at the last step, uproot reset, toolbar fade, dispose.
 * Usage: node tools/garden_check.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.resolve(__dirname, '..'), fails = 0, checks = 0;
function ok(c, m) { checks++; if (!c) { fails++; console.log('FAIL ' + m); } }
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
var THREE = require(path.join(root, 'vendor', 'three.min.js'));

function node(tag) {
  var o = { tag: tag, style: {}, children: [], listeners: {}, cls: {}, parentNode: null, childElementCount: 0, attrs: {},
    classList: { add: function (c) { o.cls[c] = 1; }, remove: function (c) { delete o.cls[c]; }, contains: function (c) { return !!o.cls[c]; } },
    setAttribute: function (k, v) { o.attrs[k] = v; }, addEventListener: function (t, f) { o.listeners[t] = f; },
    appendChild: function (c) { c.parentNode = o; o.children.push(c); return c; },
    removeChild: function (c) { c.parentNode = null; o.children.splice(o.children.indexOf(c), 1); return c; }, closest: function () { return null; } };
  return o;
}
var byId = {}, body = node('body'), downs = [];
var doc = { body: body, hidden: false, scripts: [], currentScript: null, getElementById: function (id) { return byId[id] || null; }, createElement: node, addEventListener: function () {}, removeEventListener: function () {} };
var win = { Game: {}, innerWidth: 800, innerHeight: 450, devicePixelRatio: 1,
  addEventListener: function (t, f) { if (t === 'pointerdown') downs.push(f); }, removeEventListener: function (t, f) { var k = downs.indexOf(f); if (k >= 0) downs.splice(k, 1); } };
var ctx = vm.createContext({ window: win, document: doc, THREE: THREE, navigator: {}, performance: { now: function () { return 1000; } }, console: console,
  requestAnimationFrame: function () { return 1; }, cancelAnimationFrame: function () {}, setTimeout: function () { return 0; }, setInterval: function () { return 0; }, clearInterval: function () {} });
vm.runInContext(read('js/boot_garden.js'), ctx, { filename: 'boot_garden.js' });
vm.runInContext(read('js/boot_scene.js'), ctx, { filename: 'boot_scene.js' });
var BG = win.Game.BootGarden, BS = win.Game.BootScene;
ok(!!BG && !!BS && !BS.live(), 'modules load; no auto renderer without #ui');

/* ---------- 1. state machine */
var TOOLS = BG.TOOLS, perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
perms.forEach(function (pm) {
  var p = BG.create(), grows = 0, s, was, label = pm.map(function (k) { return TOOLS[k]; }).join('>');
  for (s = 0; s < 3; s++) {
    was = p.grown; BG.act(p, TOOLS[pm[s]]);
    if (!was && p.grown) grows++;
    ok(p.grown === (s === 2), label + ' step ' + (s + 1) + ': grown=' + p.grown);
  }
  ok(grows === 1 && p.tilled && p.watered && p.seeded, label + ' grew exactly once at the last step');
  ok(BG.act(p, 'hoe') === 'uproot' && !p.grown && !p.tilled && !p.watered && !p.seeded, label + ' uproot resets everything');
  for (s = 0; s < 3; s++) BG.act(p, TOOLS[pm[s]]);
  ok(p.grown, label + ' plot is reusable after uproot');
});
// exhaustive sequences of 5 taps (repeats, uproots included)
(function () {
  var seq = [0, 0, 0, 0, 0], n, k, p, seen, grownNow, r, i, good = true, total = Math.pow(3, 5);
  for (n = 0; n < total; n++) {
    k = n; for (i = 0; i < 5; i++) { seq[i] = k % 3; k = Math.floor(k / 3); }
    p = BG.create(); seen = {};
    for (i = 0; i < 5; i++) {
      grownNow = p.grown; r = BG.act(p, TOOLS[seq[i]]);
      if (grownNow) { if (r !== 'uproot' || p.grown || p.tilled || p.watered || p.seeded) good = false; seen = {}; continue; }
      var fresh = !seen[seq[i]]; seen[seq[i]] = 1;
      var all = seen[0] && seen[1] && seen[2];
      if (r === 'noop' && fresh) good = false;
      if (p.grown !== !!(all)) good = false;
      if (r === 'noop' && p.grown) good = false;
    }
  }
  ok(good, 'all ' + total + ' five-tap sequences: grown iff all three distinct actions seen, repeats are noops, grown tap uproots');
})();

/* ---------- 2. real layer through boot_scene.create() */
function Stub() { this.n = 0; }
Stub.prototype = { setSize: function () {}, render: function () { this.n++; }, dispose: function () {}, forceContextLoss: function () {} };
var cv = node('canvas'), inst = BS.create({ renderer: new Stub(), canvas: cv, w: 800, h: 450 }), L = BG.last;
ok(!!L && inst.keep === true, 'garden layer built and keeps the scene alive');
var bar = body.children.filter(function (c) { return c.id === 'tv-garden-bar'; })[0];
ok(!!bar && bar.children.length === 3, 'toolbar with 3 buttons');
var now = 1000;
function frames(n) { var i; for (i = 0; i < n; i++) { now += 40; inst.frame(now, true); } inst.scene.updateMatrixWorld(true); inst.camera.updateMatrixWorld(true); }
frames(2);
var island = inst.scene.children.filter(function (c) { return c.isGroup; })[0], gd = BS.garden, v = new THREE.Vector3();
function screen(i) {
  v.set(gd.x + (i - 1), gd.y + 0.06 + 0.25, gd.z); island.localToWorld(v); v.project(inst.camera);
  return { clientX: (v.x + 1) / 2 * 800, clientY: (1 - v.y) / 2 * 450, target: node('div'), isPrimary: true, button: 0 };
}
function tap(i) { var e = screen(i); downs.forEach(function (f) { f(e); }); }
function tool(k) { bar.children[k].listeners.click(); }
var P = L.plots;
ok(downs.length === 1, 'one pointerdown listener');
for (var i = 0; i < 3; i++) { var ee = screen(i); ok(L.pick(ee.clientX, ee.clientY) === i, 'raycast picks plot ' + i); }
ok(L.pick(5, 5) === -1 && L.pick(795, 445) === -1, 'taps away from the plots pick nothing');

perms.forEach(function (pm, pi) {
  var pi2 = pi % 3, q = P[pi2], s, label = pm.map(function (k) { return TOOLS[k]; }).join('>');
  for (s = 0; s < 3; s++) {
    var g0 = q.grows; tool(pm[s]); tap(pi2); frames(3);
    ok(q.s.grown === (s === 2) && (q.grows - g0) === (s === 2 ? 1 : 0), 'tap flow ' + label + ' step ' + (s + 1));
  }
  var busy = JSON.stringify(q.s); tool(0); tap(pi2); ok(JSON.stringify(q.s) === busy, label + ' taps ignored while the plant pops');
  frames(30);
  ok(q.carrot.visible && q.carrot.scale.x === 1 && q.carrot.scale.y === 1 && !q.grow && !q.seed.visible, label + ' plant ends as full carrot (' + q.carrot.scale.y + ')');
  tool(2); tap(pi2); frames(1);
  ok(!q.s.grown && !q.s.tilled && !q.s.watered && !q.s.seeded && !q.mound.visible && q.pT >= 0, label + ' uproot resets the plot, pop starts');
  frames(12); ok(!q.carrot.visible && q.pT === -1, label + ' pulled carrot disappears');
});
// draw-call budget with all three grown + tool + particles
tool(0); tap(0); tool(1); tap(0); tool(2); tap(0); tap(1); tool(0); tap(1); tool(1); tap(1); tool(2); tap(1); tool(0); tap(2); tool(1); tap(2); tool(2); tap(2);
frames(6); var st = inst.stats(); console.log('draw calls with garden mid-pop: ' + st.draws);
ok(st.draws <= 26, 'draw calls ' + st.draws + ' <= 26');
frames(40);
// guards
var before = JSON.stringify(P[0].s), e1 = screen(0); e1.target = { closest: function () { return {}; } };
downs.forEach(function (f) { f(e1); }); ok(JSON.stringify(P[0].s) === before, 'tap on a button/panel target never reaches the garden');
byId['tv-layer'] = { childElementCount: 1 }; tool(1); tap(0); ok(JSON.stringify(P[0].s) === before, 'taps ignored while a panel is open');
frames(10); ok(bar.cls.off === 1, 'toolbar hides while a panel is open');
delete byId['tv-layer']; frames(10); ok(!bar.cls.off, 'toolbar returns when the panel closes (before the title)');
// title appears: toolbar fades, plots stay tappable
byId['tv-title'] = node('div'); frames(10);
ok(bar.cls.off === 1 && bar.attrs['aria-hidden'] === 'true', 'toolbar fades out when the title appears');
P[1].s.tilled = P[1].s.watered = P[1].s.seeded = P[1].s.grown = false; tool(0); tap(1);
ok(P[1].s.tilled, 'plots stay tappable on the title');
delete byId['tv-title']; frames(10); ok(bar.cls.off === 1, 'toolbar stays hidden once the title was seen');
// dispose
inst.dispose();
ok(!bar.parentNode && downs.length === 0 && BG.last === null, 'dispose removes toolbar, listener and last');

// real-path reads that a stub hides
var src = read('js/boot_garden.js'), upd = src.slice(src.indexOf('function update('), src.indexOf('function dispose('));
ok(!/new T\.|\[\s*\]|\{\s*\}|function\s*\(/.test(upd.replace(/function update\(/, '')), 'update() allocates nothing (no new / literals / closures)');
ok(/pointerdown/.test(src) && !/addEventListener\('(pointermove|touchmove)/.test(src), 'only a pointerdown listener, no move handlers');
var idx = read('index.html'); ok(idx.indexOf('boot_garden.js') > 0 && idx.indexOf('boot_garden.js') < idx.indexOf('boot_scene.js'), 'boot_garden.js registered before boot_scene.js');
console.log(checks + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
