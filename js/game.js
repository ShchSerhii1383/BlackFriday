/**
 * game.js — state machine гри і зв'язок між логікою раунду, картками,
 * анімаціями та сценами.
 *
 * Правило архітектури: стан змінює ЛИШЕ transition(). Він перевіряє таблицю
 * дозволених переходів, тож подвійні натискання, повторний MATCH FOUND чи
 * запуск конфліктних сцен просто відхиляються.
 *
 * Кожен стан отримує власний scope анімацій (animations.js). При будь-якому
 * переході попередній scope знищується: таймери, кадри й анімації зупиняються,
 * тому PLAY AGAIN не залишає «хвостів» з попередньої гри.
 */
import { CONFIG, REWARDS, getReward } from './config.js';
import { AudioManager } from './audio.js';
import { ScratchCard, CardState } from './scratch.js';
import { createDeck, shuffle, Round } from './round.js';
import {
  createScope, playIntro, buildGrid, drawMatchLine, wipe, clearLines,
  stageReward, playReward,
} from './animations.js';
import {
  showScene, createCardElement, buildTracker, renderReward,
  systemMessage, clearMessages,
} from './ui.js';

const $ = (sel) => document.querySelector(sel);

export const State = Object.freeze({
  LOADING: 'LOADING',
  INTRO: 'INTRO',
  START: 'START',
  GAME_ACTIVE: 'GAME_ACTIVE',
  MATCH_FOUND: 'MATCH_FOUND',
  REWARD: 'REWARD',
  RESETTING: 'RESETTING',
});

/** Дозволені переходи. Усе, чого тут немає, — помилка і відхиляється. */
const TRANSITIONS = {
  [State.LOADING]: [State.INTRO, State.START],
  [State.INTRO]: [State.START],
  [State.START]: [State.GAME_ACTIVE],
  [State.GAME_ACTIVE]: [State.MATCH_FOUND],
  [State.MATCH_FOUND]: [State.REWARD],
  [State.REWARD]: [State.RESETTING],
  [State.RESETTING]: [State.GAME_ACTIVE],
};

export class Game {
  /**
   * @param {object} deps
   * @param {{cover: HTMLImageElement, question: HTMLImageElement}} deps.images
   * @param {Record<number, string>} deps.filledIndicator  value → src тонованого індикатора
   * @param {import('./particles.js').Particles} deps.particles
   */
  constructor({ images, filledIndicator, particles }) {
    this.images = images;
    this.particles = particles;
    this.app = $('#app');
    this.lineLayer = $('#line-layer');
    this.state = State.LOADING;
    this.scope = createScope();
    this.round = null;
    this.cards = [];
    this.activeCard = null;
    this.result = null;       // значення-переможець поточного раунду
    this.claimed = false;     // чи натиснуто CLAIM / ACCEPT на екрані нагороди
    this.tracker = buildTracker($('#tracker'), filledIndicator);
    this.onChange = null;     // підписка для debug-панелі

    this._bindUi();
  }

  /* ================= State machine ================= */

  /** Єдиний спосіб змінити стан. Повертає false, якщо перехід заборонено. */
  transition(to) {
    if (!TRANSITIONS[this.state]?.includes(to)) {
      if (CONFIG.debug) console.warn(`[game] перехід ${this.state} → ${to} відхилено`);
      return false;
    }
    this._enter(to);
    return true;
  }

  _enter(to) {
    // Усе, що запустив попередній стан, зупиняється тут.
    this.scope.dispose();
    this.scope = createScope();
    this.state = to;
    this.app.dataset.gameState = to;

    const handlers = {
      [State.INTRO]: this._enterIntro,
      [State.START]: this._enterStart,
      [State.GAME_ACTIVE]: this._enterGameActive,
      [State.MATCH_FOUND]: this._enterMatchFound,
      [State.REWARD]: this._enterReward,
      [State.RESETTING]: this._enterResetting,
    };
    const run = handlers[to];
    if (run) {
      Promise.resolve(run.call(this, this.scope)).catch((err) => console.error(`[game] ${to}`, err));
    }
    this.onChange?.();
  }

  async _enterIntro(scope) {
    $('#start-logo').classList.remove('is-shining');
    showScene('start');
    $('#start-btn').disabled = true;
    await playIntro(scope, {
      app: this.app,
      svg: this.lineLayer,
      frame: $('#app-frame'),
      logo: $('.scene--start .logo'),
      title: $('.start__title'),
      hint: $('.scene--start .hint'),
      button: $('#start-btn'),
      sound: $('#sound-btn'),
    });
    this.transition(State.START);
  }

  _enterStart() {
    this.app.classList.add('has-frame');
    $('#start-logo').classList.add('is-shining'); // блиск на логотипі, поки чекаємо гравця
    $('#start-btn').disabled = false;
    showScene('start');
  }

  async _enterGameActive(scope) {
    this._newRound();
    await wipe(scope, () => showScene('game'));
    // Неонова лінія будує сітку; поки вона малює — поле не приймає дотиків.
    await buildGrid(scope, {
      svg: this.lineLayer, app: this.app, board: $('#board'), cards: this.cards.map((c) => c.el),
    });
  }

  async _enterMatchFound(scope) {
    const winners = new Set(this.round.winningIndices);
    const reward = getReward(this.result);
    const started = performance.now();

    // 1–3. Заблокувати все поле і припинити будь-яке активне стирання.
    this.cards.forEach((c) => c.disable());
    this.activeCard = null;
    AudioManager.stopScratch();

    // 4–6. Переможні картки — колір нагороди і синхронна пульсація, решта приглушена.
    const board = $('#board');
    board.style.setProperty('--win', reward.colors.main);
    board.classList.add('is-match');
    this.cards.forEach((c, i) => c.el.classList.add(winners.has(i) ? 'is-winner' : 'is-dimmed'));
    AudioManager.play('match');

    // 7. Неонова лінія з'єднує фактичні позиції переможців (у порядку відкриття).
    const winnerEls = this.round.winningIndices.map((i) => this.cards[i].el);
    await drawMatchLine(scope, { svg: this.lineLayer, app: this.app, cards: winnerEls, colors: reward.colors });

    // 8. Індикатори вже активовані під час відкриття третьої картки.
    // 9. Напис MATCH FOUND.
    const banner = $('#match-banner');
    banner.textContent = CONFIG.text.matchFound;
    banner.style.setProperty('--win', reward.colors.main);
    banner.classList.add('is-visible');
    winnerEls.forEach((el) => this.particles.burstFromElement(el, [reward.colors.main, reward.colors.light, '#FFFFFF']));

    // 10. Перехід до фінального екрана (загальна тривалість сцени — CONFIG.timing.matchHold).
    await scope.wait(Math.max(300, CONFIG.timing.matchHold - (performance.now() - started)));
    this.transition(State.REWARD);
  }

  async _enterReward(scope) {
    const reward = getReward(this.result);
    this.claimed = false;
    const scene = $('.scene--reward');
    $('#reward-btn').disabled = true; // активується останнім кроком сценарію
    await wipe(scope, () => {
      this._clearBoardEffects();
      renderReward(reward);
      stageReward(scene); // елементи сховані, поки шторка закриває екран
      $('#reward-confirm').textContent = '';
      $('#reward-confirm').classList.remove('is-visible');
      showScene('reward');
    }, reward.colors.dark);
    AudioManager.play(`reward${reward.value}`);
    await playReward(scope, {
      reward, scene, app: this.app, svg: this.lineLayer, frame: $('#app-frame'), particles: this.particles,
    });
    $('#reward-btn').disabled = false;
  }

  _enterResetting() {
    this._cleanup();
    this.transition(State.GAME_ACTIVE);
  }

  /* ================= Раунд ================= */

  _newRound() {
    this._cleanup();
    const deck = shuffle(createDeck(REWARDS.map((r) => r.value), CONFIG.game.copiesPerReward));
    this.round = new Round(deck, CONFIG.game.copiesPerReward);
    this.result = null;

    const board = $('#board');
    deck.forEach((value, index) => {
      const { el, canvas } = createCardElement(index, getReward(value));
      board.appendChild(el);
      const card = new ScratchCard({
        canvas,
        coverImg: this.images.cover,
        questionImg: this.images.question,
        onStart: (c) => this._onCardStart(c),
        onStrokeEnd: () => AudioManager.stopScratch(),
        onProgress: () => this.onChange?.(),
        onReveal: (c) => this._onCardReveal(c),
        onLockedTap: () => this._onLockedTap(),
        onScratch: (x, y) => this.particles.scratchAt(x, y),
      });
      card.index = index;
      card.value = value;
      card.el = el;
      this.cards.push(card);
    });
  }

  /** Почали стирати картку — решта тимчасово неактивні до її відкриття. */
  _onCardStart(card) {
    if (this.state !== State.GAME_ACTIVE) return;
    this.activeCard = card;
    card.el.classList.add('is-active');
    this.cards.forEach((c) => c !== card && c.setLocked(true));
    AudioManager.startScratch();
  }

  _onCardReveal(card) {
    if (this.state !== State.GAME_ACTIVE) return;
    card.el.classList.remove('is-active');
    this.activeCard = null;
    AudioManager.stopScratch();

    const res = this.round.reveal(card.index);
    if (!res) return; // картку вже зараховано
    this.tracker.setCount(res.value, res.count);
    this.particles.burstFromElement(card.el);
    AudioManager.play('reveal');

    if (res.isMatch) {
      this.result = res.value;
      this.transition(State.MATCH_FOUND);
      return;
    }
    this.cards.forEach((c) => c.state === CardState.LOCKED && c.setLocked(false));
    this.onChange?.();
  }

  /** Торкнулися заблокованої картки — пояснюємо і «підштовхуємо» активну. */
  _onLockedTap() {
    if (this.state !== State.GAME_ACTIVE) return;
    systemMessage(CONFIG.text.lockedHint);
    const el = this.activeCard?.el;
    if (!el) return;
    el.classList.remove('is-nudged');
    void el.offsetWidth; // перезапуск CSS-анімації
    el.classList.add('is-nudged');
  }

  /** Прибрати лінії, частинки й напис MATCH FOUND з поля. */
  _clearBoardEffects() {
    clearLines(this.lineLayer);
    this.particles.clear();
    $('#match-banner').classList.remove('is-visible');
  }

  /** Прибрати все, що лишилося від попереднього раунду. */
  _cleanup() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.activeCard = null;
    const board = $('#board');
    board.innerHTML = '';
    board.classList.remove('is-match', 'is-building');
    this._clearBoardEffects();
    this.tracker.reset();
    clearMessages();
    AudioManager.reset();
  }

  /* ================= Кнопки ================= */

  _bindUi() {
    $('#start-btn').addEventListener('click', () => {
      if (this.state !== State.START) return; // подвійне натискання
      $('#start-btn').disabled = true;
      AudioManager.play('click');
      this.transition(State.GAME_ACTIVE);
    });

    // Перше натискання — CLAIM / ACCEPT, друге — PLAY AGAIN.
    $('#reward-btn').addEventListener('click', () => {
      if (this.state !== State.REWARD) return;
      AudioManager.play('click');
      if (!this.claimed) {
        this.claimed = true;
        this._claimReward(getReward(this.result));
        $('#reward-btn-label').textContent = CONFIG.text.playAgain;
        return;
      }
      $('#reward-btn').disabled = true;
      this.transition(State.RESETTING);
    });
  }

  /**
   * Що відбувається після CLAIM REWARD / ACCEPT REALITY.
   * ТЕХНІЧНА ЗАГЛУШКА (ТЗ, розділ 25): лише коротке підтвердження.
   * Щоб змінити поведінку в майбутньому, достатньо переписати цей метод —
   * решта гри від нього не залежить.
   */
  _claimReward(reward) {
    $('#reward-confirm').textContent = reward.confirm;
    $('#reward-confirm').classList.add('is-visible');
  }

  /* ================= Лише для debug-режиму ================= */

  /** Обійти таблицю переходів. Використовується ТІЛЬКИ з debug.js. */
  _debugForce(to) {
    if (!CONFIG.debug) return;
    this._enter(to);
  }

  /** Повторно запустити інтро. */
  debugIntro() {
    this._debugForce(State.INTRO);
  }

  /** Новий раунд з будь-якого стану. */
  debugNewRound() {
    this._debugForce(State.GAME_ACTIVE);
  }

  /** Показати екран нагороди без гри. */
  debugShowReward(value) {
    if (!CONFIG.debug) return;
    this.result = value;
    this._debugForce(State.REWARD);
  }

  /** Перевірити MATCH FOUND справжнім шляхом: відкрити три картки зі значенням value. */
  debugForceMatch(value) {
    if (!CONFIG.debug) return;
    const go = () => this.cards
      .filter((c) => c.value === value && c.state !== CardState.REVEALED)
      .forEach((c) => this.state === State.GAME_ACTIVE && c.reveal());
    if (this.state === State.GAME_ACTIVE) go();
    else {
      this.debugNewRound();
      this.scope.wait(CONFIG.timing.sceneWipe + CONFIG.timing.gridDraw + 400).then(go);
    }
  }
}
