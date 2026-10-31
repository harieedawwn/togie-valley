/* Togie Valley - core.js
 * Game namespace, Config, util, event bus, display (resize/DPR/dynamic resolution), fixed-timestep loop.
 * Depends on: nothing. Must load first.
 */
(function () {
  'use strict';

  var Game = window.Game = window.Game || {};
  Game.VERSION = '0.1.0';

  /* ------------------------------------------------------------------ Config */
  var Config = Game.Config = {
    tile: 1, // world units per grid tile (x/z plane, y up)

    loop: { fixedStep: 1 / 60, maxFrameDelta: 0.25, maxSubSteps: 5 },

    display: { maxDpr: 2, minPixelRatio: 0.6 },

    // Dynamic resolution scaler (multiplies the pixel ratio).
    scaler: {
      enabled: true,
      targetFps: 60,
      lowRatio: 0.82,   // fps < target * lowRatio  -> scale down
      highRatio: 0.95,  // fps >= target * highRatio for upAfterWindows -> scale up
      interval: 1.0,    // seconds per measurement window
      warmupWindows: 2,
      minScale: 0.6,
      maxScale: 1.0,
      stepDown: 0.1,    // Stage 35: small steps between minScale and the tier cap (scale x pixel ratio)
      stepUp: 0.05,
      lowMs: 18, lowSec: 1,       // moving-average frame time above lowMs for lowSec -> step down
      highMs: 12, highSec: 4,     // below highMs for highSec -> step up (60 Hz displays: cap interval, see Display.sample)
      upAfterWindows: 15,   // 15 s of comfortable frame time before stepping up
      holdAfterDownWindows: 6,
      minGapMs: 900,        // never two changes within 0.9 s
      maxChanges: 100000    // resize redraws synchronously (render.js), so no per-session cap is needed
    },

    render: {
      antialias: true,
      bands: [0.12, 0.52],        // n.l thresholds: shade | mid | lit
      halftoneCell: 4.5,          // CSS px per halftone cell (multiplied by pixel ratio)
      halftoneStrength: 0.9,      // 0..1 darkness of dots in shade band
      outlineWidth: 1.8,          // CSS px, static
      grain: 0.012,               // paper grain alpha (max 0.015, static CSS layer; Settings 'Hạt giấy' can turn it off)
      vignette: 0.38,
      fogNear: 22,
      fogFar: 70,
      inkColor: 0x3a2618,
      shadowColor: 0x1c1633,
      shadowOpacity: 0.32,
      vignetteColor: 0x1a1226
    },

    camera: {
      near: 0.5,
      far: 150,
      followLambda: 6,
      yawLambda: 7,
      presetLambda: 4,
      zoomLambda: 8,
      portraitBoost: 0.55,        // distance *= (1/aspect)^boost when aspect < 1
      zoomMin: 0.6,
      zoomMax: 1.6,
      presets: {                  // pitch in degrees
        outdoor: { distance: 15, pitch: 38, fov: 34, lookHeight: 0.6 },   // stage 43: was pitch 52 (-27%), distance 14
        indoor: { distance: 8.5, pitch: 58, fov: 36, lookHeight: 0.6 }
      }
    }
  };

  /* -------------------------------------------------------------------- util */
  var util = Game.util = {
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    damp: function (cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); },
    smoothstep: function (e0, e1, x) {
      var t = (x - e0) / (e1 - e0);
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      return t * t * (3 - 2 * t);
    },
    wrapAngle: function (a) {
      var t = Math.PI * 2;
      a = (a + Math.PI) % t;
      if (a < 0) a += t;
      return a - Math.PI;
    },
    lerpAngle: function (a, b, t) { return a + util.wrapAngle(b - a) * t; },
    // Seeded PRNG (mulberry32) -> function returning [0,1)
    rng: function (seed) {
      var s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    tileOf: function (v) { return Math.floor(v / Config.tile); },          // world coord -> tile index
    tileCenter: function (i) { return (i + 0.5) * Config.tile; }           // tile index -> world coord of center
  };

  /* ------------------------------------------------------------------ Events */
  var Events = Game.Events = (function () {
    var map = Object.create(null);

    function removeEntry(name, entry) {
      var l = map[name];
      if (!l) return;
      var i = l.indexOf(entry);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) delete map[name];
    }

    function add(name, fn, ctx, once) {
      var entry = { fn: fn, ctx: ctx, once: once };
      (map[name] || (map[name] = [])).push(entry);
      return function () { removeEntry(name, entry); };
    }

    return {
      on: function (name, fn, ctx) { return add(name, fn, ctx, false); },
      once: function (name, fn, ctx) { return add(name, fn, ctx, true); },
      off: function (name, fn, ctx) {
        var l = map[name];
        if (!l) return;
        if (!fn) { delete map[name]; return; }
        for (var i = l.length - 1; i >= 0; i--) {
          if (l[i].fn === fn && (ctx === undefined || l[i].ctx === ctx)) l.splice(i, 1);
        }
        if (!l.length) delete map[name];
      },
      // emit(name, payload). Handlers get (payload, name). '*' handlers receive every event.
      emit: function (name, data) {
        var lists = [map[name], map['*']];
        for (var k = 0; k < 2; k++) {
          var l = lists[k];
          if (!l) continue;
          l = l.slice();
          for (var i = 0; i < l.length; i++) {
            var h = l[i];
            if (h.once) removeEntry(k === 0 ? name : '*', h);
            try { h.fn.call(h.ctx, data, name); } catch (err) { console.error('[events] handler error for "' + name + '"', err); }
          }
        }
      }
    };
  })();

  /* ----------------------------------------------------------------- Display */
  var sc = Config.scaler;
  var scState = { ema: 0, lowT: 0, highT: 0, warm: 0, settle: 0, upAt: 0, upTo: 0, blockTo: 0, blockUntil: 0, backoff: 30000 };
  var resizeTimer = 0, lastScaleAt = performance.now();

  var Display = Game.Display = {
    canvas: null,
    width: 1,           // CSS px
    height: 1,
    aspect: 1,
    dpr: 1,             // device pixel ratio
    scale: 1,           // dynamic resolution scale (minScale..maxScale)
    pixelRatio: 1,      // effective renderer pixel ratio = clamp(min(dpr,maxDpr) * scale)
    scaler: { enabled: sc.enabled, targetFps: sc.targetFps, fps: 0 },
    stats: { resChanges: 0, ctxLost: 0, scalerChanges: 0 },   // shown in the perf overlay

    // Measure the canvas; does NOT emit. Render.init reads the values afterwards.
    init: function (canvas) {
      Display.canvas = canvas;
      Display.scaler.enabled = sc.enabled;
      Display.scaler.targetFps = sc.targetFps;
      measure(false, 'init');
      window.addEventListener('resize', schedule);
      window.addEventListener('orientationchange', schedule);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
      return Display;
    },

    info: function (reason) {
      return {
        width: Display.width, height: Display.height, aspect: Display.aspect, dpr: Display.dpr,
        scale: Display.scale, pixelRatio: Display.pixelRatio, reason: reason || 'info'
      };
    },

    refresh: function (reason) { measure(true, reason || 'refresh'); },

    setScale: function (s, reason) {
      s = util.clamp(Math.round(s * 20) / 20, sc.minScale, sc.maxScale);
      if (s === Display.scale) return;
      if (reason === 'scaler-down' || reason === 'scaler-up') {   // rare + safe: rate limited, capped per session
        var now = performance.now();
        if (Display.stats.scalerChanges >= sc.maxChanges || now - lastScaleAt < sc.minGapMs) return;
        lastScaleAt = now; Display.stats.scalerChanges++;
      }
      Display.scale = s;
      scState.ema = 0; scState.lowT = 0; scState.highT = 0; scState.settle = 12;   // ~12 frames to settle after a buffer resize
      measure(true, reason || 'scale');
    },

    setTargetFps: function (n) { Display.scaler.targetFps = n; },

    // Called once per drawn frame with the real (clamped) dt in seconds. Stage 35 governor: moving average (EMA, ~10 frames) of the frame time.
    // Down: avg > max(lowMs, 1.1 x cap interval) for lowSec. Up: avg < highMs (high-refresh screens) or <= 1.04 x cap interval (holding the cap) for highSec.
    // Hysteresis: a level we had to leave within 30 s of reaching it is blocked for 30 s, doubling to 4 min, so the scale never flickers.
    sample: function (dt) {
      var s = Display.scaler;
      if (!s.enabled || dt <= 0) return;
      if (dt > 0.5) { scState.settle = Math.max(scState.settle, 6); return; }   // tab switch / stall: not a rendering cost
      var ms = dt * 1000, per = 1000 / Math.max(20, s.targetFps), now = performance.now(), lowMs, upMs, nx;
      scState.ema = scState.ema ? scState.ema + (ms - scState.ema) * 0.1 : ms;
      s.fps = 1000 / scState.ema; s.avgMs = scState.ema;
      if (scState.settle > 0) { scState.settle--; return; }
      lowMs = Math.max(sc.lowMs, per * 1.1);
      upMs = per <= 13.4 ? sc.highMs : per * 1.04;
      if (scState.ema > lowMs) { scState.lowT += dt; scState.highT = 0; }
      else if (scState.ema < upMs) { scState.highT += dt; scState.lowT = 0; }
      else { scState.lowT = 0; scState.highT = 0; }
      if (scState.lowT >= sc.lowSec && Display.scale > sc.minScale + 0.001) {
        scState.lowT = 0;
        if (scState.upTo && now - scState.upAt < 30000) { scState.blockTo = scState.upTo; scState.blockUntil = now + scState.backoff; scState.backoff = Math.min(240000, scState.backoff * 2); }
        scState.upTo = 0;
        Display.setScale(Display.scale - sc.stepDown, 'scaler-down');
      } else if (scState.highT >= sc.highSec && Display.scale < sc.maxScale - 0.001) {
        scState.highT = 0;
        nx = Math.round((Display.scale + sc.stepUp) * 20) / 20;
        if (nx === scState.blockTo && now < scState.blockUntil) return;
        scState.upAt = now; scState.upTo = nx;
        Display.setScale(nx, 'scaler-up');
      }
    }
  };

  function measure(emit, reason) {
    var c = Display.canvas;
    var w = Math.max(1, (c && c.clientWidth) || window.innerWidth || 1);
    var h = Math.max(1, (c && c.clientHeight) || window.innerHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var cfg = Config.display;
    // Mobile address bar show/hide fires resize: ignore a height-only change < 25% (keeps the buffer intact).
    if (reason === 'resize' && Display.width > 1 && w === Display.width && Math.abs(h - Display.height) / Display.height < 0.25) return;
    var pr = util.clamp(Math.min(dpr, cfg.maxDpr) * Display.scale, cfg.minPixelRatio, cfg.maxDpr);
    var changed = (w !== Display.width) || (h !== Display.height) || Math.abs(pr - Display.pixelRatio) > 1e-4;
    Display.width = w; Display.height = h; Display.aspect = w / h;
    Display.dpr = dpr; Display.pixelRatio = pr;
    if (emit && changed) Display.stats.resChanges++;
    if (emit && changed) Events.emit('display:resize', Display.info(reason));
  }

  function schedule() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { measure(true, 'resize'); }, 150);
  }

  /* -------------------------------------------------------------------- Loop */
  function FnList() { this.items = []; this.snap = []; this.seq = 0; }
  FnList.prototype.add = function (fn, priority, name) {
    var e = { fn: fn, p: priority || 0, n: this.seq++, name: name || '', stack: (new Error()).stack || '', cat: -1, label: '', ema: 0, max: 0 };
    var self = this;
    this.items.push(e);
    this.items.sort(function (a, b) { return (a.p - b.p) || (a.n - b.n); });
    this.snap = this.items.slice();
    return function () {
      var i = self.items.indexOf(e);
      if (i >= 0) { self.items.splice(i, 1); self.snap = self.items.slice(); }
    };
  };
  FnList.prototype.run = function (a, b, c) {
    var s = this.snap;
    for (var i = 0; i < s.length; i++) {
      try { s[i].fn(a, b, c); } catch (err) { console.error('[loop] callback error', err); }
    }
  };

  /* Stage 34 profiler (Game.Prof): off unless the perf overlay is open (then tick times every callback; closed = one boolean test per frame).
   * cat 0 input, 1 simulation, 2 render, 3 UI/DOM; classified lazily from the registering file (stack at add time) or an explicit name. */
  var IN_RX = /input|joystick|move_core|camera_auto/i, UI_RX = /ui|hud|panel|menu|minimap|lobby|notebook|layout|action_hint|icons|look_ui|furn_live|goals/i;
  function classify(e) {
    var lines = e.stack.split('\n'), i, m, f = '';
    for (i = 1; i < lines.length; i++) { m = /([\w.]+\.js)/.exec(lines[i]); if (m && m[1] !== 'core.js') { f = m[1]; break; } }
    e.label = (e.name || f.replace('.js', '') || ('p' + e.p)) + (e.name ? '' : '#' + e.n);
    e.cat = e.name === 'render' ? 2 : IN_RX.test(f) ? 0 : UI_RX.test(f) ? 3 : 1;
    e.stack = '';
  }
  var Prof = Game.Prof = {
    on: false, mk: 0, fish: 0, mark: function (t0) { Prof.mk += performance.now() - t0; }, catAcc: new Float64Array(4), cat: new Float64Array(4), work: 0, ring: new Float32Array(120), n: 0, sorted: new Float32Array(120),
    reset: function () { var i; for (i = 0; i < 4; i++) { Prof.cat[i] = 0; Prof.catAcc[i] = 0; } Prof.work = 0; Prof.n = 0; },
    p95: function () { var c = Math.min(Prof.n, 120), a; if (!c) return 0; Prof.sorted.set(Prof.ring.subarray(0, c)); a = Prof.sorted.subarray(0, c); a.sort(); return a[Math.min(c - 1, Math.floor(c * 0.95))]; },
    avg: function () { var c = Math.min(Prof.n, 120), i, t = 0; for (i = 0; i < c; i++) t += Prof.ring[i]; return c ? t / c : 0; },
    /* overlay only (allocates): the k costliest callbacks by smoothed ms per call */
    top: function (k) {
      var all = updaters.items.concat(frameFns.items), i;
      for (i = 0; i < all.length; i++) if (all[i].cat < 0) classify(all[i]);
      all.sort(function (a, b) { return b.ema - a.ema; });
      return all.slice(0, k).map(function (e) { return { label: e.label, ms: e.ema, max: e.max, cat: e.cat }; });
    }
  };
  FnList.prototype.runT = function (a, b, c) {
    var s = this.snap, i, e, t0, t;
    for (i = 0; i < s.length; i++) {
      e = s[i]; t0 = performance.now();
      try { e.fn(a, b, c); } catch (err) { console.error('[loop] callback error', err); }
      t = performance.now() - t0;
      if (e.cat < 0) classify(e);
      e.ema += (t - e.ema) * 0.05; if (t > e.max) e.max = t;
      Prof.catAcc[e.cat] += t;
    }
  };

  var updaters = new FnList();
  var frameFns = new FnList();
  var reasons = Object.create(null);
  var reasonCount = 0;
  var raf = 0, last = 0, acc = 0;

  var Loop = Game.Loop = {
    step: Config.loop.fixedStep,
    timeScale: 1,
    simTime: 0,      // seconds of simulated time (fixed steps)
    realTime: 0,     // seconds of running (unpaused) frame time
    frame: 0,
    alpha: 0,        // interpolation factor of the last frame (0..1)
    fps: 60,         // smoothed
    running: false,
    paused: false,

    // fn(dt) at fixed step; lower priority runs first (default 0). Returns remover.
    onUpdate: function (fn, priority, name) { return updaters.add(fn, priority, name); },
    // fn(frameDt, alpha, realTime) once per rendered frame. Returns remover.
    onFrame: function (fn, priority, name) { return frameFns.add(fn, priority, name); },

    start: function () {
      if (Loop.running) return;
      Loop.running = true;
      Loop.step = Config.loop.fixedStep;
      last = performance.now();
      acc = 0;
      if (!Loop.paused) raf = requestAnimationFrame(tick);
    },

    stop: function () {
      Loop.running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },

    pause: function (reason) {
      reason = reason || 'manual';
      if (!reasons[reason]) { reasons[reason] = true; reasonCount++; }
      if (!Loop.paused) {
        Loop.paused = true;
        cancelAnimationFrame(raf);
        raf = 0;
        Events.emit('loop:pause', { reason: reason });
      }
    },

    resume: function (reason) {
      reason = reason || 'manual';
      if (reasons[reason]) { delete reasons[reason]; reasonCount--; }
      if (Loop.paused && reasonCount === 0) {
        Loop.paused = false;
        last = performance.now();
        acc = 0;
        if (Loop.running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
        Events.emit('loop:resume', { reason: reason });
      }
    }
  };

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (Loop.paused) return;
    var lc = Config.loop;
    var dt = (now - last) / 1000, prof = Prof.on, pt0 = 0, k;
    if (prof) { pt0 = performance.now(); Prof.ring[Prof.n++ % 120] = now - last; Prof.catAcc[0] = Prof.catAcc[1] = Prof.catAcc[2] = Prof.catAcc[3] = 0; Prof.mk = 0; }
    last = now;
    if (dt < 0) dt = 0;
    if (dt > lc.maxFrameDelta) dt = lc.maxFrameDelta;

    Loop.frame++;
    Loop.realTime += dt;
    if (dt > 0) Loop.fps += (1 / dt - Loop.fps) * 0.05;
    Display.sample(dt);

    var step = Loop.step;
    acc += dt * Loop.timeScale;
    var n = 0;
    while (acc >= step && n < lc.maxSubSteps) {
      if (prof) updaters.runT(step); else updaters.run(step);
      acc -= step;
      Loop.simTime += step;
      n++;
    }
    if (acc >= step) acc = 0; // drop backlog after a long hitch
    Loop.alpha = acc / step;
    if (prof) {
      frameFns.runT(dt, Loop.alpha, Loop.realTime);
      for (k = 0; k < 4; k++) Prof.cat[k] += (Prof.catAcc[k] - Prof.cat[k]) * 0.05;
      Prof.work += (performance.now() - pt0 - Prof.work) * 0.05; Prof.fish += (Prof.mk - Prof.fish) * 0.05;
    } else frameFns.run(dt, Loop.alpha, Loop.realTime);
  }

  // Pause when the tab is hidden.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) Loop.pause('hidden'); else Loop.resume('hidden');
  });
  if (document.hidden) Loop.pause('hidden');
})();

/* Stage 10.5: shared Vietnamese labels (player-facing text is Vietnamese, written directly in source). */
Game.VI = {
  season: { spring: 'Mùa xuân', summer: 'Mùa hạ', autumn: 'Mùa thu', winter: 'Mùa đông' },
  seasonLow: { spring: 'mùa xuân', summer: 'mùa hạ', autumn: 'mùa thu', winter: 'mùa đông' },
  weather: { sun: 'Nắng', rain: 'Mưa', snow: 'Tuyết' },
  quality: ['Thường', 'Bạc', 'Vàng']
};
