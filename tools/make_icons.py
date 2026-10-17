# アプリアイコンを作る（方眼の上に、寸法線と ± の公差）。python tools/make_icons.py（Pillow が必要）
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
BG, GRID, WHITE, BAND = (29, 92, 150), (50, 112, 168), (255, 255, 255), (170, 205, 240)

def draw(size, maskable=False):
    s = 4 * size  # 4 倍で描いて縮小（縁を滑らかにする）
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        k = 0.72  # 円形に切り抜かれても収まる大きさ
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=BG)
        k = 1.0
    step = s / 8
    for i in range(1, 8):
        d.line([i * step, 0, i * step, s], fill=GRID, width=max(1, s // 256))
        d.line([0, i * step, s, i * step], fill=GRID, width=max(1, s // 256))
    if not maskable:
        mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=255)
        im.putalpha(mask)
        d = ImageDraw.Draw(im)
    c = s / 2
    P = lambda x, y: (c + x * s * k, c + y * s * k)  # 中心からの比率で置く
    w = round(s * 0.03 * k)
    # 寸法補助線（左右）と、その外側の公差の帯
    band = Image.new('RGBA', (s, s), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
    for x in (-0.30, 0.30):
        bd.rectangle([P(x - 0.04, 0.02), P(x + 0.04, 0.30)], fill=BAND + (80,))
    im.alpha_composite(band); d = ImageDraw.Draw(im)
    for x in (-0.30, 0.30):
        d.line([P(x, -0.02), P(x, 0.32)], fill=WHITE, width=w)
    # 寸法線と矢印
    y = 0.16
    d.line([P(-0.30, y), P(0.30, y)], fill=WHITE, width=w)
    a = 0.07
    d.polygon([P(-0.30, y), P(-0.30 + a, y - a * 0.55), P(-0.30 + a, y + a * 0.55)], fill=WHITE)
    d.polygon([P(0.30, y), P(0.30 - a, y - a * 0.55), P(0.30 - a, y + a * 0.55)], fill=WHITE)
    # ± の記号
    L = 0.12; cy = -0.20; bw = round(w * 1.25)
    d.line([P(-L, cy), P(L, cy)], fill=WHITE, width=bw)
    d.line([P(0, cy - L), P(0, cy + L)], fill=WHITE, width=bw)
    d.line([P(-L, cy + L + 0.06), P(L, cy + L + 0.06)], fill=WHITE, width=bw)
    return im.resize((size, size), Image.LANCZOS)

OUT.mkdir(exist_ok=True)
draw(512).save(OUT / 'icon-512.png')
draw(192).save(OUT / 'icon-192.png')
draw(512, maskable=True).save(OUT / 'icon-maskable-512.png')
im = draw(180)
bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im); bg.convert('RGB').save(OUT / 'apple-touch-icon.png')
print('icons/ に保存しました')
