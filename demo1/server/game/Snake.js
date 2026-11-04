'use strict';

const {
  BASE_LENGTH,
  MAX_BODY_LENGTH,
  GROWTH_PER_SCORE,
  BASE_HEAD_RADIUS,
  MAX_HEAD_BONUS,
  BODY_WIDTH_FACTOR,
  BASE_SPEED,
  BOOST_SPEED_BONUS,
  BOOST_ENERGY_DRAIN,
  BOOST_ENERGY_REGEN,
  MIN_BOOST_ENERGY,
  BASE_TURN_RATE,
  MIN_TURN_RATE,
  BODY_SPACING,
  TRAIL_PADDING,
  BOT_RESPAWN_MIN,
  BOT_RESPAWN_MAX,
} = require('./constants');
const {
  clamp,
  angleDelta,
  normalizeAngle,
  sampleAlongTrail,
  randomRange,
} = require('./geometry');

class Snake {
  constructor({ id, name, color, isBot = false }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isBot = isBot;

    this.score = 0;
    this.alive = false;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.targetAngle = 0;

    this.energy = 100;
    this.wantsBoost = false;
    this.boosting = false;

    this.age = 0;
    this.kills = 0;
    this.foodEaten = 0;
    this.deadAt = 0;
    this.respawnAt = 0;

    this.trail = [];
    this.bodyPoints = [];
  }

  get bodyLength() {
    return Math.min(
      MAX_BODY_LENGTH,
      BASE_LENGTH + this.score * GROWTH_PER_SCORE,
    );
  }

  get headRadius() {
    return BASE_HEAD_RADIUS + Math.min(MAX_HEAD_BONUS, Math.sqrt(this.score) * 0.38);
  }

  get bodyWidth() {
    return this.headRadius * BODY_WIDTH_FACTOR;
  }

  get speed() {
    const weightPenalty = Math.min(34, Math.sqrt(this.score) * 1.15);
    const boost = this.boosting ? BOOST_SPEED_BONUS : 0;
    return BASE_SPEED - weightPenalty + boost;
  }

  get turnRate() {
    return Math.max(MIN_TURN_RATE, BASE_TURN_RATE - Math.sqrt(this.score) * 0.048);
  }

  reset({ x, y, angle, score = 0 }) {
    this.score = score;
    this.alive = true;
    this.x = x;
    this.y = y;
    this.angle = normalizeAngle(angle);
    this.targetAngle = this.angle;
    this.energy = 100;
    this.wantsBoost = false;
    this.boosting = false;
    this.age = 0;
    this.kills = 0;
    this.foodEaten = 0;
    this.deadAt = 0;
    this.respawnAt = 0;

    this.trail = [];
    const length = this.bodyLength + TRAIL_PADDING;
    const step = 4;
    const backX = -Math.cos(this.angle);
    const backY = -Math.sin(this.angle);
    for (let d = 0; d <= length; d += step) {
      // Add a tiny organic curve so fresh snakes never look perfectly rigid.
      const sway = Math.sin(d * 0.018) * Math.min(2.5, d * 0.006);
      this.trail.push({
        x: this.x + backX * d + Math.cos(this.angle + Math.PI / 2) * sway,
        y: this.y + backY * d + Math.sin(this.angle + Math.PI / 2) * sway,
      });
    }
    this.updateBodyPoints();
  }

  setInput(angle, boost) {
    if (!this.alive) return;
    if (Number.isFinite(angle)) {
      this.targetAngle = normalizeAngle(angle);
    }
    this.wantsBoost = Boolean(boost);
  }

  update(dt) {
    if (!this.alive) return;

    this.age += dt;

    const delta = angleDelta(this.angle, this.targetAngle);
    const maxTurn = this.turnRate * dt;
    this.angle = normalizeAngle(this.angle + clamp(delta, -maxTurn, maxTurn));

    this.boosting = this.wantsBoost && this.energy > MIN_BOOST_ENERGY;
    if (this.boosting) {
      this.energy = Math.max(0, this.energy - BOOST_ENERGY_DRAIN * dt);
    } else {
      this.energy = Math.min(100, this.energy + BOOST_ENERGY_REGEN * dt);
    }

    const step = this.speed * dt;
    this.x += Math.cos(this.angle) * step;
    this.y += Math.sin(this.angle) * step;

    const head = this.trail[0];
    if (!head || Math.abs(head.x - this.x) + Math.abs(head.y - this.y) > 0.7) {
      this.trail.unshift({ x: this.x, y: this.y });
    } else {
      head.x = this.x;
      head.y = this.y;
    }

    this.trimTrail(this.bodyLength + TRAIL_PADDING);
    this.updateBodyPoints();
  }

  trimTrail(maxLength) {
    let travelled = 0;
    for (let i = 0; i < this.trail.length - 1; i += 1) {
      const a = this.trail[i];
      const b = this.trail[i + 1];
      travelled += Math.hypot(a.x - b.x, a.y - b.y);
      if (travelled > maxLength) {
        this.trail.length = i + 2;
        return;
      }
    }
  }

  updateBodyPoints() {
    this.bodyPoints = sampleAlongTrail(this.trail, BODY_SPACING, this.bodyLength);
  }

  addScore(value) {
    this.score += Math.max(0, value);
    this.foodEaten += 1;
  }

  kill(now) {
    if (!this.alive) return false;
    this.alive = false;
    this.boosting = false;
    this.wantsBoost = false;
    this.deadAt = now;
    if (this.isBot) {
      this.respawnAt = now + randomRange(BOT_RESPAWN_MIN, BOT_RESPAWN_MAX);
    }
    return true;
  }
}

module.exports = Snake;
