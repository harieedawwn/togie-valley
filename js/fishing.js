/* Togie Valley - fishing.js (Stage 9): Game.Fishing - pier seat fishing logic.
 * State machine: off -> (idle when seated) -> cast -> wait -> bite -> reel -> result -> idle/off. Cast anywhere via castAt(tx,tz) (taps routed by fishing_cast.js).
 * Depends on: data_fish.js, state.js, time.js, player.js, interact.js, world.js, ui.js, save.js, render.js
 * Public: Fishing.state, seat, rodInfo(), heldRod(), castAt(tx,tz), castQuality(tile), tapWait(), baitId, pickCatch(zone), zoneFor(v), qualityFor(lvl,perfect), records, totals,
 *   cancel(), stats(). Events: fish:sat, fish:cast {zone,v}, fish:bite {id}, fish:caught {id,n,q,first,size,perfect},
 *   fish:escaped {id,reason}, fish:junk {id}, fish:stopped. Save key: fishing.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (typeof THREE === 'undefined' || !G || !G.FishOdds || !G.FishData || !G.Player || !G.World || !G.State || !G.Inventory || !G.Time || !G.UI || !G.Save || !G.Render || !G.Icons) {
    console.error('[fishing] missing deps (fish_odds.js, data_fish.js, player, world, state, time, ui, save, render, icons)'); return;
  }
  var E = G.Events, P = G.Player, W = G.World, S = G.State, Inv = G.Inventory, T = G.Time, UI = G.UI, Items = G.Items, FD = G.FishData, Icons = G.Icons;

  var F = G.Fishing = {
    state: 'off', seat: null, baitId: null, records: {}, totals: { casts: 0, catches: 0, junk: 0, escapes: 0, perfect: 0 }, flags: { h: {} }
  };
  var ZONES = ['s', 'm', 'd'];
  var CAST_SEC = 0.55, MAX_CAST = 7, TINY_WATER = G.FishOdds ? G.FishOdds.TINY : 24;

  var held = false, btnDown = false, charge = 0, castT = 0, waitT = 0, biteT = 0, biteWin = 0, resT = 0;
  var castPos = { x: 0, z: 0 }, target = null, from = null, plan = null, rod = null, usedBait = null, paused = false, locked = false;
  var R = null;   // reel state
  var bobT = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function wr(tag) { return G.Net.rand(tag, F.totals.casts); }   // Stage 14A: gameplay rolls derive from Time.seed + day (+ cast count)
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function toast(m, i) { UI.toast(m, i); }
  function hint(id, msg, icon) { if (F.flags.h[id]) return; F.flags.h[id] = 1; toast(msg, icon || 'star'); G.Save.request(); }

  /* ------------------------------------------------------------------ rules */
  F.zoneFor = function (v) { return v < 0.34 ? 's' : v < 0.67 ? 'm' : 'd'; };
  function isWater(tx, tz) { return W.tileType(tx + 0.5, tz + 0.5) === 'water'; }
  function shoreDist(tx, tz) {   // Chebyshev distance (1..7) to the nearest non-water tile
    var r, dx, dz;
    for (r = 1; r < 7; r++) for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) if ((dx === -r || dx === r || dz === -r || dz === r) && !isWater(tx + dx, tz + dz)) return r;
    return 7;
  }
  function waterRegion(tx, tz, cap) {   // size of the connected water body, counted up to cap
    var seen = {}, q = [[tx, tz]], n = 0, c, i, d, k, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    seen[tx + ',' + tz] = 1;
    while (q.length && n < cap) {
      c = q.pop(); n++;
      for (i = 0; i < 4; i++) { d = D[i]; k = (c[0] + d[0]) + ',' + (c[1] + d[1]); if (!seen[k] && isWater(c[0] + d[0], c[1] + d[1])) { seen[k] = 1; q.push([c[0] + d[0], c[1] + d[1]]); } }
    }
    return n;
  }
  function typeAt(tx, tz) { return W.tileType(tx + 0.5, tz + 0.5); }
  /* 'bad' (hopeless) only: <= 1.5 tiles from the caster or a pier, touching the shore, or a tiny pond. Junk 60 % (bad) vs 1 % (good), rolled once at bite time. */
  F.castQuality = function (tile) {
    var cx = tile.tx + 0.5 - P.pos.x, cz = tile.tz + 0.5 - P.pos.z;
    return G.FishOdds.classify({ casterDist: Math.sqrt(cx * cx + cz * cz), pierDist: G.FishOdds.pierDist(typeAt, tile.tx, tile.tz), shoreTouch: G.FishOdds.shoreTouch(typeAt, tile.tx, tile.tz),
      region: waterRegion(tile.tx, tile.tz, TINY_WATER) });
  };

  function bestRod() {
    var sel = Inv.selected(), best = null, i, s, r;
    if (sel && FD.isRod(sel.id)) return { id: sel.id, tier: sel.tier || 0, info: FD.rodInfo(sel.id) };
    for (i = 0; i < Inv.size; i++) {
      s = Inv.get(i);
      if (s && FD.isRod(s.id)) {
        r = FD.rodOrder.indexOf(s.id);
        if (!best || r > best.rank) best = { id: s.id, tier: s.tier || 0, info: FD.rodInfo(s.id), rank: r };
      }
    }
    return best;
  }
  F.rodInfo = function () { return bestRod(); };
  /* The rod must be in hand (selected hotbar slot). */
  F.heldRod = function () { var sel = Inv.selected(); return sel && FD.isRod(sel.id) ? { id: sel.id, tier: sel.tier || 0, info: FD.rodInfo(sel.id) } : null; };

  function baitOptions() {
    var out = [], i, id;
    for (i = 0; i < FD.baits.length; i++) { id = FD.baits[i]; if (Inv.count(id) > 0) out.push(id); }
    return out;
  }
  function currentBait(r) {
    if (!r || !r.info.bait) return null;
    var sel = Inv.selected();
    if (sel && Items.get(sel.id) && Items.get(sel.id).cat === 'bait') F.baitId = sel.id;
    if (F.baitId && Inv.count(F.baitId) <= 0) F.baitId = null;
    if (!F.baitId) { var o = baitOptions(); F.baitId = o.length ? o[0] : null; }   // no bait panel any more: use what the bag has
    return F.baitId;
  }

  /* Weighted pick of what bites. -> {kind:'fish'|'junk', def} */
  function zoneOk(d, zone, pass) { var z = pass < 2 ? zone : zone === 's' ? 'sm' : zone === 'd' ? 'md' : 'smd', i; for (i = 0; i < z.length; i++) if (d.zones.indexOf(z.charAt(i)) >= 0) return true; return false; }   // last-resort pass: neighbouring zones only
  F.pickCatch = function (zone, baitId, wk, opt) {
    opt = opt || {};   // Stage 16 D2: {hot: bool (ignore zone), prefer: [ids] x6 weight, plain: bool (normal tier only)}; junk is rolled at bite time, not here
    wk = wk === undefined ? 0.5 : clamp(wk, 0, 1);   // wait factor 0 (short) .. 1 (very long)
    var season = T.season, hour = T.hour, wx = T.weather, lvl = S.level('fishing');
    var dawnDusk = (hour < 8.5) || (hour >= 18 && hour < 20.5);
    var bt = baitId ? Items.get(baitId) : null, bk = bt ? bt.bait : null;
    var list = [], total = 0, i, d, w, pass, loose;
    for (pass = 0; pass < 3 && !list.length; pass++) {   // pass 1 relaxes hour/weather/tier/rarity gate (zone kept), pass 2 also the zone, so a cast never ends up empty-handed (no junk fallback)
    loose = pass >= 1; total = 0;
    for (i = 0; i < FD.species.length; i++) {
      d = FD.species[i];
      if ((!opt.hot && !zoneOk(d, zone, pass)) || d.seasons.indexOf(season) < 0 || d.lvl > lvl) continue;
      if (!loose && (hour < d.h[0] || hour >= d.h[1])) continue;
      if (!loose && d.weather && d.weather.indexOf(wx) < 0) continue;
      if (!loose && opt.plain && d.tier && d.tier !== 'normal') continue;
      w = 12 - d.diff * 1.5;
      if (opt.prefer && opt.prefer.indexOf(d.id) >= 0) w *= 6;
      if (d.legend) w *= 0.15;
      w *= loose ? Math.max(rarityMul(d, wk), 0.25) : rarityMul(d, wk);   // relaxed pass: the wait gate must not empty a zone (it used to fall through to zone-free perch)
      if (w <= 0.001) continue;
      if (bk) w *= (d.bait === bk ? 3 : 0.7);
      if (d.lk.indexOf('r') >= 0 && wx === 'rain') w *= 1.8;
      if (d.lk.indexOf('d') >= 0 && dawnDusk) w *= 1.8;
      if (season === 'winter') w *= (d.lk.indexOf('c') >= 0 ? 1.6 : 0.6);
      list.push({ d: d, w: w }); total += w;
    }
    }
    if (!list.length) return { kind: 'junk', def: pickJunk() };   // truly nothing can bite (cannot happen with the species table)
    var r = wr('fish.pick') * total;
    for (i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) return { kind: 'fish', def: list[i].d }; }
    return { kind: 'fish', def: list[list.length - 1].d };
  };
  // Wait-driven rarity: rare species only appear after longer waits, commons dominate short ones.
  var GATE = [0, 0, 0.08, 0.28, 0.48, 0.64];
  function rarityMul(d, k) {
    var g = d.legend ? 0.8 : GATE[clamp(d.diff, 1, 5)];
    if (g <= 0 && d.diff <= 1) return 1.7 - 1.3 * k;
    if (d.diff <= 2 && !d.legend) return (1.5 - 1.1 * k) * clamp((k - g) / 0.15 + 0.35, 0, 1);
    var f = clamp((k - g) / 0.22, 0, 1);
    f = f * f * (3 - 2 * f);
    return f * (0.7 + 1.6 * k + (k > 0.85 ? 1 : 0));
  }
  function pickJunk() {
    var j = FD.junk, r = wr('fish.junkpick') * 3.7, i;
    for (i = 0; i < j.length; i++) { r -= (j[i].id === 'plastic_bag' ? 0.7 : 1); if (r <= 0) return j[i]; }
    return j[0];
  }

  F.qualityFor = function (lvl, perfect, wk) {
    wk = wk === undefined ? 0.5 : clamp(wk, 0, 1);
    var g = clamp((0.02 + 0.02 * lvl + (perfect ? 0.12 : 0) + (G.Cooking ? G.Cooking.bonus('fish') : 0)) * (0.5 + 1.0 * wk), 0, 0.55), s = clamp(g * 2, 0, 0.6), r = wr('fish.quality');
    return r < g ? 'gold' : r < g + s ? 'silver' : 'normal';
  };

  /* Skewed roll first: ~3-40 s, most rolls short-medium, long waits rare. Returns the base roll (0..1) and the real wait. */
  var waitK = 0.2;
  function waitSeconds(hasBait) {
    var u = wr('fish.wait');
    waitK = clamp(Math.pow(u, 2.4), 0, 1);
    var t = 3 + 37 * waitK;
    if (hasBait) t *= 0.75;
    if (T.weather === 'rain') t *= 0.85;
    if (T.season === 'winter') t *= 1.25;
    if (G.Cooking) t *= G.Cooking.mul('fish');
    return clamp(t, 2.5, 48);
  }

  function xpFor(def, perfect) {
    var x = 6 + (def.diff || 1) * 5 + def.price / 14;
    return Math.round(x * (perfect ? 1.25 : 1));
  }

  /* ------------------------------------------------------------------ DOM */
  var root = UI.hud && UI.hud.root;
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  if (!root) { console.error('[fishing] UI.hud missing'); return; }

  var hintEl = el('div', 'tv-fishhint', root); hintEl.textContent = 'Chạm xuống đất để thu cần'; hintEl.style.display = 'none';

  var catcher = el('div', 'tv-fishcatch', root); catcher.style.display = 'none';
  var bang = el('div', 'tv-bang', root); bang.textContent = '!'; bang.style.display = 'none';
  var reel = el('div', 'tv-reel', root); reel.style.display = 'none';
  var rFrame = el('div', 'frame', reel), rTrack = el('div', 'track', rFrame), rRip = el('div', 'rip', rTrack), rZone = el('div', 'zone', rTrack), rFish = el('div', 'fishico', rTrack);
  var rProg = el('div', 'prog', rFrame), rFill = el('div', 'fill', rProg), rGlow = el('div', 'glow', rProg), rSpark = el('div', 'spark', rFrame);
  var rHint = el('div', 'hint', reel);
  var rRel = el('button', 'tv-btn rel', reel); rRel.type = 'button'; rRel.textContent = 'Thả rác'; rRel.style.display = 'none';   // junk hooked: let it go (bait refunded, no stats)
  UI.onPress(rRel, function () { if (F.state === 'reel' && R && R.junk) F.reelIn(); });
  var reelFx = el('div', 'tv-reelfx', root); reelFx.style.display = 'none';
  var rc = ['tl', 'tr', 'bl', 'br']; rc.forEach(function (c) { el('i', 'knot ' + c, rFrame); });
  var resCard = el('div', 'tv-fishres tv-card', root); resCard.style.display = 'none';

  /* Stage 14A: Fishing.reelIn() - pull the line in from cast/wait/bite/reel; no penalty, no escape count, bait refunded; stays seated if seated, else the session ends. */
  var PULLABLE = { cast: 1, wait: 1, bite: 1, reel: 1 };
  F.reelIn = function () {
    if (!PULLABLE[F.state]) return false;
    if (usedBait) { Inv.add(usedBait, 1); usedBait = null; }
    btnDown = false; bang.style.display = 'none'; bob.visible = false; line.visible = false;
    toIdle();
    UI.sfx('tap'); E.emit('fish:reeledIn', {});
    return true;
  };
  F.tapWait = function () { if (F.state === 'wait' && landT >= LAND_GRACE) F.reelIn(); };   // action button / Space while waiting
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && PULLABLE[F.state] && !UI.panelOpen && F.reelIn()) e.stopPropagation(); }, true);
  G.Loop.onFrame(function () {
    var show = F.state === 'cast' || F.state === 'wait', d = show ? '' : 'none', r = bestRod();
    if (hintEl.style.display !== d) hintEl.style.display = d;
    view.rodId = r ? r.id : null;
  }, 21);

  /* ------------------------------------------------------------------ bobber (placeholder mesh) */
  var bob = new THREE.Group(); bob.visible = false;
  (function () {
    var m1 = new THREE.MeshBasicMaterial({ color: 0xf0675a }), m2 = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var a = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m1), b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m2);
    b.position.y = -0.09; bob.add(a); bob.add(b);
    G.Render.scene.add(bob);
  })();
  var lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x5b3a29 }));
  line.frustumCulled = false; line.visible = false; G.Render.scene.add(line);

  function rodTip(out) {
    var d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[P.facing] || [0, -1];
    out.x = P.pos.x + d[0] * 0.55; out.y = 0.85; out.z = P.pos.z + d[1] * 0.55; return out;
  }
  var tip = { x: 0, y: 0, z: 0 };
  function placeLine() {
    var p = lineGeo.attributes.position;
    rodTip(tip);
    p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, bob.position.x, bob.position.y, bob.position.z); p.needsUpdate = true;
  }
  G.Loop.onFrame(function (dt) {
    var pt0 = G.Prof && G.Prof.on ? performance.now() : 0;
    fishFrame(dt);
    if (pt0) G.Prof.mark(pt0);
  }, 20);
  function fishFrame(dt) {
    view.nib = (F.state === 'wait' && waitT < 3) ? 1 - waitT / 3 : 0;
    view.R = R; view.plan = plan; view.waitT = waitT; view.state = F.state; view.charge = charge; view.castK = clamp(castT / CAST_SEC, 0, 1);
    if (F.state === 'off' || !target) { bob.visible = false; line.visible = false; bang.style.display = 'none'; view.bobOn = false; return; }
    bobT += dt;
    var st = F.state;
    if (st === 'cast') {
      var k = clamp(castT / CAST_SEC, 0, 1);
      rodTip(tip);
      bob.position.set(tip.x + (target.x - tip.x) * k, tip.y + (0.02 - tip.y) * k + Math.sin(Math.PI * k) * 1.4, tip.z + (target.z - tip.z) * k);
      bob.visible = true;
    } else if (st === 'wait' || st === 'bite' || st === 'reel') {
      var dip = 0, sx = 0;
      if (st === 'wait' && view.nib > 0) dip = -0.03 * view.nib * Math.abs(Math.sin(bobT * 9));
      if (st === 'bite') dip = -0.08 * Math.abs(Math.sin(bobT * 20));
      else if (st === 'reel') { dip = -0.04 * Math.abs(Math.sin(bobT * 14)); sx = Math.sin(bobT * 9) * 0.08; }
      bob.position.set(target.x + sx, 0.02 + Math.sin(bobT * 3) * 0.015 + dip, target.z);
      bob.visible = true;
    } else if (st === 'charge' || st === 'idle' || st === 'result') { bob.visible = false; }
    line.visible = bob.visible;
    if (bob.visible) placeLine();
    view.bobOn = bob.visible;
    if (F.fx) { bob.visible = false; line.visible = false; }   // FishingFx draws the real bobber + line
    if (st === 'bite') {
      var sp = G.Render.worldToScreen(bob.position, tipScreen);
      bang.style.display = sp.visible ? '' : 'none';
      bang.style.transform = 'translate(' + Math.round(sp.x) + 'px,' + Math.round(sp.y - 56) + 'px) translate(-50%,-50%)';
    } else bang.style.display = 'none';
    if (st === 'reel') drawReel(dt);
  }
  var tipScreen = { x: 0, y: 0, visible: true };
  // Read-only view for Stage 10 visuals (FishingFx): persistent object, refreshed every frame (priority 20).
  var view = F.view = { bobPos: bob.position, bobOn: false, R: null, plan: null, charge: 0, castK: 0, rodId: null, nib: 0 };

  /* ------------------------------------------------------------------ session */
  function lockTime() { if (!paused) { paused = true; T.pause('fishing'); } if (!locked) { locked = true; P.lock('fishing'); } }
  function unlockTime() { if (paused) { paused = false; T.resume('fishing'); } if (locked) { locked = false; P.unlock('fishing'); } }

  function showCatcher(on) { catcher.style.display = 'none'; }
  function toIdle() {
    F.state = 'idle'; target = null; plan = null; R = null; held = false;
    showCatcher(false); reel.style.display = 'none'; unlockTime();
    if (!P.sitting) F.cancel();   // standing session ends; seated stays idle on the stool
  }
  function start(seat) {
    F.seat = seat; F.state = 'idle'; bobT = 0;
    toIdle();
    E.emit('fish:sat', { id: seat.id });
    if (!F.flags.h.sit) hint('sit', 'Chạm mặt nước để quăng câu. Cá ở xa bờ thường to hơn nhé.', 'star');
  }
  F.cancel = function () {
    if (F.state === 'off') return;
    F.state = 'off'; target = null; plan = null; R = null; held = false; btnDown = false;
    showCatcher(false); reel.style.display = 'none'; hintEl.style.display = 'none';
    resCard.style.display = 'none'; bang.style.display = 'none'; bob.visible = false; line.visible = false;
    unlockTime(); scrId = null;
    F.seat = null;
    E.emit('fish:stopped', {});
  };

  E.on('interact:seat', function (e) {
    if (P.sitting || (G.Seat && G.Seat.busy()) || G.Scenes.current !== 'outdoor') return;
    var id = e && e.id, list = W.listInteractables('seat'), seat = null, i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) seat = list[i];
    if (!seat) return;
    var idx = parseInt(String(seat.id).replace('seat', ''), 10) || 1;
    var dz = seat.facing === 's' ? 1 : -1, maxD = 0;
    while (W.tileType(seat.tile.tx + 0.5, seat.tile.tz + dz * (maxD + 1) + 0.5) === 'water') maxD++;
    var info = { id: seat.id, tx: seat.tile.tx, tz: seat.tile.tz, idx: idx, dz: dz, maxD: Math.max(1, Math.min(maxD, 10)) };
    if (G.Seat && G.Seat.sit) {   // Stage 16 D3: walk, turn, sit-down clip, then the session starts
      G.Seat.sit({ tx: seat.tile.tx, tz: seat.tile.tz, facing: seat.facing, onSeated: function () { if (P.sitting && F.state === 'off') start(info); } });
      return;
    }
    P.sitAt(seat.tile.tx, seat.tile.tz); start(info);
  });
  E.on('player:stood', function () { F.cancel(); });
  E.on('scene:changed', function () { F.cancel(); });
  E.on('day:ended', function () { if (F.state !== 'off') { F.cancel(); if (P.sitting) P.standUp(); } });

  /* ------------------------------------------------------------------ input */
  var LAND_GRACE = 0.6, BITE_BASE = 1.8, landT = 0, scrId = null;
  function onDown() {   // bite -> hook; reel -> hold. Casting/cancelling is tap-routed (fishing_cast.js) or the action button
    if (F.state === 'bite') hook();
    else if (F.state === 'reel') held = true;
  }
  function onUp() { held = false; }
  window.addEventListener('pointerup', function (ev) {
    if (btnDown) { btnDown = false; onUp(); }
    if (scrId !== null && ev.pointerId === scrId) { scrId = null; onUp(); }
  });
  window.addEventListener('pointercancel', function (ev) {
    if (btnDown) { btnDown = false; onUp(); }
    if (scrId !== null && ev.pointerId === scrId) { scrId = null; onUp(); }
  });
  UI.hud.action.addEventListener('pointerdown', function () { btnDown = true; onDown(); });
  // Bite/reel only: a press anywhere hooks the fish / lifts the reel bar (capture phase so nothing upstream can swallow it).
  window.addEventListener('pointerdown', function (ev) {
    if ((F.state !== 'bite' && F.state !== 'reel') || scrId !== null) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (isHudTarget(ev.target) || (UI.hud.action && UI.hud.action.contains(ev.target))) return;
    scrId = ev.pointerId; onDown();
  }, true);
  function isHudTarget(t) {
    return !!(t && t.closest && t.closest('button, .tv-btn, .tv-slot, #tv-hotbar, .tv-card, #tv-layer'));
  }
  window.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && (F.state === 'bite' || F.state === 'reel')) { e.preventDefault(); onDown(); } });
  // Stuck-input guard: tab switch / focus loss releases everything.
  function dropInput() { held = false; btnDown = false; scrId = null; }
  window.addEventListener('blur', dropInput);
  document.addEventListener('visibilitychange', function () { if (document.hidden) dropInput(); });
  window.addEventListener('pointerdown', function (ev) { touchMode = ev.pointerType === 'touch' || ev.pointerType === 'pen'; }, true);
  window.addEventListener('keyup', function (e) { if ((e.key === ' ' || e.key === 'Enter') && F.state !== 'off') onUp(); });

  /* Cast at a water tile (called by fishing_cast.js after turning/walking). Needs the rod in hand, outdoors, idle or no session. */
  F.castAt = function (tx, tz) {
    if ((F.state !== 'off' && F.state !== 'idle') || G.Scenes.current !== 'outdoor' || P.isLocked()) return false;
    if (!isWater(tx, tz)) return false;
    var r = F.heldRod();
    if (!r) { toast('Hãy cầm cần câu nhé', 'star'); return false; }
    if (!S.canWork()) { E.emit('state:exhausted', {}); return false; }
    if (!S.useEnergy(Items.energyCost(r.id, r.tier) || 2)) return false;
    if (!P.sitting) P.face({ x: tx + 0.5 - P.pos.x, z: tz + 0.5 - P.pos.z });
    castPos.x = P.pos.x; castPos.z = P.pos.z;
    doCast(r, tx, tz);
    return true;
  }
  F.targetPos = function () { return target; };   // stage 37: cast target {x,z} for the remote fishing sync
  F.isFishing = function () { return F.state !== 'off' && F.state !== 'idle'; };

  function doCast(r, tx, tz) {
    rod = r;
    var depth = shoreDist(tx, tz), v = clamp((depth - 1) / 5, 0, 1), zone = F.zoneFor(v), cq = F.castQuality({ tx: tx, tz: tz });
    target = { x: tx + 0.5, y: 0.02, z: tz + 0.5, zone: zone, v: v };
    var b = currentBait(r), hasBait = false;
    if (b && Inv.remove(b, 1)) { hasBait = true; usedBait = b; } else usedBait = null;
    if (F.state === 'off') { F.state = 'idle'; bobT = 0; }
    waitT = waitSeconds(hasBait);
    var li = G.FishLife ? G.FishLife.probe(target.x, target.z) : { hot: -1, near: false, species: [], m: 1, biter: -1, id: null }, po, sd;
    waitT = clamp(li.near ? waitT / li.m : waitT * 1.35, 2, 60);   // Stage 13: shadows within 2.5 tiles shorten the wait (x1.5..2.5); none -> longer, never zero chance
    if (li.hot >= 0) po = { hot: true, prefer: li.species };
    else if (li.near) po = { prefer: li.species };
    else po = { plain: true };
    view.waitTot = waitT;
    plan = F.pickCatch(zone, hasBait ? b : null, waitK, po);
    sd = li.biter >= 0 && li.id ? FD.get(li.id) : null;
    if (sd && sd.lvl <= S.level('fishing')) plan = { kind: 'fish', def: sd };   // the shadow that nibbles is the fish that gets hooked
    plan.k = waitK; plan.cq = cq; plan.shadow = li.biter;
    plan.lose = plan.kind === 'fish' && li.near ? wr('fish.lose') >= Math.min(0.95, 0.5 * li.m) : false;   // fish-catch chance 0.5 x multiplier (1.5..2.5)
    plan.hot = li.hot >= 0; plan.seen = li.hot >= 0 || li.near;
    castT = 0; F.state = 'cast'; F.totals.casts++;
    P.playAction('cast', { duration: CAST_SEC });
    UI.sfx('cast');
    E.emit('fish:cast', { zone: zone, v: v, bait: usedBait, quality: cq });
    hint('wait', 'Kiên nhẫn đợi lâu, cá càng ngon!', 'star');
    if (T.weather === 'rain') hint('rain', 'Mưa khuấy nước nên cá nổi lên kiếm ăn và cắn câu sớm hơn.');
    else if (T.season === 'winter') hint('cold', 'Nước lạnh làm cá chậm lại. Chờ lâu hơn, nhưng có loài lại mê cái lạnh.');
    else if (T.hour >= 20) hint('night', 'Câu đêm nè! Cá trê, lươn và cá bống tượng thức dậy khi trời tối.');
    else if (T.hour < 8.5 || (T.hour >= 18 && T.hour < 20.5)) hint('dawn', 'Bình minh và hoàng hôn là giờ vàng: nhiều loài cá kiếm ăn khi ánh sáng yếu.');
    G.Save.request();
  }

  function hook() {
    if (F.state !== 'bite') return;
    UI.sfx('hook');
    startReel();
  }

  /* ------------------------------------------------------------------ reel minigame (physics in reel_core.js) */
  var RC = G.ReelCore, touchMode = false, sparkT = 0, lastX = 0;
  function startReel() {
    var def = plan.def, isJunk = plan.kind === 'junk', diff = isJunk ? 1 : def.diff;
    F.state = 'reel'; held = btnDown || scrId !== null || held;
    R = RC.make({ tier: RC.tierOf(def, isJunk), diff: diff, beh: isJunk ? 'smooth' : def.beh, bar: rod.info.bar, touch: touchMode || !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) }, Math.random);
    R.def = def; R.junk = isJunk; sparkT = 0;
    lockTime(); showCatcher(true);
    reel.style.display = ''; reel.className = 'tv-reel t-' + R.tier;
    rFish.innerHTML = '<span class="bob">' + Icons.item(def.id ? Items.get(def.id) : def, 40) + '</span>';
    rZone.style.height = (R.bh * 100) + '%';
    for (var q = 0; q < sparks.length; q++) sparks[q].style.visibility = 'hidden';
    trackH = 0; zoneOn = null;
    rHint.textContent = 'Giữ bất kỳ đâu để lên · thả để xuống'; rRel.style.display = isJunk ? '' : 'none';
  }
  function stepReel(dt) {
    var res = RC.step(R, dt, held, Math.random);
    if (res === 'win') endReel(true); else if (res === 'lose') endReel(false);
  }
  var sparks = [], sparkI = 0, sparkFlip = 0, trackH = 0, progH = 0, zoneOn = null;
  function sparkle() {   // pooled: 6 permanent nodes restarted by alternating two identical keyframes (no DOM churn, no reflow)
    var k = sparkI, s = sparks[k] || (sparks[k] = el('i', 'sp', rSpark)); sparkI = (k + 1) % 6;
    sparkFlip ^= 1; s.style.left = (Math.random() * 70 + 15) + '%'; s.style.transform = 'translateY(' + (-R.prog * progH).toFixed(1) + 'px)';
    s.style.animationName = sparkFlip ? 'tv-sp' : 'tv-sp2'; s.style.visibility = 'visible';
  }
  window.addEventListener('resize', function () { trackH = 0; });
  function drawReel(dt) {
    if (!R) return;
    var H = trackH;
    if (!H) { H = trackH = rTrack.clientHeight || 300; progH = rProg.clientHeight || H; }   // measured once per reel (and after a resize), never per frame
    var y = (1 - R.bp - R.bh) * H, fy = (1 - R.fp) * (H - 40);
    rZone.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
    rFish.style.transform = 'translateY(' + fy.toFixed(1) + 'px)';
    rFill.style.transform = 'scaleY(' + clamp(R.prog, 0, 1).toFixed(3) + ')';
    rGlow.style.transform = 'translateY(' + (-clamp(R.prog, 0, 1) * progH).toFixed(1) + 'px)';
    var on = R.inside, cls = 'tv-reel t-' + R.tier + (on ? '' : ' tense') + (R.prog < 0.2 ? ' danger' : '') + (R.prog > 0.8 ? ' near' : '');
    if (reel.className !== cls) reel.className = cls;
    if (on !== zoneOn) { zoneOn = on; rZone.className = 'zone' + (on ? ' on' : ''); }
    if (on && R.prog > R.lastProg && (sparkT -= (dt || 0.016)) <= 0) { sparkT = 0.16; sparkle(); }
  }
  function reelFxBurst(ok) {
    var i, n = ok ? 14 : 8, s;
    reelFx.innerHTML = ''; reelFx.className = 'tv-reelfx ' + (ok ? 'ok' : 'bad'); reelFx.style.display = '';
    for (i = 0; i < n; i++) {
      s = el('i', 'd', reelFx); s.style.setProperty('--a', (i / n * 360 + Math.random() * 20).toFixed(0) + 'deg'); s.style.setProperty('--r', (40 + Math.random() * 50).toFixed(0) + 'px');
    }
    setTimeout(function () { reelFx.style.display = 'none'; reelFx.innerHTML = ''; }, 800);
  }

  function endReel(ok) {
    var r = R, def = plan.def, perfect = r.out < 0.5;
    R = null; showCatcher(false); reel.style.display = 'none'; held = false;
    reelFxBurst(ok);
    unlockTime();
    if (!ok) {
      F.totals.escapes++;
      toast(plan.kind === 'junk' ? 'Nó tuột khỏi lưỡi câu mất rồi.' : 'Cá chạy mất rồi! Thử lại nhé.', 'warn');
      E.emit('fish:escaped', { id: def.id, reason: 'reel' });
      toIdle();
      return;
    }
    if (plan.kind === 'junk') return finishJunk(def);
    finishFish(def, perfect);
  }
  function finishJunk(def) {
    F.totals.junk++;
    if (!Inv.canAdd(def.id, 1, 'normal')) { toast('Túi đồ đầy! Bạn thả ' + def.name + ' đi.', 'bag'); toIdle(); return; }
    Inv.add(def.id, 1, 'normal');
    S.addXp('fishing', 1);
    E.emit('fish:junk', { id: def.id });
    showResult(def, 'normal', null, false, false, 'Đồ bỏ đi');
    
    G.Save.request();
  }
  function finishFish(def, perfect) {
    var lvl = S.level('fishing'), q = F.qualityFor(lvl, perfect, plan && plan.k);
    if (!Inv.canAdd(def.id, 1, q)) { toast('Túi đồ đầy! ' + def.name + ' bơi mất rồi.', 'bag'); toIdle(); return; }
    var size = Math.round((12 + 3.2 * Math.sqrt(def.price)) * rnd(0.75, 1.25) * (0.85 + 0.35 * (plan && plan.k || 0)));
    Inv.add(def.id, 1, q);
    var rec = F.records[def.id], first = !rec, best = false;
    if (!rec) rec = F.records[def.id] = { n: 0, max: 0, q: 0 };
    rec.n++; if (size > rec.max) { rec.max = size; best = !first; }
    rec.q = Math.max(rec.q, Items.QUALITIES.indexOf(q));
    F.totals.catches++; if (perfect) F.totals.perfect++;
    S.addXp('fishing', xpFor(def, perfect));
    buzz(20);
    E.emit('fish:caught', { id: def.id, n: 1, q: q, first: first, size: size, perfect: perfect, by: G.Net.playerId });
    var it = Items.get(def.id);
    
    showResult(def, q, size, first, best, perfect ? 'Hoàn hảo!' : '');
    G.Save.request();
  }

  function showResult(def, q, size, first, best, tag) {
    F.state = 'result'; resT = 1.8; target = null;
    var it = Items.get(def.id) || def;
    resCard.innerHTML = '<div class="ic">' + Icons.item(it, 64, 0, q) + '</div><div class="nm">' + it.name + '</div>' +
      '<div class="sub">' + (size ? size + ' cm' : '') + (q !== 'normal' ? ' ' + (q === 'gold' ? 'vàng' : 'bạc') : '') + '</div>' +
      (first ? '<div class="tag">Mới!</div>' : best ? '<div class="tag">Kỷ lục kích cỡ!</div>' : tag ? '<div class="tag">' + tag + '</div>' : '');
    resCard.style.display = '';
    resCard.classList.remove('pop'); void resCard.offsetWidth; resCard.classList.add('pop');
  }

  /* ------------------------------------------------------------------ simulation */
  G.Loop.onUpdate(function (dt) {
    var st = F.state;
    if (st === 'off') return;
    if ((st === 'cast' || st === 'wait' || st === 'bite') && !P.sitting) {   // walking away (stick / hold) pulls the line in
      var mx = P.pos.x - castPos.x, mz = P.pos.z - castPos.z;
      if (mx * mx + mz * mz > 0.16) { F.reelIn(); return; }
    }
    if (st === 'cast') {
      castT += dt;
      if (castT >= CAST_SEC) { F.state = 'wait'; landT = 0; UI.sfx('plop'); }
    } else if (st === 'wait') {
      waitT -= dt; landT += dt;
      if (waitT <= 0 && plan.lose) {
        E.emit('fish:lost', { id: plan.def.id });
        toIdle();
      } else if (waitT <= 0) {
        if (plan.kind === 'fish' && G.FishOdds.rollJunk(plan.cq, wr('fish.junk'))) plan = { kind: 'junk', def: pickJunk(), k: plan.k, cq: plan.cq, hot: plan.hot, seen: plan.seen, lose: false };   // the single junk roll
        F.state = 'bite'; biteT = 0; biteWin = BITE_BASE + rod.info.win;
        buzz([40, 30, 60]); UI.sfx('bite');
        E.emit('fish:bite', { id: plan.def.id });
      }
    } else if (st === 'bite') {
      biteT += dt;
      if (biteT >= biteWin) {
        F.totals.escapes++;
        toast('Chậm quá, cá chạy mất rồi!', 'warn');
        E.emit('fish:escaped', { id: plan.def.id, reason: 'slow' });
        toIdle();
      }
    } else if (st === 'reel') {
      stepReel(dt);
    } else if (st === 'result') {
      resT -= dt;
      if (resT <= 0) { resCard.style.display = 'none'; toIdle(); }
    }
  }, 5);

  /* ------------------------------------------------------------------ save */
  F.stats = function () { return { records: F.records, totals: F.totals }; };
  G.Save.register('fishing', {
    save: function () { return { records: F.records, totals: F.totals, flags: F.flags, bait: F.baitId }; },
    load: function (o) {
      o = o || {};
      F.cancel();
      F.records = o.records || {}; F.flags = o.flags || { h: {} }; if (!F.flags.h) F.flags.h = {};
      F.totals = o.totals || { casts: 0, catches: 0, junk: 0, escapes: 0, perfect: 0 };
      F.baitId = o.bait && Items.get(o.bait) ? o.bait : null;
    },
    reset: function () {
      F.cancel();
      F.records = {}; F.flags = { h: {} }; F.totals = { casts: 0, catches: 0, junk: 0, escapes: 0, perfect: 0 }; F.baitId = null;
    }
  }, 'player');
})();
