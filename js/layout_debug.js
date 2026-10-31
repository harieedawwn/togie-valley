/* Togie Valley - layout_debug.js (Round 3 stage 8): hidden overlay, only with ?debuglayout=1. Outlines HUD regions (css/compact.css) and prints
 * viewport size, size class, scale, safe insets and any overlapping HUD regions. Event-driven (resize / ui:scaled), no per-frame work. Depends on ui_scale.js, ui_layout.js. */
(function () {
  'use strict';
  if (!/[?&]debuglayout=1(&|$)/.test(location.search)) return;
  var G = window.Game, US = G && G.UiScale, E = G && G.Events;
  if (!G || !US || !E || !document.getElementById('tv-bot')) { console.error('[layout_debug] missing deps'); return; }
  document.body.classList.add('tv-dbg');
  var box = document.createElement('div'); box.id = 'tv-dbg'; document.body.appendChild(box);
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  var IDS = ['tv-hl', 'tv-clock', 'tv-hr', 'tv-joyspace', 'tv-hotbar', 'tv-action'], t = 0;
  function visible(r) { return r.width > 0 && r.height > 0; }
  function paint() {
    var vv = window.visualViewport, w = Math.round((vv && vv.width) || innerWidth), h = Math.round((vv && vv.height) || innerHeight), cs = getComputedStyle(probe);
    var rects = [], bad = [], i, j, a, b;
    for (i = 0; i < IDS.length; i++) { var n = document.getElementById(IDS[i]); rects.push(n ? n.getBoundingClientRect() : null); }
    for (i = 0; i < IDS.length; i++) for (j = i + 1; j < IDS.length; j++) {
      a = rects[i]; b = rects[j];
      if (a && b && visible(a) && visible(b) && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(IDS[i].slice(3) + '/' + IDS[j].slice(3));
    }
    box.textContent = w + 'x' + h + ' ' + (w >= h ? 'land' : 'port') + ' ' + US.sizeClass() + ' x' + US.scale().toFixed(2) + ' dpr' + (window.devicePixelRatio || 1) +
      '\nsafe t' + parseInt(cs.paddingTop, 10) + ' r' + parseInt(cs.paddingRight, 10) + ' b' + parseInt(cs.paddingBottom, 10) + ' l' + parseInt(cs.paddingLeft, 10) +
      (bad.length ? '\nOVERLAP ' + bad.join(' ') : '\nno overlap');
  }
  function later() { clearTimeout(t); t = setTimeout(paint, 120); }
  E.on('ui:scaled', later); window.addEventListener('resize', later); window.addEventListener('orientationchange', later);
  paint();
})();
