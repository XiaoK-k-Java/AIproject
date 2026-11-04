import { CONFIG } from './config.js';
import {
  TAU,
  clamp,
  hexToRgba,
  hexToRgb,
  mixHex,
  modulo,
  randomRange,
  roundRect,
} from './utils.js';

const MAX_PARTICLES = 340;
const NAME_FONT = '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

function traceSmoothPath(ctx, points, count = points.length) {
  if (!points || count < 1) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  if (count === 1) return;
  if (count === 2) {
    ctx.lineTo(points[1][0], points[1][1]);
    return;
  }

  for (let i = 1; i < count - 1; i += 1) {
    const p = points[i];
    const next = points[i + 1];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + next[0]) / 2, (p[1] + next[1]) / 2);
  }
  const last = points[count - 1];
  ctx.lineTo(last[0], last[1]);
}

function makeStarField(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: randomRange(0.35, 1.45),
    alpha: randomRange(0.12, 0.62),
    parallax: randomRange(0.015, 0.13),
    phase: Math.random() * TAU,
    twinkle: randomRange(0.3, 1.1),
    cross: Math.random() > 0.88,
  }));
}

export class GameRenderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.minimap = minimapCanvas;
    this.mctx = minimapCanvas.getContext('2d');

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = 1;

    this.worldRadius = CONFIG.worldRadius;
    this.camera = { x: 0, y: 0, zoom: 0.6 };
    this.targetZoom = 0.6;
    this.cameraReady = false;
    this.selfId = null;
    this.spectatorId = null;
    this.deathFocus = null;
    this.selfScreen = {
      x: this.width / 2,
      y: this.height / 2,
      valid: false,
    };

    this.time = 0;
    this.lastTime = performance.now();
    this.lastMinimapDraw = 0;
    this.shake = 0;
    this.particles = [];
    this.waves = [];
    this.floaters = [];
    this.boostAccumulator = 0;
    this.stars = makeStarField(170);
    this.glowCache = new Map();
    this.colorCache = new Map();
    this.lastFrame = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  setSelfId(id) {
    this.selfId = id;
    this.spectatorId = null;
    this.deathFocus = null;
  }

  setWorldRadius(radius) {
    if (Number.isFinite(radius) && radius > 0) this.worldRadius = radius;
  }

  resetCamera() {
    this.cameraReady = false;
    this.deathFocus = null;
  }

  setDeathFocus(x, y) {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      this.deathFocus = { x, y };
    }
  }

  getColorSet(color) {
    if (this.colorCache.has(color)) return this.colorCache.get(color);
    const set = {
      base: color,
      light: mixHex(color, '#ffffff', 0.34),
      bright: mixHex(color, '#ffffff', 0.62),
      dark: mixHex(color, '#041018', 0.28),
      glow: hexToRgba(color, 0.22),
      soft: hexToRgba(color, 0.08),
    };
    this.colorCache.set(color, set);
    return set;
  }

  getGlowSprite(color) {
    if (this.glowCache.has(color)) return this.glowCache.get(color);
    const size = 96;
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const ctx = sprite.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const { r, g, b } = hexToRgb(color);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.92)`);
    gradient.addColorStop(0.22, `rgba(${r}, ${g}, ${b}, 0.5)`);
    gradient.addColorStop(0.52, `rgba(${r}, ${g}, ${b}, 0.15)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.glowCache.set(color, sprite);
    return sprite;
  }

  addDeathEffect(event) {
    const color = event.victim?.color || '#ff6b8a';
    const count = event.victim?.id === this.selfId ? 46 : 30;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = randomRange(35, 235);
      const life = randomRange(0.45, 1.15);
      this.particles.push({
        x: event.x + randomRange(-8, 8),
        y: event.y + randomRange(-8, 8),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(1.3, 3.6),
        color: Math.random() > 0.35 ? color : '#fff0f3',
        drag: randomRange(1.7, 3.8),
      });
    }
    this.waves.push({
      x: event.x,
      y: event.y,
      radius: 8,
      maxRadius: event.victim?.id === this.selfId ? 330 : 240,
      life: 0.9,
      maxLife: 0.9,
      color,
    });
    if (event.victim?.id === this.selfId) this.shake = 11;
    this.trimParticles();
  }

  eatBurst(x, y, color, value = 1) {
    const count = 4 + Math.min(12, value * 2);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = randomRange(18, 90);
      const life = randomRange(0.22, 0.55);
      this.particles.push({
        x: x + randomRange(-5, 5),
        y: y + randomRange(-5, 5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(1, 2.6),
        color,
        drag: 3.2,
      });
    }
    if (value >= 2) {
      this.floaters.push({
        x,
        y: y - 26,
        text: `+${value}`,
        color,
        life: 0.75,
        maxLife: 0.75,
      });
    }
    this.trimParticles();
  }

  spawnBurst(x, y, color) {
    for (let i = 0; i < 24; i += 1) {
      const angle = Math.random() * TAU;
      const speed = randomRange(30, 150);
      const life = randomRange(0.35, 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(1.2, 3),
        color,
        drag: 2.8,
      });
    }
    this.waves.push({
      x,
      y,
      radius: 4,
      maxRadius: 150,
      life: 0.65,
      maxLife: 0.65,
      color,
    });
  }

  trimParticles() {
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.camera.x) * this.camera.zoom + this.width / 2,
      y: (y - this.camera.y) * this.camera.zoom + this.height / 2,
    };
  }

  getSelfScreen() {
    if (this.selfScreen.valid) return this.selfScreen;
    return { x: this.width / 2, y: this.height / 2 };
  }

  updateCamera(frame, meta, dt) {
    const self = this.selfId != null && frame
      ? frame.snakes.find((snake) => snake.id === this.selfId)
      : null;

    const viewportScale = clamp(Math.min(this.width, this.height) / 820, 0.68, 1);
    let targetX = this.camera.x;
    let targetY = this.camera.y;
    let targetZoom = 0.6 * viewportScale;
    let hasTarget = false;

    if (self) {
      const lookAhead = 52 + Math.min(32, self.score * 0.03);
      targetX = self.x + Math.cos(self.angle) * lookAhead;
      targetY = self.y + Math.sin(self.angle) * lookAhead;
      const grown = clamp(1 - Math.min(self.score, 900) * 0.00022, 0.78, 1);
      targetZoom = 0.92 * viewportScale * grown;
      hasTarget = true;
    } else if (meta.view === 'dead' && this.deathFocus) {
      targetX = this.deathFocus.x;
      targetY = this.deathFocus.y;
      targetZoom = 0.82 * viewportScale;
      hasTarget = true;
    } else if (frame && frame.snakes.length > 0) {
      let focus = this.spectatorId != null
        ? frame.snakes.find((snake) => snake.id === this.spectatorId)
        : null;
      if (!focus) {
        focus = frame.snakes[0];
        this.spectatorId = focus.id;
      }
      targetX = focus.x + Math.cos(focus.angle) * 40;
      targetY = focus.y + Math.sin(focus.angle) * 40;
      targetZoom = 0.61 * viewportScale;
      hasTarget = true;
    }

    if (!hasTarget) return;

    if (!this.cameraReady) {
      this.camera.x = targetX;
      this.camera.y = targetY;
      this.camera.zoom = targetZoom;
      this.targetZoom = targetZoom;
      this.cameraReady = true;
      return;
    }

    const positionEase = 1 - Math.exp(-dt * 4);
    const zoomEase = 1 - Math.exp(-dt * 2.6);
    this.camera.x += (targetX - this.camera.x) * positionEase;
    this.camera.y += (targetY - this.camera.y) * positionEase;
    this.camera.zoom += (targetZoom - this.camera.zoom) * zoomEase;
    this.targetZoom = targetZoom;
  }

  updateEffects(dt, frame) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= drag;
      particle.vy *= drag;
    }

    for (let i = this.waves.length - 1; i >= 0; i -= 1) {
      const wave = this.waves[i];
      wave.life -= dt;
      const progress = 1 - wave.life / wave.maxLife;
      wave.radius = 8 + (wave.maxRadius - 8) * (1 - (1 - progress) ** 2.4);
      if (wave.life <= 0) this.waves.splice(i, 1);
    }

    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i];
      floater.life -= dt;
      floater.y -= dt * 30;
      if (floater.life <= 0) this.floaters.splice(i, 1);
    }

    this.shake *= Math.exp(-dt * 7.5);
    if (this.shake < 0.05) this.shake = 0;

    const self = this.selfId != null && frame
      ? frame.snakes.find((snake) => snake.id === this.selfId)
      : null;
    if (self?.boosting) {
      this.boostAccumulator += dt;
      while (this.boostAccumulator > 0.024) {
        this.boostAccumulator -= 0.024;
        const backX = self.x - Math.cos(self.angle) * 15;
        const backY = self.y - Math.sin(self.angle) * 15;
        const spread = randomRange(-0.5, 0.5);
        const life = randomRange(0.18, 0.45);
        this.particles.push({
          x: backX + randomRange(-6, 6),
          y: backY + randomRange(-6, 6),
          vx: Math.cos(self.angle + Math.PI + spread) * randomRange(30, 90),
          vy: Math.sin(self.angle + Math.PI + spread) * randomRange(30, 90),
          life,
          maxLife: life,
          size: randomRange(1, 2.5),
          color: self.color,
          drag: 3.7,
        });
      }
      this.trimParticles();
    } else {
      this.boostAccumulator = 0;
    }
  }

  render(frame, meta = {}) {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.time += dt;
    this.lastFrame = frame;

    this.updateCamera(frame, meta, dt);
    this.updateEffects(dt, frame);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawStarfield(ctx);

    const shakeX = this.shake > 0 ? Math.sin(this.time * 71) * this.shake : 0;
    const shakeY = this.shake > 0 ? Math.cos(this.time * 63) * this.shake : 0;

    ctx.save();
    ctx.translate(this.width / 2 + shakeX, this.height / 2 + shakeY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawArena(ctx);
    this.drawOrbs(ctx, frame?.orbs || []);
    this.drawWaves(ctx);

    if (frame?.snakes?.length) {
      const ordered = [...frame.snakes].sort((a, b) => {
        if (a.id === this.selfId) return 1;
        if (b.id === this.selfId) return -1;
        return a.score - b.score;
      });
      for (const snake of ordered) {
        this.drawSnake(ctx, snake, snake.id === this.selfId);
      }
    }

    this.drawParticles(ctx);
    this.drawFloaters(ctx);

    ctx.restore();

    if (meta.view === 'game') this.drawMinimap(frame);
  }

  drawStarfield(ctx) {
    const { width, height } = this;
    const camX = this.camera.x;
    const camY = this.camera.y;

    for (const star of this.stars) {
      const px = modulo(star.x * width - camX * star.parallax, width);
      const py = modulo(star.y * height - camY * star.parallax, height);
      const alpha = star.alpha * (0.68 + 0.32 * Math.sin(this.time * star.twinkle + star.phase));
      ctx.fillStyle = `rgba(188, 222, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, star.radius, 0, TAU);
      ctx.fill();

      if (star.cross) {
        ctx.strokeStyle = `rgba(151, 210, 255, ${(alpha * 0.32).toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(px - 3.4, py);
        ctx.lineTo(px + 3.4, py);
        ctx.moveTo(px, py - 3.4);
        ctx.lineTo(px, py + 3.4);
        ctx.stroke();
      }
    }

    // A faint distant orbit behind everything keeps the arena feeling deep.
    ctx.save();
    ctx.translate(width / 2 - (camX * 0.03) % width, height / 2 - (camY * 0.03) % height);
    ctx.strokeStyle = 'rgba(122, 196, 255, 0.035)';
    ctx.lineWidth = 1;
    for (const radius of [width * 0.38, width * 0.55, width * 0.78]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawArena(ctx) {
    const R = this.worldRadius;
    const gradient = ctx.createRadialGradient(0, 0, R * 0.06, 0, 0, R);
    gradient.addColorStop(0, 'rgba(12, 27, 43, 0.67)');
    gradient.addColorStop(0.6, 'rgba(10, 23, 37, 0.64)');
    gradient.addColorStop(0.94, 'rgba(9, 23, 37, 0.76)');
    gradient.addColorStop(1, 'rgba(5, 12, 20, 0.82)');

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.clip();

    // Concentric orbit lines.
    for (let radius = 220; radius < R; radius += 240) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.strokeStyle = radius === 220
        ? 'rgba(128, 218, 255, 0.15)'
        : 'rgba(128, 208, 255, 0.07)';
      ctx.lineWidth = radius === 220 ? 1.2 : 1;
      ctx.stroke();
    }

    // Radial spokes.
    ctx.strokeStyle = 'rgba(126, 205, 255, 0.055)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 80, Math.sin(angle) * 80);
      ctx.lineTo(Math.cos(angle) * R, Math.sin(angle) * R);
      ctx.stroke();
    }

    // Fine dot lattice.
    ctx.fillStyle = 'rgba(157, 224, 255, 0.1)';
    for (let x = -R; x <= R; x += 120) {
      for (let y = -R; y <= R; y += 120) {
        if (x * x + y * y > R * R) continue;
        ctx.fillRect(x, y, 1.3, 1.3);
      }
    }

    // Compass marks, rotated slowly by arithmetic (no context rotate cost).
    ctx.fillStyle = 'rgba(169, 223, 255, 0.32)';
    ctx.font = '600 11px "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labels = ['00', '09', '18', '27'];
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU;
      const rr = R - 42;
      ctx.fillText(labels[i], Math.cos(angle) * rr, Math.sin(angle) * rr);
    }

    // Perimeter ticks.
    ctx.strokeStyle = 'rgba(149, 219, 255, 0.13)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * TAU;
      const inner = i % 6 === 0 ? R - 20 : R - 11;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * R, Math.sin(angle) * R);
      ctx.stroke();
    }

    ctx.restore();

    // Outer orbital rings.
    ctx.save();
    ctx.strokeStyle = 'rgba(114, 198, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.setLineDash([20, 38]);
    ctx.lineDashOffset = -this.time * 5;
    for (const offset of [120, 380]) {
      ctx.beginPath();
      ctx.arc(0, 0, R + offset, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // Boundary glow and line.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.strokeStyle = 'rgba(94, 242, 228, 0.032)';
    ctx.lineWidth = 54;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.strokeStyle = 'rgba(94, 242, 228, 0.2)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, R - 5, 0, TAU);
    ctx.strokeStyle = 'rgba(94, 242, 228, 0.06)';
    ctx.lineWidth = 10;
    ctx.setLineDash([46, 128]);
    ctx.lineDashOffset = this.time * 15;
    ctx.stroke();
    ctx.restore();
  }

  drawOrbs(ctx, orbs) {
    const zoom = this.camera.zoom;
    const margin = 120;
    const left = this.camera.x - this.width / (2 * zoom) - margin;
    const right = this.camera.x + this.width / (2 * zoom) + margin;
    const top = this.camera.y - this.height / (2 * zoom) - margin;
    const bottom = this.camera.y + this.height / (2 * zoom) + margin;

    const visible = [];
    for (const orb of orbs) {
      if (orb.x < left || orb.x > right || orb.y < top || orb.y > bottom) continue;
      visible.push(orb);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const orb of visible) {
      const pulse = 0.9 + Math.sin(this.time * 2.2 + orb.id * 1.7) * 0.1;
      const radius = 3 + Math.sqrt(orb.v) * 2.8;
      const size = radius * 9.6 * pulse;
      const sprite = this.getGlowSprite(orb.color);
      ctx.globalAlpha = orb.v >= 3 ? 0.92 : 0.72;
      ctx.drawImage(sprite, orb.x - size / 2, orb.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (const orb of visible) {
      const pulse = 0.94 + Math.sin(this.time * 2.2 + orb.id * 1.7) * 0.08;
      const radius = (3 + Math.sqrt(orb.v) * 2.8) * pulse;

      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius + 2.2, 0, TAU);
      ctx.strokeStyle = hexToRgba(orb.color, orb.v >= 3 ? 0.3 : 0.13);
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius, 0, TAU);
      ctx.fillStyle = orb.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(orb.x - radius * 0.24, orb.y - radius * 0.28, radius * 0.42, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();

      if (orb.v >= 3) {
        ctx.save();
        ctx.translate(orb.x, orb.y);
        ctx.rotate(this.time * 0.7 + orb.id);
        ctx.strokeStyle = hexToRgba(orb.color, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 4; i += 1) {
          const angle = (i / 4) * TAU;
          const inner = radius + 3.5;
          const outer = radius + 8;
          ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawWaves(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const wave of this.waves) {
      const alpha = Math.max(0, wave.life / wave.maxLife);
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, TAU);
      ctx.strokeStyle = hexToRgba(wave.color, alpha * 0.45);
      ctx.lineWidth = 2 + alpha * 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    if (this.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      const sprite = this.getGlowSprite(particle.color);
      const size = particle.size * 7;
      ctx.drawImage(sprite, particle.x - size / 2, particle.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawFloaters(ctx) {
    if (this.floaters.length === 0) return;
    const zoom = this.camera.zoom;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const floater of this.floaters) {
      const alpha = Math.max(0, floater.life / floater.maxLife);
      ctx.globalAlpha = Math.min(1, alpha * 1.6);
      ctx.font = `600 ${13 / zoom}px ${NAME_FONT}`;
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawSnake(ctx, snake, isSelf) {
    const points = snake.body;
    if (!points || points.length < 2) return;

    const colorSet = this.getColorSet(snake.color);
    const radius = snake.radius || Math.max(17, 18 + Math.sqrt(snake.score) * 0.38);
    const bodyWidth = snake.width || radius * 1.58;
    const boosting = Boolean(snake.boosting);
    const n = points.length;
    const head = points[0];

    if (isSelf) {
      const screen = this.worldToScreen(head[0], head[1]);
      this.selfScreen = { x: screen.x, y: screen.y, valid: true };
    }

    if (n >= 3) {
      const tailCount = Math.min(18, Math.max(4, Math.floor(n * 0.3)));
      const tailStart = Math.max(1, n - tailCount);
      const mainCount = Math.min(n, tailStart + 1);
      const last = points[n - 1];

      const bodyGradient = ctx.createLinearGradient(head[0], head[1], last[0], last[1]);
      bodyGradient.addColorStop(0, colorSet.light);
      bodyGradient.addColorStop(0.42, colorSet.base);
      bodyGradient.addColorStop(1, colorSet.dark);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Ambient halo, built from two additive passes to fake a soft bloom.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hexToRgba(snake.color, boosting ? 0.1 : 0.04);
      ctx.lineWidth = bodyWidth * 3.05;
      traceSmoothPath(ctx, points);
      ctx.stroke();
      ctx.strokeStyle = boosting ? hexToRgba(snake.color, 0.22) : colorSet.glow;
      ctx.lineWidth = bodyWidth * (boosting ? 2.15 : 1.7);
      traceSmoothPath(ctx, points);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // Dark edge / casing.
      ctx.strokeStyle = 'rgba(2, 8, 13, 0.94)';
      ctx.lineWidth = bodyWidth + 5;
      traceSmoothPath(ctx, points, mainCount);
      ctx.stroke();
      for (let i = tailStart; i < n - 1; i += 1) {
        const progress = (i - tailStart) / Math.max(1, n - tailStart);
        const width = Math.max(2.2, bodyWidth * (1 - progress * 0.9) + 5);
        ctx.beginPath();
        ctx.moveTo(points[i][0], points[i][1]);
        ctx.lineTo(points[i + 1][0], points[i + 1][1]);
        ctx.lineWidth = width;
        ctx.stroke();
      }

      // Main body.
      ctx.strokeStyle = bodyGradient;
      ctx.lineWidth = bodyWidth;
      traceSmoothPath(ctx, points, mainCount);
      ctx.stroke();
      for (let i = tailStart; i < n - 1; i += 1) {
        const progress = (i - tailStart) / Math.max(1, n - tailStart);
        const width = Math.max(1.8, bodyWidth * (1 - progress * 0.9));
        ctx.beginPath();
        ctx.moveTo(points[i][0], points[i][1]);
        ctx.lineTo(points[i + 1][0], points[i + 1][1]);
        ctx.lineWidth = width;
        ctx.stroke();
      }

      // Upper-left rim light gives the tube a little volume.
      ctx.save();
      ctx.translate(-bodyWidth * 0.11, -bodyWidth * 0.2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = bodyWidth * 0.34;
      traceSmoothPath(ctx, points, mainCount);
      ctx.stroke();
      ctx.restore();

      // Soft spine highlight.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.lineWidth = bodyWidth * 0.2;
      traceSmoothPath(ctx, points, mainCount);
      ctx.stroke();

      // Scale/seam pattern.
      ctx.strokeStyle = 'rgba(2, 12, 19, 0.18)';
      ctx.lineWidth = bodyWidth * 0.36;
      ctx.setLineDash([bodyWidth * 0.16, bodyWidth * 0.82]);
      ctx.lineDashOffset = -this.time * 18;
      traceSmoothPath(ctx, points, mainCount);
      ctx.stroke();

      // Animated energy shimmer running from head to tail.
      ctx.strokeStyle = boosting ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.24)';
      ctx.lineWidth = bodyWidth * 0.11;
      ctx.setLineDash([bodyWidth * 0.56, bodyWidth * 2.4]);
      ctx.lineDashOffset = this.time * (boosting ? 90 : 36);
      traceSmoothPath(ctx, points, mainCount);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }

    this.drawSnakeHead(ctx, snake, isSelf, radius, colorSet, boosting);
    this.drawNameTag(ctx, snake, isSelf, radius);
  }

  drawSnakeHead(ctx, snake, isSelf, radius, colorSet, boosting) {
    const head = snake.body[0];
    const x = head[0];
    const y = head[1];
    const angle = snake.angle;
    const glowSize = radius * (boosting ? 7.2 : 5.2);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = this.getGlowSprite(snake.color);
    ctx.globalAlpha = boosting ? 0.72 : 0.42;
    ctx.drawImage(halo, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Dark rim.
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.1 + 2.5, radius * 0.94 + 2.5, 0, 0, TAU);
    ctx.fillStyle = 'rgba(2, 7, 12, 0.96)';
    ctx.fill();

    // Head gradient.
    const headGradient = ctx.createRadialGradient(
      -radius * 0.3,
      -radius * 0.36,
      radius * 0.08,
      0,
      0,
      radius * 1.25,
    );
    headGradient.addColorStop(0, colorSet.bright);
    headGradient.addColorStop(0.42, colorSet.base);
    headGradient.addColorStop(1, colorSet.dark);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.08, radius * 0.92, 0, 0, TAU);
    ctx.fillStyle = headGradient;
    ctx.fill();

    // Brow shading.
    ctx.beginPath();
    ctx.ellipse(radius * 0.08, -radius * 0.38, radius * 0.72, radius * 0.2, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();

    // Eyes.
    const eyeX = radius * 0.4;
    const eyeY = radius * 0.48;
    const eyeRadius = radius * 0.27;

    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(eyeX, eyeY * side, eyeRadius, 0, TAU);
      ctx.fillStyle = '#f5feff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeX + eyeRadius * 0.24, eyeY * side, eyeRadius * 0.53, 0, TAU);
      ctx.fillStyle = '#06131a';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeX + eyeRadius * 0.12, eyeY * side - eyeRadius * 0.25, eyeRadius * 0.16, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
    }

    // Tiny forward nostrils / sensor dots.
    ctx.fillStyle = 'rgba(2, 11, 15, 0.38)';
    ctx.beginPath();
    ctx.arc(radius * 0.93, -radius * 0.16, radius * 0.065, 0, TAU);
    ctx.arc(radius * 0.93, radius * 0.16, radius * 0.065, 0, TAU);
    ctx.fill();

    // A subtle jaw line.
    ctx.beginPath();
    ctx.arc(radius * 0.6, 0, radius * 0.56, -0.55, 0.55);
    ctx.strokeStyle = 'rgba(2, 11, 15, 0.24)';
    ctx.lineWidth = radius * 0.055;
    ctx.stroke();

    ctx.restore();

    if (isSelf) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * 0.55);
      ctx.strokeStyle = hexToRgba(snake.color, 0.52);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([radius * 0.48, radius * 0.65]);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.66, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  drawNameTag(ctx, snake, isSelf, radius) {
    const head = snake.body[0];
    const screen = this.worldToScreen(head[0], head[1]);
    if (
      screen.x < -120
      || screen.x > this.width + 120
      || screen.y < -100
      || screen.y > this.height + 100
    ) {
      return;
    }

    const zoom = this.camera.zoom;
    const fontSize = 11.5 / zoom;
    ctx.save();
    ctx.font = `600 ${fontSize}px ${NAME_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(snake.name).width;
    const padX = 7.5 / zoom;
    const height = 18.5 / zoom;
    const width = textWidth + padX * 2;
    const y = head[1] - radius - height * 0.9 - 7 / zoom;
    const x = head[0] - width / 2;

    ctx.globalAlpha = isSelf ? 1 : 0.86;
    roundRect(ctx, x, y - height / 2, width, height, height / 2);
    ctx.fillStyle = isSelf ? 'rgba(4, 12, 18, 0.74)' : 'rgba(3, 8, 14, 0.5)';
    ctx.fill();
    ctx.strokeStyle = isSelf ? hexToRgba(snake.color, 0.5) : 'rgba(160, 205, 255, 0.1)';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();

    ctx.fillStyle = isSelf ? '#f2fffe' : 'rgba(226, 240, 255, 0.74)';
    ctx.fillText(snake.name, head[0], y);

    if (isSelf) {
      ctx.beginPath();
      ctx.arc(head[0] - width / 2 + 5 / zoom, y, 1.8 / zoom, 0, TAU);
      ctx.fillStyle = snake.color;
      ctx.fill();
    }
    ctx.restore();
  }

  drawMinimap(frame) {
    const now = performance.now();
    if (now - this.lastMinimapDraw < 75) return;
    this.lastMinimapDraw = now;

    const ctx = this.mctx;
    const size = this.minimap.width;
    const center = size / 2;
    const radius = center * 0.9;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);

    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    bg.addColorStop(0, 'rgba(10, 23, 35, 0.72)');
    bg.addColorStop(1, 'rgba(4, 9, 16, 0.92)');
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();

    ctx.strokeStyle = 'rgba(137, 208, 255, 0.09)';
    ctx.lineWidth = 1;
    for (const scale of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * scale, 0, TAU);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(137, 208, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();

    const worldToMap = (x, y) => ({
      x: (x / this.worldRadius) * radius,
      y: (y / this.worldRadius) * radius,
    });

    for (const orb of frame?.orbs || []) {
      const p = worldToMap(orb.x, orb.y);
      ctx.fillStyle = hexToRgba(orb.color, 0.28);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.8, 0, TAU);
      ctx.fill();
    }

    if (frame?.snakes) {
      for (const snake of frame.snakes) {
        if (snake.id === this.selfId) continue;
        const p = worldToMap(snake.x, snake.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, TAU);
        ctx.fillStyle = hexToRgba(snake.color, 0.9);
        ctx.fill();
        ctx.strokeStyle = 'rgba(3, 10, 15, 0.7)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      const self = this.selfId != null
        ? frame.snakes.find((snake) => snake.id === this.selfId)
        : null;
      if (self) {
        const p = worldToMap(self.x, self.y);
        const pulse = 8 + Math.sin(this.time * 3) * 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulse, 0, TAU);
        ctx.strokeStyle = hexToRgba(self.color, 0.24);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(self.angle);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -4.2);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 4.2);
        ctx.closePath();
        ctx.fillStyle = self.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();

    ctx.save();
    ctx.translate(center, center);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.strokeStyle = 'rgba(132, 211, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}
