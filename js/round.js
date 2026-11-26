/**
 * round.js — правила одного раунду. Чиста логіка: без DOM, без таймерів.
 * Тому її можна перевіряти в Node (див. tools/test-round.mjs).
 *
 * Чесність механіки:
 *  - колода містить кожне значення рівно copies разів;
 *  - перемішування — Fisher–Yates (рівноймовірні розкладки), без sort(random);
 *  - значення фіксуються до першого дотику й більше не змінюються;
 *  - переможець НЕ обирається заздалегідь — його визначає лише порядок відкриття.
 */

/** Створити колоду: кожне значення повторюється copies разів. */
export function createDeck(values, copies) {
  return values.flatMap((v) => Array(copies).fill(v));
}

/** Fisher–Yates: повертає НОВИЙ перемішаний масив. rng можна підмінити в тестах. */
export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Round {
  /**
   * @param {number[]} deck     значення карток у порядку розкладки (вже перемішані)
   * @param {number} matchSize  скільки однакових потрібно для перемоги
   */
  constructor(deck, matchSize) {
    this.deck = Object.freeze(deck.slice());
    this.matchSize = matchSize;
    this.revealed = new Set();
    this.counts = new Map();
    this.winner = null;          // значення-переможець або null
    this.winningIndices = [];    // індекси трьох переможних карток
  }

  get isOver() {
    return this.winner !== null;
  }

  /**
   * Зарахувати відкриту картку.
   * Повертає null, якщо раунд уже завершено або картку вже зараховано
   * (кожна картка рахується рівно один раз).
   * @returns {{ value: number, count: number, isMatch: boolean } | null}
   */
  reveal(index) {
    if (this.isOver || this.revealed.has(index) || !(index in this.deck)) return null;
    this.revealed.add(index);
    const value = this.deck[index];
    const count = (this.counts.get(value) || 0) + 1;
    this.counts.set(value, count);

    const isMatch = count === this.matchSize;
    if (isMatch) {
      this.winner = value;
      this.winningIndices = [...this.revealed].filter((i) => this.deck[i] === value);
    }
    return { value, count, isMatch };
  }
}
