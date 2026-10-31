/* Round 3 stage 6: node tools/sleep_vote_check.js - host sleep vote for 1, 2 and 4 players: joins, leaves, faints, spots; the day skips exactly when it should. */
var path = require('path'), fs = require('fs'), VC = require(path.join(__dirname, '../js/sleep_vote.js')), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('sleep_vote: FAIL ' + m); } else n++; }
function room(spots, ids) {
  var occ = {}, io = { spots: function () { return spots; }, claim: function (s, id) { if (occ[s] && occ[s] !== id) return false; occ[s] = id; return true; }, release: function (s, id) { if (occ[s] === id) delete occ[s]; } };
  var m = VC.make(io); ids.forEach(function (i) { m.join(i); }); m.occ = occ; return m;
}
function sleep(m, id, want) { var s = m.request(id, want); if (s) m.lie(id); return s; }

var m = room(['house'], ['p1']);                       // 1 player: 1 of 1
need(!m.ready(20), 'solo awake'); need(sleep(m, 'p1') === 'house', 'solo spot'); need(m.ready(20), 'solo skips'); need(m.modeOf('p1', 20) === 'full' && m.modeOf('p1', 25) === 'late', 'modes');
m.going = true; need(!m.ready(20), 'no double go'); m.roll(); need(!m.st.p1 && !m.occ.house && !m.going, 'roll clears + frees');

m = room(['house', 'b1'], ['p1', 'p2']);               // 2 players
sleep(m, 'p1'); need(!m.ready(20) && m.asleep(20) === 1, 'half asleep: no skip');
need(m.request('p2', 'house') === 'b1', 'taken wanted spot -> next free');
need(!m.ready(20), 'claimed but not lying: awake'); m.lie('p2'); need(m.ready(20), 'both lying: skip');
m.roll(); sleep(m, 'p1'); sleep(m, 'p2'); m.join('p3'); need(!m.ready(20), 'late joiner is awake: no skip'); m.leave('p3'); need(m.ready(20), 'awake player leaves: vote recomputed -> skip');
m.roll(); sleep(m, 'p1'); sleep(m, 'p2'); need(m.ready(20), 'ready again'); m.leave('p2'); need(m.ready(20) && !m.occ.b1, 'sleeper leaves: spot freed, 1/1'); m.roll();
sleep(m, 'p1'); m.out('p1'); need(!m.ready(20) && !m.occ.house, 'tapping the floor: awake again, spot freed');

m = room(['house', 'b1'], ['p1', 'p2']);               // faint rules
sleep(m, 'p1'); need(m.faint('p2', 24) === 'b1', 'faint claims a spot');
need(!m.ready(25.9), 'faint before 02:00 does not count'); need(m.ready(26), 'faint counts from 02:00');
need(m.wakeDue(26.9).length === 0 && m.wakeDue(27).join() === 'p2', 'faint wakes after 3 h'); m.out('p2'); need(!m.ready(27) && !m.occ.b1, 'woken faint is awake, spot freed');
need(m.modeOf('p2', 27) === 'late', 'mode after wake'); m.faint('p2', 26.5); need(m.modeOf('p2', 27) === 'faint', 'faint mode');
m = room(['house'], ['p1', 'p2']); m.faint('p1', 27); m.faint('p2', 28); need(!m.st.p2, 'one spot: second faint gets none'); need(!m.ready(28), 'unplaced faint is awake');
m = room(['house', 'b1'], ['p1', 'p2']); m.faint('p1', 26.2); m.faint('p2', 27); need(m.ready(27) && m.fainted().length === 2, 'all fainted after 02:00 -> day rolls');
need(m.wakeDue(29.2).join() === 'p1', 'wake order');

var sp = ['house', 'b1'];
m = room(sp, ['p1', 'p2', 'p3', 'p4']);   // 4 players, 2 spots
need(sleep(m, 'p1') === 'house' && sleep(m, 'p2') === 'b1', '2 spots taken'); need(m.request('p3') === null, 'no free spot -> null (toast)');
need(!m.ready(20) && m.asleep(20) === 2 && m.total() === 4, '2/4'); m.leave('p3'); need(m.total() === 3 && !m.ready(20), '2/3');
need(m.request('p4') === null, 'still full'); m.leave('p4'); need(m.ready(20), 'last awake leaves -> skip');
m.roll(); m.join('p3'); m.join('p4'); sp.push('b2'); sleep(m, 'p1'); sleep(m, 'p2'); m.faint('p3', 24); need(!m.ready(25) && m.asleep(25) === 2, 'faint at 24:00 does not count');
need(m.snapshot(26).n === 3 && m.snapshot(26).m === 4, 'HUD 3/4 after 02:00'); need(!m.ready(26), 'p4 still awake');
need(m.snapshot(20).s.p1[1] === 1 && m.snapshot(20).s.p3[1] === 2, 'snapshot shape');
m.leave('p4'); need(m.ready(26), 'p4 gone: skip with a fainted player');

/* ---- Round 4 stage 8: resting (nằm nghỉ) - host-side fast-forward rules, real js/rest.js core + real js/time.js in vm contexts */
var vm = require('vm'), RC = require(path.join(__dirname, '../js/rest.js'));
function loadTime() {
  var ev = {}, loops = [], G = { Events: { on: function (n, f) { (ev[n] = ev[n] || []).push(f); }, emit: function (n, p) { (ev[n] || []).forEach(function (f) { f(p); }); } }, Loop: { onUpdate: function (f) { loops.push(f); } }, State: {}, Render: { setTimeOfDay: function () {}, setSeason: function () {} }, util: { clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); }, rng: function () { return function () { return 0.5; }; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/time.js'), 'utf8'), { window: { Game: G }, console: console, Date: Date, Math: Math, Object: Object });
  var o = { T: G.Time, G: G, frame: function (dt) { loops.forEach(function (f) { f(dt); }); }, steps: 0, hours: 0, days: 0 };
  G.Events.on('time:minuteStep', function () { o.steps++; }); G.Events.on('time:hourChanged', function () { o.hours++; }); G.Events.on('day:started', function () { o.days++; });
  o.T.setHour(8); return o;
}
function host(ids) {   // pure host core with a controllable bed state
  var inb = {}, c = RC.make({ ids: function () { return ids; }, inBed: function (id) { return !!inb[id]; } });
  c.inb = inb; c.ids = ids; return c;
}
var now = 1e6, c, tk;
c = host(['p1']); c.inb.p1 = 1; c.beat('p1', true, now); need(c.tick(now, 8) === true, 'rest: 1 player alone lying -> fast at once');
c.beat('p1', false, now); need(c.tick(now, 8) === false, 'rest: alone, gets up -> stops');
c = host(['p1', 'p2']); c.inb.p1 = 1; c.beat('p1', true, now); c.beat('p2', false, now); c.beat('p1', true, now + 20000); need(!c.tick(now, 9) && !c.tick(now + 20000, 9) && c.n === 1 && c.m === 2, 'rest: 1 of 2 never accelerates');
c.inb.p2 = 1; c.beat('p2', true, now + 20000); need(!c.tick(now + 20000, 9), 'rest: both lying, still in the 1 s debounce'); c.beat('p1', true, now + 20900); need(!c.tick(now + 20999, 9) && c.tick(now + 21000, 9), 'rest: both lying -> fast after 1 s');
c.beat('p1', true, now + 21100); c.beat('p2', false, now + 21100); need(c.tick(now + 21100, 9) === false, 'rest: one gets up -> stops in the same tick');
c.beat('p2', true, now + 21200); c.tick(now + 21200, 9); c.beat('p2', false, now + 21700); c.tick(now + 21700, 9); c.beat('p2', true, now + 21800); need(!c.tick(now + 22300, 9), 'rest: flicker (lie 0.5 s, up, lie) never accelerates');
now = 3e6; c = host(['p1', 'p2']); c.inb.p1 = c.inb.p2 = 1; c.beat('p1', true, now); c.beat('p2', true, now); c.tick(now, 9); need(c.tick(now + 1000, 9), 'rest: fast again');
c.ids.push('p3'); need(c.tick(now + 1100, 9) === false, 'rest: a third player joins mid-acceleration -> stops at once');
c.inb.p3 = 1; c.beat('p3', true, now + 1100); c.beat('p1', true, now + 1100); c.beat('p2', true, now + 1100); c.tick(now + 1100, 9); need(c.tick(now + 2100, 9), 'rest: 3 lying -> fast');
c.ids.pop(); need(c.tick(now + 2200, 9) === true && c.m === 2, 'rest: a resting player disconnects, the rest continues');
c.ids.push('p3'); c.inb.p3 = 0; c.tick(now + 2300, 9); c.ids.pop(); need(c.tick(now + 2400, 9) === false, 'rest: awake player leaves -> recount, debounce first'); need(c.tick(now + 3400, 9) === true, 'rest: ... then fast again');
c.tick(now + 3600, 18.99); need(c.tick(now + 3500, 19) === false && c.tick(now + 4000, 18.99) === false && c.tick(now + 5000, 18.99) === true, 'rest: 19:00 stops, 18:59 runs');
c.beat('p1', true, now + 10000); c.beat('p2', true, now + 4000); need(c.tick(now + 8999, 9) === true && c.tick(now + 9001, 9) === false, 'rest: guest silent for more than 5 s -> stops');
c = host(['p1', 'p2']); c.inb.p1 = 1; c.beat('p1', true, now); c.beat('p2', true, now); need(!c.tick(now, 9), 'rest: guest flag true but not in a bed (host vote) -> not counted');
m = room(['house', 'b1'], ['p1', 'p2']); sleep(m, 'p1'); sleep(m, 'p2'); need(!m.ready(18.99) && m.ready(19), 'rest: lying before 19:00 never rolls the day; at 19:00 all lying = real sleep');

/* 60 simulated seconds: host + 2 guests (real time.js each); guests only mirror the host's 'clk' (hour rounded to 1/1000, sp) every 0.2 s */
(function () {
  var H = loadTime(), G1 = loadTime(), G2 = loadTime(), ids = ['p1', 'p2', 'p3'], hc = host(ids), t = 5e6, f, mx = 0, atEnd = -1, over = false, hr0 = H.T.hour, lastSp = 1, fastFrames = 0, wasFast = false;
  ids.forEach(function (i) { hc.inb[i] = 1; });
  function clk() { [G1, G2].forEach(function (g) { g.T.mirror(Math.round(H.T.hour * 1000) / 1000, H.T.speed > 1 ? H.T.speed : 0); }); }   // net.js sendClk: every 0.2 s while fast + at once on a speed change
  H.G.Events.on('time:speed', function (e) { clk(); if (e.speed === 1 && wasFast && atEnd < 0) atEnd = H.T.hour; });
  for (f = 0; f < 3600; f++) {
    t += 1000 / 60;
    hc.beat('p1', true, t); if (f % 60 === 0) { hc.beat('p2', true, t); hc.beat('p3', true, t); }
    H.T.setSpeed(hc.tick(t, H.T.hour) ? 40 : 1); if (H.T.speed > 1) { fastFrames++; wasFast = true; if (H.T.hour > 19) over = true; }
    if (f % 12 === 0 || H.T.speed !== lastSp) { lastSp = H.T.speed; clk(); }
    H.frame(1 / 60);
    [G1, G2].forEach(function (g) { g.frame(1 / 60); });
    mx = Math.max(mx, Math.abs(G1.T.hour - H.T.hour), Math.abs(G2.T.hour - H.T.hour));
  }
  need(fastFrames > 300 && !over && atEnd === 19, 'rest sim: accelerated, ended exactly at 19:00 (' + atEnd + ')');
  need(mx < 1 / 60 + 1e-9, 'rest sim: guest clocks within one game minute of the host at every frame (max ' + (mx * 60).toFixed(3) + ' min)');
  need(H.T.day === 1 && G1.T.day === 1 && G2.T.day === 1 && H.days === 0, 'rest sim: no day change');
  need(H.steps === G1.steps && H.steps === G2.steps && H.hours === G1.hours && H.hours === G2.hours, 'rest sim: crop (10-min) and animal (hourly) timers identical on host + 2 guests (' + H.steps + '/' + H.hours + ')');
  need(H.steps === Math.floor(H.T.hour * 6 + 1e-9) - Math.floor(hr0 * 6) && H.hours === Math.floor(H.T.hour) - Math.floor(hr0), 'rest sim: no timer skipped or double-counted (' + H.steps + ' steps)');
  need(G1.T.speed === 1 && H.T.hour > 19 && H.T.hour < 22, 'rest sim: speed back to normal after 19:00');
})();

var ix = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
need(ix.indexOf('js/sleep_vote.js') < ix.indexOf('js/rest.js') && ix.indexOf('js/rest.js') < ix.indexOf('js/avatars.js'), 'index order: rest.js after sleep_vote.js');
need(ix.indexOf('js/night.js') < ix.indexOf('js/sleep_vote.js') && ix.indexOf('js/sleep_vote.js') < ix.indexOf('js/avatars.js') && ix.indexOf('js/beds.js') < ix.indexOf('js/sleep_vote.js'), 'index order');
console.log(errs ? 'sleep_vote: ' + errs + ' FAILED' : 'sleep_vote: ok (' + n + ' checks; resting cases covered: 1 alone, 1/2 no accel, 2/2 accel, get-up stop same tick, flicker debounce, 3rd joins, disconnect recount, stale heartbeat 5 s, ends exactly 19:00, 60 s host+2 guests clocks/timers equal, no timer skipped/double)'); process.exit(errs ? 1 : 0);
