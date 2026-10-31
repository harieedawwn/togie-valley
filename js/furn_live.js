/* Togie Valley - furn_live.js (Stage 17 FURN): placed furniture works.
 * - Seats (Furniture item.seat): tap -> walk to a free neighbour tile, face the seat front, sit; stand on move or tap again.
 * - Beds (item.bed): a placed bed is the bed (same sleep flow). One bed only: the default bed is hidden while one stands
 *   (House.setBedHidden); a second bed is stored back with a toast; storing/selling/moving it off restores the default bed.
 * - Lamps (item.lamp): auto on from 18:00, off from the morning, tap toggles; lit lamps draw an additive glow (Points, 1 call)
 *   and a warm floor pool (1 merged mesh, 1 call). Capped, no dynamic lights, no shadows. Indoor room dims at dusk/night (CSS multiply).
 * Pure helpers (node-readable via module.exports): facingOf, darkness, autoOn, pickLit. Save key `furnlive`: {v:1, auto, ov:{key:0|1}}. */
(function (root) {
  'use strict';
  var FV = ['s', 'e', 'n', 'w'];           // front direction per quarter turn r (ry = r * PI/2, front +z)
  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  var L = {
    facingOf: function (r) { return FV[(r | 0) & 3]; },
    darkness: function (h) { return h >= 17 ? sstep(17, 20, h) : 1 - sstep(5.5, 7.5, h); },   // 0 day .. 1 night (hour 6..26)
    autoOn: function (h) { return h >= 18; },
    pickLit: function (lamps, px, pz, cap) {   // nearest `cap` lamps with a visible glow
      return lamps.filter(function (l) { return l.lv > 0.01; }).sort(function (a, b) { return (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz) - ((b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz)); }).slice(0, cap);
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  var G = root.Game;
  if (!G || typeof window === 'undefined' || typeof THREE === 'undefined' || !G.Events || !G.Furniture || !G.Placement || !G.PlaceLogic || !G.House || !G.Interact || !G.Player || !G.Render) { if (typeof window !== 'undefined') root.Game && (root.Game.FurnLive = L); return; }
  G.FurnLive = L;

  var E = G.Events, F = G.Furniture, PL = G.PlaceLogic, Pl = G.Placement, H = G.House, HM = G.HouseMap, P = G.Player, UI = G.UI, R = G.Render;
  var OX = H.OX, OZ = H.OZ;
  function now() { return Date.now(); }
  function hour() { return G.Time ? G.Time.hour : 12; }
  function inHouse() { return G.Scenes.current === 'house'; }
  function kindNow() { return inHouse() ? 'f' : 'y'; }
  function cellsW(p) { var o = p.k === 'f' ? [OX, OZ] : [0, 0]; return PL.cells(p).map(function (c) { return [c[0] + o[0], c[1] + o[1]]; }); }
  function centreW(p) { var it = F.get(p.id), d = PL.dims(it, p.r), o = p.k === 'f' ? [OX, OZ] : [0, 0]; return [o[0] + p.x + d[0] / 2, o[1] + p.z + d[1] / 2]; }
  function keyOf(p) { return p.id + '@' + p.k + p.x + ',' + p.z; }
  function usable(it) { return it && (it.bed || it.seat || it.lamp); }

  /* ------------------------------------------------------------------ one-bed rule + default bed */
  var busy = false;
  function bedSync() {
    if (busy) return; busy = true;
    try {
      var beds = Pl.list().filter(function (p) { var it = F.get(p.id); return p.k === 'f' && it && it.bed; });
      if (beds.length > 1) {
        beds.slice(0, beds.length - 1).forEach(function (p) { Pl.store(p); });
        if (UI && UI.toast) UI.toast('Chỉ có một giường thôi, giường cũ đã được cất vào kho.', 'warn');
        beds = beds.slice(-1);
      }
      H.setBedHidden(beds.length > 0);
    } finally { busy = false; }
  }

  /* ------------------------------------------------------------------ lamps: state + glow */
  var ov = {}, autoPrev = null, lv = {}, anim = false;
  function lampList() {
    var out = [], kk = kindNow();
    Pl.list().forEach(function (p) {
      var it = F.get(p.id); if (p.k !== kk || !it || !it.lamp) return;
      var c = centreW(p), k = keyOf(p); if (!(k in lv)) lv[k] = 0;
      out.push({ k: k, p: p, it: it, x: c[0], z: c[1], lv: lv[k] });
    });
    return out;
  }
  function wantLit(k) { return k in ov ? !!ov[k] : L.autoOn(hour()); }
  var MAXC = 6;
  function lowTier() { var Q = G.Quality, l = Q && (typeof Q.level === 'number' ? Q.level : Q.current); return typeof l === 'number' && l >= 2; }
  function cap() { return lowTier() ? 2 : MAXC; }

  function glowTex() {
    var c = document.createElement('canvas'), x, g; c.width = c.height = 64; x = c.getContext('2d');
    g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  var tex = glowTex(), grp = new THREE.Group(); grp.name = 'furn_glow';
  var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXC * 3), 3)); pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXC * 3), 3));
  var pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.7, map: tex, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false }));
  pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 20;
  var qg = new THREE.BufferGeometry(), qp = new Float32Array(MAXC * 12), qc = new Float32Array(MAXC * 12), qu = new Float32Array(MAXC * 8), qi = [], i0;
  for (i0 = 0; i0 < MAXC; i0++) { qu.set([0, 0, 1, 0, 1, 1, 0, 1], i0 * 8); qi.push(i0 * 4, i0 * 4 + 2, i0 * 4 + 1, i0 * 4, i0 * 4 + 3, i0 * 4 + 2); }
  qg.setAttribute('position', new THREE.BufferAttribute(qp, 3)); qg.setAttribute('color', new THREE.BufferAttribute(qc, 3)); qg.setAttribute('uv', new THREE.BufferAttribute(qu, 2)); qg.setIndex(qi);
  var pool = new THREE.Mesh(qg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false }));
  pool.frustumCulled = false; pool.visible = false; pool.renderOrder = 19;
  grp.add(pool); grp.add(pts); R.scene.add(grp);

  function drawGlow() {
    var all = lampList(), pl = P.pos || { x: 0, z: 0 }, sel = L.pickLit(all, pl.x, pl.z, cap()), low = lowTier(), n = sel.length, i, l, a, b, r, y, litCount = 0;
    var pa = pg.attributes.position.array, ca = pg.attributes.color.array;
    for (i = 0; i < n; i++) {
      l = sel[i]; a = l.lv; r = l.it.lamp.r;
      pa[i * 3] = l.x; pa[i * 3 + 1] = l.it.lamp.y; pa[i * 3 + 2] = l.z;
      ca[i * 3] = 1.0 * a; ca[i * 3 + 1] = 0.78 * a; ca[i * 3 + 2] = 0.42 * a;
      if (!low) {
        y = 0.1;
        b = i * 12;   // four corners written in place (no temp array)
        qp[b] = l.x - r; qp[b + 1] = y; qp[b + 2] = l.z + r; qp[b + 3] = l.x + r; qp[b + 4] = y; qp[b + 5] = l.z + r;
        qp[b + 6] = l.x + r; qp[b + 7] = y; qp[b + 8] = l.z - r; qp[b + 9] = l.x - r; qp[b + 10] = y; qp[b + 11] = l.z - r;
        for (b = 0; b < 4; b++) { qc[i * 12 + b * 3] = 0.62 * a; qc[i * 12 + b * 3 + 1] = 0.4 * a; qc[i * 12 + b * 3 + 2] = 0.16 * a; }
      }
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; pg.setDrawRange(0, n);
    qg.attributes.position.needsUpdate = true; qg.attributes.color.needsUpdate = true; qg.setDrawRange(0, low ? 0 : n * 6);
    pts.visible = n > 0; pool.visible = n > 0 && !low;
    for (i = 0; i < all.length; i++) litCount += all[i].lv;
    return litCount;
  }
  function step(dt) {
    var moving = false, ls = lampList(), i, l, goal, v;
    for (i = 0; i < ls.length; i++) {
      l = ls[i]; goal = wantLit(l.k) ? 1 : 0; v = lv[l.k];
      if (v !== goal) { v += Math.sign(goal - v) * Math.min(Math.abs(goal - v), dt * 1.2); lv[l.k] = v; if (v !== goal) moving = true; }
    }
    return moving;
  }
  var lastT = 0;
  function frame(t) {
    var dt = Math.min(0.1, (t - lastT) / 1000 || 0.016); lastT = t;
    var moving = step(dt); drawGlow(); applyDim();
    if (moving) requestAnimationFrame(frame); else anim = false;
  }
  function kick() { if (anim) return; anim = true; lastT = performance.now(); requestAnimationFrame(frame); }

  /* ------------------------------------------------------------------ indoor dusk dim (CSS multiply, no draw calls) */
  var dim = document.createElement('div');
  dim.id = 'tv-indoor-dim'; dim.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:1;background:rgb(196,198,232);mix-blend-mode:multiply;opacity:0;transition:opacity .6s linear';
  document.body.appendChild(dim);
  function applyDim() {
    var o = 0, lit = 0;
    if (inHouse()) {
      o = L.darkness(hour());
      lampList().forEach(function (l) { lit += l.lv; });
      o *= 1 - 0.3 * Math.min(1, lit / 2);
    }
    dim.style.opacity = o.toFixed(3);
  }

  function timeTick() {
    var a = L.autoOn(hour());
    if (autoPrev === null) autoPrev = a;
    if (a !== autoPrev) { autoPrev = a; ov = {}; }   // dusk / morning: manual choices reset
    applyDim(); kick();
  }

  /* ------------------------------------------------------------------ interaction */
  var seated = null, lastStood = null;
  function find(tx, tz, scene) {
    var kk = scene === 'house' ? 'f' : (scene === 'outdoor' ? 'y' : ''), hit = null;
    if (!kk) return null;
    Pl.list().forEach(function (p) {
      if (hit || p.k !== kk) return;
      var it = F.get(p.id); if (!usable(it)) return;
      if (cellsW(p).some(function (c) { return c[0] === tx && c[1] === tz; })) hit = { p: p, it: it, tx: tx, tz: tz };
    });
    return hit;
  }
  function freeHouse(tx, tz) {
    var ix = tx - OX, iz = tz - OZ;
    return HM.isWalkable(ix, iz) && !(G.Solids && G.Solids.houseBlocked(ix, iz));
  }
  function letter(dx, dz) { return Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n'); }
  function pick(t) {   // free neighbour tile next to the piece (house), nearest to the player
    var cs = cellsW(t.p), me = P.tile({}), best = null, bd = 1e9;
    cs.forEach(function (c) {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var x = c[0] + d[0], z = c[1] + d[1], dd;
        if (cs.some(function (q) { return q[0] === x && q[1] === z; }) || !freeHouse(x, z)) return;
        dd = Math.abs(x - me.tx) + Math.abs(z - me.tz) + (c[0] === t.tx && c[1] === t.tz ? 0 : 0.5);
        if (dd < bd) { bd = dd; best = { cell: c, from: { tx: x, tz: z, facing: letter(c[0] - x, c[1] - z) } }; }
      });
    });
    return best;
  }
  G.Interact.register({
    id: 'furn-live', priority: 60,
    test: function (tx, tz, scene) { return find(tx, tz, scene); },
    stand: function (t) {
      if (t.p.k === 'y') return { tx: t.tx, tz: t.tz, facing: null };
      var b = pick(t); if (!b) return null;
      t.cell = b.cell; t.from = b.from; return b.from;
    },
    run: function (t, done) {
      if (t.it.bed || t.it.decay) { if (t.p.k === 'f') H.askSleep(t, done); else done(); return; }
      if (t.it.lamp) { toggle(t); done(); return; }
      sit(t); done();
    }
  });
  function toggle(t) {
    var k = keyOf(t.p), on = !wantLit(k);
    ov[k] = on ? 1 : 0; if (!(k in lv)) lv[k] = 0;
    UI.sfx('pop');
    if (G.Save.request) G.Save.request(); kick();
  }
  function sit(t) {
    var k = keyOf(t.p), cell = t.p.k === 'y' ? [t.tx, t.tz] : t.cell, from = t.p.k === 'y' ? null : t.from, pose, face;
    if (lastStood && lastStood.key === k && now() - lastStood.t < 2500) { lastStood = null; return; }   // tap on the seat you are sitting on = stand up
    if (P.sitting || P.isLocked() || !cell) return;
    pose = G.Seat && G.Seat.furnPose && t.it.seat && t.it.seat.n ? G.Seat.furnPose(t.it, t.p.r & 3, centreW(t.p), cell) : null;   // Stage 17 DECOR b: seat height / offset from the item's seat data
    face = pose ? pose.face : L.facingOf(t.p.r);
    P.face(face);
    setTimeout(function () {
      if (P.sitting || P.isLocked()) return;
      var me = P.tile({}), ref = from || { tx: cell[0], tz: cell[1] };
      if (Math.abs(me.tx - ref.tx) + Math.abs(me.tz - ref.tz) > 1) return;   // walked away during the turn
      seated = { key: k, from: from, cell: cell, p: t.p };
      P.sitAt(cell[0], cell[1], pose ? { x: pose.x, z: pose.z, y: pose.y } : null);
      P.face(face);
    }, 280);
  }
  /* free tile next to the seat to stand on: the tile we came from, else front / sides / back of the footprint (never inside furniture) */
  function freeSpot(tx, tz, p) {
    var W = G.World, ok;
    if (p.k === 'f') return freeHouse(tx, tz);
    if (!W.isWalkableTile(tx, tz) || (W.isBlocked && W.isBlocked(tx, tz))) return false;
    ok = true;
    Pl.list().forEach(function (q) { var it = F.get(q.id); if (q.k === 'y' && it && !it.flat && PL.cells(q).some(function (c) { return c[0] === tx && c[1] === tz; })) ok = false; });
    return ok;
  }
  function standSpot(s) {
    var cands = G.Seat && G.Seat.standCandidates ? G.Seat.standCandidates(cellsW(s.p), s.p.r & 3, s.cell) : [], i;
    if (s.from && freeSpot(s.from.tx, s.from.tz, s.p)) return s.from;
    for (i = 0; i < cands.length; i++) if (freeSpot(cands[i].tx, cands[i].tz, s.p)) return cands[i];
    return null;
  }
  E.on('player:stood', function () {
    var s = seated; if (!s) return;
    seated = null; lastStood = { key: s.key, t: now() };
    if (!P.placeAt) return;
    var f = standSpot(s);
    if (f) P.placeAt({ tx: f.tx, tz: f.tz, facing: f.facing }); else P.placeAt({ x: P.pos.x, z: P.pos.z });   // out of the footprint (placeAt pops to the nearest free spot)
  });
  E.on('scene:changed', function () { seated = null; applyDim(); drawGlow(); kick(); });

  /* ------------------------------------------------------------------ events + save */
  function all() { bedSync(); applyDim(); drawGlow(); kick(); }
  ['furniture:placed', 'furniture:changed', 'shop:transaction', 'save:loaded', 'house:tier'].forEach(function (n) { E.on(n, all); });
  ['time:minuteStep', 'day:started'].forEach(function (n) { E.on(n, timeTick); });
  setInterval(bedSync, 500);   // catches pick-up (move) and sell without a dedicated event
  G.Save.register('furnlive', {
    save: function () { return { v: 1, auto: autoPrev === null ? L.autoOn(hour()) : autoPrev, ov: ov }; },
    load: function (s) {
      ov = {}; lv = {}; autoPrev = null;
      if (s && s.ov) Object.keys(s.ov).forEach(function (k) { ov[k] = s.ov[k] ? 1 : 0; });
      if (s && typeof s.auto === 'boolean') autoPrev = s.auto;   // old saves: no key -> lamps follow the clock
      if (autoPrev !== null && autoPrev !== L.autoOn(hour())) { ov = {}; autoPrev = null; }
      Object.keys(ov).forEach(function (k) { lv[k] = ov[k] ? 1 : 0; });
      timeTick();
    },
    reset: function () { ov = {}; lv = {}; autoPrev = null; timeTick(); }
  });
  timeTick(); bedSync();
})(typeof window !== 'undefined' ? window : globalThis);
