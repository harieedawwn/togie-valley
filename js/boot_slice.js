/* Togie Valley - boot_slice.js (Round 3 stage 36): boot marks + time-sliced startup.
 * Loads right after errors.js (before any game module) so the marks cover script download/parse too.
 * Game.Boot { marks[], mark(name), slice(steps, onDone, onFail), steps[], longest, budget, text() }
 *  - mark(name): performance.now() since navigation start (also performance.mark('tv:name')); printed in the ?perf overlay (perf_ui.js).
 *  - slice(steps, onDone, onFail): steps = [[name, fn], ...] run in order in chunks of ~budget ms (8); between chunks the main thread yields
 *    through a MessageChannel task so the splash / boot diorama keep painting and taps keep working. A throwing step stops the run (onFail).
 *  - A step whose fn returns true is resumable (called again until it returns anything else); long builds are split this way (DetailExtra, Town).
 *  - Per-step cost is kept in steps[] ({n, ms}); longest = the longest single chunk (a step is the finest unit, so one step can exceed budget).
 */
(function () {
  'use strict';
  var G = window.Game = window.Game || {};
  var hasPerf = typeof performance !== 'undefined' && performance.now;
  function now() { return hasPerf ? performance.now() : Date.now(); }
  var B = G.Boot = { marks: [], steps: [], budget: 8, longest: 0, chunks: 0, done: false };

  B.mark = function (name) {
    var t = Math.round(now());
    B.marks.push({ n: name, t: t });
    try { if (hasPerf && performance.mark) performance.mark('tv:' + name); } catch (e) { /* ignore */ }
    return t;
  };
  B.mark('boot_slice');

  var chan = null, queue = null;
  function yieldTask(fn) {
    queue = fn;
    if (chan === null) {
      try { chan = new MessageChannel(); chan.port1.onmessage = function () { var f = queue; queue = null; if (f) f(); }; } catch (e) { chan = false; }
    }
    if (chan) chan.port2.postMessage(0); else setTimeout(function () { var f = queue; queue = null; if (f) f(); }, 0);
  }

  var splashTxt = null;
  function paintProgress(i, n) {
    var sp = document.getElementById('tv-splash');
    if (!sp || !sp.parentNode) return;
    if (!splashTxt) splashTxt = sp.querySelector('.sp-txt');
    if (splashTxt) splashTxt.textContent = 'Đang dựng nông trại... ' + Math.min(100, Math.round(i * 100 / n)) + '%';
  }

  B.slice = function (steps, onDone, onFail) {
    var i = 0, n = steps.length, acc = 0;
    function chunk() {
      var t0 = now(), t1 = t0, ok = true;
      while (i < n && t1 - t0 < B.budget) {
        var s = steps[i], a = now(), more;
        try { more = s[1](); } catch (err) { console.error('[boot] step "' + s[0] + '" failed', err); ok = false; if (onFail) onFail(s[0], err); return; }
        t1 = now(); acc += t1 - a;
        if (more === true) continue;   // resumable step (returns true while work is left): same step again, within budget or after the next yield
        B.steps.push({ n: s[0], ms: Math.round(acc * 10) / 10 });
        acc = 0; i++;
      }
      B.chunks++;
      if (t1 - t0 > B.longest) B.longest = Math.round((t1 - t0) * 10) / 10;
      if (i < n) { paintProgress(i, n); yieldTask(chunk); return; }
      B.done = true; B.mark('built');
      if (ok && onDone) onDone();
    }
    B.mark('build_start');
    yieldTask(chunk);   // first yield lets the splash paint before the first chunk
  };

  function at(name) { var k; for (k = B.marks.length - 1; k >= 0; k--) if (B.marks[k].n === name) return B.marks[k].t; return 0; }
  /* One overlay line: scripts parsed -> built -> ready -> first frame (ms since navigation start), longest chunk, slowest steps. */
  B.text = function () {
    var s = B.steps.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, 3), i, top = '';
    for (i = 0; i < s.length; i++) top += (i ? ', ' : '') + s[i].n + ' ' + s[i].ms;
    return 'Khởi động ms: mã ' + at('main') + ' | dựng ' + at('built') + ' | sẵn sàng ' + at('ready') + ' | khung đầu ' + at('frame1') +
      ' | chunk dài nhất ' + B.longest + ' (' + B.chunks + ' chunk)' + (top ? ' | nặng: ' + top : '');
  };
})();
