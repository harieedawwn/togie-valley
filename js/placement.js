/* Togie Valley - placement.js (Stage 16 H1b): decor placement mode ("Trang trí"): ghost preview snapped to tiles, drag / rotate / confirm, move / store / sell placed items.
 * Rules live in placement_logic.js. Rendering = one merged mesh for the house + one for the yard (rebuilt only when the list changes).
 * API: Game.Placement { active, open(), close(), openPicker(), list(), place(p), count() }. Save key `furnplace`. Events: furniture:placed {n}. */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Furniture || !G.PlaceLogic || !G.House || !G.HouseMap || !G.Render || !G.UI || !G.Save || !G.Scenes || !G.Models || !G.World) { console.error('[placement] missing deps'); return; }
  var F = G.Furniture, PL = G.PlaceLogic, HM = G.HouseMap, H = G.House, E = G.Events, UI = G.UI, R = G.Render, Pl = G.Placement = { active: false };
  var list = [], dirty = { h: true, y: true }, loading = false, held = null, moved = null, sel = -1, drag = null, why = '', follow = false, bobT = 0;
  var Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);

  /* ---------------------------------------------------------------- yard rule: free grass near the farmhouse, never on interactables */
  var bushSet = null;
  function bushes() {
    var L = G.Decor && G.Decor.layout;
    if (!bushSet && L && L.bushTiles) { bushSet = {}; L.bushTiles.forEach(function (c) { bushSet[c[0] + ',' + c[1]] = 1; }); }
    return bushSet || {};
  }
  function yardOK(tx, tz) {
    var WM = G.WorldMap, W = G.World;
    if (!WM || !PL.yardStatic(WM.rows, tx, tz) || !W.isWalkableTile(tx, tz) || (W.isBlocked && W.isBlocked(tx, tz)) || bushes()[tx + ',' + tz]) return false;
    return !W.listInteractables().some(function (a) { return a.tile && a.tile.tx === tx && a.tile.tz === tz || a.stand && a.stand.tx === tx && a.stand.tz === tz; });
  }
  PL.setCtx({ hm: HM, furn: F, yardOK: yardOK });
  Pl.yardOK = yardOK;
  function scene() { return G.Scenes.current === 'house' ? 'house' : 'outdoor'; }
  function org(sp) { return sp === 'h' ? [H.OX, H.OZ] : [0, 0]; }
  function sp(p) { return p.k === 'y' ? 'y' : 'h'; }

  /* ---------------------------------------------------------------- merged rendering */
  var geos = { b: new THREE.BoxGeometry(1, 1, 1), c: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), k: new THREE.CylinderGeometry(0.3, 0.5, 1, 10), s: new THREE.SphereGeometry(0.5, 10, 7) };
  function placeMat(p) {
    var it = F.get(p.id), d, ry = 0, pos = new THREE.Vector3(), q = new THREE.Quaternion();
    if (p.k === 'w') { if (p.side === 'n') pos.set(p.i + 0.5, it.mountY, 0); else { pos.set(0, it.mountY, p.i + 0.5); ry = Math.PI / 2; } }
    else { d = PL.dims(it, p.r); pos.set(p.x + d[0] / 2, 0, p.z + d[1] / 2); ry = (p.r & 3) * Math.PI / 2; }
    return new THREE.Matrix4().compose(pos, q.setFromAxisAngle(Y, ry), ONE);
  }
  function stageOf(p) { var it = F.get(p.id); return it && it.decay ? F.decayStage(p.d, G.Time ? G.Time.day : 1) : 0; }
  function mk(geo, mat) { return new THREE.Mesh(geo, mat); }
  var roots = { h: new THREE.Group(), y: new THREE.Group() }, meshes = { h: null, y: null };
  roots.h.position.set(H.OX, 0, H.OZ); roots.h.name = 'decor_house'; roots.y.name = 'decor_yard';
  R.scene.add(roots.h); R.scene.add(roots.y);
  function rebuild(s) {
    var parts = [], m;
    if (meshes[s]) { roots[s].remove(meshes[s]); meshes[s].geometry.dispose(); meshes[s] = null; }
    list.forEach(function (p) {
      if (sp(p) !== s || !F.get(p.id)) return;
      var M = placeMat(p);
      F.parts(p.id, stageOf(p)).forEach(function (q) { var pt = G.Models.part(geos[q[0]], q[1], [q[2], q[3], q[4]], [q[8], q[9], q[10]], [q[5], q[6], q[7]]); pt.matrix.premultiply(M); parts.push(pt); });
    });
    dirty[s] = false;
    if (!parts.length) return;
    m = mk(G.Models.mergeParts(parts), G.Models.material('prop')); m.name = 'decor_' + s + '_merged';
    R.addOutline(m); roots[s].add(m); meshes[s] = m;
  }
  function refresh() { if (dirty.h) rebuild('h'); if (dirty.y) rebuild('y'); }
  function sync() { var c = G.Scenes.current; roots.h.visible = c === 'house'; roots.y.visible = c !== 'house'; }


  /* ---------------------------------------------------------------- yard outline (soft green area + edge strips, 2 draw calls, outdoors only while decorating) */
  var oRoot = new THREE.Group(), oMesh = null, oMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  oRoot.name = 'yard_outline'; oRoot.visible = false; R.scene.add(oRoot);
  function buildOutline() {
    var WM = G.WorldMap, b = WM && PL.houseBox(WM.rows), ok = {}, pos = [], col = [], idx = [], x, z, t = 0.09, R6 = PL.YARD.reach, g;
    function quad(r, c) { var n = pos.length / 3, i; pos.push(r[0], 0.04, r[1], r[0], 0.04, r[3], r[2], 0.04, r[3], r[2], 0.04, r[1]); for (i = 0; i < 4; i++) col.push(c[0], c[1], c[2]); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); }
    if (oMesh) { oRoot.remove(oMesh); oMesh.geometry.dispose(); oMesh = null; }
    if (!b) return;
    for (z = b[1] - R6; z <= b[3] + R6; z++) for (x = b[0] - R6; x <= b[2] + R6; x++) if (yardOK(x, z)) ok[x + ',' + z] = 1;
    Object.keys(ok).forEach(function (k) {
      var c = k.split(','), tx = +c[0], tz = +c[1], f = [0.35, 0.7, 0.4], e = [0.95, 1, 0.85];
      quad([tx + 0.04, tz + 0.04, tx + 0.96, tz + 0.96], f);
      if (!ok[(tx - 1) + ',' + tz]) quad([tx, tz, tx + t, tz + 1], e);
      if (!ok[(tx + 1) + ',' + tz]) quad([tx + 1 - t, tz, tx + 1, tz + 1], e);
      if (!ok[tx + ',' + (tz - 1)]) quad([tx, tz, tx + 1, tz + t], e);
      if (!ok[tx + ',' + (tz + 1)]) quad([tx, tz + 1 - t, tx + 1, tz + 1], e);
    });
    if (!pos.length) return;
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    oMesh = mk(g, oMat); oMesh.renderOrder = 4; oMesh.frustumCulled = false; oRoot.add(oMesh);
  }
  function showOutline(on) { if (on) buildOutline(); oRoot.visible = !!on && !!oMesh; }

  /* ---------------------------------------------------------------- ghost + highlights (3 tiny unlit meshes) */
  var gMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 });
  var qGeo = new THREE.PlaneGeometry(1, 1);   // shared unit quad: floor quads are laid flat with rotation.x
  function hl(flat) { var m = mk(qGeo, new THREE.MeshBasicMaterial({ color: 0x66dd77, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 5; if (flat) m.rotation.x = -Math.PI / 2; return m; }
  var gRoot = new THREE.Group(), gMesh = mk(geos.b, gMat), gFloor = hl(true), gWall = hl(false), sFloor = hl(true), sWall = hl(false);
  gMesh.visible = false; gMesh.matrixAutoUpdate = false; gMesh.frustumCulled = false;
  sFloor.material.color.set(0xffd166); sWall.material.color.set(0xffd166);
  [gMesh, gFloor, gWall, sFloor, sWall].forEach(function (o) { gRoot.add(o); }); gRoot.visible = false; R.scene.add(gRoot);
  function mark(p, fl, wl, y) {   // put a flat / wall quad on the footprint of p (local to gRoot origin)
    var it = F.get(p.id), d;
    if (p.k === 'w') { wl.visible = true; fl.visible = false; wl.position.set(p.side === 'n' ? p.i + 0.5 : 0.03, it.mountY, p.side === 'n' ? 0.03 : p.i + 0.5); wl.rotation.y = p.side === 'n' ? 0 : Math.PI / 2; wl.scale.set(0.9, 0.9, 1); }
    else { d = PL.dims(it, p.r); fl.visible = true; wl.visible = false; fl.position.set(p.x + d[0] / 2, y, p.z + d[1] / 2); fl.scale.set(d[0], d[1], 1); }
  }
  function drawGhost() {
    var o;
    gMesh.visible = gFloor.visible = gWall.visible = false;
    if (held) {
      o = org(sp(held)); gRoot.position.set(o[0], 0, o[1]);
      gMesh.geometry = F.geometry(held.id) || gMesh.geometry; gMesh.matrix.copy(placeMat(held)); gMesh.matrix.elements[13] += follow ? 0.12 + 0.05 * Math.sin(bobT) : 0; gMesh.matrixWorldNeedsUpdate = true; gMesh.visible = true; gMat.opacity = follow ? 0.5 : 0.85;
      mark(held, gFloor, gWall, 0.05);
      var c = why ? 0xee6655 : 0x66dd77; gFloor.material.color.set(c); gWall.material.color.set(c); gMat.color.set(why ? 0xffb0a4 : 0xc8ffc8);
    }
    sFloor.visible = sWall.visible = false;
    if (held && !follow) { mark(held, sFloor, sWall, 0.045); sFloor.scale.multiplyScalar(1.1); sWall.scale.multiplyScalar(1.1); }
    if (!held && sel >= 0 && list[sel]) { gMat.opacity = 0.72; o = org(sp(list[sel])); if (!held) gRoot.position.set(o[0], 0, o[1]); mark(list[sel], sFloor, sWall, 0.06); }
    gRoot.visible = !!(held || (sel >= 0 && list[sel]));
  }

  /* ---------------------------------------------------------------- UI bar */
  var root = document.createElement('div'); root.id = 'tv-place'; root.hidden = true;
  var hint = document.createElement('div'); hint.className = 'pl-hint'; var barEl = document.createElement('div'); barEl.className = 'pl-bar';
  root.appendChild(hint); root.appendChild(barEl); document.body.appendChild(root);
  ['pointerdown', 'pointerup', 'pointermove'].forEach(function (t) { root.addEventListener(t, function (e) { e.stopPropagation(); }); });
  function bar(btns) {
    barEl.innerHTML = '';
    btns.forEach(function (b) {
      var x = document.createElement('button'); x.type = 'button'; x.className = 'pl-btn ' + (b.cls || ''); x.innerHTML = b.html; x.disabled = !!b.off;
      x.addEventListener('click', function () { UI.sfx('tap'); b.fn(); }); barEl.appendChild(x);
    });
  }
  function ui() {
    var it, p;
    if (held) {
      it = F.get(held.id); hint.textContent = why || (it.name + (follow ? ': chạm vào sàn để đặt xuống.' : ': chạm vào món để nhấc lên, nhấn Đặt để xác nhận.'));
      hint.className = 'pl-hint' + (why ? ' bad' : '');
      bar([it.place === 'wall' ? null : { html: '↻<span>Xoay (R)</span>', fn: rotate }, { html: '✕<span>Hủy</span>', cls: 'no', fn: cancelHold }, { html: '✓<span>Đặt</span>', cls: 'ok', off: !!why, fn: confirmHold }].filter(Boolean));
    } else if (sel >= 0 && list[sel]) {
      p = list[sel]; it = F.get(p.id); hint.className = 'pl-hint'; hint.textContent = it.name;
      bar([{ html: '✥<span>Di chuyển</span>', fn: startMove }, it.decay ? null : { html: '⤓<span>Cất vào kho</span>', fn: storeSel }, { html: '₲<span>Bán +' + F.sellPrice(p.id) + '</span>', cls: 'no', fn: sellSel }, { html: '←<span>Quay lại</span>', fn: function () { sel = -1; ui(); drawGhost(); } }].filter(Boolean));
    } else {
      hint.className = 'pl-hint'; hint.textContent = 'Chạm vào đồ đã đặt để chỉnh sửa, hoặc mở Kho để đặt thêm.';
      bar([{ html: '▦<span>Kho đồ</span>', fn: Pl.openPicker }, { html: '✓<span>Xong</span>', cls: 'ok', fn: Pl.close }]);
    }
  }

  /* ---------------------------------------------------------------- placement flow */
  function firstValid(it, k) {   // a sensible start spot for a new item
    var c, i, a, segs;
    if (k === 'f') { c = HM.floorTiles(); for (i = 0; i < c.length; i++) for (a = 0; a < 2; a++) { var p = { id: it.id, k: 'f', x: c[i].ix, z: c[i].iz, r: a }; if (!PL.validate(list, p, -1)) return p; } }
    else if (k === 'w') { segs = PL.wallSegs(); for (i in segs) { var q = { id: it.id, k: 'w', x: 0, z: 0, r: 0, side: i.charAt(0), i: +i.slice(2) }; if (!PL.validate(list, q, -1)) return q; } }
    else { for (var z = YR.z0; z <= YR.z1; z++) for (var x = YR.x0; x <= YR.x1; x++) { var y = { id: it.id, k: 'y', x: x, z: z, r: 0 }; if (!PL.validate(list, y, -1)) return y; } }
    return k === 'w' ? { id: it.id, k: 'w', x: 0, z: 0, r: 0, side: 'n', i: 0 } : { id: it.id, k: k, x: k === 'y' ? 9 : 1, z: k === 'y' ? 14 : 1, r: 0 };
  }
  function check() { why = held ? PL.validate(list, held, -1) : ''; ui(); drawGhost(); }
  function startHold(p, from) { held = p; follow = true; moved = from || null; sel = -1; check(); }
  function rotate() {
    var it, d0, d1, cx, cz;
    if (!held || F.get(held.id).place === 'wall') return;
    it = F.get(held.id); d0 = PL.dims(it, held.r); cx = held.x + d0[0] / 2; cz = held.z + d0[1] / 2;
    held.r = (held.r + 1) & 3; d1 = PL.dims(it, held.r); held.x = Math.round(cx - d1[0] / 2); held.z = Math.round(cz - d1[1] / 2); check();
  }
  function cancelHold() { if (moved) { list.push(moved); dirty[sp(moved)] = true; refresh(); } held = moved = null; check(); }
  function confirmHold() {
    var p = held, again;
    if (!p || PL.validate(list, p, -1)) { check(); return; }
    if (!moved && !F.remove(p.id, 1)) { UI.toast('Bạn hết món này rồi.', 'warn'); cancelHold(); return; }
    if (F.get(p.id).decay && p.d == null) p.d = G.Time ? G.Time.day : 1;   // placement day of a decaying piece (moving keeps it)
    list.push(p); dirty[sp(p)] = true; refresh(); UI.sfx('pop');
    if (G.Save.request) G.Save.request(); E.emit('furniture:placed', { n: list.length });
    again = !moved && F.count(p.id) > 0; moved = null;
    held = again ? { id: p.id, k: p.k, x: p.x, z: p.z, r: p.r, side: p.side, i: p.i } : null; check();
  }
  function startMove() { var p = list.splice(sel, 1)[0]; dirty[sp(p)] = true; refresh(); startHold({ id: p.id, k: p.k, x: p.x, z: p.z, r: p.r, side: p.side, i: p.i, d: p.d }, p); }
  function storeSel() { var p = list.splice(sel, 1)[0]; F.add(p.id, 1); dirty[sp(p)] = true; refresh(); sel = -1; UI.sfx('pop'); if (G.Save.request) G.Save.request(); ui(); drawGhost(); }
  function sellSel() {
    var p = list[sel], it = F.get(p.id), g = F.sellPrice(p.id);
    UI.confirm({ title: 'Bán lại ' + it.name + '?', text: 'Bạn nhận lại ' + g + 'g (' + Math.round(g / it.price * 100) + '% giá mua).', yes: 'Bán', no: 'Thôi' }, function (ok) {
      if (!ok || list[sel] !== p) return;
      list.splice(sel, 1); G.State.addMoney(g); dirty[sp(p)] = true; refresh(); sel = -1; UI.sfx('pop');
      E.emit('shop:transaction', { kind: 'decor-sell', id: p.id, n: 1, cost: -g }); ui(); drawGhost();
    });
  }
  function begin(id) {
    var it = F.get(id), k = PL.kindFor(it, scene());
    if (k === 'y' && scene() === 'house') { UI.toast('Món này đặt ngoài sân nhé.', 'warn'); return; }
    if (k !== 'y' && scene() !== 'house') { UI.toast('Món này đặt trong nhà nhé.', 'warn'); return; }
    startHold(firstValid(it, k));
  }

  /* ---------------------------------------------------------------- picker panel (decor inventory) */
  Pl.openPicker = function () {
    if (!Pl.active || UI.panelOpen) return;
    var here = scene() === 'house' ? 'h' : 'y', tab = here, p = document.createElement('div'), have = F.owned();
    p.className = 'tv-wide tv-furn';
    function sideOf(it) { return it.place === 'yard' ? 'y' : it.place === 'any' ? 'a' : 'h'; }
    function draw() {
      var h2 = document.createElement('h2'), tabs = document.createElement('div'), grid = document.createElement('div'), row = document.createElement('div'), cl = document.createElement('button'), shown = 0, hint = tab === here ? '' : (here === 'h' ? 'Ra ngoài sân để đặt những món này nhé.' : 'Vào trong nhà để đặt những món này nhé.');
      p.innerHTML = ''; h2.textContent = 'Kho trang trí'; p.appendChild(h2);
      tabs.className = 'pl-tabs';
      [['h', 'Trong nhà'], ['y', 'Ngoài sân']].forEach(function (t) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pl-tab' + (tab === t[0] ? ' on' : ''); b.textContent = t[1];
        b.addEventListener('click', function () { UI.sfx('tap'); tab = t[0]; draw(); }); tabs.appendChild(b);
      });
      p.appendChild(tabs);
      if (hint) { var hp = document.createElement('p'); hp.className = 'pl-tabhint'; hp.textContent = hint; p.appendChild(hp); }
      grid.className = 'furn-grid tv-scroll'; p.appendChild(grid);
      have.forEach(function (o) {
        var it = F.get(o.id), sd = sideOf(it), ok = tab === here, c;
        if (sd !== 'a' && sd !== tab) return;
        shown++; c = document.createElement('button');
        c.type = 'button'; c.className = 'furn-card' + (ok ? '' : ' poor'); c.innerHTML = '<div class="furn-ci">' + F.icon(it.id, 56) + '</div><div class="furn-cn"></div><div class="furn-own">x' + o.n + '</div>';
        c.querySelector('.furn-cn').textContent = it.name;
        c.addEventListener('click', function () { UI.sfx('tap'); if (!ok) { UI.toast(hint, 'warn'); return; } UI.closePanel(); begin(o.id); });
        grid.appendChild(c);
      });
      if (!shown) { var t2 = document.createElement('p'); t2.textContent = have.length ? 'Chưa có món nào cho khu vực này.' : 'Chưa có đồ trang trí nào. Ghé Tiệm nội thất của cô Lụa nhé!'; p.insertBefore(t2, grid); }
      row.className = 'tv-row'; cl.type = 'button'; cl.className = 'furn-btn'; cl.textContent = 'Đóng'; cl.addEventListener('click', function () { UI.sfx('tap'); UI.closePanel(); }); row.appendChild(cl); p.appendChild(row);
    }
    draw();
    UI.openPanel(p, {});
  };

  /* ---------------------------------------------------------------- pointer (canvas) + keys; swallowed in capture phase so camera/tap/joystick never see them */
  var v0 = new THREE.Vector3();
  function moveGhost(x, y) {
    var t = R.screenToGround(x, y, 0, v0), it, o, lx, lz, d, side;
    if (!t || !held) return;
    it = F.get(held.id); o = org(sp(held)); lx = t.x - o[0]; lz = t.z - o[1];
    if (held.k === 'w') { side = lz <= lx ? 'n' : 'w'; held.side = side; held.i = Math.max(0, Math.min((side === 'n' ? HM.width : HM.depth) - 1, Math.floor(side === 'n' ? lx : lz))); }
    else { d = PL.dims(it, held.r); held.x = Math.floor(lx - d[0] / 2 + 0.5); held.z = Math.floor(lz - d[1] / 2 + 0.5); }
    check();
  }
  function pickAt(x, y) {
    var s = scene() === 'house' ? 'h' : 'y', o = org(s), pts = [R.screenToGround(x, y, 0.6, new THREE.Vector3()), R.screenToGround(x, y, 0, new THREE.Vector3())], i, j, k, c, p, w;
    for (i = list.length - 1; i >= 0; i--) {
      p = list[i]; if (sp(p) !== s) continue;
      if (p.k === 'w') { w = R.screenToGround(x, y, F.get(p.id).mountY, new THREE.Vector3()); if (!w) continue; var lx = w.x - o[0], lz = w.z - o[1]; if (p.side === 'n' ? (Math.floor(lx) === p.i && lz < 0.9) : (Math.floor(lz) === p.i && lx < 0.9)) return i; continue; }
      c = PL.cells(p);
      for (j = 0; j < pts.length; j++) if (pts[j]) for (k = 0; k < c.length; k++) if (Math.floor(pts[j].x - o[0]) === c[k][0] && Math.floor(pts[j].z - o[1]) === c[k][1]) return i;
    }
    return -1;
  }
  function hitHeld(x, y) {   // pointer over the set-down ghost's footprint?
    var o = org(sp(held)), t, c, k, w;
    if (held.k === 'w') { w = R.screenToGround(x, y, F.get(held.id).mountY, new THREE.Vector3()); return !!w && (held.side === 'n' ? Math.floor(w.x - o[0]) === held.i : Math.floor(w.z - o[1]) === held.i); }
    t = R.screenToGround(x, y, 0, new THREE.Vector3()); c = PL.cells(held);
    for (k = 0; k < c.length; k++) if (t && Math.floor(t.x - o[0]) === c[k][0] && Math.floor(t.z - o[1]) === c[k][1]) return true;
    return false;
  }
  (function bob() { if (Pl.active && held && follow) { bobT += 0.18; drawGhost(); } requestAnimationFrame(bob); })();
  function onPtr(e) {
    var cv = G.Input && G.Input.canvas;
    if (!Pl.active || UI.panelOpen || !cv) return;
    if (!drag && e.target !== cv) return;
    if (e.type === 'pointerdown') { if (e.pointerType === 'mouse' && e.button !== 0) return; if (drag) { e.stopPropagation(); return; } drag = { id: e.pointerId, x: e.clientX, y: e.clientY, mv: false }; if (held) { if (follow || !hitHeld(e.clientX, e.clientY)) moveGhost(e.clientX, e.clientY); follow = true; ui(); drawGhost(); } }
    else if (e.type === 'pointermove') {
      if (drag && drag.id === e.pointerId) { if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 8) drag.mv = true; if (held && follow) moveGhost(e.clientX, e.clientY); }
      else if (!drag && held && follow && e.pointerType === 'mouse' && e.target === cv) moveGhost(e.clientX, e.clientY);
    } else if (drag && drag.id === e.pointerId) {
      if (!held && !drag.mv) { var i = pickAt(e.clientX, e.clientY); sel = i; UI.sfx(i >= 0 ? 'tap' : 'blip'); ui(); drawGhost(); }
      if (held) { follow = false; ui(); drawGhost(); }
      drag = null;
    } else return;
    e.stopPropagation(); e.preventDefault();
  }
  function onKey(e) {
    if (!Pl.active || UI.panelOpen) return;
    var k = e.key;
    if (k === 'r' || k === 'R') { if (held) rotate(); }
    else if (k === 'Enter') { if (held) confirmHold(); }
    else if (k === 'Escape') { if (held) cancelHold(); else if (sel >= 0) { sel = -1; ui(); drawGhost(); } else Pl.close(); }
    else return;
    e.stopPropagation(); e.preventDefault();
  }
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (t) { window.addEventListener(t, onPtr, true); });
  window.addEventListener('keydown', onKey, true);

  /* ---------------------------------------------------------------- open / close */
  Pl.open = function () {
    var P = G.Player;
    if (Pl.active) return true;
    if (UI.panelOpen) UI.closePanel();
    if (P && P.isLocked && P.isLocked()) return false;
    Pl.active = true; held = moved = null; sel = -1; drag = null; why = '';
    if (P && P.lock) P.lock('decor'); if (G.Input && G.Input.cancel) G.Input.cancel();
    root.hidden = false; document.body.classList.add('pl-on'); showOutline(scene() !== 'house'); ui(); drawGhost();
    setTimeout(function () { if (Pl.active && !held) Pl.openPicker(); }, 30);
    return true;
  };
  Pl.close = function () {
    if (!Pl.active) return;
    if (held) cancelHold();
    Pl.active = false; held = moved = null; sel = -1; drag = null; root.hidden = true; document.body.classList.remove('pl-on'); showOutline(false); drawGhost();
    if (G.Player && G.Player.unlock) G.Player.unlock('decor');
    if (G.Save.request) G.Save.request();
  };
  Pl.list = function () { return list.slice(); };
  /* Stage 17 FURN: put one placed piece back into the inventory (used by the one-bed rule). */
  Pl.store = function (p) {
    var i = -1, q;
    list.forEach(function (o, j) { if (o.id === p.id && o.k === p.k && o.x === p.x && o.z === p.z && o.r === p.r && o.side === p.side && o.i === p.i) i = j; });
    if (i < 0) return false;
    q = list.splice(i, 1)[0]; F.add(q.id, 1); dirty[sp(q)] = true; refresh(); sel = -1;
    if (G.Save.request) G.Save.request(); E.emit('furniture:placed', { n: list.length }); return true;
  };
  Pl.count = function () { return list.length; };
  Pl.place = function (p) { var r = PL.validate(list, p, -1); if (!r) { list.push(p); dirty[sp(p)] = true; refresh(); } return r; };

  /* ---------------------------------------------------------------- save, migration, re-validation */
  function fixAll(quiet) {
    var r = PL.revalidate(list);
    if (r.dropped.length) {
      list = r.kept; r.dropped.forEach(function (p) { F.add(p.id, 1); }); dirty.h = dirty.y = true;
      if (!quiet) UI.toast('Có đồ trang trí không còn vừa chỗ, đã cất vào kho.', 'warn');
      if (G.Save.request) G.Save.request();
    }
    if (sel >= list.length) sel = -1;
    refresh(); sync();
  }
  G.Save.register('furnplace', {
    save: function () { return { v: 1, list: PL.pack(list) }; },
    load: function (s) { loading = true; list = PL.unpack(s && s.list); dirty.h = dirty.y = true; },   // old saves: no key -> empty
    reset: function () { loading = false; list = []; held = moved = null; sel = -1; dirty.h = dirty.y = true; refresh(); }
  });
  /* Decay (host, solo and guests alike: stage is a pure function of placement day + Time.day): break pieces that reached the last stage, restyle the rest. */
  function decayTick() {
    var today = G.Time ? G.Time.day : 1, any = false, broke = 0, keep = [];
    list.forEach(function (p) {
      var it = F.get(p.id);
      if (it && it.decay) { any = true; if (p.d == null || p.d > today) p.d = today; if (F.decayStage(p.d, today) >= F.DECAY_DAYS) { broke++; return; } }
      keep.push(p);
    });
    if (!any) return;
    if (broke) { list = keep; sel = -1; if (G.Save.request) G.Save.request(); UI.toast('Nệm cũ đã hỏng và bị bỏ đi', 'warn'); if (Pl.active) { ui(); } E.emit('furniture:placed', { n: list.length }); }
    dirty.h = dirty.y = true; refresh(); if (Pl.active) drawGhost();
  }
  E.on('day:started', decayTick);
  ['net:snapshot', 'net:section'].forEach(function (n) { E.on(n, function () { decayTick(); fixAll(true); }); });   // net:section = Stage 33 live update from WorldSync
  E.on('save:loaded', function () { loading = false; decayTick(); fixAll(true); });
  E.on('house:tier', function () { if (!loading) { if (Pl.active && held) cancelHold(); fixAll(false); } });
  E.on('scene:changed', function () { sync(); if (Pl.active) Pl.close(); });
  sync();
})();
