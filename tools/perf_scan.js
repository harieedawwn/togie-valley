#!/usr/bin/env node
/* Togie Valley - tools/perf_scan.js (Stage 34). Static scan for per-frame allocations: object / array literals, closures, THREE and typed-array
 * constructors, and array-returning calls (map/filter/slice/concat/split) inside update-style functions (update*, animate*, tick*, frame*, draw*,
 * and inline callbacks of Loop.onUpdate / Loop.onFrame). Prints the worst files and the first sites; exits 1 when a THREE constructor is found
 * (the clear cases). Heuristic: strings and comments are blanked first; rare false positives are listed, not fatal. Usage: node tools/perf_scan.js [-v] */
'use strict';
var fs = require('fs'), path = require('path');
var dir = path.resolve(__dirname, '..', 'js'), verbose = process.argv.indexOf('-v') >= 0;
var HEAD = /function\s+((?:update|animate|tick|frame|draw|onFrame|step)\w*)\s*\([^)]*\)\s*\{|\.(onUpdate|onFrame)\(\s*function\s*\w*\s*\([^)]*\)\s*\{|\b(\w*(?:update|animate|tick|frame)\w*)\s*[:=]\s*function\s*\w*\s*\([^)]*\)\s*\{/g;
var KINDS = [
  ['THREE', /new THREE\.\w+\(/g, true], ['typed', /new (?:Float32|Float64|Uint8|Uint16|Uint32|Int8|Int16|Int32)Array\(/g, false], ['new Array', /new Array\(/g, false],
  ['array', /(?:[=(,:]|return)\s*\[(?!\s*\w+\s*\])/g, false], ['object', /(?:[=(,]|return)\s*\{(?!\s*\})/g, false], ['closure', /\bfunction\s*\w*\s*\(/g, false],
  ['array call', /\.(?:map|filter|slice|concat|split|keys|values)\(/g, false]
];
function blank(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); }).replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, function (m) { return "''" + m.slice(2).replace(/[^\n]/g, ' '); });
}
var files = [], hard = 0, total = 0;
fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) {
  var raw = fs.readFileSync(path.join(dir, f), 'utf8'), s = blank(raw), m, sites = [], n = 0;
  HEAD.lastIndex = 0;
  while ((m = HEAD.exec(s))) {
    var start = HEAD.lastIndex, i = start, d = 1, name = m[1] || m[2] || m[3];
    while (i < s.length && d > 0) { var ch = s[i++]; if (ch === '{') d++; else if (ch === '}') d--; }
    var body = s.slice(start, i), base = s.slice(0, start).split('\n').length;
    KINDS.forEach(function (k) {
      var rx = new RegExp(k[1].source, 'g'), x;
      while ((x = rx.exec(body))) {
        var line = base + body.slice(0, x.index).split('\n').length - 1;
        sites.push({ line: line, kind: k[0], fn: name, hard: k[2], text: raw.split('\n')[line - 1].trim().slice(0, 90) });
        if (k[2]) hard++;
        n++;
      }
    });
  }
  total += n;
  if (n) files.push({ f: f, n: n, sites: sites });
});
files.sort(function (a, b) { return b.n - a.n; });
files.slice(0, verbose ? 99 : 12).forEach(function (r) {
  var by = {}; r.sites.forEach(function (x) { by[x.kind] = (by[x.kind] || 0) + 1; });
  console.log(('  ' + r.f + '                        ').slice(0, 26) + String(r.n).padStart(4) + '  ' + Object.keys(by).map(function (k) { return k + ' ' + by[k]; }).join(', '));
  r.sites.filter(function (x) { return x.hard; }).concat(verbose ? r.sites.filter(function (x) { return !x.hard; }) : []).slice(0, 6).forEach(function (x) { console.log('      ' + r.f + ':' + x.line + ' [' + x.kind + '] in ' + x.fn + ': ' + x.text); });
});
console.log('perf_scan: ' + total + ' allocation site(s) in update-style functions across ' + files.length + ' file(s), ' + hard + ' THREE constructor(s) (must be 0)');
process.exit(hard ? 1 : 0);
