/* Togie Valley - icons_set.js (Stage 22): consistent 24px-grid line icons (2.5 rounded ink stroke, warm duotone fills) for the menu/HUD.
 * Registers through Game.Icons.add(name, innerSvg); Icons.ui(name, px) wraps them. Must load right after icons.js (panels.js builds tab icons at load). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Icons || !G.Icons.add) { console.error('[icons_set] missing deps'); return; }
  var A = G.Icons.add, CR = '#fff1d0', OR = '#ffa94d', YE = '#ffd23f', GR = '#8bd36b', PK = '#ff9a8a', BL = '#8fc7ff', VI = '#b88ae0', ST = '#aebfd1', INK = '#5b3a29';
  function p(d, f, extra) { return '<path d="' + d + '"' + (f ? ' fill="' + f + '"' : '') + (extra || '') + '/>'; }
  function c(x, y, r, f, extra) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + (f ? ' fill="' + f + '"' : '') + (extra || '') + '/>'; }

  A('friends', c(16.5, 7.5, 2.7, BL) + p('M15.5 12.8a4.3 4.3 0 0 1 5.5 4.2v2.5h-4', BL) + c(9, 8.5, 3.2, YE) + p('M3 20v-1.5a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5V20z', OR));
  A('medal', p('M7 2.5h4l2 5.5-3.5 1.5z', PK) + p('M17 2.5h-4l-2 5.5 3.5 1.5z', BL) + c(12, 15, 6, YE) + p('M12 12l1 2 2.2.3-1.6 1.5.4 2.2L12 17.2 10 18.3l.4-2.2-1.6-1.5L11 14z', OR, ' stroke-width="1.4"'));
  A('sofa', p('M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3', PK) + p('M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v6H3z', OR) + p('M6 18v2M18 18v2'));
  A('shirt', p('M8 3 3 6l2.5 4L8 9v11h8V9l2.5 1L21 6l-5-3a4 4 0 0 1-8 0z', BL) + p('M8 3 3 6l2.5 4L8 9z', YE) + p('M16 3l5 3-2.5 4L16 9z', YE));
  A('target', c(12, 12, 9, CR) + c(12, 12, 5.2, PK) + c(12, 12, 1.6, YE) + p('M12 12l7.5-7.5M16 4.5h3.5V8'));
  A('book', p('M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z', VI) + p('M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3', CR) + p('M8 7.5h7'));
  A('help', p('M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-5 4v-4H6a2 2 0 0 1-2-2z', YE) + p('M9.6 8.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.8-1.1 1.5') + p('M12 14.6h.01'));
  A('wrench', p('M14.5 3.5a4.6 4.6 0 0 0-4.3 6.2L3.9 16a2.1 2.1 0 0 0 3 3l6.3-6.3a4.6 4.6 0 0 0 6.2-4.3l-3 2.8-2.6-.7-.7-2.6z', ST));
  A('exit', p('M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4', PK) + p('M14 8l4 4-4 4M18 12H9'));
  A('cook', p('M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z', OR) + p('M3 10h18') + p('M9 3.5c-1 1.5 1 2.5 0 4M14 3.5c-1 1.5 1 2.5 0 4'));
  A('ripple', c(12, 12, 2.4, YE, ' stroke-width="2"') + c(12, 12, 6.2, '', ' stroke-width="2" opacity=".8"') + c(12, 12, 10, '', ' stroke-width="2" opacity=".5"'));
})();
