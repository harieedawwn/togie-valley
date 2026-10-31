/* Togie Valley - landmarks.js (Stage 15F2a; Round 2 stage 7 = Vietnamese look via js/landmarks_vn.js): rice mill with cọn nước (rotating bamboo wheel), chòi lúa, cây đa + miếu
 * with hanging ribbons, bảng tin đình làng, giỏ ủ phân, bể nước. Old names: windmill, shed, shrine, board, compost, trough. Static geometry is one merged mesh (+ outline); the sails are one
 * rotating mesh; ribbons + pinned notes are one CPU-animated double-sided cloth mesh. Solid tiles are registered with World.setBlocked.
 * Layout is a pure block verified by tools/check.js section 17 (grass only, off paths/field/water, no overlap with scenery, reachability).
 * Added draw calls: 5 (static 2, sails 2, cloth 1). Quality gating: cloth only when Quality.sway > 0, sails always (one transform).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Decor || !G.Scenery || !G.VNKit || !G.LandmarksVN) { console.error('[landmarks] missing deps'); return; }
  var R = G.Render, Mo = G.Models, W = G.World, U = G.util, E = G.Events;
  var LM = G.Landmarks = { group: null, layout: null, stats: null };

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    // visual extents [x0, z0, x1, z1] in tiles (used for overlap + scenery clearance checks)
    ext: { windmill: [36, 9, 39, 12], shed: [19, 6, 21, 8], shrine: [5, 17, 8, 20], compost: [10, 15, 11, 16], trough: [10, 17, 12, 18], board: [37, 20, 39, 21], quan: [40, 21, 42, 23], dinh: [35, 21, 37, 23] },
    // solid tiles
    blocked: [[36, 9], [37, 9], [38, 9], [36, 10], [37, 10], [38, 10], [36, 11], [37, 11], [38, 11],
      [19, 6], [20, 6], [19, 7], [20, 7],
      [6, 18], [5, 19], [6, 19], [7, 19],
      [10, 15], [10, 17], [11, 17], [37, 20], [38, 20],
      [40, 21], [41, 21], [35, 21], [36, 21]],
    // [id, tx, tz, facing, hint]  (stand tile = tile minus facing vector, i.e. south of the tile for 'n')
    spots: [['noticeboard', 37, 20, 'n', 'Đọc bảng tin'], ['shrine', 6, 19, 'n', 'Ngắm cây cổ thụ']]
  };
  /*LAYOUT-END*/
  LM.layout = LAYOUT;

  var PI = Math.PI, LV = G.LandmarksVN, RIBBONS = LV ? LV.ribbons : [];   // Round 2 stage 7: geometry lives in js/vn_kit.js + js/landmarks_vn.js

  /* ------------------------------------------------------------ cloth: ribbons + fluttering notes (CPU, one mesh) */
  var cloth = { pos: [], col: [], w: [], nx: [], nz: [], ph: [], base: null, arr: null, geo: null, mesh: null, n: 0 };
  function cv(x, y, z, c, w, nx, nz, ph) { cloth.pos.push(x, y, z); cloth.col.push(c.r, c.g, c.b); cloth.w.push(w); cloth.nx.push(nx); cloth.nz.push(nz); cloth.ph.push(ph); }
  function strip(x, y, z, len, hw, tx, tz, c, nx, nz, ph, S) {   // hanging strip, top at y, width along (tx,tz), swing along (nx,nz)
    var s, y0, y1, w0, w1, col = new THREE.Color(c), l0, l1;
    for (s = 0; s < S; s++) {
      y0 = y - len * s / S; y1 = y - len * (s + 1) / S; w0 = s / S; w1 = (s + 1) / S;
      l0 = hw * (1 - w0 * 0.35); l1 = hw * (1 - w1 * 0.35);
      cv(x - tx * l0, y0, z - tz * l0, col, w0, nx, nz, ph); cv(x + tx * l0, y0, z + tz * l0, col, w0, nx, nz, ph); cv(x - tx * l1, y1, z - tz * l1, col, w1, nx, nz, ph);
      cv(x + tx * l0, y0, z + tz * l0, col, w0, nx, nz, ph); cv(x + tx * l1, y1, z + tz * l1, col, w1, nx, nz, ph); cv(x - tx * l1, y1, z - tz * l1, col, w1, nx, nz, ph);
    }
  }
  function flagVN(f) {   // Vietnamese flag: red field (6 columns, hoist w=0) + yellow 5-point star (fan, front+back copy 0.003 apart), same cloth mesh
    var S = 6, i, k, j, zz, x0, x1, y1 = f.y + f.h, red = new THREE.Color(0xda251d), yel = new THREE.Color(0xffff00), cx = f.x + f.w / 2, cy = f.y + f.h / 2, R = f.h * 0.3, r = R * 0.382, px = [], py = [], a;
    for (i = 0; i < S; i++) {
      x0 = f.x + f.w * i / S; x1 = f.x + f.w * (i + 1) / S;
      cv(x0, f.y, f.z, red, i / S, 0, 1, 0.3); cv(x1, f.y, f.z, red, (i + 1) / S, 0, 1, 0.3); cv(x0, y1, f.z, red, i / S, 0, 1, 0.3);
      cv(x1, f.y, f.z, red, (i + 1) / S, 0, 1, 0.3); cv(x1, y1, f.z, red, (i + 1) / S, 0, 1, 0.3); cv(x0, y1, f.z, red, i / S, 0, 1, 0.3);
    }
    for (k = 0; k < 10; k++) { a = Math.PI / 2 + k * Math.PI / 5; px.push(cx + Math.cos(a) * (k % 2 ? r : R)); py.push(cy + Math.sin(a) * (k % 2 ? r : R)); }
    for (zz = -1; zz <= 1; zz += 2) for (k = 0; k < 10; k++) {
      j = (k + 1) % 10;
      cv(cx, cy, f.z + zz * 0.003, yel, (cx - f.x) / f.w, 0, 1, 0.3); cv(px[k], py[k], f.z + zz * 0.003, yel, (px[k] - f.x) / f.w, 0, 1, 0.3); cv(px[j], py[j], f.z + zz * 0.003, yel, (px[j] - f.x) / f.w, 0, 1, 0.3);
    }
  }
  function buildCloth() {
    var i, rb, tx, tz;
    for (i = 0; i < RIBBONS.length; i++) {
      rb = RIBBONS[i]; tx = -Math.sin(rb[5]); tz = Math.cos(rb[5]);
      strip(rb[0], rb[1], rb[2], rb[3], 0.045, tx, tz, rb[4], 0.92, 0.39, i * 1.7, 3);
      strip(rb[0], rb[1], rb[2], rb[3] * 0.6, 0.02, tx, tz, 0xffffff, 0.92, 0.39, i * 1.7 + 0.5, 2);   // thin tail
    }
    strip(38.5, 1.28, 20.55, 0.22, 0.09, 1, 0, 0xfff7e0, 0, 1, 0.4, 2);           // two notes pinned on the board, loose corners flutter
    strip(37.55, 1.2, 20.55, 0.2, 0.08, 1, 0, 0xffe6a8, 0, 1, 2.2, 2);
    if (LV && LV.flag) flagVN(LV.flag);
    cloth.n = cloth.pos.length / 3;
    cloth.base = new Float32Array(cloth.pos); cloth.arr = new Float32Array(cloth.pos);
    cloth.geo = new THREE.BufferGeometry();
    cloth.geo.setAttribute('position', new THREE.BufferAttribute(cloth.arr, 3)); cloth.geo.setAttribute('color', new THREE.Float32BufferAttribute(cloth.col, 3));
    cloth.mesh = new THREE.Mesh(cloth.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    cloth.mesh.name = 'landmarks_cloth'; cloth.mesh.frustumCulled = false; LM.group.add(cloth.mesh);
  }

  /* ------------------------------------------------------------ animation frame (priority 10.7) */
  var S = { ready: false, wx: 37.5, wz: 11.5, sx: 6.5, sz: 18.5, bx: 38, bz: 20.5 }, blades = null, t = 0, noteIdx = 0;
  function onFrame(dt) {
    var P = G.Player && G.Player.pos, dx, dz, q, qSway, gust, sp2, i, vi, w0, wt;
    if (!S.ready || !P || !LM.group.parent || !LM.group.parent.visible) return;
    if (dt > 0.1) dt = 0.1;
    t += dt; gust = G.Time && (G.Time.weather === 'rain' || G.Time.weather === 'storm') ? 1.8 : 1;
    dx = P.x - S.wx; dz = P.z - S.wz;
    if (dx * dx + dz * dz < 1600) { sp2 = (0.5 + 0.14 * Math.sin(t * 0.37) + 0.05 * Math.sin(t * 1.3)) * gust; blades.rotation.z -= sp2 * dt; }
    q = G.Quality && G.Quality.def ? G.Quality.def() : null; qSway = q ? q.sway : 1;
    if (qSway <= 0) return;
    dx = P.x - S.sx; dz = P.z - S.sz; var nearS = dx * dx + dz * dz < 625;
    dx = P.x - S.bx; dz = P.z - S.bz; var nearB = dx * dx + dz * dz < 625;
    cloth.mesh.visible = nearS || nearB; if (!cloth.mesh.visible) return;
    for (i = 0; i < cloth.n; i++) {
      w0 = cloth.w[i]; vi = i * 3; if (w0 < 0.01) continue;
      wt = (Math.sin(t * 1.7 + cloth.ph[i] + cloth.base[vi] * 0.9) * 0.07 + Math.sin(t * 3.1 + cloth.ph[i] * 2) * 0.02) * w0 * qSway * gust;
      if (cloth.base[vi + 2] > 19.5) wt *= 0.45;   // board notes move less
      cloth.arr[vi] = cloth.base[vi] + cloth.nx[i] * wt; cloth.arr[vi + 1] = cloth.base[vi + 1] - Math.abs(wt) * 0.25 * w0; cloth.arr[vi + 2] = cloth.base[vi + 2] + cloth.nz[i] * wt;
    }
    cloth.geo.attributes.position.needsUpdate = true;
  }

  /* ------------------------------------------------------------ interactions (Vietnamese texts) */
  var NOTES = [
    ['Thông báo: Hội chợ thu hoạch năm nay dời sang cuối thu. Ai trồng được củ cải to nhất sẽ được treo tên lên bảng vàng!',
      'Nhắn nhủ: Nhờ ai đó mang giúp ít bột mì mới đến cối xay gió. Bánh mì cuối tuần sắp hết rồi.'],
    ['Tìm đồ: Ai thấy chiếc cần câu tre của ông Sáu rơi gần cầu tàu thì báo giúp nhé. Ông nhớ nó lắm.',
      'Mực đã nhòe: "Ngày xưa, mỗi mùa trăng tròn cả làng thắp đèn lồng bên hồ. Không biết ai còn nhớ bài hát ấy..."'],
    ['Nhắn nhủ: Cây cổ thụ phía tây đã đứng đó lâu hơn bất kỳ ai trong thung lũng. Nhớ buộc một dải lụa cầu bình an nhé.',
      'Tờ giấy cũ ghim ở góc: "Hạt giống tốt nhất luôn được cất ở nơi ấm nhất." Hình như là chữ của một người làm vườn lâu năm.']
  ];
  function onNotice() {
    if (!G.UI || !G.UI.dialog) return;
    var set = NOTES[noteIdx++ % NOTES.length];
    G.UI.dialog({ name: 'Bảng tin làng', lines: set });
  }
  function onShrine() {
    if (!G.UI || !G.UI.dialog) return;
    G.UI.dialog({ name: 'Cây cổ thụ', lines: ['Những dải lụa đã bạc màu theo năm tháng. Dưới gốc cây có một cái bát nhỏ đựng vài đồng xu cũ và quả táo còn tươi.',
      'Bạn lặng lẽ chắp tay. Gió khẽ lay những dải lụa, nghe như ai đó đang thì thầm ngày xưa.'] });
  }

  /* ------------------------------------------------------------ build */
  LM.build = function () {
    if (S.ready) return;
    var parent = G.Scenery.group || G.Decor.group, L = [], m;
    LM.group = new THREE.Group(); LM.group.name = 'landmarks'; parent.add(LM.group);
    LAYOUT.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    var K = G.VNKit.make(); LV.windmill(K); LV.shed(K); LV.shrine(K); LV.board(K); LV.compost(K); LV.trough(K); LV.quan(K); LV.dinh(K);
    L = K.L; m = new THREE.Mesh(K.merge(), Mo.material('prop')); m.name = 'landmarks_static'; R.addOutline(m, true, true); LM.group.add(m);
    blades = new THREE.Mesh(LV.wheel(), Mo.material('prop')); blades.name = 'landmarks_wheel'; blades.position.set(37.5, 1.3, 11.5);
    R.addOutline(blades, true, true); LM.group.add(blades);
    buildCloth();
    if (G.Town && G.Town.signPlane && G.Town.group) LV.signs.forEach(function (g) { G.Town.signPlane(g.text, g.bg, g.x, g.y, g.z, g.w, g.h, g.fg); });   // painted sign boards (QUÁN NƯỚC)
    LAYOUT.spots.forEach(function (s) { W.registerInteractable({ id: s[0], type: s[0], tile: { tx: s[1], tz: s[2] }, facing: s[3], hint: s[4] }); });
    E.on('interact:noticeboard', onNotice); E.on('interact:shrine', onShrine);
    LM.stats = { parts: L.length, ribbons: RIBBONS.length, draws: 5 };
    S.ready = true;
    G.Loop.onFrame(onFrame, 10.7);
  };
})();
