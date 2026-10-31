/* Togie Valley - native.js (Stage 14C): Capacitor/Android helpers. Game.Native.back() is called by MainActivity (android_patch.js)
 * through evaluateJavascript when the Android back button is pressed: closes the top panel, else opens the in-game menu. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Events) { console.error('[native] missing deps'); return; }
  var N = G.Native = { isNative: !!window.Capacitor };
  N.back = function () {
    if (G.UI.closePanel()) return 'panel';
    G.Events.emit('ui:menu', {});   // panels.js opens the menu only when no panel/title is showing
    return 'menu';
  };
  if (N.isNative) {
    document.documentElement.className += ' tv-native';
    /* Native defaults: Auto quality one tier lower, render scale capped at about 1.25 (the shell loads the game from GitHub Pages; Game.Updater handles updates). */
    try {
      var Cfg = G.Config, Q = G.Quality;
      if (Cfg && Cfg.scaler && Cfg.scaler.maxScale > 1.25) { Cfg.scaler.maxScale = 1.25; if (G.Display && G.Display.setScale) G.Display.setScale(1.25, 'native'); }
      if (Q && Q.mode() === 'auto' && !localStorage.getItem('togie-valley/native-tier')) {
        localStorage.setItem('togie-valley/native-tier', '1');
        Q.set(Math.min(3, Q.level() + 1));
      }
    } catch (e) { console.error('[native] defaults failed', e); }
    /* Background: Loop already pauses on visibilitychange (core.js); also hook Capacitor App state if the plugin exists, and resume audio on return. */
    var bg = function (active) {
      if (!G.Loop) return;
      if (active) G.Loop.resume('native'); else G.Loop.pause('native');
    };
    try {
      var A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (A && A.addListener) A.addListener('appStateChange', function (st) { bg(!!(st && st.isActive)); });
    } catch (e) { /* ignore */ }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && G.Audio && G.Audio.unlock) setTimeout(function () { try { G.Audio.unlock(); } catch (e) { /* ignore */ } }, 50);
    });
  }
})();
