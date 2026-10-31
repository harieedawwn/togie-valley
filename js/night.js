/* Togie Valley - night.js (Round 3 stage 5): late-night exhaustion and fainting. Also require()-able in node (pure core, tools/energy_night_check.js).
 * From 02:00 (hour 26) energy drains at rate = energy-at-02:00 / (29.4 - hour) per game hour, so the bar hits 0 by about 05:24 whatever it started at (other costs add on top).
 * Toast + a vignette that grows as energy falls. Energy 0 (or the clock reaching 06:00) -> faint: BedSleep.faint clip, fade out, then
 *  - before 02:00 and with 3 h to spare: same day, +3 h, 30 % energy, wake in a free sleep spot (House.wakeQuick);
 *  - otherwise: Day.sleep('faint') = next morning 06:00, 30 % energy, summary line (house.js wake path).
 * Game.Night {core, fainting(), faint(), wakeFaint(), endFaint()}. Connected (Net.live): no clock pause or skip, bed + wake by js/sleep_vote.js; guests drain and faint too. Loads after bed_sleep.js.
 */
(function (root) {
  'use strict';
  var NC = { START: 26, TARGET: 29.4 };
  NC.make = function () {
    var st = { armed: false, rate: 0, acc: 0, e0: 0 };
    st.arm = function (hour, energy) { st.armed = true; st.acc = 0; st.e0 = energy; st.rate = energy / Math.max(0.1, NC.TARGET - Math.max(hour, NC.START)); };
    st.disarm = function () { st.armed = false; st.acc = 0; };
    st.tick = function (dH) { var n; st.acc += st.rate * dH; n = Math.floor(st.acc + 1e-9); st.acc -= n; return n; };   // whole energy points to drain now
    st.vignette = function (energy) { var d = Math.max(st.e0, energy); return d > 0 ? Math.max(0, Math.min(1, 1 - energy / d)) : 1; };
    return st;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NC;
  if (typeof window === 'undefined' || !window.Game) return;

  var G = window.Game;
  if (!G.Time || !G.State || !G.UI || !G.Player || !G.House || !G.BedSleep || !G.Day || !G.Loop || !G.Events) { console.error('[night] missing dependencies'); return; }
  var T = G.Time, S = G.State, UI = G.UI, P = G.Player, H = G.House, BS = G.BedSleep, core = NC.make(), N = G.Night = { core: NC };
  var fainting = false, fmp = false, limit = false, lastH = T.hour, shown = 0, vig = document.createElement('div');

  vig.id = 'tv-night-vig';
  vig.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;transition:opacity .6s linear;background:radial-gradient(ellipse at 50% 50%,rgba(20,12,40,0) 36%,rgba(20,12,40,.5) 72%,rgba(10,5,26,.92) 100%)';
  (document.getElementById('ui') || document.body).appendChild(vig);
  function setVig(k) { k = Math.round(k * 50) / 50; if (k === shown) return; shown = k; vig.style.opacity = String(k * 0.9); }

  N.fainting = function () { return fainting; };
  function free() { return !fainting && !P.isLocked() && !UI.panelOpen && !H.busy() && !document.getElementById('tv-title'); }

  N.faint = function () {
    var done = false, ready = !!BS.ready();
    if (fainting) return;
    fainting = true; limit = false;
    fmp = !!(G.SleepVote && G.SleepVote.multi());   // connected: the clock keeps running for the others
    if (P.sitting) P.standUp();
    P.stop(); P.lock('sleep'); if (!fmp) T.pause('faint');
    function dark() { if (done) return; done = true; H.fadeTo(true, 600, wake); }
    if (ready) { BS.faint(function () { setTimeout(dark, 500); }); setTimeout(dark, 5000); } else dark();
  };
  /* Connected: lie in a bed the host gave us; the host wakes us after 3 game hours or at the day roll (sleep_vote.js). */
  function wakeMP() {
    core.disarm(); setVig(0);
    G.SleepVote.faintBed(function (ok) {
      if (ok) { H.lieStay(); return; }
      fmp = false; fainting = false; S.setEnergy(S.maxEnergy * 0.3); H.wakeQuick();   // no free spot: get up where we are
    });
  }
  N.wakeFaint = function () {
    if (!fainting || !fmp) return;
    fainting = false; fmp = false; S.setEnergy(S.maxEnergy * 0.3);
    UI.toast('Bạn ngất đi và tỉnh lại sau vài giờ.', 'energy');
    BS.out(function () { P.unlock('sleep'); });
  };
  N.endFaint = function () { fainting = false; fmp = false; core.disarm(); setVig(0); };   // the day rolled while fainted: the summary takes over
  function wake() {
    var h = T.hour;
    if (fmp) { wakeMP(); return; }
    T.resume('faint');
    core.disarm(); setVig(0);
    if (h + 3 < T.DAY_END) {                                  // same day, a few hours later
      T.setHour(h + 3);
      S.setEnergy(S.maxEnergy * 0.3);
      H.wakeQuick();
      UI.toast('Bạn ngất đi và tỉnh lại sau vài giờ.', 'energy');
      fainting = false;
    } else {                                                  // the night is over: next morning, summary with the penalty line
      fainting = false;
      if (!G.Day.sleep('faint')) { S.setEnergy(S.maxEnergy * 0.3); H.wakeQuick(); }
    }
  }
  G.Events.on('time:limit', function () { limit = true; });

  G.Loop.onUpdate(function () {
    var h = T.hour, dH = h - lastH, n;
    lastH = h;
    if (document.getElementById('tv-title')) { setVig(0); return; }
    if (h < NC.START) { if (core.armed) core.disarm(); setVig(0); }
    else if (!fainting && !(G.SleepVote && G.SleepVote.inBed())) {
      if (!core.armed) { core.arm(h, S.energy); UI.toast('Bạn buồn ngủ quá, hãy về nhà ngủ', 'energy'); }
      if (dH > 0 && dH < 0.5) { n = core.tick(dH); if (n > 0 && S.energy > 0) S.setEnergy(Math.max(0, S.energy - n)); }
      setVig(core.vignette(S.energy));
    }
    if ((limit || S.energy <= 0) && free()) N.faint();
  }, -40);
})(typeof window !== 'undefined' ? window : this);
