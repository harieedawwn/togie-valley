/* Togie Valley - bed_sleep.js (Round 3 stage 5): Game.BedSleep, the bed-sleep sequence on top of the clip data system.
 * Plays clips bed_in (step up beside the spot, turn, sit, lie back, head on the pillow, HOLD) and bed_out (sit up, stretch, stand, step down to the bedside) from anim_data.js.
 * Every sleep spot comes from Game.Beds (built-in bed, placed beds, old mattresses): hips lie at spot centre + lie.x/z, yaw = facing, surface = lie.y (a sagging mattress is lower),
 * so the pose fits any spot: sit = lie.y + 0.08 (hips just above the surface), dy = 0.03 (sit + dy = lie.y + 0.11, the calibrated lying height).
 * bed_in is preceded by hat_off (hat lifted off); Game.SleepLook (sleep_look.js) owns hat / eyes / bun while lying.
 * house.js / night.js call ready(), enter(t, cb) (player next to the spot), wakeSpot() (claims a free spot, returns the bedside tile), lie() (resume lying), out(cb), faint(cb) (stagger, kneel, fall flat).
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.AnimClips || !G.AnimData || !G.House || !G.Player || !G.Beds || !G.Loop) { console.error('[bed_sleep] missing dependencies'); return; }
  var H = G.House, C = G.AnimClips, P = G.Player, D = G.AnimData, HM = G.HouseMap, B = G.Beds, hero = P.hero;
  var BS = G.BedSleep = {}, stand = null, curId = null, OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

  function me() { return (G.Net && G.Net.playerId) || 'p1'; }
  function idOf(t) { var p = t && t.p; return p && p.id && p.k === 'f' && (B.get(p.id + '@' + p.x + ',' + p.z)) ? p.id + '@' + p.x + ',' + p.z : 'house'; }
  function aim(s) {
    var T = C.bed, ly = s.lie.y;
    T.x = s.x + s.lie.x; T.z = s.z + s.lie.z; T.sit = ly + 0.08; T.dy = 0.03; T.yaw = s.facing;
  }
  /* first free spot: the built-in bed, then the others; claimed for this player */
  function pick() {
    var l = B.spots(), i, s = null;
    for (i = 0; i < l.length && !s; i++) if (!l[i].occupant || l[i].occupant === me()) s = l[i];
    if (!s) s = l[0] || null;
    return s;
  }
  function hold(s) { if (!s) return null; B.claim(s.id, me()); curId = s.id; aim(s); return s; }
  function bedside(s) {
    var cells, c, i, ix, iz;
    if (s.p && G.Seat && G.Seat.standCandidates) {
      cells = G.PlaceLogic.cells(s.p).map(function (q) { return [q[0] + H.OX, q[1] + H.OZ]; });
      c = G.Seat.standCandidates(cells, s.p.r & 3, cells[0]);
      for (i = 0; i < c.length; i++) {
        ix = c[i].tx - H.OX; iz = c[i].tz - H.OZ;
        if (HM.isWalkable(ix, iz) && !(G.Solids && G.Solids.houseBlocked(ix, iz))) return c[i];
      }
    }
    return H.bedSpawn();
  }

  /* Hat + bun + eyes while lying: Game.SleepLook derives them every frame from the clip (transient, never stored). */
  function climb(cb) { P.playAction('hat_off', {}, function () { P.playAction('bed_in', {}, cb); }); }   // hands lift the hat off at the bedside, then climb in

  /* ---- API */
  BS.idOf = idOf;
  /** Multiplayer: enter the spot the host assigned (place = walk the player to its bedside first). false = gone or taken. */
  BS.enterId = function (id, cb, place) {
    var s = B.get(id), c, dx, dz, tl;
    if (!s || (s.occupant && s.occupant !== me())) return false;
    hold(s);
    if (place) {
      c = bedside(s); dx = s.x - (c.tx + 0.5); dz = s.z - (c.tz + 0.5);
      P.placeAt({ tx: c.tx, tz: c.tz, facing: Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n') });
    }
    tl = P.tile({});
    stand = { tx: tl.tx, tz: tl.tz, facing: OPP[P.facing] || 'e' };
    climb(cb);
    return true;
  };
  /** Multiplayer faint: hold the spot the host gave (wakeSpot / lie then use it). */
  BS.take = function (id) { var s = B.get(id); if (!s) return false; stand = null; hold(s); return true; };
  BS.ready = function () { return D.has('hat_off') && D.has('bed_in') && D.has('bed_out') && D.has('faint'); };
  /** Player stands next to the chosen spot facing it: play the climb + lie down; cb fires when lying (the pose then holds). false = spot gone or taken. */
  BS.enter = function (t, cb) {
    var s, tl = P.tile({});
    try { s = B.get(idOf(t)); if (!s || (s.occupant && s.occupant !== me())) return false; hold(s); } catch (e) { console.error(e); return false; }
    stand = { tx: tl.tx, tz: tl.tz, facing: OPP[P.facing] || 'e' };
    climb(cb);
    return true;
  };
  /** Bedside tile of the spot to wake in (claims a free spot unless one is already held). */
  BS.wakeSpot = function () {
    var s = curId && B.get(curId);
    if (!s) { s = hold(pick()); stand = null; }
    if (stand) return stand;
    return s ? bedside(s) : H.bedSpawn();
  };
  /** Resume the lying pose on the held spot (after the black-out, also for a faint). false = no spot. */
  BS.lie = function () {
    var s = curId && B.get(curId);
    if (!s) { s = hold(pick()); if (!s) return false; }
    aim(s); P.playAction('bed_in', { u0: 1 });
    return true;
  };
  BS.out = function (cb) {
    P.playAction('bed_out', {}, function () {
      if (curId) B.release(curId);
      curId = null; stand = null;
      if (cb) cb();
    });
  };
  /** Collapse where the player stands: hips stay put, body falls flat on the ground (clip 'faint', holds the pose). */
  BS.faint = function (cb) {
    var T = C.bed;
    T.x = hero.root.position.x; T.z = hero.root.position.z; T.sit = 0; T.dy = 0; T.yaw = hero.root.rotation.y;
    P.playAction('faint', {}, cb);
  };
})();
