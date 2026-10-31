/* Togie Valley - input.js (Stage 1)
 * Game.Input: pointer + keyboard -> bus events. Touch and mouse are equal. Depends on core.js.
 * Events: input:tap {x,y,count} (count = streak of taps each within Config.input.rhythmMs of the previous; 1 = single) | input:holdstart/holdmove/holdend {x,y} | input:zoom {factor} (>1 = zoom out)
 *         input:rotate {delta} (rad, twist) | input:rotateStep {dir} | input:action {source}
 *         input:cam {phase:'start'|'move'|'end', x, y, dx, dy, src:'drag'|'hold'} one-finger camera gesture (px deltas since last event):
 *           joystick play (Input.joy = 'float'|'fixed'): one-finger drag on the right half (> camDragPx, or > camDragMs and > 5px);
 *           tap-to-move play (Input.joy = 'off'): finger still (< camHoldSlop) for camHoldMs -> camera mode until release.
 * Coordinates are client CSS px. Hold = finger/mouse down longer than Config.input.holdMs without a second finger.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Config) { console.error('[input] missing deps'); return; }
  var E = G.Events;
  var cfg = G.Config.input = G.Config.input || { holdMs: 180, tapSlop: 14, wheelZoom: 0.0012, rhythmMs: 350 };
  if (cfg.camHoldMs === undefined) { cfg.camHoldMs = 350; cfg.camHoldSlop = 8; cfg.camDragPx = 10; cfg.camDragMs = 200; cfg.joyZone = 0.5; }

  var Input = { holding: false, x: 0, y: 0, canvas: null, suspend: false, noHold: false, joy: 'off', camMode: false };   // suspend: taps/holds are swallowed (fishing owns the pointer); pinch/twist still work
  var ptrs = {}, count = 0, one = null, multi = false, holdTimer = 0, last2 = null, camTimer = 0, cam = null;   // cam: { id, lx, ly } while a one-finger camera gesture runs
  var keys = {};
var tapStreak = 0, tapLast = -1e9;   // tap rhythm: taps each within cfg.rhythmMs of the previous one form a streak

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function pair() {
    var ids = Object.keys(ptrs);
    return ids.length >= 2 ? [ptrs[ids[0]], ptrs[ids[1]]] : null;
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function viewW() { return window.innerWidth || 0; }
  function stopCamTimer() { if (camTimer) { clearTimeout(camTimer); camTimer = 0; } }
  function camEnd() {
    stopCamTimer();
    if (!cam) return;
    var c = cam; cam = null; Input.camMode = false;
    E.emit('input:cam', { phase: 'end', x: c.lx, y: c.ly, dx: 0, dy: 0, src: c.src });
  }
  function camBegin(src, x, y) {
    cam = { src: src, lx: x, ly: y }; Input.camMode = true;
    E.emit('input:cam', { phase: 'start', x: x, y: y, dx: 0, dy: 0, src: src });
  }
  function emitTap(x, y) {
    var t = now();
    tapStreak = (t - tapLast <= (cfg.rhythmMs || 350)) ? tapStreak + 1 : 1; tapLast = t;
    E.emit('input:tap', { x: x, y: y, count: tapStreak });
  }
  function endHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    if (Input.holding) { Input.holding = false; E.emit('input:holdend', { x: Input.x, y: Input.y }); }
  }

  var rdrag = null;   // mouse right-button drag = camera rotate
  Input.takes = null; // set by Game.Joystick: fn(e) -> true when the pointer belongs to the floating stick (Input then ignores it entirely)
  function down(e) {
    if (e.pointerType === 'mouse' && e.button === 2) { rdrag = { id: e.pointerId, lx: e.clientX, ly: e.clientY }; try { Input.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } E.emit('input:cam', { phase: 'start', x: e.clientX, y: e.clientY, dx: 0, dy: 0, src: 'mouse' }); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (Input.takes && Input.takes(e)) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    count++;
    try { Input.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (count === 1) {
      multi = false;
      one = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, t0: now(), camOk: Input.joy !== 'off' && e.clientX >= viewW() * cfg.joyZone, wasCam: false };
      Input.x = e.clientX; Input.y = e.clientY;
      if (Input.joy === 'off' && !Input.suspend && e.pointerType !== 'mouse') {   // tap-to-move play: a still finger long enough becomes camera mode
        camTimer = setTimeout(function () {
          camTimer = 0;
          if (count !== 1 || multi || !one || Input.suspend || one.moved) return;
          endHold(); one.wasCam = true; camBegin('hold', Input.x, Input.y);
        }, cfg.camHoldMs);
      }
      holdTimer = setTimeout(function () {
        holdTimer = 0;
        if (count === 1 && !multi && !Input.suspend && !Input.noHold) { Input.holding = true; E.emit('input:holdstart', { x: Input.x, y: Input.y }); }
      }, cfg.holdMs);
    } else if (count === 2) {
      multi = true; one = null;
      endHold(); camEnd();
      var p = pair();
      last2 = { d: dist(p[0], p[1]), a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) };
    }
  }

  function move(e) {
    if (rdrag && rdrag.id === e.pointerId) { E.emit('input:cam', { phase: 'move', x: e.clientX, y: e.clientY, dx: e.clientX - rdrag.lx, dy: e.clientY - rdrag.ly, src: 'mouse' }); rdrag.lx = e.clientX; rdrag.ly = e.clientY; return; }
    var p = ptrs[e.pointerId];
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (count === 1 && one && one.id === e.pointerId) {
      Input.x = e.clientX; Input.y = e.clientY;
      var adx = p.x - one.x0, ady = p.y - one.y0, ad = Math.sqrt(adx * adx + ady * ady);
      if (camTimer && ad > cfg.camHoldSlop) stopCamTimer();   // finger moved: not a camera long-press
      if (!one.moved && Math.abs(adx) + Math.abs(ady) > cfg.tapSlop) one.moved = true;
      if (cam) {
        E.emit('input:cam', { phase: 'move', x: p.x, y: p.y, dx: p.x - cam.lx, dy: p.y - cam.ly, src: cam.src });
        cam.lx = p.x; cam.ly = p.y;
      } else if (one.camOk && !Input.suspend && (ad > cfg.camDragPx || (ad > 5 && now() - one.t0 > cfg.camDragMs))) {
        endHold(); one.wasCam = true; one.moved = true;
        camBegin('drag', one.x0, one.y0);
        E.emit('input:cam', { phase: 'move', x: p.x, y: p.y, dx: p.x - cam.lx, dy: p.y - cam.ly, src: 'drag' });
        cam.lx = p.x; cam.ly = p.y;
      } else if (Input.holding) E.emit('input:holdmove', { x: Input.x, y: Input.y });
    } else if (count === 2 && last2) {
      var q = pair(), d = dist(q[0], q[1]), a = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x);
      if (d > 8 && last2.d > 8) E.emit('input:zoom', { factor: last2.d / d });
      var da = G.util.wrapAngle(a - last2.a);
      if (da) E.emit('input:rotate', { delta: da });
      last2.d = d; last2.a = a;
    }
  }

  function up(e) {
    if (rdrag && rdrag.id === e.pointerId) { E.emit('input:cam', { phase: 'end', x: e.clientX, y: e.clientY, dx: 0, dy: 0, src: 'mouse' }); rdrag = null; try { Input.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } return; }
    var p = ptrs[e.pointerId];
    if (!p) return;
    delete ptrs[e.pointerId];
    count = Math.max(0, count - 1);
    try { Input.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (one && one.id === e.pointerId) {
      var wasHold = Input.holding, moved = one.moved, wasCam = one.wasCam;
      var x = p.x, y = p.y;
      one = null;
      endHold(); camEnd();
      if (!wasHold && !wasCam && !moved && !multi && !Input.suspend && e.type === 'pointerup') emitTap(x, y);
    }
    if (count < 2) last2 = null;
    if (count === 0) multi = false;
  }

  function wheel(e) {
    e.preventDefault();
    E.emit('input:zoom', { factor: Math.exp(e.deltaY * cfg.wheelZoom) });
  }

  function typing() {
    var a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  function keyName(e) {
    var k = e.key;
    if (!k) return '';
    return k.length === 1 ? k.toLowerCase() : k;
  }
  function keydown(e) {
    if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = keyName(e);
    if ('wasdWASD'.indexOf(k) >= 0 && k.length === 1 || k.indexOf('Arrow') === 0) { keys[k] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (k === 'q') E.emit('input:rotateStep', { dir: cfg.invH ? 1 : -1 });
    else if (k === 'r') E.emit('input:rotateStep', { dir: cfg.invH ? -1 : 1 });   // R2 s6: E now interacts
    else if (k === ' ' || k === 'Enter' || k === 'e') { e.preventDefault(); E.emit('input:action', { source: 'key' }); }
  }
  function keyup(e) { delete keys[keyName(e)]; }

  /** Keyboard move axis in screen terms: x = right(+), y = up(+); each -1..1 (not normalized). */
  Input.axis = function (out) {
    out = out || { x: 0, y: 0 };
    out.x = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
    out.y = (keys.w || keys.ArrowUp ? 1 : 0) - (keys.s || keys.ArrowDown ? 1 : 0);
    return out;
  };

  /** Number of pointers the tap/hold/twist logic is tracking right now. */
  Input.pointerCount = function () { return count; };
  /** Hand a pointer over to another owner (Game.Joystick): it stops producing tap/hold/twist and its capture is released. */
  Input.claim = function (id) {
    if (!ptrs[id]) return;
    delete ptrs[id];
    count = Math.max(0, count - 1);
    try { Input.canvas.releasePointerCapture(id); } catch (err) { /* ignore */ }
    if (one && one.id === id) one = null;
    endHold(); camEnd();
    if (count < 2) last2 = null;
    if (count === 0) multi = false;
  };

  /** Drop any hold in progress (used when the player gets locked). */
  Input.cancel = function () { endHold(); camEnd(); };
  /** Joystick play scheme: 'off' (tap-to-move) | 'float' | 'fixed'. Sets the camera gesture rules above. */
  Input.setJoy = function (m) { Input.joy = (m === 'float' || m === 'fixed') ? m : 'off'; Input.noHold = Input.joy !== 'off'; if (cam || camTimer) camEnd(); };
  /** Emit a normal tap (with rhythm streak) on behalf of Game.Joystick when its stick finger was a short tap. */
  Input.emitTap = function (x, y) { if (!Input.suspend) emitTap(x, y); };

  Input.init = function (canvas) {
    Input.canvas = canvas;
    try { canvas.style.touchAction = 'none'; } catch (err) { /* ignore */ }
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false }); });   // iOS Safari pinch-zoom
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', function () { keys = {}; endHold(); camEnd(); });
  };

  G.Input = Input;
})();
