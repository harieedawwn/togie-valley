/* Togie Valley - anim_actions.js (Stage 15D Part 2): wires the non-farm clips to the game and spawns their impact effects.
 * sit/stand (player:sat/stood), bed_in/bed_out (BedSleep, called from house.js), buy (shop:transaction), sell (bin/crate closed with more value),
 * cook (cook:done), level-up (skill:levelUp, queued behind any running clip; seated variant on the pier), shake-off after rain (CharAnim idle),
 * plus emote marks and sparkle/coin bursts on anim:impact. Depends on AnimClips, AnimTools, FarmFx (particles), CharAnim.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.AnimClips || !G.Player || !G.Events || !G.Loop) { console.error('[anim_actions] missing dependencies'); return; }
  var P = G.Player, E = G.Events, C = G.AnimClips, AT = G.AnimTools, FX = G.FarmFx, hero = P.hero;
  var _v = new THREE.Vector3(), lvPending = 0, DIRV = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  function head(out) { hero.joints.head.getWorldPosition(out); return out; }
  function fx() { return FX && FX.fx; }

  /* ---- seat transitions (no lock: the fishing module locks while seated) */
  E.on('player:sat', function () { P.playAction('sit', {}); });
  E.on('player:stood', function () { P.playAction('stand', {}); });

  /* ---- shopping */
  E.on('shop:transaction', function (e) { if (e && e.kind !== 'upgrade' && !C.active()) P.playAction('buy', {}); });

  /* ---- cooking: the kitchen panel stays open; the hero stirs behind it */
  E.on('cook:done', function () { P.playAction('cook', {}); });

  /* ---- level-up waits for the running clip, then jumps (or cheers when seated) */
  E.on('skill:levelUp', function () { lvPending = 1; });
  G.Loop.onFrame(function () {
    if (!lvPending || C.active()) return;
    lvPending = 0; P.playAction(P.sitting ? 'levelup_seated' : 'levelup', {});
  }, 101.5);

  /* Small translucent Z beside the head (along the bed's width) and above it, never over the face. */
  function zz() { if (G.Rest && G.Rest.resting()) return; var y = C.bed.yaw, sd = 0.42; head(_v); AT.emote('z', _v.x + Math.cos(y) * sd, _v.y + 0.28, _v.z - Math.sin(y) * sd, 1.7, 0.26, 0.5); }
  /* ---- Zzz keep floating above the head while the bed_in pose is held */
  var zzT = 0;
  G.Loop.onFrame(function (dt) {
    if (C.active() !== 'bed_in' || C.u() < 0.99 || !AT) { zzT = 0.6; return; }
    zzT -= dt;
    if (zzT <= 0) { zzT = 1.8; zz(); }
  }, 101.6);

  /* ---- impact effects */
  E.on('anim:impact', function (e) {
    var f = fx(), d, i;
    if (!e) return;
    if (e.tier === 3 && f && (e.name === 'till' || e.name === 'water') && e.stage === 'hit') f.burst(e.tx + 0.5, 0.35, e.tz + 0.5, 5, 0xfff1a8, 0.7, 1.9, 0.04, 4, 0.7);   // top-tier sparkle (pooled FarmFx burst, no new draw calls)
    if (e.name === 'bed_in' && AT && (e.stage === 'zz')) zz();
    else if (e.name === 'bed_out' && e.stage === 'hit' && f) { head(_v); f.burst(_v.x, _v.y + 0.15, _v.z, 6, 0xfff1a8, 0.9, 2.2, 0.04, 5, 0.6); }
    else if (e.name === 'buy' && e.stage === 'hit' && f) {
      d = DIRV[P.facing] || DIRV.s; hero.attach.handR.getWorldPosition(_v);
      for (i = 0; i < 4; i++) f.spawn(_v.x, _v.y, _v.z, d[0] * (1 + Math.random()) , 1.6 + Math.random(), d[1] * (1 + Math.random()), 0xf5c542, 0.04, 6, 0.5);
    } else if (e.name === 'sell' && e.stage === 'hit' && f) {
      d = DIRV[P.facing] || DIRV.s; hero.attach.handR.getWorldPosition(_v);
      for (i = 0; i < 5; i++) f.spawn(_v.x, _v.y, _v.z, d[0] * (1.4 + Math.random()), 2 + Math.random(), d[1] * (1.4 + Math.random()), i % 2 ? 0xf5c542 : 0xffffff, 0.04, 7, 0.55);
    } else if ((e.name === 'levelup' || e.name === 'levelup_seated') && f) {
      head(_v);
      if (e.stage === 'hit') { f.burst(P.pos.x, _v.y - 0.3, P.pos.z, 14, 0xfff1a8, 1.5, 3.2, 0.05, 6, 0.9); if (G.FishingFx) G.FishingFx.confetti(P.pos.x, _v.y + 0.2, P.pos.z, 14); }
      else if (e.stage === 'land') f.burst(P.pos.x, 0.05, P.pos.z, 6, 0xf6e8c8, 1.1, 0.8, 0.05, 6, 0.5);
    } else if (e.name === 'cook' && f && (e.stage === 'stir' || e.stage === 'done')) {
      d = DIRV[P.facing] || DIRV.s; hero.attach.handR.getWorldPosition(_v);
      f.burst(_v.x + d[0] * 0.2, _v.y + 0.1, _v.z + d[1] * 0.2, e.stage === 'done' ? 8 : 3, e.stage === 'done' ? 0xfff1a8 : 0xf4f4f4, 0.4, 1.2, 0.035, 3, 0.6);
    } else if (e.name === 'shake' && f && e.stage === 'drops') { head(_v); f.burst(_v.x, _v.y - 0.2, _v.z, 10, 0x9fdcff, 1.4, 1.2, 0.03, 8, 0.5); }
    else if (e.name === 'drink' && f && e.stage === 'gulp') { head(_v); d = DIRV[P.facing] || DIRV.s; f.burst(_v.x + d[0] * 0.2, _v.y + 0.1, _v.z + d[1] * 0.2, 2, 0x9fdcff, 0.3, 0.8, 0.025, 6, 0.4); }
  });

  // Stage 17: wave emote (lock-0 clip, the hero keeps walking). Game.Player.wave() plays it unless another action clip is running.
  P.wave = function () { if (G.AnimClips && G.AnimClips.busy && G.AnimClips.busy()) return false; P.playAction('wave', { duration: 1.5 }); return true; };
})();
