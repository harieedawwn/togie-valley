/* Togie Valley - main.js (Stage 1 boot)
 * Boots display + renderer, builds the outdoor world, enters the 'outdoor' scene in front of the house door.
 * Later stages hook in via Game.Events (game:ready) and add their own modules before this file.
 */
(function () {
  'use strict';

  var ui = document.getElementById('ui');

  function fail(msg) {
    console.error('[main] ' + msg);
    if (ui) {
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:0;right:0;top:40%;text-align:center;color:#fff;font:16px var(--font-ui);padding:0 24px';
      d.textContent = msg;
      ui.appendChild(d);
    }
  }

  if (typeof THREE === 'undefined') { fail('Không tải được Three.js (hãy kiểm tra kết nối mạng).'); return; }
  var G = window.Game;
  if (!G || !G.Render || !G.Models || !G.World || !G.Town || !G.Decor || !G.Input || !G.Scenes || !G.Player || !G.Interact || !G.Items || !G.State || !G.Inventory || !G.Containers || !G.Time || !G.Day || !G.Save) {
    fail('Không tải được mã trò chơi.');
    return;
  }

  if (G.Boot) G.Boot.mark('main');
  var canvas = document.getElementById('game');
  if (G.BootScene) G.BootScene.handOver();   // stage 30: dispose the boot diorama (its WebGL context) before the game renderer exists
  try {
    G.Display.init(canvas);
    G.Render.init(canvas);
  } catch (err) {
    fail('Thiết bị hoặc trình duyệt này không hỗ trợ WebGL.');
    console.error(err);
    return;
  }

  G.Input.init(canvas);
  // Stage 36: the heavy world/scenery/model builds run as time-sliced steps (Game.Boot.slice, ~8 ms chunks) so the splash stays smooth and tappable.
  /* DetailExtra.build (all steps in one go) is begin() + step() until false; Town.build likewise. */
  function resumable(name) {   // Town / DetailExtra expose begin() -> {step()}; step() returns true while work is left (Game.Boot.slice calls it again)
    var job = null;
    return function () {
      if (!G[name]) return false;
      if (!job) job = G[name].begin();
      return job.step();
    };
  }
  var BUILD = [
    ['World', function () { G.World.build(); }],
    ['Decor', function () { G.Decor.build(); }],
    ['Town', resumable('Town')],
    ['Scenery', function () { if (G.Scenery) G.Scenery.build(); }],
    ['DetailTerrain', function () { if (G.DetailTerrain) G.DetailTerrain.build(); }],
    ['DetailTown', function () { if (G.DetailTown) G.DetailTown.build(); }],
    ['FarmLook', function () { if (G.FarmLook) G.FarmLook.build(); }],
    ['Landmarks', function () { if (G.Landmarks) G.Landmarks.build(); }],
    ['Grass', function () { if (G.Grass) G.Grass.build(); }],
    ['DetailExtra', resumable('DetailExtra')],
    ['Critters', function () { if (G.Critters) G.Critters.build(); }],
    ['LandFarm', function () { if (G.LandFarm) G.LandFarm.build(); }],
    ['LandHouse', function () { if (G.LandHouse) G.LandHouse.build(); }],
    ['LandOffice', function () { if (G.LandOffice) G.LandOffice.build(); }],
    ['FurnitureShop', function () { if (G.FurnitureShop) G.FurnitureShop.build(); }],
    ['ChillSpots', function () { if (G.ChillSpots) G.ChillSpots.build(); }],
    ['VillageVN', function () { if (G.VillageVN) G.VillageVN.build(); }],
    ['VNLife', function () { if (G.VNLife) G.VNLife.build(); }],
    ['Bike', function () { if (G.Bike) G.Bike.build(); }],
    ['Ambient', function () { if (G.Ambient) G.Ambient.build(); }],
    ['AmbientPlus', function () { if (G.AmbientPlus) G.AmbientPlus.build(); }],
    ['Birds', function () { if (G.Birds) G.Birds.build(); }],
    ['Weather', function () { if (G.Weather) G.Weather.build(); }],
    ['Farm', function () { if (G.Farm) G.Farm.build(); }],
    ['FarmFx', function () { if (G.FarmFx) G.FarmFx.build(); }]
  ];

  // New game start: the tile in front of the house door, facing the door.
  function newSpawn() {
    if (G.House && G.Scenes.has('house')) return G.House.wakeSpawn();   // Stage 5: wake up in the house
    var door = G.World.listInteractables('door')[0];
    return door ? { tx: door.stand.tx, tz: door.stand.tz, facing: door.facing } : { tx: 9, tz: 13, facing: 'n' };
  }

  // Savers (Stage 2). Scene/player/camera are applied together on save:loaded / save:reset.
  var pending = null;
  G.Save.register('time', G.Time, 'world');
  G.Save.register('state', G.State, 'player');
  G.Save.register('inventory', G.Inventory, 'player');
  G.Save.register('camera', {
    save: function () { var c = G.Camera.getState(); return { yawStep: c.yawStep, zoom: c.zoom }; },
    load: function (o) { G.Camera.setState({ yawStep: (o && o.yawStep) || 0, zoom: (o && o.zoom) || 1 }); },
    reset: function () { G.Camera.setState({ yawStep: 0, zoom: 1 }); }
  }, 'player');
  G.Save.register('scenes', {
    save: function () { return { current: G.Scenes.current }; },
    load: function (o) { pending = pending || {}; pending.scene = o && o.current; },
    reset: function () { pending = { scene: G.Scenes.has('house') ? 'house' : 'outdoor', spawn: newSpawn() }; }
  }, 'player');
  G.Save.register('player', {
    save: function () { var P = G.Player; return { x: P.pos.x, z: P.pos.z, facing: P.facing }; },
    load: function (o) { pending = pending || {}; pending.pos = o; },
    reset: function () { pending = pending || {}; pending.spawn = newSpawn(); }
  }, 'player');

  function applyPending() {
    var p = pending || {}; pending = null;
    var scene = p.scene || 'outdoor', spawn = p.spawn;
    if (!spawn && p.pos && typeof p.pos.x === 'number') spawn = { x: p.pos.x, z: p.pos.z, facing: p.pos.facing || 's' };
    if (!spawn || !G.Scenes.has(scene)) { scene = 'outdoor'; spawn = spawn && G.Scenes.has(p.scene || 'outdoor') ? spawn : newSpawn(); }
    G.Player.stop();
    G.Scenes.go(scene, spawn, { instant: true });
  }
  G.Events.on('save:loaded', applyPending);
  G.Events.on('save:reset', applyPending);

  function finish() {
    G.Camera.setState({ yawStep: 0, zoom: 1 });
    if (G.SaveSlots) G.SaveSlots.init();   // Stage 14A: pick the active slot key (migrates the v1 save) before loading
    if (!G.Save.load()) G.Save.newGame(true);   // fresh storage: no save is written before the title screen choice

    G.debug = {
      give: function (id, n) { return G.Inventory.add(id, n === undefined ? 1 : n); },
      setTime: function (h) { G.Time.setHour(h); },
      skipDay: function () { return G.Day.sleep(); },
      addMoney: function (n) { return G.State.addMoney(n); }
    };

    G.Loop.start();
    if (G.Boot) { G.Boot.mark('ready'); requestAnimationFrame(function () { requestAnimationFrame(function () { G.Boot.mark('frame1'); }); }); }
    G.Events.emit('game:ready', { stage: 13 });
  }

  function runBuild() {
    if (!G.Boot) { BUILD.forEach(function (st) { while (st[1]() === true) { /* resumable */ } }); finish(); return; }
    G.Boot.slice(BUILD, finish, function () { fail('Không dựng được thế giới trò chơi.'); });
  }
  runBuild();
})();
