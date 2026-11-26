# Black Friday 2026 — Neon Pixel Arcade

Мобільна скретч-мінігра (HTML / CSS / vanilla JS, без збірки й без backend).

## Запуск локально

ES-модулі не працюють через `file://`, тому потрібен будь-який статичний сервер:

```bash
python3 -m http.server 8000
# відкрити http://localhost:8000
```

Режим розробника: додати `?debug=1` або `#debug` до адреси (кнопка **DBG** унизу ліворуч).

## Структура

```
index.html
css/style.css        палітра, шрифти, layout, компоненти
css/animations.css   повторювані CSS-анімації
css/responsive.css   dvh, малі/великі екрани, орієнтація, reduced motion
js/config.js         УСІ налаштування: REWARDS, тексти, шляхи, поріг, кисть, таймінги, звук
js/round.js          правила раунду без DOM: колода, Fisher–Yates, перевірка трійки
js/game.js           state machine: START → GAME_ACTIVE → MATCH_FOUND → REWARD → RESETTING
js/scratch.js        клас ScratchCard (canvas, pointer events, карта стирання)
js/ui.js             побудова DOM, трекер, екран нагороди, повідомлення
js/animations.js     scope (скасовувані послідовності), неонова лінія, інтро, сітка, MATCH-лінія, перехід
js/particles.js      піксельні частинки на одному спільному canvas
js/audio.js          AudioManager — безпечні заглушки, поки audio.available = false
js/debug.js          режим розробника (лише з ?debug=1)
js/main.js           завантаження асетів і запуск гри
assets/              оптимізовані WebP + шрифти (це публікується)
_source/             оригінальні PNG і шрифти — не змінюються
tools/build-assets.py   генерує assets/ з _source/
tools/test-round.mjs    перевірка чесності логіки: node tools/test-round.mjs
```

`_source/` починається з підкреслення, тому GitHub Pages (Jekyll) його не публікує.
**Не додавайте `.nojekyll`**, інакше 20 МБ оригіналів потраплять на сайт.

## Асети

Після зміни будь-якого оригіналу в `_source/`:

```bash
pip install pillow fonttools brotli
python3 tools/build-assets.py
```

Скрипт обрізає прозорі поля, зменшує до розміру показу (×3), вирівнює парні
індикатори та звукові іконки і додає в Pixelify Sans велику «І» (U+0406),
якої в оригінальному шрифті немає.

## Статус

- [x] Phase 01 — Foundation (+ тест стирання)
- [x] Phase 02 — Core Game
- [x] Phase 03 — Reward System
- [x] Phase 04 — Animation
- [ ] Phase 05 — Polish
- [ ] Phase 06 — Testing & Deployment
