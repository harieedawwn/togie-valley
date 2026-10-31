/* Round 3 stage 5: node tools/energy_night_check.js - late-night drain reaches 0 by 05:30 from any start, also with other costs on top; vignette grows; wiring. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), NC = require(path.join(root, 'js/night.js')), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('energy_night: FAIL ' + m); } else n++; }
function sim(e0, cost) {
  var st = NC.make(), e = e0, h = 26, dt = 1 / 1440, zero = -1, k = 0, prevV = 0, mono = true, v;   // one frame at 60 fps = 1/1440 game hour
  st.arm(h, e);
  while (h < 30 && zero < 0) {
    h += dt; e = Math.max(0, e - st.tick(dt));
    if (cost && ++k % 900 === 0) e = Math.max(0, e - cost);   // an extra cost every 15 real s
    v = st.vignette(e); if (v + 1e-9 < prevV) mono = false; prevV = v;
    if (e <= 0) zero = h;
  }
  return { zero: zero, mono: mono, v: prevV };
}
[100, 85, 73, 50, 30, 12, 5, 1].forEach(function (e0) {
  [0, 3].forEach(function (c) {
    var r = sim(e0, c);
    need(r.zero > 0 && r.zero <= 29.5, 'start ' + e0 + ' extra cost ' + c + ': zero at ' + r.zero.toFixed(2) + ' (want <= 29.50)');
    need(r.mono && r.v === 1, 'vignette grows to 1 (start ' + e0 + ')');
  });
});
var st = NC.make(); st.arm(27.4, 40);   // loaded late in the night: still finishes by 29.4
need(Math.abs(st.rate * (29.4 - 27.4) - 40) < 1e-9, 'rate when armed mid-night');
var src = fs.readFileSync(path.join(root, 'js/night.js'), 'utf8'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), time = fs.readFileSync(path.join(root, 'js/time.js'), 'utf8');
need(html.indexOf('js/night.js') > html.indexOf('js/bed_sleep.js') && html.indexOf('js/bed_sleep.js') > 0, 'night.js after bed_sleep.js in index.html');
need(!/Day\.sleep\('passout'\)/.test(time) && /NIGHT_END/.test(time), 'no forced pass-out at 02:00');
need(!/blanket|blk\b/.test(fs.readFileSync(path.join(root, 'js/bed_sleep.js'), 'utf8')), 'blanket code gone');
need(/BS\.faint|BedSleep/.test(src) && /H\.wakeQuick/.test(src) && /Day\.sleep\('faint'\)/.test(src), 'faint wiring');

/* ---- Round 4 stage 8: single-player rest (nằm nghỉ): 40x clock until 19:00 in fixed substeps, slow energy, wiring */
var vm = require('vm'), RC = require(path.join(root, 'js/rest.js'));
(function () {
  var ev = {}, loops = [], steps = 0, hours = 0, days = 0, f, G = { Events: { on: function (n, fn) { (ev[n] = ev[n] || []).push(fn); }, emit: function (n, p) { (ev[n] || []).forEach(function (fn) { fn(p); }); } }, Loop: { onUpdate: function (fn) { loops.push(fn); } }, State: {}, Render: { setTimeOfDay: function () {}, setSeason: function () {} }, util: { clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); }, rng: function () { return function () { return 0.5; }; } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/time.js'), 'utf8'), { window: { Game: G }, console: console, Date: Date, Math: Math, Object: Object });
  var T = G.Time, hrAt19 = -1, over = false, sp0;
  G.Events.on('time:minuteStep', function () { steps++; }); G.Events.on('time:hourChanged', function () { hours++; }); G.Events.on('day:started', function () { days++; });
  G.Events.on('time:speed', function (e) { if (e.speed === 1) hrAt19 = T.hour; });
  T.setHour(8); T.setSpeed(40);
  for (f = 0; f < 3000 && T.speed > 1; f++) { loops.forEach(function (fn) { fn(1 / 60); }); if (T.speed > 1 && T.hour > 19) over = true; }
  need(hrAt19 === 19 && !over && T.hour === 19 && T.speed === 1, 'rest: clock runs 40x and stops exactly at 19:00, then normal speed');
  need(Math.abs(f / 60 - 11 * 24 / 40) < 0.1, 'rest: 08:00 -> 19:00 in ' + (f / 60).toFixed(2) + ' s (about 40x)');
  need(steps === 66 && hours === 11 && days === 0 && T.day === 1, 'rest: every 10-min step and hour fires once (' + steps + '/' + hours + '), no day change');
  T.setHour(8); sp0 = 0; loops.forEach(function (fn) { fn(1); }); need(Math.abs(T.hour - 8 - 1 / 24) < 1e-9, 'rest: normal speed unchanged (1 s = 1/24 h)');
  T.setHour(18.9); T.setSpeed(40); loops.forEach(function (fn) { fn(0.5); }); need(T.hour === 19 && T.speed === 1, 'rest: a big frame cannot jump past 19:00');
  T.setHour(19.5); T.setSpeed(40); need(T.speed === 1, 'rest: no fast-forward after 19:00');
  var e = RC.energy(RC.REST_PER_H), got = 0, k;
  for (k = 0; k < 660; k++) got += e.tick(1 / 60, 100);   // 11 game hours in 1/60 h frames
  need(RC.REST_PER_H * 2 === RC.SLEEP_PER_H && got >= 68 && got <= 69, 'rest: energy recovers at half the sleep rate (' + got + ' in 11 h)');
})();
var rsrc = fs.readFileSync(path.join(root, 'js/rest.js'), 'utf8'), hs = fs.readFileSync(path.join(root, 'js/house.js'), 'utf8'), aa = fs.readFileSync(path.join(root, 'js/anim_actions.js'), 'utf8'), ts = fs.readFileSync(path.join(root, 'js/time.js'), 'utf8');
need(html.indexOf('js/rest.js') > html.indexOf('js/sleep_vote.js'), 'rest.js after sleep_vote.js in index.html');
need(/Time\.hour < 19 && G\.Rest && G\.Rest\.start\(t\)/.test(hs) && /House\.sleepLying/.test(hs) && /sleepLying\(\)/.test(rsrc), 'rest wiring: house.js doSleep before 19:00 -> Rest.start; at 19:00 sleepLying');
need(/Rest\.resting\(\)\) return/.test(aa), 'rest: no Zzz while resting');
need(/Đang nằm nghỉ/.test(rsrc) && /T\.clock\(\)/.test(rsrc), 'rest label with the clock');
need(/H\.mpWake|tv-night-vig/.test(src) && /NC\.START = 26|START: 26/.test(src) && /Time\.speed \* 1|dt \* HOURS_PER_REAL_SEC \* Time\.speed/.test(ts) && /NIGHT_END/.test(ts), 'fainting + 02:00 drain code untouched (night.js unchanged), clock limit kept');
console.log('energy_night: ' + n + ' ok' + (errs ? ', ' + errs + ' FAIL' : '') + ' (resting cases covered: solo rest 40x to exactly 19:00, no day change, steps once, half-rate energy, no Zzz/label wiring; faint + 02:00 drain unchanged)');
process.exit(errs ? 1 : 0);
