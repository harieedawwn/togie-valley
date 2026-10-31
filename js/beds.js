/* Togie Valley - beds.js (Round 3 stage 4): Game.Beds, registry of every usable sleep spot (built-in bed, placed beds, placed old mattresses).
 * API: spots() -> [{id, kind 'house'|'bed'|'mattress', x, z (footprint centre, world), facing (yaw, head at local -z), lie {x,y,z} (hips offset from x/z, y = lying height), occupant (null | player id)}],
 *      get(id), claim(id, playerId) -> bool (false = unknown or taken by someone else), release(id) -> bool, occupantOf(id).
 * Ids: 'house' (built-in bed, absent while a placed bed hides it), '<furnId>@<x>,<z>' for placed pieces (stable until moved). Occupancy is transient (not saved) and pruned when a spot disappears.
 * Lying offsets mirror bed_sleep.js MODELS (hips 0.5 behind the pillow). Mattresses on their last decay stage are not listed. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Furniture || !G.Placement || !G.House || !G.PlaceLogic) { console.error('[beds] missing deps'); return; }
  var F = G.Furniture, Pl = G.Placement, H = G.House, PL = G.PlaceLogic, B = G.Beds = {}, occ = {}, HALF = Math.PI / 2;
  var MODELS = { house: { px: 0, pz: -0.62, lie: 0.48 }, bed_single: { px: 0, pz: -0.68, lie: 0.49 }, bed_double: { px: -0.45, pz: -0.62, lie: 0.48 }, mattress_old: { px: 0, pz: -0.7, lie: 0.25 } };
  var SAG = [0, 0.02, 0.06, 0.09];   // mirrors furniture.js MAT.sag: the middle slab (where the hips lie) sinks
  function make(id, kind, m, cx, cz, r, p, sag) {
    var th = (r & 3) * HALF, c = Math.cos(th), s = Math.sin(th), lz = m.pz + 0.5;
    return { id: id, kind: kind, x: cx, z: cz, facing: th, lie: { x: m.px * c + lz * s, y: m.lie - (sag || 0), z: -m.px * s + lz * c }, occupant: occ[id] || null, p: p || null };
  }
  B.spots = function () {
    var out = [], l = Pl.list(), seen = {}, today = G.Time ? G.Time.day : 1, i, p, it, d, s, k;
    if (!H.bedHidden) out.push(make('house', 'house', MODELS.house, H.OX + 0.5, H.OZ + 1.0, 0));
    for (i = 0; i < l.length; i++) {
      p = l[i]; it = p.k === 'f' && F.get(p.id);
      if (!it || !(it.bed || it.decay) || (it.decay && F.decayStage(p.d, today) >= F.DECAY_DAYS)) continue;
      d = PL.dims(it, p.r);
      out.push(make(p.id + '@' + p.x + ',' + p.z, it.decay ? 'mattress' : 'bed', MODELS[p.id] || MODELS.bed_single, H.OX + p.x + d[0] / 2, H.OZ + p.z + d[1] / 2, p.r, p, it.decay ? SAG[Math.min(3, F.decayStage(p.d, today))] : 0));
    }
    for (i = 0; i < out.length; i++) seen[out[i].id] = 1;
    for (k in occ) if (!seen[k]) delete occ[k];
    return out;
  };
  B.get = function (id) { var l = B.spots(), i; for (i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
  B.occupantOf = function (id) { return occ[id] || null; };
  B.claim = function (id, playerId) {
    if (!B.get(id) || !playerId) return false;
    if (occ[id] && occ[id] !== playerId) return false;
    occ[id] = playerId; return true;
  };
  B.release = function (id) { if (!occ[id]) return false; delete occ[id]; return true; };
})();
