/* Togie Valley - weather.js (Stage 11): weather visuals. Game.Weather.build() once (after Ambient.build).
 * Snow dots (1 instanced-quad draw call), animated on the GPU. Rain streaks + splashes live in rain_fx.js (Round 3 stage 12), built from build().
 * A gray-blue dim of sky / fog / ambient / sun is applied by wrapping Render.setTimeOfDay (eased, so weather fades in and out).
 * Falling petals (spring) and leaves (autumn) already live in ambient.js (Stage 10.5); they hide in rain/snow.
 * API: `rain`, `snow`, `dim` (current eased 0..1 amounts), `enabled`, `stats()`. Event `weather:changed {weather}` on day start / load.
 * Added draw calls: +1 (snow) while active, +2 rain_fx (hidden otherwise). Outdoor only (Scenes.outdoorOnly).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Time || !G.Player || !G.Scenes || !G.Loop) { console.error('[weather] missing deps'); return; }
  var R = G.Render, W = { enabled: true, rain: 0, snow: 0, dim: 0, group: null }, NS = 260;
  var meshes = {}, tint = new THREE.Color(), right = new THREE.Vector3(), dirty = true, tmp = new THREE.Color();

  /* ---------------------------------------------------------------- shaders */
  var VS_FALL = [
    'uniform vec3 uCenter; uniform float uTime; uniform vec3 uRight; uniform float uSpan; uniform float uH; uniform vec2 uSize; uniform float uSpeed; uniform float uFlutter; uniform float uSlant;',
    'attribute vec3 aSeed; varying vec2 vUv;',
    'void main() {',
    '  vec2 p = aSeed.xy * uSpan; vec2 c = uCenter.xz;',
    '  vec2 xz = c + mod(p - c + uSpan * 0.5, uSpan) - uSpan * 0.5;',
    '  float sp = uSpeed * (0.8 + aSeed.z * 0.4);',
    '  float y = uH - mod(aSeed.z * uH * 7.0 + uTime * sp, uH);',
    '  xz += uFlutter * vec2(sin(uTime * 1.3 + aSeed.z * 40.0), cos(uTime * 1.1 + aSeed.x * 30.0));',
    '  vec3 pos = vec3(xz.x, y, xz.y) + uRight * position.x * uSize.x + vec3(0.0, 1.0, 0.0) * position.y * uSize.y;',
    '  pos.x += position.y * uSize.y * uSlant;',
    '  vUv = position.xy + 0.5;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);',
    '}'
  ].join('\n');
  var FS_SNOW = 'precision mediump float;\nuniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;\nvoid main() { if (length(vUv - 0.5) > 0.5) discard; gl_FragColor = vec4(uColor, uAlpha); }';
  var VS_RIP = [
    'uniform vec3 uCenter; uniform float uTime; uniform float uSpan;',
    'attribute vec3 aSeed; varying vec2 vUv; varying float vPh;',
    'float h(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main() {',
    '  float cyc = uTime * 0.9 + aSeed.z * 7.0; float n = floor(cyc); float ph = fract(cyc);',
    '  vec2 r = vec2(h(vec2(n, aSeed.x * 91.0)), h(vec2(aSeed.y * 57.0, n)));',
    '  vec2 xz = uCenter.xz + (r - 0.5) * uSpan;',
    '  float rad = 0.06 + ph * 0.3;',
    '  vec3 pos = vec3(xz.x + position.x * rad * 2.0, 0.05, xz.y + position.y * rad * 2.0);',
    '  vUv = position.xy + 0.5; vPh = ph;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);',
    '}'
  ].join('\n');
  var FS_RIP = 'precision mediump float;\nuniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying float vPh;\nvoid main() { float d = length(vUv - 0.5) * 2.0; if (d > 1.0 || d < 0.68) discard; gl_FragColor = vec4(uColor, uAlpha * (1.0 - vPh) * 0.8); }';

  function quad() {
    var g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    return g;
  }
  function seeds(g, n, seed) {
    var rnd = G.util.rng(seed), a = new Float32Array(n * 3);
    for (var i = 0; i < a.length; i++) a[i] = rnd();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 3)); g.instanceCount = n;
  }
  function make(name, vs, fs, n, seed, u) {
    var g = quad(); seeds(g, n, seed);
    u.uCenter = { value: new THREE.Vector3() }; u.uTime = { value: 0 }; u.uColor = { value: new THREE.Color(1, 1, 1) }; u.uAlpha = { value: 0 };
    var m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.name = name; m.frustumCulled = false; m.visible = false; m.raycast = function () {}; m.renderOrder = 20;
    R.scene.add(m); G.Scenes.outdoorOnly(m);
    return m;
  }

  /* ---------------------------------------------------------------- dim (wraps Render.setTimeOfDay) */
  function lum(c) { return c.r * 0.3 + c.g * 0.59 + c.b * 0.11; }
  function dimColor(c, k, mix, mul) {
    var l = lum(c); tmp.setRGB(l * 0.95, l * 1.0, l * 1.1);
    c.lerp(tmp, mix * k); c.multiplyScalar(1 - mul * k);
  }
  function applyDim() {
    var k = W.dim; if (k <= 0.001) { R.skyGlow = 1; return; }
    var U = R.uniforms, snowy = W.snow > W.rain;
    dimColor(U.uSkyTop.value, k, snowy ? 0.45 : 0.6, snowy ? 0.04 : 0.2);
    dimColor(U.uSkyHorizon.value, k, snowy ? 0.5 : 0.65, snowy ? 0.02 : 0.16);
    U.uFogColor.value.copy(U.uSkyHorizon.value);
    dimColor(U.uAmbient.value, k, 0.2, snowy ? 0.02 : 0.1);
    dimColor(U.uLightColor.value, k, 0.35, snowy ? 0.2 : 0.4);
    // Stage 40 mood: rain = cool desaturated blue-grey, snow = soft pale blue; shade tint turns bluer, sky glow fades
    U.uMood.value.r += ((snowy ? 0.98 : 0.90) - U.uMood.value.r) * k; U.uMood.value.g += ((snowy ? 1.01 : 0.97) - U.uMood.value.g) * k; U.uMood.value.b += ((snowy ? 1.08 : 1.06) - U.uMood.value.b) * k;
    U.uShadowTint.value.r -= 0.06 * k; U.uShadowTint.value.g -= 0.03 * k;
    R.skyGlow = 1 - k * 0.9;
  }
  var origSet = R.setTimeOfDay;
  R.setTimeOfDay = function (t) { origSet.call(R, t); applyDim(); };

  /* ---------------------------------------------------------------- build / frame */
  W.build = function () {
    if (W.group) return W;
    W.group = true;
    var us = {};
    if (G.RainFx) G.RainFx.build();
    us.uRight = { value: right }; us.uSpan = { value: 26 }; us.uH = { value: 10 }; us.uSize = { value: new THREE.Vector2(0.075, 0.075) }; us.uSpeed = { value: 1.25 }; us.uFlutter = { value: 0.35 }; us.uSlant = { value: 0 };
    meshes.snow = make('wx_snow', VS_FALL, FS_SNOW, NS, 7102, us);
    G.Loop.onFrame(update, 11);
    G.Events.on('day:started', function (p) { dirty = true; G.Events.emit('weather:changed', { weather: (p && p.weather) || G.Time.weather }); });
    G.Events.on('save:loaded', function () { dirty = true; });
    G.Events.on('save:reset', function () { dirty = true; });
    return W;
  };

  function update(dt) {
    if (!W.enabled || !W.group) return;
    var wx = G.Time.weather, tr = wx === 'rain' ? 1 : 0, ts = wx === 'snow' ? 1 : 0, k = 1 - Math.exp(-1.2 * dt);
    W.rain += (tr - W.rain) * k; W.snow += (ts - W.snow) * k;
    if (W.rain < 0.004 && !tr) W.rain = 0; if (W.snow < 0.004 && !ts) W.snow = 0;
    var td = Math.max(W.rain * 1.0, W.snow * 0.55), prev = W.dim;
    W.dim += (td - W.dim) * k; if (Math.abs(W.dim - td) < 0.003) W.dim = td;
    if (W.dim !== prev || dirty) { dirty = false; R.setTimeOfDay(R.getTimeOfDay()); }

    var T = G.Loop.realTime, P = G.Player.pos, U = R.uniforms, outdoors = G.Scenes.current === 'outdoor';
    var r = W.rain, s = W.snow, m;
    meshes.snow.visible = outdoors && s > 0.01;
    if (!outdoors || (r <= 0.01 && s <= 0.01)) return;
    var pdn = G.Perf ? G.Perf.density.particle : 1;   // Stage 14B: fewer streaks / flakes on low tiers
    meshes.snow.geometry.instanceCount = Math.ceil(NS * pdn);
    R.rig.getRight(right); right.y = 0; right.normalize();
    tint.copy(U.uAmbient.value).add(U.uLightColor.value);
    var lv = Math.min(1, lum(tint) * 1.15 + 0.2);
    for (m in meshes) {
      var u = meshes[m].material.uniforms;
      u.uCenter.value.set(P.x, 0, P.z); u.uTime.value = T;
    }
    meshes.snow.material.uniforms.uAlpha.value = s; meshes.snow.material.uniforms.uColor.value.setRGB(1.0 * lv, 1.0 * lv, 1.0 * lv);
  }

  W.stats = function () { return { rain: W.rain, snow: W.snow, dim: W.dim, flakes: NS }; };
  G.Weather = W;
})();
