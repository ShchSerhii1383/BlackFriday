/**
 * Перевірка чесності round.js на великій кількості раундів.
 * Запуск із кореня проєкту:  node tools/test-round.mjs
 */
import { createDeck, shuffle, Round } from '../js/round.js';

const VALUES = [0, 33, 66, 100];
const RUNS = 100_000;
const wins = Object.fromEntries(VALUES.map((v) => [v, 0]));
const lengths = {};
const posValue = Array.from({ length: 12 }, () => Object.fromEntries(VALUES.map((v) => [v, 0])));
let failures = 0;
const fail = (msg) => { if (failures++ < 5) console.error('FAIL:', msg); };

for (let r = 0; r < RUNS; r++) {
  const deck = shuffle(createDeck(VALUES, 3));
  deck.forEach((v, i) => posValue[i][v]++);
  for (const v of VALUES) if (deck.filter((x) => x === v).length !== 3) fail('у колоді не по 3');

  const round = new Round(deck, 3);
  const order = shuffle([...deck.keys()]); // випадковий порядок відкриття
  let opened = 0;
  for (const idx of order) {
    const res = round.reveal(idx);
    opened++;
    if (round.reveal(idx) !== null) fail('картку зараховано двічі');
    if (res.isMatch) break;
  }
  if (!round.isOver) fail('раунд не завершився');
  if (opened > 9) fail(`відкрито ${opened} > 9`);
  if (round.winningIndices.length !== 3) fail('не 3 переможні картки');
  if (round.winningIndices.some((i) => deck[i] !== round.winner)) fail('чужа картка серед переможних');
  const rest = order.slice(opened);
  if (rest.some((i) => round.reveal(i) !== null)) fail('зараховано після перемоги');
  const counts = [...round.counts.entries()].filter(([, c]) => c === 3);
  if (counts.length !== 1) fail('більше однієї трійки');
  wins[round.winner]++;
  lengths[opened] = (lengths[opened] || 0) + 1;
}

const pct = (n) => `${((n / RUNS) * 100).toFixed(2)}%`;
console.log('перемоги:', Object.fromEntries(Object.entries(wins).map(([k, v]) => [k + '%', pct(v)])));
console.log('карток до збігу:', Object.fromEntries(Object.entries(lengths).map(([k, v]) => [k, pct(v)])));
// Кожна позиція має отримувати кожне значення ~25% (рівномірність Fisher–Yates)
const worst = Math.max(...posValue.flatMap((p) => VALUES.map((v) => Math.abs(p[v] / RUNS - 0.25))));
console.log(`макс. відхилення позиції від 25%: ${(worst * 100).toFixed(2)} п.п.`);
if (worst > 0.01) fail('нерівномірне перемішування');
console.log(failures ? `ПОМИЛОК: ${failures}` : 'OK — усі перевірки пройдено');
process.exit(failures ? 1 : 0);
