/**
 * debug.js — режим розробника. Завантажується лише з ?debug=1 або #debug,
 * у звичайній грі цей файл навіть не запитується.
 *
 * Можливості: стан гри, % стирання, лічильники, розкладка карток,
 * повторне інтро, новий раунд, примусовий MATCH FOUND і показ кожної нагороди.
 */
import { REWARDS } from './config.js';

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
    .debug-values .card::after { content: attr(data-value) '%'; position: absolute; top: 2px; left: 4px;
      font: 10px monospace; color: #0f0; z-index: 5; pointer-events: none; }`;
  document.head.appendChild(style);

  const out = panel.querySelector('[data-out]');
  const report = () => {
    const p = game.activeCard ? `${Math.round(game.activeCard.progress * 100)}%` : '—';
    const counts = game.round ? REWARDS.map((r) => `${r.value}:${game.round.counts.get(r.value) || 0}`).join(' ') : '';
    const opened = game.round ? game.round.revealed.size : 0;
    out.textContent = `${game.state} | scratch ${p} | opened ${opened} | ${counts}` +
      (game.result !== null ? ` | win ${game.result}%` : '');
    game.cards.forEach((c) => (c.el.dataset.value = c.value));
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
    if (btn.dataset.reward !== undefined) game.debugShowReward(Number(btn.dataset.reward));
    report();
  });
  report();
  console.info('[debug] режим розробника увімкнено');
}
