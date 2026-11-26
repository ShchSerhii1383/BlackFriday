/**
 * audio.js — архітектура майбутнього звукового модуля.
 *
 * Поки CONFIG.audio.available === false, кожен метод — безпечна заглушка:
 * жодних запитів до файлів, жодних 404 і жодних Promise rejection.
 * Ігрова логіка вже викликає ці методи, тож коли з'являться MP3,
 * достатньо реалізувати _load/_playBuffer і ввімкнути available.
 *
 * На майбутнє врахувати:
 *  - iOS дозволяє звук лише після жесту користувача (розблокувати AudioContext у першому tap);
 *  - зберігати вибір у localStorage;
 *  - зупиняти музику на visibilitychange (інша вкладка) і відновлювати після повернення.
 */
import { CONFIG } from './config.js';

const cfg = CONFIG.audio;

/** Події гри → ключі файлів у CONFIG.audio.files. */
const EVENT_TO_FILE = {
  intro: 'intro',
  click: 'buttonClick',
  reveal: 'cardReveal',
  match: 'matchFound',
  reward0: 'reward0',
  reward33: 'reward33',
  reward66: 'reward66',
  reward100: 'reward100',
};

export const AudioManager = {
  enabled: false,
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.enabled = cfg.available && cfg.enabledByDefault;
  },

  /** Чи може звук реально грати зараз. */
  get canPlay() {
    return cfg.available && this.enabled;
  },

  play(event) {
    if (!this.canPlay || !EVENT_TO_FILE[event]) return;
    // TODO (майбутнє): відтворити cfg.files[EVENT_TO_FILE[event]] з гучністю cfg.effectsVolume
  },

  startMusic() {
    if (!this.canPlay) return;
    // TODO (майбутнє): цикл cfg.files.background з гучністю cfg.musicVolume
  },

  stopMusic() {
    // Безпечно викликати завжди.
  },

  startScratch() {
    if (!this.canPlay) return;
    // TODO (майбутнє): цикл cfg.files.scratch, поки палець стирає
  },

  stopScratch() {
    // Безпечно викликати завжди.
  },

  /** Повертає новий стан. Поки звук недоступний — завжди false. */
  toggle() {
    return this.setEnabled(!this.enabled);
  },

  setEnabled(value) {
    this.enabled = cfg.available ? Boolean(value) : false;
    if (!this.enabled) {
      this.stopMusic();
      this.stopScratch();
    }
    return this.enabled;
  },

  /** Зупинити все, що грає (новий раунд, вихід зі сцени). */
  reset() {
    this.stopMusic();
    this.stopScratch();
  },
};
