#!/usr/bin/env node
/* Togie Valley - tools/render_icon_character.js (Round 4, stage ICON 1).
 * Renders the app-icon hero (the game's own Models.character + toon material + ink outline) with REAL three.js r128 in headless Chromium
 * (Playwright, WebGL via SwiftShader). Route A variant: headless-gl could not be installed (npm cannot fetch its prebuilt binary here).
 * Usage: node tools/render_icon_character.js [outDir=icons/src] [pick=A]      (needs: npm i playwright / chromium; Python Pillow for the sheet)
 * Writes: character.png (1024, transparent), character_mask.png (white silhouette), candidates.png (4 variants at 256 on cream).
 * Dev-only tool: not loaded by the game. */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.resolve(__dirname, '..');
var outDir = path.resolve(process.argv[2] || path.join(root, 'icons', 'src'));
var PICK = process.argv[3] || 'A';
var SIZE = 2048, OUT = 1024;
var SCRIPTS = ['vendor/three.min.js', 'js/core.js', 'js/render.js', 'js/look.js', 'js/head_model.js', 'js/models.js', 'js/char_kit.js'];

/* The four candidates: look + pose + camera yaw (radians, positive turns the character toward the viewer's left). */
var VARIANTS = {
  A: { look: { skin: 1, hairStyle: 'bob', hair: 2, eyes: 0, nose: 'dot', hat: 'la', acc: ['flower'], top: 'baba', topColor: 3, bottom: 'pants', pantsColor: 2 }, pose: 'wave', yaw: 0.5 },
  B: { look: { skin: 1, hairStyle: 'twin', hair: 2, eyes: 0, nose: 'dot', hat: 'straw', acc: ['scarf'], top: 'overalls', topColor: 0, bottom: 'pants', pantsColor: 0 }, pose: 'wave', yaw: 0.5 },
  C: { look: { skin: 1, hairStyle: 'twin', hair: 2, eyes: 0, nose: 'dot', hat: 'straw', acc: ['flower'], top: 'overalls', topColor: 6, bottom: 'pants', pantsColor: 0 }, pose: 'carrot', yaw: -0.5 },
  D: { look: { skin: 1, hairStyle: 'bob', hair: 2, eyes: 0, nose: 'dot', hat: 'la', acc: ['scarf'], top: 'baba', topColor: 1, bottom: 'pants', pantsColor: 7 }, pose: 'carrot', yaw: -0.5 }
};

/* Runs inside the page. Builds one variant and returns a PNG data URL of the given size. */
function pageRender(args) {
  var V = args.v, size = args.size, G = window.Game, Models = G.Models, Look = G.Look, U = G.Render.uniforms;
  var cv = document.createElement('canvas'); cv.width = cv.height = size;
  var gl = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1); gl.setSize(size, size, false); gl.setClearColor(0x000000, 0);
  U.uResolution.value.set(size, size);
  U.uOutline.value = G.Config.render.outlineWidth * size / 400;   // game ratio is about size/700; icons need a bolder ink line to survive 48 px
  U.uHalftone.value.y = 0;                                         // no halftone dots on an icon
  U.uLightDir.value.set(-0.2, 0.65, 0.9).normalize();
  U.uFogRange.value.set(1e5, 2e5);
  var ch = Models.character({ look: Look.resolve(Look.validate(V.look)), shadow: false }), J = ch.joints, P = {}, A = Models.Anim;
  A.reset(P);
  // shared warm stance: weight on the left leg, right knee soft, hips swayed, head tilted + turned to the viewer
  P.bob = -0.01; P.hipsRZ = 0.07; P.hipsRY = 0.0; P.spineRZ = -0.05; P.spineRX = 0.03;
  P.headRZ = 0.16; P.headRX = -0.06; P.headRY = -V.yaw * 0.55;
  P.legLX = -0.02; P.legRX = 0.22;
  if (V.pose === 'wave') { P.armRX = 2.15; P.armRZ = 1.0; P.armLX = 0.1; P.armLZ = 0.16; P.headRZ = 0.2; }
  else { P.armRX = 0.15; P.armRZ = 0.2; P.armLX = 1.0; P.armLZ = -0.12; }
  A.apply(ch, P);
  J.hipR.position.y = 0.03; J.hipR.position.z = 0.02;
  ch.root.rotation.y = V.yaw; ch.root.updateMatrixWorld(true);
  if (V.pose === 'carrot') {   // little carrot in the raised hand (vertex-coloured, toon + ink like everything else)
    var parts = [], mk = function (geo, col) { var n = geo.attributes.position.count, c = new Float32Array(n * 3), k = new THREE.Color(col), i; for (i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };
    var body = new THREE.ConeGeometry(0.07, 0.26, 10); body.rotateX(Math.PI); body.translate(0, 0.08, 0);   // tip down? (tip toward +y after flip is handled below)
    body = mk(body, 0xf4923a);
    var tuft = new THREE.Group(), cg = new THREE.ConeGeometry(0.03, 0.1, 6);
    var leaf = function (rz, c) { var g = mk(cg.clone(), c); g.translate(0, 0.05, 0); g.rotateZ(rz); g.translate(0, 0.21, 0); return g; };
    var geos = [body, leaf(0, 0x6fcf6a), leaf(0.5, 0x8fe08a), leaf(-0.5, 0x5cbf5a)];
    var mats = G.Models.material('char');
    geos.forEach(function (g) { g.computeVertexNormals(); var m = new THREE.Mesh(g, mats); G.Render.addOutline(m, true); tuft.add(m); });
    ch.attach.handL.add(tuft); tuft.position.set(0, 0, 0);
    var qw = new THREE.Quaternion(); ch.attach.handL.getWorldQuaternion(qw);   // keep the carrot upright in the world, leaning a little toward the viewer
    tuft.quaternion.copy(qw).invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, -0.3)));
    var up = new THREE.Vector3(0, -0.14, 0.04).applyQuaternion(tuft.quaternion); tuft.position.copy(up);
  }
  var scene = new THREE.Scene(); scene.add(ch.root); ch.root.updateMatrixWorld(true);
  // frame: bounding box of the fills (outlines excluded), square, centred, slightly above the feet-centre
  var box = new THREE.Box3(), tmp = new THREE.Box3();
  ch.root.traverse(function (o) { if (o.isMesh && o.name !== 'outline' && o.geometry.attributes.position.count && o.visible) { tmp.setFromObject(o); box.union(tmp); } });
  var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), fov = 18, h = Math.max(sz.y, sz.x * 1.05) / args.fill;
  var cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 100), dist = h / 2 / Math.tan(fov * Math.PI / 360);
  var el = 0.17, d2 = dist + sz.z / 2; cam.position.set(c.x, c.y + d2 * Math.sin(el), c.z + d2 * Math.cos(el)); cam.lookAt(c.x, c.y, c.z);   // 10 deg from above: the hat brim opens up
  U.uFadeCam.value.copy(cam.position);
  gl.render(scene, cam);
  var out = cv.toDataURL('image/png'), nCalls = gl.info.render.calls;
  gl.dispose();
  return { url: out, calls: nCalls };
}

(async function () {
  var pw = require('playwright'), browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  var page = await browser.newPage();
  page.on('pageerror', function (e) { console.error('PAGEERR', e.message); });
  page.on('console', function (m) { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await page.goto('about:blank');
  for (var i = 0; i < SCRIPTS.length; i++) await page.addScriptTag({ path: path.join(root, SCRIPTS[i]) });
  await page.evaluate('window.__r = ' + pageRender.toString());
  fs.mkdirSync(outDir, { recursive: true });
  var names = Object.keys(VARIANTS), res = {}, k, raw = path.join(outDir, '_raw'); fs.mkdirSync(raw, { recursive: true });
  for (k = 0; k < names.length; k++) {
    var size = (names[k] === PICK) ? SIZE : 512;
    var r = await page.evaluate(function (a) { return window.__r(a); }, { v: VARIANTS[names[k]], size: size, fill: 0.9 });
    var buf = Buffer.from(r.url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(raw, names[k] + '.png'), buf);
    res[names[k]] = r.calls;
  }
  await browser.close();
  console.log('rendered (draw calls)', JSON.stringify(res));
  var pr = require('child_process').spawnSync('python3', ['-I', path.join(__dirname, 'render_icon_character.py'), outDir, PICK, String(OUT)], { stdio: 'inherit' });
  if (pr.status !== 0) process.exit(1);
})().catch(function (e) { console.error(e); process.exit(1); });
