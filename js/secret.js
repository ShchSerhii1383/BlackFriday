/**
 * secret.js — сцени SECRET LEVEL (ТЗ 2.0, розділ 11):
 *   A. System Glitch      — екран результату «збоїть», SYSTEM ERROR → UNKNOWN REWARD DETECTED
 *   B. Hidden Achievement — медаль SALES QUEEN складається з пікселів
 *   C. Secret Portal      — портал формується з частинок, ENTER SECRET ROOM, прохід крізь портал
 *
 * Кожна функція — одна сцена; таймери й анімації йдуть через scope стану
 * (animations.js → createScope), тож перехід в інший стан зупиняє все одразу.
 * Порядок і переходи між сценами вирішує game.js (state machine).
 */
import { CONFIG } from './config.js';
import { secretConfig } from './secret-config.js';
import { prefersReducedMotion, relRect } from './animations.js';
import { showScene } from './ui.js';

const T = () => CONFIG.timing;
const $ = (sel) => document.querySelector(sel);
const GOLD = ['#FFBF32', '#FFF1A3', '#FFFFFF'];
const VIOLET = ['#B64BFF', '#D000ED', '#FF79F4'];

/* ================================================================== */
/* Асети                                                               */
/* ================================================================== */

let preloaded = false;

/**
 * Непомітно завантажити графіку секрету: зображення в розмітці мають лише data-src,
 * тож до цього виклику жодного запиту не відбувається (ТЗ 2.0, розділ 24).
 */
export function preloadSecretAssets() {
  if (preloaded) return;
  preloaded = true;
  document.querySelectorAll('img[data-src]').forEach((img) => {
    if (!img.getAttribute('src')) img.src = img.dataset.src;
  });
  // Фото в рамці теж наперед, щоб у кімнаті воно з'явилося одразу, а не з затримкою.
  if (secretConfig.photo.enabled) new Image().src = secretConfig.photo.src;
}

/** Дочекатися, поки зображення готове до малювання (не довше за timeout). */
function ready(img, timeout = 4000) {
  preloadSecretAssets();
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return Promise.race([
    img.decode ? img.decode().catch(() => {}) : new Promise((r) => img.addEventListener('load', r, { once: true })),
    new Promise((r) => setTimeout(r, timeout)),
  ]);
}

/* ================================================================== */
/* Допоміжне                                                            */
/* ================================================================== */

/** Сховати текстові елементи кроку до моменту їх появи. */
function hide(...els) {
  els.forEach((el) => {
    el.style.visibility = 'hidden';
  });
}

/** Текст «друкується» зліва направо сходинками (по одній на символ). */
function typeIn(scope, el, duration) {
  el.style.visibility = 'visible';
  const steps = Math.max(6, el.textContent.length);
  return scope.animate(el, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
    { duration: prefersReducedMotion() ? 0 : duration, easing: `steps(${steps})` });
}

/**
 * Зображення складається з квадратних блоків у випадковому порядку
 * (canvas поверх <img>), після чого canvas ховається і лишається чіткий <img>.
 */
function assemble(scope, wrap, img, duration) {
  const canvas = wrap.querySelector('.secret__assemble');
  if (prefersReducedMotion() || !img.naturalWidth) {
    wrap.classList.remove('is-assembling');
    return Promise.resolve();
  }
  wrap.classList.add('is-assembling');
  const box = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Де саме намальоване зображення всередині блоку (object-fit: contain)
  const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2;

  const n = 16;
  const order = [...Array(n * n).keys()]; // порядок блоків перемішується Fisher–Yates
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const sw = img.naturalWidth / n;
  const sh = img.naturalHeight / n;

  return new Promise((resolve) => {
    let drawn = 0;
    let start = null;
    const tick = (now) => {
      start ??= now;
      const target = Math.min(order.length, Math.ceil(((now - start) / duration) * order.length));
      for (; drawn < target; drawn++) {
        const k = order[drawn];
        const cx = k % n;
        const cy = Math.floor(k / n);
        ctx.drawImage(img, cx * sw, cy * sh, sw, sh,
          Math.floor(dx + cx * (dw / n)), Math.floor(dy + cy * (dh / n)), Math.ceil(dw / n) + 1, Math.ceil(dh / n) + 1);
      }
      if (drawn < order.length) scope.frame(tick);
      else {
        wrap.classList.remove('is-assembling');
        resolve();
      }
    };
    scope.frame(tick);
  });
}

/** Цифрові перешкоди: короткі горизонтальні смужки на окремому canvas (~15 кадрів/с). */
function startNoise(scope, canvas) {
  if (prefersReducedMotion()) return () => {};
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const colors = ['rgba(255,255,255,0.35)', 'rgba(255,40,80,0.4)', 'rgba(40,220,255,0.4)', 'rgba(208,0,237,0.35)'];
  let running = true;
  let last = 0;
  const tick = (now) => {
    if (!running) return;
    if (now - last > 66) {
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
        ctx.fillRect((Math.random() * canvas.width) | 0, (Math.random() * canvas.height) | 0,
          4 + ((Math.random() * 60) | 0), 2 + ((Math.random() * 4) | 0));
      }
    }
    scope.frame(tick);
  };
  scope.frame(tick);
  const stop = () => {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  scope.onDispose(stop);
  return stop;
}

/* ================================================================== */
/* Етап A — System Glitch                                               */
/* ================================================================== */

/**
 * @param {object} ctx  { app, scene (#secret), from (сцена, що «збоїть») }
 */
export async function playGlitch(scope, { app, scene, from }) {
  const dim = scene.querySelector('.secret__dim');
  const line1 = $('#secret-error-1');
  const line2 = $('#secret-error-2');
  line1.classList.remove('is-on');
  line2.classList.remove('is-on');
  hide(line1, line2);

  // Секретна сцена лягає прозорим шаром поверх поточної, яка починає «збоїти».
  scene.dataset.step = 'glitch';
  scene.classList.add('is-active');
  from.classList.add('is-glitching');
  app.classList.add('is-crt-strong');
  scope.onDispose(() => {
    from.classList.remove('is-glitching');
    app.classList.remove('is-crt-strong');
  });
  const stopNoise = startNoise(scope, $('#secret-noise'));

  await scope.wait(prefersReducedMotion() ? 200 : T().secretGlitch);

  // Коротке плавне затемнення (без різких спалахів).
  await scope.finished(scope.animate(dim, [{ opacity: 0 }, { opacity: 1 }],
    { duration: 420, easing: 'steps(6)', fill: 'forwards' }));
  from.classList.remove('is-glitching');
  showScene('secret');
  scene.dataset.step = 'error';

  // SYSTEM ERROR — з'являється і двічі повільно блимає.
  line1.classList.add('is-on');
  line1.style.visibility = 'visible';
  scope.animate(line1, [{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }],
    { duration: 900, easing: 'steps(1)' });
  await scope.wait(T().secretErrorHold);

  // UNKNOWN REWARD DETECTED — «друкується».
  line2.classList.add('is-on');
  await scope.finished(typeIn(scope, line2, T().secretErrorType));
  await scope.wait(600);
  stopNoise();
  app.classList.remove('is-crt-strong');
}

/* ================================================================== */
/* Етап B — Hidden Achievement                                          */
/* ================================================================== */

export async function playAchievement(scope, { app, scene, particles }) {
  const step = scene.querySelector('.secret__achievement');
  const [kicker, sub] = step.querySelectorAll('.secret__kicker');
  const title = step.querySelector('.secret__title');
  const wrap = step.querySelector('.secret__badge-wrap');
  const img = $('#secret-badge');

  showScene('secret');
  scene.dataset.step = 'achievement';
  wrap.classList.remove('is-alive');
  wrap.classList.add('is-assembling');
  hide(kicker, title, sub);
  scope.onDispose(() => wrap.classList.remove('is-alive', 'is-assembling'));

  typeIn(scope, kicker, 600);
  await ready(img);

  // Золоті пікселі злітаються, і з них складається медаль.
  const r = relRect(wrap, app);
  particles.converge(r.cx, r.cy, GOLD, 70, { radius: Math.max(r.w, r.h) * 0.9, life: T().secretAssemble });
  await assemble(scope, wrap, img, T().secretAssemble);

  // Плавне збільшення, блиск, зірочки, легка пульсація.
  await scope.finished(scope.animate(wrap, [
    { transform: 'scale(0.82)', filter: 'brightness(1.8)' },
    { transform: 'scale(1.06)', filter: 'brightness(1.3)', offset: 0.6 },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ], { duration: prefersReducedMotion() ? 0 : 620, easing: 'steps(8)' }));
  wrap.classList.add('is-alive');
  particles.burst(r.cx, r.cy, GOLD, 30, 200);

  await scope.finished(typeIn(scope, title, 520));
  await scope.finished(typeIn(scope, sub, 520));
  await scope.wait(T().secretBadgeHold);
}

/* ================================================================== */
/* Етап C — Secret Portal                                               */
/* ================================================================== */

export async function playPortal(scope, { app, scene, particles, button }) {
  const step = scene.querySelector('.secret__portal');
  const kicker = step.querySelector('.secret__kicker');
  const title = step.querySelector('.secret__title');
  const wrap = step.querySelector('.secret__portal-wrap');
  const img = $('#secret-portal');

  showScene('secret');
  scene.dataset.step = 'portal';
  wrap.classList.remove('is-alive');
  wrap.classList.add('is-assembling');
  hide(kicker, title, button);
  button.disabled = true;
  scope.onDispose(() => {
    wrap.classList.remove('is-alive', 'is-assembling');
    button.style.visibility = '';
  });

  typeIn(scope, kicker, 600);
  await ready(img);

  // Портал поступово формується із золотих та фіолетових частинок.
  const r = relRect(wrap, app);
  particles.converge(r.cx, r.cy, [...GOLD, ...VIOLET], 90, { radius: Math.max(r.w, r.h) * 0.8, life: T().secretAssemble * 1.2 });
  await assemble(scope, wrap, img, T().secretAssemble * 1.2);
  wrap.classList.add('is-alive');

  await scope.finished(typeIn(scope, title, 600));

  // Кнопка ENTER SECRET ROOM — на тому ж місці, що START і CLAIM.
  button.style.visibility = 'visible';
  await scope.finished(scope.animate(button, [
    { transform: 'scale(0.85)', opacity: 0 },
    { transform: 'scale(1.04)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1)', opacity: 1 },
  ], { duration: prefersReducedMotion() ? 0 : 280, easing: 'steps(5)' }));
  button.disabled = false;
  button.classList.add('is-pulse');
}

/**
 * Прохід крізь портал: портал наближається, світіння посилюється,
 * золоті й рожеві частинки заповнюють екран, теплий спалах.
 */
export async function playPortalEnter(scope, { app, scene, particles, button }) {
  const step = scene.querySelector('.secret__portal');
  const wrap = step.querySelector('.secret__portal-wrap');
  const head = step.querySelector('.secret__portal-head');
  const whiteout = scene.querySelector('.secret__whiteout');
  const dur = prefersReducedMotion() ? 0 : T().portalEnter;
  button.classList.remove('is-pulse');

  const fade = [{ opacity: 1 }, { opacity: 0 }];
  scope.animate(head, fade, { duration: dur * 0.3, easing: 'steps(4)', fill: 'forwards' });
  scope.animate(button, fade, { duration: dur * 0.3, easing: 'steps(4)', fill: 'forwards' });
  scope.animate(wrap, [
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.6)', filter: 'brightness(1.5)', offset: 0.5 },
    { transform: 'scale(3.6)', filter: 'brightness(2.4)' },
  ], { duration: dur, easing: 'steps(14)', fill: 'forwards' });

  const r = relRect(wrap, app);
  const pink = ['#FF79F4', '#FFB5FF', '#FF8FC8'];
  for (let i = 0; i < 4; i++) {
    scope.wait(i * dur * 0.18).then(() => particles.burst(r.cx, r.cy, i % 2 ? pink : GOLD, 40, 260 + i * 60));
  }
  await scope.wait(dur * 0.55);
  await scope.finished(scope.animate(whiteout, [{ opacity: 0 }, { opacity: 1 }],
    { duration: dur * 0.45, easing: 'steps(6)', fill: 'forwards' }));
}

/** Кімната проявляється з того самого теплого спалаху. */
export function revealRoom(scope, roomScene) {
  const fade = roomScene.querySelector('.room__fade');
  if (!fade) return;
  scope.animate(fade, [{ opacity: 1 }, { opacity: 0 }],
    { duration: prefersReducedMotion() ? 0 : 700, easing: 'steps(7)', fill: 'forwards' });
}
