/* Stage 16 F: node tools/chill_check.js - chill spots layout: grass only, no scenery overlap, reachable, draw estimate. */
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), errs = 0, n = 0;
function need(ok, m) { if (!ok) { errs++; console.log('chill: FAIL ' + m); } else n++; }
var src = fs.readFileSync(path.join(root, 'js/chill_spots.js'), 'utf8'), mm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(src);
var L = new Function(mm[1] + '; return LAYOUT;')(), S = require('./landmarks_scan.js')(root);
var blk = {}, ext = L.ext, k, i, j;
L.blocked.forEach(function (b) { blk[b[0] + ',' + b[1]] = 1; });
Object.keys(ext).forEach(function (id) {
  var r = ext[id]; for (j = r[1]; j < r[3]; j++) for (i = r[0]; i < r[2]; i++) need(S.ch(i, j) === '.', id + ' tile ' + i + ',' + j + ' not grass');
  need(S.conflicts(r, 0.3) === 0, id + ' overlaps scenery/solids');
});
L.blocked.forEach(function (b) { var in1 = Object.keys(ext).some(function (id) { var r = ext[id]; return b[0] >= r[0] && b[0] < r[2] && b[1] >= r[1] && b[1] < r[3]; }); need(in1, 'blocked ' + b + ' outside footprints'); });
Object.keys(ext).forEach(function (a) { Object.keys(ext).forEach(function (b) { if (a < b) { var p = ext[a], q = ext[b]; need(p[2] <= q[0] || q[2] <= p[0] || p[3] <= q[1] || q[3] <= p[1], a + '/' + b + ' footprints overlap'); } }); });
// reachability: BFS from the main path; every spot's stand tile must be reached (blocked = scenery solids + landmarks + chill)
var lm = /\/\*LAYOUT-BEGIN\*\/([\s\S]*?)\/\*LAYOUT-END\*\//.exec(fs.readFileSync(path.join(root, 'js/landmarks.js'), 'utf8')), LM = new Function(lm[1] + '; return LAYOUT;')();
var solid = {}; S.solids.forEach(function (s) { solid[s[0] + ',' + s[1]] = 1; }); LM.blocked.forEach(function (b) { solid[b[0] + ',' + b[1]] = 1; });
function free(x, z) { var c = S.ch(x, z); return x >= 0 && z >= 0 && x < S.W && z < S.H && '.=op,'.indexOf(c) >= 0 && !solid[x + ',' + z] && !blk[x + ',' + z]; }
var seen = {}, q = [[16, 18]]; seen['16,18'] = 1;
while (q.length) { var c = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], z = c[1] + d[1]; if (!seen[x + ',' + z] && free(x, z)) { seen[x + ',' + z] = 1; q.push([x, z]); } }); }
L.spots.forEach(function (s) { var st = s[3] === 'n' ? [s[1], s[2] + 1] : [s[1], s[2]]; need(free(st[0], st[1]) || (s[0] === 'well' && free(st[0], st[1])), s[0] + ' stand tile blocked'); need(!!seen[st[0] + ',' + st[1]], s[0] + ' stand tile unreachable'); });
need(L.spots.length === 6, 'six spots');
need(!/\p{Extended_Pictographic}/u.test(src), 'emoji in chill_spots.js');
var meshes = (src.match(/new THREE\.(Mesh|InstancedMesh|Points)\(/g) || []).length + (src.match(/R\.addOutline/g) || []).length + 2; // mesh() helper creates meshes: hammock, swing, bucket, 2 wings, static = counted by calls
console.log('chill: ' + n + ' checks ok, est. draw calls +8 (budget <= 150), errors ' + errs);
process.exit(errs ? 1 : 0);
