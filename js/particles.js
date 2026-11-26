/**
 * particles.js — піксельні частинки на ОДНОМУ спільному canvas (#fx-layer).
 *
 * Без DOM-елементів на частинку. Кількість обмежена CONFIG.particles.maxActive.
 * Цикл requestAnimationFrame працює лише поки є живі частинки, потім зупиняється.
 */
import { CONFIG } from './config.js';
import { prefersReducedMotion } from './animations.js';

const P = CONFIG.particles;

export class Particles {
  /**
   * @param {HTMLCanvasElement} canvas  повноекранний шар ефектів
   * @param {HTMLElement} host          #app — система координат частинок
   */
  constructor(canvas, host) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.host = host;
    this.items = [];
    this.running = false;
    this.rafId = 0;
    this.hostRect = host.getBoundingClientRect();
    this._tick = this._tick.bind(this);
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(host);
    this.resize();
  }

  resize() {
    this.hostRect = this.host.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.hostRect.width * this.dpr);
    this.canvas.height = Math.round(this.hostRect.height * this.dpr);
  }

  /** Крихти захисного шару під пальцем (координати вікна). */
  scratchAt(clientX, clientY) {
    if (prefersReducedMotion() || Math.random() > P.scratchChance) return;
    const { left, top } = this.hostRect;
    this.emit(clientX - left, clientY - top, {
      count: P.scratchCount, colors: P.colors, speed: 90, life: 520, size: [2, 5], gravity: 420,
    });
  }

  /** Сплеск із центру прямокутника (наприклад, відкрита картка). */
  burstFromElement(el, colors = P.colors, count = P.revealBurst) {
    if (prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    this.emit(r.left + r.width / 2 - this.hostRect.left, r.top + r.height / 2 - this.hostRect.top, {
      count, colors, speed: 170, life: 700, size: [3, 6], gravity: 360, spread: r.width * 0.3,
    });
  }

  /** Сплеск іскор у точці (координати #app). */
  burst(x, y, colors, count = 24, speed = 190) {
    if (prefersReducedMotion()) return;
    this.emit(x, y, { count, colors, speed, life: 800, size: [3, 6], gravity: 300 });
  }

  /** Піксельні уламки, що падають униз зі смуги [x0, x1] на висоті y (координати #app). */
  rain(colors, count, { x0, x1, y }) {
    if (prefersReducedMotion()) return;
    for (let i = 0; i < count; i++) {
      this._push({
        x: x0 + Math.random() * (x1 - x0), y: y + Math.random() * 20,
        vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 90, g: 280,
        size: 3 + ((Math.random() * 4) | 0), color: colors[(Math.random() * colors.length) | 0],
        life: 1200 + Math.random() * 700,
      });
    }
    this._trim();
  }

  /** Конфеті: прямокутники падають з верху екрана, гойдаючись і перевертаючись. */
  confetti(colors, count) {
    if (prefersReducedMotion()) return;
    const w = this.hostRect.width;
    for (let i = 0; i < count; i++) {
      this._push({
        kind: 'confetti',
        x: Math.random() * w, y: -10 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 30, vy: 50 + Math.random() * 80, g: 30,
        size: 5 + ((Math.random() * 4) | 0), color: colors[(Math.random() * colors.length) | 0],
        life: 2400 + Math.random() * 1200, phase: Math.random() * Math.PI * 2,
      });
    }
    this._trim();
  }

  /**
   * Додати частинки в точці (координати #app).
   * @param {object} o  count, colors[], speed (px/с), life (мс), size [min,max], gravity (px/с²), spread (px)
   */
  emit(x, y, o) {
    for (let i = 0; i < o.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = o.speed * (0.4 + Math.random() * 0.8);
      const life = o.life * (0.6 + Math.random() * 0.6);
      const spread = o.spread || 0;
      this._push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - o.speed * 0.4, // невеликий підкид угору
        g: o.gravity,
        size: Math.round(o.size[0] + Math.random() * (o.size[1] - o.size[0])),
        color: o.colors[(Math.random() * o.colors.length) | 0],
        life,
      });
    }
    this._trim();
  }

  _push(p) {
    p.age = 0;
    p.kind ??= 'square';
    this.items.push(p);
  }

  /** Ліміт: найстаріші частинки віддають місце новим. */
  _trim() {
    if (this.items.length > P.maxActive) this.items.splice(0, this.items.length - P.maxActive);
    this._start();
  }

  /** Прибрати все (новий раунд). */
  clear() {
    this.items.length = 0;
    this._stop();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.clear();
    this._resizeObserver.disconnect();
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this._tick);
  }

  _stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); // захист від стрибка після неактивної вкладки
    this.last = now;
    const { ctx, dpr } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let alive = 0;
    for (const p of this.items) {
      p.age += dt * 1000;
      if (p.age >= p.life) continue;
      p.vx *= 0.985; // невелика інерція
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Прозорість сходинками — щоб зникання теж було «піксельним».
      ctx.globalAlpha = Math.ceil((1 - p.age / p.life) * 4) / 4;
      ctx.fillStyle = p.color;
      if (p.kind === 'confetti') {
        // Гойдання вбік і «перевертання» (висота сходинками стискається і розширюється).
        p.x += Math.sin(p.age * 0.004 + p.phase) * 28 * dt;
        const flip = Math.max(1, Math.round(Math.abs(Math.cos(p.age * 0.008 + p.phase)) * 3)) / 3;
        ctx.fillRect(Math.round(p.x * dpr), Math.round(p.y * dpr), p.size * dpr, Math.max(1, p.size * 0.6 * flip * dpr));
      } else {
        ctx.fillRect(Math.round(p.x * dpr), Math.round(p.y * dpr), p.size * dpr, p.size * dpr);
      }
      this.items[alive++] = p;
    }
    this.items.length = alive;
    ctx.globalAlpha = 1;

    if (alive) this.rafId = requestAnimationFrame(this._tick);
    else this._stop();
  }
}
