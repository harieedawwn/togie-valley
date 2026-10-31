#!/usr/bin/env python3
"""Togie Valley - tools/render_icon_character.py (stage ICON 1). Post step of render_icon_character.js: premultiplied downsample (no halo),
character.png / character_mask.png / candidates.png. Usage: python3 -I render_icon_character.py outDir pick outSize"""
import os, shutil, sys
from PIL import Image
out, pick, N = sys.argv[1], sys.argv[2], int(sys.argv[3])
raw = os.path.join(out, '_raw')

def down(im, n):   # premultiplied resize: transparent pixels never bleed colour into the edge
    return im.convert('RGBa').resize((n, n), Image.LANCZOS).convert('RGBA')

hero = down(Image.open(os.path.join(raw, pick + '.png')), N)
a = hero.getchannel('A').point(lambda v: 0 if v < 3 else v)   # drop faint noise alpha
r, g, b, _ = hero.split()
hero = Image.merge('RGBA', (r, g, b, a)); hero.save(os.path.join(out, 'character.png'), optimize=True)
white = Image.new('L', (N, N), 255)
Image.merge('RGBA', (white, white, white, a)).save(os.path.join(out, 'character_mask.png'), optimize=True)
sheet = Image.new('RGBA', (1024, 256), (255, 241, 208, 255))
for i, k in enumerate('ABCD'):
    sheet.alpha_composite(down(Image.open(os.path.join(raw, k + '.png')), 256), (i * 256, 0))
sheet.convert('RGB').save(os.path.join(out, 'candidates.png'), optimize=True)
shutil.rmtree(raw)
print('wrote character.png', hero.size, 'mask, candidates')
