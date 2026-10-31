/* Togie Valley - placement_logic.js (Stage 16 H1b): pure decor placement rules (node-readable, no THREE/DOM).
 * Placement p = {id, k:'f'|'w'|'y', x, z, r, side, i}: f = house floor (x,z = top-left local tile), y = yard (world tile), w = wall segment (side 'n'|'w', i = segment).
 * r = quarter turns 0..3 (odd swaps w/d). API: setCtx({hm,furn,yardOK}), dims, kindFor, cells, validate(list,cand,skip) -> '' | reason, revalidate(list) -> {kept,dropped}, wallSegs, floorSet, reachable, pack, unpack. */
(function (root) {
  'use strict';
  var PL = { MAX: { f: 60, w: 24, y: 40 }, WINDOW_X: 2 }, ctx = { hm: null, furn: null, yardOK: null };
  /* Stage 17 DECOR a: static yard rule (pure). Free grass within YARD.reach tiles of the farmhouse footprint ('H' tiles), never inside the farm box
   * (soil + locked plots + all 3 land tiers + fences/signs), never on the annex tiles or the west plot sign tile. Runtime adds walkable/blocked/interactable checks. */
  var YARD = { reach: 6, farm: [11, 6, 29, 19], skip: { '7,10': 1, '7,11': 1, '10,14': 1 } }, houseBox = null, houseRows = null;
  PL.YARD = YARD;
  PL.houseBox = function (rows) {
    var x, z, b = null;
    if (houseRows === rows && houseBox) return houseBox;
    for (z = 0; z < Math.min(rows.length, 40); z++) for (x = 0; x < Math.min(rows[z].length, 40); x++) if (rows[z].charAt(x) === 'H') { if (!b) b = [x, z, x, z]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], z); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], z); }
    houseRows = rows; houseBox = b; return b;
  };
  PL.yardStatic = function (rows, tx, tz) {
    var b = PL.houseBox(rows), f = YARD.farm;
    if (!b || tz < 0 || tz >= rows.length || tx < 0 || tx >= rows[tz].length) return false;
    if (tx < b[0] - YARD.reach || tx > b[2] + YARD.reach || tz < b[1] - YARD.reach || tz > b[3] + YARD.reach) return false;
    if (tx >= f[0] && tx <= f[2] && tz >= f[1] && tz <= f[3]) return false;
    return rows[tz].charAt(tx) === '.' && !YARD.skip[tx + ',' + tz];
  };
  PL.setCtx = function (c) { if (c.hm) ctx.hm = c.hm; if (c.furn) ctx.furn = c.furn; if (c.yardOK) ctx.yardOK = c.yardOK; };
  PL.dims = function (it, r) { return (r & 1) ? [it.d, it.w] : [it.w, it.d]; };
  PL.kindFor = function (it, scene) { return it.place === 'wall' ? 'w' : it.place === 'floor' ? 'f' : it.place === 'yard' ? 'y' : (scene === 'house' ? 'f' : 'y'); };
  PL.cells = function (p) {
    var it = ctx.furn.get(p.id), d, out = [], a, b;
    if (!it || p.k === 'w') return out;
    d = PL.dims(it, p.r | 0);
    for (a = 0; a < d[0]; a++) for (b = 0; b < d[1]; b++) out.push([p.x + a, p.z + b]);
    return out;
  };
  PL.floorSet = function () { var s = {}; ctx.hm.floorTiles().forEach(function (c) { s[c.ix + ',' + c.iz] = 1; }); return s; };
  /* wall segments: key 'n:i' / 'w:i' -> 'any' | 'curtain' (window tile). Kitchen shelf and bed rows stay clear. */
  PL.wallSegs = function () {
    var hm = ctx.hm, out = {}, i, kit = {}, bedMax = 0;
    hm.spots.kitchen.forEach(function (s) { kit[s[0]] = 1; });
    hm.spots.bed.forEach(function (s) { if (s[1] > bedMax) bedMax = s[1]; });
    for (i = 0; i < hm.width; i++) { if (kit[i]) continue; out['n:' + i] = i === PL.WINDOW_X ? 'curtain' : 'any'; }
    for (i = bedMax + 1; i < hm.depth - 1; i++) out['w:' + i] = 'any';
    return out;
  };
  /* every stand tile / spawn must stay reachable from the door approach (4-neighbour, conservative) */
  PL.reachable = function (solid, seats) {
    var hm = ctx.hm, W = hm.width, D = hm.depth, seen = {}, q = [], s = hm.spawns.door, tg = [], k, c, n, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function ok(x, z) { return hm.isWalkable(x, z) && !solid[x + ',' + z]; }
    if (!ok(s[0], s[1])) return false;
    q.push([s[0], s[1]]); seen[s[0] + ',' + s[1]] = 1;
    while (q.length) { c = q.pop(); dirs.forEach(function (d) { var x = c[0] + d[0], z = c[1] + d[1], key = x + ',' + z; if (x < 0 || z < 0 || x >= W || z >= D || seen[key] || !ok(x, z)) return; seen[key] = 1; q.push([x, z]); }); }
    Object.keys(hm.spots).forEach(function (n2) { hm.spots[n2].forEach(function (e) { tg.push([e[2], e[3]]); }); });
    tg.push([hm.spawns.wake[0], hm.spawns.wake[1]], [hm.spawns.bed[0], hm.spawns.bed[1]]);
    for (k = 0; k < tg.length; k++) if (!seen[tg[k][0] + ',' + tg[k][1]]) return false;
    if (seats) for (k = 0; k < seats.length; k++) {   // stage 12: every seat / bed keeps a free neighbour tile the player can reach (Solids would otherwise un-block it)
      if (!seats[k].some(function (c3) { return dirs.some(function (d) { return seen[(c3[0] + d[0]) + ',' + (c3[1] + d[1])] === 1; }); })) return false;
    }
    var x2, z2;   // stage 12: no walled-off pocket of free floor either (a teleport or a seat stand tile could land the player in it)
    for (z2 = 0; z2 < D; z2++) for (x2 = 0; x2 < W; x2++) if (ok(x2, z2) && !seen[x2 + ',' + z2]) return false;
    return true;
  };
  function solidOf(list, skip, extra) {
    var s = {}, all = list.concat(extra ? [extra] : []);
    all.forEach(function (p, j) { var it; if (j === skip || p.k !== 'f') return; it = ctx.furn.get(p.id); if (it && !it.flat) PL.cells(p).forEach(function (c) { s[c[0] + ',' + c[1]] = 1; }); });
    return s;
  }
  function seatsOf(list, skip, extra) {
    var out = [];
    list.concat(extra ? [extra] : []).forEach(function (p, j) { var it; if (j === skip || p.k !== 'f') return; it = ctx.furn.get(p.id); if (it && !it.flat && (it.cat === 'seat' || /bed/.test(it.id))) out.push(PL.cells(p)); });
    return out;
  }
  PL.validate = function (list, cand, skip) {
    var it = ctx.furn.get(cand.id), n = 0, occ = {}, cs, j, p, fs, k, key, flat;
    if (!it) return 'Món này không có.';
    if (PL.kindFor(it, cand.k === 'y' ? 'outdoor' : 'house') !== cand.k) return 'Món này không đặt ở đây được.';
    list.forEach(function (q, jj) { if (jj !== skip && q.k === cand.k) n++; });
    if (n >= PL.MAX[cand.k]) return 'Chỗ này đã quá nhiều đồ rồi.';
    if (cand.k === 'w') {
      var seg = PL.wallSegs()[cand.side + ':' + cand.i];
      if (!seg || (seg === 'curtain' && it.id !== 'curtains')) return 'Tường chỗ này không treo được.';
      for (j = 0; j < list.length; j++) { p = list[j]; if (j !== skip && p.k === 'w' && p.side === cand.side && p.i === cand.i) return 'Đã có đồ treo ở đây.'; }
      return '';
    }
    cs = PL.cells(cand); flat = !!it.flat;
    if (cand.k === 'y') {
      for (k = 0; k < cs.length; k++) if (!ctx.yardOK(cs[k][0], cs[k][1])) return 'Sân chỗ này không đặt được.';
      for (j = 0; j < list.length; j++) { p = list[j]; if (j === skip || p.k !== 'y') continue; PL.cells(p).forEach(function (c) { occ[c[0] + ',' + c[1]] = 1; }); }
      for (k = 0; k < cs.length; k++) if (occ[cs[k][0] + ',' + cs[k][1]]) return 'Đã có đồ ở đây.';
      return '';
    }
    fs = PL.floorSet();
    for (k = 0; k < cs.length; k++) if (!fs[cs[k][0] + ',' + cs[k][1]]) return 'Chỗ này không đặt được.';
    for (j = 0; j < list.length; j++) {
      p = list[j]; if (j === skip || p.k !== 'f') continue;
      if (!!ctx.furn.get(p.id).flat !== flat) continue;
      PL.cells(p).forEach(function (c) { occ[c[0] + ',' + c[1]] = 1; });
    }
    for (k = 0; k < cs.length; k++) if (occ[cs[k][0] + ',' + cs[k][1]]) return 'Đã có đồ ở đây.';
    if (!flat && !PL.reachable(solidOf(list, skip, cand), seatsOf(list, skip, cand))) return 'Món này sẽ chặn lối đi.';
    return '';
  };
  /* keep what still fits (in order), drop the rest (caller returns them to the inventory) */
  PL.revalidate = function (list) {
    var kept = [], dropped = [];
    list.forEach(function (p) { if (PL.validate(kept, p, -1) === '') kept.push(p); else dropped.push(p); });
    return { kept: kept, dropped: dropped };
  };
  PL.pack = function (list) { return list.map(function (p) { return p.k === 'w' ? [p.id, 'w', p.side, p.i, 0] : (p.d != null ? [p.id, p.k, p.x, p.z, p.r | 0, p.d | 0] : [p.id, p.k, p.x, p.z, p.r | 0]); }); };
  PL.unpack = function (arr) {
    var out = [], q;
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (a) {
      if (!Array.isArray(a) || !ctx.furn.get(a[0])) return;
      if (a[1] === 'w' && (a[2] === 'n' || a[2] === 'w') && isFinite(a[3])) out.push({ id: a[0], k: 'w', x: 0, z: 0, r: 0, side: a[2], i: a[3] | 0 });
      else if ((a[1] === 'f' || a[1] === 'y') && isFinite(a[2]) && isFinite(a[3])) { q = { id: a[0], k: a[1], x: a[2] | 0, z: a[3] | 0, r: (a[4] | 0) & 3 }; if (ctx.furn.get(a[0]).decay && isFinite(a[5])) q.d = a[5] | 0; out.push(q); }
    });
    return out;
  };
  if (root.Game) root.Game.PlaceLogic = PL;
  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
