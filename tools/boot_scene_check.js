#!/usr/bin/env node
/* Togie Valley - tools/boot_scene_check.js (Round 3 stage 30). Builds the boot diorama with a stubbed renderer: draw-call / triangle budgets,
 * full dispose, hand-over order (never two renderers alive), progress-bar total. Usage: node tools/boot_scene_check.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.resolve(__dirname, '..'), fails = 0, checks = 0;
function ok(c, m) { checks++; if (!c) { fails++; console.log('FAIL ' + m); } }
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }

var THREE = require(path.join(root, 'vendor', 'three.min.js'));
var aliveRenderers = 0, maxAlive = 0, log = [];
function StubRenderer() {
  aliveRenderers++; maxAlive = Math.max(maxAlive, aliveRenderers);
  this.flags = { dispose: 0, loss: 0, renders: 0 };
}
StubRenderer.prototype = { setPixelRatio: function () {}, setClearColor: function () {}, setSize: function () {}, render: function () { this.flags.renders++; },
  dispose: function () { this.flags.dispose++; }, forceContextLoss: function () { this.flags.loss++; aliveRenderers--; } };
var T = Object.create(THREE); T.WebGLRenderer = StubRenderer;

function node(tag) { return { tag: tag, style: {}, classList: { add: function () {}, remove: function () {} }, parentNode: null, setAttribute: function () {}, addEventListener: function () {}, getContext: function () { return { drawImage: function () {} }; }, width: 10, height: 10 }; }
var body = { classes: {}, classList: { add: function (c) { body.classes[c] = 1; }, remove: function (c) { delete body.classes[c]; } },
  insertBefore: function (n) { n.parentNode = body; }, removeChild: function (n) { n.parentNode = null; } };
var ui = node('div');
var doc = { body: body, hidden: false, scripts: [], currentScript: { getAttribute: function () { return '0'; } }, getElementById: function (id) { return id === 'ui' ? ui : null; }, createElement: node, addEventListener: function () {}, removeEventListener: function () {} };
var win = { Game: {}, innerWidth: 800, innerHeight: 450, devicePixelRatio: 2, addEventListener: function () {}, removeEventListener: function () {}, matchMedia: function () { return { matches: false }; } };
var rafId = 0;
var ctx = vm.createContext({ window: win, document: doc, THREE: T, navigator: {}, performance: { now: function () { return 1000; } }, console: console,
  requestAnimationFrame: function () { return ++rafId; }, cancelAnimationFrame: function () {}, setTimeout: function () { return 0; }, setInterval: function () { return 0; }, clearInterval: function () {} });
vm.runInContext(read('js/boot_scene.js'), ctx, { filename: 'boot_scene.js' });
var B = win.Game.BootScene;
ok(!!B, 'Game.BootScene exists');

// 1. start(): exactly one renderer, canvas inserted, class set
ok(B.live() && aliveRenderers === 1, 'start() created one renderer (alive=' + aliveRenderers + ')');
ok(body.classes['tv-bg3d'], 'body.tv-bg3d set while the diorama is live');

// 2. budgets, measured on a standalone instance with its own stub
var r2 = new StubRenderer(), inst = B.create({ renderer: r2, canvas: node('canvas'), w: 800, h: 450 });
inst.frame(2000, true); inst.frame(2100, true);
var st = inst.stats();
console.log('draw calls ' + st.draws + ', triangles ' + st.tris);
ok(st.draws <= 12, 'draw calls ' + st.draws + ' <= 12');
ok(st.tris <= 15000, 'triangles ' + st.tris + ' <= 15000');
ok(r2.flags.renders === 2, 'frame() renders');
inst.resize(400, 800); inst.frame(2200, true); ok(inst.camera.aspect === 0.5, 'portrait resize updates aspect');

// 3. dispose releases everything
var geos = [], mats = [], disposed = 0;
inst.own.geos.forEach(function (g) { g.addEventListener('dispose', function () { disposed++; }); geos.push(g); });
inst.own.mats.forEach(function (m) { m.addEventListener('dispose', function () { disposed++; }); mats.push(m); });
var scenePre = 0; inst.scene.traverse(function (o) { if (o.geometry) { scenePre++; ok(inst.own.geos.indexOf(o.geometry) >= 0, 'every scene geometry is tracked'); } });
inst.dispose();
ok(disposed === geos.length + mats.length, 'all ' + (geos.length + mats.length) + ' geometries/materials disposed (' + disposed + ')');
ok(r2.flags.dispose === 1 && r2.flags.loss === 1, 'renderer.dispose + forceContextLoss called');
ok(inst.scene.children.length === 0 && !inst.alive, 'scene emptied');
inst.dispose(); ok(r2.flags.dispose === 1, 'dispose is idempotent');

// 4. hand-over: boot context gone before the game renderer is created
var before = aliveRenderers;
ok(B.handOver() === true, 'handOver() ran');
ok(!B.live() && aliveRenderers === 0, 'boot renderer released by handOver (alive=' + aliveRenderers + ')');
new StubRenderer();   // stands for Render.init
ok(maxAlive === 2 ? before === 1 : true, 'sanity');
ok(maxAlive <= 2 && aliveRenderers === 1, 'only the game renderer is alive after hand-over');
B.release(); ok(!body.classes['tv-bg3d'], 'release() clears the title backdrop class');

// 5. source order: handOver before Render.init in main.js; release in closeTitle; one total matching index.html
var main = read('js/main.js'); ok(main.indexOf('BootScene.handOver') > 0 && main.indexOf('BootScene.handOver') < main.indexOf('G.Render.init'), 'main.js hands over before Render.init');
ok(/closeTitle[\s\S]*BootScene\.release/.test(read('js/panels.js')), 'panels.js releases on closeTitle');
var html = read('index.html'), n = (html.match(/<script src=/g) || []).length, m = /boot_scene\.js[^>]*data-total="(\d+)"/.exec(html);
ok(m && +m[1] === n, 'data-total ' + (m && m[1]) + ' matches script count ' + n);
ok(html.indexOf('vendor/three.min.js') < html.indexOf('js/boot_scene.js') && html.indexOf('js/boot_scene.js') < html.indexOf('js/errors.js'), 'boot_scene.js sits right after three.min.js');
var sites = 0; fs.readdirSync(path.join(root, 'js')).forEach(function (f) { sites += (read('js/' + f).match(/new THREE\.WebGLRenderer\(/g) || []).length; });
console.log('WebGLRenderer construction sites: ' + sites + ' (render.js + boot_scene.js)'); ok(sites === 2, 'exactly two renderer sites');
console.log('boot_scene_check: ' + checks + ' checks, ' + fails + ' failure(s)');
process.exit(fails ? 1 : 0);
