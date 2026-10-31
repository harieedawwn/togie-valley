#!/usr/bin/env node
/* Togie Valley - tools/bump_version.js (Round 2 stage 1). Bumps VERSION 'tv-vN' in sw.js, js/version.js (window.TV_BUILD), ?v=BUILD on every js/css/vendor URL in index.html and writes version.json
 * {version, build, minNative, apkUrl}. Usage: node tools/bump_version.js [--min-native N] [--repo OWNER/REPO]
 * minNative = the lowest native shell build (APK versionCode) that can still play; raise it only when the APK itself must be reinstalled. */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.resolve(__dirname, '..'), swP = path.join(root, 'sw.js'), vjP = path.join(root, 'version.json');
function arg(n) { var i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; }
var sw = fs.readFileSync(swP, 'utf8'), m = /var VERSION = 'tv-v(\d+)';/.exec(sw), verP = path.join(root, 'js', 'version.js'), idxP = path.join(root, 'index.html');
if (!m) { console.error('bump_version FAILED: VERSION not found in sw.js'); process.exit(1); }
var old = {};
try { old = JSON.parse(fs.readFileSync(vjP, 'utf8')); } catch (e) { /* first run */ }
var build = Math.max(parseInt(m[1], 10), old.build || 0) + 1;   // one source of truth: highest build seen anywhere, plus one
var minN = arg('--min-native') != null ? parseInt(arg('--min-native'), 10) : (old.minNative || 1);
var repo = arg('--repo') || process.env.GITHUB_REPOSITORY || '';
var apk = repo ? 'https://github.com/' + repo + '/releases/download/latest/Togie_Valley.apk' : (old.apkUrl || '');
fs.writeFileSync(swP, sw.replace(m[0], "var VERSION = 'tv-v" + build + "';"));
fs.writeFileSync(verP, '/* Togie Valley - version.js: single source of the running build, written by tools/bump_version.js. Loads first. */\nwindow.TV_BUILD = ' + build + ';\n');
var ix = fs.readFileSync(idxP, 'utf8').replace(/(src|href)="((?:js|css|vendor)\/[^"?]+)(?:\?v=\d+)?"/g, '$1="$2?v=' + build + '"');   // cache-busting URLs
fs.writeFileSync(idxP, ix);
fs.writeFileSync(vjP, JSON.stringify({ version: 'tv-v' + build, build: build, minNative: minN, apkUrl: apk }, null, 2) + '\n');
console.log('bumped to tv-v' + build + ' (minNative ' + minN + ')');
