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
js/reward-pick.js    вибір персонажа й фрази без повтору останньої комбінації (без DOM)
js/storage.js        безпечна робота з localStorage: останні комбінації, прихований прогрес
js/secret-config.js  секретна локація: поріг відкриття, фото, текст привітання
js/secret.js         сцени секрету: System Glitch, Hidden Achievement, Secret Portal
js/room.js           секретна кімната: шари в координатах фону 941×1672, фото в рамці
css/secret.css       стилі секретних сцен і кімнати
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
tools/test-reward-pick.mjs  Anti-Repeat і безпечне сховище: node tools/test-reward-pick.mjs
tools/test-progress.mjs     прихований прогрес: node tools/test-progress.mjs
```

`_source/` починається з підкреслення, тому GitHub Pages (Jekyll) його не публікує.
**Не додавайте `.nojekyll`**, інакше 20 МБ оригіналів потраплять на сайт.

## Оновлення на GitHub Pages

GitHub Pages і Safari кешують CSS/JS (до ~10 хв). Після заміни файлів змініть мітку
`?v=…` у `index.html` (у трьох `<link>` і в `<script>`), інакше телефон може
показувати стару версію.

## Асети

Після зміни будь-якого оригіналу в `_source/`:

```bash
pip install pillow fonttools brotli
python3 tools/build-assets.py
```

Скрипт обрізає прозорі поля, зменшує до розміру показу (×3), вирівнює парні
індикатори та звукові іконки і додає в Pixelify Sans велику «І» (U+0406),
якої в оригінальному шрифті немає.

## Версія 2.0 (у роботі)

- [x] Етап 0 — технічний аудит
- [x] Етап 1 — асети: 12 персонажів, 20 фраз у `REWARDS` (config.js), WebP секретної локації в `assets/secret/` (поки не використовуються)
- [x] Етап 2 — випадковий вибір персонажа й фрази + захист від повтору (`js/reward-pick.js`, `js/storage.js`; тест: `node tools/test-reward-pick.mjs`)
- [x] Етап 3 — прихований прогрес (`js/storage.js`, поріг у `js/secret-config.js`; тест: `node tools/test-progress.mjs`)
- [x] Етап 4 — секретне розблокування: глітч, медаль, портал (`js/secret.js`, `css/secret.css`)
- [x] Етап 5 — кімната: шари в координатах фону, фото в рамці, букет поверх фото, корона на старті (`js/room.js`)
- [x] Етап 6 — подарунок (9 кроків відкриття) і панель привітання (9-slice, друк, пропуск, сторінки)
- [x] Етап 7 — оживлення кімнати (гірлянда, вікна, зірки, пара, екран, неонове серце, іскорки біля фото) і 6 Easter Eggs з паузою 700 мс
- [x] Етап 8 — регресія: 38 перевірок у браузері (повний шлях, перезавантаження, повторні входи, без сховища, зіпсовані дані, 5 розмірів, орієнтація, resize, reduced motion, відсутнє фото); виправлено подвійний тап на CLAIM (`claimGuard`)
- [ ] Етапи 7–9 — оживлення кімнати, Easter Eggs, фінальна збірка

## Статус (версія 1.0)

- [x] Phase 01 — Foundation (+ тест стирання)
- [x] Phase 02 — Core Game
- [x] Phase 03 — Reward System
- [x] Phase 04 — Animation
- [x] Phase 05 — Polish
- [ ] Phase 06 — Testing & Deployment
