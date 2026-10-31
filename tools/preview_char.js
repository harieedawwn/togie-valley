#!/usr/bin/env node
/* Togie Valley - tools/preview_char.js (stage 15A). Exports merged character geometry (world-baked, default pose) for every default
 * hair style to JSON for tools/preview_char.py. Usage: node tools/preview_char.js out.json */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.resolve(__dirname, '..');
var THREE = require(path.join(root, 'vendor', 'three.min.js'));
var sb = { console: console, THREE: THREE, Math: Math };
sb.window = sb;
sb.Game = { util: {}, Events: { on: function () { return function () {}; }, emit: function () {} },
  Render: { addSmoothNormals: function () {}, toonMaterial: function () { return { uniforms: {} }; }, addBlobShadow: function () { return { remove: function () {} }; },
    addOutline: function (m) { var h = new THREE.Mesh(m.geometry, {}); h.name = 'outline'; m.userData.outline = h; m.add(h); return h; } } };
vm.createContext(sb);
['js/look.js', 'js/head_model.js', 'js/models.js', 'js/char_kit.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f }); });
var Look = sb.Game.Look, Models = sb.Game.Models, out = [];
Look.IDS.hairStyle.forEach(function (hs) {
  [null, 'straw'].forEach(function (hat) {
    var l = JSON.parse(JSON.stringify(Look.DEFAULT)); l.hairStyle = hs; l.hat = hat || 'none';
    var ch = Models.character({ look: Look.resolve(l), shadow: false }), g = ch.root || ch.group || ch.object;
    g.updateMatrixWorld(true);
    var pos = [], col = [], idx = [], base = 0;
    g.traverse(function (m) {
      if (!m.isMesh || m.name === 'outline' || m.visible === false) return;
      for (var p = m.parent; p; p = p.parent) if (p.visible === false) return;
      var geo = m.geometry, P = geo.attributes.position, C = geo.attributes.color, v = new THREE.Vector3(), i;
      if (!P || !P.count) return;
      for (i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)); col.push(C.getX(i), C.getY(i), C.getZ(i)); }
      for (i = 0; i < (geo.index ? geo.index.count : P.count); i++) idx.push(base + (geo.index ? geo.index.getX(i) : i));
      base += P.count;
    });
    out.push({ name: hs + (hat ? '+hat' : ''), hairStyle: hs, hat: !!hat, pos: pos, col: col.map(function (x) { return +x.toFixed(3); }), idx: idx });
  });
});
Look.presets.forEach(function (pr, n) {   // stage 16: the 12 ready-made outfits for the preset contact sheets
  var ch = Models.character({ look: Look.resolve(pr.look), shadow: false }), g = ch.root;
  g.updateMatrixWorld(true);
  var pos = [], col = [], idx = [], base = 0;
  g.traverse(function (m) {
    if (!m.isMesh || m.name === 'outline' || m.visible === false) return;
    for (var p = m.parent; p; p = p.parent) if (p.visible === false) return;
    var geo = m.geometry, P = geo.attributes.position, C = geo.attributes.color, v = new THREE.Vector3(), i;
    if (!P || !P.count) return;
    for (i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)); col.push(C.getX(i), C.getY(i), C.getZ(i)); }
    for (i = 0; i < (geo.index ? geo.index.count : P.count); i++) idx.push(base + (geo.index ? geo.index.getX(i) : i));
    base += P.count;
  });
  out.push({ name: 'preset' + n, kind: 'preset', hat: null, pos: pos, col: col.map(function (x) { return +x.toFixed(3); }), idx: idx });
});
if (process.argv[3]) {   // stage 17: posed contact-sheet frames (tools/anim_sample.js --frames): pony + scarf + backpack look, ground quad, pose + swing-foot lift applied
  var fr = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), sheets = {};
  ['walk', 'cast'].forEach(function (kind) {
    sheets[kind] = fr[kind].map(function (p) {
      var l = JSON.parse(JSON.stringify(Look.DEFAULT)); l.hairStyle = 'pony'; l.hat = 'none'; l.acc = ['scarf', 'backpack'];
      var ch = Models.character({ look: Look.resolve(l), shadow: false }), g = ch.root;
      Models.Anim.apply(ch, p); ch.joints.hipL.position.y = p.liftL; ch.joints.hipR.position.y = p.liftR;
      if (p.rod) g.position.y = 0.2;   // seated: Player lifts the hips by about sitY
      g.updateMatrixWorld(true);
      var pos = [], col = [], idx = [], base = 0, i;
      g.traverse(function (m) {
        if (!m.isMesh || m.name === 'outline' || m.visible === false) return;
        for (var q = m.parent; q; q = q.parent) if (q.visible === false) return;
        var geo = m.geometry, P = geo.attributes.position, C = geo.attributes.color, v = new THREE.Vector3();
        if (!P || !P.count) return;
        for (i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)); col.push(C.getX(i), C.getY(i), C.getZ(i)); }
        for (i = 0; i < (geo.index ? geo.index.count : P.count); i++) idx.push(base + (geo.index ? geo.index.getX(i) : i));
        base += P.count;
      });
      var gy = p.rod ? -0.0 : 0, gnd = [[-0.9, gy, -0.7], [0.9, gy, -0.7], [0.9, gy, 0.7], [-0.9, gy, 0.7]];   // ground quad (cast frames: the seated hips float, ground still at y 0)
      gnd.forEach(function (v) { pos.push(v[0], v[1] - 0.001, v[2]); col.push(0.55, 0.8, 0.4); });
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      return { label: p.label, pos: pos, col: col.map(function (x) { return +x.toFixed(3); }), idx: idx };
    });
  });
  fs.writeFileSync(process.argv[2].replace(/\.json$/, '') + '_frames.json', JSON.stringify(sheets)); console.log('exported posed frames');
}
fs.writeFileSync(process.argv[2] || 'preview_char.json', JSON.stringify(out));
console.log('exported ' + out.length + ' characters');
