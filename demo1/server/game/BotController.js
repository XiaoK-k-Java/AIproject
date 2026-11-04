'use strict';

const { TAU } = require('./geometry');
const { angleDelta, normalizeAngle, randomRange } = require('./geometry');
const { WORLD_RADIUS } = require('./constants');

/**
 * Lightweight steering brain for AI snakes.
 * It combines food seeking, boundary pressure and nearby-body repulsion.
 */
class BotController {
  constructor() {
    this.retargetIn = 0;
    this.targetOrbId = null;
    this.wanderAngle = Math.random() * TAU;
    this.jitter = Math.random() * 1000;
  }

  update(snake, room, dt) {
    if (!snake.alive) return;

    this.retargetIn -= dt;
    this.wanderAngle += dt * 0.55;
    this.jitter += dt;

    const target = this.pickTarget(snake, room);
    let desiredX = 0;
    let desiredY = 0;

    if (target) {
      const dx = target.x - snake.x;
      const dy = target.y - snake.y;
      const d = Math.hypot(dx, dy) || 1;
      const weight = 1.25 + Math.min(1.2, target.v * 0.22);
      desiredX += (dx / d) * weight;
      desiredY += (dy / d) * weight;
    } else {
      desiredX += Math.cos(this.wanderAngle) * 0.65;
      desiredY += Math.sin(this.wanderAngle) * 0.65;
    }

    // A small perpetual wander keeps motion organic rather than laser-focused.
    desiredX += Math.cos(this.wanderAngle * 1.7 + this.jitter * 0.13) * 0.14;
    desiredY += Math.sin(this.wanderAngle * 1.7 + this.jitter * 0.13) * 0.14;

    const radius = Math.hypot(snake.x, snake.y);
    const edge = WORLD_RADIUS - 360;
    if (radius > edge) {
      const urgency = Math.min(6.5, ((radius - edge) / 360) * 8);
      desiredX += (-snake.x / (radius || 1)) * urgency;
      desiredY += (-snake.y / (radius || 1)) * urgency;
    }

    const lookAhead = 76 + snake.speed * 0.34;
    const probeX = snake.x + Math.cos(snake.angle) * lookAhead;
    const probeY = snake.y + Math.sin(snake.angle) * lookAhead;

    for (const other of room.snakes.values()) {
      if (!other.alive || other === snake) continue;

      const dangerRadius = snake.headRadius + other.bodyWidth * 0.82 + 112;
      const dangerSq = dangerRadius * dangerRadius;

      for (let i = 2; i < other.bodyPoints.length; i += 2) {
        const p = other.bodyPoints[i];
        const pdx = probeX - p.x;
        const pdy = probeY - p.y;
        const dsq = pdx * pdx + pdy * pdy;
        if (dsq > dangerSq || dsq < 0.001) continue;

        const d = Math.sqrt(dsq);
        const strength = ((dangerRadius - d) / dangerRadius) ** 1.5 * 4.4;
        desiredX += (pdx / d) * strength;
        desiredY += (pdy / d) * strength;

        // A second, closer probe reacts earlier to obstacles directly ahead.
        const nearX = snake.x - p.x;
        const nearY = snake.y - p.y;
        const near = Math.hypot(nearX, nearY) || 1;
        if (near < snake.headRadius + other.bodyWidth + 26) {
          desiredX += (nearX / near) * 2.2;
          desiredY += (nearY / near) * 2.2;
        }
      }
    }

    let targetAngle;
    if (Math.abs(desiredX) + Math.abs(desiredY) < 0.05) {
      targetAngle = snake.angle + Math.sin(this.jitter * 0.7) * 0.4;
    } else {
      targetAngle = Math.atan2(desiredY, desiredX);
    }

    // Very near the boundary there is no cleverness left: turn back to center.
    if (radius > WORLD_RADIUS - 160) {
      targetAngle = Math.atan2(-snake.y, -snake.x);
    }

    snake.setInput(normalizeAngle(targetAngle), false);
  }

  pickTarget(snake, room) {
    if (this.retargetIn > 0 && this.targetOrbId != null) {
      const current = room.orbs.get(this.targetOrbId);
      if (current) return current;
    }

    this.retargetIn = randomRange(0.45, 0.95);

    let best = null;
    let bestScore = -Infinity;
    for (const orb of room.orbs.values()) {
      const dx = orb.x - snake.x;
      const dy = orb.y - snake.y;
      const distance = Math.hypot(dx, dy) + 90;
      if (distance > 1850) continue;

      const direction = Math.atan2(dy, dx);
      const turnCost = Math.abs(angleDelta(snake.angle, direction)) / Math.PI;
      const scoreValue = (orb.v * 310) / distance - turnCost * 0.35;
      const score = scoreValue + Math.random() * 0.08;

      if (score > bestScore) {
        bestScore = score;
        best = orb;
      }
    }

    this.targetOrbId = best ? best.id : null;
    return best;
  }
}

module.exports = BotController;
