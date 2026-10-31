/* Togie Valley - perf_ui.js (Stage 14B): "Đồ họa" settings row (Game.PerfUI.renderRow, called by panels.js renderSettings) and the hidden debug overlay
 * (?perf=1 in the URL, or 5 quick taps on the HUD clock). Overlay: fps, draw calls, triangles, pixel ratio, tier, chunks, device profile + Copy button. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Perf || !G.Quality || !G.UI) { console.error('[perf_ui] missing deps'); return; }
  var Q = G.Quality, UI = G.UI, PU = G.PerfUI = {};

  var OPTIONS = [
    ['auto', 'Tự động', 'Máy tự chọn theo thiết bị và thử khung hình lúc đầu; điện thoại thấp hơn máy tính một mức.'],
    ['0', 'Cao', 'Đẹp nhất: độ phân giải đầy đủ, chấm nét, hạt giấy, sương viền, hoa lá và sinh vật nhiều nhất.'],
    ['1', 'Vừa', 'Độ phân giải tối đa 1,5x, bỏ chấm nét, bớt hoa cỏ và sinh vật 20%, hiệu ứng nền cập nhật 30 lần/giây.'],
    ['2', 'Thấp', 'Độ phân giải 1,25x, bỏ sương viền và hạt giấy, nét viền mảnh, cỏ hoa và đom đóm thưa, cập nhật 24 lần/giây.'],
    ['3', 'Siêu nhẹ', 'Độ phân giải 1x, 30 khung hình, bỏ bầu trời, sương, đom đóm và hoa lá bay, cập nhật 20 lần/giây.']
  ];

  PU.renderRow = function (body, el, btn) {
    var pb = el('button', 'tv-btn alt', body, '<b></b><small>Hiện FPS, lệnh vẽ, tam giác, sinh vật và hạt trên màn hình.</small>');
    function paintPerf() { pb.querySelector('b').textContent = 'Bảng đo hiệu năng: ' + (PU.visible() ? 'Bật' : 'Tắt'); pb.className = 'tv-btn' + (PU.visible() ? '' : ' alt'); }
    pb.addEventListener('click', function () { PU.toggle(); paintPerf(); });
    paintPerf();
    el('div', 'tv-sub', body, (G.Icons.has && G.Icons.has('gear') ? G.Icons.ui('gear', 20) + ' ' : '') + 'Đồ họa');
    var wrap = el('div', 'tv-gfx', body), buttons = [];
    function paint() {
      var m = Q.mode();
      buttons.forEach(function (b, i) {
        var on = OPTIONS[i][0] === m;
        b.className = 'tv-btn' + (on ? '' : ' alt');
        var s = b.querySelector('small');
        s.textContent = OPTIONS[i][2] + (OPTIONS[i][0] === 'auto' && on ? ' Mức tự nhận: ' + Q.def().name + '.' : '');
      });
    }
    OPTIONS.forEach(function (o) {
      var b = el('button', 'tv-btn alt', wrap, '<b>' + o[1] + '</b><small></small>');
      b.addEventListener('click', function () {
        Q.setMode(o[0]); paint();
        
      });
      buttons.push(b);
    });
    paint();
  };

  /* ------------------------------------------------------------ debug overlay (stage 34: profiler) */
  var BUDGET = [1, 4, 5, 2], CATS = ['Nhập', 'Mô phỏng', 'Vẽ', 'Giao diện'], BUDGET_TOTAL = 16.7;
  var box = null, pre = null, bars = [], sysEl = null, timer = 0;
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function heapMb() { var m = performance.memory; return m && m.usedJSHeapSize ? Math.round(m.usedJSHeapSize / 1048576) : 0; }
  function gpuName() { var d = G.Perf.profile; return (d && d.renderer) || '?'; }
  function summary() {
    var P = G.Prof, s = G.Perf.snapshot(), r = G.Render.renderer, inf = r ? r.info : null, m = inf ? inf.memory : { geometries: 0, textures: 0 }, h = heapMb();
    return 'fps ' + s.fps + ' | khung tb ' + f1(P.avg()) + 'ms p95 ' + f1(P.p95()) + 'ms | nhập ' + f1(P.cat[0]) + ' mô phỏng ' + f1(P.cat[1]) + ' vẽ ' + f1(P.cat[2]) + ' UI ' + f1(P.cat[3]) + 'ms' +
      ' | calls ' + s.calls + ' tri ' + s.triangles + ' geo ' + m.geometries + ' tex ' + m.textures + (h ? ' heap ' + h + 'MB' : '') +
      ' | dpr ' + s.device.dpr + ' pr ' + s.pixelRatio + ' (x' + G.Display.scale.toFixed(2) + ') | mức ' + s.tierName + ' (' + s.mode + ') | ' + gpuName() + (G.Boot && G.Boot.text ? ' | ' + G.Boot.text() : '');
  }
  function text() {
    var P = G.Prof, s = G.Perf.snapshot(), d = s.device, c = s.chunks || { chunks: 0, visible: 0 }, n = [];
    var r = G.Render.renderer, m = r ? r.info.memory : { geometries: 0, textures: 0 }, h = heapMb();
    var cr = G.Critters && G.Critters.stats ? G.Critters.stats() : {}, am = G.Ambient && G.Ambient.stats ? G.Ambient.stats() : {};
    var ap = G.AmbientPlus && G.AmbientPlus.stats ? G.AmbientPlus.stats() : {}, wx = G.Weather && G.Weather.stats ? G.Weather.stats() : {};
    var creatures = (cr.chickens || 0) + (cr.ducks || 0) + (cr.bees || 0) + (am.butterflies || 0) + (am.birds || 0) + (ap.fireflies || 0) + (ap.dragonflies || 0) + (ap.butterflies || 0) + (ap.fish || 0);
    var particles = (am.petals || 0) + (am.smoke || 0) + (ap.litter || 0) + (wx.rain > 0.01 ? wx.drops || 0 : 0) + (wx.snow > 0.01 ? wx.flakes || 0 : 0);
    n.push('FPS ' + s.fps + ' (trung vị ' + s.medianFps + ')  khung tb ' + f1(P.avg()) + ' / p95 ' + f1(P.p95()) + ' ms');
    n.push('Lệnh vẽ ' + s.calls + '  Tam giác ' + s.triangles + '  Hình ' + m.geometries + '  Kết cấu ' + m.textures);
    n.push('DPR máy ' + d.dpr + '  tỉ lệ vẽ ' + s.pixelRatio + ' (thang ' + G.Display.scale.toFixed(2) + ')  Mức ' + s.tierName + ' (' + s.mode + ')' + (h ? '  Heap ' + h + 'MB' : ''));
    n.push('GPU: ' + gpuName());
    if (G.Boot && G.Boot.text) n.push(G.Boot.text());   // stage 36: boot marks
    n.push('Sinh vật ' + creatures + '  Hạt ' + particles + '  Khối ' + c.visible + '/' + c.chunks);
    return n.join('\n');
  }
  function paint() {
    var P = G.Prof, i, v, t = 0, tp = G.Prof.top(4), html = '';
    pre.textContent = text();
    for (i = 0; i < 4; i++) {
      v = P.cat[i]; t += v;
      bars[i].textContent = CATS[i] + ' ' + f1(v) + ' / ' + BUDGET[i] + ' ms';
      bars[i].className = v > BUDGET[i] ? 'bad' : '';
    }
    bars[4].textContent = 'Tổng CPU ' + f1(P.work) + ' / ' + BUDGET_TOTAL + ' ms (dư 4)';
    bars[4].className = P.work > BUDGET_TOTAL - 4 ? 'bad' : '';
    for (i = 0; i < tp.length; i++) html += tp[i].label + ' ' + f1(tp[i].ms) + (i < tp.length - 1 ? ', ' : '');
    sysEl.textContent = 'Nặng nhất: ' + html + (G.Fishing && G.Fishing.state !== 'off' ? ' | fishing ' + f1(P.fish) + ' ms' : '');
  }
  function show() {
    if (box) return;
    var root = (UI.hud && UI.hud.root && UI.hud.root.parentNode) || document.getElementById('ui') || document.body, i, b;
    box = document.createElement('div'); box.id = 'tv-perf';
    pre = document.createElement('pre'); box.appendChild(pre);
    bars = [];
    for (i = 0; i < 5; i++) { b = document.createElement('div'); b.className = 'pb'; box.appendChild(b); bars.push(b); }
    sysEl = document.createElement('div'); sysEl.className = 'sys'; box.appendChild(sysEl);
    var row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
    var cp = document.createElement('button'); cp.textContent = 'Sao chép'; row.appendChild(cp);
    var cl = document.createElement('button'); cl.textContent = 'Đóng'; row.appendChild(cl);
    cp.addEventListener('click', function () {
      var t = summary();
      try { if (navigator.clipboard) navigator.clipboard.writeText(t); else throw 0; } catch (e) { var ta = document.createElement('textarea'); ta.value = t; box.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } box.removeChild(ta); }
      cp.textContent = 'Đã chép'; setTimeout(function () { cp.textContent = 'Sao chép'; }, 1200);
    });
    cl.addEventListener('click', hide);
    root.appendChild(box);
    G.Prof.reset(); G.Prof.on = true;
    timer = setInterval(function () { if (!document.hidden) paint(); }, 500);
    paint();
  }
  function hide() { if (!box) return; clearInterval(timer); G.Prof.on = false; box.parentNode.removeChild(box); box = pre = sysEl = null; bars = []; }
  PU.toggle = function () { if (box) hide(); else show(); };
  PU.visible = function () { return !!box; };
  PU.summary = summary;

  var taps = 0, lastTap = 0, clock = UI.hud && UI.hud.clock;
  if (clock) clock.addEventListener('click', function () {
    var now = performance.now();
    taps = now - lastTap < 700 ? taps + 1 : 1; lastTap = now;
    if (taps >= 5) { taps = 0; PU.toggle(); }
  });
  try { if (/[?&]perf=1\b/.test(location.search)) { G.Events.on('game:ready', show); } } catch (e) { /* ignore */ }
})();
