/* Togie Valley - rain_fx.js (Round 3 stage 12): world-space rain. Game.RainFx.build() is called by Weather.build().
 * Draw call 1: instanced streak quads (fixed world positions inside a 28x28x14 box that wraps around the camera, so the camera travels through the rain;
 * fall, wrap, slant, per-drop speed/length all in the vertex shader). Drops stop at the ground (water -0.12), or at the roof height over house/shop/workshop/stall tiles.
 * Draw call 2: flat splash rings on ground/water near the camera (world-fixed too). Both read a tile mask texture (R roofed, G water). No per-frame allocations, outdoor only.
 * Amount = Game.Weather.rain (eased 0..1); count scales with Perf.density.particle. Needs vertex texture fetch (all WebGL1 phones have it).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Scenes || !G.Loop || !G.util) { console.error('[rain_fx] missing deps'); return; }
  var R = G.Render, F = { built: false, drops: 700, rings: 40, calls: 2 }, mesh = null, ring = null, mask = null, tint = new THREE.Color(), cen = new THREE.Vector3();
  var SPAN = 28, HIGH = 14, ROOF = 4.0;

  var MASK_GLSL = [
    'uniform sampler2D uMask; uniform vec2 uMapSize;',
    'vec2 maskAt(vec2 xz) { return texture2D(uMask, (floor(xz) + 0.5) / uMapSize).rg; }'
  ].join('\n');
  var VS_DROP = [
    'uniform vec3 uCenter; uniform float uTime; uniform vec3 uRight; uniform float uSpan; uniform float uH; uniform float uRoof; uniform vec2 uSize; uniform vec2 uSlant;',
    MASK_GLSL,
    'attribute vec4 aSeed; varying float vA;',
    'void main() {',
    '  vec2 c = uCenter.xz; vec2 p = aSeed.xy * uSpan;',
    '  vec2 base = c + mod(p - c + uSpan * 0.5, uSpan) - uSpan * 0.5;',
    '  float sp = 13.0 + aSeed.z * 7.0; float len = uSize.y * (0.6 + aSeed.w * 0.8);',
    '  float yb = uH - mod(aSeed.w * uH * 5.0 + uTime * sp, uH);',   // lowest point of the streak
    '  vec2 hit = base + uSlant * (uH - yb);',                       // slanted path: same point seen at yb
    '  vec2 m = maskAt(hit); float g = m.r > 0.5 ? uRoof : (m.g > 0.5 ? -0.12 : 0.0);',
    '  float yt = yb + len; float t = position.y + 0.5;',
    '  float ya = max(yb, g); float yy = mix(ya, yt, t);',
    '  vec2 xz = base + uSlant * (uH - yy);',
    '  vec3 pos = vec3(xz.x, yy, xz.y) + uRight * position.x * uSize.x;',
    '  if (yt < g + 0.02) pos = vec3(0.0, -50.0, 0.0);',            // fully below ground / roof: gone
    '  vec2 e = abs((base - c) / uSpan) * 2.0; vA = 1.0 - smoothstep(0.78, 1.0, max(e.x, e.y));',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);',
    '}'
  ].join('\n');
  var FS_DROP = 'precision mediump float;\nuniform vec3 uColor; uniform float uAlpha; varying float vA;\nvoid main() { gl_FragColor = vec4(uColor, uAlpha * 0.6 * vA); }';
  var VS_RING = [
    'uniform vec3 uCenter; uniform float uTime; uniform float uSpan;',
    MASK_GLSL,
    'attribute vec3 aSeed; varying vec2 vUv; varying float vPh; varying float vA;',
    'float h(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main() {',
    '  float cyc = uTime * 1.1 + aSeed.z * 7.0; float n = floor(cyc); float ph = fract(cyc);',
    '  vec2 r = vec2(h(vec2(n, aSeed.x * 91.0)), h(vec2(aSeed.y * 57.0, n)));',
    '  vec2 c = uCenter.xz; vec2 p = r * uSpan;',
    '  vec2 xz = c + mod(p - c + uSpan * 0.5, uSpan) - uSpan * 0.5;',   // world-fixed during one splash
    '  vec2 m = maskAt(xz); float rad = (m.g > 0.5 ? 0.10 : 0.06) + ph * (m.g > 0.5 ? 0.30 : 0.18);',
    '  vec3 pos = vec3(xz.x + position.x * rad * 2.0, m.g > 0.5 ? -0.09 : 0.04, xz.y + position.y * rad * 2.0);',
    '  if (m.r > 0.5) pos = vec3(0.0, -50.0, 0.0);',                  // never under a roof
    '  vec2 e = abs((xz - c) / uSpan) * 2.0; vA = 1.0 - smoothstep(0.5, 0.75, max(e.x, e.y));',
    '  vUv = position.xy + 0.5; vPh = ph;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);',
    '}'
  ].join('\n');
  var FS_RING = 'precision mediump float;\nuniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying float vPh; varying float vA;\nvoid main() { float d = length(vUv - 0.5) * 2.0; if (d > 1.0 || d < 0.7) discard; gl_FragColor = vec4(uColor, uAlpha * (1.0 - vPh) * 0.75 * vA); }';

  function geo(n, seed, comps) {
    var g = new THREE.InstancedBufferGeometry(), rnd = G.util.rng(seed), a = new Float32Array(n * comps), i;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    for (i = 0; i < a.length; i++) a[i] = rnd();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, comps)); g.instanceCount = n;
    return g;
  }
  function make(name, g, vs, fs, u) {
    u.uCenter = { value: new THREE.Vector3() }; u.uTime = { value: 0 }; u.uColor = { value: new THREE.Color(1, 1, 1) }; u.uAlpha = { value: 0 };
    u.uMask = { value: mask }; u.uMapSize = { value: new THREE.Vector2(mask.image.width, mask.image.height) };
    var m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.name = name; m.frustumCulled = false; m.visible = false; m.raycast = function () {}; m.renderOrder = 20;
    R.scene.add(m); G.Scenes.outdoorOnly(m);
    return m;
  }
  function buildMask() {
    var rows = G.WorldMap && G.WorldMap.rows, W = rows[0].length, H = rows.length, d = new Uint8Array(W * H * 4), x, z, t, i;
    for (z = 0; z < H; z++) for (x = 0; x < W; x++) {
      t = G.World.tileType(x + 0.5, z + 0.5); i = (z * W + x) * 4;
      d[i] = (t === 'house' || t === 'shop' || t === 'workshop' || t === 'stall') ? 255 : 0;   // roofed
      d[i + 1] = t === 'water' ? 255 : 0; d[i + 3] = 255;
    }
    mask = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    mask.magFilter = mask.minFilter = THREE.NearestFilter; mask.generateMipmaps = false; mask.flipY = false; mask.needsUpdate = true;
  }

  F.build = function () {
    if (F.built) return F;
    if (!G.World || !G.WorldMap) { console.error('[rain_fx] missing World'); return F; }
    F.built = true; buildMask();
    mesh = make('wx_rain', geo(F.drops, 7101, 4), VS_DROP, FS_DROP, { uRight: { value: new THREE.Vector3() }, uSpan: { value: SPAN }, uH: { value: HIGH }, uRoof: { value: ROOF }, uSize: { value: new THREE.Vector2(0.022, 0.7) }, uSlant: { value: new THREE.Vector2(0.09, 0.04) } });
    ring = make('wx_splash', geo(F.rings, 7103, 3), VS_RING, FS_RING, { uSpan: { value: 18 } });
    G.Loop.onFrame(update, 11.5);
    return F;
  };

  function update() {
    if (!F.built) return;
    var Wx = G.Weather, r = Wx ? Wx.rain : 0, on = r > 0.01 && G.Scenes.current === 'outdoor';
    mesh.visible = ring.visible = on;
    if (!on) return;
    var pd = G.Perf ? G.Perf.density.particle : 1, U = R.uniforms, cp = R.camera.position, fo = R.rig.focus, u = mesh.material.uniforms, v = ring.material.uniforms, lv;
    mesh.geometry.instanceCount = Math.ceil(F.drops * pd); ring.geometry.instanceCount = Math.ceil(F.rings * pd * (pd < 0.4 ? 0.5 : 1));
    cen.set((cp.x + fo.x) * 0.5, 0, (cp.z + fo.z) * 0.5);   // box wraps around the camera, biased toward what it looks at
    R.rig.getRight(u.uRight.value);
    tint.copy(U.uAmbient.value).add(U.uLightColor.value);
    lv = Math.min(1, (tint.r * 0.3 + tint.g * 0.59 + tint.b * 0.11) * 1.15 + 0.2);
    u.uCenter.value.copy(cen); u.uTime.value = G.Loop.realTime; u.uAlpha.value = r; u.uColor.value.setRGB(0.80 * lv, 0.88 * lv, 0.98 * lv);
    cen.set(G.Player.pos.x, 0, G.Player.pos.z);              // splashes: near the player
    v.uCenter.value.copy(cen); v.uTime.value = G.Loop.realTime; v.uAlpha.value = r; v.uColor.value.setRGB(0.85 * lv, 0.92 * lv, 1.0 * lv);
  }

  F.stats = function () { return { built: F.built, drops: F.drops, rings: F.rings, calls: F.calls, box: [SPAN, HIGH, SPAN] }; };
  G.RainFx = F;
})();
