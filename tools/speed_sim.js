/* Stage 17 BUGFIX c: node tools/speed_sim.js - distance in 5 s of full deflection (keyboard / joystick / tap-to-move) at 30-144 Hz within 1%.
 * Replays core.js's fixed-step accumulator (1/60, maxSubSteps 5) around the real js/move_speed.js. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('speed: FAIL ' + m); } else n++; }
var MS = require(path.join(root, 'js/move_speed.js')), core = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), pl = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
need(/fixedStep:\s*1 \/ 60/.test(core) && /maxSubSteps:\s*5/.test(core), 'core.js loop is fixed-step 1/60');
need(/MS\.stick\(m\)/.test(pl) && /MS\.tap\(tapMode, rem\)/.test(pl) && /MS\.ease\(P\.speed, want, dt\)/.test(pl) && !/SPRINT\s*=\s*5/.test(pl), 'player.js uses the shared speed table');
var sources = { keyboard: function () { return MS.keyboard(); }, joystick: function () { return MS.stick(1); }, 'tap-to-move': function () { return MS.tap(2, 20); } };
var base = null;
Object.keys(sources).forEach(function (name) {
  [30, 60, 90, 120, 144].forEach(function (hz) {
    var step = 1 / 60, acc = 0, speed = 0, dist = 0, t = 0, fdt = 1 / hz, want = sources[name]();
    while (t < 5 - 1e-9) {
      t += fdt; acc += fdt; var k = 0;
      while (acc >= step - 1e-12 && k < 5) { speed = MS.ease(speed, want, step); dist += speed * step; acc -= step; k++; }
      if (acc >= step) acc = 0;
    }
    if (base === null) base = dist;
    need(Math.abs(dist - base) / base < 0.01, name + ' @' + hz + 'Hz distance ' + dist.toFixed(3) + ' vs ' + base.toFixed(3));
  });
});
need(MS.stick(1) === MS.keyboard() && MS.stick(0.95) <= MS.RUN + 1e-9, 'full stick == keyboard speed, never above run');
need(MS.tap(3, 20) === MS.tap(2, 20), 'triple tap no faster than run');
console.log('speed: ' + n + ' checks ok, ' + errs + ' failed (5 s reference distance ' + base.toFixed(2) + ' tiles)'); process.exit(errs ? 1 : 0);
