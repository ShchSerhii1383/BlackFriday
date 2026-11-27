/**
 * Перевірка прихованого прогресу (ТЗ 2.0, розділи 09–10).
 * Запуск із кореня проєкту:  node tools/test-progress.mjs
 */
import { Storage } from '../js/storage.js';

let failures = 0;
const fail = (msg) => { if (failures++ < 10) console.error('FAIL:', msg); };
const check = (cond, msg) => { if (!cond) fail(msg); };

function fakeStorage({ initial = null, throwAll = false } = {}) {
  const map = new Map(initial === null ? [] : [['bf-arcade', initial]]);
  const guard = () => { if (throwAll) throw new Error('SecurityError'); };
  return {
    getItem: (k) => { guard(); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { guard(); map.set(k, String(v)); },
    removeItem: (k) => { guard(); map.delete(k); },
  };
}
const fresh = (opts) => { globalThis.localStorage = fakeStorage(opts); Storage._reload(); };
const reload = () => Storage._reload(); // імітація перезавантаження сторінки

/* 1. Перші чотири гри — секрет закритий; п'ята відкриває рівно один раз */
fresh();
for (let i = 1; i <= 4; i++) {
  const r = Storage.recordCompletedGame(`round-${i}`, 5);
  check(r.counted && r.completedGames === i && !r.justUnlocked, `гра ${i}: ${JSON.stringify(r)}`);
  check(!Storage.getProgress().secretUnlocked, `секрет відкрився зарано на грі ${i}`);
}
const fifth = Storage.recordCompletedGame('round-5', 5);
check(fifth.justUnlocked && Storage.getProgress().secretUnlocked, 'п\'ята гра не відкрила секрет');
const sixth = Storage.recordCompletedGame('round-6', 5);
check(!sixth.justUnlocked && sixth.completedGames === 6, 'шоста гра не має повторно «відкривати» секрет');
console.log('1) ігри 1–4 без секрету, 5-та відкриває, 6-та — без повторного відкриття: OK');

/* 2. Той самий раунд не зараховується двічі (повторний MATCH, CLAIM, debug) */
const again = Storage.recordCompletedGame('round-6', 5);
check(!again.counted && again.completedGames === 6, 'раунд зараховано повторно');
check(!Storage.recordCompletedGame('', 5).counted && !Storage.recordCompletedGame(null, 5).counted, 'порожній ID зараховано');
console.log('2) повторне зарахування того самого раунду і порожній ID: відхилено');

/* 3. Перезавантаження сторінки зберігає прогрес і нічого не додає */
reload();
const p3 = Storage.getProgress();
check(p3.completedGames === 6 && p3.secretUnlocked && !p3.secretViewed, `після перезавантаження: ${JSON.stringify(p3)}`);
check(!Storage.recordCompletedGame('round-6', 5).counted, 'після перезавантаження останній раунд зараховано знову');
Storage.markSecretViewed(); Storage.markGiftOpened(); reload();
const p3b = Storage.getProgress();
check(p3b.secretViewed && p3b.giftOpened, 'статуси переглянуто/подарунок не збереглися');
console.log('3) перезавантаження: прогрес і статуси збережені, лічильник не росте');

/* 4. Пошкоджені поля приводяться до безпечних значень */
for (const [label, raw, expectGames] of [
  ['рядок замість числа', { completedGames: '5' }, 0],
  ['відʼємне', { completedGames: -2 }, 0],
  ['дробове', { completedGames: 3.7 }, 0],
  ['величезне', { completedGames: 1e12 }, 0],
  ['нормальне', { completedGames: 3 }, 3],
]) {
  fresh({ initial: JSON.stringify({ schema: 2, bags: {}, secretUnlocked: 'true', ...raw }) });
  const p = Storage.getProgress();
  check(p.completedGames === expectGames, `${label}: completedGames=${p.completedGames}`);
  check(p.secretUnlocked === false, `${label}: рядок 'true' не повинен відкривати секрет`);
}
fresh({ initial: '{not json' });
check(Storage.getProgress().completedGames === 0, 'пошкоджений JSON');
console.log('4) пошкоджені та підроблені значення: безпечні значення за замовчуванням');

/* 5. Дані схеми 1 — прогрес переноситься; скидання прогресу не чіпає мішечки */
fresh({ initial: JSON.stringify({ schema: 1, lastCombos: { r66: { meme: 'stonks', phrase: 2 } }, completedGames: 3, secretUnlocked: false }) });
check(Storage.getProgress().completedGames === 3 && Storage.getBag('r66') === null, 'міграція зі схеми 1');
Storage.setBag('r66', { memes: [1], lastMeme: 0 });
Storage.recordCompletedGame('a', 5); Storage.resetProgress();
check(Storage.getProgress().completedGames === 0 && Storage.getBag('r66')?.lastMeme === 0, 'resetProgress зачепив мішечки');
console.log('5) дані схеми 1 переносяться; скидання прогресу не чіпає мішечки персонажів');

/* 5б. Повне проходження → наступний вхід з нуля; незавершене — прогрес лишається */
fresh();
for (let i = 1; i <= 5; i++) Storage.recordCompletedGame(`j-${i}`, 5);
Storage.markSecretViewed(); Storage.markGiftOpened(); Storage.setBag('r0', { memes: [2], lastMeme: 1 });
reload();
check(Storage.startNewJourneyIfComplete() === false && Storage.getProgress().giftOpened, 'скинуто без дочитаного привітання');
Storage.markJourneyComplete(); reload();
check(Storage.startNewJourneyIfComplete() === true, 'повне проходження не скинуло прогрес');
const pj = Storage.getProgress();
check(pj.completedGames === 0 && !pj.secretUnlocked && !pj.secretViewed && !pj.giftOpened && !pj.journeyComplete, `після скидання: ${JSON.stringify(pj)}`);
check(Storage.getBag('r0')?.lastMeme === 1, 'мішечок загубився при скиданні');
reload();
check(Storage.startNewJourneyIfComplete() === false, 'повторне скидання');
console.log('5б) після дочитаного привітання наступний вхід починається з нуля, мішечки зберігаються');

/* 6. localStorage недоступний — гра рахує в пам'яті й не падає */
fresh({ throwAll: true });
try {
  for (let i = 1; i <= 5; i++) Storage.recordCompletedGame(`m-${i}`, 5);
  check(Storage.getProgress().secretUnlocked, 'без localStorage секрет у межах сесії не відкрився');
} catch (e) { fail(`виняток без localStorage: ${e.message}`); }
console.log('6) localStorage недоступний: без винятків, прогрес живе в межах сесії');

/* 7. Debug: Games=4 → наступна перемога п'ята і відкриває секрет */
fresh();
Storage.debugSetCompletedGames(4, 5);
check(!Storage.getProgress().secretUnlocked, 'Games=4 вже відкрило секрет');
check(Storage.recordCompletedGame('next', 5).justUnlocked, 'після Games=4 наступна гра не відкрила секрет');
console.log('7) debug Games=4 → наступна перемога відкриває секрет: OK');

console.log(failures ? `ПОМИЛОК: ${failures}` : 'OK — усі перевірки пройдено');
process.exit(failures ? 1 : 0);
