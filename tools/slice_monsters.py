"""モンスター画像シート（9列×5行、マゼンタ背景、区切り線あり）を1体ずつのPNGに切り出す。

使い方:
  python3 tools/slice_monsters.py <シート> <出力フォルダ> "<id1> <id2> ..." [--native]

--native : 等倍のドット絵（1ドット=1ピクセル、背景は正確な #FF00FF）。
           切り出して背景を透明にするだけで、縮小・減色はしない。
指定なし : 拡大・にじみのある画像。背景の透明化と縁の色補正 → 正方形に整える
           → 88×88に縮小 → 32色に減色。
"""
import sys
import numpy as np
from PIL import Image

OUT = 88
COLORS = 32


def find_lines(dark, n_expected):
    """暗い区切り線の位置（連続した列/行はまとめる）"""
    idx = np.where(dark)[0]
    groups = []
    for i in idx:
        if groups and i - groups[-1][-1] <= 2:
            groups[-1].append(i)
        else:
            groups.append([i])
    lines = [(g[0], g[-1]) for g in groups]
    if len(lines) != n_expected + 1:
        raise SystemExit(f'grid lines: expected {n_expected + 1}, got {len(lines)}: {lines}')
    return lines


def process_native(cell):
    a = np.asarray(cell.convert('RGB')).astype(np.int16)
    bg = (np.abs(a[..., 0] - 255) <= 8) & (a[..., 1] <= 8) & (np.abs(a[..., 2] - 255) <= 8)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    rgb = np.where(bg[..., None], 0, a).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')


def is_bg(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 170) & (b > 170) & (g < 110) & (np.abs(r - b) < 70)


def process_scaled(cell):
    a = np.asarray(cell.convert('RGB')).astype(np.float32)
    bg = is_bg(a)
    alpha = np.where(bg, 0.0, 1.0)
    # 背景に近い縁（3px以内）の色からマゼンタ成分を除く
    near = bg.copy()
    for _ in range(3):
        n = near.copy()
        n[1:, :] |= near[:-1, :]; n[:-1, :] |= near[1:, :]
        n[:, 1:] |= near[:, :-1]; n[:, :-1] |= near[:, 1:]
        near = n
    edge = near & ~bg
    spill = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    mn = np.minimum(a[..., 0], a[..., 2])
    darkmag = edge & (mn > 60) & (a[..., 1] < mn * 0.35) & (np.abs(a[..., 0] - a[..., 2]) < 45)
    strong = edge & ((spill > 90) | darkmag)
    alpha[strong] = 0.0
    soft = edge & (spill > 30) & ~strong
    for ch in (0, 2):
        a[..., ch] = np.where(soft, a[..., ch] - (spill - 30) * 0.8, a[..., ch])
    a = np.clip(a, 0, 255)
    rgba = np.dstack([a * alpha[..., None], alpha * 255]).astype(np.uint8)  # 乗算済み
    img = Image.fromarray(rgba, 'RGBA')
    w, h = img.size
    s = max(w, h)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(img, ((s - w) // 2, s - h))
    small = np.asarray(sq.resize((OUT, OUT), Image.BOX)).astype(np.float32)
    al = small[..., 3]
    opaque = al >= 110
    rgb = np.where(al[..., None] > 0, small[..., :3] * 255 / np.maximum(al[..., None], 1), 0)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    q = Image.fromarray(rgb, 'RGB').quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT).convert('RGB')
    out = np.dstack([np.asarray(q), np.where(opaque, 255, 0).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    native = '--native' in sys.argv
    src, outdir, ids = args[0], args[1], args[2].split()
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(int)
    dark = a.sum(axis=2) < 150
    cols = find_lines(dark.mean(axis=0) > 0.6, 9)
    rows = find_lines(dark.mean(axis=1) > 0.6, 5)
    assert len(ids) == 45, len(ids)
    sizes = set()
    k = 0
    for r in range(5):
        for c in range(9):
            if native:
                x0, x1 = cols[c][1] + 1, cols[c + 1][0]
                y0, y1 = rows[r][1] + 1, rows[r + 1][0]
                img = process_native(im.crop((x0, y0, x1, y1)))
            else:
                x0, x1 = cols[c][1] + 3, cols[c + 1][0] - 2
                y0, y1 = rows[r][1] + 3, rows[r + 1][0] - 2
                img = process_scaled(im.crop((x0, y0, x1, y1)))
            sizes.add(img.size)
            img.save(f'{outdir}/{ids[k]}.png', optimize=True)
            k += 1
    print(f'wrote {k} sprites to {outdir}, sizes={sorted(sizes)}')


if __name__ == '__main__':
    main()
