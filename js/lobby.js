/* Togie Valley - lobby.js (Stage 17, rebuilt Round 2 stage 5). Multiplayer onboarding: host card (code, copy, share, live count); HUD badge = person icon n/max (code is in Settings > Phòng),
 * join form (paste-friendly code), auto-retry while the relay wakes up (20 s), friendly errors, disconnect screens, first-join guide.
 * Game.Lobby { open(host, pickSlot(after, guestFn), back), exitRoom(), msg(reason) }. Depends on net.js, ui.js. Load before menus.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Net || !G.UI) { console.error('[lobby] missing deps'); return; }
  var Net = G.Net, UI = G.UI, MAX = 4, chip = null, MSGKEY = 'togie-valley/mp-msg', WAKE_MS = 20000;
  var MSG = {
    no_room: 'Mã phòng chưa đúng hoặc phòng đã đóng. Hãy kiểm tra lại mã với bạn của bạn nhé.',
    full: 'Phòng đã đầy (tối đa 4 người). Hãy thử lại sau nhé.',
    closed: 'Chủ phòng đã rời phòng.',
    offline: 'Không có mạng. Hãy bật Wi-Fi hoặc dữ liệu di động rồi thử lại.',
    slow: 'Chưa kết nối được máy chủ. Hãy kiểm tra mạng rồi bấm Thử lại.',
    unreachable: 'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.',
    not_set_up: 'Máy chủ nhiều người chơi chưa được thiết lập.'
  };
  function msg(r) { return MSG[r] || MSG.unreachable; }
  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function btn(label, parent, fn, cls) { var b = el('button', 'k-btn' + (/\bdanger\b/.test(cls || '') ? ' danger' : /\balt\b/.test(cls || '') ? ' secondary' : ''), parent, label); b.type = 'button'; b.addEventListener('click', function () { UI.sfx('tap'); fn(); }); return b; }
  function toast(m, ic) { if (UI.toast) UI.toast(m, ic); }
  function online() { return navigator.onLine !== false; }
  var SPIN = '<i class="mp-spin"></i> Đang kết nối...';

  /* ------------------------------------------------ HUD chip */
  var PERSON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.5 21c.6-4.6 4-7 8.5-7s7.9 2.4 8.5 7z" fill="currentColor"/></svg>';
  function chipText() { return PERSON + '<b>' + Net.count() + '/' + MAX + '</b>'; }   // HUD: people count only; the code lives in Settings > Phòng
  function updateChip() { if (chip) chip.innerHTML = chipText(); }
  function copy(text) {
    var ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); ok = true; } } catch (e) { /* fall through */ }
    if (!ok) {
      try { var t = el('textarea', null, document.body); t.value = text; t.style.cssText = 'position:fixed;left:-999px;top:0'; t.select(); ok = document.execCommand('copy'); document.body.removeChild(t); } catch (e2) { ok = false; }
    }
    return ok;
  }
  function copyCode() { toast(copy(Net.code) ? 'Đã chép mã phòng.' : 'Mã phòng: ' + Net.code, 'check'); }
  function shareCode() {
    var text = 'Vào nông trại Togie Valley của mình nhé! Mã phòng: ' + Net.code;
    if (navigator.share) { try { navigator.share({ title: 'Togie Valley', text: text }).catch(function () { /* cancelled */ }); return; } catch (e) { /* fall through */ } }
    toast(copy(text) ? 'Đã chép lời mời để bạn dán gửi bạn bè.' : 'Mã phòng: ' + Net.code, 'check');
  }
  function showChip() {
    var ui = document.getElementById('ui');
    if (chip || !ui || !Net.code) return;
    chip = el('button', 'mp-pop', ui, chipText()); chip.setAttribute('aria-label', 'Người chơi trong phòng');
    chip.addEventListener('click', function () { UI.sfx('tap'); if (UI.panelOpen || !G.Settings) return; G.Settings.show('room'); UI.openMenu('set'); });
  }
  function hideChip() { if (chip && chip.parentNode) chip.parentNode.removeChild(chip); chip = null; }
  ['net:ready', 'net:join', 'net:leave', 'net:ps'].forEach(function (t) { Net.on(t, updateChip); });

  /* ------------------------------------------------ connect with auto-retry (relay may be asleep) */
  function connectRetry(run, cb) {   // returns cancel(); 'unreachable' is retried for up to 20 s, then reported as 'slow'
    var t0 = Date.now(), dead = false, timer = 0;
    function attempt() {
      if (dead) return;
      if (!online()) { cb('offline'); return; }
      run(function (err, d) {
        if (dead) return;
        if (err === 'unreachable') {
          if (Date.now() - t0 < WAKE_MS) { timer = setTimeout(attempt, 1500); return; }
          err = 'slow';
        }
        cb(err, d);
      });
    }
    attempt();
    return function () { dead = true; clearTimeout(timer); };
  }

  /* ------------------------------------------------ in-game modal */
  function modal() {
    var wrap = el('div', 'mp-wrap', document.getElementById('ui') || document.body), card = el('div', 'mp-card tv-scroll', wrap);
    return { card: card, close: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, clear: function () { card.innerHTML = ''; } };
  }
  function toTitle() { try { G.Save.now(); } catch (e) { /* ignore */ } try { Net.leave(); } catch (e2) { /* ignore */ } location.reload(); }
  function errorCard(m, title, text, buttons) {
    m.clear(); el('h2', null, m.card, title); el('p', 'mp-msg err', m.card, text);
    buttons.forEach(function (b) { btn(b[0], m.card, b[1], b[2]); });
  }

  /* ------------------------------------------------ host */
  function hostFlow() {
    var m = modal(), cancel = null, iv = 0;
    function stop() { clearInterval(iv); if (cancel) cancel(); cancel = null; }
    function attempt() {
      stop(); m.clear(); el('h2', null, m.card, 'Tạo phòng'); el('p', 'mp-msg', m.card, SPIN);
      btn('Hủy', m.card, function () { stop(); Net.leave(); m.close(); }, 'alt');
      cancel = connectRetry(function (cb) { Net.hostRoom(cb); }, function (err) {
        cancel = null;
        if (err) { errorCard(m, 'Chưa tạo được phòng', msg(err), [['Thử lại', attempt], ['Chơi một mình', function () { Net.leave(); m.close(); }, 'alt'], ['Về màn hình chính', toTitle, 'alt']]); return; }
        showChip(); codeCard();
      });
    }
    function codeCard() {
      m.clear(); el('h2', null, m.card, 'Phòng của bạn đã mở!');
      el('p', 'mp-sub', m.card, 'Gửi mã này cho bạn bè để họ vào chơi cùng:');
      el('div', 'mp-big', m.card, Net.code);
      var row = el('div', 'mp-row', m.card);
      btn('Sao chép', row, copyCode);
      btn('Chia sẻ', row, shareCode, 'alt');
      var cnt = el('p', 'mp-count', m.card);
      function upd() { cnt.innerHTML = 'Trong phòng: <b>' + Net.count() + '/' + MAX + '</b> người'; }
      upd(); iv = setInterval(upd, 700);
      btn('Bắt đầu chơi', m.card, function () { stop(); m.close(); });
    }
    attempt();
  }

  /* ------------------------------------------------ disconnects */
  Net.on('net:closed', function (e) {
    var mode = Net.mode; if (mode === 'solo') return;
    try { G.Save.now(); } catch (err) { /* ignore */ }
    hideChip();
    var m = modal();
    if (mode === 'guest') {   // mode stays 'guest' so autosave never writes the host's world into the guest's slot
      var host = e && e.reason === 'host';
      errorCard(m, host ? 'Chủ phòng đã rời phòng' : 'Mất kết nối', host ? 'Buổi chơi chung đã kết thúc. Nông trại của bạn vẫn được lưu an toàn.' : 'Kết nối bị gián đoạn. Nông trại của bạn vẫn được lưu an toàn.', [['Về màn hình chính', toTitle]]);
    } else {
      Net.leave();
      errorCard(m, 'Mất kết nối', 'Phòng đã đóng. Nông trại của bạn vẫn được lưu an toàn.', [['Mở phòng lại', function () { m.close(); hostFlow(); }], ['Chơi một mình', m.close, 'alt'], ['Về màn hình chính', toTitle, 'alt']]);
    }
  });
  function exitRoom() { try { G.Save.now(); } catch (e) { /* ignore */ } Net.leave(); location.reload(); }
  G.Events.on('game:ready', function () {
    var r = null;
    try { r = sessionStorage.getItem(MSGKEY); sessionStorage.removeItem(MSGKEY); } catch (e) { /* ignore */ }
    if (r) setTimeout(function () { toast(msg(r), 'warn'); }, 1500);
  });

  function afterJoin() {
    if (Net.syncReady) Net.syncReady(); Net.live = true; showChip();
    if (Net.sendLook) Net.sendLook();
    if (G.LookUI && G.Look && !G.Look.chosen()) G.LookUI.open();   // guest's first join: choose an appearance
  }

  /* ------------------------------------------------ title choices (replace the main buttons in place) */
  function open(host, pickSlot, back) {
    var note = null, cancel = null;
    function say(t, err, html) { if (note) { if (html) note.innerHTML = t; else note.textContent = t || ''; note.className = 'mp-msg' + (err ? ' err' : ''); } }
    function tbtn(label, fn, cls) { return btn(label, host, fn, 'mn-btn ' + (cls || '')); }
    function leave() { if (cancel) cancel(); cancel = null; back(); }

    function home() {
      if (cancel) { cancel(); cancel = null; }
      host.innerHTML = '';
      var hn = el('input', 'mn-in', host); hn.maxLength = Net.NAME_MAX; hn.value = Net.savedName(); hn.autocomplete = 'off'; hn.placeholder = 'Tên hiển thị'; hn.setAttribute('aria-label', 'Tên hiển thị');
      tbtn('Tạo phòng', function () {
        Net.saveName(hn.value.trim() ? hn.value : Net.savedName());
        if (!Net.configured()) { say(msg('not_set_up'), true); return; }
        if (!online()) { say(msg('offline'), true); return; }
        pickSlot(hostFlow);
      });
      tbtn('Vào phòng', join, 'alt');
      note = el('p', 'mp-msg', host);
      tbtn('Quay lại', leave, 'alt');
    }

    function join() {
      host.innerHTML = '';
      var code = el('input', 'mp-code mn-in', host);
      code.autocomplete = 'off'; code.autocapitalize = 'characters'; code.spellcheck = false; code.placeholder = 'K7M2QX'; code.setAttribute('enterkeyhint', 'next'); code.setAttribute('aria-label', 'Mã phòng');
      var nm = el('input', 'mn-in', host); nm.maxLength = Net.NAME_MAX; nm.value = Net.savedName(); nm.autocomplete = 'off'; nm.placeholder = 'Tên hiển thị'; nm.setAttribute('aria-label', 'Tên hiển thị');
      note = el('p', 'mp-msg', host);
      if (!Net.configured()) say(msg('not_set_up'), true);
      code.addEventListener('input', function () { var v = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); if (v !== code.value) code.value = v; });   // paste "k7m-2qx " works
      var go = tbtn('Vào', function () {
        if (go.disabled) return;
        if (!Net.configured()) { say(msg('not_set_up'), true); return; }
        if (code.value.length !== 6) { say(msg('no_room'), true); return; }
        go.disabled = true; say(SPIN, false, true);
        cancel = connectRetry(function (cb) { Net.joinRoom(code.value, nm.value, cb); }, function (err) {
          cancel = null; go.disabled = false;
          if (err) { say(msg(err), true); go.textContent = 'Thử lại'; return; }
          pickSlot(afterJoin, function () { Net.leave(); });   // latest farm, or a silent guest profile
        });
      });
      tbtn('Quay lại', home, 'alt');
      setTimeout(function () { try { code.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    }
    home();
  }

  G.Lobby = { open: open, exitRoom: exitRoom, msg: msg, copyCode: copyCode, shareCode: shareCode };
})();
