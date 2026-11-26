/**
 * ui.js — побудова DOM і дрібні візуальні помічники.
 * Тут немає ігрових правил: лише «намалювати» те, що скаже game.js / main.js.
 */
import { CONFIG, REWARDS } from './config.js';

const $ = (sel) => document.querySelector(sel);

/* ---------------- Завантаження ---------------- */

/**
 * Завантажити зображення. Завжди резолвиться (навіть при помилці),
 * щоб відсутній некритичний асет не зупиняв гру.
 */
export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error(`[assets] не вдалося завантажити ${src}`);
      resolve(img);
    };
    img.src = src;
  });
}

/**
 * Перефарбувати сріблястий indicator-filled у колір групи.
 * Multiply зберігає світлотінь оригіналу; результат кешується як data URL.
 */
export function tintImage(img, color) {
  if (!img.naturalWidth) return img.src;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  // Повертаємо частину бліків, щоб метал не став «пласким»
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.25;
  ctx.drawImage(img, 0, 0);
  // Обрізаємо все за формою оригіналу
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

/* ---------------- Сцени ---------------- */

/** Показати одну сцену; data-state на #app керує спільними елементами (кнопка звуку). */
export function showScene(name) {
  document.querySelectorAll('.scene').forEach((s) => {
    s.classList.toggle('is-active', s.dataset.scene === name);
  });
  $('#app').dataset.state = name;
}

/** Підставити тексти з CONFIG.text у елементи з data-text. */
export function applyTexts() {
  document.querySelectorAll('[data-text]').forEach((el) => {
    const value = CONFIG.text[el.dataset.text];
    if (value) el.textContent = value;
  });
}

/* ---------------- Картки ---------------- */

/**
 * Створити DOM однієї картки.
 * @returns {{ el: HTMLElement, canvas: HTMLCanvasElement }}
 */
export function createCardElement(index, reward) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.index = String(index);

  el.innerHTML = `
    <div class="card__bg"></div>
    <div class="card__reward-box">
      <img class="card__reward" src="${reward.discountImg}" alt="" draggable="false">
    </div>
    <canvas class="card__scratch" aria-label="Захисний шар картки ${index + 1}"></canvas>
    <img class="card__frame" src="${CONFIG.assets.cardFrame}" alt="" draggable="false">
  `;
  return { el, canvas: el.querySelector('canvas') };
}

/* ---------------- Трекер ---------------- */

/**
 * Побудувати DISCOUNT TRACKER: 4 групи × CONFIG.game.copiesPerReward індикаторів.
 * @param {Record<number, string>} filledSrc  value → src тонованого індикатора
 * @returns {{ setCount(value: number, count: number): void, reset(): void }}
 */
export function buildTracker(container, filledSrc) {
  const perGroup = CONFIG.game.copiesPerReward;
  container.innerHTML = '';
  const groups = new Map();

  for (const reward of REWARDS) {
    const group = document.createElement('div');
    group.className = 'tracker__group';
    group.style.setProperty('--group-color', reward.colors.main);
    group.innerHTML = `<span class="tracker__label">${reward.value}%</span><div class="tracker__row"></div>`;
    const row = group.querySelector('.tracker__row');
    const items = [];
    for (let i = 0; i < perGroup; i++) {
      const img = document.createElement('img');
      img.className = 'indicator';
      img.src = CONFIG.assets.indicatorEmpty;
      img.alt = '';
      img.draggable = false;
      row.appendChild(img);
      items.push(img);
    }
    container.appendChild(group);
    groups.set(reward.value, { items, count: 0 });
  }

  return {
    setCount(value, count) {
      const g = groups.get(value);
      if (!g) return;
      g.items.forEach((img, i) => {
        const filled = i < count;
        img.src = filled ? filledSrc[value] : CONFIG.assets.indicatorEmpty;
        if (filled && i >= g.count) {
          img.classList.remove('is-filling');
          void img.offsetWidth; // перезапуск анімації
          img.classList.add('is-filling');
        }
      });
      g.count = count;
    },
    reset() {
      for (const [value] of groups) this.setCount(value, 0);
    },
  };
}

/* ---------------- Reward ---------------- */

/**
 * Наповнити екран нагороди.
 * @param {object} reward  елемент REWARDS (заголовок, колір, відсоток, кнопка)
 * @param {{memeIndex: number, phraseIndex: number}} pick  обраний персонаж і фраза
 *        (обирає game.js один раз на результат — повторний рендер нічого не змінює)
 */
export function renderReward(reward, pick) {
  const meme = reward.memes[pick.memeIndex];
  const scene = $('.scene--reward');
  scene.style.setProperty('--reward', reward.colors.main);
  scene.style.setProperty('--reward-dark', reward.colors.dark);
  scene.style.setProperty('--reward-light', reward.colors.light);
  scene.dataset.reward = reward.key;
  scene.dataset.meme = meme.key;

  $('#reward-title').textContent = reward.title;
  $('#reward-discount').src = reward.discountImg;
  $('#reward-discount').alt = `${reward.value}%`;
  $('#reward-meme').src = meme.img;
  $('#reward-meme').alt = meme.alt;

  const stage = $('.reward__stage');
  stage.style.setProperty('--meme-scale', meme.scale ?? 1);
  stage.classList.toggle('has-platform', Boolean(meme.platform));
  const hasShine = reward.scenario?.accent === 'shine';
  stage.classList.toggle('has-shine', hasShine);
  if (hasShine) {
    // Маска відблиску — силует саме того персонажа, що зараз на екрані.
    const shine = stage.querySelector('.reward__shine');
    shine.style.webkitMaskImage = shine.style.maskImage = `url("${meme.img}")`;
  }
  $('#reward-text').textContent = reward.phrases[pick.phraseIndex];
  $('#reward-btn-label').textContent = reward.button;
}

/* ---------------- Кнопки ---------------- */

/**
 * Аркадне натискання. Safari на iPhone не вмикає CSS :active без обробника
 * дотиків, тому стан «натиснуто» ставимо самі через pointer-події,
 * а після відпускання кнопка коротко «відскакує».
 */
export function bindArcadeButtons(root = document) {
  root.querySelectorAll('.arcade-btn').forEach((btn) => {
    const release = () => {
      if (!btn.classList.contains('is-pressed')) return;
      btn.classList.remove('is-pressed');
      btn.classList.add('is-released');
    };
    btn.addEventListener('pointerdown', () => {
      if (btn.disabled) return;
      btn.classList.remove('is-released');
      btn.classList.add('is-pressed');
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('animationend', (e) => {
      if (e.animationName === 'btn-release') btn.classList.remove('is-released');
    });
  });
}

/* ---------------- Повідомлення ---------------- */

const messageTimers = new Map();

/** Коротко показати повідомлення в елементі (тост або системний рядок). */
function flash(el, text, duration) {
  el.textContent = text;
  el.classList.add('is-visible');
  clearTimeout(messageTimers.get(el));
  messageTimers.set(el, setTimeout(() => el.classList.remove('is-visible'), duration));
}

export function toast(text) {
  flash($('#toast'), text, CONFIG.timing.toast);
}

export function systemMessage(text) {
  flash($('#system-msg'), text, CONFIG.timing.lockedHint);
}

/** Прибрати всі повідомлення (новий раунд). */
export function clearMessages() {
  for (const [el, timer] of messageTimers) {
    clearTimeout(timer);
    el.classList.remove('is-visible');
  }
  messageTimers.clear();
}
