/**
 * scratch.js — одна скретч-картка на Canvas.
 *
 * Як це працює:
 *  1. На canvas малюється захисний шар (scratch-cover) і знак питання.
 *  2. Палець «вирізає» шар через globalCompositeOperation = 'destination-out'.
 *  3. Паралельно ведеться низькороздільна карта стирання (сітка N×N).
 *     Відсоток рахується по ній — без дорогого getImageData на кожному русі.
 *  4. Рахуються лише «активні» клітинки: ті, що видно в отворі рамки
 *     і де захисний шар спочатку непрозорий (прозорі кути не вважаються стертими).
 *  5. Усі штампи зберігаються в нормалізованих координатах (0–1),
 *     тому після повороту телефона шар перемальовується без втрати прогресу.
 *
 * Важливо для iOS Safari: pointermove/up слухаються на window (палець часто
 * виїжджає за межі картки), усі слухачі з { passive: false } і preventDefault().
 */
import { CONFIG } from './config.js';

const S = CONFIG.scratch;

/** Стан картки. */
export const CardState = Object.freeze({
  READY: 'ready',       // можна стирати
  LOCKED: 'locked',     // тимчасово неактивна (стирається інша картка)
  REVEALED: 'revealed', // відкрита, більше не реагує
  DISABLED: 'disabled', // раунд завершено: картка мовчки ігнорує дотики
});

/* ------------------------------------------------------------------ */
/* Маска активних клітинок — однакова для всіх карток, рахується один раз */
/* ------------------------------------------------------------------ */

let activeMaskCache = null;

/** Зображення завантажене і придатне для drawImage (бите зображення кидає помилку). */
function isUsable(img) {
  return Boolean(img && img.complete && img.naturalWidth);
}

/** Межі отвору рамки в координатах canvas (0–1). */
function holeInCanvas() {
  const span = 1 - 2 * S.coverInset;
  const h = CONFIG.frameHole;
  return {
    left: (h.left - S.coverInset) / span,
    top: (h.top - S.coverInset) / span,
    right: 1 - (h.right - S.coverInset) / span,
    bottom: 1 - (h.bottom - S.coverInset) / span,
  };
}

function buildActiveMask(coverImg) {
  if (activeMaskCache) return activeMaskCache;
  const n = S.coverageGrid;
  const probe = document.createElement('canvas');
  probe.width = probe.height = n;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (isUsable(coverImg)) {
    ctx.drawImage(coverImg, 0, 0, n, n);
  } else {
    ctx.fillRect(0, 0, n, n); // асет не завантажився — вважаємо шар суцільним
  }
  const alpha = ctx.getImageData(0, 0, n, n).data; // один раз за сесію
  const hole = holeInCanvas();
  const mask = new Uint8Array(n * n);
  let total = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = (x + 0.5) / n;
      const cy = (y + 0.5) / n;
      const inHole = cx > hole.left && cx < hole.right && cy > hole.top && cy < hole.bottom;
      const opaque = alpha[(y * n + x) * 4 + 3] > 128;
      if (inHole && opaque) {
        mask[y * n + x] = 1;
        total++;
      }
    }
  }
  activeMaskCache = { mask, total, hole };
  return activeMaskCache;
}

/* ------------------------------------------------------------------ */

export class ScratchCard {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {HTMLImageElement} opts.coverImg      завантажений scratch-cover
   * @param {HTMLImageElement} opts.questionImg   завантажений question-mark
   * @param {(card: ScratchCard) => void} [opts.onStart]       перший дотик до картки
   * @param {(card: ScratchCard) => void} [opts.onStrokeEnd]   палець піднято
   * @param {(card: ScratchCard, progress: number) => void} [opts.onProgress]
   * @param {(card: ScratchCard) => void} [opts.onReveal]      поріг досягнуто
   * @param {(card: ScratchCard) => void} [opts.onLockedTap]   дотик до заблокованої картки
   * @param {(x: number, y: number) => void} [opts.onScratch]  точка стирання (координати вікна) — для частинок
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.coverImg = opts.coverImg;
    this.questionImg = opts.questionImg;
    this.callbacks = opts;

    this.state = CardState.READY;
    this.started = false;
    this.stamps = [];            // [{x, y, b}] у частках розміру canvas
    this.cleared = new Uint8Array(S.coverageGrid * S.coverageGrid);
    this.clearedCount = 0;
    this.maskInfo = buildActiveMask(this.coverImg);

    this.pointerId = null;
    this.lastPoint = null;
    this.rect = null;
    this.cssSize = 0;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    this.canvas.addEventListener('pointerdown', this._onDown, { passive: false });
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas);
    this.resize();
  }

  /** Частка стертої активної області (0–1). */
  get progress() {
    return this.maskInfo.total ? this.clearedCount / this.maskInfo.total : 0;
  }

  setLocked(locked) {
    if (this.state === CardState.REVEALED || this.state === CardState.DISABLED) return;
    this.state = locked ? CardState.LOCKED : CardState.READY;
    this.canvas.closest('.card')?.classList.toggle('is-locked', locked);
  }

  /** Підігнати canvas під поточний розмір і перемалювати шар зі збереженими штампами. */
  resize() {
    const size = this.canvas.clientWidth;
    if (!size || size === this.cssSize) return;
    this.cssSize = size;
    const dpr = Math.min(window.devicePixelRatio || 1, S.maxDpr);
    this.canvas.width = this.canvas.height = Math.round(size * dpr);
    this._drawCover();
    for (const s of this.stamps) this._paintStamp(s);
  }

  /** Відкрити картку повністю (поріг досягнуто або примусово з debug). */
  reveal() {
    if (this.state === CardState.REVEALED || this.state === CardState.DISABLED) return;
    this._endStroke();
    this.state = CardState.REVEALED;
    this.canvas.closest('.card')?.classList.add('is-revealed');
    this.callbacks.onReveal?.(this);
  }

  /** Остаточно вимкнути нерозкриту картку (знайдено комбінацію). Активний штрих обривається. */
  disable() {
    if (this.state === CardState.REVEALED) return;
    this._endStroke();
    this.state = CardState.DISABLED;
    this.canvas.closest('.card')?.classList.remove('is-locked');
  }

  destroy() {
    this._endStroke();
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this._resizeObserver.disconnect();
  }

  /* ---------------- малювання ---------------- */

  _drawCover() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, w, w);
    if (isUsable(this.coverImg)) {
      ctx.drawImage(this.coverImg, 0, 0, w, w);
    } else {
      ctx.fillStyle = '#780C96'; // запасний варіант: суцільний Metallic Purple
      ctx.fillRect(0, 0, w, w);
    }
    if (!isUsable(this.questionImg)) return;

    // Знак питання малюється прямо на шарі — і стирається разом із ним.
    const hole = this.maskInfo.hole;
    const holeH = (hole.bottom - hole.top) * w;
    const qh = holeH * S.questionMarkScale;
    const qw = qh * (this.questionImg.naturalWidth / this.questionImg.naturalHeight);
    const cx = ((hole.left + hole.right) / 2) * w;
    const cy = ((hole.top + hole.bottom) / 2) * w;
    ctx.drawImage(this.questionImg, cx - qw / 2, cy - qh / 2, qw, qh);
  }

  /** Вирізати один піксельний штамп (квадрат зі зрізаними на 1 «піксель» кутами). */
  _paintStamp({ x, y, b }) {
    const w = this.canvas.width;
    const size = b * w;
    const step = Math.max(1, (S.pixelSnap / this.cssSize) * w);
    const left = x * w - size / 2;
    const top = y * w - size / 2;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(left, top + step, size, size - 2 * step);
    ctx.fillRect(left + step, top, size - 2 * step, size);
  }

  /* ---------------- стирання ---------------- */

  /** Додати точку дотику (координати вікна) і з'єднати її з попередньою. */
  _addPoint(clientX, clientY) {
    const snap = S.pixelSnap / this.cssSize;
    const b = S.brushSize / this.cssSize;
    // Прив'язка до піксельної сітки — ступінчасті краї стертого сліду.
    const x = Math.round((clientX - this.rect.left) / this.cssSize / snap) * snap;
    const y = Math.round((clientY - this.rect.top) / this.cssSize / snap) * snap;

    const from = this.lastPoint || { x, y };
    const dist = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (b * 0.35))); // інтерполяція швидких рухів
    for (let i = 1; i <= steps; i++) {
      const stamp = { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps, b };
      this.stamps.push(stamp);
      this._paintStamp(stamp);
      this._markCoverage(stamp);
    }
    this.lastPoint = { x, y };

    this.callbacks.onScratch?.(clientX, clientY);
    this.callbacks.onProgress?.(this, this.progress);
    if (this.progress >= S.revealThreshold) this.reveal();
  }

  /** Позначити клітинки карти, центр яких потрапив під штамп. */
  _markCoverage({ x, y, b }) {
    const n = S.coverageGrid;
    const { mask } = this.maskInfo;
    const half = b / 2;
    const x0 = Math.max(0, Math.ceil((x - half) * n - 0.5));
    const x1 = Math.min(n - 1, Math.floor((x + half) * n - 0.5));
    const y0 = Math.max(0, Math.ceil((y - half) * n - 0.5));
    const y1 = Math.min(n - 1, Math.floor((y + half) * n - 0.5));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * n + cx;
        if (mask[i] && !this.cleared[i]) {
          this.cleared[i] = 1;
          this.clearedCount++;
        }
      }
    }
  }

  /* ---------------- pointer-події ---------------- */

  _onDown(e) {
    if (this.state === CardState.LOCKED) {
      e.preventDefault();
      this.callbacks.onLockedTap?.(this);
      return;
    }
    // Відкрита картка або вже є активний палець (multitouch) — ігноруємо.
    if (this.state !== CardState.READY || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    this.pointerId = e.pointerId;
    this.rect = this.canvas.getBoundingClientRect();
    this.cssSize = this.rect.width;
    this.lastPoint = null;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* на деяких браузерах capture може не вдатися — window-слухачі все одно ловлять рух */
    }
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp, { passive: false });
    window.addEventListener('pointercancel', this._onUp, { passive: false });

    if (!this.started) {
      this.started = true;
      this.callbacks.onStart?.(this);
    }
    this._addPoint(e.clientX, e.clientY);
  }

  _onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    // Згруповані події дають плавнішу лінію там, де браузер їх підтримує.
    const events = e.getCoalescedEvents?.() || [];
    if (events.length) {
      for (const ce of events) {
        if (this.state !== CardState.READY) break;
        this._addPoint(ce.clientX, ce.clientY);
      }
    } else {
      this._addPoint(e.clientX, e.clientY);
    }
  }

  _onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this._endStroke();
  }

  _endStroke() {
    if (this.pointerId === null) return;
    try {
      this.canvas.releasePointerCapture(this.pointerId);
    } catch {
      /* capture уже звільнено */
    }
    this.pointerId = null;
    this.lastPoint = null;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.callbacks.onStrokeEnd?.(this);
  }
}
