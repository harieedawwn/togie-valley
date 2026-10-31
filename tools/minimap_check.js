#!/usr/bin/env node
/* Togie Valley - tools/minimap_check.js (Round 3 stage 10): world -> minimap coordinate mapping (corners, centre, player), big-map mapping, landmark places. */
'use strict';
var path = require('path'), Mini = require(path.join(__dirname, '..', 'js', 'minimap.js')), M = require(path.join(__dirname, '..', 'js', 'world_map.js'));
var fails = 0, n = 0, W = M.W, H = M.H, SP = Mini.SPAN, SZ = 224, win = [0, 0, 0], o = [0, 0];
function eq(a, b, msg) { n++; if (Math.abs(a - b) > 1e-6) { fails++; console.log('FAIL ' + msg + ': got ' + a + ', want ' + b); } }
function at(px, pz, wx, wz, ex, ey, msg) { Mini.window(px, pz, W, H, SP, win); Mini.toMini(wx, wz, win, SZ, o); eq(o[0], ex, msg + ' x'); eq(o[1], ey, msg + ' y'); }
var k = SZ / SP;
// player in a corner: the window clamps to the map, the player sits near that corner; the map corner itself maps to the minimap corner
at(0.5, 0.5, 0.5, 0.5, 0.5 * k, 0.5 * k, 'player NW');
at(0.5, 0.5, 0, 0, 0, 0, 'NW corner');
at(W - 0.5, H - 0.5, W, H, SZ, SZ, 'SE corner');
at(W - 0.5, H - 0.5, W - 0.5, H - 0.5, SZ - 0.5 * k, SZ - 0.5 * k, 'player SE');
at(W - 0.5, 0.5, W, 0, SZ, 0, 'NE corner');
at(0.5, H - 0.5, 0, H, 0, SZ, 'SW corner');
at(W / 2, H / 2, W / 2, H / 2, SZ / 2, SZ / 2, 'player centred in the open map');   // free window: player exactly in the middle
at(W / 2 + 3, H / 2 - 2, W / 2 + 3, H / 2 - 2, SZ / 2, SZ / 2, 'player centred after moving');
at(45, 30, 45 + 5, 30 - 7, SZ / 2 + 5 * k, SZ / 2 - 7 * k, 'offset point: east is right, north is up');
Mini.window(2, 2, W, H, SP, win); eq(win[0], 0, 'clamp x0'); eq(win[1], 0, 'clamp z0'); eq(win[2], SP, 'span');
Mini.window(W, H, W, H, SP, win); eq(win[0], W - SP, 'clamp x1'); eq(win[1], H - SP, 'clamp z1');
// whole-world map
Mini.toBig(0, 0, W, H, 720, 480, o); eq(o[0], 0, 'big 0'); eq(o[1], 0, 'big 0');
Mini.toBig(W, H, W, H, 720, 480, o); eq(o[0], 720, 'big W'); eq(o[1], 480, 'big H');
Mini.toBig(45.5, 30.5, W, H, 720, 480, o); eq(o[0], 45.5 * 8, 'big player x'); eq(o[1], 30.5 * 8, 'big player z');
// landmark places: 7 kinds, all inside the map, farm over plots, pier east of the stream bridge
var pl = Mini.places(M.rows, { dinh: [35, 21, 37, 23], furn: [36, 44, 43, 49] }), kinds = {};
pl.forEach(function (p) { kinds[p.k] = p; n++; if (!(p.x > 0 && p.x < W && p.z > 0 && p.z < H)) { fails++; console.log('FAIL place outside map ' + p.k); } });
['home', 'stall', 'shop', 'furn', 'pier', 'dinh', 'farm'].forEach(function (key) { n++; if (!kinds[key]) { fails++; console.log('FAIL missing place ' + key); } });
if (kinds.pier) { n++; if (kinds.pier.x < 46) { fails++; console.log('FAIL pier icon on the stream bridge'); } }
console.log('minimap_check: ' + (n - fails) + '/' + n + ' ok');
process.exit(fails ? 1 : 0);
