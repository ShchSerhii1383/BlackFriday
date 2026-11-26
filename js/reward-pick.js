/**
 * reward-pick.js — вибір мемного персонажа і фрази для результату.
 * Чиста логіка: без DOM і без сховища, тому перевіряється в Node
 * (див. tools/test-reward-pick.mjs).
 *
 * Правила (ТЗ 2.0, розділи 05 і 07):
 *  - персонаж і фраза обираються незалежно: усі memeCount × phraseCount комбінацій
 *    рівноймовірні;
 *  - остання показана комбінація ЦІЄЇ знижки виключається, тож вона не повториться
 *    двічі поспіль; окремо персонаж або фраза повторюватися можуть;
 *  - вибір ніяк не пов'язаний з результатом гри (його визначає лише round.js).
 */

/**
 * @param {number} memeCount    скільки персонажів у знижки (3)
 * @param {number} phraseCount  скільки фраз у знижки (5)
 * @param {{memeIndex: number, phraseIndex: number} | null} last
 *        остання комбінація цієї знижки; некоректне значення ігнорується
 * @param {() => number} [rng]  джерело випадковості (підміняється в тестах)
 * @returns {{memeIndex: number, phraseIndex: number}}
 */
export function pickCombination(memeCount, phraseCount, last, rng = Math.random) {
  const total = memeCount * phraseCount;
  const lastIndex = isValid(last, memeCount, phraseCount)
    ? last.memeIndex * phraseCount + last.phraseIndex
    : -1;

  // Якщо комбінація лише одна, виключати нічого — інакше вибір був би неможливий.
  const excluded = lastIndex >= 0 && total > 1;
  let k = Math.floor(rng() * (total - (excluded ? 1 : 0)));
  if (excluded && k >= lastIndex) k += 1; // «перескочити» через останню комбінацію

  return { memeIndex: Math.floor(k / phraseCount), phraseIndex: k % phraseCount };
}

function isValid(last, memeCount, phraseCount) {
  return Boolean(last)
    && Number.isInteger(last.memeIndex) && last.memeIndex >= 0 && last.memeIndex < memeCount
    && Number.isInteger(last.phraseIndex) && last.phraseIndex >= 0 && last.phraseIndex < phraseCount;
}
