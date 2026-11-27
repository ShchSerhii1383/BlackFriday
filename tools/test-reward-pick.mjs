/**
 * Перевірка вибору персонажа/фрази («мішечок») і безпечного сховища.
 * Запуск із кореня проєкту:  node tools/test-reward-pick.mjs
 */
import { drawPresentation, drawFromBag } from '../js/reward-pick.js';

let failures = 0;
const fail = (msg) => { if (failures++ < 8) console.error('FAIL:', msg); };

/* ---------- 1. Повні кола: 4 персонажі × 5 фраз, без повторів поспіль ---------- */
const M = 4, P = 5, RUNS = 120_000;
let bag = null;
const memeSeq = [], phraseSeq = [];
const memeCount = new Array(M).fill(0), phraseCount = new Array(P).fill(0);
const firstOfCycle = new Array(M).fill(0);
for (let i = 0; i < RUNS; i++) {
  const r = drawPresentation(bag, M, P);
  bag = JSON.parse(JSON.stringify(r.bag)); // як після запису в localStorage
  const { memeIndex: m, phraseIndex: ph } = r.pick;
  if (m < 0 || m >= M || ph < 0 || ph >= P) fail(`поза межами ${m}:${ph}`);
  memeSeq.push(m); phraseSeq.push(ph); memeCount[m]++; phraseCount[ph]++;
  if (i % M === 0) firstOfCycle[m]++;
}
const fullCycles = (seq, n) => {
  for (let c = 0; c + n <= seq.length; c += n) {
    if (new Set(seq.slice(c, c + n)).size !== n) return `коло з ${c}: ${seq.slice(c, c + n)}`;
  }
  return null;
};
const repeats = (seq) => seq.reduce((k, v, i) => k + (i && v === seq[i - 1] ? 1 : 0), 0);
const e1 = fullCycles(memeSeq, M); if (e1) fail(`персонажі: неповне ${e1}`);
const e2 = fullCycles(phraseSeq, P); if (e2) fail(`фрази: неповне ${e2}`);
if (repeats(memeSeq)) fail(`персонаж повторився поспіль ${repeats(memeSeq)} разів`);
if (repeats(phraseSeq)) fail(`фраза повторилась поспіль ${repeats(phraseSeq)} разів`);
const worst = (arr, n) => Math.max(...arr.map((c) => Math.abs(c / RUNS - 1 / n)));
if (worst(memeCount, M) > 0.001 || worst(phraseCount, P) > 0.001) fail('нерівномірний розподіл');
// порядок усередині кола випадковий: кожен персонаж приблизно однаково часто відкриває коло
const cycles = RUNS / M;
if (Math.max(...firstOfCycle.map((c) => Math.abs(c / cycles - 1 / M))) > 0.01) fail(`порядок не випадковий: ${firstOfCycle}`);
const combos = new Set(memeSeq.map((m, i) => `${m}:${phraseSeq[i]}`));
if (combos.size !== M * P) fail(`досяжно ${combos.size} комбінацій замість ${M * P}`);
console.log(`кола: кожні ${M} персонажів і ${P} фраз — усі різні; повторів поспіль 0; комбінацій ${combos.size}/${M * P} (${RUNS} результатів)`);

/* ---------- 2. Пошкоджений або застарілий стан мішечка ---------- */
for (const [label, b] of [
  ['null', null], ['рядок', 'oops'], ['масив', [1, 2]],
  ['чужі елементи', { memeCount: 4, phraseCount: 5, memes: [9, -1, 'a', 2, 2], phrases: 'x', lastMeme: 'z' }],
  ['змінилась кількість персонажів (було 3)', { memeCount: 3, phraseCount: 5, memes: [2], phrases: [4], lastMeme: 0, lastPhrase: 1 }],
]) {
  try {
    const r = drawPresentation(b, M, P);
    if (!(r.pick.memeIndex >= 0 && r.pick.memeIndex < M && r.pick.phraseIndex >= 0 && r.pick.phraseIndex < P)) fail(`${label}: поза межами`);
  } catch (e) { fail(`${label}: виняток ${e.message}`); }
}
// у «чужих елементах» лишається лише валідний індекс 2 — він і має вийти першим
if (drawPresentation({ memeCount: 4, phraseCount: 5, memes: [9, 2, 2] }, M, P).pick.memeIndex !== 2) fail('валідний залишок черги загубився');
// Нове коло не починається з останнього показаного
for (let t = 0; t < 2000; t++) if (drawFromBag([], 4, 3).index === 3) { fail('нове коло почалось з останнього'); break; }
if (drawFromBag(null, 1, 0).index !== 0) fail('єдиний елемент має лишатися доступним');
console.log('пошкоджені/застарілі мішечки: без винятків; нове коло не починається з останнього');

/* ---------- 4. Сховище: пошкоджені дані, недоступний і переповнений localStorage ---------- */
function fakeStorage({ throwOnGet = false, throwOnSet = false, initial = null } = {}) {
  const map = new Map(initial === null ? [] : [['bf-arcade', initial]]);
  return {
    getItem: (k) => { if (throwOnGet) throw new Error('SecurityError'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (throwOnSet) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}
const { Storage } = await import('../js/storage.js');
const cases = [
  ['пошкоджений JSON', fakeStorage({ initial: '{oops' })],
  ['чужий формат', fakeStorage({ initial: '[1,2,3]' })],
  ['стара схема', fakeStorage({ initial: '{"schema":0,"lastCombos":{"r0":{"meme":"x","phrase":1}}}' })],
  ['bags не обʼєкт', fakeStorage({ initial: '{"schema":2,"bags":"bad"}' })],
  ['читання заборонено', fakeStorage({ throwOnGet: true, throwOnSet: true })],
  ['сховище переповнене', fakeStorage({ throwOnSet: true })],
];
for (const [name, store] of cases) {
  globalThis.localStorage = store;
  Storage._reload();
  try {
    if (Storage.getBag('r0') !== null) fail(`${name}: очікувалось порожнє значення`);
    Storage.setBag('r0', { memes: [1, 2], lastMeme: 3 });
    const got = Storage.getBag('r0');
    if (!got || got.lastMeme !== 3) fail(`${name}: у межах сесії значення має зберігатися в пам'яті`);
  } catch (e) {
    fail(`${name}: виняток ${e.message}`);
  }
}
// Нормальний випадок: запис переживає «перезавантаження сторінки»
const good = fakeStorage();
globalThis.localStorage = good;
Storage._reload();
Storage.setBag('r66', { memes: [0, 3], lastMeme: 1 });
Storage._reload();
const back = Storage.getBag('r66');
if (!back || back.lastMeme !== 1 || back.memes.join() !== '0,3') fail('дані не пережили перезавантаження');
delete globalThis.localStorage;
Storage._reload();
try { Storage.setBag('r0', { memes: [] }); } catch (e) { fail(`без localStorage взагалі: ${e.message}`); }
console.log('сховище: пошкоджені/недоступні/переповнені дані — без винятків; збереження між перезавантаженнями — OK');

console.log(failures ? `ПОМИЛОК: ${failures}` : 'OK — усі перевірки пройдено');
process.exit(failures ? 1 : 0);
