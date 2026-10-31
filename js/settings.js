/* Togie Valley - settings.js (Round 3 stage 7): tabbed Settings body. Game.Settings { addTab(id, label, renderFn(body, el, btn)), show(id), current() }.
 * Built-in tabs: sound, display, controls, room, data, about. addTab with an existing id appends the function to that tab.
 * Called by panels.js renderSettings (lazy, so load order only needs it before first use). Depends on ui.js, icons.js. Load after updater.js. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.UI || !G.Icons) { console.error('[settings] missing deps'); return; }
  var UI = G.UI, Icons = G.Icons, S = G.Settings = {}, cur = 'sound', tabs = [], host = null;
  var MAX = 4;

  function el(tag, cls, parent, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; if (parent) parent.appendChild(n); return n; }
  function btn(label, parent, fn, cls) { var b = el('button', 'k-btn' + (cls === 'danger' ? ' danger' : cls === 'alt' ? ' secondary' : ''), parent, label); b.type = 'button'; b.addEventListener('click', function () { UI.sfx('tap'); fn(); }); return b; }
  function has(n) { return Icons.has ? Icons.has(n) : true; }
  function ico(n, s) { return has(n) ? Icons.ui(n, s) + ' ' : ''; }
  function find(id) { for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i]; return null; }

  S.addTab = function (id, label, fn) {
    var t = find(id);
    if (!t) { t = { id: id, label: label, fns: [] }; tabs.push(t); }
    if (fn) t.fns.push(fn);
    return t;
  };
  S.current = function () { return cur; };
  S.show = function (id) { if (find(id)) cur = id; if (host && host.isConnected) S.render(host); };

  /* ------------------------------------------------ tab contents */
  function sound(body) {
    var A = G.Audio, K = G.Kit;
    [['master', 'Tổng âm lượng', 'volume', null], ['music', 'Nhạc nền', 'volume', null], ['sfx', 'Hiệu ứng', 'volume', 'plant'], ['ambience', 'Âm thanh môi trường', 'volume', null]].forEach(function (d) {
      var row = el('div', 'st-row', body, '<div class="tv-sub">' + ico(d[2], 20) + d[1] + '</div>'), rng = K ? K.slider({ min: 0, max: 100, value: Math.round((A ? A.getBusVolume(d[0]) : 1) * 100), label: d[1] }) : el('input', null, null);
      if (!K) { rng.type = 'range'; rng.min = 0; rng.max = 100; rng.value = Math.round((A ? A.getBusVolume(d[0]) : 1) * 100); }
      row.appendChild(rng);
      if (!A) { rng.disabled = true; return; }
      rng.addEventListener('input', function () { var v = rng.value / 100; A.setBusVolume(d[0], v); if (d[0] === 'sfx') A.setBusVolume('ui', v); });
      rng.addEventListener('change', function () { if (d[3]) A.play(d[3]); else if (d[0] === 'master') UI.sfx('pop'); });
    });
    var mrow = el('div', 'st-row st-switch', body, '<div class="tv-sub">' + ico('volume', 20) + 'Tắt tiếng</div>');
    if (K) mrow.appendChild(K.toggle({ on: !!(A && A.muted), label: 'Tắt tiếng', onChange: function (v) { if (!A) return; A.setMuted(v); if (!v) UI.sfx('pop'); } }));
  }
  function display(body) {
    if (G.PerfUI) G.PerfUI.renderRow(body, el, btn);   // Đồ họa + bảng đo hiệu năng
    if (G.UiScale) G.UiScale.renderRow(body, el, btn);   // Cỡ giao diện
    if (G.Render && G.Render.setPaper) {   // Hạt giấy: Tắt | Nhẹ
      var pr = el('div', 'tv-row st-split', body, '<div class="tv-sub" style="flex:1 0 100%">Hạt giấy</div>'), pb = [];
      var sync = function () { pb.forEach(function (b) { b.b.classList.toggle('secondary', G.Render.paperLow() !== b.low); b.b.setAttribute('aria-pressed', G.Render.paperLow() === b.low ? 'true' : 'false'); }); };
      [['Tắt', false], ['Nhẹ', true]].forEach(function (d) { var b = btn(d[0], pr, function () { G.Render.setPaper(d[1]); sync(); }); pb.push({ b: b, low: d[1] }); });
      sync();
    }
  }
  function controls(body) {
    if (G.Joystick) G.Joystick.renderRow(body, el, btn);   // Kiểu điều khiển
    if (G.CameraAuto) G.CameraAuto.renderRow(body, el, btn);   // Camera
  }
  function room(body) {
    var Net = G.Net, L = G.Lobby;
    if (Net && Net.bindNameInput) { el('div', 'tv-sub', body, 'Tên hiển thị'); Net.bindNameInput(el('input', 'tv-name', body)); }
    if (!Net || !Net.code || Net.mode === 'solo') {
      el('div', 'tv-tip', body, '<b>' + ico('friends', 22) + 'Bạn đang chơi một mình</b>Muốn chơi cùng bạn bè? Quay về màn hình chính (Dữ liệu &gt; Đổi nông trại), bấm <b style="display:inline">Chơi cùng bạn</b> rồi <b style="display:inline">Tạo phòng</b>. Bạn bè sẽ nhập mã phòng để vào cùng.');
      return;
    }
    el('div', 'tv-sub', body, Net.isHost ? 'Mã phòng của bạn' : 'Bạn đang ở phòng');
    el('div', 'st-code', body, Net.code);
    var cnt = el('div', 'st-count', body);
    cnt.innerHTML = 'Trong phòng: <b>' + Net.count() + '/' + MAX + '</b> người';
    var pg = el('div', 'st-count', body);
    function showPing() {
      var v = Net.ping ? Net.ping() : -1;
      pg.innerHTML = Net.isHost ? 'Bạn là chủ phòng' : 'Độ trễ: <b>' + (v >= 0 ? Math.round(v) + ' ms' : 'đang đo…') + '</b>';
      if (!pg.isConnected && pg.parentNode === null) clearInterval(pt);
    }
    var pt = setInterval(function () { if (!document.body.contains(pg)) { clearInterval(pt); return; } showPing(); }, 1000);
    showPing();
    var row = el('div', 'tv-row st-split', body);
    btn('Sao chép', row, function () { if (L && L.copyCode) L.copyCode(); });
    btn('Chia sẻ', row, function () { if (L && L.shareCode) L.shareCode(); }, 'alt');
  }
  function data(body) {
    el('div', 'tv-sub', body, 'Mã lưu');
    var ta = el('textarea', 'tv-ta', body); ta.setAttribute('placeholder', 'Dán mã lưu vào đây để nhập');
    var row = el('div', 'tv-row', body);
    btn('Xuất mã', row, function () {
      ta.value = G.Save.exportCode(); ta.select();
      try { if (navigator.clipboard) navigator.clipboard.writeText(ta.value); } catch (e) { /* ignore */ }
      UI.toast('Mã lưu đã sẵn sàng để sao chép.', 'check');
    }, 'alt');
    btn('Nhập mã', row, function () {
      if (G.Dev && ta.value.trim() === 'toiladevbakhi') { G.Dev.toggle(); ta.value = ''; return; }   // hidden dev switch, never a save code
      if (!ta.value.trim()) { UI.toast('Hãy dán mã lưu trước nhé.', 'warn'); return; }
      UI.confirm({ title: 'Nhập mã lưu?', text: 'Việc này sẽ thay thế game hiện tại của bạn.', yes: 'Nhập', no: 'Hủy' }, function (ok) {
        if (!ok) return;
        if (G.Save.importCode(ta.value)) { UI.closeAll(); UI.toast('Đã nhập mã lưu!', 'check'); }
        else UI.toast('Mã này có vẻ chưa đúng.', 'warn');
      });
    });
    var row2 = el('div', 'tv-row', body);
    if (G.SaveSlots) btn('Đổi nông trại', row2, function () { G.SaveSlots.backToTitle(); }, 'alt');
    btn('Game mới', row2, function () {
      UI.confirm({ title: 'Bắt đầu game mới?', text: 'Tiến trình hiện tại sẽ bị xóa.', yes: 'Game mới', no: 'Chơi tiếp' }, function (ok) {
        if (ok) { UI.closeAll(); G.Save.newGame(); UI.toast('Khởi đầu mới nào!', 'sprout'); }
      });
    }, 'danger');
  }
  function about(body) {
    el('div', 'tv-sub', body, 'Togie Valley');
    el('div', 'tv-ctl-desc', body, 'Phiên bản: ' + (window.TV_BUILD ? 'tv-v' + window.TV_BUILD : '?'));
    if (G.Updater && G.Updater.renderRow) G.Updater.renderRow(body, el);   // bản đang chạy vs bản mới nhất + kiểm tra cập nhật
    if (G.Tutorial && !document.getElementById('tv-title')) G.Tutorial.renderRow(body, el, btn);   // Hướng dẫn
    el('div', 'tv-sub', body, 'Lời cảm ơn');
    el('div', 'tv-ctl-desc', body, 'Togie Valley là nông trại nhỏ ấm áp, làm bằng Three.js. Cảm ơn bạn đã chơi và cùng bạn bè chăm vườn!');
  }

  S.addTab('sound', 'Âm thanh', sound); S.addTab('display', 'Hiển thị', display); S.addTab('controls', 'Điều khiển', controls);
  S.addTab('room', 'Phòng', room); S.addTab('data', 'Dữ liệu', data); S.addTab('about', 'Giới thiệu', about);

  /* ------------------------------------------------ render */
  S.render = function (body) {
    host = body; body.innerHTML = '';
    var bar = el('div', null, body), box = el('div', 'st-body tv-scroll', body), title = !!document.getElementById('tv-title'), list = tabs.filter(function (t) { return !(title && (t.id === 'room' || t.id === 'data')); });   // no running game on the title
    if (title && cur !== 'sound' && !list.some(function (t) { return t.id === cur; })) cur = 'sound';
    if (!list.some(function (t) { return t.id === cur; })) cur = list[0].id;
    var tb = G.Kit.tabs(list.map(function (t) { return { id: t.id, label: t.label }; }), cur, function (id) { cur = id; S.render(body); });
    bar.parentNode.replaceChild(tb.el, bar); bar = tb.el; body.insertBefore(bar, box);
    var t = find(cur) || list[0];
    t.fns.forEach(function (fn) { try { fn(box, el, btn); } catch (e) { console.error('[settings] tab ' + t.id, e); } });
  };
})();
