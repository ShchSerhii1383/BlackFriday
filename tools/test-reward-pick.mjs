/**
 * Перевірка вибору персонажа/фрази (Anti-Repeat) і безпечного сховища.
 * Запуск із кореня проєкту:  node tools/test-reward-pick.mjs
 */
import { pickCombination } from '../js/reward-pick.js';

let failures = 0;
const fail = (msg) => { if (failures++ < 8) console.error('FAIL:', msg); };
const key = (p) => `${p.memeIndex}:${p.phraseIndex}`;

/* ---------- 1. Anti-Repeat і рівномірність: 3 персонажі × 5 фраз ---------- */
const RUNS = 150_000;
const combos = new Map();
const memes = [0, 0, 0];
const phrases = [0, 0, 0, 0, 0];
let last = null;
for (let i = 0; i < RUNS; i++) {
  const p = pickCombination(3, 5, last);
  if (p.memeIndex < 0 || p.memeIndex > 2 || p.phraseIndex < 0 || p.phraseIndex > 4) fail(`поза межами ${key(p)}`);
  if (last && key(p) === key(last)) fail(`повтор останньої комбінації ${key(p)} на кроці ${i}`);
  combos.set(key(p), (combos.get(key(p)) || 0) + 1);
  memes[p.memeIndex]++;
  phrases[p.phraseIndex]++;
  last = p;
}
if (combos.size !== 15) fail(`досяжно ${combos.size} комбінацій замість 15`);
const share = (n) => n / RUNS;
const worstCombo = Math.max(...[...combos.values()].map((n) => Math.abs(share(n) - 1 / 15)));
const worstMeme = Math.max(...memes.map((n) => Math.abs(share(n) - 1 / 3)));
const worstPhrase = Math.max(...phrases.map((n) => Math.abs(share(n) - 1 / 5)));
console.log(`комбінацій: ${combos.size}/15, повторів поспіль: 0 перевірено на ${RUNS}`);
console.log(`відхилення: комбінація ${(worstCombo * 100).toFixed(2)} п.п. (від 6,67%), персонаж ${(worstMeme * 100).toFixed(2)} п.п. (від 33,3%), фраза ${(worstPhrase * 100).toFixed(2)} п.п. (від 20%)`);
if (worstCombo > 0.005 || worstMeme > 0.01 || worstPhrase > 0.01) fail('нерівномірний розподіл');

/* ---------- 2. Окремо персонаж і фраза МОЖУТЬ повторюватися ---------- */
let sameMeme = 0, samePhrase = 0;
last = null;
for (let i = 0; i < 10_000; i++) {
  const p = pickCombination(3, 5, last);
  if (last && p.memeIndex === last.memeIndex) sameMeme++;
  if (last && p.phraseIndex === last.phraseIndex) samePhrase++;
  last = p;
}
if (!sameMeme || !samePhrase) fail('персонаж або фраза ніколи не повторюються окремо');
console.log(`той самий персонаж поспіль: ${(sameMeme / 100).toFixed(1)}%, та сама фраза: ${(samePhrase / 100).toFixed(1)}% — дозволено`);

/* ---------- 3. Некоректна «остання» комбінація не ламає вибір ---------- */
for (const bad of [null, undefined, {}, { memeIndex: -1, phraseIndex: 0 }, { memeIndex: 9, phraseIndex: 1 },
  { memeIndex: 1.5, phraseIndex: 2 }, { memeIndex: '1', phraseIndex: '2' }, 'garbage', 42]) {
  for (let i = 0; i < 200; i++) {
    const p = pickCombination(3, 5, bad);
    if (!(p.memeIndex >= 0 && p.memeIndex < 3 && p.phraseIndex >= 0 && p.phraseIndex < 5)) fail(`некоректний вибір для ${JSON.stringify(bad)}`);
  }
}
// Межові значення генератора: rng → 0 і rng → 0.9999 при виключеній першій/останній комбінації
for (const rng of [() => 0, () => 0.99999]) {
  for (const l of [{ memeIndex: 0, phraseIndex: 0 }, { memeIndex: 2, phraseIndex: 4 }]) {
    const p = pickCombination(3, 5, l, rng);
    if (key(p) === key(l) || p.memeIndex > 2 || p.phraseIndex > 4) fail(`межовий випадок rng/last ${key(l)} → ${key(p)}`);
  }
}
if (key(pickCombination(1, 1, { memeIndex: 0, phraseIndex: 0 })) !== '0:0') fail('єдина комбінація має лишатися доступною');
console.log('некоректні дані та межові випадки: OK');

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
  ['lastCombos не обʼєкт', fakeStorage({ initial: '{"schema":1,"lastCombos":"bad"}' })],
  ['читання заборонено', fakeStorage({ throwOnGet: true, throwOnSet: true })],
  ['сховище переповнене', fakeStorage({ throwOnSet: true })],
];
for (const [name, store] of cases) {
  globalThis.localStorage = store;
  Storage._reload();
  try {
    if (Storage.getLastCombo('r0') !== null) fail(`${name}: очікувалось порожнє значення`);
    Storage.setLastCombo('r0', { meme: 'crying-cat', phrase: 3 });
    const got = Storage.getLastCombo('r0');
    if (!got || got.meme !== 'crying-cat') fail(`${name}: у межах сесії значення має зберігатися в пам'яті`);
  } catch (e) {
    fail(`${name}: виняток ${e.message}`);
  }
}
// Нормальний випадок: запис переживає «перезавантаження сторінки»
const good = fakeStorage();
globalThis.localStorage = good;
Storage._reload();
Storage.setLastCombo('r66', { meme: 'financial-rat', phrase: 4 });
Storage._reload();
const back = Storage.getLastCombo('r66');
if (!back || back.meme !== 'financial-rat' || back.phrase !== 4) fail('дані не пережили перезавантаження');
delete globalThis.localStorage;
Storage._reload();
try { Storage.setLastCombo('r0', { meme: 'a', phrase: 0 }); } catch (e) { fail(`без localStorage взагалі: ${e.message}`); }
console.log('сховище: пошкоджені/недоступні/переповнені дані — без винятків; збереження між перезавантаженнями — OK');

console.log(failures ? `ПОМИЛОК: ${failures}` : 'OK — усі перевірки пройдено');
process.exit(failures ? 1 : 0);
