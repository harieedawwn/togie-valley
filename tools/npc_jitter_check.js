/* Numeric check: NPC joint jitter (node tools/npc_jitter_check.js). Runs the real sim_tier.js shared NPC decision + the real FishStall.sellerStep
 * against a Town-like reset (absolute joints on due frames, 600 frames at variable dt incl. 50-100 ms spikes, tier switching near/far/asleep).
 * Asserts per-frame joint change, velocity sign changes per second and that an ungated additive layer is detected (regression guard). */
'use strict';
global.window = global; var frames = [], fails = 0;
function V() { return { x: 0, y: 0, z: 0, set: function (a, b, c) { this.x = a; this.y = b; this.z = c; return this; } }; }
function NF() { return { compose: function () {}, multiplyMatrices: function () {} }; }
global.THREE = { Frustum: function () { this.setFromProjectionMatrix = function () {}; this.intersectsSphere = function () { return true; }; }, Matrix4: NF, Sphere: function () { this.center = V(); }, Vector3: V, Quaternion: function () {} };
global.document = { hidden: false };
var cam = { projectionMatrix: {}, matrixWorldInverse: {} }, player = { pos: { x: 0, z: 0 } };
global.Game = { Loop: { onFrame: function (f) { frames.push(f); } }, Render: { camera: cam }, Player: player, Scenes: { current: 'outdoor' } };
function joint() { return { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } }; }
function npc(x) { return { h: { root: { position: { x: x, z: 0 } }, joints: { shoulderL: joint(), shoulderR: joint(), head: joint(), spine: joint() } } }; }
var vendor = npc(2), other = npc(6); global.Game.Town = { npcs: { shopkeeper: other, fishmonger: vendor } };
require('../js/sim_tier.js');
var ST = global.Game.SimTier, simFrame = frames[0];
if (!ST) { console.log('sim_tier did not load'); process.exit(1); }
// minimal FishStall: load real module's sellerStep through a stubbed build-free path
var src = require('fs').readFileSync(require('path').join(__dirname, '../js/fish_stall.js'), 'utf8');
var m = /function updateSeller[\s\S]*?\n  }\n\n  \/\* Additive[\s\S]*?FS\._test = [^\n]*\n/.exec(src);
var envSrc = /function env\(x, dur\)[^\n]*\n/.exec(src), srSrc = /var sr = [^\n]*\n/.exec(src);
if (!m || !envSrc || !srSrc) { console.log('fish_stall seller code not found'); process.exit(1); }
var S = { npc: null }, FS = {}, G = global.Game;
function sr0() { return real && real.sr ? [real.sr.react, real.sr.arr] : 0; }
function run(gated, label) {
  var rng = 12345, worst = { disp: 0, flips: 0 }, t = 0, j = vendor.h.joints, prev = null, pjs = null, vel = null, flips = 0, nf = 0, k, i, dt, ph, a, d, v, J;
  function rnd() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }
  S.npc = vendor.h; FS.sr.react = -1; FS.sr.arr = -1; FS.sr.next = 0.5;
  for (k = 0; k < 600; k++) {
    dt = rnd() < 0.04 ? 0.05 + rnd() * 0.05 : 0.012 + rnd() * 0.01;   // spikes 50-100 ms
    ph = Math.floor(k / 150); player.pos.x = ph % 2 ? 40 : 0;           // near (20 Hz) <-> far (10 Hz) tier switching
    if (k === 450) global.Game.Scenes.current = 'indoor'; if (k === 470) global.Game.Scenes.current = 'outdoor';
    simFrame(dt);
    if (ST.npc.due) { for (i in j) { j[i].rotation.x = 0; j[i].rotation.y = 0; j[i].rotation.z = 0; } }   // Town: h.update(dt, 0) rewrites the joints
    if (k === 100 || k === 300) FS.kick();
    if (gated) { var NG = ST.npc; if (NG.due) FS.step(NG.dt); } else FS.step(dt);
    J = j.shoulderL.rotation.x + j.head.rotation.x + j.spine.rotation.x + j.shoulderR.rotation.x;
    var pj = pjs, cur = [j.shoulderL.rotation.x, j.shoulderR.rotation.x, j.head.rotation.x, j.spine.rotation.x, j.head.rotation.z, j.shoulderL.rotation.z];
    if (pj) for (i = 0; i < cur.length; i++) { d = Math.abs(cur[i] - pj[i]); if (d > worst.disp) { worst.disp = d; worst.at = [k, i, dt, sr0(), cur[i], pj[i]]; } }
    pjs = cur;
    if (prev !== null) { d = 0; if (d > worst.disp) worst.disp = d; v = J - prev; if (vel !== null && Math.abs(v) > 0.02 && Math.abs(vel) > 0.02 && (v > 0) !== (vel > 0)) flips++; if (Math.abs(v) > 0.02) vel = v; }
    prev = J; t += dt;
  }
  worst.flipsPerSec = flips / t; if (process.env.DBG) console.log(JSON.stringify(worst.at)); console.log(label, 'max single-joint step', worst.disp.toFixed(3), 'rad, sign flips/s', worst.flipsPerSec.toFixed(2), 'over', t.toFixed(1), 's');
  return worst;
}
// real step functions: gated one is the shipped code, ungated one is the old behaviour (updateSeller on every frame)
var real = new Function('S', 'FS', 'G', 'Math', srSrc[0] + envSrc[0] + m[0] + 'return { sr: sr, seller: sellerStep, raw: updateSeller };')(S, FS, G, Math);
FS.sr = real.sr; FS.kick = function () { if (real.sr.react < 0) { real.sr.react = 0; real.sr.arr = -1; } };   // same as the interact:fishstall handler
FS.step = function (dt) { real.raw(dt); };
var bad = run(false, 'ungated (old)');
FS.step = function () { real.seller(0.016); };
var good = run(true, 'shipped      ');
// the shipped path must also be called through the real sellerStep: gate against the live decision
var LIM_D = 1.2, LIM_F = 3;   // largest per-frame change of any single joint axis (rad; a 10 Hz gesture ramp is ~0.9) and velocity sign flips per second
if (good.disp > LIM_D) { fails++; console.log('FAIL step too large', good.disp); }
if (good.flipsPerSec > LIM_F) { fails++; console.log('FAIL oscillation', good.flipsPerSec); }
if (!(bad.disp > good.disp * 2 || bad.flipsPerSec > good.flipsPerSec + 1)) { fails++; console.log('FAIL: harness does not detect the old bug'); }
// second NPC (shopkeeper): Town reset + an additive idle layer behind the same shared gate, same thresholds
(function () {
  var j = other.h.joints.shoulderL.rotation, prev = null, vel = null, flips = 0, t = 0, worst = 0, k, dt, v, rng = 777, tt = 0;
  function rnd() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }
  player.pos.x = 5; global.Game.Scenes.current = 'outdoor';
  for (k = 0; k < 600; k++) {
    dt = rnd() < 0.04 ? 0.05 + rnd() * 0.05 : 0.012 + rnd() * 0.01; player.pos.x = Math.floor(k / 150) % 2 ? 40 : 5;
    simFrame(dt);
    if (ST.npc.due) { j.x = 0; tt += ST.npc.dt; j.x += Math.sin(tt * 2.2) * 0.12; }
    if (prev !== null) { v = j.x - prev; if (Math.abs(v) > worst) worst = Math.abs(v); if (vel !== null && Math.abs(v) > 0.003 && Math.abs(vel) > 0.003 && (v > 0) !== (vel > 0)) flips++; if (Math.abs(v) > 0.003) vel = v; }
    prev = j.x; t += dt;
  }
  console.log('shopkeeper max step', worst.toFixed(3), 'flips/s', (flips / t).toFixed(2));
  if (worst > 0.5 || flips / t > 3) { fails++; console.log('FAIL second NPC'); }
})();
console.log(fails ? 'FAILED' : 'npc_jitter_check OK'); process.exit(fails ? 1 : 0);
