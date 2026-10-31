/* Togie Valley - tools/icon_check.js (Stage 22): lists every icon id referenced in js/, fails on unknown ids, duplicate icons in the main
 * (pause) menu, and any leftover hand icon identifier / unicode hand glyph in js, css, html. Usage: node tools/icon_check.js */
'use strict';
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errors = 0;
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function list(d, ext) { return fs.readdirSync(path.join(root, d)).filter(function (n) { return n.slice(-ext.length) === ext; }).map(function (n) { return d + '/' + n; }); }
function fail(m) { errors++; console.log('FAIL ' + m); }

var jsFiles = list('js', '.js'), cssFiles = list('css', '.css'), all = jsFiles.concat(cssFiles, ['index.html', 'sw.js']);
var known = {}, refs = {}, m;
['js/icons.js', 'js/icons_set.js'].forEach(function (f) {
  var s = read(f), re = /\b(?:uic|A)\('([\w-]+)'/g;
  while ((m = re.exec(s))) known[m[1]] = 1;
  re = /(\w+): '([\w-]+)'/g;   // ALIAS entries (only the block that follows "var ALIAS")
  var i = s.indexOf('var ALIAS'); if (i >= 0) { var blk = s.slice(i, s.indexOf('};', i)); while ((m = re.exec(blk))) known[m[1]] = 1; }
});
function ref(id, f) { (refs[id] = refs[id] || {})[f] = 1; }
var PAT = [/\b(?:Icons\.ui|ico|Icons\.has)\(\s*'([\w-]+)'/g, /\.toast\([^;\n]*?,\s*'([\w-]+)'\)/g, /\bpaintAction\(\s*'([\w-]+)'/g, ];
var GOALS = /\bdef\('[^']+',\s*'[^']*',\s*'[^']*',\s*'([\w-]+)'/g;
jsFiles.forEach(function (f) {
  var s = read(f), re, p;
  if (f === 'js/goals.js') { re = new RegExp(GOALS.source, 'g'); while ((m = re.exec(s))) ref(m[1], f); }
  for (p = 0; p < PAT.length; p++) { re = new RegExp(PAT[p].source, 'g'); while ((m = re.exec(s))) ref(m[1], f); }
});
// main menu tiles: [icon, label, ...] inside openPause
var mm = read('js/menus.js'), a = mm.indexOf('function openPause'), b = mm.indexOf('G.Menus =');
var body = mm.slice(a, b), tiles = [], re = /\[\s*'([\w-]+)',\s*'([^']+)',\s*(?:function|tab\()/g;
while ((m = re.exec(body))) { tiles.push([m[1], m[2]]); ref(m[1], 'js/menus.js'); }
var seen = {};
tiles.forEach(function (t) { if (seen[t[0]]) fail('menu: "' + t[1] + '" and "' + seen[t[0]] + '" share icon "' + t[0] + '"'); else seen[t[0]] = t[1]; });
if (tiles.length < 8) fail('menu: only ' + tiles.length + ' tiles parsed');
console.log('main menu: ' + tiles.map(function (t) { return t[1] + '=' + t[0]; }).join(', '));

var ids = Object.keys(refs).sort();
console.log('icon ids referenced (' + ids.length + '):');
ids.forEach(function (id) {
  var files = Object.keys(refs[id]).map(function (f) { return f.replace('js/', ''); }).join(' ');
  var itemLike = !known[id] && /^[a-z_]+$/.test(id) && /seed|rod|pole|can|hoe/.test(id);
  if (!known[id] && !itemLike) fail('unknown icon id "' + id + '" in ' + files);
  console.log('  ' + (known[id] ? '' : '? ') + id + '  <- ' + files);
});

// hand purge
var SKIP = { 'js/anim_data.js': 1, 'js/joystick.js': 1 };   // skeleton "hand" probes and the left/right-handed setting, not icons
var GLYPH = /[\u261d\u270b\u{1F446}-\u{1F450}\u{1F590}\u{1F91A}\u{1FAF5}\u{1F44B}\u{1F44D}]/u;
var BAD = [[/['"]hand['"]/, 'quoted hand icon id'], [/actionIcons\.hand\b/, 'actionIcons.hand'], [/\bfinger\s*\(/, 'finger()'], [/\b(?:a-tap|tu-tap)\b/, 'tap-finger animation'],
  [/\b(?:icon-hand|hand-icon|pointing-hand|pointer-hand)\b/, 'hand icon class'], [/cursor\s*:\s*(?:url|grab)/, 'hand cursor']];
all.forEach(function (f) {
  if (SKIP[f]) return;
  read(f).split('\n').forEach(function (l, i) {
    BAD.forEach(function (b) { if (b[0].test(l)) fail(f + ':' + (i + 1) + ' ' + b[1]); });
    if (GLYPH.test(l)) fail(f + ':' + (i + 1) + ' unicode hand glyph');
  });
});

// rarity badges (round 4 stage 10): module order, call sites pass quality, star rendering rules
(function () {
  var idx = read('index.html'), vm = require('vm');
  if (!(idx.indexOf('js/icon_badges.js') > idx.indexOf('js/icons_set.js') && idx.indexOf('js/icon_badges.js') < idx.indexOf('js/ui.js'))) fail('icon_badges.js must load after icons_set.js and before ui.js');
  [['js/ui.js', 'Icons.item(def, 40, slot.tier, slot.q)'], ['js/panels.js', 'Icons.item(def, 40, slot.tier, slot.q)'], ['js/panels.js', 'Icons.item(def, 20, slot.tier, slot.q)'], ['js/fishing.js', 'Icons.item(it, 64, 0, q)']]
    .forEach(function (c) { if (read(c[0]).indexOf(c[1]) < 0) fail(c[0] + ' does not pass quality: ' + c[1]); });
  if (/__rarity/.test(read('js/fishing.js'))) fail('old rarity wrapper still in fishing.js');
  var fish = { id: 'f', cat: 'fish', tier: 'gold' }, win = { Game: { Items: { get: function (i) { return fish; } }, Icons: { item: function () { return '<svg viewBox="0 0 64 64"><g/></svg>'; } } } };
  vm.runInNewContext(read('js/icon_badges.js'), { window: win, console: console });
  var I = win.Game.Icons, svg;
  svg = I.item(fish, 40, 0, 'silver'); if (!/tv-star silver/.test(svg) || !/linearGradient/.test(svg)) fail('silver quality: no gradient star');
  svg = I.item(fish, 40, 0, 'gold'); if (!/tv-star gold/.test(svg)) fail('gold quality: no star');
  if (/tv-star/.test(I.item(fish, 40, 0, 'normal'))) fail('normal quality must have no badge');
  if (!/tv-star gold/.test(I.item(fish, 40))) fail('species tier fallback missing');
  if (/tv-star/.test(I.item({ id: 'x', cat: 'crop', tier: 'gold' }, 40, 0, 'gold'))) fail('non-fish got a star');
  [16, 20, 28, 40, 56, 64].forEach(function (px) {
    var m = /scale\(([\d.]+)\)/.exec(I.item(fish, px, 0, 'gold'));
    if (!m || +m[1] * 1.9 * px / 64 < 9.9) fail('star under 10px at icon size ' + px);
  });
  var a = I.item(fish, 40, 0, 'gold'), b = I.item(fish, 40, 0, 'gold');
  if (/id="tvq(\d+)"/.exec(a)[1] === /id="tvq(\d+)"/.exec(b)[1]) fail('gradient ids must be unique per instance');
  console.log('rarity badges: ok');
})();
console.log('icon_check: ' + errors + ' error(s)');
process.exit(errors ? 1 : 0);
