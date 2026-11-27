/**
 * storage.js — безпечне збереження даних гри в localStorage.
 *
 * Гра НІКОЛИ не падає через сховище:
 *  - localStorage недоступний (приватний режим, заборона в налаштуваннях,
 *    вбудований браузер) → дані живуть у пам'яті до закриття сторінки;
 *  - пошкоджений JSON або чужий формат → тихо починаємо з чистих даних;
 *  - переповнене сховище → запис пропускається, гра продовжується.
 *
 * Усі дані лежать під одним ключем у вигляді одного об'єкта зі schema-версією.
 *
 * Прихований прогрес (ТЗ 2.0, розділ 09) гравцеві НІДЕ не показується:
 * лише код вирішує, коли відкрити секретну локацію.
 */

const KEY = 'bf-arcade';
const SCHEMA = 2; // 2: мішечки персонажів/фраз замість «останньої комбінації»

const defaults = () => ({
  schema: SCHEMA,
  /** Мішечки кожної знижки (див. reward-pick.js): { r66: { memes: [2, 0], phrases: [...], lastMeme: 1, ... } } */
  bags: {},
  /** Скільки ігор завершено (зараховується в момент третьої однакової картки). */
  completedGames: 0,
  /** ID останнього зарахованого раунду — захист від повторного зарахування. */
  lastCountedRoundId: null,
  /** Секретну локацію відкрито (досягнуто порогу), але її ще могли не побачити. */
  secretUnlocked: false,
  /** Секретну кімнату вже бачили — повну анімацію розблокування більше не показувати. */
  secretViewed: false,
  /** Подарунок у секретній кімнаті вже відкривали. */
  giftOpened: false,
  /** Привітання дочитано до кінця — на наступному вході прогрес почнеться заново. */
  journeyComplete: false,
});

/** Привести збережені поля прогресу до коректних типів (пошкоджені → за замовчуванням). */
function sanitizeProgress(d) {
  const n = d.completedGames;
  return {
    completedGames: Number.isInteger(n) && n >= 0 && n < 1e6 ? n : 0,
    lastCountedRoundId: typeof d.lastCountedRoundId === 'string' ? d.lastCountedRoundId : null,
    secretUnlocked: d.secretUnlocked === true,
    secretViewed: d.secretViewed === true,
    giftOpened: d.giftOpened === true,
    journeyComplete: d.journeyComplete === true,
  };
}

let cache = null; // поточні дані (також — запасне сховище, якщо localStorage недоступний)

function readRaw() {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null; // доступ заборонено
  }
}

function writeRaw(text) {
  try {
    globalThis.localStorage?.setItem(KEY, text);
    return true;
  } catch {
    return false; // заборонено або переповнено — працюємо з пам'яттю
  }
}

/** Прочитати й перевірити дані. Усе незрозуміле замінюється значеннями за замовчуванням. */
function load() {
  if (cache) return cache;
  let data = null;
  try {
    data = JSON.parse(readRaw() ?? 'null');
  } catch {
    data = null; // пошкоджений JSON
  }
  const base = defaults();
  if (!data || typeof data !== 'object' || (data.schema !== SCHEMA && data.schema !== 1)) {
    cache = base;
  } else {
    // Схема 1 (до мішечків): прогрес переноситься, мішечки починаються з нуля.
    cache = {
      ...base,
      bags: data.schema === SCHEMA && isPlainObject(data.bags) ? data.bags : {},
      ...sanitizeProgress(data),
    };
    if (data.schema !== SCHEMA) save();
  }
  return cache;
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function save() {
  writeRaw(JSON.stringify(cache));
}

export const Storage = {
  /** Стан мішечків знижки або null. Вміст перевіряє reward-pick.js. */
  getBag(rewardKey) {
    const b = load().bags[rewardKey];
    return isPlainObject(b) ? b : null;
  },

  setBag(rewardKey, bag) {
    load().bags[rewardKey] = bag;
    save();
  },

  /* ---------------- Прихований прогрес ---------------- */

  /** Знімок прогресу (копія — змінювати лише через методи нижче). */
  getProgress() {
    const d = load();
    return sanitizeProgress(d);
  },

  /**
   * Зарахувати завершену гру. Кожен раунд (roundId) рахується лише один раз:
   * повторний виклик з тим самим ID нічого не змінює.
   * @param {string} roundId     унікальний ID раунду
   * @param {number} unlockAfter після скількох ігор відкривається секрет
   * @returns {{ counted: boolean, completedGames: number, justUnlocked: boolean }}
   */
  recordCompletedGame(roundId, unlockAfter) {
    const d = load();
    if (!roundId || d.lastCountedRoundId === roundId) {
      return { counted: false, completedGames: d.completedGames, justUnlocked: false };
    }
    d.completedGames += 1;
    d.lastCountedRoundId = roundId;
    const justUnlocked = !d.secretUnlocked && d.completedGames >= unlockAfter;
    if (justUnlocked) d.secretUnlocked = true;
    save();
    return { counted: true, completedGames: d.completedGames, justUnlocked };
  },

  markSecretViewed() {
    load().secretViewed = true;
    save();
  },

  markGiftOpened() {
    load().giftOpened = true;
    save();
  },

  /** Привітання дочитано — повне проходження завершено. */
  markJourneyComplete() {
    load().journeyComplete = true;
    save();
  },

  /**
   * Викликається один раз при відкритті гри: якщо минулого разу пройдено все
   * до кінця привітання, прогрес починається заново (мішечки лишаються — коло триває).
   * @returns {boolean} чи було скинуто прогрес
   */
  startNewJourneyIfComplete() {
    if (!load().journeyComplete) return false;
    this.resetProgress();
    return true;
  },

  /** Debug: виставити кількість завершених ігор (секрет перераховується від порогу). */
  debugSetCompletedGames(n, unlockAfter) {
    const d = load();
    d.completedGames = Math.max(0, n | 0);
    d.lastCountedRoundId = null;
    d.secretUnlocked = d.completedGames >= unlockAfter;
    d.secretViewed = false;
    d.giftOpened = false;
    d.journeyComplete = false;
    save();
  },

  /** Debug: закрити або відкрити подарунок. */
  debugSetGiftOpened(value) {
    load().giftOpened = Boolean(value);
    save();
  },

  /** Скинути лише прогрес (мішечки персонажів і фраз лишаються). */
  resetProgress() {
    Object.assign(load(), sanitizeProgress({}));
    save();
  },

  /** Чи вдається реально писати в localStorage (для debug-панелі). */
  isPersistent() {
    const probe = `${KEY}-probe`;
    try {
      globalThis.localStorage.setItem(probe, '1');
      globalThis.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  },

  /** Стерти всі дані гри (debug). */
  reset() {
    cache = defaults();
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* недоступно — достатньо скинути пам'ять */
    }
  },

  /** Лише для тестів: забути кеш, щоб наступне читання пішло в localStorage. */
  _reload() {
    cache = null;
  },
};
