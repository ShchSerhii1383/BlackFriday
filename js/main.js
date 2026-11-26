/**
 * main.js — точка входу: завантаження асетів і шрифтів, створення гри.
 * Ігрові правила живуть у game.js (state machine) і round.js (логіка раунду).
 */
import { CONFIG, REWARDS } from './config.js';
import { AudioManager } from './audio.js';
import { Game, State } from './game.js';
import { Particles } from './particles.js';
import { loadImage, tintImage, applyTexts, toast, bindArcadeButtons } from './ui.js';

const $ = (sel) => document.querySelector(sel);

/** Завантажити асети. Повертає зображення для canvas і тоновані індикатори. */
async function preload() {
  const a = CONFIG.assets;
  const rest = [a.logo, a.button, a.indicatorEmpty, a.soundOn, a.soundOff, a.cardFrame,
    ...REWARDS.flatMap((r) => [r.discountImg, r.memeImg])];

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

/** Кнопка звуку: поки аудіо недоступне — лише чесне повідомлення. */
function bindSoundButton() {
  const btn = $('#sound-btn');
  btn.addEventListener('click', () => {
    const on = AudioManager.toggle();
    if (!CONFIG.audio.available) toast(CONFIG.text.soundSoon);
    btn.querySelector('img').src = on ? CONFIG.assets.soundOn : CONFIG.assets.soundOff;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Звук увімкнено' : 'Звук вимкнено');
  });
}

async function boot() {
  AudioManager.init();
  applyTexts();

  const deps = await preload();
  const particles = new Particles($('#fx-layer'), $('#app'));
  const game = new Game({ ...deps, particles });
  bindSoundButton();
  bindArcadeButtons();
  game.transition(State.INTRO); // LOADING → INTRO → START

  if (CONFIG.debug) {
    const { initDebug } = await import('./debug.js');
    initDebug(game);
  }
}

boot().catch((err) => console.error('[boot]', err));
