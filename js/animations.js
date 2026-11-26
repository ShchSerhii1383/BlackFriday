/**
 * animations.js — складні анімаційні послідовності.
 *
 * Головна ідея стилю: ОДНА неонова лінія з яскравим пікселем-«головою»
 * будує інтерфейс — рамку, логотип, кнопку, сітку карток, зв'язок переможців.
 *
 * Усі послідовності працюють через scope (createScope): таймери, кадри і
 * Web Animations реєструються в ньому, а scope.dispose() зупиняє все разом.
 * Після dispose очікування (wait/frame) просто ніколи не завершуються —
 * послідовність тихо зупиняється, без помилок і «хвостів».
 */
import { CONFIG } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const T = () => CONFIG.timing;

/** Користувач просив менше руху (системне налаштування). */
export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* ================================================================== */
/* Scope — група скасовуваних дій                                      */
/* ================================================================== */

export function createScope() {
  let disposed = false;
  const timers = new Set();
  const frames = new Set();
  const anims = new Set();
  const cleanups = [];

  return {
    get disposed() {
      return disposed;
    },
    /** Пауза. Після dispose проміс не завершується ніколи. */
    wait(ms) {
      return new Promise((resolve) => {
        if (disposed) return;
        const id = setTimeout(() => {
          timers.delete(id);
          if (!disposed) resolve();
        }, ms);
        timers.add(id);
      });
    },
    /** Наступний кадр анімації. */
    frame(cb) {
      if (disposed) return;
      const id = requestAnimationFrame((t) => {
        frames.delete(id);
        if (!disposed) cb(t);
      });
      frames.add(id);
    },
    /** element.animate(), який буде скасовано разом зі scope. */
    animate(el, keyframes, options) {
      if (disposed || !el) return null;
      const a = el.animate(keyframes, options);
      anims.add(a);
      // Анімація з fill 'forwards' після завершення продовжує тримати стан елемента
      // (наприклад, розсунуті половинки серця) — її знімаємо лише при dispose.
      const holdsState = options?.fill === 'forwards' || options?.fill === 'both';
      a.finished.then(() => !holdsState && anims.delete(a), () => anims.delete(a));
      return a;
    },
    /** Дочекатися завершення анімації (якщо її не скасовано). */
    finished(anim) {
      return new Promise((resolve) => {
        if (!anim) return resolve();
        anim.finished.then(() => !disposed && resolve(), () => {});
      });
    },
    /** Що прибрати при dispose (наприклад, сховати оверлей). */
    onDispose(fn) {
      cleanups.push(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
      anims.forEach((a) => a.cancel());
      cleanups.forEach((fn) => fn());
      timers.clear();
      frames.clear();
      anims.clear();
    },
  };
}

/* ================================================================== */
/* Неонова лінія                                                       */
/* ================================================================== */

/** Прямокутник елемента в координатах #app. */
export function relRect(el, app) {
  const a = app.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    l: r.left - a.left, t: r.top - a.top, r: r.right - a.left, b: r.bottom - a.top,
    w: r.width, h: r.height,
    cx: r.left - a.left + r.width / 2, cy: r.top - a.top + r.height / 2,
  };
}

/**
 * Підготувати SVG-шар: без viewBox, тож 1 одиниця = 1 CSS px від лівого верхнього
 * кута #app. (З viewBox браузер масштабував би вже намальоване, якщо висота екрана
 * зміниться — наприклад, коли у вбудованому браузері з'являється панель.)
 */
export function fitLineLayer(svg) {
  svg.removeAttribute('viewBox');
}

export function clearLines(svg) {
  svg.replaceChildren();
}

function polyLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len;
}

function pointAt(points, dist) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (dist <= seg) {
      const k = seg ? dist / seg : 0;
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
    dist -= seg;
  }
  return points[points.length - 1];
}

function makePath(svg, points, stroke, width, opacity) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', width);
  p.setAttribute('stroke-linecap', 'square');
  p.setAttribute('stroke-linejoin', 'miter');
  p.setAttribute('opacity', opacity);
  svg.appendChild(p);
  return p;
}

/** Піксель-«голова» лінії (один на SVG-шар). */
function getHead(svg) {
  let head = svg.querySelector('.line-head');
  if (!head) {
    head = document.createElementNS(SVG_NS, 'rect');
    head.setAttribute('class', 'line-head');
    head.setAttribute('width', 6);
    head.setAttribute('height', 6);
    svg.appendChild(head);
  }
  svg.appendChild(head); // завжди поверх ліній
  return head;
}

function moveHead(head, [x, y]) {
  head.setAttribute('x', (x - 3).toFixed(1));
  head.setAttribute('y', (y - 3).toFixed(1));
}

/**
 * Намалювати ламану неоновою лінією з постійною швидкістю.
 * Довжина квантується кроком 3 px — рух виглядає «піксельним».
 * @returns {Promise<SVGPathElement[]>} створені шляхи (ядро + світіння)
 */
export function drawPolyline(scope, svg, points, { duration, color = '#FF79F4', glow = '#D000ED' }) {
  return new Promise((resolve) => {
    const len = polyLength(points);
    const halo = makePath(svg, points, glow, 7, 0.35);
    const core = makePath(svg, points, color, 2.5, 1);
    for (const p of [halo, core]) {
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = len;
    }
    const head = getHead(svg);
    head.style.fill = '#FFFFFF';
    head.style.opacity = 1;

    let start = null;
    const tick = (now) => {
      start ??= now;
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      const drawn = t === 1 ? len : Math.round((t * len) / 3) * 3;
      halo.style.strokeDashoffset = core.style.strokeDashoffset = len - drawn;
      moveHead(head, pointAt(points, drawn));
      if (t < 1) scope.frame(tick);
      else resolve([halo, core]);
    };
    scope.frame(tick);
  });
}

/** Погасити й прибрати вже пройдені відрізки — за лінією лишається лише короткий слід. */
function fadeTrail(scope, paths, duration = 420) {
  for (const p of paths) {
    const a = scope.animate(p, [{ opacity: p.getAttribute('opacity') }, { opacity: 0 }], {
      duration, easing: 'steps(5)', fill: 'forwards',
    });
    scope.finished(a).then(() => p.remove());
  }
}

/** Плавно погасити всі лінії шару і очистити його. */
async function fadeLines(scope, svg, duration = 260) {
  const a = scope.animate(svg, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'steps(4)' });
  await scope.finished(a);
  clearLines(svg);
}

/** Розкрити елемент «шторкою» синхронно з лінією, що проходить уздовж нього. */
function revealAlong(scope, el, duration, fromRight = false) {
  const hidden = fromRight ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';
  const a = scope.animate(el, [{ clipPath: hidden }, { clipPath: 'inset(0 0 0 0)' }], {
    duration, easing: 'steps(8)', fill: 'forwards',
  });
  el.classList.remove('intro-hidden');
  // Після анімації знімаємо clip-path повністю, щоб він не обрізав тіні й пульсацію.
  scope.finished(a).then(() => a.cancel());
  return a;
}

/* ================================================================== */
/* Scene 01 — INTRO / BOOT SEQUENCE                                    */
/* ================================================================== */

/**
 * Інтро: піксель → лінія обводить рамку екрана → підкреслює й «відкриває»
 * логотип, заголовок, підказку → обводить кнопку START GAME.
 * Пройдені відрізки гаснуть слідом за лінією, тож вона ніколи не лишається поверх тексту.
 * Якщо під час інтро зміниться розмір екрана (поворот, панель браузера), інтро
 * одразу завершується готовим екраном — лінії не малюються по застарілих координатах.
 * @param {object} els  { app, svg, frame, logo, title, hint, button, sound }
 */
export async function playIntro(scope, els) {
  const targets = [els.logo, els.title, els.hint, els.button, els.sound];
  const revealAll = () => {
    targets.forEach((el) => el.classList.remove('intro-hidden'));
    els.app.classList.add('has-frame');
  };
  scope.onDispose(() => {
    revealAll();
    clearLines(els.svg);
  });

  if (prefersReducedMotion()) {
    revealAll();
    return;
  }

  targets.forEach((el) => el.classList.add('intro-hidden'));
  els.app.classList.remove('has-frame');
  fitLineLayer(els.svg);
  clearLines(els.svg);
  els.svg.style.opacity = 1;

  // Зміна розміру екрана → завершити інтро достроково.
  const draw = createScope();
  scope.onDispose(() => draw.dispose());
  const resized = new Promise((resolve) => {
    const start = els.app.getBoundingClientRect();
    const ro = new ResizeObserver(() => {
      const now = els.app.getBoundingClientRect();
      if (Math.abs(now.width - start.width) > 2 || Math.abs(now.height - start.height) > 2) resolve();
    });
    ro.observe(els.app);
    scope.onDispose(() => ro.disconnect());
    draw.onDispose(() => ro.disconnect());
  });

  await Promise.race([introSequence(draw, els), resized]);
  draw.dispose();
  if (scope.disposed) return;
  revealAll();
  els.svg.style.opacity = '';
  clearLines(els.svg);
}

/** Власне послідовність ліній інтро (окремий scope, щоб її можна було обірвати). */
async function introSequence(scope, els) {
  const A = els.app.getBoundingClientRect();
  const F = relRect(els.frame, els.app);
  const L = relRect(els.logo, els.app);
  const Ti = relRect(els.title, els.app);
  const H = relRect(els.hint, els.app);
  const B = relRect(els.button, els.app);
  const cx = A.width / 2;
  const svg = els.svg;
  const gap = 9; // відступ лінії від тексту
  const speed = (px) => px / T().introLineSpeed * 1000; // мс для відрізка довжиною px

  // Порожня горизонталь між підказкою і кнопкою — тут народжується піксель.
  const midY = (H.b + B.t) / 2;

  // 1. Поява стартового пікселя: кілька блимань.
  const head = getHead(svg);
  head.style.fill = '#FFB5FF';
  moveHead(head, [cx, midY]);
  const blink = scope.animate(head, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], {
    duration: T().introPixel, easing: 'steps(4)', fill: 'forwards',
  });
  await scope.finished(blink);

  // 2–3. Лінія йде вліво порожньою серединою і обводить рамку екрана.
  //      Щойно рамка замкнулась, її бере на себе CSS-рамка, а намальована гасне.
  const frameLoop = [
    [cx, midY], [F.l, midY], [F.l, F.t], [F.r, F.t], [F.r, F.b], [F.l, F.b], [F.l, midY],
  ];
  const framePaths = await drawPolyline(scope, svg, frameLoop, { duration: T().introFrame });
  els.app.classList.add('has-frame');
  fadeTrail(scope, framePaths);

  // 4. Лінія підіймається вздовж рамки і йде під логотипом — логотип «друкується» слідом.
  const yL = L.b + gap;
  const toLogo = await drawPolyline(scope, svg, [[F.l, midY], [F.l, yL], [L.l, yL]], { duration: speed(midY - yL + L.l - F.l) });
  fadeTrail(scope, toLogo);
  const logoDur = speed(L.w);
  revealAlong(scope, els.logo, logoDur);
  const underLogo = await drawPolyline(scope, svg, [[L.l, yL], [L.r, yL]], { duration: logoDur });
  fadeTrail(scope, underLogo);

  // 5. Заголовок (справа наліво) і підказка (зліва направо) — лінія під кожним рядком.
  const yT = Ti.b + gap;
  const toTitle = await drawPolyline(scope, svg, [[L.r, yL], [L.r, yT], [Ti.r, yT]], { duration: speed(yT - yL + L.r - Ti.r) });
  fadeTrail(scope, toTitle);
  const titleDur = speed(Ti.w);
  revealAlong(scope, els.title, titleDur, true);
  const underTitle = await drawPolyline(scope, svg, [[Ti.r, yT], [Ti.l, yT]], { duration: titleDur });
  fadeTrail(scope, underTitle);

  const yH = H.b + gap;
  const toHint = await drawPolyline(scope, svg, [[Ti.l, yT], [Math.min(Ti.l, H.l), yT], [Math.min(Ti.l, H.l), yH], [H.l, yH]],
    { duration: speed(yH - yT + Math.abs(Ti.l - H.l)) });
  fadeTrail(scope, toHint);
  const hintDur = speed(H.w);
  revealAlong(scope, els.hint, hintDur);
  const underHint = await drawPolyline(scope, svg, [[H.l, yH], [H.r, yH]], { duration: hintDur });
  fadeTrail(scope, underHint);

  // 6. Лінія спускається до кнопки й обводить її — кнопка вмикається.
  const pad = 4;
  const box = { l: B.l + pad, r: B.r - pad, t: B.t + pad, b: B.b - pad };
  const toButton = await drawPolyline(scope, svg, [[H.r, yH], [Math.max(H.r, box.r), yH], [Math.max(H.r, box.r), box.t], [box.r, box.t]],
    { duration: speed(Math.abs(box.r - H.r) + box.t - yH) });
  fadeTrail(scope, toButton);
  const outline = [[box.r, box.t], [box.r, box.b], [box.l, box.b], [box.l, box.t], [box.r, box.t]];
  const btnDur = speed(polyLength(outline));
  revealAlong(scope, els.button, btnDur, true);
  await drawPolyline(scope, svg, outline, { duration: btnDur });

  // 7. Спалах кнопки, лінії гаснуть, з'являється іконка звуку.
  scope.animate(els.button, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 300, easing: 'steps(4)' });
  els.sound.classList.remove('intro-hidden');
  scope.animate(els.sound, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'steps(4)' });
  await fadeLines(scope, svg);
}

/* ================================================================== */
/* Scene 03 — промальовування сітки карток                             */
/* ================================================================== */

/**
 * Лінія «змійкою» проходить між рядами, відкриваючи картки ряд за рядом,
 * потім між колонками. Поки сітка будується, поле не приймає дотиків.
 */
export async function buildGrid(scope, { svg, app, board, cards, columns = 3 }) {
  const finish = () => {
    board.classList.remove('is-building');
    cards.forEach((el) => el.classList.remove('is-built'));
  };
  scope.onDispose(() => {
    finish();
    clearLines(svg);
  });
  if (prefersReducedMotion() || !cards.length) {
    finish();
    return;
  }

  board.classList.add('is-building');
  fitLineLayer(svg);
  clearLines(svg);
  svg.style.opacity = 1;

  const rects = cards.map((el) => relRect(el, app));
  const rows = Math.ceil(cards.length / columns);
  const gapX = columns > 1 ? (rects[1].l - rects[0].r) / 2 : 4;
  const gapY = rows > 1 ? (rects[columns].t - rects[0].b) / 2 : 4;
  const xs = [rects[0].l - gapX];
  for (let c = 0; c < columns; c++) xs.push(rects[c].r + gapX);
  const ys = [rects[0].t - gapY];
  for (let r = 0; r < rows; r++) ys.push(rects[r * columns].b + gapY);
  const left = xs[0];
  const right = xs[xs.length - 1];
  const top = ys[0];
  const bottom = ys[ys.length - 1];

  // Горизонтальна змійка: верх → між рядами → низ.
  const hPoints = [];
  ys.forEach((y, i) => {
    const [a, b] = i % 2 === 0 ? [left, right] : [right, left];
    hPoints.push([a, y], [b, y]);
  });
  const rowDur = T().gridDraw * 0.6 / ys.length;
  // Ряд карток з'являється, коли лінія проходить під ним.
  for (let r = 0; r < rows; r++) {
    scope.wait(rowDur * (r + 1)).then(() => {
      cards.slice(r * columns, (r + 1) * columns).forEach((el) => el.classList.add('is-built'));
    });
  }
  await drawPolyline(scope, svg, hPoints, { duration: T().gridDraw * 0.6 });

  // Вертикальна змійка між колонками (від того краю, де закінчилась горизонтальна).
  const endX = hPoints[hPoints.length - 1][0];
  const cols = endX === right ? xs.slice().reverse() : xs;
  const vPoints = [];
  cols.forEach((x, i) => {
    const [a, b] = i % 2 === 0 ? [bottom, top] : [top, bottom];
    vPoints.push([x, a], [x, b]);
  });
  await drawPolyline(scope, svg, vPoints, { duration: T().gridDraw * 0.4 });

  await fadeLines(scope, svg);
  svg.style.opacity = '';
  finish();
}

/* ================================================================== */
/* Scene 04 — лінія між переможними картками                          */
/* ================================================================== */

/** З'єднати центри переможних карток ламаною «як на схемі» в кольорі нагороди. */
export async function drawMatchLine(scope, { svg, app, cards, colors }) {
  fitLineLayer(svg);
  clearLines(svg);
  svg.style.opacity = 1;
  const centers = cards.map((el) => {
    const r = relRect(el, app);
    return [r.cx, r.cy];
  });
  const points = [centers[0]];
  for (let i = 1; i < centers.length; i++) {
    const [px, py] = centers[i - 1];
    const [x, y] = centers[i];
    if (px !== x && py !== y) points.push([x, py]); // прямий кут
    points.push([x, y]);
  }
  const duration = prefersReducedMotion() ? 0 : T().matchLine;
  await drawPolyline(scope, svg, points, { duration, color: colors.light, glow: colors.main });
  getHead(svg).style.fill = colors.light;
}

/* ================================================================== */
/* Перехід між сценами — піксельна «шторка» зі смуг                    */
/* ================================================================== */

/**
 * Смуги закривають екран зліва направо, сцена змінюється, смуги відкривають.
 * Поки шторка активна, вона перехоплює всі дотики.
 */
export async function wipe(scope, swap, color = '#210C2C') {
  const overlay = document.getElementById('wipe');
  if (prefersReducedMotion() || !overlay) {
    swap();
    return;
  }
  const stripes = [...overlay.children];
  overlay.style.setProperty('--wipe-color', color);
  overlay.classList.add('is-active');
  scope.onDispose(() => overlay.classList.remove('is-active'));

  const half = T().sceneWipe / 2;
  const run = (from, to) => stripes.map((s, i) =>
    scope.animate(s, [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], {
      duration: half, delay: i * 12, easing: 'steps(6)', fill: 'forwards',
    }));

  stripes.forEach((s) => (s.style.transformOrigin = 'left center'));
  await Promise.all(run(0, 1).map((a) => scope.finished(a)));
  swap();
  stripes.forEach((s) => (s.style.transformOrigin = 'right center'));
  await Promise.all(run(1, 0).map((a) => scope.finished(a)));
  overlay.classList.remove('is-active');
  stripes.forEach((s) => s.getAnimations().forEach((a) => a.cancel()));
}

/* ================================================================== */
/* Scene 05 — анімовані фінальні сценарії                              */
/* ================================================================== */

/** Елементи екрана нагороди, що з'являються по черзі. */
const STAGE_ITEMS = ['#reward-title', '#reward-discount', '.reward__stage', '#reward-text', '#reward-btn'];

/**
 * Сховати елементи екрана нагороди перед показом сцени
 * (викликається всередині wipe, поки екран закритий шторкою).
 */
export function stageReward(scene) {
  if (prefersReducedMotion()) return;
  scene.classList.add('is-staged');
  STAGE_ITEMS.forEach((sel) => scene.querySelector(sel)?.classList.remove('is-on'));
}

/** Показати схований елемент із вхідною анімацією. */
function enter(scope, el, keyframes, duration, steps = 6) {
  el.classList.add('is-on');
  return scope.animate(el, keyframes, { duration, easing: `steps(${steps})` });
}

const ENTRANCES = {
  discount: {
    drop: [
      { transform: 'translateY(-48px)', opacity: 0 },
      { transform: 'translateY(6px)', opacity: 1, offset: 0.7 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    zoom: [
      { transform: 'scale(2.6)', opacity: 0, filter: 'brightness(3)' },
      { transform: 'scale(0.88)', opacity: 1, filter: 'brightness(1.6)', offset: 0.6 },
      { transform: 'scale(1.06)', offset: 0.8 },
      { transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
    ],
  },
  meme: {
    split: [
      { transform: 'scale(0.4)', opacity: 0 },
      { transform: 'scale(1.08)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    pop: [
      { transform: 'scale(0.4)', opacity: 0 },
      { transform: 'scale(1.08)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    bounce: [
      { transform: 'translateY(-70%)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1, offset: 0.45 },
      { transform: 'translateY(-14%)', offset: 0.62 },
      { transform: 'translateY(0)', offset: 0.78 },
      { transform: 'translateY(-4%)', offset: 0.89 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    rise: [
      { transform: 'translateY(30%) scale(0.6)', opacity: 0, filter: 'brightness(3)' },
      { transform: 'translateY(-4%) scale(1.08)', opacity: 1, filter: 'brightness(1.8)', offset: 0.7 },
      { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
    ],
  },
};

/**
 * Програти фінальний сценарій нагороди. Усі чотири фінали проходять цей
 * самий шлях; відмінності описані в REWARDS[...].scenario (config.js).
 *
 * Порядок за ТЗ: спалах/хвиля → (золотий контур) → заголовок → відсоток →
 * персонаж → частинки/акцент → мемний текст → активація кнопки.
 */
export async function playReward(scope, { reward, scene, app, svg, frame, particles }) {
  const s = reward.scenario || {};
  const c = reward.colors;
  const q = (sel) => scene.querySelector(sel);
  const title = q('#reward-title');
  const discount = q('#reward-discount');
  const stage = q('.reward__stage');
  const text = q('#reward-text');
  const button = q('#reward-btn');

  const finish = () => {
    scene.classList.remove('is-staged');
    STAGE_ITEMS.forEach((sel) => q(sel)?.classList.remove('is-on'));
  };
  scope.onDispose(() => {
    finish();
    clearLines(svg);
    app.classList.remove('is-legendary');
    stage.classList.remove('is-idle');
  });

  if (prefersReducedMotion()) {
    finish();
    if (s.outline) app.classList.add('is-legendary');
    if (s.meme === 'split') splitHalves(scope, scene, 0);
    return;
  }

  const center = (el) => {
    const r = relRect(el, app);
    return [r.cx, r.cy, r];
  };

  // 1. Спалах або енергетична хвиля.
  if (s.burst === 'wave') {
    const wave = q('.reward__wave');
    scope.animate(wave, [
      { transform: 'translate(-50%, -50%) scale(0.1)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(3.2)', opacity: 0 },
    ], { duration: 700, easing: 'steps(10)' });
  } else {
    scope.animate(q('.reward__flash'), [{ opacity: 0 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0 }],
      { duration: 380, easing: 'steps(5)' });
  }

  // 2. Легендарна нагорода: золота лінія обводить рамку екрана.
  if (s.outline) {
    fitLineLayer(svg);
    clearLines(svg);
    const F = relRect(frame, app);
    const loop = [[F.l, F.b], [F.l, F.t], [F.r, F.t], [F.r, F.b], [F.l, F.b]];
    drawPolyline(scope, svg, loop, { duration: 900, color: c.light, glow: c.main }).then(async () => {
      app.classList.add('is-legendary');
      await fadeLines(scope, svg, 300);
    });
  }
  await scope.wait(200);

  // 3. Назва категорії.
  title.classList.add('is-on');
  revealAlong(scope, title, 380);
  if (s.titleFx === 'glitch') {
    // Pixel Glitch: після появи заголовок коротко «збоїть», як екран старого автомата.
    scope.wait(420).then(() => {
      title.classList.add('is-glitch');
      scope.wait(560).then(() => title.classList.remove('is-glitch'));
    });
    scope.onDispose(() => title.classList.remove('is-glitch'));
  }
  await scope.wait(320);

  // 4. Великий відсоток.
  const zoom = s.discount === 'zoom';
  enter(scope, discount, ENTRANCES.discount[zoom ? 'zoom' : 'drop'], zoom ? 620 : 420, zoom ? 10 : 6);
  if (zoom) {
    await scope.wait(380);
    const [x, y] = center(discount);
    particles.burst(x, y, [c.main, c.light, '#FFFFFF'], 26, 220);
    await scope.wait(240);
  } else {
    await scope.wait(380);
  }

  // 5. Персонаж.
  const memeDur = { split: 360, pop: 420, bounce: 820, rise: 720 }[s.meme] || 420;
  await scope.finished(enter(scope, stage, ENTRANCES.meme[s.meme] || ENTRANCES.meme.pop, memeDur, s.meme === 'bounce' ? 16 : 8));
  const [mx, my, mr] = center(stage);

  // 6. Частинки та акценти персонажа.
  if (s.meme === 'split') {
    splitHalves(scope, scene, 520);
    particles.rain([c.main, c.light, c.dark], 26, { x0: mx - mr.w * 0.12, x1: mx + mr.w * 0.12, y: mr.t + mr.h * 0.3 });
    particles.rain([c.main, c.dark], 18, { x0: mr.l, x1: mr.r, y: -10 });
  }
  if (s.particles === 'sparkle') {
    particles.burst(mx, my, [c.main, c.light, '#FFFFFF'], 28);
    scope.wait(260).then(() => particles.burst(mx, mr.t + mr.h * 0.25, [c.main, c.light], 18, 150));
  }
  if (s.accent === 'shine') {
    const shine = q('.reward__shine');
    scope.wait(120).then(() => scope.animate(shine, [
      // При background-size 300% смуга проходить увесь силует саме на цьому відрізку
      { backgroundPosition: '85% 0', opacity: 1 },
      { backgroundPosition: '15% 0', opacity: 1 },
    ], { duration: 650, easing: 'steps(12)' }));
  }
  if (s.particles === 'celebration') celebrate(scope, { particles, app, c, stageRect: mr });
  if (s.meme !== 'split') stage.classList.add('is-idle');
  await scope.wait(380);

  // 7. Мемний текст «друкується» зліва направо.
  text.classList.add('is-on');
  revealAlong(scope, text, 520);
  await scope.wait(480);

  // 8. Активація кнопки.
  await scope.finished(enter(scope, button, [
    { transform: 'scale(0.85)', opacity: 0 },
    { transform: 'scale(1.04)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1)', opacity: 1 },
  ], 280, 5));
  finish();
}

/** Розсунути половинки розбитого серця по лінії розлому (стан зберігається). */
function splitHalves(scope, scene, duration) {
  const [left, right] = scene.querySelectorAll('.reward__meme-half');
  const opts = { duration, easing: 'steps(6)', fill: 'forwards' };
  scope.animate(left, [{ transform: 'none' }, { transform: 'translate(-6%, 2%) rotate(-7deg)' }], opts);
  scope.animate(right, [{ transform: 'none' }, { transform: 'translate(6%, 3%) rotate(7deg)' }], opts);
}

/** LEGENDARY DROP: золотий піксельний салют, веселкові частинки і конфеті. */
function celebrate(scope, { particles, app, c, stageRect }) {
  const { width, height } = app.getBoundingClientRect();
  const gold = [c.main, c.light, '#FFFFFF'];
  const rainbow = CONFIG.particles.rainbow;
  particles.burst(stageRect.cx, stageRect.cy, rainbow, 30, 230);
  particles.confetti([...rainbow, c.main], 60);
  for (let i = 0; i < 5; i++) {
    scope.wait(180 + i * 240).then(() => {
      const x = width * (0.18 + Math.random() * 0.64);
      const y = height * (0.1 + Math.random() * 0.3);
      particles.burst(x, y, i % 2 ? rainbow : gold, 22, 210);
    });
  }
}
