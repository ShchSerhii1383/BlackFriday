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
}
# Усі мемні персонажі з _source/memes/ (будь-яка кількість) — однаковий розмір
MEME_MAX = 780

# Секретна локація.  crop=False — зберегти полотно як є:
#  - фон кімнати непрозорий, координати предметів рахуються від його повного розміру;
#  - закритий і відкритий подарунок мають спільне полотно, щоб їх можна було точно вирівняти.
SECRET = {
    "secret-room-background.png": {"max": 1672, "crop": False},
    "secret-portal.png": {"max": 900, "crop": True},
    "secret-achievement-badge.png": {"max": 780, "crop": True},
    "secret-gift-closed.png": {"max": 768, "crop": False},
    "secret-gift-open.png": {"max": 768, "crop": False},
    "secret-greeting-panel.png": {"max": 1100, "crop": True},
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


# Отвір настінної фоторамки у пікселях фону кімнати (941 × 1672) — ті самі числа,
# що й secretConfig.room.photoFrame у js/secret-config.js.
PHOTO_FRAME = {"x": 388, "y": 116, "w": 284, "h": 412}
# Ділянка, де кінчики квітів букета заходять в отвір рамки.
BOUQUET_AREA = {"x": 428, "y": 476, "w": 140, "h": 56}
WALL_COLOR = (62, 13, 69)     # колір стіни всередині рамки (медіана)
WALL_DISTANCE = 95            # піксель далі від кольору стіни = квітка


def bouquet_overlay():
    """
    Квіти поверх фото: з того самого фону вирізаються лише пікселі квітів
    (усе, що помітно відрізняється від кольору стіни) у ділянці BOUQUET_AREA.
    Ця накладка кладеться над фотографією, тож букет «стоїть перед» нею.
    Нічого не малюється вручну — лише автоматичне вирізання з оригіналу.
    """
    bg = Image.open(os.path.join(SRC, "secret", "secret-room-background.png")).convert("RGB")
    a = BOUQUET_AREA
    crop = bg.crop((a["x"], a["y"], a["x"] + a["w"], a["y"] + a["h"])).convert("RGBA")
    px = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, _ = px[x, y]
            far = abs(r - WALL_COLOR[0]) + abs(g - WALL_COLOR[1]) + abs(b - WALL_COLOR[2]) > WALL_DISTANCE
            px[x, y] = (r, g, b, 255 if far else 0)
    path = os.path.join(OUT, "secret", "room-bouquet-overlay.webp")
    crop.save(path, "WEBP", lossless=True)
    return {"area": a, "kb": round(os.path.getsize(path) / 1024, 1)}


def build_images():
    report = {}
    for rel, max_side in TARGETS.items():
        im = crop_to_content(load_clean(rel))
        if rel == "ui/card-frame.png":
            report["frameHole"] = frame_hole(im)
        im.thumbnail((max_side, max_side), Image.LANCZOS)
        path, size = save_webp(im, rel)
        report[rel] = {"size": size, "ratio": round(size[0] / size[1], 3), "kb": round(os.path.getsize(path) / 1024, 1)}

    # Мемні персонажі: обрізати до вмісту, зберегти пропорції.
    # ratio потрібне для memes[].scale у config.js (вирівнювання «на око»).
    for f in sorted(os.listdir(os.path.join(SRC, "memes"))):
        if not f.endswith(".png"):
            continue
        rel = f"memes/{f}"
        im = crop_to_content(load_clean(rel))
        ratio = im.width / im.height
        im.thumbnail((MEME_MAX, MEME_MAX), Image.LANCZOS)
        path, size = save_webp(im, rel)
        report[rel] = {"size": size, "ratio": round(ratio, 3), "kb": round(os.path.getsize(path) / 1024, 1)}

    # Секретна локація
    for f, opt in SECRET.items():
        rel = f"secret/{f}"
        im = load_clean(rel)
        if opt["crop"]:
            im = crop_to_content(im)
        im.thumbnail((opt["max"], opt["max"]), Image.LANCZOS)
        if f == "secret-room-background.png":
            im = im.convert("RGB")  # фон непрозорий — альфа-канал не потрібен
        path, size = save_webp(im, rel)
        report[rel] = {"size": size, "kb": round(os.path.getsize(path) / 1024, 1)}
    report["secret/room-bouquet-overlay"] = bouquet_overlay()
    # SVG-заглушка фото копіюється як є
    shutil.copy(os.path.join(SRC, "secret", "photo-placeholder.svg"), os.path.join(OUT, "secret", "photo-placeholder.svg"))

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
