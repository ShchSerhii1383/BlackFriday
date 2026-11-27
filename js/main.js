/**
 * main.js — точка входу: завантаження асетів і шрифтів, створення гри.
 * Ігрові правила живуть у game.js (state machine) і round.js (логіка раунду).
 */
import { CONFIG, REWARDS } from './config.js';
import { AudioManager } from './audio.js';
import { Game, State } from './game.js';
import { Particles } from './particles.js';
import { Storage } from './storage.js';
import { preloadSecretAssets } from './secret.js';
import { loadImage, tintImage, applyTexts, toast, bindArcadeButtons } from './ui.js';

const $ = (sel) => document.querySelector(sel);

/** Завантажити асети. Повертає зображення для canvas і тоновані індикатори. */
async function preload() {
  const a = CONFIG.assets;
  // Перший екран і поле. Мемні персонажі — окремо, у фоні (див. preloadMemes).
  const rest = [a.logo, a.button, a.indicatorEmpty, a.soundOn, a.soundOff, a.cardFrame,
    ...REWARDS.map((r) => r.discountImg)];

  const fonts = Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, CONFIG.timing.fontsTimeout)), // шрифт не має блокувати гру
  ]);
  const [cover, question, indicatorFilled] = await Promise.all([
    loadImage(a.scratchCover),
    loadImage(a.questionMark),
    loadImage(a.indicatorFilled),
    Promise.all(rest.map(loadImage)),
    fonts,
  ]);

  const filledIndicator = {};
  for (const r of REWARDS) filledIndicator[r.value] = tintImage(indicatorFilled, r.colors.main);
  return { images: { cover, question }, filledIndicator };
}

/** Посилання на завантажені у фоні зображення (щоб браузер тримав їх у кеші пам'яті). */
const backgroundCache = [];

/**
 * 12 мемних персонажів (~1,3 МБ) завантажуються у фоні ПІСЛЯ інтро,
 * щоб не конкурувати з анімацією і першим екраном. До першого результату
 * (≥ 3 відкриті картки) вони гарантовано встигають.
 */
function preloadMemes() {
  const start = () => {
    for (const r of REWARDS) for (const m of r.memes) backgroundCache.push(loadImage(m.img));
  };
  setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2000 }) : start()),
    CONFIG.timing.memePreloadDelay);
}

/** Кнопка звуку: вмикає/вимикає все; вибір запам'ятовується (audio.js). */
function bindSoundButton() {
  const btn = $('#sound-btn');
  const render = (on) => {
    btn.querySelector('img').src = on ? CONFIG.assets.soundOn : CONFIG.assets.soundOff;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Звук увімкнено' : 'Звук вимкнено');
  };
  render(AudioManager.enabled);
  btn.addEventListener('click', () => {
    const on = AudioManager.toggle();
    if (on) AudioManager.play('click');
    render(on);
  });
}

async function boot() {
  AudioManager.init();
  applyTexts();

  const deps = await preload();
  const particles = new Particles($('#fx-layer'), $('#app'));
  // Минулого разу гру пройдено до кінця привітання → цей вхід починається з нуля.
  Storage.startNewJourneyIfComplete();
  const game = new Game({ ...deps, particles });
  bindSoundButton();
  bindArcadeButtons();
  game.transition(State.INTRO); // LOADING → INTRO → START
  preloadMemes();
  // Секрет уже відкрито раніше — графіка знадобиться (після START або в кімнаті).
  if (Storage.getProgress().secretUnlocked) preloadSecretAssets();

  if (CONFIG.debug) {
    const { initDebug } = await import('./debug.js');
    initDebug(game);
  }
}

boot().catch((err) => console.error('[boot]', err));
