/**
 * audio.js — музика і звукові ефекти (фінальна музична режисура).
 *
 * Два канали:
 *  - МУЗИКА: один <audio>-елемент, якому міняється src. iOS «благословляє» елемент
 *    після першого відтворення в жесті користувача — далі той самий елемент може
 *    перемикати треки без нового дотику (музика нагороди після стирання тощо).
 *    Гучність і плавні переходи — через Web Audio GainNode (на iOS element.volume не працює).
 *  - ЕФЕКТИ: короткі файли декодуються в AudioBuffer і грають без затримки.
 *
 * Правила браузерів: жодного звуку до першого дотику/клавіші. До того music() лише
 * запам'ятовує бажаний трек, а play('intro') чекає дотику не довше INTRO_GRACE мс.
 * Відсутній файл або заборона відтворення — тихо ігноруються (гра працює без звуку).
 */
import { CONFIG } from './config.js';

const cfg = CONFIG.audio;
const SOUND_KEY = 'bf-arcade-sound';   // '1' / '0' — вибір кнопки звуку
const INTRO_GRACE = 6000;              // скільки інтро-джингл чекає першого дотику
const FADE_OUT = 0.35;                 // с — затихання попереднього треку
const FADE_IN = 0.6;                   // с — поява нового

/** Події гри → короткі ефекти (ключі CONFIG.audio.files). Подій без файлу тут немає — вони тихі. */
const SFX = {
  intro: 'intro',
  click: 'buttonClick',
  glitch: 'systemGlitch',
  portal: 'secretPortal',
};

/** Події, які насправді перемикають музику (виклики з game.js / room.js). */
const MUSIC_EVENTS = {
  reward0: 'reward0',
  reward33: 'reward33',
  reward66: 'reward66',
  reward100: 'reward100',
  giftOpen: 'greeting',   // Home — Undertale звучить від відкриття подарунка до кінця привітання
};

/** Ключі музики → файли. */
const TRACKS = {
  background: 'background',
  reward0: 'reward0',
  reward33: 'reward33',
  reward66: 'reward66',
  reward100: 'reward100',
  room: 'secretRoomAmbient',
  greeting: 'greetingMusic',
};

let ctx = null;          // AudioContext (створюється в першому жесті)
let sfxGain = null;
let musicGain = null;
let musicEl = null;      // єдиний <audio> для музики
const buffers = new Map();   // ключ файлу → Promise<AudioBuffer | null>
let scratchSource = null;
let switchTimer = 0;

function readPreference() {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    return v === null ? cfg.enabledByDefault : v === '1';
  } catch {
    return cfg.enabledByDefault;
  }
}

function savePreference(on) {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* приватний режим — лише на цю сесію */ }
}

export const AudioManager = {
  enabled: false,
  unlocked: false,
  _initialized: false,
  _desired: null,        // який трек має грати зараз (навіть якщо звук ще заблоковано)
  _current: null,        // який трек реально завантажено в musicEl
  _introRequestedAt: 0,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.enabled = cfg.available && readPreference();
    if (!cfg.available) return;

    const unlock = () => this._unlock();
    ['pointerdown', 'touchend', 'keydown'].forEach((t) => window.addEventListener(t, unlock, { capture: true, passive: true }));
    this._removeUnlock = () => ['pointerdown', 'touchend', 'keydown'].forEach((t) => window.removeEventListener(t, unlock, { capture: true }));

    // Інша вкладка / згорнутий браузер — музика на паузі, повернення — продовжує.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        musicEl?.pause();
        ctx?.suspend().catch(() => {});
      } else if (this.unlocked) {
        ctx?.resume().catch(() => {});
        if (this.canPlay && this._desired) musicEl?.play().catch(() => {});
      }
    });
  },

  /** Чи може звук реально грати зараз. */
  get canPlay() {
    return cfg.available && this.enabled && this.unlocked;
  },

  /** Перший жест користувача: розблокувати Web Audio і «благословити» музичний елемент. */
  _unlock() {
    if (!this._ensureContext()) return;
    ctx.resume().catch(() => {});
    if (!musicEl) this._createMusicElement();
    if (this.unlocked) return;
    this.unlocked = true;
    this._removeUnlock?.();
    // Короткі ефекти — одразу в пам'ять (разом кілька десятків КБ).
    Object.values(SFX).concat('scratch').forEach((k) => this._buffer(k));
    if (!this.enabled) return;
    if (this._introRequestedAt && performance.now() - this._introRequestedAt < INTRO_GRACE) this._playBuffer('intro');
    this._introRequestedAt = 0;
    this._applyMusic(true);
  },

  _ensureContext() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    // iOS 16.4+: «це програвання, як у плеєра» — звук грає навіть у беззвучному режимі
    // (інакше перемикач на боці iPhone глушить Web Audio). На інших системах властивості немає.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch { /* старі версії — без змін */ }
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = cfg.effectsVolume;
    sfxGain.connect(ctx.destination);
    return true;
  },

  _createMusicElement() {
    musicEl = new Audio();
    musicEl.loop = true;
    musicEl.preload = 'auto';
    musicEl.setAttribute('playsinline', '');
    try {
      const src = ctx.createMediaElementSource(musicEl);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      src.connect(musicGain).connect(ctx.destination);
    } catch {
      musicGain = null; // без Web Audio — запасний варіант через element.volume
    }
  },

  /* ------------------------------- ЕФЕКТИ ------------------------------- */

  /** Подія гри: короткий ефект або перемикання музики. Невідомі/беззвучні події ігноруються. */
  play(event) {
    if (MUSIC_EVENTS[event]) { this.music(MUSIC_EVENTS[event]); return; }
    const key = SFX[event];
    if (!key || !cfg.available || !this.enabled) return;
    if (!this.unlocked) {
      if (event === 'intro') this._introRequestedAt = performance.now(); // заграє з першим дотиком
      return;
    }
    this._playBuffer(key);
  },

  _buffer(key) {
    if (!buffers.has(key)) {
      const p = fetch(cfg.files[key])
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))) // форма з колбеками — для старого Safari
        .catch(() => null);
      buffers.set(key, p);
    }
    return buffers.get(key);
  },

  async _playBuffer(key, { loop = false } = {}) {
    const buf = await this._buffer(key);
    if (!buf || !this.canPlay) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.connect(sfxGain);
    src.start();
    return src;
  },

  /** Звук стирання по колу, поки палець рухається по картці. */
  async startScratch() {
    if (!this.canPlay || scratchSource) return;
    scratchSource = 'pending';
    const src = await this._playBuffer('scratch', { loop: true });
    if (scratchSource !== 'pending') { src?.stop(); return; } // палець уже відпустили
    scratchSource = src;
  },

  stopScratch() {
    if (scratchSource && scratchSource !== 'pending') {
      try { scratchSource.stop(); } catch { /* уже зупинено */ }
    }
    scratchSource = null;
  },

  /* ------------------------------- МУЗИКА ------------------------------- */

  /**
   * Перемкнути музику на трек (ключ TRACKS) або вимкнути (null).
   * Той самий трек не перезапускається. До першого дотику лише запам'ятовується.
   */
  music(key) {
    const next = key && TRACKS[key] ? key : null;
    if (next === this._desired) return;
    this._desired = next;
    this._applyMusic(false);
  },

  _applyMusic(fromGesture) {
    if (!this.canPlay || !musicEl) return;
    clearTimeout(switchTimer);
    const target = this._desired;
    if (target === this._current && target) {
      if (musicEl.paused) musicEl.play().catch(() => {});
      this._fade(1, FADE_IN);
      return;
    }
    const swap = () => {
      this._current = target;
      if (!target) { musicEl.pause(); return; }
      musicEl.src = cfg.files[TRACKS[target]];
      musicEl.currentTime = 0;
      musicEl.play().catch(() => {}); // заборона або відсутній файл — тиша, без помилок
      this._fade(1, FADE_IN);
    };
    // Перший запуск у жесті — синхронно (iOS вимагає play() саме в обробнику дотику).
    if (fromGesture || !this._current || musicEl.paused) { this._fade(0, 0); swap(); return; }
    this._fade(0, FADE_OUT);
    switchTimer = setTimeout(swap, FADE_OUT * 1000);
  },

  _fade(to, seconds) {
    const vol = to * cfg.musicVolume;
    if (musicGain) {
      const g = musicGain.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(vol, now + Math.max(seconds, 0.01));
    } else if (musicEl) {
      musicEl.volume = vol;
    }
  },

  /* --------------------- Сумісність із викликами гри --------------------- */

  startMusic() { this.music('background'); },
  stopMusic() { this.music(null); },
  startRoomAmbient() { this.music('room'); },
  stopRoomAmbient() { if (this._desired === 'room' || this._desired === 'greeting') this.music(null); },

  /** Новий раунд: зупиняємо лише звук стирання — музика гри грає далі. */
  reset() {
    this.stopScratch();
  },

  /** Debug і тести: що зараз відбувається зі звуком. */
  debugState() {
    return {
      enabled: this.enabled, unlocked: this.unlocked, desired: this._desired, current: this._current,
      src: musicEl ? musicEl.currentSrc.split('/').pop() : null,
      paused: musicEl ? musicEl.paused : true,
      time: musicEl ? +musicEl.currentTime.toFixed(2) : 0,
      gain: musicGain ? +musicGain.gain.value.toFixed(2) : null,
      ctx: ctx ? ctx.state : 'none',
      scratching: Boolean(scratchSource),
    };
  },

  /* ------------------------------- КНОПКА ------------------------------- */

  toggle() {
    return this.setEnabled(!this.enabled);
  },

  setEnabled(value) {
    this.enabled = cfg.available ? Boolean(value) : false;
    savePreference(this.enabled);
    if (!this.enabled) {
      this.stopScratch();
      clearTimeout(switchTimer);
      musicEl?.pause();
    } else if (this.unlocked) {
      this._applyMusic(true); // натискання на кнопку — теж жест; той самий трек продовжується з місця паузи
    }
    return this.enabled;
  },
};
