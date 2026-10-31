/* Togie Valley - Game.IconBadges (Round 4 stage 10): rarity star on fish icons. Wraps Icons.item(idOrDef, px, tier, q).
 * q (stack quality 'normal'|'silver'|'gold') wins when given; without it the species tier (def.tier) is used (notebook, reel, shop models).
 * Normal quality = no badge. Star is inline SVG in the bottom-right corner, >= 10px on screen, dark outline, soft gradient. */
(function () {
  'use strict';
  var G = window.Game = window.Game || {}, Icons = G.Icons;
  if (!Icons || !Icons.item || !G.Items) { console.error('icon_badges: Icons/Items missing'); return; }
  if (G.IconBadges) return;
  var STAR = 'M0 -1L0.29 -0.4L0.95 -0.31L0.47 0.15L0.59 0.81L0 0.5L-0.59 0.81L-0.47 0.15L-0.95 -0.31L-0.29 -0.4Z';
  var COL = { silver: ['#ffffff', '#d3d9e0', '#98a2ae'], gold: ['#fff3a0', '#ffcf3a', '#e0952a'] };
  var base = Icons.item, cache = {}, uid = 0, B = G.IconBadges = {};
  B.quality = function (d, q) { var v = q !== undefined && q !== null ? q : d && d.tier; return v === 'silver' || v === 'gold' ? v : null; };
  /* Star markup for a viewBox (x,y,w,h) shown at px pixels; r grows on small icons so the star stays >= 10px. */
  B.star = function (quality, x, y, w, h, px) {
    var c = COL[quality], r = Math.min(Math.max(w * 0.2, 5.4 * w / (px || 36)), w * 0.36), cx = x + w - r * 1.12, cy = y + h - r * 1.12, id = 'tvq@@';
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="0.55" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></linearGradient></defs>' +
      '<path class="tv-star ' + quality + '" d="' + STAR + '" transform="translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ') scale(' + r.toFixed(2) + ')" fill="url(#' + id + ')" stroke="#2b1d12" stroke-width="' + (0.2).toFixed(2) + '" stroke-linejoin="round"/>';
  };
  Icons.item = function (idOrDef, px, tier, q) {
    var out = base.apply(Icons, arguments);
    if (typeof out !== 'string') return out;
    var d = typeof idOrDef === 'string' ? G.Items.get(idOrDef) : idOrDef, quality = d && d.cat === 'fish' ? B.quality(d, q) : null;
    if (!quality) return out;
    var key = (d.id || '') + '|' + px + '|' + quality, hit = cache[key];
    if (!hit) {
      var m = /viewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(out), i = out.lastIndexOf('</svg>');
      if (!m || i < 0) return out;
      hit = cache[key] = out.slice(0, i) + B.star(quality, +m[1], +m[2], +m[3], +m[4], px) + out.slice(i);
    }
    return hit.replace(/@@/g, String(++uid));   // unique gradient ids per instance (display:none svgs can't resolve shared ones)
  };
})();
