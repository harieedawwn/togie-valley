/* Stage 17 BUGFIX b: node tools/continue_check.js - "Tiếp tục" only for started/legacy-real saves; empty and polluted fake localStorage. */
var path = require('path'), fs = require('fs'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('continue: FAIL ' + m); } else n++; }
function boot(data) {
  var store = Object.assign({}, data);
  global.window = global; global.document = { addEventListener: function () {}, createElement: function () { return { style: {}, classList: { add: function () {} }, appendChild: function () {} }; } };
  global.setInterval = function () { return 0; }; global.navigator = {};
  window.addEventListener = function () {};
  window.localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
  window.Game = { Events: { on: function () {}, once: function () {}, emit: function () {} }, Loop: { paused: false } };
  ['js/save.js', 'js/saveslots.js'].forEach(function (f) { var p = path.join(root, f); delete require.cache[p]; require(p); });
  var G = window.Game; G.SaveSlots.init(); return { G: G, store: store };
}
function mk(meta, day) { return JSON.stringify({ version: 1, savedAt: 1, meta: meta, sections: { time: { day: day } } }); }
var K1 = 'togie-valley/slots/', OLD = 'togie-valley/save/v1';
var b = boot({}), S = b.G.Save;
need(!S.has() && !S.load(), 'empty storage: no save');
need([1, 2, 3].every(function (i) { return b.G.SaveSlots.meta(i) === null; }), 'empty storage: no slot meta');
need(Object.keys(b.store).length === 0, 'empty storage: nothing written on first open');
S.newGame(true); S.now(); need(Object.keys(b.store).length === 0, 'silent boot + autosave writes nothing');
// polluted: autosave of an untouched game (old cached build), legacy key, slot with day 1 and few seconds
var k = b.G.SaveSlots.slotKey(1);
[{ [OLD]: mk({ playTimeSec: 7 }, 1) }, { [k]: mk({ playTimeSec: 3 }, 1) }, { [k]: mk({ playTimeSec: 119, started: false }, 1) }, { [k + '.bak']: mk({ playTimeSec: 30 }, 1) }, { 'togie-valley/slots/index': '{"v":1,"active":1,"names":{}}' }].forEach(function (d, i) {
  var x = boot(d), snap = JSON.stringify(x.store);
  need(!x.G.Save.has() && !x.G.Save.load(), 'polluted #' + i + ': not a save');
  need([1, 2, 3].every(function (j) { return x.G.SaveSlots.meta(j) === null; }), 'polluted #' + i + ': no Tiếp tục slot');
  need(JSON.stringify(x.store) === snap, 'polluted #' + i + ': nothing deleted or rewritten');
});
// real saves count
var kk = b.G.SaveSlots.slotKey(1);
[mk({ started: true, playTimeSec: 4 }, 1), mk({ playTimeSec: 120 }, 1), mk({ playTimeSec: 10 }, 2)].forEach(function (t, i) {
  var o = {}; o[kk] = t; var x = boot(o);
  need(x.G.Save.has() && x.G.SaveSlots.meta(1) !== null, 'real save #' + i + ' counts');
});
// started flag is written once a game was started on purpose
var y = boot({}); y.G.SaveSlots.create(1, 'A'); var raw = y.store[y.G.SaveSlots.slotKey(1)];
need(raw && JSON.parse(raw).meta.started === true, 'Game mới writes started:true');
need(y.G.Save.has() && y.G.SaveSlots.meta(1) !== null, 'started game counts for Tiếp tục');
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
need(/tv-v1[5-9]|tv-v[2-9]\d/.test(rd('sw.js')) && /skipWaiting/.test(rd('sw.js')) && /clients\.claim/.test(rd('sw.js')) && /network-first/.test(rd('sw.js')), 'sw.js version bump, skipWaiting, claim, network-first');
need(/tv-sw-reload/.test(rd('js/quality.js')), 'one-shot auto reload');
need(/id="tv-splash"/.test(rd('index.html')) && /Đang tải/.test(rd('index.html')) && /tvSplashHide/.test(rd('js/panels.js')) && /tv-playing/.test(rd('js/panels.js')), 'splash + HUD hidden until play');
console.log('continue: ' + n + ' checks ok, ' + errs + ' failed'); process.exit(errs ? 1 : 0);
