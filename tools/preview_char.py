#!/usr/bin/env python3
"""Togie Valley - tools/preview_char.py (stage 15A). Character preview without a browser.
Runs tools/preview_char.js (merged geometry -> JSON), rasterises with a z-buffer + lambert shading and writes PNG contact sheets.
Usage: python3 tools/preview_char.py [outdir]   (default outdir: preview_out). Needs numpy + Pillow (pip install --break-system-packages numpy pillow).
Exit 1 if the game-camera top-down view shows a skin patch on the crown of any hair style without a hat."""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'preview_out'
CELL = 240 if len(sys.argv) > 2 and sys.argv[2] in ('presets', 'gait') else 200
SKIN = np.array([0xf6 / 255, 0xcf / 255, 0xa8 / 255])
# (label, yaw deg, pitch deg); yaw 0 = camera on the +z side (character faces +z). Game camera: indoor pitch 58, outdoor 52.
VIEWS = [('front', 0, 8), ('three-quarter', 40, 18), ('side', 90, 8), ('top 58 front', 0, 58), ('top 58 back', 180, 58), ('top 52 side', 90, 52)]


def render(g, yaw, pitch, size=CELL, dist=3.4, cy=0.62):
    P = np.array(g['pos'], np.float64).reshape(-1, 3); C = np.array(g['col'], np.float64).reshape(-1, 3)
    I = np.array(g['idx'], np.int64).reshape(-1, 3)
    ctr = np.array([0, cy, 0.0]); y, p = math.radians(yaw), math.radians(pitch)
    fwd = np.array([-math.sin(y) * math.cos(p), -math.sin(p), -math.cos(y) * math.cos(p)])   # camera looks toward the target
    cam = ctr - fwd * dist
    up0 = np.array([0, 1.0, 0]); right = np.cross(fwd, up0); right /= np.linalg.norm(right); up = np.cross(right, fwd)
    rel = P - cam; x = rel @ right; yv = rel @ up; z = rel @ fwd
    f = (size / 2) / math.tan(math.radians(34) / 2)   # game fov (34); the camera is moved closer so the character fills the cell
    sx = size / 2 + x / z * f; sy = size / 2 - yv / z * f
    img = np.zeros((size, size, 3)) + np.array([0.80, 0.86, 0.90]); zb = np.full((size, size), 1e9); skin = np.zeros((size, size), bool)
    light = np.array([0.35, 0.8, 0.45]); light /= np.linalg.norm(light)
    for t in I:
        a, b, c = t
        x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if area >= -1e-9: continue   # back-face cull (screen-space winding, y down)
        n = np.cross(P[b] - P[a], P[c] - P[a]); ln = np.linalg.norm(n)
        if ln < 1e-12: continue
        n /= ln
        sh = 0.55 + 0.45 * max(0.0, float(n @ light)); sh = 1.0 if sh > 0.85 else (0.78 if sh > 0.68 else 0.62)
        xa, xb = max(int(math.floor(min(x0, x1, x2))), 0), min(int(math.ceil(max(x0, x1, x2))), size - 1)
        ya, yb = max(int(math.floor(min(y0, y1, y2))), 0), min(int(math.ceil(max(y0, y1, y2))), size - 1)
        if xb < xa or yb < ya: continue
        gx, gy = np.meshgrid(np.arange(xa, xb + 1) + 0.5, np.arange(ya, yb + 1) + 0.5)
        w0 = ((x1 - gx) * (y2 - gy) - (x2 - gx) * (y1 - gy)) / area
        w1 = ((x2 - gx) * (y0 - gy) - (x0 - gx) * (y2 - gy)) / area
        w2 = 1 - w0 - w1
        m = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)   # tiny tolerance: no pin-holes between shared edges
        if not m.any(): continue
        zz = 1.0 / (w0 / z[a] + w1 / z[b] + w2 / z[c])   # perspective-correct depth
        sub = zb[ya:yb + 1, xa:xb + 1]; upd = m & (zz < sub)
        if not upd.any(): continue
        sub[upd] = zz[upd]
        col = (C[a] + C[b] + C[c]) / 3
        img[ya:yb + 1, xa:xb + 1][upd] = col * sh
        # crown skin test: keep the LAST winner per pixel (later triangles overwrite earlier ones), so only visible fragments count
        wy = (w0 * P[a][1] + w1 * P[b][1] + w2 * P[c][1])
        isskin = bool(np.abs(col - SKIN).max() < 0.02)
        skin[ya:yb + 1, xa:xb + 1][upd] = False
        if isskin: skin[ya:yb + 1, xa:xb + 1][upd & (wy > g['crownY'])] = True
    return img, int(skin.sum())


def main():
    os.makedirs(OUT, exist_ok=True)
    js = os.path.join(OUT, 'preview_char.json')
    subprocess.check_call(['node', os.path.join(HERE, 'preview_char.js'), js])
    chars = json.load(open(js)); bad = []
    pre = [c for c in chars if c.get('kind') == 'preset']
    if len(sys.argv) > 2 and sys.argv[2] == 'presets':   # stage 16: contact sheets of the 12 outfits (4 x 3 grid), one image per view
        for lab, yaw, pitch, dist, cy in (('front', 35, 16, 2.45, 0.6), ('back', 200, 22, 2.45, 0.6), ('head', 25, 30, 1.45, 0.88)):
            sh = Image.new('RGB', (CELL * 4, CELL * 3), (255, 255, 255))
            for n, g in enumerate(pre):
                g['crownY'] = 9e9
                img, _ = render(g, yaw, pitch, CELL, dist, cy); sh.paste(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), ((n % 4) * CELL, (n // 4) * CELL))
            fn = os.path.join(OUT, 'presets_%s.png' % lab); sh.save(fn); print('wrote', fn)
        return
    if len(sys.argv) > 2 and sys.argv[2] == 'gait':   # stage 17: contact sheets of the walk cycle (6 frames) and the fishing cast (4 frames), side view
        fr = os.path.join(OUT, 'frames_in.json'); subprocess.check_call(['node', os.path.join(HERE, 'anim_sample.js'), '--frames', fr])
        subprocess.check_call(['node', os.path.join(HERE, 'preview_char.js'), js, fr]); sh = json.load(open(os.path.join(OUT, 'preview_char_frames.json')))
        for kind, n in (('walk', 6), ('cast', 4)):
            sheet = Image.new('RGB', (CELL * n, CELL), (255, 255, 255))
            for k, g in enumerate(sh[kind]):
                g['crownY'] = 9e9; img, _ = render(g, 90, 6, CELL, 2.9, 0.42); sheet.paste(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), (k * CELL, 0)); print(kind, k + 1, g['label'])
            fn = os.path.join(OUT, 'sheet_%s.png' % kind); sheet.save(fn); print('wrote', fn)
        return
    for hat in (False, True):
        rows = [c for c in chars if c['hat'] == hat]
        sheet = Image.new('RGB', (CELL * len(VIEWS), CELL * len(rows)), (255, 255, 255))
        for r, g in enumerate(rows):
            ys = g['pos'][1::3]; g['crownY'] = max(ys) - 0.07 if not hat else 9e9   # hat rows: no crown test (hat covers)
            line = []
            for k, (lab, yaw, pitch) in enumerate(VIEWS):
                img, nskin = render(g, yaw, pitch)
                sheet.paste(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), (k * CELL, r * CELL))
                line.append('%s:%d' % (lab, nskin))
                if lab.startswith('top') and nskin > 0: bad.append('%s %s skin px=%d' % (g['name'], lab, nskin))
            print('%-12s crown skin px  %s' % (g['name'], '  '.join(line)))
        fn = os.path.join(OUT, 'sheet_hat.png' if hat else 'sheet_nohat.png'); sheet.save(fn); print('wrote', fn)
    if bad:
        print('SKIN PATCH:', *bad, sep='\n  '); sys.exit(1)
    print('OK: no crown skin patch in any top-down view')


main()
