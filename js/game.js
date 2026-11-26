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
import { pickCombination } from './reward-pick.js';
import { Storage } from './storage.js';
import { secretConfig } from './secret-config.js';
import {
  preloadSecretAssets, playGlitch, playAchievement, playPortal, playPortalEnter, revealRoom,
} from './secret.js';
import {
  buildRoom, renderGift, playGiftOpening, playGreeting, playEasterEgg, resetEasterEggs,
} from './room.js';
import {
  createScope, playIntro, buildGrid, drawMatchLine, wipe, clearLines,
  stageReward, playReward,
} from './animations.js';
import {
  showScene, createCardElement, buildTracker, renderReward,
  systemMessage, clearMessages,
} from './ui.js';

const $ = (sel) => document.querySelector(sel);

/** Унікальний ID раунду — щоб кожна гра зараховувалась у прихований прогрес лише раз. */
function makeRoundId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const State = Object.freeze({
  LOADING: 'LOADING',
  INTRO: 'INTRO',
  START: 'START',
  GAME_ACTIVE: 'GAME_ACTIVE',
  MATCH_FOUND: 'MATCH_FOUND',
  REWARD: 'REWARD',
  RESETTING: 'RESETTING',
  // SECRET LEVEL (ТЗ 2.0, розділ 20).
  SECRET_UNLOCK: 'SECRET_UNLOCK',
  SECRET_ACHIEVEMENT: 'SECRET_ACHIEVEMENT',
  SECRET_PORTAL: 'SECRET_PORTAL',
  SECRET_ROOM: 'SECRET_ROOM',
  SECRET_GIFT_OPENING: 'SECRET_GIFT_OPENING',
  SECRET_GREETING: 'SECRET_GREETING',
});

/** Дозволені переходи. Усе, чого тут немає, — помилка і відхиляється. */
const TRANSITIONS = {
  [State.LOADING]: [State.INTRO, State.START],
  [State.INTRO]: [State.START],
  // START → SECRET_UNLOCK: секрет відкрито, але кімнату ще не бачили (браузер закрили раніше)
  // START → SECRET_ROOM: корона на стартовому екрані (кімнату вже бачили)
  [State.START]: [State.GAME_ACTIVE, State.SECRET_UNLOCK, State.SECRET_ROOM],
  [State.GAME_ACTIVE]: [State.MATCH_FOUND],
  [State.MATCH_FOUND]: [State.REWARD],
  // REWARD → SECRET_UNLOCK: CLAIM / ACCEPT на п'ятій завершеній грі
  [State.REWARD]: [State.RESETTING, State.SECRET_UNLOCK],
  [State.RESETTING]: [State.GAME_ACTIVE],
  [State.SECRET_UNLOCK]: [State.SECRET_ACHIEVEMENT],
  [State.SECRET_ACHIEVEMENT]: [State.SECRET_PORTAL],
  [State.SECRET_PORTAL]: [State.SECRET_ROOM],
  // Кімната: повернення до гри, відкриття подарунка, повторне читання привітання
  [State.SECRET_ROOM]: [State.START, State.SECRET_GIFT_OPENING, State.SECRET_GREETING],
  [State.SECRET_GIFT_OPENING]: [State.SECRET_GREETING],
  [State.SECRET_GREETING]: [State.SECRET_ROOM],
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
    this.claimedAt = 0;       // коли натиснуто CLAIM (для claimGuard)
    this.rewardPick = null;   // обрані персонаж і фраза поточного результату
    this.debugPick = null;    // примусовий вибір з debug-панелі (лише в debug-режимі)
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
    this.prevState = this.state;
    this.state = to;
    this.app.dataset.gameState = to;

    const handlers = {
      [State.INTRO]: this._enterIntro,
      [State.START]: this._enterStart,
      [State.GAME_ACTIVE]: this._enterGameActive,
      [State.MATCH_FOUND]: this._enterMatchFound,
      [State.REWARD]: this._enterReward,
      [State.RESETTING]: this._enterResetting,
      [State.SECRET_UNLOCK]: this._enterSecretUnlock,
      [State.SECRET_ACHIEVEMENT]: this._enterSecretAchievement,
      [State.SECRET_PORTAL]: this._enterSecretPortal,
      [State.SECRET_ROOM]: this._enterSecretRoom,
      [State.SECRET_GIFT_OPENING]: this._enterGiftOpening,
      [State.SECRET_GREETING]: this._enterGreeting,
    };
    const run = handlers[to];
    if (run) {
      Promise.resolve(run.call(this, this.scope)).catch((err) => console.error(`[game] ${to}`, err));
    }
    this.onChange?.();
  }

  async _enterIntro(scope) {
    $('#start-logo').classList.remove('is-shining');
    $('#start-crown').hidden = true;
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

  async _enterStart(scope) {
    this.app.classList.add('has-frame');
    $('#start-logo').classList.add('is-shining'); // блиск на логотипі, поки чекаємо гравця
    $('#start-btn').disabled = false;
    AudioManager.stopRoomAmbient();
    resetEasterEggs();
    // Корона з'являється лише тоді, коли секретну кімнату вже побачили — до того жодних підказок.
    $('#start-crown').hidden = !Storage.getProgress().secretViewed;
    // З кімнати повертаємось через ту саму піксельну шторку, що й між іншими сценами.
    if (this.prevState === State.SECRET_ROOM) await wipe(scope, () => showScene('start'));
    else showScene('start');
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

    // Прихований прогрес: гра вважається завершеною саме зараз (третя однакова картка).
    // ID раунду гарантує одне зарахування; гравець цього ніде не бачить.
    const progress = Storage.recordCompletedGame(this.roundId, secretConfig.unlockAfter);
    // Після передостанньої гри непомітно підвантажуємо графіку секрету (ТЗ 2.0, розділ 24).
    if (progress.completedGames >= secretConfig.unlockAfter - 1) preloadSecretAssets();

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
    // Персонаж і фраза обираються ОДИН раз на результат; повторний рендер їх не змінює.
    this.rewardPick = this._choosePresentation(reward);
    $('#reward-btn').disabled = true; // активується останнім кроком сценарію
    await wipe(scope, () => {
      this._clearBoardEffects();
      renderReward(reward, this.rewardPick);
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

  /* ================= SECRET LEVEL ================= */

  /** Секрет відкрито, але кімнату ще не бачили — показати секретний сценарій. */
  _secretPending() {
    const p = Storage.getProgress();
    return p.secretUnlocked && !p.secretViewed;
  }

  /** Етап A: поточний екран (нагорода або старт) «збоїть». */
  async _enterSecretUnlock(scope) {
    preloadSecretAssets();
    const from = document.querySelector('.scene.is-active:not(.scene--secret)') || $('.scene--start');
    AudioManager.play('glitch');
    await playGlitch(scope, { app: this.app, scene: $('.scene--secret'), from });
    this.transition(State.SECRET_ACHIEVEMENT);
  }

  /** Етап B: медаль SALES QUEEN. */
  async _enterSecretAchievement(scope) {
    AudioManager.play('achievement');
    await playAchievement(scope, { app: this.app, scene: $('.scene--secret'), particles: this.particles });
    this.transition(State.SECRET_PORTAL);
  }

  /** Етап C: портал і кнопка ENTER SECRET ROOM (натискання — див. _bindUi). */
  async _enterSecretPortal(scope) {
    this.portalEntering = false;
    AudioManager.play('portal');
    await playPortal(scope, {
      app: this.app, scene: $('.scene--secret'), particles: this.particles, button: $('#secret-enter-btn'),
    });
  }

  /** Прохід крізь портал → кімната. Повторні натискання ігноруються. */
  async _enterPortal() {
    if (this.state !== State.SECRET_PORTAL || this.portalEntering) return;
    this.portalEntering = true;
    $('#secret-enter-btn').disabled = true;
    AudioManager.play('portalTransition');
    await playPortalEnter(this.scope, {
      app: this.app, scene: $('.scene--secret'), particles: this.particles, button: $('#secret-enter-btn'),
    });
    this.transition(State.SECRET_ROOM);
  }

  /**
   * SALES QUEEN'S SECRET ROOM. Вхід крізь портал (перший раз) або з корони
   * на стартовому екрані (повторні відвідини).
   */
  async _enterSecretRoom(scope) {
    // Кімнату побачено: повна анімація розблокування більше не повториться.
    Storage.markSecretViewed();
    preloadSecretAssets();
    buildRoom();
    const { giftOpened } = Storage.getProgress();
    renderGift(giftOpened);
    $('#gift-btn').disabled = false;
    // Повернення до гри — ненав'язливе: при першому візиті з'являється після привітання.
    $('.scene--room').classList.toggle('is-nav-visible', giftOpened);
    AudioManager.startRoomAmbient();

    // Повернулися з подарунка/привітання — кімната вже на екрані, без переходу.
    if (this.prevState === State.SECRET_GIFT_OPENING || this.prevState === State.SECRET_GREETING) return;
    this.particles.clear();
    const room = $('.scene--room');
    if (this.prevState === State.SECRET_PORTAL) {
      showScene('room');
      revealRoom(scope, room); // проявляється з теплого спалаху порталу
    } else {
      await wipe(scope, () => showScene('room'), '#3a1438');
    }
  }

  /** Подарунок: 9 кроків відкриття (room.js), потім — привітання. */
  async _enterGiftOpening(scope) {
    await playGiftOpening(scope, {
      app: this.app,
      particles: this.particles,
      onOpened: () => Storage.markGiftOpened(),
    });
    this.transition(State.SECRET_GREETING);
  }

  /** Панель привітання. OK — назад у кімнату (подарунок лишається відкритим). */
  async _enterGreeting(scope) {
    $('#gift-btn').disabled = true;
    await playGreeting(scope, { onClose: () => this.transition(State.SECRET_ROOM) });
  }

  /**
   * Який персонаж і яка фраза супроводжують результат.
   * Незалежний випадковий вибір серед усіх комбінацій знижки, крім останньої
   * показаної (Anti-Repeat). Остання комбінація зберігається в localStorage
   * за назвою персонажа, тож зміна порядку персонажів у config.js її не зламає.
   * На результат гри вибір не впливає — переможця вже визначено.
   */
  _choosePresentation(reward) {
    if (CONFIG.debug && this.debugPick) {
      const pick = this.debugPick; // примусовий перегляд з debug-панелі — не зберігається
      this.debugPick = null;
      return pick;
    }
    const saved = Storage.getLastCombo(reward.key);
    const last = saved
      ? { memeIndex: reward.memes.findIndex((m) => m.key === saved.meme), phraseIndex: saved.phrase }
      : null;
    const pick = pickCombination(reward.memes.length, reward.phrases.length, last);
    Storage.setLastCombo(reward.key, { meme: reward.memes[pick.memeIndex].key, phrase: pick.phraseIndex });
    return pick;
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
    this.roundId = makeRoundId();
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
      // Секрет відкрито, але не переглянуто (браузер закрили раніше) — продовжуємо сценарій.
      this.transition(this._secretPending() ? State.SECRET_UNLOCK : State.GAME_ACTIVE);
    });

    $('#secret-enter-btn').addEventListener('click', () => this._enterPortal());

    $('#start-crown').addEventListener('click', () => {
      if (this.state !== State.START || !Storage.getProgress().secretViewed) return;
      AudioManager.play('click');
      this.transition(State.SECRET_ROOM);
    });

    // Подарунок: закритий — відкрити; відкритий — перечитати привітання.
    $('#gift-btn').addEventListener('click', () => {
      if (this.state !== State.SECRET_ROOM) return;
      AudioManager.play('click');
      this.transition(Storage.getProgress().giftOpened ? State.SECRET_GREETING : State.SECRET_GIFT_OPENING);
    });

    // Приховані Easter Eggs: працюють лише в самій кімнаті (не під час подарунка/привітання).
    $('#room-hotspots').addEventListener('click', (e) => {
      const spot = e.target.closest('.room__hotspot');
      if (!spot || this.state !== State.SECRET_ROOM) return;
      playEasterEgg(spot.dataset.egg, { app: this.app, particles: this.particles });
    });

    $('#room-back').addEventListener('click', () => {
      if (this.state !== State.SECRET_ROOM) return;
      AudioManager.play('click');
      this.transition(State.START);
    });

    // Перше натискання — CLAIM / ACCEPT, друге — PLAY AGAIN.
    $('#reward-btn').addEventListener('click', () => {
      if (this.state !== State.REWARD) return;
      AudioManager.play('click');
      if (!this.claimed) {
        this.claimed = true;
        // П'ята завершена гра: замість звичайного підтвердження — секретний сценарій.
        if (this._secretPending()) {
          $('#reward-btn').disabled = true;
          this.transition(State.SECRET_UNLOCK);
          return;
        }
        this._claimReward(getReward(this.result));
        $('#reward-btn-label').textContent = CONFIG.text.playAgain;
        this.claimedAt = performance.now();
        return;
      }
      // Випадковий подвійний тап на CLAIM не має одразу запускати нову гру.
      if (performance.now() - this.claimedAt < CONFIG.timing.claimGuard) return;
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

  /**
   * Перейти прямо до етапу секрету: 'glitch' | 'achievement' | 'portal' | 'room' |
   * 'gift-closed' (кімната із закритим подарунком) | 'gift-open' | 'greeting'.
   */
  debugSecret(step) {
    if (!CONFIG.debug) return;
    if (step === 'gift-closed') Storage.debugSetGiftOpened(false);
    if (step === 'gift-open' || step === 'greeting') Storage.debugSetGiftOpened(true);
    const to = { glitch: State.SECRET_UNLOCK, achievement: State.SECRET_ACHIEVEMENT, portal: State.SECRET_PORTAL,
      room: State.SECRET_ROOM, 'gift-closed': State.SECRET_ROOM, 'gift-open': State.SECRET_ROOM }[step];
    if (to) return this._debugForce(to);
    if (step === 'greeting') {
      buildRoom();
      renderGift(true);
      showScene('room');
      this._debugForce(State.SECRET_GREETING);
    }
  }

  /** Запустити Easter Egg (кімната має бути відкрита: Secret → Room). */
  debugEgg(id) {
    if (CONFIG.debug && this.state === State.SECRET_ROOM) playEasterEgg(id, { app: this.app, particles: this.particles });
  }

  /** Стерти всі збережені дані гри (останні комбінації і прихований прогрес). */
  debugResetStorage() {
    if (CONFIG.debug) Storage.reset();
  }

  /** Скинути лише прихований прогрес. */
  debugResetProgress() {
    if (CONFIG.debug) Storage.resetProgress();
  }

  /**
   * Виставити кількість завершених ігор: n = 3 → наступна перемога буде 4-ю,
   * n = 4 → наступна буде 5-ю і відкриє секрет.
   */
  debugSetCompletedGames(n) {
    if (CONFIG.debug) Storage.debugSetCompletedGames(n, secretConfig.unlockAfter);
  }

  /** Показати екран нагороди без гри (за потреби — з конкретним персонажем і фразою). */
  debugShowReward(value, pick = null) {
    if (!CONFIG.debug) return;
    this.result = value;
    this.debugPick = pick;
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
