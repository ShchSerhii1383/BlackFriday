/**
 * reward-pick.js — вибір мемного персонажа і фрази для результату.
 * Чиста логіка: без DOM і без сховища, тому перевіряється в Node
 * (див. tools/test-reward-pick.mjs).
 *
 * Принцип «мішечка» (shuffle bag), окремо для кожної знижки:
 *  - усі персонажі знижки лежать у мішечку у випадковому порядку і дістаються по одному,
 *    тож за N результатів однієї знижки гравець побачить УСІХ N персонажів;
 *  - коли мішечок порожній, він наповнюється заново в новому випадковому порядку;
 *    перший у новому колі ніколи не збігається з останнім показаним;
 *  - фрази мають власний, незалежний мішечок (5 фраз → коло з 5);
 *  - вибір ніяк не пов'язаний з результатом гри (його визначає лише round.js).
 *
 * Оскільки персонаж ніколи не повторюється двічі поспіль, не повторюється
 * й уся комбінація «персонаж + фраза».
 */

/**
 * Дістати наступний елемент із мішечка.
 * @param {unknown} queue        що лишилось у мішечку (індекси); некоректне значення → новий мішечок
 * @param {number} size          скільки всього елементів (персонажів або фраз)
 * @param {unknown} last         останній показаний індекс (щоб нове коло не почалось із нього)
 * @param {() => number} rng     джерело випадковості (підміняється в тестах)
 * @returns {{ index: number, queue: number[] }}
 */
export function drawFromBag(queue, size, last, rng = Math.random) {
  let rest = cleanQueue(queue, size);
  if (rest.length === 0) rest = refill(size, last, rng);
  return { index: rest[0], queue: rest.slice(1) };
}

/**
 * Обрати персонажа і фразу та повернути оновлений стан мішечків знижки.
 * @param {object | null} bag   збережений стан { memes, phrases, lastMeme, lastPhrase, memeCount, phraseCount }
 * @param {number} memeCount
 * @param {number} phraseCount
 * @param {() => number} [rng]
 * @returns {{ pick: {memeIndex: number, phraseIndex: number}, bag: object }}
 */
export function drawPresentation(bag, memeCount, phraseCount, rng = Math.random) {
  const b = bag && typeof bag === 'object' ? bag : {};
  // Якщо кількість персонажів/фраз змінилась (додали нових) — старе коло вже неповне, починаємо нове.
  const memeQueue = b.memeCount === memeCount ? b.memes : null;
  const phraseQueue = b.phraseCount === phraseCount ? b.phrases : null;
  const m = drawFromBag(memeQueue, memeCount, b.lastMeme, rng);
  const p = drawFromBag(phraseQueue, phraseCount, b.lastPhrase, rng);
  return {
    pick: { memeIndex: m.index, phraseIndex: p.index },
    bag: {
      memeCount, phraseCount,
      memes: m.queue, phrases: p.queue,
      lastMeme: m.index, lastPhrase: p.index,
    },
  };
}

/** Новий мішечок: перемішування Фішера–Єйтса; перший елемент ≠ останньому показаному. */
function refill(size, last, rng) {
  const a = Array.from({ length: size }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (size > 1 && a[0] === last) {
    const j = 1 + Math.floor(rng() * (size - 1)); // обміняти з будь-яким іншим
    [a[0], a[j]] = [a[j], a[0]];
  }
  return a;
}

/** Лишити в черзі тільки коректні унікальні індекси (захист від пошкоджених даних). */
function cleanQueue(queue, size) {
  if (!Array.isArray(queue)) return [];
  const seen = new Set();
  return queue.filter((i) => Number.isInteger(i) && i >= 0 && i < size && !seen.has(i) && seen.add(i));
}
