/* Reel minigame simulation: human-like bot per fish type. Usage: node tools/reel_sim.js [touch|mouse] [trials] */
var C = require('../js/reel_core.js');
if (process.env.TUNE) { var TU = JSON.parse(process.env.TUNE); for (var k in TU) for (var f in TU[k]) require('../js/reel_core.js').TIERS[k][f] = TU[k][f]; }
var kind = process.argv[2] || 'touch', N = +process.argv[3] || 600, touch = kind === 'touch';
var seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function gauss() { return (rnd() + rnd() + rnd() - 1.5) * 1.1; }
var rods = { bamboo: 0.24, fiber: 0.28, carbon: 0.36 };
var TYPES = [
  { n: 'trash',  tier: 'trash',  diffs: [1], beh: ['smooth'], bar: 0.24, goal: 1.00 },
  { n: 'normal', tier: 'normal', diffs: [1, 1, 2, 2], beh: ['smooth', 'dart', 'mixed', 'sinker'], bar: 0.24, goal: 0.95 },
  { n: 'silver', tier: 'silver', diffs: [3], beh: ['dart', 'sinker'], bar: 0.28, goal: 0.80 },
  { n: 'gold',   tier: 'gold',   diffs: [4, 5, 4], beh: ['sinker', 'mixed', 'smooth'], bar: 0.28, goal: 0.55 }
];
/* Human-like bot: sees the fish with 150 ms delay + noise, decides every ~130 ms, 50 ms input latency, occasional attention lapses. */
function runBot(R, fps) {
  var dt = 1 / fps, t = 0, hist = [], held = false, cmd = false, cmdQ = [], nextDecide = 0, lapse = 0, res = null;
  while (!res && t < 80) {
    hist.push(R.fp); if (hist.length > 60) hist.shift();
    var obs = hist[Math.max(0, hist.length - 1 - Math.round(0.22 * fps))];
    if (t >= nextDecide) {
      nextDecide = t + 0.16 + rnd() * 0.08;
      if (lapse > 0) lapse -= 0.2;
      else if (rnd() < 0.08) lapse = 0.35 + rnd() * 0.4;
      else {
        var o = obs + gauss() * 0.04, center = R.bp + R.bh / 2, e = center + R.bv * 0.22 - o;
        var db = R.bh * 0.12;
        cmd = e < -db ? true : e > db ? false : (R.bv < -0.05 ? true : R.bv > 0.05 ? false : cmd);
      }
      cmdQ.push({ at: t + 0.05, v: cmd });
    }
    while (cmdQ.length && cmdQ[0].at <= t) held = cmdQ.shift().v;
    res = C.step(R, dt, held, rnd); t += dt;
  }
  return res === 'win';
}
console.log('input=' + kind + ' trials/type=' + N);
console.log('type     catch%  target  avg-time(s)');
TYPES.forEach(function (T) {
  var win = 0, i;
  for (i = 0; i < N; i++) {
    var R = C.make({ tier: T.tier, diff: T.diffs[i % T.diffs.length], beh: T.beh[i % T.beh.length], bar: T.bar, touch: touch }, rnd);
    if (runBot(R, i % 2 ? 60 : 30)) win++;
  }
  console.log((T.n + '        ').slice(0, 8) + ' ' + (100 * win / N).toFixed(0) + '%     ~' + (T.goal * 100).toFixed(0) + '%');
});
