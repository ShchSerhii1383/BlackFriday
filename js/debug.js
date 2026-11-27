/**
 * debug.js — режим розробника. Завантажується лише з ?debug=1 або #debug,
 * у звичайній грі цей файл навіть не запитується.
 *
 * Можливості: стан гри, % стирання, лічильники, розкладка карток,
 * повторне інтро, новий раунд, примусовий MATCH FOUND і показ кожної нагороди,
 * перегляд усіх 12 персонажів і 20 фраз, перевірка Anti-Repeat (Random),
 * скидання збережених даних, прихований прогрес (Games=3 → наступна перемога
 * 4-та, Games=4 → 5-та), скидання прогресу.
 */
import { REWARDS } from './config.js';
import { Storage } from './storage.js';
import { setRoomPhoto } from './room.js';
import { secretConfig } from './secret-config.js';

export function initDebug(game) {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <button data-act="toggle">DBG</button>
    <div class="debug-panel__body">
      <div class="debug-panel__row">
        <button data-act="intro">Intro</button>
        <button data-act="round">New round</button>
        <button data-act="values">Values</button>
      </div>
      <div class="debug-panel__row">Match:
        ${REWARDS.map((r) => `<button data-match="${r.value}">${r.value}</button>`).join('')}
      </div>
      <div class="debug-panel__row">Reward:
        ${REWARDS.map((r) => `<button data-reward="${r.value}">${r.value}</button>`).join('')}
      </div>
      <div class="debug-panel__row">Look:
        <button data-act="meme">Meme +</button>
        <button data-act="phrase">Phrase +</button>
      </div>
      <div class="debug-panel__row">Random:
        ${REWARDS.map((r) => `<button data-random="${r.value}">${r.value}</button>`).join('')}
        <button data-act="clear">Clear saved</button>
      </div>
      <div class="debug-panel__row">Progress:
        <button data-games="3">Games=3</button>
        <button data-games="4">Games=4</button>
        <button data-act="reset-progress">Reset progress</button>
      </div>
      <div class="debug-panel__row">Secret:
        <button data-secret="glitch">Glitch</button>
        <button data-secret="achievement">Badge</button>
        <button data-secret="portal">Portal</button>
        <button data-secret="room">Room</button>
        <button data-act="photo">Photo test</button>
      </div>
      <div class="debug-panel__row">Gift:
        <button data-secret="gift-closed">Closed</button>
        <button data-secret="gift-open">Open</button>
        <button data-secret="greeting">Greeting</button>
      </div>
      <div class="debug-panel__row">Eggs:
        ${['teddy', 'laptop', 'bouquet', 'coffee', 'unicorn', 'star'].map((id) => `<button data-egg="${id}">${id}</button>`).join('')}
        <button data-act="show-spots">Show zones</button>
      </div>
      <div class="debug-panel__row" data-progress>—</div>
      <div class="debug-panel__row" data-out>—</div>
    </div>`;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    .debug-panel { position: fixed; z-index: 100; left: 4px; bottom: calc(env(safe-area-inset-bottom) + 4px);
      font: 11px/1.3 monospace; color: #0f0; }
    .debug-panel button { font: inherit; color: #0f0; background: #000c; border: 1px solid #0f0;
      padding: 5px 7px; margin: 1px; }
    .debug-panel__body { display: none; background: #000d; padding: 4px; margin-top: 2px; max-width: 300px; }
    .debug-panel.is-open .debug-panel__body { display: block; }
    .debug-panel__row { margin: 2px 0; }
    .debug-spots .room__hotspot { outline: 2px dashed #0f0; background: rgba(0,255,0,.12); }
    .debug-values .card::after { content: attr(data-value) '%'; position: absolute; top: 2px; left: 4px;
      font: 10px monospace; color: #0f0; z-index: 5; pointer-events: none; }`;
  document.head.appendChild(style);

  let photoTest = false;

  // Перегляд усіх 12 персонажів і 20 фраз: поточна знижка + індекси.
  const look = { value: 0, meme: 0, phrase: 0 };
  const showLook = () => game.debugShowReward(look.value, { memeIndex: look.meme, phraseIndex: look.phrase });

  const out = panel.querySelector('[data-out]');
  const progressOut = panel.querySelector('[data-progress]');
  const report = () => {
    const p = game.activeCard ? `${Math.round(game.activeCard.progress * 100)}%` : '—';
    const counts = game.round ? REWARDS.map((r) => `${r.value}:${game.round.counts.get(r.value) || 0}`).join(' ') : '';
    const opened = game.round ? game.round.revealed.size : 0;
    const pick = game.rewardPick && game.result !== null
      ? (() => { const r = REWARDS.find((x) => x.value === game.result);
        return ` | ${r.memes[game.rewardPick.memeIndex].key} · phrase ${game.rewardPick.phraseIndex + 1}/${r.phrases.length}`; })()
      : '';
    out.textContent = `${game.state} | scratch ${p} | opened ${opened} | ${counts}` +
      (game.result !== null ? ` | win ${game.result}%` : '') + pick;
    game.cards.forEach((c) => (c.el.dataset.value = c.value));
    const pr = Storage.getProgress();
    progressOut.textContent = `games ${pr.completedGames} | unlocked ${pr.secretUnlocked} | viewed ${pr.secretViewed}` +
      ` | gift ${pr.giftOpened} | done ${pr.journeyComplete} | ${Storage.isPersistent() ? 'localStorage' : 'memory only'}`;
  };
  game.onChange = report;

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'toggle') panel.classList.toggle('is-open');
    if (act === 'intro') game.debugIntro();
    if (act === 'round') game.debugNewRound();
    if (act === 'values') document.body.classList.toggle('debug-values');
    if (btn.dataset.match !== undefined) game.debugForceMatch(Number(btn.dataset.match));
    if (btn.dataset.reward !== undefined) {
      Object.assign(look, { value: Number(btn.dataset.reward), meme: 0, phrase: 0 });
      showLook();
    }
    // Справжній випадковий вибір (з Anti-Repeat) — як у звичайній грі.
    if (btn.dataset.random !== undefined) game.debugShowReward(Number(btn.dataset.random));
    if (act === 'clear') game.debugResetStorage();
    if (act === 'reset-progress') game.debugResetProgress();
    if (btn.dataset.secret) game.debugSecret(btn.dataset.secret);
    if (btn.dataset.egg) game.debugEgg(btn.dataset.egg);
    if (act === 'show-spots') document.body.classList.toggle('debug-spots');
    if (act === 'photo') {
      // Перевірка кадрування фото в рамці: тестове зображення ↔ заглушка
      photoTest = !photoTest;
      setRoomPhoto(photoTest ? 'assets/memes/meme-33-shopping-doge.webp' : secretConfig.photo.placeholder);
    }
    if (btn.dataset.games !== undefined) game.debugSetCompletedGames(Number(btn.dataset.games));
    if (act === 'meme' || act === 'phrase') {
      const r = REWARDS.find((x) => x.value === look.value);
      if (act === 'meme') look.meme = (look.meme + 1) % r.memes.length;
      else look.phrase = (look.phrase + 1) % r.phrases.length;
      showLook();
    }
    report();
  });
  report();
  window.__game = game; // доступ з консолі браузера та автотестів (лише в debug-режимі)
  console.info('[debug] режим розробника увімкнено');
}
