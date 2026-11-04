import { angleDelta, clamp, lerp } from './utils.js';

/**
 * Renders slightly in the past, blending the two surrounding network frames.
 * This removes the 20Hz "stepping" without adding client-side prediction.
 */
export class SnapshotInterpolator {
  constructor(delay = 95) {
    this.delay = delay;
    this.frames = [];
  }

  push(snapshot) {
    snapshot._receivedAt = performance.now();
    this.frames.push(snapshot);

    const cutoff = performance.now() - 2500;
    while (this.frames.length > 2 && this.frames[0]._receivedAt < cutoff) {
      this.frames.shift();
    }
    if (this.frames.length > 24) this.frames.splice(0, this.frames.length - 24);
  }

  get latest() {
    return this.frames[this.frames.length - 1] || null;
  }

  reset() {
    this.frames = [];
  }

  sample(now = performance.now()) {
    if (this.frames.length === 0) return null;
    if (this.frames.length === 1) return this.decorate(this.frames[0]);

    const target = now - this.delay;
    let older = null;
    let newer = null;

    for (let i = 0; i < this.frames.length; i += 1) {
      if (this.frames[i]._receivedAt <= target) older = this.frames[i];
      else {
        newer = this.frames[i];
        break;
      }
    }

    if (!older) {
      older = this.frames[0];
      newer = this.frames[1] || this.frames[0];
    }
    if (!newer) {
      older = this.frames[this.frames.length - 2];
      newer = this.frames[this.frames.length - 1];
    }

    const span = Math.max(1, newer._receivedAt - older._receivedAt);
    const alpha = clamp((target - older._receivedAt) / span, 0, 1);

    const oldById = new Map(older.snakes.map((snake) => [snake.id, snake]));
    const snakes = newer.snakes.map((snake) => {
      const previous = oldById.get(snake.id);
      if (!previous) return { ...snake };
      return this.interpolateSnake(previous, snake, alpha);
    });

    return {
      snakes,
      orbs: newer.orbs,
      aliveCount: newer.aliveCount,
      tick: newer.tick,
      receivedAt: newer._receivedAt,
    };
  }

  interpolateSnake(a, b, t) {
    const aBody = a.body || [];
    const bBody = b.body || [];
    const count = Math.max(aBody.length, bBody.length, 1);
    const body = new Array(count);

    for (let i = 0; i < count; i += 1) {
      const pa = aBody[Math.min(i, aBody.length - 1)] || bBody[Math.min(i, bBody.length - 1)] || [b.x, b.y];
      const pb = bBody[Math.min(i, bBody.length - 1)] || pa;
      body[i] = [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t)];
    }

    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    body[0] = [x, y];

    return {
      ...b,
      x,
      y,
      angle: a.angle + angleDelta(a.angle, b.angle) * t,
      energy: lerp(a.energy ?? b.energy, b.energy, t),
      body,
    };
  }

  decorate(snapshot) {
    return {
      snakes: snapshot.snakes,
      orbs: snapshot.orbs,
      aliveCount: snapshot.aliveCount,
      tick: snapshot.tick,
      receivedAt: snapshot._receivedAt,
    };
  }
}
