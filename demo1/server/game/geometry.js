'use strict';

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle into [-PI, PI]. */
function normalizeAngle(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** Shortest signed rotation from `from` to `to`. */
function angleDelta(from, to) {
  return normalizeAngle(to - from);
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distance(ax, ay, bx, by) {
  return Math.sqrt(distanceSq(ax, ay, bx, by));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/** Uniformly distributed point inside a circle. */
function randomPointInCircle(radius, margin = 0) {
  const angle = Math.random() * TAU;
  const r = Math.sqrt(Math.random()) * Math.max(0, radius - margin);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sampleAlongTrail(trail, spacing, maxLength) {
  const points = [];
  if (!trail.length) return points;

  points.push({ x: trail[0].x, y: trail[0].y });
  if (trail.length === 1 || maxLength <= 0) return points;

  let travelled = 0;
  let nextSample = spacing;

  for (let i = 0; i < trail.length - 1; i += 1) {
    const a = trail[i];
    const b = trail[i + 1];
    const segLength = distance(a.x, a.y, b.x, b.y);
    if (segLength < 1e-6) continue;

    while (travelled + segLength >= nextSample && nextSample <= maxLength) {
      const t = (nextSample - travelled) / segLength;
      points.push({
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
      });
      nextSample += spacing;
    }

    travelled += segLength;
    if (travelled >= maxLength + spacing) break;
  }

  return points;
}

module.exports = {
  TAU,
  clamp,
  lerp,
  normalizeAngle,
  angleDelta,
  distance,
  distanceSq,
  randomRange,
  randomInt,
  pick,
  randomPointInCircle,
  round,
  sampleAlongTrail,
};
