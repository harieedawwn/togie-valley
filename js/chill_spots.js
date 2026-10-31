/* Togie Valley - chill_spots.js (Stage 16 F): Game.ChillSpots - six cozy interactive rest spots in empty map areas.
 * bench under a shade tree (clock x2 + slow energy + drifting leaves), hammock between two trees (nap), stone well with bucket
 * (drink + refill watering can), picnic blanket with basket (butterfly), swing, night-only stargazing platform.
 * Static geometry = one merged mesh (+ outline); animated bits: hammock cloth, swing, bucket, butterfly, leaves (instanced), stars.
 * Added draw calls: 8 (static 2, hammock 1, swing 1, bucket 1, butterfly 1, leaves 1, stars 1). Sit routine = Game.Seat.sit.
 * Daily limits live in memory (reset on reload). No new audio: uses existing sfx names. Not viewed visually (no renderer here). */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.World || !G.Scenery) { console.error('[chill] missing deps'); return; }   // G.Seat is used at runtime only (seat.js loads later)
  var R = G.Render, Mo = G.Models, W = G.World, E = G.Events;
  var CS = G.ChillSpots = { group: null, layout: null, stats: null, ready: false };

  /*LAYOUT-BEGIN*/
  var LAYOUT = {
    ext: { bench: [24, 24, 29, 28], hammock: [7, 27, 12, 30], well: [20, 32, 23, 35], picnic: [29, 32, 33, 36], swing: [10, 34, 14, 37], star: [35, 50, 38, 53] },
    blocked: [[26, 24], [7, 28], [8, 28], [10, 28], [11, 28], [21, 33], [31, 34], [10, 35], [12, 35], [37, 51]],
    spots: [['bench', 26, 25, 's', 'Ngồi nghỉ dưới bóng cây'], ['hammock', 9, 28, 'e', 'Nằm võng chợp mắt'], ['well', 21, 33, 'n', 'Múc nước giếng'],
      ['picnic', 30, 34, 'e', 'Ngồi dã ngoại'], ['swing', 11, 35, 's', 'Đu xích đu'], ['star', 36, 51, 'e', 'Ngắm sao đêm']]
  };
  /*LAYOUT-END*/
  CS.layout = LAYOUT;

  var C = { wood: 0xc98b4f, wood2: 0xd9a066, dark: 0x8c5a34, dark2: 0x6b4a32, cream: 0xfff1d0, stone: 0xb7b2a6, stone2: 0x9a958b, iron: 0x5a4a52, water: 0x6cc6de,
    bark: 0x7a5a45, bark2: 0x65483a, leaf: 0x5aa86a, leaf2: 0x7fc27c, leaf3: 0x4f9660, moss: 0x78b36a, red: 0xd9825b, red2: 0xf4e9d2, rope: 0xd8c08a, cloth: 0xe98fa0, cloth2: 0xf6c1a8,
    gold: 0xffd166, bread: 0xe0b46c, apple: 0xd9534f, green: 0x5fb86a, teal: 0x6fa6a8 };
  var PETAL = [0xff9bb3, 0xffd166, 0xffffff, 0xb79cf2, 0xff8f6b];
  var BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), SPH = new THREE.SphereGeometry(0.5, 8, 6), ICO = new THREE.IcosahedronGeometry(0.5, 0);
  var PI = Math.PI, seed = 1609;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function bx(L, w, h, d, c, x, y, z, rx, ry, rz) { L.push(Mo.part(BOX, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d])); }
  function cy(L, r, h, c, x, y, z, rx, ry, rz) { L.push(Mo.part(CYL, c, [x, y, z], [rx || 0, ry || 0, rz || 0], [r * 2, h, r * 2])); }
  function sp(L, r, c, x, y, z, sy) { L.push(Mo.part(SPH, c, [x, y, z], [0, 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function ic(L, r, c, x, y, z, sy, ry) { L.push(Mo.part(ICO, c, [x, y, z], [0, ry || 0, 0], [r * 2, r * 2 * (sy || 1), r * 2])); }
  function tp(L, rt, rb, h, c, x, y, z) { L.push(Mo.part(new THREE.CylinderGeometry(rt, rb, 1, 8), c, [x, y, z], [0, 0, 0], [1, h, 1])); }
  function flowers(L, x, z, n, w) { var i; for (i = 0; i < n; i++) sp(L, 0.03 + rnd() * 0.02, PETAL[(rnd() * 5) | 0], x + (rnd() - 0.5) * w, 0.06 + rnd() * 0.05, z + (rnd() - 0.5) * w); ic(L, 0.08, C.green, x, 0.03, z, 0.5); }
  var K = G.Scenery.kit;
  function tree(L, x, z, h, r) {   // trunk + roots + cluster canopy
    var i, a;
    tp(L, 0.2 * r, 0.34 * r, h, C.bark, x, h / 2, z);
    for (i = 0; i < 4; i++) { a = i * PI / 2 + 0.5; ic(L, 0.16 * r, C.bark2, x + Math.cos(a) * 0.3 * r, 0.08, z + Math.sin(a) * 0.3 * r, 0.7, a); }
    L.push(K.blob(1.0 * r, C.leaf, x, h + 0.35 * r, z, 0.8));   // smooth rounded clusters, light top / warm underside (Scenery.kit)
    for (i = 0; i < 5; i++) { a = i * 1.2566 + rnd() * 0.5; L.push(K.blob((0.6 + rnd() * 0.25) * r, [C.leaf2, C.leaf3, C.leaf][i % 3], x + Math.cos(a) * 0.85 * r, h + (0.05 + rnd() * 0.4) * r, z + Math.sin(a) * 0.85 * r, 0.8)); }
  }
  function mesh(L, name, outline) { var m = new THREE.Mesh(Mo.mergeParts(L), Mo.material('prop')); m.name = name; if (outline) R.addOutline(m, true, true); return m; }

  /* ------------------------------------------------------------ static scenery */
  function statics(L) {
    var i, j;
    // bench + big shade tree (trunk tile 26,24; bench on tile 26,25 facing south)
    tree(L, 26.5, 24.5, 3.1, 1.9);
    bx(L, 1.15, 0.08, 0.44, C.wood2, 26.5, 0.44, 25.55); bx(L, 1.15, 0.34, 0.06, C.wood, 26.5, 0.74, 25.3, -0.12, 0, 0);
    for (i = -1; i <= 1; i += 2) { bx(L, 0.07, 0.42, 0.07, C.dark, 26.5 + i * 0.5, 0.21, 25.4); bx(L, 0.07, 0.42, 0.07, C.dark, 26.5 + i * 0.5, 0.21, 25.7); }
    flowers(L, 25.5, 24.6, 5, 0.7); flowers(L, 27.6, 25.1, 5, 0.7); ic(L, 0.2, C.stone, 27.7, 0.07, 24.2, 0.6, 1);
    // hammock trees (tiles 7,28 and 11,28) + ropes
    tree(L, 7.5, 28.5, 2.2, 1.25); tree(L, 11.5, 28.5, 2.2, 1.25);
    for (i = -1; i <= 1; i += 2) { bx(L, 0.5, 0.03, 0.03, C.rope, 7.5 + 0.58, 1.18, 28.5 + i * 0.22, 0, 0, -0.5); bx(L, 0.5, 0.03, 0.03, C.rope, 11.5 - 0.58, 1.18, 28.5 + i * 0.22, 0, 0, 0.5); }
    flowers(L, 9.5, 27.2, 6, 1.6); flowers(L, 9.6, 29.9, 6, 1.6); ic(L, 0.22, C.stone, 8.2, 0.08, 29.6, 0.6, 2);
    // stone well (tile 21,33): ring, water, posts, roof, beam
    cy(L, 0.66, 0.66, C.stone, 21.5, 0.33, 33.5); cy(L, 0.56, 0.04, 0x2f6f86, 21.5, 0.68, 33.5); cy(L, 0.72, 0.08, C.stone2, 21.5, 0.68, 33.5);
    for (i = 0; i < 8; i++) { j = i * PI / 4; ic(L, 0.14, i % 2 ? C.stone2 : C.stone, 21.5 + Math.cos(j) * 0.66, 0.4, 33.5 + Math.sin(j) * 0.66, 1.2, j); }
    bx(L, 0.1, 1.5, 0.1, C.dark, 20.85, 1.4, 33.5); bx(L, 0.1, 1.5, 0.1, C.dark, 22.15, 1.4, 33.5); bx(L, 1.5, 0.1, 0.12, C.dark2, 21.5, 2.1, 33.5);
    bx(L, 1.7, 0.06, 0.8, C.red, 21.5, 2.28, 33.28, 0.5, 0, 0); bx(L, 1.7, 0.06, 0.8, C.red, 21.5, 2.28, 33.72, -0.5, 0, 0);
    cy(L, 0.05, 1.0, C.iron, 21.5, 2.0, 33.5, 0, 0, PI / 2); bx(L, 0.2, 0.06, 0.06, C.iron, 22.05, 2.0, 33.5);
    flowers(L, 20.5, 34.6, 5, 0.8); flowers(L, 22.6, 32.6, 5, 0.8); ic(L, 0.2, C.stone, 20.5, 0.07, 32.4, 0.6, 0.5);
    // picnic blanket (checker) + basket (tile 31,34) + pillow
    for (i = 0; i < 5; i++) for (j = 0; j < 4; j++) bx(L, 0.56, 0.025, 0.56, (i + j) % 2 ? C.red2 : C.red, 29.88 + i * 0.56, 0.02, 33.68 + j * 0.56);
    cy(L, 0.26, 0.26, C.wood2, 31.5, 0.15, 34.5); cy(L, 0.27, 0.05, C.dark, 31.5, 0.29, 34.5); bx(L, 0.5, 0.04, 0.05, C.dark, 31.5, 0.42, 34.5);
    bx(L, 0.3, 0.1, 0.12, C.bread, 31.2, 0.33, 34.4, 0, 0.4, 0); sp(L, 0.07, C.apple, 31.8, 0.1, 34.9); sp(L, 0.07, C.apple, 31.9, 0.1, 35.05); cy(L, 0.05, 0.3, C.teal, 31.3, 0.17, 35.0);
    bx(L, 0.4, 0.1, 0.3, C.cloth2, 30.2, 0.1, 34.0, 0, 0.3, 0); flowers(L, 29.4, 33.0, 5, 0.7); flowers(L, 32.7, 35.7, 5, 0.7); ic(L, 0.2, C.stone, 29.3, 0.07, 35.5, 0.6, 1);
    // swing frame (posts tiles 10,35 and 12,35; beam y 2.55; swing pivot x 11.5)
    for (i = -1; i <= 1; i += 2) { bx(L, 0.12, 2.7, 0.12, C.dark, 11.5 + i * 1.1, 1.3, 35.25, -0.3, 0, 0); bx(L, 0.12, 2.7, 0.12, C.dark, 11.5 + i * 1.1, 1.3, 35.75, 0.3, 0, 0); }
    bx(L, 2.4, 0.12, 0.12, C.dark2, 11.5, 2.55, 35.5); flowers(L, 10.2, 36.4, 4, 0.8); flowers(L, 12.9, 34.4, 4, 0.8);
    // stargazing platform (tiles 36,51 + 37,51): low stone disc, lantern-less, with moss and a cushion
    cy(L, 1.05, 0.12, C.stone, 37.0, 0.06, 51.5); cy(L, 0.95, 0.04, C.stone2, 37.0, 0.13, 51.5); ic(L, 0.32, C.stone, 38.2, 0.12, 51.2, 0.6, 1); ic(L, 0.25, C.stone2, 35.8, 0.1, 52.4, 0.6, 2);
    ic(L, 0.3, C.moss, 36.1, 0.1, 50.7, 0.35, 0); bx(L, 0.5, 0.08, 0.4, C.cloth, 36.5, 0.16, 51.5, 0, 0.2, 0); flowers(L, 35.7, 50.6, 5, 0.7); flowers(L, 38.3, 52.6, 5, 0.7);
  }

  /* ------------------------------------------------------------ animated parts */
  var hammock, swing, bucket, fly, flyW1, flyW2, leaves, stars, starMat, leafPar = [], dummy = new THREE.Object3D();
  var LEAF_N = 12, LCX = 26.5, LCZ = 24.5;
  function buildHammock() {
    var L = [], i, u, y;
    for (i = 0; i <= 6; i++) { u = i / 3 - 1; y = 0.52 + 0.55 * u * u; bx(L, 0.62, 0.06, 0.95, i % 2 ? C.cloth : C.cloth2, u * 1.45, y, 0, 0, 0, Math.atan(1.1 * u) * 0.55); }
    bx(L, 0.5, 0.1, 0.32, C.cream, -0.9, 0.78, 0, 0, 0, -0.3);
    hammock = mesh(L, 'chill_hammock'); hammock.position.set(9.5, 0, 28.5); CS.group.add(hammock);
  }
  function buildSwing() {
    var L = [], i;
    for (i = -1; i <= 1; i += 2) bx(L, 0.025, 2.1, 0.025, C.rope, i * 0.28, -1.05, 0);
    bx(L, 0.8, 0.07, 0.34, C.wood2, 0, -2.1, 0);
    swing = mesh(L, 'chill_swing'); swing.position.set(11.5, 2.55, 35.5); CS.group.add(swing);
  }
  function buildBucket() {
    var L = [];
    cy(L, 0.13, 0.2, 0xc4c8cd, 0, 0, 0); cy(L, 0.115, 0.02, C.water, 0, 0.09, 0); bx(L, 0.3, 0.02, 0.02, C.iron, 0, 0.17, 0); bx(L, 0.02, 0.9, 0.02, C.rope, 0, 0.6, 0);
    bucket = mesh(L, 'chill_bucket'); bucket.position.set(21.5, 1.1, 33.5); CS.group.add(bucket);
  }
  function buildFly() {
    var L1 = [], L2 = [];
    bx(L1, 0.07, 0.01, 0.06, 0xffb347, 0.04, 0, 0); bx(L2, 0.07, 0.01, 0.06, 0xffb347, -0.04, 0, 0);
    fly = new THREE.Group(); fly.name = 'chill_butterfly';
    flyW1 = mesh(L1, 'wing1'); flyW2 = mesh(L2, 'wing2'); fly.add(flyW1); fly.add(flyW2); CS.group.add(fly);
  }
  function buildLeaves() {
    var i, g = new THREE.PlaneGeometry(0.16, 0.11), m = new THREE.MeshBasicMaterial({ color: 0xe0a93e, side: THREE.DoubleSide });
    leaves = new THREE.InstancedMesh(g, m, LEAF_N); leaves.name = 'chill_leaves'; leaves.frustumCulled = false; leaves.count = 4;
    for (i = 0; i < LEAF_N; i++) leafPar.push({ ph: rnd(), sp: 0.16 + rnd() * 0.12, ox: (rnd() - 0.5) * 2.6, oz: (rnd() - 0.5) * 2.6, k: rnd() * 6 });
    CS.group.add(leaves);
  }
  function buildStars() {
    var n = 34, pos = new Float32Array(n * 3), i, a, r, g = new THREE.BufferGeometry();
    for (i = 0; i < n; i++) { a = rnd() * PI * 2; r = 1.5 + rnd() * 4.5; pos[i * 3] = 37 + Math.cos(a) * r; pos[i * 3 + 1] = 2.4 + rnd() * 4.2; pos[i * 3 + 2] = 51.5 + Math.sin(a) * r; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starMat = new THREE.PointsMaterial({ color: 0xfff3b0, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
    stars = new THREE.Points(g, starMat); stars.name = 'chill_stars'; stars.frustumCulled = false; stars.visible = false; CS.group.add(stars);
  }

  /* ------------------------------------------------------------ interaction */
  var REW = {
    bench: { intro: 'Ngồi nghỉ một lát, thời gian trôi nhanh hơn và bạn dần lấy lại sức.' },
    hammock: { intro: 'Chiếc võng đung đưa nhè nhẹ...', at: 6, amt: 6, max: 1, ok: 'Chợp mắt xong khỏe hẳn! +6 năng lượng', no: 'Hôm nay bạn đã ngủ trưa rồi, cứ nằm thư giãn thôi.' },
    picnic: { intro: 'Trải khăn, mở giỏ bánh mì và trái cây.', at: 5, amt: 6, max: 1, ok: 'Bữa dã ngoại ngon quá! +6 năng lượng', no: 'Hôm nay bạn đã ăn dã ngoại rồi.' },
    swing: { intro: 'Đu đưa lên nào!', at: 6, amt: 3, max: 1, ok: 'Đu một lúc thấy nhẹ cả người. +3 năng lượng', no: 'Hôm nay đu đã đời rồi, nhưng vẫn vui lắm.' },
    star: { intro: 'Nằm ngắm bầu trời đầy sao...', at: 7, amt: 6, max: 1, ok: 'Một vì sao băng vừa lướt qua! +6 năng lượng', no: 'Bầu trời đêm nay thật đẹp.' }
  };
  var used = {}, sess = null, wellT = -1, wellDone = false, tNow = 0, lastH = 0, SPOT = {};
  function toast(m, k) { if (G.UI && G.UI.toast) G.UI.toast(m, k || 'energy'); }
  function play(n, o) { if (G.Audio && G.Audio.play) G.Audio.play(n, o); }
  function day() { return G.Time ? G.Time.day : 0; }
  function left(id, max) { var u = used[id]; if (!u || u.d !== day()) u = used[id] = { d: day(), n: 0 }; return max - u.n; }
  function takeUse(id) { left(id, 99); used[id].n++; }
  function full() { return G.State.energy >= G.State.maxEnergy; }
  CS.usesLeft = function (id, max) { return left(id, max); };
  function isNight() { return G.Time && G.Time.hour >= 19.5; }

  function endSession() {
    if (!sess) return;
    if (sess.id === 'swing' && G.Player) G.Player.pos.z = SPOT.swing.tz + 0.5;
    sess = null;
  }
  function startSeat(s) {
    if (sess || G.Player.sitting || G.Seat.busy()) return;
    G.Seat.sit({ tx: s.tx, tz: s.tz, facing: s.facing, onSeated: function () {
      sess = { id: s.id, t: 0, acc: 0, done: false, said: false };
      toast(REW[s.id].intro, 'energy');
    } });
  }
  function startWell() { if (wellT < 0) { wellT = 0; wellDone = false; play('chest', { vol: 0.5 }); } }
  function finishWell() {
    var r = G.Farm && G.Farm.refillCan ? G.Farm.refillCan() : 'nocan', msg = [];
    if (left('well', 3) > 0 && !full()) { G.State.restoreEnergy(3); takeUse('well'); msg.push('Uống nước giếng mát lạnh, +3 năng lượng'); }
    else if (full()) msg.push('Nước giếng mát lạnh, bạn thấy sảng khoái.');
    else msg.push('Hôm nay bạn uống đủ nước giếng rồi.');
    if (typeof r === 'number') msg.push('Bình tưới đã đầy (' + r + '/' + r + ')');
    toast(msg.join('. '), 'rain'); play('sparkle', { vol: 0.5 });
  }
  E.on('interact:chill', function (e) {
    var s = e && SPOT[e.id]; if (!s || !G.Player || G.Player.sitting) return;
    if (s.id === 'well') { startWell(); return; }
    if (s.id === 'star' && !isNight()) { toast('Chỉ ngắm sao được khi trời tối, quay lại buổi tối nhé.', 'energy'); return; }
    startSeat(s);
  });
  E.on('player:stood', endSession); E.on('scene:changed', function () { endSession(); wellT = -1; });

  function reward(dt) {
    var d = REW[sess.id], P = G.Player;
    sess.t += dt;
    if (!P.sitting) { endSession(); return; }
    if (sess.id === 'bench') {
      var h = G.Time.hour, nat = h - lastH;
      if (nat > 0 && nat < 0.2 && h < 23.4) G.Time.hour = h + nat;   // clock x2 while seated on the bench
      sess.acc += dt; if (sess.acc >= 5) { sess.acc -= 5; if (!full()) G.State.restoreEnergy(1); }
      return;
    }
    if (sess.id === 'swing') {
      var a = Math.min(1, sess.t / 2) * 0.32 * Math.sin(sess.t * 2.3);
      P.pos.z = 35.5 - 2.1 * Math.sin(a);
    }
    if (!sess.done && sess.t >= d.at) {
      sess.done = true;
      if (full()) toast('Bạn đang tràn năng lượng, để dành lần sau nhé.', 'energy');
      else if (left(sess.id, d.max) > 0) { takeUse(sess.id); G.State.restoreEnergy(d.amt); toast(d.ok, 'energy'); play('sparkle', { vol: 0.6 }); }
      else toast(d.no, 'energy');
    }
  }

  /* ------------------------------------------------------------ frame */
  function onFrame(dt) {
    var P = G.Player, px, pz, i, p, y, q, sw = 1, a, near;
    if (!P || !CS.ready) return;
    tNow += dt;
    if (sess) reward(dt);
    lastH = G.Time ? G.Time.hour : 0;
    px = P.pos.x; pz = P.pos.z;
    q = G.Quality && G.Quality.def ? G.Quality.def() : null; if (q && typeof q.sway === 'number') sw = q.sway;
    // hammock sway (stronger while lying in it)
    near = Math.abs(px - 9.5) < 40 && Math.abs(pz - 28.5) < 40;
    hammock.visible = near;
    if (near) hammock.rotation.x = Math.sin(tNow * 1.1) * (sess && sess.id === 'hammock' ? 0.07 : 0.025) * (sw > 0 ? 1 : 0);
    // swing
    near = Math.abs(px - 11.5) < 40 && Math.abs(pz - 35.5) < 40; swing.visible = near;
    if (near) { a = sess && sess.id === 'swing' ? Math.min(1, sess.t / 2) * 0.32 * Math.sin(sess.t * 2.3) : Math.sin(tNow * 0.9) * 0.04 * (sw > 0 ? 1 : 0); swing.rotation.x = a; }
    // bucket: lowers, fills, rises
    if (wellT >= 0) {
      wellT += dt;
      if (wellT < 0.8) y = 1.1 - (wellT / 0.8) * 0.7;
      else if (wellT < 1.0) y = 0.4;
      else if (wellT < 1.9) y = 0.4 + ((wellT - 1.0) / 0.9) * 0.7;
      else y = 1.1;
      bucket.position.y = y;
      if (wellT >= 0.8 && !wellDone && wellT < 1.0) { play('splashS', { vol: 0.6 }); }
      if (wellT >= 1.9) { wellT = -1; finishWell(); }
    } else bucket.position.y = 1.1 + Math.sin(tNow * 1.4) * 0.012;
    // butterfly circling the picnic basket
    near = Math.abs(px - 31) < 24 && Math.abs(pz - 34.5) < 24; fly.visible = near && !isNight();
    if (fly.visible) {
      fly.position.set(31 + Math.cos(tNow * 0.7) * 1.3 + Math.sin(tNow * 1.9) * 0.2, 0.7 + Math.sin(tNow * 1.3) * 0.25, 34.5 + Math.sin(tNow * 0.7) * 1.1);
      fly.rotation.y = tNow * 0.7 + PI / 2; a = Math.sin(tNow * 18) * 0.9; flyW1.rotation.z = a; flyW2.rotation.z = -a;
    }
    // drifting leaves under the bench tree
    near = Math.abs(px - LCX) < 20 && Math.abs(pz - LCZ) < 20 && sw > 0; leaves.visible = near;
    if (near) {
      leaves.count = sess && sess.id === 'bench' ? LEAF_N : 5;
      for (i = 0; i < leaves.count; i++) {
        p = leafPar[i]; a = (tNow * p.sp + p.ph) % 1;
        dummy.position.set(LCX + p.ox + Math.sin(tNow * 0.9 + p.k) * 0.45, 3.5 - a * 3.4, LCZ + p.oz + Math.cos(tNow * 0.7 + p.k) * 0.45);
        dummy.rotation.set(tNow * 1.3 + p.k, tNow * 0.9, tNow * 1.7); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    }
    // night stars above the stargazing platform
    near = isNight() && Math.abs(px - 37) < 22 && Math.abs(pz - 51.5) < 22; stars.visible = near;
    if (near) starMat.opacity = (sess && sess.id === 'star' ? 0.95 : 0.55) * (0.75 + 0.25 * Math.sin(tNow * 2.1));
  }

  /* ------------------------------------------------------------ build */
  CS.build = function () {
    if (CS.ready) return;
    var parent = G.Scenery.group || G.Decor.group, L = [], m;
    CS.group = new THREE.Group(); CS.group.name = 'chill_spots'; parent.add(CS.group);
    LAYOUT.blocked.forEach(function (b) { W.setBlocked(b[0], b[1], true); });
    statics(L); m = mesh(L, 'chill_static', true); CS.group.add(m);
    buildHammock(); buildSwing(); buildBucket(); buildFly(); buildLeaves(); buildStars();
    LAYOUT.spots.forEach(function (s) {
      var sd = { id: s[0], tx: s[1], tz: s[2], facing: s[3] }, st = s[3] === 'n' ? { tx: s[1], tz: s[2] + 1 } : { tx: s[1], tz: s[2] };
      SPOT[s[0]] = sd;
      W.registerInteractable({ id: s[0], type: 'chill', tile: { tx: s[1], tz: s[2] }, facing: s[3], hint: s[4], stand: st });
    });
    CS.stats = { parts: L.length, spots: LAYOUT.spots.length, draws: 8 };
    CS.ready = true;
    G.Loop.onFrame(onFrame, 10.9);
  };
})();
