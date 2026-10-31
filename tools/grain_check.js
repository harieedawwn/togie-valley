#!/usr/bin/env node
/* Togie Valley - tools/grain_check.js (Round 4 stage 7). Lists every noise/grain source and fails if one is not gated by the 'Hạt giấy' setting. */
'use strict';
var fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..'), errors = 0;
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function list(dir, ext) { return fs.readdirSync(path.join(root, dir)).filter(function (f) { return ext.test(f); }).map(function (f) { return dir + '/' + f; }); }
var render = rd('js/render.js'), core = rd('js/core.js'), settings = rd('js/settings.js');
function ok(c, m) { console.log((c ? 'ok      ' : 'ERROR   ') + m); if (!c) errors++; }
// 1. the one grain layer (CSS div) must be gated by paperLow and capped
ok(/grainEl\.style\.display = on && paperLow/.test(render), 'render.js #tv-grain display gated by paperLow (setting)');
ok(/Math\.min\(cfg\.grain, 0\.012\)/.test(render), 'render.js grain opacity capped at 1.2%');
var g = /grain:\s*([0-9.]+)/.exec(core); ok(g && parseFloat(g[1]) <= 0.015, 'core.js Config.render.grain ' + (g && g[1]) + ' <= 0.015');
ok(/setPaper/.test(settings) && /Hạt giấy/.test(settings), 'settings.js has "Hạt giấy" toggle');
ok(/short < 600/.test(render), 'phone default Tắt (short side < 600 / coarse + low memory)');
// 2. scan for any other noise source
var files = list('js', /\.js$/).concat(list('css', /\.css$/), ['index.html']), ALLOW = {
  'js/weather.js': 'ripple position hash (vertex, not visual noise)', 'js/sfx_bank.js': 'audio noise', 'js/audio.js': 'audio noise', 'js/dsp.js': 'audio noise',
  'js/render.js': 'gated paper layer above', 'js/world.js': 'water glint specks, gated by uSpk (paperLow)',
  'js/detail_terrain.js': 'value noise for placement (geometry), not a visual overlay', 'js/detail_town.js': 'value noise for placement (geometry)',
  'js/scenery.js': 'value noise for placement', 'js/scenery_layout.js': 'value noise for placement',
  'js/fishing_fx.js': 'soft alpha sprite texture, no random noise', 'js/rain_fx.js': 'rain drop position hash (vertex)',
  'js/furn_live.js': 'indoor dim multiply tint, flat colour (no noise)'
};
var NEED = { 'js/world.js': /uSpk > 0\.5/ };
var RX = /feTurbulence|fract\(\s*sin\(|\bdithering\s*:\s*true|\.dithering\s*=\s*true|noise\s*\(|url\(\s*["']?data:image|mix-blend-mode|createImageData|\bsnoise\b/g;
files.forEach(function (f) {
  var s = rd(f), m = s.match(RX);
  if (!m) return;
  if (NEED[f] && !NEED[f].test(s)) { errors++; console.log('ERROR   ' + f + ': noise not gated'); return; }
  if (ALLOW[f]) console.log('listed  ' + f + ': ' + m.length + ' hit(s) - ' + ALLOW[f]);
  else { errors++; console.log('ERROR   ' + f + ': ungated noise source ' + JSON.stringify(m.slice(0, 3))); }
});
console.log('grain_check: ' + errors + ' error(s)');
process.exit(errors ? 1 : 0);
