#!/usr/bin/env python3
"""Togie Valley - tools/icon_files_check.py: every icon referenced by index.html / manifest / sw.js exists with the right pixel size; Android mipmaps complete."""
import os, re, json, sys
from PIL import Image
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
rd = lambda f: open(os.path.join(R, f), encoding='utf8').read()
bad = []
want = {'icon-master-1024.png': 1024, 'icon-512.png': 512, 'icon-192.png': 192, 'icon-maskable-512.png': 512, 'icon-maskable-192.png': 192, 'apple-touch-icon.png': 180, 'favicon-32.png': 32}
for k, n in want.items():
    p = os.path.join(R, 'icons', k)
    if not os.path.exists(p) or Image.open(p).size != (n, n): bad.append('size/missing ' + k)
ico = Image.open(os.path.join(R, 'icons/favicon.ico'))
if not {(16, 16), (32, 32)} <= set(ico.info.get('sizes', ico.ico.sizes() if hasattr(ico, 'ico') else [])): bad.append('favicon.ico needs 16+32')
refs = [i['src'] for i in json.loads(rd('manifest.webmanifest'))['icons']]
refs += re.findall(r'href="(icons/[^"]+)"', rd('index.html')) + [m[1:-1] for m in re.findall(r"'icons/[^']+'", rd('sw.js'))]
for i in json.loads(rd('manifest.webmanifest'))['icons']:
    p = os.path.join(R, i['src'])
    if os.path.exists(p) and 'x'.join(map(str, Image.open(p).size)) != i['sizes']: bad.append('manifest size mismatch ' + i['src'])
for r in set(refs):
    if not os.path.exists(os.path.join(R, r)): bad.append('missing ref ' + r)
for d, m in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
    for f, n in (('ic_launcher', 48), ('ic_launcher_round', 48), ('ic_launcher_foreground', 108), ('ic_launcher_background', 108)):
        p = os.path.join(R, 'icons/android/mipmap-' + d, f + '.png')
        if not os.path.exists(p) or Image.open(p).size != (int(n * m),) * 2: bad.append('android ' + d + '/' + f)
print('icon_files_check: ' + ('FAIL ' + '; '.join(bad) if bad else 'OK (%d refs, web + 20 android)' % len(set(refs))))
sys.exit(1 if bad else 0)
