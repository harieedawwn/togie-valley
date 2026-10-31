/* Togie Valley - touch_cam.js (Round 3 stage 9)
 * One-finger camera gesture consumer: listens to Game.Input `input:cam {phase,x,y,dx,dy,src}` (see input.js), rotates through Game.Camera.rotateBy,
 * shows the soft camera ring (src 'hold' = long press in tap-to-move play) and vibrates once on entering camera mode.
 * Camera sensitivity (`csens`, 0.5-2, device-level, in the Game.Joystick controls store). Vertical drag tilts the camera pitch a little (Camera.tiltBy, clamped).
 * Ring = ONE DOM element moved by transform translate3d (no layout per move). Depends on core.js, input.js, player.js (Camera), joystick.js (store). Loads after camera_auto.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Input || !G.Camera || !G.Joystick) { console.error('[touch_cam] missing deps'); return; }
  var E = G.Events, J = G.Joystick;
  var RING = 84, RAD_PER_PX = 0.0055, TILT_PER_PX = 0.0025;
  var TC = G.TouchCam = {};
  var sens = (function () { var v = +J.store('csens'); return v >= 0.5 && v <= 2 ? v : 1; })();
  TC.sensitivity = function () { return sens; };
  /* drag direction: world follows the finger by default; invH / invV (device-level, 0|1) flip each axis. Mouse drag + Q/R keys follow the same toggles. */
  var ci = G.Config.input = G.Config.input || {};
  ci.invH = +J.store('invH') === 1; ci.invV = +J.store('invV') === 1;
  TC.invert = function (axis) { return axis === 'v' ? !!ci.invV : !!ci.invH; };
  TC.setInvert = function (axis, on) {
    var k = axis === 'v' ? 'invV' : 'invH'; ci[k] = !!on; J.store(k, on ? 1 : 0);
    E.emit('controls:changed', { key: k, value: !!on });
  };
  TC.setSensitivity = function (v) {
    sens = Math.min(2, Math.max(0.5, +v || 1)); J.store('csens', sens);
    E.emit('controls:changed', { key: 'csens', value: sens });
  };

  var ring = null, shown = false;
  function mkRing() {
    ring = document.createElement('div');
    ring.id = 'tv-camring'; ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = 'position:fixed;left:0;top:0;width:' + RING + 'px;height:' + RING + 'px;pointer-events:none;will-change:transform;transform:translate3d(-200px,-200px,0)';
    document.body.appendChild(ring);
  }
  function place(x, y) { ring.style.transform = 'translate3d(' + (x - RING / 2) + 'px,' + (y - RING / 2) + 'px,0)'; }
  function show(on) {
    if (!ring) { if (!on) return; mkRing(); }
    if (on === shown) return;
    shown = on; ring.className = on ? 'show' : '';
  }

  E.on('input:cam', function (e) {
    if (e.phase === 'start') {
      if (e.src === 'hold') {
        if (!ring) mkRing();
        place(e.x, e.y); show(true);
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { /* ignore */ }
      }
    } else if (e.phase === 'move') {
      if (shown) place(e.x, e.y);
      if (e.dx) G.Camera.rotateBy((ci.invH ? 1 : -1) * e.dx * RAD_PER_PX * sens);   // default: world follows the touch point (drag right = camera turns left)
      if (e.dy && G.Camera.tiltBy) G.Camera.tiltBy((ci.invV ? -1 : 1) * e.dy * TILT_PER_PX * sens);   // default: drag down = camera rises (steeper)
    } else show(false);
  });
  window.addEventListener('blur', function () { show(false); });
})();
