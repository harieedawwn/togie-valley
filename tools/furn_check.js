/* Stage 17 FURN: node tools/furn_check.js - seat/lamp data, bed hide/restore (all house tiers), lamp schedule + dim curve, glow cap/draw budget, wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('furn: FAIL ' + m); } else n++; }
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
global.window = {};
window.Game = { Events: { emit: function () {}, on: function () {} }, Save: { register: function () {}, request: function () {} }, State: {} };
var HM = require(path.join(root, 'js/house_map.js')); require(path.join(root, 'js/furniture.js'));
var F = window.Game.Furniture, L = require(path.join(root, 'js/furn_live.js')), t, ids = [];
['chair_wood', 'chair_cushion', 'stool', 'armchair', 'sofa'].forEach(function (id) { var it = F.get(id); need(it && it.seat && it.seat.h > 0.3 && it.seat.n >= 1, id + ' has seat data'); });
['bed_single', 'bed_double'].forEach(function (id) { need(F.get(id).bed === true && !F.get(id).seat, id + ' is a bed'); });
['lamp_floor', 'lamp_table'].forEach(function (id) { var it = F.get(id); need(it.lamp && it.lamp.y > 0 && it.lamp.r > 0.5, id + ' has lamp data'); });
need(!F.get('rug_round').lamp && !F.get('table_round').seat, 'rugs/tables are inert');
for (t = 0; t <= 3; t++) {
  HM.setTier(t); var rows0 = HM.rows.join('|'), floor0 = HM.floorTiles().length;
  need(!HM.isWalkable(0, 0) && !HM.isWalkable(0, 1), 'default bed solid (tier ' + t + ')');
  HM.setBedHidden(true);
  need(HM.isWalkable(0, 0) && HM.isWalkable(0, 1), 'bed tiles walkable when hidden (tier ' + t + ')');
  need(HM.floorTiles().length === floor0, 'hidden bed tiles are not placeable (tier ' + t + ')');
  HM.setTier(t);
  need(HM.isWalkable(0, 0), 'hidden flag survives setTier ' + t);
  HM.setBedHidden(false);
  need(HM.rows.join('|') === rows0 && !HM.isWalkable(0, 0), 'bed restored exactly (tier ' + t + ')');
}
[0, 1, 2, 3].forEach(function (r) { need(L.facingOf(r) === ['s', 'e', 'n', 'w'][r], 'facing r' + r); });
need(L.facingOf(5) === 'e', 'facing wraps');
need(L.autoOn(17.9) === false && L.autoOn(18) && L.autoOn(25) && !L.autoOn(6) && !L.autoOn(12), 'lamp schedule: on at 18:00, off in the morning');
need(L.darkness(12) === 0 && L.darkness(5.5) === 1 && L.darkness(8) === 0 && L.darkness(26) === 1 && L.darkness(20) === 1, 'dim curve endpoints');
var prev = L.darkness(16), mono = true, h, d, maxStep = 0;
for (h = 16; h <= 20; h += 0.05) { d = L.darkness(h); if (d < prev - 1e-9) mono = false; maxStep = Math.max(maxStep, d - prev); prev = d; }
need(mono && maxStep < 0.06, 'dusk dim is smooth (max step per 3 min ' + maxStep.toFixed(3) + ')');
var lamps = []; for (h = 0; h < 10; h++) lamps.push({ x: h, z: 0, lv: h === 3 ? 0 : 1 });
var pk = L.pickLit(lamps, 0, 0, 6);
need(pk.length === 6 && pk[0].x === 0 && pk.every(function (l) { return l.lv > 0; }), 'pickLit caps at 6, nearest first, skips dark lamps');
var src = rd('js/furn_live.js'), cnt = (src.match(/new THREE\.(Points|Mesh)\(/g) || []).length;
need(cnt === 2, 'glow = 2 draw calls (Points + merged pool), found ' + cnt);
need(!/PointLight|SpotLight|castShadow|shadowMap/.test(src), 'no dynamic lights / shadows');
need(/low \? 0 : n \* 6/.test(src) && /l >= 2/.test(src), 'low tier: capped to 2, no floor pool');
need(/furn_live\.js/.test(rd('index.html')) && /setBedHidden/.test(rd('js/house.js')) && /Pl\.store/.test(rd('js/placement.js')) && /furnlive/.test(src), 'wiring');
need(/!House\.bedHidden/.test(rd('js/house.js')) && /k === 'bed' && House\.bedHidden/.test(rd('js/house.js')), 'house hides bed mesh + moves interaction');
console.log('furn: ' + n + ' checks ok, ' + errs + ' failed'); process.exit(errs ? 1 : 0);
