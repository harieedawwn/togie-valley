/* Togie Valley - house.js (Stage 5: House & sleep)
 * Game.House: procedural interior scene 'house' (bed, chest, kitchen, table + lamp, rug, window, door),
 * starter chest (Container), new-game intro + 3 chained hints, bed -> sleep -> morning summary panel.
 * Depends on: core, render, models, scenes, player, interact, items, state, time, save, icons, ui, panels.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.Render || !G.Models || !G.Scenes || !G.Player || !G.Interact || !G.Items ||
      !G.HouseMap || !G.Containers || !G.Inventory || !G.State || !G.Time || !G.Day || !G.Save || !G.UI || !G.Icons || !G.World) {
    console.error('[house] missing deps'); return;
  }
  var E = G.Events, U = G.util, M = G.Models, Time = G.Time, UI = G.UI, Icons = G.Icons, P = G.Player, Inv = G.Inventory;
  var ui = document.getElementById('ui');

  /* Interior lives far from the outdoor map so tile coordinates never collide. Local tile (ix,iz) -> world (OX+ix, OZ+iz). */
  var HM = G.HouseMap;
  var OX = 100, OZ = 100, IW = HM.width, ID = HM.depth;

  var House = { OX: OX, OZ: OZ, width: IW, depth: ID, tier: 0, chest: G.Containers.create(12), summaryLines: [] };
  var flags = { chestOpened: false, hint: 0 };   // hint: 0 take items, 1 select hoe, 2 go outside, 3 done
  var startMode = null;                           // 'intro' | 'resume' | null (waits for the title screen to close)

  /* ------------------------------------------------------------------ items */
  Items_define();
  function Items_define() {
    var I = G.Items;
    I.define({ id: 'parsnip_seeds', name: 'Hạt giống củ cải vàng', cat: 'seed', icon: { tpl: 'seed', c1: '#f3e2b3', c2: '#c9945a', v: 'long' }, price: 10, buyPrice: 20,
      tip: 'Củ cải vàng là cây củ: thích đất tơi xốp và những ngày xuân mát.' });
    I.define({ id: 'potato_seeds', name: 'Hạt giống khoai tây', cat: 'seed', icon: { tpl: 'seed', c1: '#d9b27a', c2: '#a9763f', v: 'round' }, price: 25, buyPrice: 50,
      tip: 'Khoai tây không phải rễ mà là thân phình to để dự trữ thức ăn dưới đất.' });
  }
  function fillStarter() {
    var c = House.chest;
    c.clear();
    c.add('parsnip_seeds', 15); c.add('potato_seeds', 6); c.add('compost', 5); c.add('bread', 3); c.add('notebook', 1);
  }

  /* --------------------------------------------------------------- geometry */
  var group = new THREE.Group();
  group.position.set(OX, 0, OZ);
  group.visible = false;
  G.Render.scene.add(group);

  var C = { wall: 0xf3e2c0, wall2: 0xe8d2a8, wood: 0xc98b4f, dark: 0x8c5a34, floorA: 0xd9a566, floorB: 0xcf9a5c, cream: 0xfff1d0,
    coral: 0xe8715d, blue: 0x7fb6e8, iron: 0x5a4a52, leaf: 0x6fb35a, stone: 0xb9b0a4, white: 0xfdf6e8, yellow: 0xffd166 };
  var parts = [];
  function box(w, h, d, c, x, y, z, ry) { parts.push(M.part(new THREE.BoxGeometry(w, h, d), c, [x, y, z], [0, ry || 0, 0])); }
  function cyl(rt, rb, h, c, x, y, z, seg) { parts.push(M.part(new THREE.CylinderGeometry(rt, rb, h, seg || 12), c, [x, y, z])); }
  function cone(r, h, c, x, y, z) { parts.push(M.part(new THREE.ConeGeometry(r, h, 12), c, [x, y, z])); }
  function sph(r, c, x, y, z, sy) { parts.push(M.part(new THREE.SphereGeometry(r, 10, 8), c, [x, y, z], null, [1, sy || 1, 1])); }

  function buildStatic() {
    // floor planks (two tones per column)
    for (var i = 0; i < IW; i++) box(1, 0.2, ID, i % 2 ? C.floorA : C.floorB, i + 0.5, -0.1, ID / 2);
    // walls: tall back + left, low right + front (front has a gap for the door tile)
    box(IW + 0.6, 2.0, 0.3, C.wall, IW / 2, 1.0, -0.15);
    box(0.3, 2.0, ID + 0.3, C.wall2, -0.15, 1.0, ID / 2 - 0.15 + 0.15);
    box(IW + 0.6, 0.12, 0.34, C.dark, IW / 2, 0.06, -0.15);            // skirting
    box(0.3, 0.35, ID + 0.3, C.wall2, IW + 0.15, 0.175, ID / 2);
    box(3, 0.35, 0.3, C.wall, 1.5, 0.175, ID + 0.15);
    box(IW - 5, 0.35, 0.3, C.wall, 5 + (IW - 5) / 2, 0.175, ID + 0.15);   // door gap is 2 tiles (x 3..5)
    // door frame at tile (3,5) on the front edge + mat
    box(0.14, 1.9, 0.2, C.dark, 3.0, 0.95, ID + 0.15);
    box(0.14, 1.9, 0.2, C.dark, 5.0, 0.95, ID + 0.15);
    box(2.14, 0.16, 0.2, C.dark, 4.0, 1.9, ID + 0.15);
    box(1.6, 0.04, 0.5, C.coral, 4.0, 0.02, ID - 0.4);
    // window frames + bars (back wall; tier 0 has one at tile 2, wings add more) + wall sconces for the wing windows
    windowsX().forEach(function (wx, wi) {
      box(1.3, 1.1, 0.1, C.dark, wx, 1.2, 0.04);
      box(0.06, 0.9, 0.06, C.dark, wx, 1.2, 0.12);
      box(1.1, 0.06, 0.06, C.dark, wx, 1.2, 0.12);
      box(1.5, 0.08, 0.2, C.wood, wx, 0.62, 0.1);                        // sill
    });
    // bed (tiles 0, rows 0-1)
    if (!House.bedHidden) {   // Stage 17 FURN: hidden while a placed bed furniture stands in the room
      box(0.96, 0.28, 1.96, C.wood, 0.5, 0.14, 1.0);
      box(0.9, 0.2, 1.84, C.white, 0.5, 0.38, 1.0);
      box(0.92, 0.14, 1.1, C.blue, 0.5, 0.52, 1.4);
      box(0.62, 0.14, 0.4, C.cream, 0.5, 0.54, 0.38);
      box(1.0, 0.8, 0.1, C.dark, 0.5, 0.5, 0.06);
    }
    // kitchen: counter (tile 3) + stove (tile 4) + shelf with jars
    box(1.0, 0.8, 0.62, C.wood, 3.5, 0.4, 0.34);
    box(1.04, 0.07, 0.66, C.cream, 3.5, 0.82, 0.34);
    box(1.0, 0.8, 0.62, C.iron, 4.5, 0.4, 0.34);
    cyl(0.17, 0.17, 0.05, 0x2f2830, 4.3, 0.83, 0.3); cyl(0.17, 0.17, 0.05, 0x2f2830, 4.7, 0.83, 0.3);
    box(0.5, 0.22, 0.02, 0x2f2830, 4.5, 0.45, 0.66);
    cyl(0.08, 0.08, 0.5, C.iron, 4.85, 1.4, 0.1);
    box(1.0, 0.05, 0.2, C.wood, 3.5, 1.35, 0.12);
    cyl(0.07, 0.07, 0.16, C.coral, 3.2, 1.46, 0.12); cyl(0.07, 0.07, 0.16, C.leaf, 3.5, 1.46, 0.12); cyl(0.07, 0.07, 0.16, C.yellow, 3.8, 1.46, 0.12);
    // table (tiles 4-5, row 3) + legs + lamp base
    box(1.9, 0.1, 0.9, C.wood, 5.0, 0.75, 3.5);
    box(0.1, 0.7, 0.1, C.dark, 4.15, 0.35, 3.15); box(0.1, 0.7, 0.1, C.dark, 5.85, 0.35, 3.15);
    box(0.1, 0.7, 0.1, C.dark, 4.15, 0.35, 3.85); box(0.1, 0.7, 0.1, C.dark, 5.85, 0.35, 3.85);
    cyl(0.12, 0.15, 0.06, C.dark, 5.4, 0.83, 3.5);
    cyl(0.03, 0.03, 0.22, C.dark, 5.4, 0.97, 3.5);
    cone(0.2, 0.2, C.coral, 5.4, 1.2, 3.5);
    box(0.4, 0.05, 0.3, C.cream, 4.6, 0.83, 3.5);                       // little cloth
    // rug (walkable, decorative)
    cyl(1.3, 1.3, 0.03, C.coral, 2.5, 0.02, 2.8, 20);
    cyl(0.95, 0.95, 0.04, C.cream, 2.5, 0.02, 2.8, 20);
    cyl(0.55, 0.55, 0.05, C.blue, 2.5, 0.02, 2.8, 20);
    // plant pot in the corner + picture on the left wall
    cyl(0.2, 0.15, 0.3, C.coral, IW - 0.5, 0.15, ID - 0.6); sph(0.28, C.leaf, IW - 0.5, 0.55, ID - 0.6, 1.1); sph(0.2, 0x8fd07a, IW - 0.42, 0.8, ID - 0.65);
    box(0.06, 0.55, 0.8, C.dark, 0.03, 1.35, 3.0); box(0.07, 0.4, 0.62, 0xbfe0f0, 0.04, 1.35, 3.0);
    box(0.07, 0.14, 0.4, C.leaf, 0.06, 1.28, 3.0);
  }
  function windowsX() { return [2.5]; }
  var staticMesh = null;
  function rebuildStatic() {
    if (staticMesh) { group.remove(staticMesh); staticMesh.geometry.dispose(); }
    parts = []; buildStatic();
    staticMesh = new THREE.Mesh(M.mergeParts(parts), M.material('prop'));
    G.Render.addOutline(staticMesh, false, true);
    group.add(staticMesh);
    parts = [];
  }
  rebuildStatic();

  // dark base around the room (no outline)
  var base = new THREE.Mesh(M.mergeParts([M.part(new THREE.BoxGeometry(400, 0.2, 400), 0x7a5a3c, [3.5, -0.32, 3])]), M.material('flat'));
  group.add(base);

  // chest (own mesh: pulses until opened)
  parts = [];
  box(0.84, 0.36, 0.56, C.wood, 0, 0.18, 0);
  box(0.12, 0.2, 0.62, C.yellow, 0, 0.3, 0);
  var chestMesh = new THREE.Mesh(M.mergeParts(parts), M.material('prop'));
  House.chestMesh = chestMesh;   // lid is a hinged child added by js/world_react.js
  chestMesh.position.set(6.5, 0, 0.5);
  G.Render.addOutline(chestMesh, false, true);
  group.add(chestMesh);

  // bouncing arrow above the chest
  parts = [M.part(new THREE.ConeGeometry(0.22, 0.4, 10), C.yellow, [0, 0, 0], [Math.PI, 0, 0]), M.part(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), C.yellow, [0, 0.33, 0])];
  var arrow = new THREE.Mesh(M.mergeParts(parts), M.material('prop'));
  arrow.position.set(6.5, 1.3, 0.5);
  G.Render.addOutline(arrow, true);
  group.add(arrow);
  parts = [];

  // window pane, floor light patch, lamp bulb: simple unlit materials driven by the time of day
  var paneMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff });
  var patchMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0, depthWrite: false });
  var bulbMat = new THREE.MeshBasicMaterial({ color: 0xd9c9a0 });
  var paneGeo = new THREE.PlaneGeometry(1.0, 0.8), patchGeo = new THREE.PlaneGeometry(1.0, 1.7), bulbGeo = new THREE.SphereGeometry(0.08, 8, 6);
  var lightObjs = [];
  function rebuildLights() {   // one pane + floor patch per window, one bulb on the table + one per wing sconce (shared materials)
    lightObjs.forEach(function (o) { group.remove(o); }); lightObjs = [];
    function add(m, x, y, z, rx) { m.position.set(x, y, z); if (rx) m.rotation.x = rx; group.add(m); lightObjs.push(m); }
    windowsX().forEach(function (wx, wi) {
      add(new THREE.Mesh(paneGeo, paneMat), wx, 1.2, 0.1);
      add(new THREE.Mesh(patchGeo, patchMat), wx, 0.012, 1.45, -Math.PI / 2);
      if (wi > 0) add(new THREE.Mesh(bulbGeo, bulbMat), wx + 1.2, 1.3, 0.26);
    });
    add(new THREE.Mesh(bulbGeo, bulbMat), 5.4, 1.12, 3.5);
  }
  rebuildLights();

  var cNight = new THREE.Color(0x1d2750), cDay = new THREE.Color(0xbfe6ff), cDusk = new THREE.Color(0xffb36b);
  var lNight = new THREE.Color(0xd9c9a0), lOn = new THREE.Color(0xffe08a);
  function updateLight() {
    var h = Time.hour, sun = U.smoothstep(6, 8, h) * (1 - U.smoothstep(17.5, 19.5, h));
    var warm = Math.max(U.smoothstep(16.5, 18, h) * (1 - U.smoothstep(18, 19.5, h)), (1 - U.smoothstep(6, 7.5, h)) * 0.8);
    paneMat.color.copy(cNight).lerp(cDay, sun).lerp(cDusk, warm * 0.6);
    patchMat.opacity = 0.3 * sun * (Time.weather === 'sun' ? 1 : 0.4);
    bulbMat.color.copy(sun > 0.5 ? lNight : lOn);
  }
  E.on('time:minuteStep', updateLight);
  E.on('day:started', updateLight);

  /* ------------------------------------------------------------------ scene */
  function isWalkable(tx, tz) {
    var ix = tx - OX, iz = tz - OZ;
    return HM.isWalkable(ix, iz) && !(Game.Solids && Game.Solids.houseBlocked(ix, iz));   // ASCII interior map (js/house_map.js)
  }
  var frame = { cx: OX + IW / 2, cz: OZ + ID / 2, w: IW, d: ID };
  G.Scenes.register('house', {
    camera: 'indoor',
    walkable: isWalkable,
    frame: frame,
    enter: function () { group.visible = true; updateLight(); },
    exit: function () { group.visible = false; }
  });

  /* Stage 16 G3: switch the interior to tier t (0..3): map, walls, windows, lights, spots, camera frame. Idempotent. */
  House.setTier = function (t) {
    t = Math.max(0, Math.min(3, t | 0));
    if (t === House.tier && HM.tier === t) return;
    House.tier = t; HM.setTier(t); IW = HM.width; ID = HM.depth; House.width = IW; House.depth = ID;
    frame.cx = OX + IW / 2; frame.cz = OZ + ID / 2; frame.w = IW; frame.d = ID;
    rebuildStatic(); rebuildLights(); updateLight();
    if (spots.bed) { spots.bed.tiles = HM.spots.bed; spots.chest.tiles = HM.spots.chest; spots.kitchen.tiles = HM.spots.kitchen; spots.door.tiles = HM.spots.door; }
    if (G.Scenes.current === 'house' && G.Render.rig.setFrame) { G.Render.rig.setFrame(frame); G.Render.rig.setTarget(frame.cx, 0, frame.cz, true); }
    E.emit('house:tier', { tier: t });
  };
  // Free floor tiles for future furniture: [{ix, iz, tx, tz}] (local + world tile coords)
  House.floorTiles = function () { return HM.floorTiles().map(function (c) { return { ix: c.ix, iz: c.iz, tx: OX + c.ix, tz: OZ + c.iz }; }); };

  function spawnOf(k) { var s = HM.spawns[k]; return { tx: OX + s[0], tz: OZ + s[1], facing: s[2] }; }
  House.wakeSpawn = function () { return spawnOf('wake'); };
  House.doorSpawn = function () { return spawnOf('door'); };
  House.bedSpawn = function () { return spawnOf('bed'); };
  House.bedHidden = false;
  House.askSleep = askSleep;
  House.busy = function () { return viaBed; };   // bed flow running (js/night.js waits)
  House.setBedHidden = function (v) { v = !!v; if (v === House.bedHidden) return; House.bedHidden = v; HM.setBedHidden(v); rebuildStatic(); };

  function outdoorSpawn() {
    var d = G.World.listInteractables('door')[0];
    return d ? { tx: d.stand.tx, tz: d.stand.tz, facing: 's' } : { tx: 9, tz: 13, facing: 's' };
  }
  E.on('interact:door', function () {
    if (G.Scenes.current !== 'outdoor') return;
    UI.sfx('pop');
    G.Scenes.go('house', House.doorSpawn());
  });

  /* --------------------------------------------------------- interactables */
  // tile entries: [ix, iz, standIx, standIz, facing] (data lives in house_map.js)
  var spots = {
    bed: { tiles: HM.spots.bed, run: askSleep },
    chest: { tiles: HM.spots.chest, run: openChest },
    kitchen: { tiles: HM.spots.kitchen, run: function (t, done) { if (G.Cooking) G.Cooking.open(); else UI.toast('Bếp còn nguội.', 'warn'); done(); } },
    door: { tiles: HM.spots.door, run: leaveHouse }
  };
  Object.keys(spots).forEach(function (k) {
    spots[k].tiles.forEach(function (e) { if (!HM.isWalkable(e[2], e[3])) console.error('[house] unreachable stand tile for ' + k); });
  });
  G.Interact.register({
    id: 'house-spots', priority: 50,
    test: function (tx, tz, scene) {
      if (scene !== 'house') return null;
      var ix = tx - OX, iz = tz - OZ, k, i, s;
      for (k in spots) {
        if (k === 'bed' && House.bedHidden) continue;
        s = spots[k];
        for (i = 0; i < s.tiles.length; i++) if (s.tiles[i][0] === ix && s.tiles[i][1] === iz) return { spot: k, entry: s.tiles[i] };
      }
      return null;
    },
    stand: function (t) { var e = t.entry; return { tx: OX + e[2], tz: OZ + e[3], facing: e[4] }; },
    run: function (t, done) { spots[t.spot].run(t, done); }
  });

  function leaveHouse(t, done) {
    UI.sfx('pop');
    G.Scenes.go('outdoor', outdoorSpawn());
    done();
  }

  /* ------------------------------------------------------------------ chest */
  function openChest(t, done) {
    done();
    if (G.AnimData && G.AnimData.has('chest') && !P.isLocked()) {
      var opened = false, off = E.on('anim:impact', function (p) { if (p.name === 'chest' && p.stage === 'hit' && !opened) { opened = true; off(); showChest(); } });
      P.playAction('chest', {});
      setTimeout(function () { if (!opened) { opened = true; off(); showChest(); } }, 1200);
    } else showChest();
  }
  function showChest() {
    UI.sfx('chest');
    if (!flags.chestOpened) { flags.chestOpened = true; arrow.visible = false; chestMesh.scale.set(1, 1, 1); }
    UI.openContainer(House.chest, {
      title: 'Rương khởi đầu',
      onClose: function () {
        G.Save.request();
        if (flags.hint === 0) { setHint(1); }
      }
    });
  }
  var pulseT = 0;
  G.Loop.onFrame(function (dt) {
    if (G.Scenes.current !== 'house' || flags.chestOpened) return;
    pulseT += dt;
    arrow.position.y = 1.25 + Math.abs(Math.sin(pulseT * 4)) * 0.22;
    var k = 1 + 0.05 * Math.sin(pulseT * 6);
    chestMesh.scale.set(k, 1, k);
  }, 20);

  /* ------------------------------------------------------------------ hints */
  var HINTS = [
    ['Mở rương và lấy đồ nào. Chạm vào rương nhé!', 'bag'],
    ['Giờ chạm vào Cuốc trên thanh nhanh để chọn nhé.', 'ripple'],
    ['Giỏi lắm! Đi tới cửa để ra ngoài nào.', 'sprout']
  ];
  function setHint(n) {
    flags.hint = n;
    G.Save.request();
    if (n < 3) UI.toast(HINTS[n][0], HINTS[n][1]);
  }
  E.on('inventory:changed', function () {
    if (flags.hint !== 1) return;
    var s = Inv.selected();
    if (s && s.id === 'hoe') setHint(2);
  });
  E.on('scene:changed', function (e) {
    if (e.to === 'outdoor' && flags.hint === 2) { flags.hint = 3; G.Save.request(); }
  });

  /* ------------------------------------------------------- fade + intro */
  var fadeEl = null;
  function fade() {
    if (fadeEl) return fadeEl;
    fadeEl = document.createElement('div');
    fadeEl.id = 'tv-house-fade';
    (ui || document.body).appendChild(fadeEl);
    return fadeEl;
  }
  function fadeTo(v, ms, cb) {
    var f = fade();
    f.style.transitionDuration = ms + 'ms';
    f.style.pointerEvents = v ? 'auto' : 'none';
    f.style.opacity = v ? '1' : '0';
    if (cb) setTimeout(cb, ms + 20);
  }
  function fadeInstant(v) {
    var f = fade();
    f.style.transitionDuration = '0ms';
    f.style.pointerEvents = v ? 'auto' : 'none';
    f.style.opacity = v ? '1' : '0';
    void f.offsetWidth;
  }

  function beginStart(mode) {
    startMode = null;
    if (G.Scenes.current !== 'house') return;
    if (mode === 'intro') {
      // pick the Watering Can so that choosing the Hoe is a real step, then zoom out and ease in
      Inv.select(1);
      fadeInstant(true);
      G.Camera.setZoom(1.6, true);
      P.lock('intro');
      fadeTo(false, 900);
      setTimeout(function () {
        G.Camera.setZoom(1);
        P.unlock('intro');
        setHint(0);
      }, 900);
    } else if (flags.hint < 3) {
      UI.toast(HINTS[flags.hint][0], HINTS[flags.hint][1]);
    }
  }
  G.Loop.onFrame(function () {
    if (!startMode) return;
    if (document.getElementById('tv-title')) return;   // wait for the title screen to close
    beginStart(startMode);
  }, 30);

  /* -------------------------------------------------------- sleep + summary */
  var TIPS = [
    'Giun đất xới và làm tơi đất, nên vườn nhiều giun là vườn vui.',
    'Cây làm thức ăn từ ánh nắng, nước và không khí. Gọi là quang hợp đó.',
    'Luân canh mỗi mùa giữ cho dưỡng chất trong đất cân bằng.',
    'Đậu bắt tay với vi khuẩn đất để thêm đạm cho vụ sau.',
    'Cá thường hoạt động nhiều nhất lúc bình minh và hoàng hôn, khi nước mát lại.',
    'Phân ủ biến rác bếp và lá khô thành thức ăn nuôi cây từ từ.',
    'Lá nhợt nhạt, vàng úa có thể là cây đang thiếu đạm.',
    'Ong ghé hoa lấy mật và mang phấn đi, giúp quả lớn lên.',
    'Nước mưa dịu nhẹ với cây và không có clo như một số nước máy.',
    'Lớp phủ gốc giữ đất mát và ẩm, nên đất khô chậm hơn.',
    'Ngủ ngon tốt cho mọi người: nông dân lấy lại sức, cây vẫn cứ lớn.',
    'Hạt giống biết mùa. Nhiều loại cần một đợt lạnh mới nảy mầm.'
  ];
  var tipIdx = 0;
  var WEATHER = { sun: ['Nắng', 'sun'], rain: ['Mưa', 'rain'], snow: ['Tuyết', 'snow'] };
  var viaBed = false, lastStart = null;

  House.addSummaryLine = function (text, icon) { House.summaryLines.push({ text: String(text), icon: icon || 'coin' }); };

  G.Day.onEnd(-1000, function () { House.summaryLines = []; });
  G.Day.onStart(1000, function (info) {
    lastStart = info;
    if (viaBed) return;
    // pass-out (or any non-bed sleep): black out now, then wake up in bed
    P.stop(); P.lock('sleep');
    fadeInstant(true);
    setTimeout(function () { wake(info); }, 0);
  });

  function askSleep(t, done) {
    done();
    var late = Time.hour >= 24, day = Time.hour < 19;
    UI.confirm({
      title: day ? 'Nằm nghỉ một lát?' : 'Đi ngủ thôi?',
      text: day ? 'Bạn nằm nghỉ, thời gian trôi nhanh đến 19:00 và năng lượng hồi chậm. Chạm xuống sàn để dậy.' : late ? 'Khuya lắm rồi. Sáng mai bạn chỉ có 75% năng lượng thôi.' : 'Ngày kết thúc ở đây, bạn sẽ thức dậy lúc 6:00 với đầy năng lượng.',
      yes: day ? 'Nằm nghỉ' : 'Đi ngủ', no: 'Chưa đâu'
    }, function (ok) { if (ok) doSleep(t); });
  }

  function doSleep(t) {
    if (viaBed) return;
    if (G.SleepVote && G.SleepVote.multi()) { G.SleepVote.start(t); return; }   // connected: the host decides when the day rolls
    if (Time.hour < 19 && G.Rest && G.Rest.start(t)) return;   // before 19:00 lying only rests (js/rest.js)
    viaBed = true;
    P.stop(); P.lock('sleep');
    var BS = G.BedSleep, clips = !!(BS && BS.ready()), started = false;
    function goDark() { if (started) return; started = true; fadeTo(true, 500, dark); }
    // bed path: walk done -> climb in + lie down (clip bed_in) -> a moment of Zzz -> black-out
    if (clips && BS.enter(t, function () { setTimeout(goDark, 1500); })) setTimeout(goDark, 7000);
    else goDark();
    function dark() { darkSolo(clips); }
  }
  function darkSolo(clips) {
    var ok = G.Day.sleep();
    viaBed = false;
    if (!ok) { if (clips) G.BedSleep.out(function () {}); fadeTo(false, 400, function () { P.unlock('sleep'); }); return; }
    wake(lastStart || { day: Time.day, season: Time.season, weather: Time.weather, mode: 'full', lostMoney: 0 });
  }
  /* js/rest.js: the clock reached 19:00 while the player lies resting -> real sleep from the bed (Zzz moment, black-out, roll the day, summary). */
  House.sleepLying = function () {
    if (viaBed) return;
    viaBed = true; P.stop(); P.lock('sleep');
    setTimeout(function () { fadeTo(true, 500, function () { darkSolo(true); }); }, 1200);
  };

  // Wake in bed (bed sleep, faint and dev skipDay share this): lying pose through the summary, then bed_out (sit up, step down to the bedside) under the fade-in.
  function lieDown() {
    var BS = G.BedSleep, clips = !!(BS && BS.ready()), sp = clips ? BS.wakeSpot() : House.bedSpawn(), ok;
    if (G.Scenes.current !== 'house') G.Scenes.go('house', sp, { instant: true });
    else P.placeAt(sp);
    ok = clips && BS.lie();
    updateLight();
    G.Save.request();
    return ok;
  }
  function wake(info) {
    var ok = lieDown();
    showSummary(info, function () { getUp(ok, 600); });
  }
  function getUp(ok, ms) {
    if (ok) G.BedSleep.out(function () {});
    fadeTo(false, ms, function () { P.unlock('sleep'); });
  }
  /* Same-day faint wake-up (js/night.js): bed, fade in, get up. No summary. */
  House.wakeQuick = function () { getUp(lieDown(), 700); };
  /* Multiplayer faint: lie in the claimed bed and fade in, stay lying (js/night.js stands him up later). */
  House.lieStay = function () { var ok = lieDown(); fadeTo(false, 700); return ok; };
  /* Everybody sleeps (js/sleep_vote.js): a moment of Zzz, black-out; the host rolls the day, guests wait for the host clock; then the usual summary + get up. */
  var ENERGY = { full: 1, late: 0.75, faint: 0.3 };
  House.mpWake = function (mode, host) {
    var day0 = Time.day, t0 = Date.now(), SV = G.SleepVote, BS = G.BedSleep, iv = 0;
    if (viaBed) return;
    viaBed = true; P.stop(); P.lock('sleep');
    function done(info) { viaBed = false; wake(info); }
    function dark() {
      if (host) {
        if (!G.Day.sleep(mode)) { viaBed = false; if (SV) SV.rolled(); if (BS.ready()) BS.out(function () {}); fadeTo(false, 400, function () { P.unlock('sleep'); }); return; }
        if (SV) SV.rolled();
        done(lastStart || { day: Time.day, season: Time.season, weather: Time.weather, mode: mode, lostMoney: 0 });
        return;
      }
      iv = setInterval(function () {   // guest: the host clock message moves the day
        if (Time.day <= day0 && Date.now() - t0 < 8000) return;
        clearInterval(iv);
        G.State.setEnergy(G.State.maxEnergy * (ENERGY[mode] || 1));
        done({ day: Time.day, season: Time.season, weather: Time.weather, mode: mode, lostMoney: 0 });
      }, 150);
    }
    setTimeout(function () { fadeTo(true, 500, dark); }, 1200);
  };
  House.fadeTo = fadeTo; House.fadeInstant = fadeInstant;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function showSummary(info, onClose) {
    var p = document.createElement('div');
    p.className = 'tv-summary';
    var w = WEATHER[Time.weather] || WEATHER.sun, tw = WEATHER[Time.tomorrow] || WEATHER.sun;
    var season = G.VI.season[info.season];
    var html = '<h2>Chào buổi sáng!</h2>';
    html += '<div class="sum-day">Ngày ' + Time.dayOfSeason() + ' · ' + season + '</div>';
    var rest = info.mode === 'faint' ? 'Bạn kiệt sức và ngất đi giữa đêm. Sáng nay chỉ còn 30% năng lượng.' : info.mode === 'passout' ? 'Bạn ngất đi vì thức quá khuya. Năng lượng 50%.' :
      (info.mode === 'late' ? 'Bạn ngủ muộn. Năng lượng 75%.' : 'Bạn ngủ ngon. Năng lượng đầy.');
    var lines = [{ text: rest, icon: info.mode === 'passout' || info.mode === 'faint' ? 'warn' : 'energy' }].concat(House.summaryLines);
    if (!House.summaryLines.length) lines.push({ text: 'Hôm qua chưa bán được gì.', icon: 'coin' });
    html += '<div class="sum-lines">';
    lines.forEach(function (l) { html += '<div class="sum-line">' + Icons.ui(l.icon, 22) + '<span>' + esc(l.text) + '</span></div>'; });
    html += '</div>';
    html += '<div class="sum-weather"><span>' + Icons.ui(w[1], 26) + ' Hôm nay: ' + w[0] + '</span><span>' + Icons.ui(tw[1], 26) + ' Ngày mai: ' + tw[0] + '</span></div>';
    html += '<div class="sum-tip"><b>Bạn có biết?</b> ' + esc(TIPS[(tipIdx++ + Time.day) % TIPS.length]) + '</div>';
    p.innerHTML = html;
    var b = document.createElement('button');
    b.className = 'tv-btn';
    b.textContent = 'Bắt đầu ngày mới';
    p.appendChild(b);
    var closed = false;
    b.addEventListener('click', function () { UI.sfx('tap'); UI.closePanel(); });
    UI.openPanel(p, { dismiss: false, onClose: function () { if (closed) return; closed = true; if (onClose) onClose(); } });
  }

  /* ------------------------------------------------------------------- save */
  G.Save.register('house', {
    save: function () { return { chest: House.chest.serialize(), chestOpened: flags.chestOpened, hint: flags.hint, tier: House.tier }; },
    load: function (o) {
      o = o || {};
      if (o.chest) House.chest.load(o.chest); else fillStarter();
      flags.chestOpened = !!o.chestOpened;
      flags.hint = typeof o.hint === 'number' ? o.hint : 3;
      arrow.visible = !flags.chestOpened;
      startMode = flags.hint < 3 ? 'resume' : null;
      House.setTier(typeof o.tier === 'number' ? o.tier : 0);   // old saves: tier 0
    },
    reset: function () {
      fillStarter();
      flags.chestOpened = false; flags.hint = 0;
      arrow.visible = true; pulseT = 0;
      startMode = 'intro';
      House.setTier(0);
    }
  }, 'world');

  House.flags = flags;
  G.House = House;
  // Stage 16 FIX: warm vignette while indoors (CSS overlay, no draw call)
  (function () {
    var v = document.createElement('div'); v.id = 'house-vignette'; document.body.appendChild(v);
    E.on('scene:changed', function (e) { v.className = e && e.to === 'house' ? 'on' : ''; });
  })();
})();
