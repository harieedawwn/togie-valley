/* Togie Valley - tools/serve.js (Round 5 S1): zero-dependency static server for the game folder.
 * Usage: node tools/serve.js [--port 8080]
 * No-cache headers (edits show on reload), binds 0.0.0.0 and prints the localhost + LAN URLs (open the LAN one on a phone on the same Wi-Fi).
 * Exports start(port, cb) for tools/shot.js. */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

var ROOT = path.resolve(__dirname, '..');
var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.wasm': 'application/wasm'
};

function lanIps() {
  var out = [], nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) {
    (nets[k] || []).forEach(function (n) { if ((n.family === 'IPv4' || n.family === 4) && !n.internal) out.push(n.address); });
  });
  return out;
}

function handler(req, res) {
  var url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  var file = path.normalize(path.join(ROOT, url));
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(file, function (err, st) {
    if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); st = null; }
    fs.readFile(file, function (e2, buf) {
      var h = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0' };
      if (e2) { h['Content-Type'] = 'text/plain; charset=utf-8'; res.writeHead(404, h); res.end('404 ' + url); return; }
      h['Content-Type'] = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      h['Content-Length'] = buf.length;
      res.writeHead(200, h);
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
}

function start(port, cb) {
  var srv = http.createServer(handler);
  srv.on('error', function (e) { if (cb) cb(e); else { console.error('[serve] ' + e.message); process.exit(1); } });
  srv.listen(port, '0.0.0.0', function () { if (cb) cb(null, srv); });
  return srv;
}

if (require.main === module) {
  var i = process.argv.indexOf('--port'), port = i > 0 ? +process.argv[i + 1] || 8080 : 8080;
  start(port, function (err) {
    if (err) { console.error('[serve] cannot listen on ' + port + ': ' + err.message); process.exit(1); }
    console.log('Togie Valley served from ' + ROOT);
    console.log('  Local: http://localhost:' + port + '/');
    lanIps().forEach(function (ip) { console.log('  LAN:   http://' + ip + ':' + port + '/   (phone on the same Wi-Fi)'); });
    console.log('  Dev: ?dev=1   Perf overlay: ?perf=1   Shot mode: ?shot=1');
  });
}

module.exports = { start: start, ROOT: ROOT };
