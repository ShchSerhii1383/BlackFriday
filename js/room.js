/**
 * room.js — SALES QUEEN'S SECRET ROOM (ТЗ 2.0, розділи 12–14).
 *
 * Кімната — це фон 941 × 1672 і шари поверх нього. Кожен шар позиціонується
 * у відсотках від розміру фону (place()), тому при будь-якому масштабі екрана
 * фото, подарунок та інтерактивні області лишаються точно на своїх предметах.
 * Етапи 6–7 додадуть у ці шари подарунок, привітання, оживлення й Easter Eggs.
 */
import { secretConfig } from './secret-config.js';
import { prefersReducedMotion, relRect } from './animations.js';
import { AudioManager } from './audio.js';
import { CONFIG } from './config.js';

const ROOM = secretConfig.room;
const $ = (sel) => document.querySelector(sel);

/** Пікселі фону → відсоток від його ширини/висоти. */
const pctX = (v) => `${((v / ROOM.width) * 100).toFixed(3)}%`;
const pctY = (v) => `${((v / ROOM.height) * 100).toFixed(3)}%`;

/** Поставити елемент на прямокутник {x, y, w, h} у пікселях фону. */
export function place(el, { x, y, w, h }) {
  el.style.left = pctX(x);
  el.style.top = pctY(y);
  el.style.width = pctX(w);
  el.style.height = pctY(h);
}

/**
 * clip-path за формою отвору рамки: прямокутник зі «сходинковими» кутами.
 * notch = [глибина по x, глибина по y, сходинка по x, сходинка по y] у пікселях фону.
 */
function frameClipPath({ w, h, notch: [ax, ay, bx, by] }) {
  const X = (v) => `${((v / w) * 100).toFixed(3)}%`;
  const Y = (v) => `${((v / h) * 100).toFixed(3)}%`;
  const pts = [
    [ax, 0], [w - ax, 0], [w - ax, by], [w - bx, by], [w - bx, ay], [w, ay],
    [w, h - ay], [w - bx, h - ay], [w - bx, h - by], [w - ax, h - by], [w - ax, h],
    [ax, h], [ax, h - by], [bx, h - by], [bx, h - ay], [0, h - ay],
    [0, ay], [bx, ay], [bx, by], [ax, by],
  ];
  return `polygon(${pts.map(([x, y]) => `${X(x)} ${Y(y)}`).join(', ')})`;
}

let built = false;

/**
 * Підготувати шари кімнати (один раз). Викликається лише при вході в кімнату,
 * тож до відкриття секрету фото і накладки не завантажуються.
 */
export function buildRoom() {
  if (built) return;
  built = true;

  // 02 — фото в настінній рамці
  const frame = ROOM.photoFrame;
  const photo = $('#room-photo');
  place(photo, frame);
  photo.style.clipPath = frameClipPath(frame);
  setRoomPhoto(secretConfig.photo.enabled ? secretConfig.photo.src : secretConfig.photo.placeholder);

  // Кінчики квітів букета поверх фото
  const bouquet = $('#room-bouquet');
  place(bouquet, ROOM.bouquetOverlay);
  bouquet.src = ROOM.bouquetOverlay.src;

  // 06 — подарунок; відкрита коробка суміщена з закритою за основою (openAlign)
  const g = ROOM.gift;
  place($('#gift-btn'), g);
  $('#gift-closed').src = g.closed;
  const open = $('#gift-open');
  open.src = g.open;
  open.style.transformOrigin = `${g.openAlign.origin[0]} ${g.openAlign.origin[1]}`;
  open.style.transform = `translate(${g.openAlign.shift[0]}, ${g.openAlign.shift[1]}) scale(${g.openAlign.scale})`;

  buildAmbient();
  buildEasterEggs();
}

/* ================================================================== */
/* Оживлення кімнати (ТЗ 2.0, розділ 17) — шари 03–04                  */
/* ================================================================== */

/** Створити елемент-накладку з класом і розміщенням у пікселях фону. */
function overlay(parent, className, rect, vars = {}) {
  const el = document.createElement('i');
  el.className = className;
  place(el, rect);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  parent.append(el);
  return el;
}

/** Випадкове число в діапазоні — щоб кожна лампочка/вікно мали власну фазу. */
const rnd = (a, b) => (a + Math.random() * (b - a)).toFixed(2);

/**
 * Усі атмосферні ефекти — CSS-анімації маленьких накладок (без requestAnimationFrame).
 * Коли кімната прихована, вони стоять на паузі разом зі сценою.
 */
function buildAmbient() {
  const A = ROOM.ambient;
  const ambient = $('#room-ambient');
  const details = $('#room-details');

  // Гірлянда: повільне мерехтіння лампочок з незалежними фазами
  for (const [x, y] of A.garland) {
    overlay(ambient, 'amb-bulb', { x: x - 16, y: y - 16, w: 32, h: 32 }, { '--dur': `${rnd(2.2, 4.2)}s`, '--delay': `-${rnd(0, 4)}s` });
  }
  // Нічне місто: окремі вікна зрідка «гаснуть» і загоряються знову
  for (const [x, y] of A.windows) {
    overlay(ambient, 'amb-window', { x: x - 4, y: y - 4, w: 8, h: 8 }, { '--dur': `${rnd(5, 11)}s`, '--delay': `-${rnd(0, 10)}s` });
  }
  // Зірки на небі: періодичне мерехтіння різної інтенсивності
  A.skyStars.forEach(([x, y], i) => {
    overlay(ambient, 'amb-star', { x: x - 7, y: y - 7, w: 14, h: 14 },
      { '--dur': `${rnd(1.8, 3.6)}s`, '--delay': `-${rnd(0, 3)}s`, '--peak': i % 2 ? '1' : '0.6' });
  });
  // Неонове серце: повільна пульсація і м'яке рожеве підсвічування
  const h = A.neonHeart;
  overlay(ambient, 'amb-heart', { x: h.x - h.r, y: h.y - h.r, w: h.r * 2, h: h.r * 2 });
  // Ноутбук: делікатне мерехтіння екрана
  overlay(details, 'amb-screen', A.screen);
  // Графік продажів (оживає по натисканню на ноутбук)
  const chart = overlay(details, 'amb-chart', A.chart);
  chart.id = 'room-chart';
  for (let i = 0; i < 5; i++) {
    const bar = document.createElement('b');
    bar.style.setProperty('--h', `${30 + i * 16}%`);
    bar.style.setProperty('--i', i);
    chart.append(bar);
  }
  // Кава: піксельні частинки пари повільно підіймаються і зникають
  const steam = overlay(details, 'amb-steam', { x: A.steam.x - 20, y: A.steam.y - 70, w: 40, h: 70 });
  steam.id = 'room-steam';
  for (let i = 0; i < 4; i++) {
    const puff = document.createElement('b');
    puff.style.setProperty('--i', i);
    steam.append(puff);
  }
  // Фото: дрібні золоті іскорки навколо рамки (видно після відкриття подарунка)
  const f = ROOM.photoFrame;
  [[f.x + 6, f.y + 10], [f.x + f.w - 8, f.y + 30], [f.x + f.w - 4, f.y + f.h - 40], [f.x + 4, f.y + f.h - 70]].forEach(([x, y], i) => {
    overlay(details, 'amb-photo-spark secret__star', { x: x - 8, y: y - 8, w: 16, h: 16 }, { '--d': `${i * 0.55}s` });
  });
}

/* ================================================================== */
/* Приховані Easter Eggs (ТЗ 2.0, розділ 18) — шар 05                 */
/* ================================================================== */

/** Мінімальна пауза між повторними натисканнями одного предмета (мс). */
const EGG_COOLDOWN = 700;
const lastEggTime = {};
let captionTimer = 0;

function buildEasterEggs() {
  const layer = $('#room-hotspots');
  for (const egg of ROOM.easterEggs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'room__hotspot';
    btn.dataset.egg = egg.id;
    btn.setAttribute('aria-label', egg.id);
    place(btn, egg);
    layer.append(btn);
  }
  const caption = document.createElement('p');
  caption.className = 'room__caption';
  caption.id = 'room-caption';
  caption.setAttribute('aria-live', 'polite');
  layer.append(caption);
}

/** Короткий напис над предметом; новий напис заміняє попередній, а не накопичується. */
function showCaption(egg, text) {
  const caption = $('#room-caption');
  const stage = $('#room-stage');
  caption.textContent = text;
  caption.classList.remove('is-visible');
  // Над предметом; по горизонталі — так, щоб напис не виходив за межі кімнати.
  const stageW = stage.clientWidth;
  const half = caption.offsetWidth / 2 + 4;
  const wanted = ((egg.x + egg.w / 2) / ROOM.width) * stageW;
  const left = Math.min(Math.max(wanted, half), stageW - half);
  caption.style.left = `${left}px`;
  caption.style.top = `${((Math.max(egg.y - 16, 60) / ROOM.height) * 100).toFixed(2)}%`;
  void caption.offsetWidth; // перезапуск анімації появи
  caption.classList.add('is-visible');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => caption.classList.remove('is-visible'), 2400);
}

/** Прибрати напис і тимчасові стани (вихід із кімнати). */
export function resetEasterEggs() {
  clearTimeout(captionTimer);
  $('#room-caption')?.classList.remove('is-visible');
  $('#room-steam')?.classList.remove('is-strong');
  $('#room-chart')?.classList.remove('is-playing');
}

/**
 * Зіграти ефект предмета. Короткий, не блокує інших дотиків;
 * частинки обмежені глобальним лімітом particles.js і паузою EGG_COOLDOWN.
 */
export function playEasterEgg(id, { app, particles }) {
  const egg = ROOM.easterEggs.find((e) => e.id === id);
  if (!egg) return;
  const now = performance.now();
  if (now - (lastEggTime[id] || 0) < EGG_COOLDOWN) return;
  lastEggTime[id] = now;
  AudioManager.play('easterEgg');

  const btn = document.querySelector(`.room__hotspot[data-egg="${id}"]`);
  const r = relRect(btn, app);
  const pink = ['#FF79F4', '#FFB5FF', '#FF3B6E'];
  switch (egg.effect) {
    case 'hearts':
      particles.hearts(r.cx, r.t + r.h * 0.35, pink, 10, { spread: r.w * 0.5 });
      break;
    case 'chart': {
      const chart = $('#room-chart');
      chart.classList.remove('is-playing');
      void chart.offsetWidth;
      chart.classList.add('is-playing');
      particles.burst(r.cx, r.t + r.h * 0.3, ['#3FBF5F', '#9CFF9C', '#FFFFFF'], 12, 120);
      break;
    }
    case 'petals':
      particles.hearts(r.cx, r.t + r.h * 0.3, pink, 6, { spread: r.w * 0.5 });
      particles.rain(['#FFB5FF', '#FF79F4', '#FFF4E6', '#FF8FC8'], 16, { x0: r.l + r.w * 0.15, x1: r.r - r.w * 0.15, y: r.t + r.h * 0.2 });
      break;
    case 'steam': {
      const steam = $('#room-steam');
      steam.classList.add('is-strong');
      clearTimeout(steam._timer);
      steam._timer = setTimeout(() => steam.classList.remove('is-strong'), 3000);
      break;
    }
    case 'rainbow':
      particles.burst(r.cx, r.cy, CONFIG.particles.rainbow, 26, 180);
      break;
    case 'gold':
      particles.burst(r.cx, r.cy, ['#FFBF32', '#FFF1A3', '#FFFFFF'], 24, 190);
      break;
    default:
      break;
  }
  // Предмет без напису прибирає попередній, щоб чужий текст не «висів» над ним.
  if (egg.caption) showCaption(egg, egg.caption);
  else { clearTimeout(captionTimer); $('#room-caption').classList.remove('is-visible'); }
}

/** Показати подарунок закритим або відкритим (і відповідно підсвітити фото). */
export function renderGift(opened) {
  $('#gift-btn').classList.toggle('is-opened', opened);
  $('#gift-btn').setAttribute('aria-label', opened ? 'Перечитати привітання' : 'Відкрити подарунок');
  setPhotoGlow(opened);
}

/* ================================================================== */
/* Відкриття подарунка (ТЗ 2.0, розділ 15)                             */
/* ================================================================== */

/**
 * Дев'ять кроків: блокування → стиск → підскок → золоте світло → заміна
 * закритої коробки на відкриту (під світлом) → конфеті → сердечка →
 * підсвічування фото. Панель привітання (крок 9) відкриває game.js.
 * @param {() => void} onOpened  викликається в момент заміни (зберегти статус)
 */
export async function playGiftOpening(scope, { app, particles, onOpened }) {
  const btn = $('#gift-btn');
  const box = $('#gift-box');
  const light = btn.querySelector('.gift__light');
  const reduced = prefersReducedMotion();

  // 1. Повторне натискання заблоковано.
  btn.disabled = true;
  scope.onDispose(() => { btn.disabled = false; });
  AudioManager.play('giftOpen');

  if (!reduced) {
    // 2. Коробка злегка стискається…
    await scope.finished(scope.animate(box, [
      { transform: 'scale(1, 1)' }, { transform: 'scale(1.08, 0.86)' },
    ], { duration: 180, easing: 'steps(3)', fill: 'forwards' }));
    // 3. …і підстрибує.
    await scope.finished(scope.animate(box, [
      { transform: 'scale(1.08, 0.86)' },
      { transform: 'translateY(-16%) scale(0.96, 1.06)', offset: 0.45 },
      { transform: 'translateY(0) scale(1, 1)' },
    ], { duration: 420, easing: 'steps(8)', fill: 'forwards' }));
  }

  // 4. Золотий світловий ефект…
  const r = relRect(btn, app);
  const flash = scope.animate(light, [
    { opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.55 }, { opacity: 0 },
  ], { duration: reduced ? 0 : 900, easing: 'steps(8)' });
  particles.burst(r.cx, r.cy, ['#FFBF32', '#FFF1A3', '#FFFFFF'], 30, 220);
  await scope.wait(reduced ? 0 : 320);

  // 5. …під яким закрите зображення замінюється відкритим.
  renderGift(true);
  onOpened?.();

  // 6. Піксельні конфеті і 7. маленькі сердечка.
  particles.burst(r.cx, r.t + r.h * 0.3, ['#FF79F4', '#FFBF32', '#B64BFF', '#38D7FF', '#FFF1A3'], 36, 260);
  particles.hearts(r.cx, r.t + r.h * 0.2, ['#FF79F4', '#FFB5FF', '#FF3B6E'], 12, { spread: r.w * 0.5 });

  // 8. Фото отримує тепле підсвічування і кілька золотих іскор.
  const photo = relRect($('#room-photo'), app);
  particles.burst(photo.cx, photo.cy, ['#FFBF32', '#FFF1A3'], 18, 120);

  await scope.finished(flash);
  await scope.wait(reduced ? 0 : 500);
}

/* ================================================================== */
/* Панель привітання (ТЗ 2.0, розділ 16)                              */
/* ================================================================== */

const CHARS_PER_SECOND = 45;

/** Абзац із конфігу → DOM: текст і піксельний смайл замість {smile}. */
function paragraphParts(text) {
  return text.split(/(\{smile\})/).filter(Boolean);
}

/**
 * Показати перші chars символів абзацу. Решта тексту теж є в DOM, але невидима —
 * тож розмір панелі не змінюється під час друку (без «стрибків» рядків).
 */
function renderParagraph(p, text, chars = Infinity) {
  p.replaceChildren();
  const pending = document.createElement('span');
  pending.className = 'greeting__pending';
  let left = chars;
  const smile = () => {
    const el = document.createElement('span');
    el.className = 'px-smile';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'усмішка');
    return el;
  };
  for (const part of paragraphParts(text)) {
    if (part === '{smile}') {
      (left > 0 ? p : pending).append(smile());
      left -= 1;
      continue;
    }
    const shown = left > 0 ? part.slice(0, left) : '';
    if (shown) p.append(shown);
    const rest = part.slice(shown.length);
    if (rest) pending.append(rest);
    left -= part.length;
  }
  if (pending.childNodes.length) p.append(pending);
}

/** Довжина абзацу для друку (смайл = 1 «символ»). */
const typedLength = (text) => paragraphParts(text).reduce((n, part) => n + (part === '{smile}' ? 1 : part.length), 0);

/**
 * Поділити привітання на сторінки так, щоб кожна вміщалася в кімнату
 * без зменшення шрифту (ТЗ 2.0, розділ 16).
 */
function paginate(greeting, body, maxHeight) {
  const paragraphs = secretConfig.greeting;
  const fits = (list) => {
    body.replaceChildren(...list.map((t) => {
      const p = document.createElement('p');
      renderParagraph(p, t);
      return p;
    }));
    return greeting.offsetHeight <= maxHeight;
  };
  const pages = [];
  let current = [];
  for (const text of paragraphs) {
    if (current.length && !fits([...current, text])) {
      pages.push(current);
      current = [];
    }
    current.push(text);
  }
  if (current.length) pages.push(current);
  body.replaceChildren();
  return pages;
}

/**
 * Показати привітання: поява панелі → заголовок → абзаци «друкуються»
 * (дотик до панелі — показати все одразу) → NEXT між сторінками →
 * підпис і кнопка OK. Слухачі живуть у scope стану і знімаються самі.
 * @param {() => void} onClose  натиснуто OK
 */
export async function playGreeting(scope, { onClose }) {
  const stage = $('#room-stage');
  const greeting = $('#greeting');
  const panel = $('#greeting-panel');
  const title = $('#greeting-title');
  const body = $('#greeting-body');
  const signature = $('#greeting-signature');
  const nextBtn = $('#greeting-next');
  const closeBtn = $('#greeting-close');
  const reduced = prefersReducedMotion();

  title.textContent = secretConfig.title;
  signature.textContent = secretConfig.signature;
  signature.classList.remove('is-on');
  nextBtn.hidden = true;
  closeBtn.hidden = true;
  stage.classList.add('is-greeting');
  greeting.hidden = false;
  scope.onDispose(() => {
    greeting.hidden = true;
    stage.classList.remove('is-greeting');
  });

  // Сторінки рахуються з урахуванням підпису й кнопок (найгірший випадок).
  signature.classList.add('is-on');
  closeBtn.hidden = false;
  const maxHeight = stage.clientHeight * 0.92;
  const pages = paginate(greeting, body, maxHeight);
  signature.classList.remove('is-on');
  closeBtn.hidden = true;

  AudioManager.play('greeting');
  // Плавна поява панелі
  scope.animate(greeting, [{ opacity: 0, transform: 'translateX(-50%) scale(0.9)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }],
    { duration: reduced ? 0 : 420, easing: 'steps(6)' });

  let pageIndex = 0;
  let skip = null; // функція «показати все одразу» для поточної сторінки

  const listen = (el, type, fn) => {
    el.addEventListener(type, fn);
    scope.onDispose(() => el.removeEventListener(type, fn));
  };
  listen(panel, 'click', () => skip?.());
  listen(nextBtn, 'click', () => { if (!nextBtn.hidden) showPage(pageIndex + 1); });
  listen(closeBtn, 'click', () => { if (!closeBtn.hidden) onClose(); });

  function showPage(i) {
    pageIndex = i;
    nextBtn.hidden = true;
    const texts = pages[i];
    title.style.display = i === 0 ? '' : 'none';
    const ps = texts.map(() => document.createElement('p'));
    body.replaceChildren(...ps);
    const isLast = i === pages.length - 1;
    signature.style.display = isLast ? '' : 'none';
    signature.classList.remove('is-on');

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      skip = null;
      texts.forEach((t, k) => renderParagraph(ps[k], t));
      if (isLast) {
        signature.classList.add('is-on');
        closeBtn.hidden = false;
      } else {
        nextBtn.hidden = false;
      }
    };
    skip = finish;
    if (reduced) return finish();

    // Друк символ за символом по абзацах.
    const lengths = texts.map(typedLength);
    const total = lengths.reduce((a, b) => a + b, 0);
    let start = null;
    const tick = (now) => {
      if (done) return;
      start ??= now;
      let n = Math.floor(((now - start) / 1000) * CHARS_PER_SECOND);
      if (n >= total) return finish();
      texts.forEach((t, k) => {
        renderParagraph(ps[k], t, Math.max(0, Math.min(lengths[k], n)));
        n -= lengths[k];
      });
      scope.frame(tick);
    };
    scope.wait(i === 0 ? 450 : 0).then(() => scope.frame(tick));
  }

  showPage(0);
}

/**
 * Показати в рамці фото або заглушку. Справжнє фото вмикається в
 * secret-config.js (photo.enabled) — до того запит до файлу не виконується.
 * Якщо файл не завантажився — тихо повертаємо заглушку.
 */
export function setRoomPhoto(src) {
  const img = $('#room-photo-img');
  img.style.objectPosition = secretConfig.photo.position;
  img.onerror = () => {
    img.onerror = null;
    img.src = secretConfig.photo.placeholder;
  };
  img.src = src;
}

/** Тепле золоте підсвічування фото (після відкриття подарунка — Етап 6). */
export function setPhotoGlow(on) {
  $('#room-photo').classList.toggle('is-glowing', on);
  $('#room-stage').classList.toggle('is-photo-glow', on);
}
