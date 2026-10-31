/* Togie Valley - tools/shot.js (Round 5 S1): screenshot + perf harness on the installed Edge/Chrome (playwright-core, no browser download).
 * Setup once:  cd tools/shot && npm install          (only playwright-core; the root package.json is Capacitor tooling, never installed here)
 * Usage:       node tools/shot.js <preset...|all> [--desktop|--phone|--landscape|--both|--all-devices] [--out dir]
 *                [--eval "<js run in the page before capture>"] [--frames n --every ms] [--perf] [--headed] [--port 8080] [--browser <exe>]
 *   --phone = phone portrait, --both = desktop + phone portrait, --all-devices = desktop + portrait + landscape. Default: desktop.
 *   Output: <out>/<preset>-<device>[-fNN].png (default out: shots/). --perf writes shots/perf-<preset>-<device>.json and prints a table.
 * The page is opened with ?shot=1 (js/shot_mode.js): fixed seed, fresh in-memory game, dev mode, 10:00, sun, no saves written.
 * Add presets to PRESETS below: setup(G) runs in the page (async ok) and receives Game; `settle` = ms to wait before capturing. */
'use strict';
var path = require('path'), fs = require('fs'), net = require('net');
var ROOT = path.resolve(__dirname, '..');

var pw;
try { pw = require(path.join(__dirname, 'shot', 'node_modules', 'playwright-core')); }
catch (e) { console.error('playwright-core missing: run  cd tools/shot ; npm install'); process.exit(1); }

/* ------------------------------------------------------------------ presets (one table; setup runs in the page) */
var PRESETS = {
  farm: { desc: 'farm plot and house, 10:00', settle: 1500, setup: function (G) { G.Shot.at(17, 19, 'n'); G.Shot.camera(0, 1); } },
  crops: {
    desc: 'every crop at sprout / grown / ripe across the full plot', settle: 2500,
    setup: function (G) { G.Dev.setLand('farm', 3); G.Shot.plantAll(); G.Shot.at(17, 14, 'n'); G.Shot.camera(0, 1.35); }
  },
  river: { desc: 'river, bridge and fishing piers', settle: 1500, setup: function (G) { G.Shot.at(58, 19, 'n'); G.Shot.camera(0, 1.25); } },
  town: { desc: 'town: shop, workshop, fish stall', settle: 1500, setup: function (G) { G.Shot.at(39, 19, 'n'); G.Shot.camera(0, 1); } },
  village: { desc: 'Vietnamese village area', settle: 1500, setup: function (G) { G.Shot.toVillage(); G.Shot.camera(0, 1); } },
  house: { desc: 'inside the player house', settle: 1800, setup: function (G) { G.Shot.toHouse(); } },
  night: { desc: 'farm at 21:00', settle: 1800, setup: function (G) { G.Shot.at(17, 19, 'n'); G.Dev.setHour(21); G.Shot.camera(0, 1); } },
  rain: { desc: 'farm in rain', settle: 2500, setup: function (G) { G.Shot.at(17, 19, 'n'); G.Dev.setWeather('rain'); G.Shot.camera(0, 1); } },
  fishing: {   // cast from the first pier; 8 frames 350 ms apart by default (--frames / --every override)
    desc: 'cast sequence on the pier (rod in hand)', settle: 200, frames: 8, every: 350,
    setup: function (G) {
      var I = G.Inventory, i;
      G.Shot.at(52, 17, 'n'); G.Shot.camera(0, 0.9);
      for (i = 0; i < 12; i++) { var s = I.get(i); if (s && G.FishData && G.FishData.isRod && G.FishData.isRod(s.id)) { I.select(i); break; } }
      return new Promise(function (res) {   // wait out the scene-change / intro lock, then cast
        var n = 0, t = setInterval(function () { if (!G.Player.isLocked() || ++n > 60) { clearInterval(t); G.Shot.cast = G.Fishing.castAt(52, 13); res(G.Shot.cast); } }, 100);
      });
    }
  },
  overview: {   // wide look over the map to judge tree/decor layout; ?shot only (camera limits and fog are raised for this page)
    desc: 'wide, steep view of the west / east halves of the map', settle: 2500, views: [[26, 30], [62, 34]],
    setup: function (G) {
      var C = G.Config.camera, R = G.Config.render || {};
      C.presets.outdoor.distance = 48; C.presets.outdoor.pitch = 55; if (R.fogFar) R.fogFar = 400; C.far = 400;
      G.Shot.noFog = setInterval(function () { var u = G.Render.uniforms && G.Render.uniforms.uFogRange; if (u) u.value.set(300, 400); }, 50);   // fog is re-set by the time-of-day code
      G.Shot.at(30, 30, 's'); G.Shot.camera(0, 1);
    }
  },
  icons: { desc: 'every item icon at 48 and 96 px with ids, light + dark', icons: true }
};

/* ------------------------------------------------------------------ devices */
var DEVICES = {
  desktop: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
};
var PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/* ------------------------------------------------------------------ args */
function parseArgs(argv) {
  var o = { presets: [], devices: [], out: path.join(ROOT, 'shots'), evalJs: '', frames: 0, every: 0, perf: false, headed: false, port: 8080, browser: '' };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--desktop') o.devices.push('desktop');
    else if (a === '--phone') o.devices.push('phone');
    else if (a === '--landscape') o.devices.push('landscape');
    else if (a === '--both') o.devices.push('desktop', 'phone');
    else if (a === '--all-devices') o.devices.push('desktop', 'phone', 'landscape');
    else if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--eval') o.evalJs = argv[++i] || '';
    else if (a === '--frames') o.frames = Math.max(1, +argv[++i] || 1);
    else if (a === '--every') o.every = Math.max(16, +argv[++i] || 250);   // 0 = preset default (frames 1, every 250)
    else if (a === '--perf') o.perf = true;
    else if (a === '--headed') o.headed = true;
    else if (a === '--port') o.port = +argv[++i] || 8080;
    else if (a === '--browser') o.browser = argv[++i] || '';
    else if (a === 'all') o.presets = o.presets.concat(Object.keys(PRESETS));
    else if (a.charAt(0) !== '-') o.presets.push(a);
    else { console.error('unknown flag ' + a); process.exit(1); }
  }
  if (!o.devices.length) o.devices.push('desktop');
  o.devices = o.devices.filter(function (d, j) { return o.devices.indexOf(d) === j; });
  if (!o.presets.length) { console.log('presets: ' + Object.keys(PRESETS).join(', ')); process.exit(1); }
  o.presets.forEach(function (p) { if (!PRESETS[p]) { console.error('unknown preset ' + p + ' (have: ' + Object.keys(PRESETS).join(', ') + ')'); process.exit(1); } });
  return o;
}

/* ------------------------------------------------------------------ server + browser */
function portFree(port) {
  return new Promise(function (res) {
    var s = net.createServer();
    s.once('error', function () { res(false); });
    s.once('listening', function () { s.close(function () { res(true); }); });
    s.listen(port, '0.0.0.0');
  });
}
function ensureServer(port) {
  return portFree(port).then(function (free) {
    if (!free) { console.log('[shot] using the server already on :' + port); return null; }
    return new Promise(function (res, rej) {
      require('./serve.js').start(port, function (err, srv) { if (err) rej(err); else { console.log('[shot] started tools/serve.js on :' + port); res(srv); } });
    });
  });
}
function findExe() {   // last resort when no standard Edge/Chrome install is found (e.g. only Edge's EdgeCore runtime)
  var pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', pf = process.env.ProgramFiles || 'C:\\Program Files', la = process.env.LOCALAPPDATA || '';
  var dirs = [path.join(pf86, 'Microsoft', 'EdgeCore'), path.join(pf86, 'Microsoft', 'EdgeWebView', 'Application'), path.join(pf, 'Microsoft', 'EdgeCore'), path.join(la, 'Microsoft', 'EdgeCore')];
  var out = [];
  dirs.forEach(function (d) {
    var names; try { names = fs.readdirSync(d); } catch (e) { return; }
    names.forEach(function (v) { var f = path.join(d, v, 'msedge.exe'); if (fs.existsSync(f)) out.push(f); });
  });
  out.sort();
  return out.pop() || '';
}
function launch(o) {
  var base = { headless: !o.headed, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] };
  function tryIt(extra, label) { return pw.chromium.launch(Object.assign({}, base, extra)).then(function (b) { console.log('[shot] browser: ' + label + ' ' + b.version()); return b; }); }
  if (o.browser) return tryIt({ executablePath: o.browser }, o.browser);
  return tryIt({ channel: 'msedge' }, 'msedge')
    .catch(function () { return tryIt({ channel: 'chrome' }, 'chrome'); })
    .catch(function () {
      var exe = findExe();
      if (!exe) throw new Error('no Edge or Chrome found (install Microsoft Edge or pass --browser <exe>)');
      return tryIt({ executablePath: exe }, exe);
    });
}

/* ------------------------------------------------------------------ in-page helpers (installed once per page as Game.Shot.*) */
function installHelpers(page) {
  return page.evaluate(function () {
    var G = window.Game, S = G.Shot;
    S.camera = function (yawStep, zoom) { G.Camera.setState({ yawStep: yawStep || 0, zoom: zoom || 1 }); if (G.Render.rig && G.Render.rig.snap) G.Render.rig.snap(); };
    S.at = function (tx, tz, facing) {
      if (G.Scenes.current !== 'outdoor') G.Scenes.go('outdoor', { tx: tx, tz: tz, facing: facing || 's' }, { instant: true });
      else G.Player.placeAt({ tx: tx, tz: tz, facing: facing || 's' });
      if (G.Render.rig && G.Render.rig.snap) G.Render.rig.snap();
    };
    S.toHouse = function () {
      var sp = G.House && G.House.wakeSpawn ? G.House.wakeSpawn() : null;
      if (G.Scenes.has('house')) G.Scenes.go('house', sp, { instant: true });
      if (G.Render.rig && G.Render.rig.snap) G.Render.rig.snap();
    };
    S.toVillage = function () {
      /* densest cluster of village street props (fences, lanterns, jars...) */
      var L = G.VillageVN && G.VillageVN.layout, pts = ((L && L.street) || []).map(function (p) { return Array.isArray(p) ? [p[1], p[2]] : [p.x, p.z]; })
        .filter(function (p) { return typeof p[0] === 'number' && typeof p[1] === 'number'; }), best = null, bn = -1;
      pts.forEach(function (a) { var n = 0; pts.forEach(function (b) { if (Math.abs(a[0] - b[0]) < 7 && Math.abs(a[1] - b[1]) < 7) n++; }); if (n > bn) { bn = n; best = a; } });
      S.village = { props: pts.length, best: best, near: bn };
      if (best) S.at(Math.floor(best[0]), Math.floor(best[1]), 's'); else S.at(20, 45, 's');
    };
    /* Plant every crop three times (sprout / half grown / ripe) on soil tiles, row by row. */
    S.plantAll = function () {
      var F = G.Farm, list = G.Crops.list || G.Crops.all(), soil = [], x, z, i, n = 0;
      for (z = 0; z < 60; z++) for (x = 0; x < 90; x++) if (G.World.tileType(x + 0.5, z + 0.5) === 'soil') soil.push([x, z]);
      soil.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
      for (i = 0; i < list.length * 3 && i < soil.length; i++) {
        var t = soil[i], cd = list[i % list.length], st = Math.floor(i / list.length);
        F.till(t[0], t[1]); F.waterTile(t[0], t[1]);
        if (!F.plant(t[0], t[1], cd.id)) continue;
        F.devGrow(t[0], t[1], st === 0 ? 1 : st === 1 ? Math.max(1, Math.floor(cd.days / 2)) : cd.days);
        n++;
      }
      S.planted = { crops: list.length, tiles: soil.length, planted: n };
      return S.planted;
    };
    return true;
  });
}

/* ------------------------------------------------------------------ icons sheet (rendered in a plain page from Game.Icons markup) */
function iconsSheet(page) {
  return page.evaluate(function () {
    var G = window.Game, items = G.Items.all();
    return items.map(function (d) { return { id: d.id, cat: d.cat, s48: G.Icons.item(d, 48), s96: G.Icons.item(d, 96) }; });
  }).then(function (list) {
    function grid(bg, fg) {
      return '<div style="background:' + bg + ';color:' + fg + ';padding:12px;display:flex;flex-wrap:wrap;gap:6px">' + list.map(function (it) {
        return '<div style="width:118px;text-align:center;font:10px/1.2 monospace;padding:4px;border:1px solid rgba(128,128,128,.3)">' +
          '<div style="height:100px;display:flex;align-items:center;justify-content:center;gap:4px"><span>' + it.s48 + '</span><span>' + it.s96 + '</span></div>' +
          '<div style="word-break:break-all">' + it.id + '</div></div>';
      }).join('') + '</div>';
    }
    return { count: list.length, html: '<!doctype html><meta charset="utf-8"><body style="margin:0">' +
      '<h3 style="font:14px sans-serif;margin:8px">' + list.length + ' item icons (48 + 96 px)</h3>' + grid('#f4efe2', '#222') + grid('#1d2230', '#eee') + '</body>' };
  });
}

/* ------------------------------------------------------------------ perf sampling */
function perfSample(page, warmMs, sampleMs) {
  return page.evaluate(function (a) {
    var G = window.Game, R = G.Render.renderer;
    return new Promise(function (res) {
      setTimeout(function () {
        var dts = [], calls = 0, tris = 0, n = 0, last = performance.now(), end = last + a.sampleMs;
        if (G.Prof) { G.Prof.on = true; G.Prof.reset(); }
        function f(t) {
          dts.push(t - last); last = t;
          if (R && R.info) { calls += R.info.render.calls; tris += R.info.render.triangles; n++; }
          if (t < end) requestAnimationFrame(f);
          else {
            var s = dts.slice().sort(function (x, y) { return x - y; });
            function q(p) { return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
            res({
              frames: dts.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1], long50: dts.filter(function (d) { return d > 50; }).length,
              fps: 1000 * dts.length / a.sampleMs, calls: n ? Math.round(calls / n) : 0, triangles: n ? Math.round(tris / n) : 0,
              tier: G.Quality && (G.Quality.tier || G.Quality.level) || null,
              top: G.Prof && G.Prof.top ? G.Prof.top(8).map(function (e) { return { label: e.label, ms: +e.ms.toFixed(3), max: +e.max.toFixed(2) }; }) : []
            });
          }
        }
        requestAnimationFrame(function (t) { last = t; requestAnimationFrame(f); });
      }, a.warmMs);
    });
  }, { warmMs: warmMs, sampleMs: sampleMs });
}

/* ------------------------------------------------------------------ run */
function run(o) {
  var server = null, browser = null, errors = [], perfRows = [];
  fs.mkdirSync(o.out, { recursive: true });
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function onDevice(dev) {
    var d = DEVICES[dev], ctxOpts = Object.assign({}, d);
    if (d.isMobile) ctxOpts.userAgent = PHONE_UA;
    var ctx, page;
    return browser.newContext(ctxOpts).then(function (c) {
      ctx = c;
      return ctx.addInitScript(function () { try { localStorage.setItem('togie-valley/deskhint', '1'); } catch (e) { /* ignore */ } });   // first-launch controls hint off (fresh profile per run)
    }).then(function () { return ctx.newPage(); }).then(function (p) {
      page = p;
      page.on('console', function (m) { if (m.type() === 'error') errors.push('[' + dev + '] ' + m.text()); });
      page.on('pageerror', function (e) { errors.push('[' + dev + '] pageerror: ' + (e && e.message)); });
      /* every preset starts from a fresh load, so nothing (crops, hour, weather) leaks between presets */
      return o.presets.reduce(function (pr, name) { return pr.then(function () { return boot(dev, page, name); }).then(function () { return onPreset(dev, page, name); }); }, Promise.resolve());
    }).then(function () { return ctx.close(); });
  }
  function boot(dev, page, name) {
    if (PRESETS[name].icons && page.url().indexOf('shot=1') > 0) return null;   // icons only read markup from an already booted page
    return page.goto('http://localhost:' + o.port + '/?shot=1', { waitUntil: 'load', timeout: 60000 }).then(function () {
      return page.waitForFunction(function () { return window.Game && window.Game.Shot && (window.Game.Shot.ready || window.Game.Shot.error); }, null, { timeout: 90000 });
    }).then(function () { return page.evaluate(function () { return window.Game.Shot.error || null; }); })
      .then(function (err) { if (err) throw new Error('shot setup: ' + err); return installHelpers(page); })
      .then(function () {
        if (!DEVICES[dev].isMobile || !o.perf) return null;
        return page.context().newCDPSession(page).then(function (cdp) { return cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); });
      });
  }

  function onPreset(dev, page, name) {
    var P = PRESETS[name], base = path.join(o.out, name + '-' + dev);
    if (P.icons) {
      return iconsSheet(page).then(function (sh) {
        return page.context().newPage().then(function (ip) {
          return ip.setContent(sh.html).then(function () { return ip.screenshot({ path: base + '.png', fullPage: true }); })
            .then(function () { console.log('[shot] ' + base + '.png (' + sh.count + ' icons)'); return ip.close(); });
        });
      });
    }
    return page.evaluate('(' + P.setup.toString() + ')(window.Game)').then(function () { return wait(P.settle || 1500); })
      .then(function () { return o.evalJs ? page.evaluate(o.evalJs).then(function (r) { if (r !== undefined) console.log('[eval ' + name + '-' + dev + '] ' + JSON.stringify(r)); }) : null; })
      .then(function () {
        if (o.perf) {
          return perfSample(page, 5000, 10000).then(function (r) {
            r.label = name + '-' + dev; r.device = dev; r.cpuThrottle = DEVICES[dev].isMobile ? 4 : 1; r.when = new Date().toISOString();
            fs.writeFileSync(path.join(o.out, 'perf-' + r.label + '.json'), JSON.stringify(r, null, 2));
            perfRows.push(r);
            return page.screenshot({ path: base + '.png' });
          });
        }
        var k = 0, nF = o.frames || P.frames || 1, ev = o.every || P.every || 250;
        function one() {
          var f = nF > 1 ? base + '-f' + (k < 10 ? '0' : '') + k + '.png' : base + '.png';
          return page.screenshot({ path: f }).then(function () {
            console.log('[shot] ' + f);
            k++;
            return k < nF ? wait(ev).then(one) : null;
          });
        }
        return one();
      });
  }

  return ensureServer(o.port).then(function (s) { server = s; return launch(o); })
    .then(function (b) { browser = b; return o.devices.reduce(function (pr, dev) { return pr.then(function () { return onDevice(dev); }); }, Promise.resolve()); })
    .then(function () {
      if (perfRows.length) {
        console.log('\nlabel                    p50ms  p95ms  maxms  >50ms  fps   calls  tris     tier');
        perfRows.forEach(function (r) {
          function pad(v, n) { v = String(v); while (v.length < n) v += ' '; return v; }
          console.log(pad(r.label, 24) + ' ' + pad(r.p50.toFixed(1), 6) + ' ' + pad(r.p95.toFixed(1), 6) + ' ' + pad(r.max.toFixed(1), 6) + ' ' +
            pad(r.long50, 6) + ' ' + pad(r.fps.toFixed(0), 5) + ' ' + pad(r.calls, 6) + ' ' + pad(r.triangles, 8) + ' ' + (r.tier || ''));
          console.log('    top: ' + r.top.slice(0, 5).map(function (e) { return e.label + ' ' + e.ms.toFixed(2); }).join(', '));
        });
      }
    })
    .catch(function (e) { errors.push('[harness] ' + (e && e.stack || e)); })
    .then(function () {
      console.log('\nconsole errors: ' + errors.length);
      errors.forEach(function (e) { console.log('  ' + e); });
      return Promise.all([browser && browser.close(), server && new Promise(function (r) { server.close(r); })]);
    })
    .then(function () { process.exit(errors.length ? 2 : 0); });
}

run(parseArgs(process.argv.slice(2)));
