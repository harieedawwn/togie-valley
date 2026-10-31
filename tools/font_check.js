#!/usr/bin/env node
/* Togie Valley - tools/font_check.js (Round 3 stage 26). Reports any CSS selector or inline style (js/*.js, index.html) whose font stack is
 * missing or different from the game tokens, plus the font plumbing (@font-face, preload, font-display, root tokens, body rule).
 * Allowed family values: inherit, var(--font-ui|--font-display|--font-body|--font-d ...). Canvas ctx.font strings are counted, not checked.
 * Usage: node tools/font_check.js  (exit 1 on any error) */
'use strict';
var fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..'), errors = 0;
function rd(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function err(m) { errors++; console.log('ERROR   ' + m); }
var TOKEN = /var\(\s*--font-(ui|display|body|d)\b/;

function okFamily(v) { v = v.trim(); return v === 'inherit' || TOKEN.test(v) || (/monospace\s*$/.test(v) && !/Google Sans|Baloo/.test(v)); }   // debug-only mono stacks are allowed
function checkDecl(where, text) {
  var re = /(?:^|[;{\s"'])(font-family|font)\s*:\s*([^;}"'`]*(?:\([^)]*\)[^;}"'`]*)*)/g, m, fam, sz;
  while ((m = re.exec(text))) {
    if (m[1] === 'font-family') fam = m[2];
    else {
      if (/^(inherit|initial|unset|caption|menu)\b/.test(m[2].trim()) || TOKEN.test(m[2])) continue;
      sz = /\d(?:px|rem|em|%|pt)(?:\/[0-9.a-z]+)?\s+(.+)$/.exec(m[2].replace(/clamp\([^)]*\)/g, '1px'));
      if (!sz) { err(where + ': font shorthand without a family: ' + m[2].trim()); continue; }
      fam = sz[1];
      if (fam.trim() === 'inherit') { err(where + ': invalid shorthand "' + m[2].trim() + '" (inherit is not a family; browser drops the whole declaration)'); continue; }
    }
    if (!okFamily(fam)) err(where + ': font stack not from tokens: ' + fam.trim());
  }
}

// 1. css files
var css = fs.readdirSync(path.join(root, 'css')).filter(function (f) { return /\.css$/.test(f); }), n = 0, all = '';
css.forEach(function (f) {
  var s = rd('css/' + f).replace(/\/\*[\s\S]*?\*\//g, ''), re = /([^{}]+)\{([^{}]*)\}/g, m;
  all += s;
  while ((m = re.exec(s))) {
    if (/@font-face/.test(m[1])) continue;
    if (/font(-family)?\s*:/.test(m[2])) { n++; checkDecl('css/' + f + ' [' + m[1].trim().split('\n').pop().trim().slice(0, 60) + ']', m[2]); }
  }
});
// 2. inline styles + canvas fonts in js / index.html
var canvas = 0, inl = 0;
fs.readdirSync(path.join(root, 'js')).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return 'js/' + f; }).concat(['index.html']).forEach(function (f) {
  rd(f).split('\n').forEach(function (line, i) {
    if (/\.font\s*=/.test(line)) { canvas++; return; }
    if (/font(-family)?\s*:/.test(line) && /(cssText|style\s*=|style=|<style|\.style\b|'[^']*\{[^']*font)/.test(line + ' ')) { inl++; checkDecl(f + ':' + (i + 1), line); }
    else if (/fontFamily\s*=/.test(line) && !TOKEN.test(line) && !/inherit/.test(line)) err(f + ':' + (i + 1) + ': style.fontFamily without tokens');
  });
});
// 3. plumbing
var ui = rd('css/ui.css'), st = rd('css/style.css'), idx = rd('index.html'), kit = rd('css/ui_kit.css');
if (!/--font-ui\s*:/.test(ui) || !/--font-display\s*:/.test(ui)) err('css/ui.css :root must define --font-ui and --font-display');
var fonts = fs.readdirSync(path.join(root, 'fonts')).filter(function (f) { return /\.(woff2?|ttf|otf)$/.test(f); });
if (!fonts.length) err('no font files in fonts/');
fonts.forEach(function (f) {
  if (st.indexOf('fonts/' + f) < 0) err('fonts/' + f + ' has no @font-face in css/style.css');
  if (!new RegExp('rel="preload"[^>]*fonts/' + f.replace('.', '\\.') + '[^>]*crossorigin|rel="preload"[^>]*crossorigin[^>]*fonts/' + f.replace('.', '\\.')).test(idx)) err('fonts/' + f + ' not preloaded (as=font crossorigin) in index.html');
});
if (!/@font-face[^}]*font-display:\s*swap/.test(st)) err('@font-face without font-display: swap');
if (!/(html,\s*body|body)\s*\{[^}]*font-family:\s*var\(--font-ui\)/.test(kit)) err('css/ui_kit.css: body font-family token rule missing');
if (!/button,\s*input,\s*select,\s*textarea\s*\{[^}]*font-family:\s*inherit/.test(kit)) err('css/ui_kit.css: form controls must inherit the font');
console.log('font_check: ' + css.length + ' css files (' + n + ' font blocks), ' + inl + ' inline style lines, ' + canvas + ' canvas font strings (not CSS, skipped), ' + fonts.length + ' font file(s)');
console.log(errors ? errors + ' error(s)' : 'font_check: OK');
process.exit(errors ? 1 : 0);
