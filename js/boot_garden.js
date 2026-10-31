/* Togie Valley - boot_garden.js (Round 3 stage 31): tiny interactive garden on the boot-scene island (play while the game loads).
 * Loads BEFORE boot_scene.js (needs no other module; boot_scene.js picks Game.BootGarden.layer up when it builds the diorama).
 * API: Game.BootGarden { TOOLS, create(), act(plot, tool), layer(ctx), last }.
 *  - Plot state machine (pure): {tilled, watered, seeded, grown}. act() -> 'till'|'water'|'seed'|'noop'|'uproot'. Any order; `grown` flips to true
 *    exactly when the third distinct action lands; any act() on a grown plot is 'uproot' and resets everything.
 *  - layer(ctx): ctx = {THREE, Builder, group, garden, camera, mat, track}. Builds 3 plots + tool sprite + one Points pool, a window pointerdown
 *    listener (raycast ONLY on tap) and the Vietnamese toolbar #tv-garden-bar. Returns {update, dispose, keep, plots}. keep = true makes the
 *    boot scene stay alive through the title (released on closeTitle).
 * No per-frame allocations: every vector/array is created at build; no audio, no assets.
 */
(function () {
  'use strict';
  var G = window.Game = window.Game || {};
  var TOOLS = ['hoe', 'can', 'seed'], N = 3, NP = 24, SPACING = 1.0, TOOL_T = 0.3, GROW_T = 0.7, PULL_T = 0.25, GRAV = 3.2;
  var LABEL = { hoe: 'Cuốc', can: 'Bình tưới', seed: 'Hạt giống' };
  var INK = '#5b3a29';
  var ICON = {
    hoe: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 27 L21 7" stroke="#b57a42" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M19 5 L28 9 L25 15 L16 11 Z" fill="#cfd2d6" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/></svg>',
    can: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 12 H21 L20 27 H9 Z" fill="#7ec8e3" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/><path d="M21 16 L28 9" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/><path d="M8 15 C3 15 3 22 8 22" fill="none" stroke="' + INK + '" stroke-width="2.4"/></svg>',
    seed: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="8" y="4" width="16" height="24" rx="3" fill="#fff1d0" stroke="' + INK + '" stroke-width="2.4"/><path d="M8 11 H24" stroke="' + INK + '" stroke-width="2"/><circle cx="16" cy="19" r="4.5" fill="#ff9a3a" stroke="' + INK + '" stroke-width="1.8"/><path d="M16 14.5 V12.5" stroke="#4a8f37" stroke-width="2.4" stroke-linecap="round"/></svg>'
  };
  var SKIP = 'button, a, input, select, textarea, label, [role="button"], .tv-btn, .mn-btn, #tv-layer, #tv-garden-bar';

  /* ------------------------------------------------ plot state machine (pure) */
  function create() { return { tilled: false, watered: false, seeded: false, grown: false }; }
  function reset(p) { p.tilled = false; p.watered = false; p.seeded = false; p.grown = false; return p; }
  function act(p, tool) {
    var r = 'noop';
    if (p.grown) { reset(p); return 'uproot'; }
    if (tool === 'hoe' && !p.tilled) { p.tilled = true; r = 'till'; }
    else if (tool === 'can' && !p.watered) { p.watered = true; r = 'water'; }
    else if (tool === 'seed' && !p.seeded) { p.seeded = true; r = 'seed'; }
    if (r !== 'noop' && p.tilled && p.watered && p.seeded) p.grown = true;
    return r;
  }

  function easeOut(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return 1 - (1 - x) * (1 - x) * (1 - x); }
  function easeBack(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; var c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }

  /* ------------------------------------------------ visual layer */
  function layer(ctx) {
    var T = ctx.THREE, B = ctx.Builder, gd = ctx.garden, grp = ctx.group, cam = ctx.camera;
    if (!T || !B || !gd || !grp || !cam || typeof document === 'undefined' || !document.body) { console.error('[boot_garden] missing deps, garden skipped'); return null; }
    var base = gd.y + 0.06, i, q, mats = [], pl = [], tm = [], cur = 'hoe', alive = true, tick = 0, titleSeen = false, barOff = false, bar, btns = [];
    var tIdx = 0, tT = 0, cursor = 0, lastAlive = 0;

    function mk(m) { mats.push(m); return m; }
    function geo(fn) { var b = new B(T); fn(b); return ctx.track(b.build()); }
    function lam(hex) { return mk(new T.MeshLambertMaterial({ vertexColors: true, color: hex })); }
    var padDry = lam(0x946642), padWet = lam(0x4b2e1b), mdDry = lam(0x654027), mdWet = lam(0x3a2314);

    var padGeo = geo(function (b) { b.box(0xffffff, 0, 0.015, 0, 0.8, 0.03, 0.7); });
    var moundGeo = geo(function (b) {
      b.ball(0xffffff, 0, 0.03, 0, 0.34, 1.15, 0.5, 0.9, 10, 6); b.ball(0xe9e9e9, -0.2, 0.04, 0.12, 0.14, 1, 0.6, 1, 6, 4); b.ball(0xe9e9e9, 0.22, 0.04, -0.1, 0.12, 1, 0.6, 1, 6, 4);
    });
    var seedGeo = geo(function (b) { b.ball(0x6b4a2b, 0, 0, 0, 0.06, 0.8, 1.1, 0.8, 6, 4); b.ball(0xc99256, 0.08, 0, 0.04, 0.045, 0.8, 1.1, 0.8, 6, 4); });
    var carrotGeo = geo(function (b) {   // same look as the game's carrot: orange root (#ff9a3a) + green fan of leaves (#79c75a)
      b.cone(0xff9a3a, 0, 0.18, 0, 0.13, 0.4, 7, Math.PI, 0, 0);
      b.cone(0x79c75a, 0, 0.62, 0, 0.06, 0.5, 4); b.cone(0x5fb04a, 0.1, 0.58, 0, 0.055, 0.42, 4, 0, 0, -0.55);
      b.cone(0x5fb04a, -0.1, 0.58, 0.02, 0.055, 0.42, 4, 0, 0, 0.55); b.cone(0x79c75a, 0, 0.56, 0.1, 0.055, 0.4, 4, 0.55, 0, 0);
    });
    var toolGeos = [
      geo(function (b) { b.cyl(0xa87238, 0.1, 0.28, 0, 0.025, 0.025, 0.56, 5, 0, -0.35); b.box(0xcfd2d6, 0, 0.03, 0, 0.2, 0.04, 0.09); }),
      geo(function (b) { b.cyl(0x7ec8e3, 0, 0.2, 0, 0.1, 0.12, 0.2, 8); b.cyl(0x5fa8c4, -0.16, 0.27, 0, 0.02, 0.03, 0.22, 5, 0, 1.0); b.box(0x5fa8c4, 0.12, 0.22, 0, 0.03, 0.16, 0.03); }),
      geo(function (b) { b.box(0xfff1d0, 0, 0.2, 0, 0.18, 0.26, 0.03); b.box(0x79c75a, 0, 0.15, 0.018, 0.18, 0.08, 0.01); b.ball(0xff9a3a, 0, 0.25, 0.02, 0.04, 1, 1, 0.3, 6, 4); })
    ];
    function mesh(g, m, parent) { var o = new T.Mesh(g, m); o.frustumCulled = false; parent.add(o); return o; }

    for (i = 0; i < N; i++) {
      q = { s: create(), g: new T.Group(), x: gd.x + (i - 1) * SPACING, z: gd.z, mT: 1, sT: 1, gT: -1, gDelay: 0, grow: false, pT: -1, wT: 0, wAcc: 0, spark: false, grows: 0 };
      q.g.position.set(q.x, base, q.z); grp.add(q.g);
      q.pad = mesh(padGeo, padDry, q.g);
      q.mound = mesh(moundGeo, mdDry, q.g); q.mound.visible = false;
      q.seed = mesh(seedGeo, ctx.mat, q.g); q.seed.visible = false;
      q.carrot = mesh(carrotGeo, ctx.mat, q.g); q.carrot.visible = false;
      pl.push(q);
    }
    for (i = 0; i < 3; i++) { q = mesh(toolGeos[i], ctx.mat, grp); q.visible = false; tm.push(q); }

    // particle pool: one Points draw, positions/colours rewritten in place
    var pos = new Float32Array(NP * 3), col = new Float32Array(NP * 3), vel = new Float32Array(NP * 3), life = new Float32Array(NP), tc = new T.Color();
    var pg = ctx.track(new T.BufferGeometry()), pa = new T.BufferAttribute(pos, 3), ca = new T.BufferAttribute(col, 3);
    for (i = 0; i < NP; i++) pos[i * 3 + 1] = -50;
    pg.setAttribute('position', pa); pg.setAttribute('color', ca);
    var pm = mk(new T.PointsMaterial({ size: 4.5, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    var pts = new T.Points(pg, pm); pts.frustumCulled = false; pts.visible = false; grp.add(pts);
    function emit(x, y, z, vx, vy, vz, l, hex) {
      var k = cursor, o = k * 3; cursor = (cursor + 1) % NP;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz; life[k] = l;
      tc.setHex(hex); col[o] = tc.r; col[o + 1] = tc.g; col[o + 2] = tc.b;
    }
    function burst(q, n, hexA, hexB, up) {
      var k, a;
      for (k = 0; k < n; k++) { a = k * 2.4 + q.x; emit(q.x, base + 0.2, q.z, Math.cos(a) * 0.7, up + (k % 3) * 0.3, Math.sin(a) * 0.5, 0.45 + (k % 3) * 0.08, k % 2 ? hexA : hexB); }
    }

    function applyMats(q) {
      q.pad.material = q.s.watered ? padWet : padDry;
      q.mound.material = q.s.watered ? mdWet : mdDry;
      q.mound.visible = q.s.tilled;
      q.seed.visible = q.s.seeded && !q.s.grown;
    }
    function showTool(tool, x, z) {
      var k = TOOLS.indexOf(tool);
      tm[tIdx].visible = false; tIdx = k < 0 ? 0 : k; tT = TOOL_T;
      tm[tIdx].position.set(x, base + 0.5, z); tm[tIdx].visible = true;
    }
    function tapPlot(idx) {
      var q = pl[idx], r;
      if (!q || q.grow) return false;   // busy while the plant pops
      r = act(q.s, cur);
      showTool(cur, q.x, q.z);
      if (r === 'uproot') {
        q.mound.visible = false; q.seed.visible = false; q.pT = 0; q.gT = -1; q.mT = 1; applyMats(q);
        burst(q, 7, 0x7a4f31, 0x79c75a, 1.3);
        return true;
      }
      if (r === 'noop') return true;
      if (r === 'till') { q.mT = 0; q.mound.scale.set(0.01, 0.01, 0.01); burst(q, 5, 0x7a4f31, 0x9a6a42, 0.9); }
      else if (r === 'water') q.wT = 0.6;
      else if (r === 'seed') { q.sT = 0; q.seed.position.y = base + 0.7; }
      applyMats(q);
      if (q.s.grown) { q.grow = true; q.gDelay = r === 'seed' ? 0.28 : 0.12; q.gT = -1; q.pT = -1; q.spark = false; q.grows++; q.carrot.visible = false; q.seed.visible = true; }
      return true;
    }

    /* ---- tap -> plot (raycast only here, on tap) */
    var ray = new T.Raycaster(), ndc = new T.Vector2(), inv = new T.Matrix4(), lray = new T.Ray(), plane = new T.Plane(new T.Vector3(0, 1, 0), -(base + 0.25)), hit = new T.Vector3();
    function pick(cx, cy) {
      var w = window.innerWidth || 1, h = window.innerHeight || 1, k;
      ndc.set(cx / w * 2 - 1, -(cy / h) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      grp.updateMatrixWorld();
      inv.copy(grp.matrixWorld).invert();
      lray.copy(ray.ray).applyMatrix4(inv);
      if (!lray.intersectPlane(plane, hit)) return -1;
      for (k = 0; k < N; k++) if (Math.abs(hit.x - pl[k].x) <= SPACING / 2 && Math.abs(hit.z - pl[k].z) <= 0.55) return k;
      return -1;
    }
    function onDown(e) {
      if (!alive || e.isPrimary === false || (e.button && e.button !== 0)) return;
      var ly = document.getElementById('tv-layer'), tg = e.target, k;
      if (ly && ly.childElementCount > 0) return;   // a panel is open
      if (tg && tg.closest && tg.closest(SKIP)) return;   // never steal taps from buttons / panels / the toolbar
      k = pick(e.clientX, e.clientY);
      if (k >= 0) tapPlot(k);
    }
    window.addEventListener('pointerdown', onDown, { passive: true });

    /* ---- toolbar */
    function select(t) {
      var k;
      cur = t;
      for (k = 0; k < btns.length; k++) { btns[k].setAttribute('aria-pressed', TOOLS[k] === t ? 'true' : 'false'); if (TOOLS[k] === t) btns[k].classList.add('on'); else btns[k].classList.remove('on'); }
    }
    bar = document.createElement('div'); bar.id = 'tv-garden-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Khu vườn nhỏ');
    TOOLS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', LABEL[t]); b.innerHTML = ICON[t] + '<span>' + LABEL[t] + '</span>';
      b.addEventListener('click', function () { select(t); });
      bar.appendChild(b); btns.push(b);
    });
    document.body.appendChild(bar);
    select('hoe');

    function syncBar() {
      var ly = document.getElementById('tv-layer'), off;
      if (!titleSeen && document.getElementById('tv-title')) titleSeen = true;
      off = titleSeen || document.body.classList.contains('tv-playing') || !!(ly && ly.childElementCount > 0);
      if (off === barOff) return;
      barOff = off;
      if (off) bar.classList.add('off'); else bar.classList.remove('off');
      bar.setAttribute('aria-hidden', off ? 'true' : 'false');
    }

    /* ---- per-frame update (no allocations) */
    function update(t, dt) {
      var k, o, q, e, u, kk, sy, sx, anyAlive = 0, m, p;
      if (!alive) return;
      if ((tick++ & 7) === 0) syncBar();
      if (tT > 0) {   // tool sprite: drops onto the plot for 0.3 s, a tiny swing, then vanishes
        tT -= dt; m = tm[tIdx];
        if (tT <= 0) m.visible = false;
        else {
          u = 1 - tT / TOOL_T;
          m.position.y = base + 0.04 + 0.46 * (1 - u * u);
          m.rotation.z = tIdx === 0 ? 0.5 - 1.1 * u : tIdx === 1 ? -0.3 - 0.6 * Math.sin(u * Math.PI) : 0.2 * Math.sin(u * 6);
          m.scale.setScalar(0.7 + 0.3 * Math.min(1, u * 4));
        }
      }
      for (k = 0; k < N; k++) {
        q = pl[k];
        if (q.mT < 1 && q.s.tilled) {
          q.mT += dt / 0.25; e = q.mT >= 1 ? 1 : easeBack(q.mT);
          q.mound.scale.set(e, e, e);
        }
        if (q.seed.visible && q.s.seeded) {
          if (q.sT < 1) q.sT = Math.min(1, q.sT + dt / 0.25);
          e = q.s.tilled ? Math.min(1, q.mT) : 0;
          q.seed.position.y = 0.05 + 0.13 * e + 0.7 * (1 - q.sT * q.sT);
        }
        if (q.wT > 0) {   // droplets fall from above the plot
          q.wT -= dt; q.wAcc += dt;
          while (q.wAcc > 0.06) { q.wAcc -= 0.06; emit(q.x + (Math.random() - 0.5) * 0.5, base + 0.8, q.z + (Math.random() - 0.5) * 0.4, 0, -0.5, 0, 0.6, 0x7ec8e3); }
        }
        if (q.grow) {
          if (q.gDelay > 0) {
            q.gDelay -= dt;
            if (q.gDelay <= 0) { q.seed.visible = false; q.carrot.visible = true; q.carrot.position.y = 0; q.carrot.scale.set(0.01, 0.01, 0.01); q.gT = 0; }
          } else {
            q.gT += dt / GROW_T; u = q.gT >= 1 ? 1 : q.gT;
            e = easeOut(u / 0.6);
            kk = u < 0.6 ? 0.22 * Math.sin(u / 0.6 * Math.PI) : 0.18 * Math.sin((u - 0.6) / 0.4 * 6.2832) * (1 - (u - 0.6) / 0.4);   // stretch, then damped squash/stretch
            sy = e * (1 + kk); sx = (0.4 + 0.6 * e) * (1 - 0.6 * kk);
            q.carrot.scale.set(sx, Math.max(0.01, sy), sx);
            if (!q.spark && u >= 0.5) { q.spark = true; burst(q, 8, 0xffe27a, 0xffffff, 1.6); }
            if (q.gT >= 1) { q.grow = false; q.gT = -1; q.carrot.scale.set(1, 1, 1); }
          }
        }
        if (q.pT >= 0) {   // uproot pop: carrot hops up, shrinks, gone
          q.pT += dt / PULL_T;
          if (q.pT >= 1) { q.pT = -1; q.carrot.visible = false; q.carrot.position.y = 0; q.carrot.scale.set(1, 1, 1); }
          else { e = easeOut(q.pT); q.carrot.visible = true; q.carrot.position.y = 0.5 * e; q.carrot.scale.set(1 + 0.15 * e, 1 - 0.3 * q.pT, 1 + 0.15 * e); }
        }
      }
      for (k = 0; k < NP; k++) {   // particles
        if (life[k] <= 0) continue;
        o = k * 3; life[k] -= dt;
        vel[o + 1] -= GRAV * dt;
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        if (life[k] <= 0 || pos[o + 1] < base + 0.02) { life[k] = 0; pos[o + 1] = -50; } else anyAlive++;
      }
      if (anyAlive || lastAlive) { pa.needsUpdate = true; ca.needsUpdate = true; }
      lastAlive = anyAlive; pts.visible = anyAlive > 0;
    }
    function dispose() {
      if (!alive) return;
      alive = false;
      window.removeEventListener('pointerdown', onDown);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      mats.forEach(function (mm) { mm.dispose(); });
      if (G.BootGarden && G.BootGarden.last === api) G.BootGarden.last = null;
    }
    var api = { update: update, dispose: dispose, keep: true, plots: pl, bar: bar, tap: tapPlot, pick: pick };
    G.BootGarden.last = api;
    return api;
  }

  G.BootGarden = { TOOLS: TOOLS, create: create, act: act, layer: layer, last: null };
})();
