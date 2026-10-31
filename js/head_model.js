/* Togie Valley - head_model.js (Round 3 stage 15B): Game.HeadModel, procedural chibi head kit.
 * Pure geometry (THREE only, no per-frame work). The head is one smooth ellipsoid (a little wider at the cheeks, narrower at the chin);
 * hair cap, ears and every face feature are built ON that surface (HM.point), so nothing floats or clips.
 * Returned parts are plain {geo, color, matrix} objects for Models.mergeParts; color 'vertex' = use the geometry's own colour attribute.
 * Head-local space: origin = neck joint (Models head group), +z = face, +x = character's left. Load before models.js.
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || !window.Game) { console.error('[head_model] THREE or Game missing'); return; }
  var HM = window.Game.HeadModel = {};
  var CY = 0.21, RX = 0.255, RY = 0.22, RZ = 0.245, PI = Math.PI, TAU = PI * 2;
  var NRM = [0, 0, 1], RGB = [0, 0, 0], _c = new THREE.Color(), IDM = new THREE.Matrix4();
  HM.CY = CY; HM.RX = RX; HM.RY = RY; HM.RZ = RZ;
  HM.SHADE = { top: 0.12, cheek: 0.24, under: 0.07, hairTop: 0.2, hairLow: 0.14 };   // soft vertex-colour shading strengths (stage 15B shading)

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function gauss(x, c, s) { var d = (x - c) / s; return Math.exp(-d * d); }
  function hex3(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  var WHITE = [1, 1, 1], PEACH = hex3(0xf08f7e);

  /* ------------------------------------------------------------- surface */
  // Point on the head surface for direction (dx,dy,dz), pushed out along the surface normal by off. Writes out[0..2] and NRM.
  function surf(dx, dy, dz, off, out) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, b, jaw, sx, sy, sz, nx, ny, nz, nl;
    dx /= l; dy /= l; dz /= l;
    b = gauss(dy, -0.3, 0.5);
    jaw = 1 - 0.12 * smooth(0.35, 1, -dy);
    sx = RX * (1 + 0.08 * b) * jaw; sz = RZ * (1 + 0.03 * b) * jaw; sy = RY * (1 - 0.04 * smooth(0, -1, dy));
    nx = dx / sx; ny = dy / sy; nz = dz / sz; nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    NRM[0] = nx / nl; NRM[1] = ny / nl; NRM[2] = nz / nl;
    out[0] = dx * sx + NRM[0] * off; out[1] = CY + dy * sy + NRM[1] * off; out[2] = dz * sz + NRM[2] * off;
  }
  function ang(yaw, pitch, off, out) { var cp = Math.cos(pitch); surf(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, off, out); }
  HM.point = function (yaw, pitch, off) { var p = [0, 0, 0]; ang(yaw, pitch, off, p); return { p: p, n: [NRM[0], NRM[1], NRM[2]] }; };
  // Matrix: origin on the surface (yaw 0 = face, pitch up positive), local +z = outward, scaled by (sx, sy, sz) along local axes.
  function facing(yaw, pitch, off, sx, sy, sz) {
    var m = new THREE.Matrix4(), p = [0, 0, 0];
    ang(yaw, pitch, off, p);
    m.makeRotationFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')); m.setPosition(p[0], p[1], p[2]); m.scale(new THREE.Vector3(sx, sy, sz));
    return m;
  }
  HM.facing = facing;

  /* -------------------------------------------------------------- colours */
  function skinRGB(base, x, y, z, out) {
    var dx = x / RX, dy = (y - CY) / RY, dz = z / RZ, S = HM.SHADE, r = base[0], g = base[1], b = base[2], t;
    t = S.top * smooth(-0.15, 0.8, dy); r += (1 - r) * t; g += (1 - g) * t; b += (1 - b) * t;                                  // lighter crown
    t = S.cheek * gauss(dy, -0.32, 0.3) * smooth(0.22, 0.7, Math.abs(dx)) * smooth(-0.15, 0.45, dz);                            // warm cheeks
    r += (PEACH[0] - r) * t; g += (PEACH[1] - g) * t; b += (PEACH[2] - b) * t;
    t = 1 - S.under * smooth(-0.4, -0.95, dy); out[0] = r * t; out[1] = g * t * 0.99; out[2] = b * t * 0.985;                  // slightly cooler under the chin
    return out;
  }
  HM.skinFn = function (skin) { var base = hex3(skin); return function (x, y, z) { skinRGB(base, x, y, z, RGB); return _c.setRGB(RGB[0], RGB[1], RGB[2]); }; };
  HM.hairFn = function (hair) {
    var base = hex3(hair);
    return function (x, y, z) {
      var dy = (y - CY) / RY, S = HM.SHADE, t = S.hairTop * smooth(0.2, 1, dy), u = 1 - S.hairLow * smooth(0.1, -0.7, dy);
      return _c.setRGB((base[0] + (1 - base[0]) * t) * u, (base[1] + (1 - base[1]) * t) * u, (base[2] + (1 - base[2]) * t) * u);
    };
  };

  /* ------------------------------------------------------------ geometry */
  function weld(geo) {   // smooth normals welded across seams / poles (position hash)
    var P = geo.attributes.position, N, map = Object.create(null), keys = [], i, k, s, l;
    geo.computeVertexNormals(); N = geo.attributes.normal;
    for (i = 0; i < P.count; i++) {
      k = Math.round(P.getX(i) * 1e4) + '_' + Math.round(P.getY(i) * 1e4) + '_' + Math.round(P.getZ(i) * 1e4); keys.push(k);
      s = map[k] || (map[k] = [0, 0, 0]); s[0] += N.getX(i); s[1] += N.getY(i); s[2] += N.getZ(i);
    }
    for (i = 0; i < P.count; i++) { s = map[keys[i]]; l = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) || 1; N.setXYZ(i, s[0] / l, s[1] / l, s[2] / l); }
    return geo;
  }
  var skinG = null;
  function skinGeo() {
    if (skinG) return skinG;
    var g = new THREE.SphereGeometry(1, 24, 14), P = g.attributes.position, o = [0, 0, 0], i;
    for (i = 0; i < P.count; i++) { surf(P.getX(i), P.getY(i), P.getZ(i), 0, o); P.setXYZ(i, o[0], o[1], o[2]); }
    weld(g);
    // the crown above pitch ~0.65 rad is always under hair / hat: drop those triangles (stage 16 triangle budget)
    var I = g.index.array, keep = [], y0 = CY + RY * 0.6, t, ok;
    for (t = 0; t < I.length; t += 3) { ok = P.getY(I[t]) < y0 || P.getY(I[t + 1]) < y0 || P.getY(I[t + 2]) < y0; if (ok) keep.push(I[t], I[t + 1], I[t + 2]); }
    g.setIndex(keep);
    return (skinG = g);
  }
  HM.skinPart = function (skin) { return { geo: skinGeo(), color: HM.skinFn(skin), matrix: IDM }; };

  // Ears: small rounded ellipsoid + a pinker inner ear, on the sides of the head (hidden by long hair styles, so they are skipped there).
  var G_E8 = null, G_E6 = null;
  HM.earParts = function (skin) {
    var parts = [], s, f = HM.skinFn(skin), inner = mixc(hex3(skin), hex3(0xf08f84), 0.4), ic = new THREE.Color().setRGB(inner[0], inner[1], inner[2]);
    G_E8 = G_E8 || new THREE.SphereGeometry(1, 6, 4); G_E6 = G_E6 || new THREE.SphereGeometry(1, 5, 3);
    for (s = -1; s <= 1; s += 2) {
      parts.push({ geo: G_E8, color: f, matrix: facing(s * 1.6, -0.3, -0.004, 0.036, 0.046, 0.024) });
      parts.push({ geo: G_E6, color: ic, matrix: facing(s * 1.6, -0.3, 0.014, 0.02, 0.028, 0.012) });
    }
    return parts;
  };

  // Hair cap: concentric shell over the head. The rim height follows the style (bangs in front, sideburn locks, longer back for bob / long);
  // the last two rings ease back toward the skin so the edge has no see-through gap.
  function rimOf(style, phi) {
    var a, r, w;
    phi = Math.atan2(Math.sin(phi), Math.cos(phi)); a = Math.abs(phi);
    r = -0.02 + 0.5 * Math.cos(phi);
    r -= 0.08 * gauss(phi, 0.35, 0.35) + 0.05 * gauss(phi, -0.6, 0.3);   // bangs
    r -= 0.45 * gauss(a, 1.22, 0.15);                                      // sideburn locks
    if (style === 'bob' || style === 'long') { w = smooth(0.85, 1.6, a); r += ((style === 'bob' ? -0.85 : -1.2) - r) * w; }
    return r;
  }
  var hairG = Object.create(null);
  function hairGeo(style, hat) {
    var key = style + (hat ? 'h' : ''), g = hairG[key], N = 24, M = style === 'long' ? 6 : style === 'bob' ? 5 : 4, off = hat ? 0.022 : 0.03;
    var pos = [], idx = [], p = [0, 0, 0], j, k, jn, a, b, phi, pitch, o;
    if (g) return g;
    surf(0, 1, 0, off, p); pos.push(p[0], p[1], p[2]);
    for (k = 1; k <= M; k++) for (j = 0; j < N; j++) {
      phi = j / N * TAU; pitch = PI / 2 - (PI / 2 - rimOf(style, phi)) * (k / M);
      o = off * (k === M ? 0.6 : k === M - 1 ? 0.85 : 1);   // r04: rim ring stays above the chord sag of the skin shell (0.18 let skin poke through)
      ang(phi, pitch, o, p); pos.push(p[0], p[1], p[2]);
    }
    for (j = 0; j < N; j++) { jn = (j + 1) % N; idx.push(0, 1 + j, 1 + jn); }
    for (k = 1; k < M; k++) for (j = 0; j < N; j++) {
      jn = (j + 1) % N; a = 1 + (k - 1) * N; b = 1 + k * N;
      idx.push(a + j, b + j, b + jn, a + j, b + jn, a + jn);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return (hairG[key] = weld(g));
  }
  HM.hairPart = function (hair, style, hat) { return { geo: hairGeo(style, hat), color: HM.hairFn(hair), matrix: IDM }; };
  HM.hairOff = function (hat) { return hat ? 0.022 : 0.03; };

  /* --------------------------------------------------------- face decals */
  // Patch hugging the surface: s = {yaw, pitch, ra, rb (angular radii), seg, rings, off, col(t, u, v, x, y, z, out)} -> {geo, color:'vertex', matrix}
  function patch(s) {
    var seg = s.seg, rings = s.rings, n = 1 + seg * rings, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var idx = [], p = [0, 0, 0], c = [0, 0, 0], i = 0, r, k, t, u, v, kn, a, b, geo;
    function put(t, u, v) {
      ang(s.yaw + u * s.ra, s.pitch + v * s.rb, s.off, p);
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; nor[i * 3] = NRM[0]; nor[i * 3 + 1] = NRM[1]; nor[i * 3 + 2] = NRM[2];
      s.col(t, u, v, p[0], p[1], p[2], c); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; i++;
    }
    put(0, 0, 0);
    for (r = 1; r <= rings; r++) for (k = 0; k < seg; k++) { t = r / rings; a = k / seg * TAU; u = Math.cos(a) * t; v = Math.sin(a) * t; put(t, u, v); }
    for (k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + (k + 1) % seg);
    for (r = 1; r < rings; r++) for (k = 0; k < seg; k++) {
      kn = (k + 1) % seg; a = 1 + (r - 1) * seg; b = 1 + r * seg;
      idx.push(a + k, b + k, b + kn, a + k, b + kn, a + kn);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    return { geo: geo, color: 'vertex', matrix: IDM };
  }
  // Strip between edges A and B (arrays of [yaw, pitch]); B lies on the RIGHT of the travel direction seen from outside. flip reverses the winding.
  function ribbon(A, B, off, rgb, flip) {
    var n = A.length, pos = [], nor = [], col = [], idx = [], p = [0, 0, 0], i, e, E = [A, B], a, b, a2, b2, geo;
    for (i = 0; i < n; i++) for (e = 0; e < 2; e++) {
      ang(E[e][i][0], E[e][i][1], off, p); pos.push(p[0], p[1], p[2]); nor.push(NRM[0], NRM[1], NRM[2]); col.push(rgb[0], rgb[1], rgb[2]);
    }
    for (i = 0; i < n - 1; i++) {
      a = 2 * i; b = a + 1; a2 = a + 2; b2 = a + 3;
      if (flip) idx.push(a, b2, b, a, a2, b2); else idx.push(a, b, b2, a, b2, a2);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return { geo: geo, color: 'vertex', matrix: IDM };
  }

  var EYE = { yaw: 0.43, pitch: -0.14, ra: 0.205, rb: 0.3 }, MOUTH_P = -0.58, NOSE_P = -0.28, LASH = [0.17, 0.12, 0.17];
  HM.EYE = EYE;

  function eyeBase(eyes) {   // top darker, bottom a little lighter (glossy)
    var top = mixc(hex3(eyes), [0, 0, 0], 0.25), bot = mixc(hex3(eyes), WHITE, 0.2);
    return function (v, out) { var t = smooth(0.8, -0.9, v); out[0] = top[0] + (bot[0] - top[0]) * t; out[1] = top[1] + (bot[1] - top[1]) * t; out[2] = top[2] + (bot[2] - top[2]) * t; };
  }
  function smilePts(mp, wa, dip, th0) {
    var A = [], B = [], i, s, v, th;
    for (i = 0; i <= 8; i++) {
      s = i / 4 - 1; v = -dip * (1 - s * s); th = th0 * Math.sqrt(Math.max(0, 1 - Math.pow(s, 4))) + 0.002;
      A.push([s * wa, mp + v + th]); B.push([s * wa, mp + v - th]);
    }
    return [A, B];
  }

  function white(t, u, v, x, y, z, out) { out[0] = 1; out[1] = 1; out[2] = 1; }
  // Soft upper lash line: a crescent along the top of the eye, thickest toward the outer corner, with a small flick past the corner.
  function lash(s) {
    var A = [], B = [], n = 10, i, t, th, u, v, w, pk = s > 0 ? 0.2 : 0.8, outer;
    for (i = 0; i <= n; i++) {
      t = i / n; th = (12 + 156 * t) * PI / 180; u = Math.cos(th); v = Math.sin(th); w = 0.03 + 0.17 * gauss(t, pk, 0.33);
      outer = (s > 0 && i === 0) || (s < 0 && i === n);
      if (outer) { u *= 1.2; v += 0.12; w *= 0.4; }
      A.push([s * EYE.yaw + u * 0.96 * EYE.ra, EYE.pitch + v * 0.96 * EYE.rb]); B.push([s * EYE.yaw + u * (1 + w) * EYE.ra, EYE.pitch + v * (1 + w) * EYE.rb]);
    }
    return ribbon(A, B, 0.0075, LASH, false);
  }

  HM.faceParts = function (o) {
    var parts = [], s, nc = mixc(hex3(o.skin), hex3(0xe58f84), 0.42), ncC = new THREE.Color().setRGB(nc[0], nc[1], nc[2]), n = o.nose, base = eyeBase(o.eyes), m, gl;
    var light = mixc(hex3(o.eyes), WHITE, 0.4), skinB = hex3(o.skin), BLUSH = hex3(0xf27f93), SIDE = 0.4;
    for (s = -1; s <= 1; s += 2) {
      parts.push(patch({ yaw: s * EYE.yaw, pitch: EYE.pitch, ra: EYE.ra, rb: EYE.rb, seg: 12, rings: 2, off: 0.004, col: function (t, u, v, x, y, z, out) { base(v, out); } }));
      parts.push(patch({ yaw: s * EYE.yaw, pitch: EYE.pitch - 0.38 * EYE.rb, ra: EYE.ra * 0.78, rb: EYE.rb * 0.5, seg: 10, rings: 1, off: 0.0065,   // soft glow in the lower eye
        col: function (t, u, v, x, y, z, out) { var k, g = [0, 0, 0]; base(-0.38 + 0.5 * v, g); k = (1 - t) * 0.9; out[0] = g[0] + (light[0] - g[0]) * k; out[1] = g[1] + (light[1] - g[1]) * k; out[2] = g[2] + (light[2] - g[2]) * k; } }));
      parts.push(lash(s));
      parts.push(patch({ yaw: s * EYE.yaw - 0.3 * EYE.ra, pitch: EYE.pitch + 0.4 * EYE.rb, ra: 0.075, rb: 0.1, seg: 10, rings: 1, off: 0.0105, col: white }));    // big highlight
      parts.push(patch({ yaw: s * EYE.yaw + 0.4 * EYE.ra, pitch: EYE.pitch - 0.42 * EYE.rb, ra: 0.036, rb: 0.044, seg: 8, rings: 1, off: 0.0105, col: white }));   // small highlight
      parts.push(patch({ yaw: s * 0.88, pitch: -0.38, ra: 0.2, rb: 0.12, seg: 10, rings: 2, off: 0.0025,                                                         // blush
        col: function (t, u, v, x, y, z, out) { skinRGB(skinB, x, y, z, out); var k = 0.85 * Math.pow(1 - t, 1.3); out[0] += (BLUSH[0] - out[0]) * k; out[1] += (BLUSH[1] - out[1]) * k; out[2] += (BLUSH[2] - out[2]) * k; } }));
    }
    m = smilePts(MOUTH_P, 0.11, 0.05, 0.028);
    parts.push(ribbon(m[0], m[1], 0.003, hex3(0x93484e), false));
    if (n !== 'none') {
      G_E8 = G_E8 || new THREE.SphereGeometry(1, 6, 4); G_E6 = G_E6 || new THREE.SphereGeometry(1, 5, 3);
      if (n === 'dot') parts.push({ geo: G_E8, color: ncC, matrix: facing(0, NOSE_P, 0.0, 0.013, 0.013, 0.012) });
      else if (n === 'round') parts.push({ geo: G_E8, color: ncC, matrix: facing(0, NOSE_P, 0.0, 0.024, 0.02, 0.018) });
      else if (n === 'button') {
        parts.push({ geo: G_E8, color: ncC, matrix: facing(0, NOSE_P, 0.0, 0.026, 0.021, 0.019) });
        gl = new THREE.Color().setRGB(nc[0] * 0.55, nc[1] * 0.55, nc[2] * 0.55);
        for (s = -1; s <= 1; s += 2) parts.push({ geo: G_E6, color: gl, matrix: facing(s * 0.07, NOSE_P - 0.03, 0.016, 0.005, 0.005, 0.004) });
      } else if (n === 'pointy') parts.push({ geo: new THREE.ConeGeometry(0.02, 0.055, 8), color: ncC, matrix: facing(0, NOSE_P, 0.012, 1, 1, 1).multiply(new THREE.Matrix4().makeRotationX(PI / 2)) });
    }
    if (o.acc && o.acc.indexOf('glasses') >= 0) {
      var ring = new THREE.TorusGeometry(0.085, 0.011, 3, 10), gc = 0x5b3a29;
      for (s = -1; s <= 1; s += 2) parts.push({ geo: ring, color: gc, matrix: facing(s * EYE.yaw, EYE.pitch, 0.03, 1, 1, 1) });
      parts.push({ geo: new THREE.BoxGeometry(1, 1, 1), color: gc, matrix: facing(0, EYE.pitch + 0.04, 0.03, 0.05, 0.012, 0.012) });
    }
    return parts;
  };

  // Blink: skin lids over the eyes + a closed lash line.
  HM.lidParts = function (skin) {
    var parts = [], s, base = hex3(skin), f = function (t, u, v, x, y, z, out) { skinRGB(base, x, y, z, out); }, i, A, B, th, u;
    for (s = -1; s <= 1; s += 2) {
      parts.push(patch({ yaw: s * EYE.yaw, pitch: EYE.pitch, ra: EYE.ra * 1.14, rb: EYE.rb * 1.14, seg: 12, rings: 1, off: 0.013, col: f }));
      A = []; B = [];
      for (i = 0; i <= 8; i++) {
        u = i / 4 - 1; th = 0.02 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 4))) + 0.002;
        A.push([s * EYE.yaw + u * EYE.ra * 0.95, EYE.pitch - 0.05 - 0.07 * (1 - u * u) + th]); B.push([s * EYE.yaw + u * EYE.ra * 0.95, EYE.pitch - 0.05 - 0.07 * (1 - u * u) - th]);
      }
      parts.push(ribbon(A, B, 0.0145, LASH, false));
    }
    return parts;
  };
})();
