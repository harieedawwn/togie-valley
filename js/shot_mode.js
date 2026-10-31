/* Togie Valley - shot_mode.js (Round 5 S1): ?shot=1 test mode for tools/shot.js. Loads right after version.js.
 * Without ?shot=1 this file only sets Game.Shot = { on: false } and does nothing else.
 * With it: Math.random is seeded (fixed world/critter layout), the title, character creator and tutorial are skipped,
 * a fresh in-memory game starts (Save key cleared, so nothing is ever written to localStorage), dev mode is on for
 * this page only (not stored), clock frozen at 10:00, clear weather, toasts muted. Game.Shot.ready = true when done. */
(function () {
  'use strict';
  var G = window.Game = window.Game || {};
  var on = false;
  try { on = /[?&]shot=1\b/.test(location.search); } catch (e) { /* ignore */ }
  var Shot = G.Shot = { on: on, ready: false, SEED: 20250101 };
  if (!on) return;

  var s = Shot.SEED >>> 0;   // mulberry32: same layout every run
  Math.random = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  document.documentElement.classList.add('tv-shot');

  function setup() {
    var E = G.Events;
    E.once('game:ready', function () {
      try {
        if (G.UI) G.UI.toast = function () {};
        G.Save.useKey(null);          // no save key: Save.now() can never write
        G.Save.newGame(true);         // fresh game in memory
        G.Time.seed = Shot.SEED;
        G.Time.tomorrow = 'sun';
        if (G.Tutorial) G.Tutorial.skip();
        if (G.Dev) { G.Dev.set(true, true); G.Dev.setHour(10); G.Dev.freezeTime(true); }
        else G.Time.setHour(10);
        G.Time.weather = 'sun';
        E.emit('weather:changed', { weather: 'sun' });
        document.body.classList.add('tv-playing');
        if (G.BootScene) G.BootScene.release();
        if (window.tvSplashHide) window.tvSplashHide();
        Shot.ready = true;
      } catch (err) { console.error('[shot] setup failed', err); Shot.error = String(err && err.message || err); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
