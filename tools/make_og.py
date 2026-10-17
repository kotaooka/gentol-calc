# SNS 共有用の画像 og.png（1200×630）を作る
# 文字は画像に焼き込む。字体は BIZ UDPゴシック（QC Workbench の DESIGN.md 2）
# 実行: python tools/make_og.py [フォントのフォルダ]
#   BIZUDPGothic-Regular.ttf / -Bold.ttf（Google Fonts 版）を探す。省略時は C:\Windows\Fonts と ~/.fonts
import pathlib, sys
from PIL import Image, ImageDraw, ImageFont

REPO = pathlib.Path(__file__).resolve().parent.parent
DIRS = [pathlib.Path(sys.argv[1])] if len(sys.argv) > 1 else [pathlib.Path("C:/Windows/Fonts"), pathlib.Path.home() / ".fonts"]
K = 2
TOP, BOTTOM = (29, 92, 150), (26, 83, 136)
WHITE, SOFT, CELL, HIT = (255, 255, 255), (222, 232, 244), (52, 112, 166), (255, 255, 255)

def font(weight, size):
    for d in DIRS:
        p = d / f"BIZUDPGothic-{weight}.ttf"
        if p.exists():
            return ImageFont.truetype(str(p), size * K)
    sys.exit(f"BIZUDPGothic-{weight}.ttf が見つからない。フォントのフォルダを引数で指定する")

W, H = 1200 * K, 630 * K
im = Image.new("RGB", (W, H))
g = ImageDraw.Draw(im)
for y in range(H):
    t = y / H
    g.line([(0, y), (W, y)], fill=tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
M = 72 * K
g.text((M, 150 * K), "QC Workbench", font=font("Regular", 26), fill=SOFT)
g.text((M, 200 * K), "普通公差計算機", font=font("Bold", 74), fill=WHITE)
g.text((M, 310 * K), "寸法を入れると普通公差と", font=font("Regular", 32), fill=SOFT)
g.text((M, 356 * K), "板厚の許容差を表示", font=font("Regular", 32), fill=SOFT)
# 規格のチップ
x, y = M, 440 * K
for s in ["JIS B 0405", "JIS B 0403", "DIN 16901", "ISO 3302-1", "JIS G 3141"]:
    f = font("Regular", 22)
    w = g.textlength(s, font=f) + 28 * K
    if x + w > 640 * K:
        x, y = M, y + 52 * K
    g.rounded_rectangle([x, y, x + w, y + 40 * K], radius=8 * K, outline=SOFT, width=2 * K)
    g.text((x + 14 * K, y + 7 * K), s, font=f, fill=WHITE)
    x += w + 12 * K
# 右：早見表（該当の行と列を淡く、交点を白で強調）
cols, rows, cw, ch = 5, 6, 76 * K, 50 * K
ox, oy = W - M - cols * cw, 165 * K
hr, hc = 3, 2
for r in range(rows):
    for c in range(cols):
        x0, y0 = ox + c * cw, oy + r * ch
        fill = HIT if (r == hr and c == hc) else (70, 132, 186) if (r == hr or c == hc) else CELL
        g.rectangle([x0 + 3 * K, y0 + 3 * K, x0 + cw - 3 * K, y0 + ch - 3 * K], fill=fill)
f = font("Bold", 21)
g.text((ox + hc * cw + cw / 2, oy + hr * ch + ch / 2), "±0.2", font=f, fill=TOP, anchor="mm")
im.resize((1200, 630), Image.LANCZOS).save(REPO / "og.png")
print("og.png を保存しました")
