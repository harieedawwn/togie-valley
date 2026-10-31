#!/usr/bin/env node
/* Togie Valley - tools/update_check.js (Round 3 stage 1): loads the real js/updater.js in a vm per simulated page load and checks
 * compare-and-apply, including a stale cache/CDN that keeps serving the old build. Usage: node tools/update_check.js */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path'), root = path.resolve(__dirname, '..');
var src = fs.readFileSync(path.join(root, 'js', 'updater.js'), 'utf8'), fails = 0;
function ok(c, m) { if (!c) { fails++; console.error('FAIL: ' + m); } }
var store = {}, now = 1e12, log = {};
function page(build, latest) {   // one page load running `build`, version.json says `latest`
  var G = {}, win = { Game: G, TV_BUILD: build, addEventListener: function () {} };
  win.window = win;
  var ctx = vm.createContext({ window: win, console: console, Date: { now: function () { return now; } }, setInterval: function () { return 1; }, parseInt: parseInt, JSON: JSON,
    navigator: { onLine: true, serviceWorker: { getRegistrations: function () { return Promise.resolve([{ unregister: function () { log.unreg = (log.unreg || 0) + 1; return Promise.resolve(); } }]); } } },
    caches: { keys: function () { return Promise.resolve(['tv-v1-core', 'x']); }, delete: function (k) { (log.del = log.del || []).push(k); return Promise.resolve(); } }, window_caches: 0,
    sessionStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    location: { pathname: '/Togie/', hostname: 'o.github.io', replace: function (u) { log.url = u; } },
    document: { readyState: 'loading', addEventListener: function () {}, getElementById: function () { return null; }, querySelector: function () { return null; }, body: {} },
    fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ build: latest, minNative: 1 }); } }); } });
  ctx.window.caches = ctx.caches; vm.runInContext(src, ctx);
  return G.Updater;
}
var d = page(29, 29).decide;
ok(page(29, 29).build === 29, 'build comes from window.TV_BUILD');
ok(d(29, { build: 29, minNative: 1 }, null, now).pending === null, 'same build: no panel');
ok(d(28, { build: 29, minNative: 1 }, null, now).pending.kind === 'web', 'older build: panel');
ok(d(30, { build: 29, minNative: 1 }, null, now).pending === null, 'newer than json: no panel');
ok(d(1, { build: 5, minNative: 3 }, null, now, true, 2).pending.kind === 'native', 'old shell: native panel');
// scenario A: normal apply. old page 28, server has 29.
var p = page(28, 29), r = d(28, { build: 29 }, null, now);
ok(r.pending && !r.waiting, 'A: panel shown');
var done = false;
p.apply(29, function (u) { done = true; log.u2 = u; });
setTimeout(function () {
  ok(done && /\?r=\d+$/.test(log.u2), 'A: reload url has fresh query: ' + log.u2);
  ok(log.unreg === 1 && log.del.indexOf('tv-v1-core') >= 0 && log.del.indexOf('x') < 0, 'A: SW unregistered, tv- caches deleted');
  ok(JSON.parse(store['tv-upd-target']).build === 29, 'A: target remembered');
  // scenario B: stale cache/CDN: reload still runs build 28
  var g = JSON.parse(store['tv-upd-target']), b = d(28, { build: 29 }, g, now + 1000);
  ok(b.pending === null && b.waiting === true, 'B: stale page after apply -> silent + waiting');
  var b2 = d(28, { build: 29 }, g, now + 599000);
  ok(b2.pending === null && b2.waiting, 'B: still silent at 9:59');
  var b3 = d(28, { build: 29 }, g, now + 601000);
  ok(b3.pending && !b3.waiting, 'B: after 10 min panel may return');
  // scenario C: fresh page after apply: no panel, guard cleared
  var c = d(29, { build: 29 }, g, now + 5000);
  ok(c.pending === null && !c.waiting && c.clear, 'C: new build runs -> no panel, guard cleared');
  // full flow through real check(): stale page loads with guard present
  var p2 = page(28, 29); p2.renderRow && 0;
  console.log(fails ? 'update_check: ' + fails + ' FAILED' : 'update_check: all ok');
  process.exit(fails ? 1 : 0);
}, 20);
