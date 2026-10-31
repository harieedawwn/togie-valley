#!/usr/bin/env node
/* Togie Valley - tools/look_check.js (Round 2 stage 2). Builds every look option alone, every preset and 400 random looks with the real
 * js/look.js + js/models.js (vendor/three.min.js with a minimal Render stub; no browser). Fails on undefined colours / ids, NaN geometry,
 * draw-call overruns, conflicting hat + head-top accessories, broken encode/decode. Usage: node tools/look_check.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.resolve(__dirname, '..'), fails = 0, built = 0;
function fail(m) { fails++; console.error('FAIL ' + m); }

var THREE = require(path.join(root, 'vendor', 'three.min.js'));
var sb = { console: console, THREE: THREE, Math: Math };
sb.window = sb;
sb.Game = {
  util: {},
  Events: { on: function () { return function () {}; }, emit: function () {} },
  Render: {
    addSmoothNormals: function () {},
    addOutline: function (mesh) { var h = new THREE.Mesh(mesh.geometry, {}); h.name = 'outline'; mesh.userData.outline = h; mesh.add(h); return h; },
    toonMaterial: function () { return { uniforms: {} }; },
    addBlobShadow: function () { return { remove: function () {} }; }
  }
};
vm.createContext(sb);
['js/look.js', 'js/head_model.js', 'js/models.js', 'js/char_kit.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }); });
var Look = sb.Game.Look, Models = sb.Game.Models;
if (!Look || !Models || !Models.character) { console.error('look_check: Look/Models did not load'); process.exit(1); }

/* ---- static data checks */
var PAL = Look.PAL, IDS = Look.IDS, LAB = Look.LABEL, k;
for (k in PAL) PAL[k].forEach(function (c, i) { if (typeof c !== 'number' || !(c >= 0 && c <= 0xffffff)) fail('palette ' + k + '[' + i + '] = ' + c); });
['hairStyle', 'nose', 'hat', 'acc', 'top', 'bottom'].forEach(function (f) { if (!LAB[f] || LAB[f].length !== IDS[f].length) fail('labels for ' + f); });
if (PAL.skin.length < 6 || PAL.hair.length < 10 || IDS.hairStyle.length < 6 || IDS.nose.length < 5 || IDS.hat.length < 6 || IDS.acc.length < 7 || IDS.top.length < 5 || IDS.bottom.length < 3) fail('option counts below the spec');
if (Look.presets.length !== 12) fail('presets: ' + Look.presets.length + ' (need 12)');
var D = Look.resolve(Look.DEFAULT);
if (D.skin !== 0xf6cfa8 || D.hair !== 0x6b3f2a || D.shirt !== 0x6fb6e8 || D.pants !== 0x4f6fa8 || D.eyes !== 0x2b2233 || D.hat !== 'straw' || D.hairStyle !== 'bun' || D.top !== 'overalls' || D.bottom !== 'pants' || D.nose !== 'none' || D.acc.length) fail('default look differs from the old hard-coded look');

/* ---- one look: data + geometry checks */
var maxDraw = 23, maxTri = 0;   // stage 17: +1 mesh +1 outline per spring part (tails, bow, scarf end, backpack), worst look 23; old maximum: 7 body meshes + bun + hat, each with an outline hull
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function checkLook(l, tag) {
  var tri = 0, v = Look.validate(l), enc = Look.encode(v), r = Look.resolve(v), i, n = 0, ch;
  if (!same(v, Look.validate(v))) fail(tag + ': validate is not idempotent');
  if (enc.length > 80 || !same(Look.decode(enc), v)) fail(tag + ': encode/decode mismatch (' + enc + ')');
  ['skin', 'hair', 'eyes', 'shirt', 'pants'].forEach(function (c) { if (typeof r[c] !== 'number' || isNaN(r[c])) fail(tag + ': undefined colour ' + c); });
  if (IDS.hairStyle.indexOf(r.hairStyle) < 0 || IDS.nose.indexOf(r.nose) < 0 || IDS.top.indexOf(r.top) < 0 || IDS.bottom.indexOf(r.bottom) < 0 || (r.hat !== null && IDS.hat.indexOf(r.hat) < 0)) fail(tag + ': undefined id');
  var topAcc = r.acc.filter(function (a) { return a === 'bow' || a === 'headband' || a === 'catear'; }).length;
  if (r.acc.length > 2 || topAcc > 1 || (r.hat && topAcc)) fail(tag + ': conflicting accessories ' + JSON.stringify(r));
  try { ch = Models.character({ look: r, shadow: false }); } catch (e) { fail(tag + ': build threw ' + e.message); return; }
  ch.root.traverse(function (o) {
    var g, p, c, j, vis = true, a;
    if (!o.isMesh) return;
    for (a = o; a; a = a.parent) if (a.visible === false) vis = false;
    if (vis) { n++; if (o.name !== 'outline' && o.geometry.attributes.position) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }
    g = o.geometry; p = g.attributes && g.attributes.position; c = g.attributes && g.attributes.color;
    if (!p) return;                               // empty placeholder geometry (hidden hat / bun)
    if (p.count === 0 && vis) fail(tag + ': visible mesh without vertices');
    for (j = 0; j < p.array.length; j++) if (!isFinite(p.array[j])) { fail(tag + ': NaN position'); break; }
    if (c) for (j = 0; j < c.array.length; j++) if (!(c.array[j] >= 0 && c.array[j] <= 1)) { fail(tag + ': bad vertex colour ' + c.array[j]); break; }
  });
  if (tri > 4000) fail(tag + ': ' + tri + ' triangles (max 4000)');
  if (tri > maxTri) maxTri = tri;
  if (n > maxDraw) fail(tag + ': ' + n + ' draw calls (max ' + maxDraw + ')');
  // swapping the look on a live rig must give a valid rig again
  try { ch.setLook(Models.character ? Look.resolve(Look.DEFAULT) : r); ch.setLook(r); } catch (e2) { fail(tag + ': setLook threw ' + e2.message); }
  built++;
}

/* ---- every option alone (base = bare look so nothing else interferes) */
var base = { skin: 0, hairStyle: 'short', hair: 0, eyes: 0, nose: 'none', hat: 'none', acc: [], top: 'tee', topColor: 0, bottom: 'pants', pantsColor: 0 };
function variant(f, v) { var l = JSON.parse(JSON.stringify(base)); l[f] = v; return l; }
['skin', 'hair', 'eyes', 'topColor', 'pantsColor'].forEach(function (f) { var list = f === 'topColor' ? PAL.top : f === 'pantsColor' ? PAL.pants : PAL[f]; list.forEach(function (c, i) { checkLook(variant(f, i), f + '#' + i); }); });
['hairStyle', 'nose', 'hat', 'top', 'bottom'].forEach(function (f) { IDS[f].forEach(function (id) { checkLook(variant(f, id), f + ':' + id); }); });
IDS.acc.forEach(function (a) { checkLook(variant('acc', [a]), 'acc:' + a); });
checkLook(Look.DEFAULT, 'default');
/* every hat x every hair style x every accessory (pairwise with the hat) - covers the hair-hiding rules */
IDS.hat.forEach(function (h) { IDS.hairStyle.forEach(function (s) { IDS.acc.forEach(function (a) { var l = JSON.parse(JSON.stringify(base)); l.hat = h; l.hairStyle = s; l.acc = [a]; checkLook(l, 'combo ' + h + '/' + s + '/' + a); }); }); });

/* ---- presets, random, toggles */
Look.presets.forEach(function (p, i) { if (!p.name) fail('preset ' + i + ' has no name'); checkLook(p.look, 'preset ' + i + ' ' + p.name); });
var seed = 12345; function rng() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
for (var i = 0; i < 400; i++) checkLook(Look.random(rng), 'random#' + i);
var t = Look.toggleAcc(Look.toggleAcc(Look.toggleAcc(Look.validate(base), 'glasses'), 'scarf'), 'backpack');
if (t.acc.length !== 2 || t.acc.indexOf('glasses') >= 0) fail('toggleAcc does not drop the oldest accessory');
if (Look.toggleAcc(Look.setHat(base, 'beanie'), 'bow').hat !== 'none') fail('head-top accessory must clear the hat');
if (Look.setHat(Look.toggleAcc(base, 'headband'), 'cap').acc.length) fail('hat must drop head-top accessories');

/* ---- bad input never throws and falls back to the default look */
['', null, undefined, 'x', '1', '1zzzzzzzzzzzz', new Array(100).join('1'), '2abcdefghijkl', '{"a":1}'].forEach(function (s) {
  var l; try { l = Look.decode(s); } catch (e) { fail('decode threw on ' + s); return; }
  if (!l || !Look.encode(l)) fail('decode returned junk for ' + s);
});

console.log('look_check: ' + built + ' looks built, ' + fails + ' failure(s), max ' + maxTri + ' triangles');
process.exit(fails ? 1 : 0);
