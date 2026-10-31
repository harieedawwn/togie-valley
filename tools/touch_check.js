#!/usr/bin/env node
/* Togie Valley - tools/touch_check.js (Round 3 stage 9): scripted pointer sequences through Game.Input (fake clock, stub DOM) + a read of touch_cam.js wiring. */
'use strict';
var fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
var T = 0, timers = [], tid = 0;
global.performance = { now: function () { return T; } };
global.setTimeout = function (fn, ms) { timers.push({ id: ++tid, at: T + ms, fn: fn }); return tid; };
global.clearTimeout = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
function advance(ms) {
  var end = T + ms;
  for (;;) {
    var n = null; timers.forEach(function (t) { if (t.at <= end && (!n || t.at < n.at)) n = t; });
    if (!n) break;
    timers = timers.filter(function (t) { return t !== n; }); T = n.at; n.fn();
  }
  T = end;
}
var H = {}, docH = {};
global.window = { innerWidth: 800, innerHeight: 400, addEventListener: function () {}, performance: global.performance };
global.document = { activeElement: null, addEventListener: function (n, f) { docH[n] = f; } };
var log = [];
var Ev = { emit: function (n, d) { log.push([n, d]); }, on: function () {} };
global.window.Game = { Events: Ev, Config: {}, util: { wrapAngle: function (a) { return a; } } };
var canvas = { style: {}, addEventListener: function (n, f) { H[n] = f; }, setPointerCapture: function () {}, releasePointerCapture: function () {} };
require(path.join(root, 'js/input.js'));
var In = global.window.Game.Input; In.init(canvas);

function ev(type, id, x, y, extra) { var e = { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, type: type }; for (var k in extra) e[k] = extra[k]; H[type](e); }
function reset(joy) { advance(2000); log = []; In.setJoy(joy); In.suspend = false; }
function names() { return log.map(function (l) { return l[0] + (l[1] && l[1].phase ? ':' + l[1].phase : ''); }).join(' '); }
function count(n) { return log.filter(function (l) { return l[0] === n; }).length; }
var fails = 0, total = 0;
function ok(c, msg) { total++; if (!c) { fails++; console.log('FAIL: ' + msg + '  [' + names() + ']'); } }

// 1 tap-to-move: short tap = tap, no camera
reset('off'); ev('pointerdown', 1, 300, 200); advance(80); ev('pointerup', 1, 300, 200);
ok(count('input:tap') === 1 && count('input:cam') === 0, 'tap-to-move short tap');
// 2 long press 350ms still -> camera mode, drag rotates, release ends, no tap
reset('off'); ev('pointerdown', 1, 300, 200); advance(200); ok(In.holding, 'hold-walk starts at 180ms'); advance(160);
ok(In.camMode && !In.holding && count('input:holdend') === 1, 'long press enters camera mode and ends hold');
ev('pointermove', 1, 340, 205); ev('pointerup', 1, 340, 205);
var mv = log.filter(function (l) { return l[0] === 'input:cam' && l[1].phase === 'move'; })[0];
ok(mv && mv[1].dx === 40 && mv[1].dy === 5, 'camera move deltas');
ok(count('input:tap') === 0 && !In.camMode && /input:cam:end/.test(names()), 'camera release: no tap, ended');
// 3 jitter under 8px keeps the timer; 12px move cancels it
reset('off'); ev('pointerdown', 1, 300, 200); advance(100); ev('pointermove', 1, 305, 203); advance(260);
ok(In.camMode, 'jitter < 8px still enters camera mode'); ev('pointerup', 1, 305, 203);
reset('off'); ev('pointerdown', 1, 300, 200); advance(100); ev('pointermove', 1, 312, 200); advance(400);
ok(!In.camMode && count('input:cam') === 0, 'moving > 8px cancels camera long-press'); ev('pointerup', 1, 312, 200);
// 4 joystick play: right half drag = camera, tap = tap, left half never camera
reset('float'); ev('pointerdown', 1, 600, 200); ev('pointermove', 1, 640, 200); ev('pointermove', 1, 660, 190); ev('pointerup', 1, 660, 190);
ok(/input:cam:start input:cam:move input:cam:move input:cam:end/.test(names()) && count('input:tap') === 0, 'right-half drag rotates camera, no tap');
reset('float'); ev('pointerdown', 1, 600, 200); advance(90); ev('pointermove', 1, 603, 201); ev('pointerup', 1, 603, 201);
ok(count('input:tap') === 1 && count('input:cam') === 0, 'right-half short tap stays a tap');
reset('fixed'); ev('pointerdown', 1, 600, 200); advance(250); ev('pointermove', 1, 607, 200); ev('pointerup', 1, 607, 200);
ok(count('input:cam') >= 3 && count('input:tap') === 0, 'slow 7px drag after 200ms counts as camera drag');
reset('float'); ev('pointerdown', 1, 200, 200); ev('pointermove', 1, 260, 200); ev('pointerup', 1, 260, 200);
ok(count('input:cam') === 0, 'left-half drag is never a camera drag');
reset('float'); ev('pointerdown', 1, 600, 200); advance(500); ok(!In.camMode && !In.holding && count('input:holdstart') === 0, 'no long-press camera / hold-walk while joystick is on'); ev('pointerup', 1, 600, 200);
// 5 two fingers: pinch, never camera mode
reset('off'); ev('pointerdown', 1, 300, 200); ev('pointerdown', 2, 400, 200); advance(600); ev('pointermove', 2, 450, 200);
ok(count('input:cam') === 0 && count('input:zoom') === 1, 'two fingers = pinch, no camera'); ev('pointerup', 2, 450, 200); ev('pointerup', 1, 300, 200);
ok(count('input:tap') === 0, 'two-finger gesture makes no tap');
reset('off'); ev('pointerdown', 1, 300, 200); advance(300); ev('pointerdown', 2, 400, 200); advance(300);
ok(count('input:cam') === 0 && !In.camMode, 'second finger before 350ms cancels the camera long-press'); ev('pointerup', 2, 400, 200); ev('pointerup', 1, 300, 200);
// 6 independence: stick finger claimed, camera finger works
reset('float'); ev('pointerdown', 1, 150, 250); In.claim(1); ev('pointerdown', 2, 650, 200); ev('pointermove', 2, 700, 200); ev('pointermove', 1, 170, 230);
ok(count('input:cam') === 2 && count('input:zoom') === 0 && count('input:rotate') === 0, 'stick finger + camera finger are independent');
ev('pointerup', 2, 700, 200); ev('pointerup', 1, 170, 230); ok(count('input:tap') === 0 && !In.camMode, 'both released cleanly');
// 7 mouse right drag; suspend swallows camera
reset('off'); ev('pointerdown', 9, 100, 100, { pointerType: 'mouse', button: 2 }); ev('pointermove', 9, 130, 100, { pointerType: 'mouse' }); ev('pointerup', 9, 130, 100, { pointerType: 'mouse', button: 2 });
ok(/input:cam:start input:cam:move input:cam:end/.test(names()) && count('input:tap') === 0, 'mouse right-drag rotates');
reset('float'); In.suspend = true; ev('pointerdown', 1, 600, 200); ev('pointermove', 1, 680, 200); ev('pointerup', 1, 680, 200);
ok(count('input:cam') === 0, 'suspend (fishing) swallows camera drag'); In.suspend = false;

// 8 stage 23: camera drag direction, per-pointer buttons while the stick is held / camera is dragged
(function () {
  var bus = {}, rot = [], tilt = [], store = {}, G0 = global.window.Game;
  var E2 = { on: function (n, f) { (bus[n] = bus[n] || []).push(f); }, emit: function (n, d) { (bus[n] || []).forEach(function (f) { f(d); }); } };
  global.window.Game = { Events: E2, Input: {}, Config: { input: {} }, Camera: { rotateBy: function (d) { rot.push(d); }, tiltBy: function (d) { tilt.push(d); } },
    Joystick: { store: function (k, v) { if (v === undefined) return store[k]; store[k] = v; return v; } } };
  delete require.cache[require.resolve(path.join(root, 'js/touch_cam.js'))];
  require(path.join(root, 'js/touch_cam.js'));
  var TC = global.window.Game.TouchCam;
  function drag(dx, dy) { rot = []; tilt = []; E2.emit('input:cam', { phase: 'move', x: 0, y: 0, dx: dx, dy: dy, src: 'drag' }); }
  drag(40, 30); ok(rot[0] < 0 && tilt[0] > 0, 'default: drag right rotates negative, drag down tilts up (world follows finger)');
  drag(-40, -30); ok(rot[0] > 0 && tilt[0] < 0, 'default: opposite drag gives opposite signs');
  TC.setInvert('h', true); drag(40, 30); ok(rot[0] > 0 && tilt[0] > 0, 'invH flips only the horizontal axis');
  TC.setInvert('v', true); drag(40, 30); ok(rot[0] > 0 && tilt[0] < 0, 'invV flips the vertical axis');
  ok(store.invH === 1 && store.invV === 1 && TC.invert('h') && TC.invert('v'), 'toggles persist through the controls store');
  global.window.Game = G0;
  // keys follow invH
  var src = fs.readFileSync(path.join(root, 'js/input.js'), 'utf8');
  ok(/dir: cfg\.invH \? 1 : -1/.test(src) && /dir: cfg\.invH \? -1 : 1/.test(src), 'Q/R keys follow the horizontal invert toggle');
  // buttons: onPress extracted from ui.js, fired while another pointer owns the stick / camera drag
  var ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8'), m = ui.match(/function onPress\(b, fn\) \{[\s\S]*?\n  \}\n/);
  ok(!!m, 'ui.js has onPress'); if (!m) return;
  var onPress = new Function(m[0] + '; return onPress;')();
  function mkBtn() { var h = {}; return { h: h, addEventListener: function (n, f) { h[n] = f; } }; }
  var sel = 0, slotB = mkBtn(), actB = mkBtn(), swallowed = 0;
  onPress(slotB, function () { sel = 3; }); onPress(actB, function () { sel = 9; });
  function down(b, id, ptype) { b.h.pointerdown({ pointerId: id, pointerType: ptype || 'touch', button: 0, stopPropagation: function () { swallowed++; } }); }
  reset('float'); ev('pointerdown', 1, 150, 250); In.claim(1); ev('pointermove', 1, 180, 230);   // finger 1 holds the stick
  down(slotB, 2); ok(sel === 3, 'item switched on pointerdown while the joystick finger is held');
  down(actB, 3); ok(sel === 9, 'action button reacts on pointerdown while the joystick finger is held');
  ev('pointermove', 1, 190, 230); ev('pointerup', 1, 190, 230);
  reset('float'); ev('pointerdown', 1, 650, 200); ev('pointermove', 1, 700, 200); sel = 0;   // finger 1 drags the camera
  down(slotB, 2); ok(sel === 3 && count('input:cam') >= 2, 'item switched while the camera is being dragged');
  ev('pointerup', 1, 700, 200);
  sel = 0; slotB.h.click({ detail: 1 }); ok(sel === 0, 'touch click does not double-fire'); slotB.h.click({ detail: 0 }); ok(sel === 3, 'keyboard click still works');
  ok(/onPress\(b, function \(\) \{\n      buzz\(\); UI\.sfx\('tap'\);\n      if \(G\.Inventory\.selectedIndex/.test(ui) && /onPress\(moreSlot/.test(ui) && /press\(menuBtn/.test(ui), 'hotbar slots, more-button and menu use pointerdown');
  ok(/action\.addEventListener\('pointerdown'/.test(ui), 'action button uses pointerdown');
  var css = ['css/layout.css', 'css/uiscale.css', 'css/compact.css', 'css/ui.css'].map(function (f) { return fs.readFileSync(path.join(root, f), 'utf8'); }).join('\n') + fs.readFileSync(path.join(root, 'js/ui_layout.js'), 'utf8');
  ok(!/hb-cols|#tv-hotbar[^{]*\{[^}]*(grid-template|flex-wrap: wrap|flex-direction: column)/.test(css), 'no vertical / wrapping hotbar code');
})();

// touch_cam.js wiring (read once)
var tc = fs.existsSync(path.join(root, 'js/touch_cam.js')) ? fs.readFileSync(path.join(root, 'js/touch_cam.js'), 'utf8') : '';
ok(/translate3d/.test(tc) && /pointer-events:\s*none|pointerEvents\s*=\s*'none'/.test(tc) && /will-change/.test(tc + fs.readFileSync(path.join(root, 'css/joystick.css'), 'utf8')), 'ring uses translate3d, pointer-events none, will-change');
ok(/vibrate/.test(tc) && /Camera\.rotateBy/.test(tc), 'touch_cam vibrates and rotates through Game.Camera.rotateBy');
console.log(fails ? 'touch_check FAILED ' + fails + '/' + total : 'touch_check OK (' + total + ' assertions)');
process.exit(fails ? 1 : 0);
