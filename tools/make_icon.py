#!/usr/bin/env python3
"""Togie Valley - tools/make_icon.py (Round 3, stage 38). Pure Pillow + numpy, no network, no external art.
Layered "clay toy" art: Togie (nón lá, big glossy eyes, blush) with a watering can on a floating grass island,
sunflower, cottage, sun and clouds. Every part = dark-brown outline + soft top-left key light gradient + shade band
(ambient occlusion) + cool rim light + optional gloss. Rendered once at 2048 px (4x of 512) and downsampled.
Outputs (all derived from the same art):
  icons/favicon.ico (16+32), favicon-32.png, apple-touch-icon.png (180, opaque), icon-192/512.png,
  icon-maskable-192/512.png (subject inside 80% safe zone), icon-master-1024.png,
  icons/android/mipmap-*/ic_launcher(.png|_round.png|_foreground.png|_background.png) (foreground subject inside 66%).
Usage: python3 tools/make_icon.py   (add --preview to also write /tmp/icon_preview.png)"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'icons')
S = 2048                      # render size (4x supersample of the 512 icon)
K = 0.47                      # subject scale: 1 unit = K*S px (subject lives inside a radius-1 circle)
INK = (62, 40, 28)            # game outline brown
WHITE, BLACK = (255, 255, 255), (0, 0, 0)


def C(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def GB(r):
    return ImageFilter.GaussianBlur(max(0.5, r))


def grad(w, h, c0, c1, bb):
    x0, y0, x1, y1 = bb
    xs = (np.arange(w)[None, :] - x0) / max(1, x1 - x0)
    ys = (np.arange(h)[:, None] - y0) / max(1, y1 - y0)
    t = np.clip(xs * .4 + ys * .6, 0, 1)[..., None]
    a, b = np.array(c0, float), np.array(c1, float)
    return Image.fromarray((a + (b - a) * t).astype('uint8'), 'RGB')


class Art:
    def __init__(self, scale, oy):
        self.s = scale * S
        self.oy = oy
        self.im = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    def X(self, x): return S / 2 + self.s * x
    def Y(self, y): return S / 2 + self.s * (y - self.oy)

    # ---- masks -----------------------------------------------------------------------------------------------
    def mk(self, *fns):
        m = Image.new('L', (S, S), 0)
        d = ImageDraw.Draw(m)
        for f in fns: f(d)
        return m

    def E(self, cx, cy, rx, ry, rot=0.0):
        def f(d):
            if not rot:
                d.ellipse([self.X(cx - rx), self.Y(cy - ry), self.X(cx + rx), self.Y(cy + ry)], fill=255)
            else:
                c, sn = math.cos(rot), math.sin(rot)
                pts = []
                for i in range(48):
                    a = i / 48 * 6.2832
                    px, py = rx * math.cos(a), ry * math.sin(a)
                    pts.append((self.X(cx + px * c - py * sn), self.Y(cy + px * sn + py * c)))
                d.polygon(pts, fill=255)
        return f

    def RR(self, x0, y0, x1, y1, r):
        return lambda d: d.rounded_rectangle([self.X(x0), self.Y(y0), self.X(x1), self.Y(y1)], radius=r * self.s, fill=255)

    def PG(self, pts):
        return lambda d: d.polygon([(self.X(x), self.Y(y)) for x, y in pts], fill=255)

    def LN(self, pts, w):
        def f(d):
            q = [(self.X(x), self.Y(y)) for x, y in pts]
            d.line(q, fill=255, width=int(w * self.s), joint='curve')
            for p in (q[0], q[-1]):
                r = w * self.s / 2
                d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)
        return f

    def smooth(self, m, r):
        return m.filter(GB(r * self.s)).point(lambda v: 255 if v > 127 else 0)

    def dil(self, mc, r):
        return mc.filter(GB(r)).point(lambda v: max(0, min(255, (v - 30) * 6)))

    # ---- compositing -----------------------------------------------------------------------------------------
    def blit(self, img, mask, box):
        ov = img.convert('RGBA')
        a = mask if img.mode == 'RGB' else ImageChops.multiply(img.getchannel('A'), mask)
        ov.putalpha(a)
        self.im.alpha_composite(ov, (box[0], box[1]))

    def solid(self, m, col, alpha=1.0, blur=0.0, dx=0.0, dy=0.0, clip=None):
        """flat colour through (optionally offset/blurred/clipped) mask - shadows, glows, blush"""
        if dx or dy: m = ImageChops.offset(m, int(dx * self.s), int(dy * self.s))
        if blur: m = m.filter(GB(blur * self.s))
        if clip is not None: m = ImageChops.multiply(m, clip)
        m = m.point(lambda v: int(v * alpha))
        self.blit(Image.new('RGB', (S, S), col), m, (0, 0))

    def part(self, m, col, ow=.03, lt=.2, dk=.3, spec=(), rim=True, flat=False, oc=INK):
        bb = m.getbbox()
        if not bb: return m
        s = self.s
        r = int(ow * s)
        pad = r * 2 + int(.12 * s)
        box = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(S, bb[2] + pad), min(S, bb[3] + pad))
        mc = m.crop(box)
        w, h = mc.size
        if r > 0: self.blit(Image.new('RGB', (w, h), oc), self.dil(mc, r), box)
        if flat:
            img = Image.new('RGB', (w, h), col)
        else:
            img = grad(w, h, mix(col, WHITE, lt), mix(col, BLACK, dk), (bb[0] - box[0], bb[1] - box[1], bb[2] - box[0], bb[3] - box[1]))
            d = max(2, int(.045 * s)); b = max(2, int(.035 * s))
            sh = ImageChops.multiply(ImageChops.subtract(mc, ImageChops.offset(mc, -d, -d)).filter(GB(b)), mc)
            img = Image.composite(Image.new('RGB', (w, h), mix(col, BLACK, .45)), img, sh.point(lambda v: int(v * .5)))
            hi = ImageChops.multiply(ImageChops.subtract(mc, ImageChops.offset(mc, d, d)).filter(GB(b * .8)), mc)
            img = Image.composite(Image.new('RGB', (w, h), mix(col, WHITE, .6)), img, hi.point(lambda v: int(v * .55)))
            if rim:
                e = max(2, int(.014 * s))
                rm = ImageChops.multiply(ImageChops.subtract(mc, ImageChops.offset(mc, -e, -e)).filter(GB(e * .5)), mc)
                img = Image.composite(Image.new('RGB', (w, h), (205, 232, 255)), img, rm.point(lambda v: int(v * .5)))
        for (cx, cy, rx, ry, al) in spec:
            g = self.mk(self.E(cx, cy, rx, ry)).crop(box)
            g = ImageChops.multiply(g.filter(GB(ry * s * .22)), mc)
            img = Image.composite(Image.new('RGB', (w, h), WHITE), img, g.point(lambda v: int(v * al)))
        self.blit(img, mc, box)
        return m

    def star(self, cx, cy, r, col):
        pts = []
        for i in range(8):
            a = i * math.pi / 4 - math.pi / 2
            rr = r if i % 2 == 0 else r * .3
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        m = self.mk(lambda d: d.polygon(pts, fill=255))
        self.solid(m, col, .5, blur=r * .3)
        self.part(m, col, ow=.012, flat=True, oc=C('#c9822f'))


# ---- palette (game: cream, brown, leaf green, sky blue, sunflower yellow, coral) -----------------------------
SKIN, HAIR, STRAW = C('#ffe3cf'), C('#3b2c3c'), C('#f4d77c')
GRASS, SOIL, LEAF = C('#82d05a'), C('#a9714a'), C('#5db64b')
CORAL, BLUE, SUN, CREAM = C('#f3745b'), C('#4f93e0'), C('#ffd45c'), C('#fff1d6')


def background():
    a = Art(1.0, 0.0)
    ys = np.linspace(0, 1, S)[:, None, None]
    top, bot = np.array(C('#74bff2'), float), np.array(C('#d4f0ff'), float)
    sky = (top + (bot - top) * ys) * np.ones((1, S, 1))
    a.im = Image.fromarray(sky.astype('uint8'), 'RGB').convert('RGBA')
    sx, sy = .22, -.26
    a.solid(a.mk(a.E(sx, sy, .30, .30)), C('#fff2b0'), .55, blur=.10)
    for i in range(10):          # short capsule rays
        ang = i / 10 * 6.2832 + .15
        c, sn = math.cos(ang), math.sin(ang)
        a.part(a.mk(a.LN([(sx + c * .145, sy + sn * .145), (sx + c * .185, sy + sn * .185)], .03)), C('#ffc83d'), ow=.008, flat=True, oc=C('#b9792f'))
    a.part(a.mk(a.E(sx, sy, .105, .105)), SUN, ow=.012, oc=C('#b9792f'), spec=[(sx - .04, sy - .045, .04, .028, .8)])
    for (cx, cy, k) in ((-.27, -.31, 1.0), (.40, .36, .75)):
        m = a.mk(a.E(cx - .08 * k, cy, .075 * k, .075 * k), a.E(cx + .01 * k, cy - .04 * k, .095 * k, .095 * k),
                 a.E(cx + .10 * k, cy + .005 * k, .07 * k, .07 * k), a.RR(cx - .15 * k, cy, cx + .17 * k, cy + .075 * k, .07 * k))
        a.part(m, WHITE, ow=.009, lt=0, dk=.14, oc=C('#6f6a86'), spec=[(cx - .04 * k, cy - .075 * k, .05 * k, .025 * k, .6)])
    return a.im


def subject():
    a = Art(K, .09)
    # soft contact shadow under the floating island
    a.solid(a.mk(a.E(0, .99, .62, .09)), C('#2c4a7a'), .38, blur=.05)
    # --- island: soil underside + grass top ---
    soil = a.smooth(a.mk(a.E(0, .52, .9, .3), a.PG([(-.9, .52), (.9, .52), (.45, .86), (.12, .98), (-.12, .98), (-.45, .86)])), .05)
    a.part(soil, SOIL, ow=.04, lt=.12, dk=.38)
    for (x, y, rx, ry) in ((-.42, .68, .12, .07), (.38, .64, .1, .06), (.05, .84, .08, .05)):
        a.solid(a.mk(a.E(x, y, rx, ry)), C('#6e4429'), .5, blur=.012, clip=soil)
    a.part(a.mk(a.E(.2, .86, .075, .05)), C('#efe0c4'), ow=.02, lt=.2, dk=.2)      # pebble
    grass = a.mk(a.E(0, .45, .92, .38))
    a.solid(grass, C('#3a2210'), .55, blur=.03, dy=.05, clip=soil)                  # AO: grass lip onto soil
    a.part(grass, GRASS, ow=.04, lt=.18, dk=.3)
    a.solid(a.mk(a.E(-.15, .36, .66, .2)), C('#d6f59b'), .5, blur=.07, clip=grass)  # top-left key light on turf
    a.solid(a.mk(a.E(0, .45, .92, .38)), C('#2f7a3a'), .35, blur=.05, dx=.0, dy=-.0, clip=ImageChops.subtract(grass, ImageChops.offset(grass, -int(.08 * a.s), -int(.08 * a.s))))
    # --- cottage (back left) ---
    wall = a.mk(a.RR(-.8, .02, -.5, .27, .035))
    a.solid(a.mk(a.E(-.65, .29, .26, .05)), C('#2f6a30'), .5, blur=.03, clip=grass)
    a.part(wall, CREAM, ow=.026, lt=.05, dk=.2)
    a.part(a.mk(a.RR(-.69, .12, -.6, .27, .03)), C('#7a4a2c'), ow=.016, lt=.1, dk=.25, flat=False)
    a.part(a.mk(a.RR(-.78, .06, -.72, .13, .01)), C('#9bd7f5'), ow=.012, flat=True)
    a.solid(a.mk(a.PG([(-.84, .05), (-.65, -.19), (-.46, .05)])), C('#3a2210'), .45, blur=.025, dy=.03, clip=wall)
    a.part(a.mk(a.PG([(-.86, .06), (-.65, -.2), (-.44, .06)])), C('#c4614a'), ow=.03, lt=.18, dk=.3, spec=[(-.72, -.04, .04, .018, .5)])
    # --- sunflower (right) ---
    a.solid(a.mk(a.E(.7, .41, .12, .035)), C('#2f6a30'), .5, blur=.02, clip=grass)
    a.part(a.mk(a.LN([(.7, .41), (.7, .12)], .05)), LEAF, ow=.022, lt=.1, dk=.25)
    a.part(a.mk(a.E(.6, .27, .09, .045, -.5)), LEAF, ow=.02, lt=.15, dk=.2)
    a.part(a.mk(a.E(.8, .22, .09, .045, .5)), LEAF, ow=.02, lt=.15, dk=.2)
    fx, fy = .7, .0
    pet = a.mk(*[a.E(fx + math.cos(i * .7854) * .15, fy + math.sin(i * .7854) * .15, .085, .045, i * .7854) for i in range(8)])
    a.part(pet, SUN, ow=.024, lt=.15, dk=.2)
    a.part(a.mk(a.E(fx, fy, .1, .1)), C('#8a5530'), ow=.02, lt=.1, dk=.4, spec=[(fx - .035, fy - .04, .035, .022, .45)])
    # --- Togie: shoes, body ---
    a.solid(a.mk(a.E(0, .49, .34, .07)), C('#2f6a30'), .55, blur=.03, clip=grass)
    for sx in (-1, 1):
        a.part(a.mk(a.E(sx * .1, .48, .095, .06)), C('#8a5a3a'), ow=.026, lt=.15, dk=.3)
    torso = a.mk(a.RR(-.2, .2, .2, .47, .09))
    a.part(torso, BLUE, ow=.03, lt=.2, dk=.28, spec=[(-.1, .27, .05, .025, .4)])
    a.part(a.mk(a.RR(-.09, .3, .09, .39, .03)), C('#3d78c4'), ow=.016, lt=.1, dk=.2)                                 # bib pocket
    a.part(a.mk(a.E(.26, .3, .075, .11, .25)), CREAM, ow=.026, lt=.05, dk=.22)                                         # right arm
    a.part(a.mk(a.E(.3, .39, .05, .05)), SKIN, ow=.022, lt=.05, dk=.2)
    # --- watering can (front left, held) ---
    a.solid(a.mk(a.E(-.5, .56, .22, .05)), C('#2f6a30'), .55, blur=.025, clip=grass)
    a.part(a.mk(a.LN([(-.62, .43), (-.76, .32)], .07)), C('#ff8a70'), ow=.026, lt=.15, dk=.3)                                 # spout
    a.part(a.mk(a.E(-.79, .3, .06, .09, -.8)), C('#ffb4a0'), ow=.026, lt=.1, dk=.2)                                    # rose
    a.part(a.mk(a.RR(-.64, .32, -.35, .56, .06)), C('#ff7f66'), ow=.034, lt=.42, dk=.12, spec=[(-.57, .39, .045, .035, .85)])
    a.part(a.mk(a.LN([(-.56, .33), (-.44, .33)], .05)), C('#ff9a82'), ow=.02, lt=.1, dk=.2)                            # lid rim
    a.part(a.mk(a.LN([(-.4, .35), (-.29, .38), (-.29, .47), (-.4, .52)], .045)), C('#c9533e'), ow=.022, lt=.1, dk=.2)  # handle
    a.part(a.mk(a.E(-.26, .33, .065, .1, -.3)), CREAM, ow=.026, lt=.05, dk=.22)                                        # left arm
    a.part(a.mk(a.E(-.32, .43, .055, .055)), SKIN, ow=.022, lt=.05, dk=.2)                                             # hand
    for (x, y, sc) in ((-.88, .42, 1), (-.82, .55, .9), (-.94, .56, .7)):
        a.part(a.mk(a.E(x, y, .035 * sc, .05 * sc)), C('#8fd0ff'), ow=.014, lt=.2, dk=.1, spec=[(x - .01, y - .02, .012, .016, .9)])
    # --- Togie: head ---
    head = a.mk(a.E(0, -.05, .385, .345))
    a.solid(head, C('#2a5a8c'), .5, blur=.03, dy=.06, clip=torso)                                                      # head AO on body
    a.part(a.mk(a.E(0, -.12, .415, .385)), HAIR, ow=.034, lt=.25, dk=.2)
    for sx in (-1, 1):
        a.part(a.mk(a.E(sx * .375, .02, .075, .15)), HAIR, ow=.026, lt=.25, dk=.15)
    a.part(head, SKIN, ow=.034, lt=.08, dk=.16, spec=[(-.17, -.08, .08, .05, .35)])
    for sx in (-1, 1):                                                                                                 # cheeks blush
        a.solid(a.mk(a.E(sx * .27, .14, .075, .048)), C('#ff6f6a'), .62, blur=.02)
    for sx in (-1, 1):                                                                                                 # glossy eyes
        ex, ey = sx * .15, .05
        eye = a.mk(a.E(ex, ey, .085, .108))
        a.part(eye, C('#33201a'), ow=0, flat=True)
        a.part(a.mk(a.E(ex, ey + .055, .07, .055)), C('#9c5f33'), ow=0, flat=True, oc=INK)
        a.part(a.mk(a.E(ex - .03, ey - .04, .033, .04)), WHITE, ow=0, flat=True)
        a.part(a.mk(a.E(ex + .035, ey + .05, .016, .016)), WHITE, ow=0, flat=True)
    a.part(a.mk(a.LN([(-.05, .155), (-.025, .18), (.025, .18), (.05, .155)], .017)), C('#9b4a3a'), ow=0, flat=True)      # smile
    for sx, x0 in ((-1, -.16), (1, .1)):
        a.part(a.mk(a.E(x0 + .03, -.09, .075, .05)), HAIR, ow=.02, lt=.25, dk=.1)                                       # bangs peeking under hat
    # --- nón lá ---
    cone = a.mk(a.PG([(0, -.8), (-.58, -.3), (.58, -.3)]), a.E(0, -.3, .58, .125))
    cone = a.smooth(cone, .012)
    a.solid(cone, C('#b98068'), .45, blur=.035, dy=.065, clip=head)                                                    # hat shadow on face
    for sx in (-1, 1):                                                                                                 # chin strap
        a.part(a.mk(a.LN([(sx * .37, -.2), (sx * .33, .06), (sx * .14, .27)], .03)), CORAL, ow=.012, flat=True)
    a.part(cone, STRAW, ow=.04, lt=.25, dk=.2, spec=[(-.18, -.5, .06, .15, .6)])
    for t in (-.36, -.18, 0, .18, .36):                                                                                  # woven ribs
        a.solid(a.mk(a.LN([(t * .1, -.74), (t * 1.5, -.33)], .014)), C('#a77a3a'), .5, blur=.003, clip=cone)
    a.solid(a.mk(a.LN([(-.48, -.4), (0, -.34), (.48, -.4)], .02)), C('#a77a3a'), .45, blur=.004, clip=cone)
    a.part(a.mk(a.LN([(-.66, -.3), (-.4, -.18), (0, -.12), (.4, -.18), (.66, -.3)], .04)), C('#f7e29a'), ow=0, flat=True, rim=False) if False else None
    a.part(a.mk(a.E(0, -.71, .045, .035)), CORAL, ow=.022, lt=.2, dk=.2)                                                 # ribbon tip
    # sparkles
    a.star(a.X(-.84), a.Y(-.5), .12 * a.s, C('#fff3b0'))
    a.star(a.X(.64), a.Y(-.84), .075 * a.s, C('#fff3b0'))
    a.star(a.X(.9), a.Y(.52), .06 * a.s, C('#fff3b0'))
    return a.im


def comp(bg, sub, k=1.0):
    """background + subject scaled by k (relative to K) and centred"""
    out = bg.copy().convert('RGBA')
    if k != 1.0:
        n = int(S * k)
        sub = rs(sub, n)
        c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        c.alpha_composite(sub, ((S - n) // 2, (S - n) // 2))
        sub = c
    out.alpha_composite(sub)
    return out


def rs(im, n):
    if im.size == (n, n): return im
    if im.mode == 'RGBA':
        return im.convert('RGBa').resize((n, n), Image.LANCZOS).convert('RGBA')
    return im.resize((n, n), Image.LANCZOS)


def rounded(im, r=.22):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * r), fill=255)
    out = im.copy()
    out.putalpha(m)
    return out


def circle(im):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
    out = im.copy()
    out.putalpha(m)
    return out


def sharpen(im):
    return im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=2))


def build():
    bg, sub = background(), subject()
    anyi = rounded(comp(bg, sub, 1.0))
    apple = comp(bg, sub, 1.0).convert('RGB')
    mask = comp(bg, sub, .40 / K).convert('RGB')           # subject inside the 80% safe zone (radius 40%)
    return bg, sub, anyi, apple, mask


def save_all(bg, sub, anyi, apple, mask):
    os.makedirs(OUT, exist_ok=True)

    def sv(im, name, n, sharp=False):
        r = rs(im, n)
        if sharp: r = sharpen(r.convert('RGBA')) if r.mode == 'RGBA' else sharpen(r)
        r.save(os.path.join(OUT, name))
        return r
    sv(anyi, 'icon-master-1024.png', 1024)
    sv(anyi, 'icon-512.png', 512)
    sv(anyi, 'icon-192.png', 192)
    sv(apple, 'apple-touch-icon.png', 180)
    sv(mask, 'icon-maskable-512.png', 512)
    sv(mask, 'icon-maskable-192.png', 192)
    f32 = sv(anyi, 'favicon-32.png', 32, True)
    f16 = rs(anyi, 16)
    f16 = sharpen(f16)
    f32.save(os.path.join(OUT, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32)], append_images=[f16]) if False else \
        Image.open(os.path.join(OUT, 'favicon-32.png')).save(os.path.join(OUT, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32)])
    # Android: legacy squircle + round + adaptive layers (foreground subject inside central 66%)
    fg = comp(Image.new('RGBA', (S, S), (0, 0, 0, 0)), sub, .33 / K)
    legacy_round = circle(mask)
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for d, m in dens.items():
        p = os.path.join(OUT, 'android', 'mipmap-' + d)
        os.makedirs(p, exist_ok=True)
        rs(anyi, int(48 * m)).save(os.path.join(p, 'ic_launcher.png'))
        rs(legacy_round, int(48 * m)).save(os.path.join(p, 'ic_launcher_round.png'))
        rs(fg, int(108 * m)).save(os.path.join(p, 'ic_launcher_foreground.png'))
        rs(bg.convert('RGB'), int(108 * m)).save(os.path.join(p, 'ic_launcher_background.png'))


def preview(anyi, apple, mask, bg, sub):
    fg = comp(Image.new('RGBA', (S, S), (0, 0, 0, 0)), sub, .33 / K)
    ad = circle(comp(bg, fg, 1.0).convert('RGB'))                                  # adaptive layers under a circle mask
    big = rs(anyi, 640)
    strip = Image.new('RGBA', (640, 640), (240, 240, 240, 255))
    x = 8
    for n in (16, 32, 48, 96, 180):
        t = rs(anyi, n)
        t = t.resize((n * (192 // n if n < 192 else 1),) * 2, Image.NEAREST) if n < 192 else t
        strip.alpha_composite(t, (x, 10 + (x // 200) * 0)) if x + t.width < 640 else None
        x += t.width + 8
    # row 2: true-size 48 px upscaled x4 (nearest) so the smallest legible size can be judged
    t48 = rs(anyi, 48).resize((192, 192), Image.NEAREST)
    strip.alpha_composite(t48, (8, 230))
    t48m = rs(ad, 108).resize((216, 216), Image.NEAREST)
    strip.alpha_composite(t48m, (220, 230))
    strip.alpha_composite(rs(mask.convert('RGBA'), 192), (450, 230))
    Image.alpha_composite(Image.new('RGBA', (640, 640), (255, 255, 255, 255)), big).save('/tmp/icon_big.png')
    strip.save('/tmp/icon_small.png')


if __name__ == '__main__':
    bg, sub, anyi, apple, mask = build()
    save_all(bg, sub, anyi, apple, mask)
    if '--preview' in sys.argv: preview(anyi, apple, mask, bg, sub)
    print('icons written to', OUT)
