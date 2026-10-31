/* Togie Valley - chunks.js (Stage 14B): spatial chunks for big instanced groups so frustum culling works.
 * Decor.instanced(..., {chunk: 16, group: 'flowers'}) delegates here: the instance list is split into ~16x16 tile cells, every cell becomes its own
 * fill (+ outline) InstancedMesh pair with a tight bounding sphere (three r128 only culls InstancedMesh by geometry.boundingSphere).
 * Chunks share the vertex buffers of the base geometry; only the per-instance attributes (tree tint/fruit) are per chunk.
 * Game.Chunks: instanced(D, nameOrGeo, list, sway, noOutline, opts), setDensity(group, d), setOutlines(group, on), update(), onScreen(x, z, r), stats().
 * No per-instance CPU work exists (sway is a vertex shader), so off-screen chunks cost one sphere test and no draw call.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Props) { console.error('[chunks] missing deps'); return; }
  var R = G.Render;
  var C = { size: 16, MIN: 100, list: [], groups: {}, visible: 0, total: 0, drawn: 0 };   // groups with fewer than MIN (100) instances stay one mesh (every chunk costs draw calls)
  var frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(), tick = 0;

  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  function shareGeo(g) {   // new geometry object, same attribute buffers (shared GL buffers), own instanced attributes
    var c = new THREE.BufferGeometry(), k;
    for (k in g.attributes) { if (k === 'iTint' || k === 'iFruit') continue; c.setAttribute(k, g.attributes[k]); }
    if (g.index) c.setIndex(g.index);
    return c;
  }

  C.instanced = function (D, name, list, sway, noOutline, opts) {
    var base = typeof name === 'string' ? G.Props.geometry(name) : name, size = list.length < C.MIN ? 1e6 : (opts.chunk || C.size), cells = {}, key, i, o, out = [];
    if (!base.boundingSphere) base.computeBoundingSphere();
    var modelR = base.boundingSphere.center.length() + base.boundingSphere.radius;
    for (i = 0; i < list.length; i++) {
      o = list[i]; key = Math.floor(o.x / size) + ',' + Math.floor(o.z / size);
      (cells[key] = cells[key] || []).push(o);
    }
    var o2 = {}, k2; for (k2 in opts) o2[k2] = opts[k2]; o2.chunk = 0;
    var shuffle = !!opts.group;
    for (key in cells) {
      var items = cells[key], j, a, t, x0 = 1e9, x1 = -1e9, y1 = 0, z0 = 1e9, z1 = -1e9, maxS = 0, shift = 0;
      if (shuffle) {   // deterministic shuffle so a prefix of the instances is a uniform thinning (density)
        for (j = items.length - 1; j > 0; j--) { a = Math.floor(hash(j * 7 + items.length, items[j].x * 13 + items[j].z * 31 + 1) * (j + 1)); t = items[j]; items[j] = items[a]; items[a] = t; }
      }
      for (j = 0; j < items.length; j++) {
        o = items[j];
        if (o.x < x0) x0 = o.x; if (o.x > x1) x1 = o.x; if (o.z < z0) z0 = o.z; if (o.z > z1) z1 = o.z;
        if ((o.y || 0) > y1) y1 = o.y || 0; if ((o.s || 1) > maxS) maxS = o.s || 1;
        if (o.tint && Math.abs(o.tint[3]) > shift) shift = Math.abs(o.tint[3]);
      }
      var rad = modelR * maxS + 0.3 + shift + (sway ? 0.15 : 0), cx = (x0 + x1) / 2, cy = (y1 + rad) / 2, cz = (z0 + z1) / 2;
      var hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, hy = (y1 + rad) / 2;
      var cg = shareGeo(base);
      cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(hx * hx + hz * hz + hy * hy) + rad);
      var meshes = D.instanced(cg, items, sway, noOutline, o2), n = items.length;
      for (j = 0; j < meshes.length; j++) { meshes[j].frustumCulled = true; out.push(meshes[j]); }
      var ent = { group: opts.group || '', meshes: meshes, sphere: cg.boundingSphere, n: n, shuffled: shuffle, on: true, vis: true, dens: 1, q: 1, olOn: true, cnt: n };
      meshes[0].name = 'chunk_' + (opts.group || 'inst') + '_' + key;
      C.list.push(ent);
      (C.groups[ent.group] = C.groups[ent.group] || []).push(ent);
    }
    if (opts.group && G.Perf && G.Perf.tierDef) {   // a chunk group built after the tier was applied
      if (opts.group === 'flowers') { C.setDensity('flowers', G.Perf.tierDef.flower); C.setOutlines('flowers', G.Perf.tierDef.flowerOutline); }
    }
    return out;
  };

  function applyCount(e) { var c = Math.ceil(e.n * e.dens * e.q); e.cnt = c; return c; }
  /* Stage 35 distance LOD (camera distance, every 3rd frame). Fog is total at fogFar, so small ground cover (grass, flowers) thins from NEAR_D to
   * FAR_D and is skipped past it; trees/bushes are only skipped beyond fogFar + 8 (the far ring in scenery_far takes over). Counts move in 10 % steps. */
  var NEAR_D = 26, FAR_D = 68, SKIP_D = 78;
  function lod(e, d) {
    var tiny = e.group === 'grass' || e.group === 'flowers', q = 1, vis = true, j, c, m;
    if (tiny) { if (d > FAR_D) vis = false; else if (d > NEAR_D) q = Math.max(0.3, Math.round((1 - 0.7 * (d - NEAR_D) / (FAR_D - NEAR_D)) * 10) / 10); }
    else if (e.group && d > SKIP_D) vis = false;
    if (vis !== e.vis) { e.vis = vis; e.meshes[0].visible = vis; for (j = 1; j < e.meshes.length; j++) e.meshes[j].visible = vis && e.olOn; }
    if (q !== e.q && e.shuffled) { e.q = q; c = applyCount(e); for (j = 0; j < e.meshes.length; j++) e.meshes[j].count = c; }
  }
  C.setDensity = function (group, d) {
    var arr = C.groups[group] || [], i, j, e, c;
    d = Math.max(0, Math.min(1, d));
    for (i = 0; i < arr.length; i++) {
      e = arr[i]; if (!e.shuffled) continue;
      e.dens = d; c = applyCount(e);
      for (j = 0; j < e.meshes.length; j++) e.meshes[j].count = c;
    }
  };
  C.setOutlines = function (group, on) {   // outline meshes are named 'outline' (index 1 of the pair)
    var arr = C.groups[group] || [], i, m;
    for (i = 0; i < arr.length; i++) { arr[i].olOn = !!on; m = arr[i].meshes[1]; if (m) m.visible = !!on && arr[i].vis; m = arr[i].meshes[0].material; if (m.uniforms.uOut) m.uniforms.uOut.value = on ? 1 : 0; }
  };

  // Own frustum test every 3rd frame (outdoors only): marks chunks on screen for other modules / the debug overlay.
  C.update = function () {
    if (G.Scenes && G.Scenes.current !== 'outdoor') return;
    if ((tick++ % 3) !== 0) return;
    var cam = R.camera, i, e, vis = 0, drawn = 0;
    cam.updateMatrixWorld();
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    var me = cam.matrixWorld.elements, dx, dy, dz;
    for (i = 0; i < C.list.length; i++) {
      e = C.list[i]; e.on = frustum.intersectsSphere(e.sphere);
      dx = e.sphere.center.x - me[12]; dy = e.sphere.center.y - me[13]; dz = e.sphere.center.z - me[14];
      lod(e, Math.sqrt(dx * dx + dy * dy + dz * dz) - e.sphere.radius);
      if (e.on && e.vis) { vis++; drawn += e.meshes.length; }
    }
    C.visible = vis; C.total = C.list.length; C.drawn = drawn;
  };
  C.onScreen = function (x, z, r) {   // is a world point (radius r) inside any on-screen chunk sphere? (cheap, no allocation)
    var i, e, dx, dz, rr;
    for (i = 0; i < C.list.length; i++) {
      e = C.list[i]; if (!e.on) continue;
      dx = x - e.sphere.center.x; dz = z - e.sphere.center.z; rr = e.sphere.radius + (r || 0);
      if (dx * dx + dz * dz <= rr * rr) return true;
    }
    return false;
  };
  C.stats = function () { return { chunks: C.list.length, visible: C.visible, drawn: C.drawn }; };

  G.Loop.onFrame(C.update, 950);
  G.Chunks = C;
})();
