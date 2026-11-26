#!/usr/bin/env python3
"""
Збірка оптимізованих асетів для сайту.

Оригінали лежать у _source/ і НІКОЛИ не змінюються.
Скрипт створює в assets/ легкі WebP-копії, обрізані до видимого вмісту
і зменшені до розміру показу при щільності екрана 3x.

Запуск із кореня проєкту:
    python3 tools/build-assets.py

Потрібно: Pillow, fontTools, brotli
    pip install pillow fonttools brotli
"""
import json
import os
import shutil

from PIL import Image
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_source")
OUT = os.path.join(ROOT, "assets")

ALPHA_CUTOFF = 16      # пікселі з альфою нижче вважаються «залишками» і обнуляються
WEBP_QUALITY = 90

# Максимальна сторона результату в px (≈ розмір показу в CSS px × 3)
TARGETS = {
    "ui/black-friday-logo.png": 960,
    "ui/arcade-button.png": 960,
    "ui/card-frame.png": 420,
    "ui/scratch-cover.png": 420,
    "ui/question-mark.png": 240,
    "rewards/discount-0.png": 900,
    "rewards/discount-33.png": 900,
    "rewards/discount-66.png": 900,
    "rewards/discount-100.png": 900,
    "memes/meme-0-broken-heart.png": 780,
    "memes/meme-33-shopping-bear.png": 780,
    "memes/meme-66-financial-rat.png": 780,
    "memes/meme-100-legendary-unicorn.png": 780,
}


def load_clean(rel):
    """Відкриває PNG і обнуляє майже прозорі пікселі."""
    im = Image.open(os.path.join(SRC, rel)).convert("RGBA")
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < ALPHA_CUTOFF else v)
    return Image.merge("RGBA", (r, g, b, a))


def crop_to_content(im):
    return im.crop(im.getchannel("A").getbbox())


def save_webp(im, rel):
    path = os.path.join(OUT, os.path.splitext(rel)[0] + ".webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=WEBP_QUALITY, method=6, alpha_quality=100)
    return path, im.size


def fit_into(im, box_w, box_h, fill=1.0, align="center"):
    """Вписує зображення в прозоре полотно box_w×box_h без деформації."""
    scale = min(box_w * fill / im.width, box_h * fill / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    x = (box_w - im.width) // 2 if align == "center" else 0
    canvas.alpha_composite(im, (x, (box_h - im.height) // 2))
    return canvas


def frame_hole(frame):
    """Внутрішній прозорий отвір рамки (частки від розміру обрізаної рамки)."""
    a = frame.getchannel("A")
    w, h = frame.size
    cx, cy = w // 2, h // 2
    left = cx
    while left > 0 and a.getpixel((left - 1, cy)) == 0:
        left -= 1
    right = cx
    while right < w - 1 and a.getpixel((right + 1, cy)) == 0:
        right += 1
    top = cy
    while top > 0 and a.getpixel((cx, top - 1)) == 0:
        top -= 1
    bottom = cy
    while bottom < h - 1 and a.getpixel((cx, bottom + 1)) == 0:
        bottom += 1
    return {
        "left": round(left / w, 4), "top": round(top / h, 4),
        "right": round((w - 1 - right) / w, 4), "bottom": round((h - 1 - bottom) / h, 4),
    }


def split_line(im, step=20):
    """
    Лінія розлому між двома НЕ з'єднаними частинами зображення (розбите серце).
    Повертає точки [x%, y%] зверху вниз — їх копіюють у REWARDS[...].split у config.js.
    """
    from collections import deque
    w, h = im.size
    a = im.getchannel("A").load()
    label = [[0] * w for _ in range(h)]
    sizes, cur = {}, 0
    for y in range(h):
        for x in range(w):
            if a[x, y] and not label[y][x]:
                cur += 1
                label[y][x] = cur
                queue, n = deque([(x, y)]), 0
                while queue:
                    cx, cy = queue.popleft()
                    n += 1
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and a[nx, ny] and not label[ny][nx]:
                            label[ny][nx] = cur
                            queue.append((nx, ny))
                sizes[cur] = n
    left, right = sorted(sorted(sizes, key=sizes.get)[-2:],
                         key=lambda l: next(x for x in range(w) for y in range(0, h, 4) if label[y][x] == l))
    points = []
    for y in list(range(0, h, step)) + [h - 1]:
        row = label[y]
        lmax = max((x for x in range(w) if row[x] == left), default=None)
        rmin = min((x for x in range(w) if row[x] == right), default=None)
        if lmax is not None and rmin is not None:
            x = (lmax + rmin) / 2
        else:
            x = (lmax + 2) if lmax is not None else (rmin - 2) if rmin is not None else w / 2
        points.append([round(x / w * 100, 1), round(y / (h - 1) * 100, 1)])
    return points


def build_images():
    report = {}
    for rel, max_side in TARGETS.items():
        im = crop_to_content(load_clean(rel))
        if rel == "ui/card-frame.png":
            report["frameHole"] = frame_hole(im)
        im.thumbnail((max_side, max_side), Image.LANCZOS)
        if rel == "memes/meme-0-broken-heart.png":
            report["heartSplit"] = split_line(im)
        path, size = save_webp(im, rel)
        report[rel] = {"size": size, "ratio": round(size[0] / size[1], 3), "kb": round(os.path.getsize(path) / 1024, 1)}

    # Індикатори: у джерелі різні полотна й масштаби. Вирівнюємо обидва
    # в однакові квадрати, щоб при заміні empty → filled нічого не «стрибало».
    for name in ("indicator-empty", "indicator-filled"):
        im = fit_into(crop_to_content(load_clean(f"ui/{name}.png")), 96, 96, fill=0.96)
        path, size = save_webp(im, f"ui/{name}.png")
        report[name] = {"size": size, "kb": round(os.path.getsize(path) / 1024, 1)}

    # Звук: однаковий масштаб для обох, динамік притиснутий до лівого краю,
    # тож при перемиканні він стоїть на місці.
    icons = {n: crop_to_content(load_clean(f"ui/{n}.png")) for n in ("sound-on", "sound-off")}
    scale = 184 / max(i.width for i in icons.values())
    for name, im in icons.items():
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (192, 144), (0, 0, 0, 0))
        canvas.alpha_composite(im, (4, (144 - im.height) // 2))
        path, size = save_webp(canvas, f"ui/{name}.png")
        report[name] = {"size": size, "kb": round(os.path.getsize(path) / 1024, 1)}
    return report


def copy_glyph(src_font, dst_font, src_codepoint, dst_codepoint):
    """Додає в dst_font символ dst_codepoint, намальований гліфом src_codepoint із src_font."""
    src_name = src_font.getBestCmap()[src_codepoint]
    new_name = f"uni{dst_codepoint:04X}"
    dst_font["glyf"][new_name] = src_font["glyf"][src_name]
    dst_font["hmtx"][new_name] = src_font["hmtx"][src_name]
    order = dst_font.getGlyphOrder()
    if new_name not in order:
        dst_font.setGlyphOrder(order + [new_name])
    for table in dst_font["cmap"].tables:
        if table.isUnicode():
            table.cmap[dst_codepoint] = new_name
    dst_font["maxp"].numGlyphs = len(dst_font.getGlyphOrder())


def build_fonts():
    src = os.path.join(SRC, "fonts")
    dst = os.path.join(OUT, "fonts")
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(src):
        if f.endswith(".woff2") or f.endswith(".txt"):
            shutil.copy(os.path.join(src, f), dst)

    # У Pixelify Sans немає великої української «І» (U+0406).
    # Вона виглядає так само, як латинська «I», тож копіюємо цей гліф.
    # Ліцензія OFL цього шрифту не має Reserved Font Name — модифікація дозволена.
    for weight in ("400", "700"):
        latin = TTFont(os.path.join(src, f"pixelify-sans-latin-{weight}-normal.woff2"))
        cyr_path = os.path.join(dst, f"pixelify-sans-cyrillic-{weight}-normal.woff2")
        cyr = TTFont(cyr_path)
        if 0x0406 not in cyr.getBestCmap():
            copy_glyph(latin, cyr, 0x0049, 0x0406)
            cyr.flavor = "woff2"
            cyr.save(cyr_path)
        assert 0x0406 in TTFont(cyr_path).getBestCmap(), "U+0406 не додано"


if __name__ == "__main__":
    report = build_images()
    build_fonts()
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print(json.dumps(report, indent=1, ensure_ascii=False))
    print(f"assets/ total: {total / 1024:.0f} KB")
