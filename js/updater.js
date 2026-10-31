/* Togie Valley - updater.js (Round 2 stage 1): in-app update check. Fetches version.json (no-store) on boot and on every app resume.
 * Newer build -> panel "Co ban cap nhat moi" (clear caches, unregister SW, reload). minNative above the shell's -> panel to open apkUrl.
 * Shown only while the title screen or the pause menu is open, never during a minigame. BUILD = window.TV_BUILD (js/version.js, written by tools/bump_version.js). */
(function () {
  'use strict';
  var G = window.Game;
  if (!G) { console.error('[updater] missing deps'); return; }
  var BUILD = parseInt(window.TV_BUILD, 10) || 0, GUARD_KEY = 'tv-upd-target', GUARD_MS = 600000;
  var U = G.Updater = { build: BUILD, latest: 0, pending: null, waiting: false };
  var shellBuild = 0, panel = null, dismissed = '', busy = false, timer = null, infoEl = null;

  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* ignore */ }
    return null;
  }
  /* Pure compare: running build vs version.json. guard = {build, t} left by apply(). Stale page after applying (server/CDN still old) -> waiting, silent for 10 minutes. */
  U.decide = function (running, v, guard, now, native, shell) {
    if (!v) return { pending: null, waiting: false, clear: false };
    if (native && v.minNative > shell && shell > 0) return { pending: { kind: 'native', key: 'n' + v.minNative }, waiting: false, clear: false };
    if (v.build > running) {
      if (guard && guard.build >= v.build && now - guard.t < GUARD_MS) return { pending: null, waiting: true, clear: false };
      return { pending: { kind: 'web', key: 'w' + v.build }, waiting: false, clear: false };
    }
    return { pending: null, waiting: false, clear: !!guard };
  };
  U.apply = function (target, done) {   // unregister SW, delete caches, reload with a fresh query string
    ss(GUARD_KEY, JSON.stringify({ build: target, t: Date.now() }));
    return clean().then(function () { var u = location.pathname + '?r=' + Date.now(); if (done) done(u); else location.replace(u); });
  };
  function refreshInfo() {
    if (!infoEl) return;
    if (!infoEl.isConnected) { infoEl = null; return; }
    infoEl.textContent = 'Bản đang chạy: ' + BUILD + ' · Bản mới nhất: ' + (U.latest || '?') + (U.waiting ? ' · Đang chờ máy chủ cập nhật' : '');
  }
  U.renderRow = function (body, el) { infoEl = el('div', 'tv-sub', body, ''); infoEl.className = 'tv-sub k-upd-info'; refreshInfo(); check(); };

  function apkUrl(v) {
    if (v && v.apkUrl) return v.apkUrl;
    var m = /^([^.]+)\.github\.io$/.exec(location.hostname), repo = location.pathname.split('/')[1];
    return m && repo ? 'https://github.com/' + m[1] + '/' + repo + '/releases/download/latest/Togie_Valley.apk' : '';
  }
  function check() {
    if (busy || !navigator.onLine) return;
    busy = true;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (v) {
      busy = false;
      if (!v) return;
      var g = null; try { g = JSON.parse(ss(GUARD_KEY) || 'null'); } catch (e) { g = null; }
      var d = U.decide(BUILD, v, g, Date.now(), !!(G.Native && G.Native.isNative), shellBuild);
      if (d.clear) ss(GUARD_KEY, null);
      U.latest = v.build; U.waiting = d.waiting; U.pending = d.pending;
      if (U.pending && U.pending.kind === 'native') U.pending.url = apkUrl(v);
      if (U.pending) U.pending.target = v.build;
      refreshInfo(); poll();
    }).catch(function () { busy = false; });
  }
  function clean() {
    var p = [];
    try { if (window.caches) p.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('tv-') === 0; }).map(function (k) { return caches.delete(k); })); })); } catch (e) { /* ignore */ }
    try { if (navigator.serviceWorker) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) { /* ignore */ }
    return Promise.all(p).catch(function () {});
  }
  function close() { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }
  function show(p) {
    if (panel) return;
    var host = document.getElementById('ui') || document.body;
    panel = document.createElement('div');
    panel.className = 'k-ui k-card k-upd';
    var t = document.createElement('div'), b = document.createElement('button'), x = document.createElement('button');
    t.textContent = p.kind === 'native' ? 'Cần cài lại ứng dụng' : 'Có bản cập nhật mới!';
    var s = document.createElement('div'); s.className = 'k-upd-sub';
    s.textContent = p.kind === 'native' ? 'Bản ứng dụng này đã cũ. Tải bản mới rồi bấm Cài đặt nhé.' : 'Bấm cập nhật để chơi bản mới nhất.';
    b.textContent = p.kind === 'native' ? 'Tải bản mới' : 'Cập nhật ngay';
    x.textContent = 'Để sau';
    [b, x].forEach(function (e) { e.type = 'button'; e.className = 'k-btn' + (e === b ? '' : ' secondary'); });
    b.onclick = function () {
      if (p.kind === 'native') { if (p.url) window.open(p.url, '_system'); return; }
      b.disabled = true; b.textContent = 'Đang cập nhật...';
      U.apply(p.target || U.latest);
    };
    x.onclick = function () { dismissed = p.key; close(); };
    t.className = 'k-upd-t'; var bar = document.createElement('div'); bar.className = 'k-upd-bar'; bar.appendChild(b); bar.appendChild(x);
    panel.appendChild(t); panel.appendChild(s); panel.appendChild(bar); host.appendChild(panel);
  }
  function poll() {
    var p = U.pending;
    if (!p) { close(); return; }
    if (p.key === dismissed) return;
    var ok = !!(document.getElementById('tv-title') || document.querySelector('.mn-pause'));
    if (ok) show(p); else close();
  }
  function start() {
    check();
    if (!timer) timer = setInterval(poll, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    try {
      var A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (A && A.addListener) A.addListener('appStateChange', function (st) { if (st && st.isActive) check(); });
    } catch (e) { /* ignore */ }
  }
  try {
    var A0 = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A0 && A0.getInfo) A0.getInfo().then(function (i) { shellBuild = parseInt(i && i.build, 10) || 0; check(); }).catch(function () {});
  } catch (e) { /* ignore */ }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
