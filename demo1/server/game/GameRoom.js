'use strict';

const Snake = require('./Snake');
const BotController = require('./BotController');
const {
  WORLD_RADIUS,
  BOT_COUNT,
  ORB_TARGET,
  MAX_ORBS,
  SNAKE_COLORS,
  ORB_COLORS,
  BOT_NAMES,
  BODY_POINT_LIMIT,
  PLAYER_RESPAWN_COOLDOWN,
} = require('./constants');
const {
  TAU,
  clamp,
  distanceSq,
  randomRange,
  randomInt,
  randomPointInCircle,
  pick,
  round,
} = require('./geometry');

class GameRoom {
  constructor({ botCount = BOT_COUNT } = {}) {
    this.now = 0;
    this.snakes = new Map();
    this.botBrains = new Map();
    this.orbs = new Map();
    this.events = [];

    this.nextSnakeId = 1;
    this.nextOrbId = 1;
    this.nextEventId = 1;
    this.botCount = botCount;
    this.startedAt = Date.now();

    for (let i = 0; i < this.botCount; i += 1) {
      this.spawnBot();
    }
    this.ensureOrbs();
  }

  step(dt) {
    this.now += dt;

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      if (snake.isBot) {
        const brain = this.botBrains.get(snake.id);
        if (brain) brain.update(snake, this, dt);
      }
      snake.update(dt);
    }

    this.resolveCollisions();
    this.collectOrbs();
    this.respawnBots();
    this.ensureOrbs();
  }

  resolveCollisions() {
    const hits = [];
    const alive = [...this.snakes.values()].filter((snake) => snake.alive);

    for (const snake of alive) {
      const fromCenter = Math.hypot(snake.x, snake.y);
      if (fromCenter + snake.headRadius > WORLD_RADIUS) {
        hits.push({ victim: snake, killer: null, reason: 'wall' });
        continue;
      }

      let struck = false;
      for (const other of alive) {
        if (other === snake || struck) continue;

        const hitRadius = snake.headRadius * 0.78 + other.bodyWidth * 0.5;
        const hitRadiusSq = hitRadius * hitRadius;

        // Index 0/1 are the head and neck. Only the non-head body is lethal.
        for (let i = 2; i < other.bodyPoints.length; i += 1) {
          const point = other.bodyPoints[i];
          if (distanceSq(snake.x, snake.y, point.x, point.y) < hitRadiusSq) {
            hits.push({ victim: snake, killer: other, reason: 'body' });
            struck = true;
            break;
          }
        }
      }
    }

    for (const hit of hits) {
      this.killSnake(hit.victim, hit.killer, hit.reason);
    }
  }

  collectOrbs() {
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const eatRadius = snake.headRadius + 10;

      for (const orb of this.orbs.values()) {
        const radius = eatRadius + orb.v * 2.15;
        if (distanceSq(snake.x, snake.y, orb.x, orb.y) <= radius * radius) {
          this.orbs.delete(orb.id);
          snake.addScore(orb.v);
        }
      }
    }
  }

  killSnake(snake, killer, reason) {
    if (!snake.kill(this.now)) return;

    if (killer && killer !== snake && killer.alive) {
      killer.kills += 1;
    }

    this.dropMass(snake);

    this.events.push({
      id: this.nextEventId,
      type: 'death',
      reason,
      x: round(snake.x),
      y: round(snake.y),
      score: snake.score,
      length: Math.round(snake.bodyLength / 10),
      age: round(snake.age, 1),
      victim: {
        id: snake.id,
        name: snake.name,
        color: snake.color,
        isBot: snake.isBot,
      },
      killer: killer
        ? {
            id: killer.id,
            name: killer.name,
            color: killer.color,
            isBot: killer.isBot,
          }
        : null,
    });
    this.nextEventId += 1;

    // Hard cap event history when nobody is consuming snapshots.
    if (this.events.length > 80) this.events.splice(0, this.events.length - 80);
  }

  dropMass(snake) {
    const total = clamp(Math.round(5 + snake.score * 0.82), 5, 360);
    const count = clamp(Math.ceil(total / 4), 4, 64);

    const values = new Array(count).fill(1);
    let remaining = total - count;
    let cursor = 0;
    while (remaining > 0) {
      values[cursor % count] += 1;
      cursor += 1;
      remaining -= 1;
    }
    // Shuffle so value distribution across the corpse looks natural.
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    const body = snake.bodyPoints.length
      ? snake.bodyPoints
      : [{ x: snake.x, y: snake.y }];

    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      const sourceIndex = Math.min(
        body.length - 1,
        Math.round(t * (body.length - 1)),
      );
      const source = body[sourceIndex];
      const angle = Math.random() * TAU;
      const spread = randomRange(8, 64);
      let x = source.x + Math.cos(angle) * spread;
      let y = source.y + Math.sin(angle) * spread;

      const radius = Math.hypot(x, y);
      const limit = WORLD_RADIUS * 0.965;
      if (radius > limit) {
        x = (x / radius) * limit;
        y = (y / radius) * limit;
      }

      this.addOrb({
        x,
        y,
        v: values[i],
        color: snake.color,
        mass: true,
      });
    }
  }

  addOrb({ x, y, v, color, mass = false }) {
    let id = this.nextOrbId;
    this.nextOrbId += 1;

    this.orbs.set(id, {
      id,
      x,
      y,
      v,
      color,
      mass,
      bornAt: this.now,
    });

    if (this.orbs.size > MAX_ORBS) {
      // Shed the oldest ordinary food first; corpse drops feel more important.
      for (const orb of this.orbs.values()) {
        if (!orb.mass) {
          this.orbs.delete(orb.id);
          break;
        }
      }
    }
  }

  ensureOrbs() {
    while (this.orbs.size < ORB_TARGET) {
      const point = randomPointInCircle(WORLD_RADIUS * 0.94, 40);
      const roll = Math.random();
      let value = 1;
      if (roll > 0.975) value = 5;
      else if (roll > 0.9) value = 3;
      else if (roll > 0.7) value = 2;

      this.addOrb({
        x: point.x,
        y: point.y,
        v: value,
        color: pick(ORB_COLORS),
      });
    }
  }

  spawnBot() {
    const snakes = [...this.snakes.values()].filter((snake) => snake.isBot);
    if (snakes.length >= this.botCount) return null;

    const usedNames = new Set(snakes.map((snake) => snake.name));
    let name = BOT_NAMES.find((candidate) => !usedNames.has(candidate));
    if (!name) name = `${pick(BOT_NAMES)} ${randomInt(2, 9)}`;

    const usedColors = new Set(snakes.map((snake) => snake.color));
    const color =
      SNAKE_COLORS.find((candidate) => !usedColors.has(candidate)) ||
      pick(SNAKE_COLORS);

    const snake = new Snake({
      id: this.nextSnakeId,
      name,
      color,
      isBot: true,
    });
    this.nextSnakeId += 1;

    const pose = this.findSpawnPose();
    snake.reset({
      x: pose.x,
      y: pose.y,
      angle: pose.angle,
      score: randomInt(0, 55),
    });

    this.snakes.set(snake.id, snake);
    this.botBrains.set(snake.id, new BotController());
    return snake;
  }

  addPlayer({ name, color }) {
    const snake = new Snake({
      id: this.nextSnakeId,
      name,
      color,
      isBot: false,
    });
    this.nextSnakeId += 1;

    const pose = this.findSpawnPose();
    snake.reset({ x: pose.x, y: pose.y, angle: pose.angle, score: 0 });
    this.snakes.set(snake.id, snake);
    return snake;
  }

  respawnPlayer(id) {
    const snake = this.snakes.get(id);
    if (!snake || snake.isBot || snake.alive) return null;
    if (this.now - snake.deadAt < PLAYER_RESPAWN_COOLDOWN) return null;

    const pose = this.findSpawnPose();
    snake.reset({ x: pose.x, y: pose.y, angle: pose.angle, score: 0 });
    return snake;
  }

  removePlayer(id) {
    const snake = this.snakes.get(id);
    if (!snake || snake.isBot) return false;
    if (snake.alive) this.dropMass(snake);
    this.snakes.delete(id);
    return true;
  }

  setInput(id, angle, boost) {
    const snake = this.snakes.get(id);
    if (!snake || snake.isBot || !snake.alive) return;
    snake.setInput(angle, boost);
  }

  findSpawnPose() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const radius = Math.sqrt(Math.random()) * WORLD_RADIUS * 0.76;
      const theta = Math.random() * TAU;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius;

      let clear = true;
      for (const snake of this.snakes.values()) {
        if (!snake.alive) continue;
        if (distanceSq(x, y, snake.x, snake.y) < 360 * 360) {
          clear = false;
          break;
        }
        for (let i = 0; i < snake.bodyPoints.length; i += 3) {
          const p = snake.bodyPoints[i];
          if (distanceSq(x, y, p.x, p.y) < 235 * 235) {
            clear = false;
            break;
          }
        }
        if (!clear) break;
      }

      if (clear) {
        const inward =
          radius < 10 ? Math.random() * TAU : Math.atan2(-y, -x);
        return {
          x,
          y,
          angle: inward + randomRange(-0.85, 0.85),
        };
      }
    }

    const fallback = randomPointInCircle(WORLD_RADIUS * 0.45);
    return {
      x: fallback.x,
      y: fallback.y,
      angle: Math.atan2(-fallback.y, -fallback.x),
    };
  }

  respawnBots() {
    for (const snake of this.snakes.values()) {
      if (!snake.isBot || snake.alive) continue;
      if (this.now < snake.respawnAt) continue;

      const pose = this.findSpawnPose();
      snake.reset({
        x: pose.x,
        y: pose.y,
        angle: pose.angle,
        score: randomInt(0, 24),
      });
      this.botBrains.set(snake.id, new BotController());
    }
  }

  createSnapshot() {
    const alive = [...this.snakes.values()]
      .filter((snake) => snake.alive)
      .sort((a, b) => b.score - a.score);

    const snakes = alive.map((snake, index) => {
      const body = snake.bodyPoints.slice(0, BODY_POINT_LIMIT);
      return {
        id: snake.id,
        name: snake.name,
        color: snake.color,
        isBot: snake.isBot,
        x: round(snake.x),
        y: round(snake.y),
        angle: round(snake.angle, 3),
        score: snake.score,
        rank: index + 1,
        radius: round(snake.headRadius),
        width: round(snake.bodyWidth),
        energy: Math.round(snake.energy),
        boosting: snake.boosting,
        kills: snake.kills,
        age: Math.round(snake.age),
        length: Math.round(snake.bodyLength / 10),
        body: body.map((point) => [round(point.x), round(point.y)]),
      };
    });

    const orbs = [...this.orbs.values()].map((orb) => ({
      id: orb.id,
      x: round(orb.x),
      y: round(orb.y),
      v: orb.v,
      color: orb.color,
    }));

    const events = this.events;
    this.events = [];

    return {
      t: Date.now(),
      tick: Math.floor(this.now * 10),
      aliveCount: snakes.length,
      snakes,
      orbs,
      events,
    };
  }

  clearEvents() {
    this.events = [];
  }

  getStats() {
    const snakes = [...this.snakes.values()].filter((snake) => snake.alive);
    return {
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
      alive: snakes.length,
      humans: snakes.filter((snake) => !snake.isBot).length,
      bots: snakes.filter((snake) => snake.isBot).length,
      orbs: this.orbs.size,
      worldRadius: WORLD_RADIUS,
    };
  }
}

module.exports = GameRoom;
