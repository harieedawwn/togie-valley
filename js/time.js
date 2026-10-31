/* Togie Valley - time.js (Stage 2)
 * Game.Time (clock 06:00 -> 26:00), Game.Day (end/start hooks, sleep, weather roll, seasons).
 * Drives Render.setTimeOfDay / setSeason. No visuals. Depends on: core.js, state.js, render.js.
 */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events || !G.Loop || !G.State || !G.Render) { console.error('[time] dependencies missing'); return; }
  var Events = G.Events, State = G.State, util = G.util;

  var DAY_START = 6, REST_END = 19, DAY_END = 26, LATE = 24, NIGHT_END = 30;   // 26:00 = 02:00 (no forced sleep any more), the clock stops at 30:00 = 06:00 (js/night.js faints the player)
  var MODE_E = { full: 1, late: 0.75, passout: 0.5, faint: 0.3 };
  var HOURS_PER_REAL_SEC = 1 / 24;      // 10 game-min = 4.0 real s
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var DAYS_PER_SEASON = 14;
  var RAIN = { spring: 0.25, summer: 0.15, autumn: 0.25, winter: 0 };
  var SNOW_WINTER = 0.35;

  var pauses = Object.create(null), pauseCount = 0;
  var lastStep = 0, lastHour = 0;

  var Time = G.Time = {
    day: 1,
    hour: DAY_START,        // float 6..26
    season: 'spring',
    weather: 'sun',         // today: 'sun' | 'rain' | 'snow'
    tomorrow: 'sun',        // rolled at bedtime
    seed: 1,
    DAY_START: DAY_START, DAY_END: DAY_END, NIGHT_END: NIGHT_END, SEASONS: SEASONS, DAYS_PER_SEASON: DAYS_PER_SEASON,

    /* Reason-counted: the clock freezes while any reason is active (UI panels use 'ui'). */
    pause: function (reason) {
      reason = reason || 'manual';
      if (!pauses[reason]) { pauses[reason] = true; pauseCount++; }
    },
    resume: function (reason) {
      reason = reason || 'manual';
      if (pauses[reason]) { delete pauses[reason]; pauseCount--; }
    },
    isPaused: function () { return pauseCount > 0; },
    /* Rest fast-forward (js/rest.js): speed > 1 multiplies the clock until REST_END, then falls back to 1. Guests only mirror the host's speed (ttlMs = expiry if the host goes quiet). */
    speed: 1, speedExp: 0, REST_END: REST_END,
    setSpeed: function (s, ttlMs) {
      s = s > 1 ? Math.min(s, 60) : 1;
      if (s > 1 && Time.hour >= REST_END) s = 1;
      Time.speedExp = s > 1 && ttlMs ? Date.now() + ttlMs : 0;
      if (s === Time.speed) return;
      Time.speed = s; Events.emit('time:speed', { speed: s });
    },
    /* Advance dH game hours in fixed substeps (never past the next 10-min step), so every minuteStep / hourChanged fires exactly once; at speed > 1 the clock stops at REST_END and the speed resets. */
    advance: function (dH) {
      var guard = 0, nxt, c, step;
      while (dH > 1e-9 && guard++ < 500) {
        nxt = (Math.floor(Time.hour * 6 + 1e-9) + 1) / 6; c = Math.min(dH, nxt - Time.hour);
        if (Time.speed > 1 && Time.hour + c > REST_END) c = Math.max(0, REST_END - Time.hour);
        Time.hour += c; dH -= c;
        step = Math.floor(Time.hour * 6 + 1e-9);
        if (step > lastStep) {
          lastStep = step;
          Events.emit('time:minuteStep', { hour: Time.hour });
          if (Math.floor(Time.hour + 1e-9) !== lastHour) { lastHour = Math.floor(Time.hour + 1e-9); Events.emit('time:hourChanged', { hour: lastHour }); }
        }
        if (Time.speed > 1 && Time.hour >= REST_END - 1e-9) { Time.hour = REST_END; Time.setSpeed(1); dH = 0; }
      }
      G.Render.setTimeOfDay(Time.wrapped());
    },
    /* Guest, 'clk' message of the same day: mirror the host's speed (expires after 1.5 s of silence) and clock. */
    mirror: function (h, sp) { Time.setSpeed(sp > 1 ? sp : 1, 1500); Time.follow(h); },
    /* Guest: follow the host clock; forward jumps replay the skipped steps (timers stay equal), small backward drift just snaps. */
    follow: function (h) {
      var d = h - Time.hour, sp = Time.speed;
      if (d > 1e-9 && d <= 6) { Time.speed = 1; Time.advance(d); Time.speed = sp; }
      else if (d < 0 && d > -0.3) Time.hour = h;
      else if (Math.abs(d) > 0.3) Time.setHour(h);
    },

    seasonOf: function (day) { return SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % 4]; },
    dayOfSeason: function (day) { return ((day || Time.day) - 1) % DAYS_PER_SEASON + 1; },
    year: function (day) { return Math.floor(((day || Time.day) - 1) / (DAYS_PER_SEASON * 4)) + 1; },
    /* Render hour 0..24 */
    wrapped: function () { return Time.hour % 24; },
    minutes: function () { return Math.floor((Time.hour % 1) * 60); },
    /* '06:00', '25:30' shows as '01:30' style 12h-free label: HH:MM with hour wrapped. */
    clock: function (h) {
      h = h === undefined ? Time.hour : h;
      var hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60 / 10) * 10;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    },
    /* Seeded, deterministic weather for a given day. Days 1-2 always sunny. */
    weatherFor: function (day) {
      if (day <= 2) return 'sun';
      var season = Time.seasonOf(day);
      var r = util.rng((Time.seed * 7919 + day * 104729) >>> 0)();
      if (season === 'winter') return r < SNOW_WINTER ? 'snow' : 'sun';
      return r < RAIN[season] ? 'rain' : 'sun';
    },
    /* Set the clock (6..26). Emits steps/hours crossed only via the normal tick; debug use. */
    setHour: function (h) {
      Time.hour = util.clamp(h, DAY_START, NIGHT_END - 0.001);
      lastStep = Math.floor(Time.hour * 6); lastHour = Math.floor(Time.hour);
      G.Render.setTimeOfDay(Time.wrapped());
      Events.emit('time:set', { hour: Time.hour });
    },

    reset: function () {
      Time.seed = (Math.random() * 4294967295) >>> 0;
      Time.day = 1; Time.season = 'spring'; Time.weather = 'sun'; Time.tomorrow = 'sun';
      Time.hour = DAY_START; Time.setHour(DAY_START);
      G.Render.setSeason(Time.season, true);
    },
    save: function () { return { day: Time.day, hour: Time.hour, weather: Time.weather, tomorrow: Time.tomorrow, seed: Time.seed }; },
    load: function (o) {
      o = o || {};
      Time.seed = typeof o.seed === 'number' ? o.seed : 1;
      Time.day = o.day > 0 ? Math.floor(o.day) : 1;
      Time.season = Time.seasonOf(Time.day);
      Time.weather = o.weather || 'sun';
      Time.tomorrow = o.tomorrow || Time.weatherFor(Time.day + 1);
      Time.setHour(typeof o.hour === 'number' ? o.hour : DAY_START);
      G.Render.setSeason(Time.season, true);
    }
  };

  /* -------------------------------------------------------------------- Day */
  var endHooks = [], startHooks = [], seq = 0, sleeping = false;

  function addHook(list, p, fn) {
    if (typeof p === 'function') { fn = p; p = 0; }
    var e = { p: p || 0, fn: fn, n: seq++ };
    list.push(e);
    list.sort(function (a, b) { return (a.p - b.p) || (a.n - b.n); });
    return function () { var i = list.indexOf(e); if (i >= 0) list.splice(i, 1); };
  }
  function runHooks(list, arg) {
    var l = list.slice();
    for (var i = 0; i < l.length; i++) {
      try { l[i].fn(arg); } catch (err) { console.error('[day] hook error', err); }
    }
  }

  var Day = G.Day = {
    /* fn({day, mode, hour}) at bedtime, low priority first. mode: 'full' | 'late' | 'passout' | 'faint' (30 % energy, js/night.js). */
    onEnd: function (priority, fn) { return addHook(endHooks, priority, fn); },
    /* fn({day, season, weather}) after the new day is set up, low priority first. */
    onStart: function (priority, fn) { return addHook(startHooks, priority, fn); },

    /* mode optional: derived from the clock (before 24:00 full, 24-26 late, >= 26 pass-out). */
    sleep: function (mode) {
      if (sleeping) return false;
      sleeping = true; Time.setSpeed(1);
      var h = Time.hour;
      mode = mode || (h >= LATE ? 'late' : 'full');
      var info = { day: Time.day, mode: mode, hour: h, lostMoney: 0 };
      if (G.Net && G.Net.mode === 'guest') {   // Stage 17: a guest only restores their own energy; the host owns the day
        Events.emit('day:ended', info);
        if (info.lostMoney) State.addMoney(-info.lostMoney);
        State.setEnergy(State.maxEnergy * (MODE_E[mode] || 0.5));
        Events.emit('day:started', { day: Time.day, season: Time.season, weather: Time.weather, mode: mode, lostMoney: info.lostMoney });
        sleeping = false;
        return true;
      }
      runHooks(endHooks, info);
      Events.emit('day:ended', info);

      if (info.lostMoney) State.addMoney(-info.lostMoney);
      State.setEnergy(State.maxEnergy * (MODE_E[mode] || 0.5));

      var oldSeason = Time.season;
      Time.day += 1;
      Time.season = Time.seasonOf(Time.day);
      Time.weather = Time.tomorrow;
      Time.tomorrow = Time.weatherFor(Time.day + 1);
      Time.setHour(DAY_START);
      if (Time.season !== oldSeason) {
        G.Render.setSeason(Time.season);
        Events.emit('season:changed', { season: Time.season, from: oldSeason, day: Time.day });
      }
      var start = { day: Time.day, season: Time.season, weather: Time.weather, mode: mode, lostMoney: info.lostMoney };
      runHooks(startHooks, start);
      Events.emit('day:started', start);
      sleeping = false;
      return true;
    }
  };

  /* ------------------------------------------------------------------- loop */
  G.Loop.onUpdate(function (dt) {
    if (pauseCount > 0 || sleeping) return;
    if (Time.speedExp && Date.now() > Time.speedExp) Time.setSpeed(1);
    Time.advance(dt * HOURS_PER_REAL_SEC * Time.speed);
    if (Time.hour >= NIGHT_END) { Time.hour = NIGHT_END - 0.001; if (!(G.Net && G.Net.mode === 'guest')) { if (G.Night) Events.emit('time:limit', {}); else Day.sleep('faint'); } }   // Stage 17: a guest waits for the host's clock; 06:00 without sleep -> faint (night.js)
  }, -50);
})();
