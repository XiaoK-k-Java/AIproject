'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameRoom = require('../server/game/GameRoom');
const { WORLD_RADIUS } = require('../server/game/constants');

function makeRoom() {
  const room = new GameRoom({ botCount: 0 });
  room.orbs.clear();
  return room;
}

test('a head hitting another snake body dies and drops mass proportionally', () => {
  const room = makeRoom();
  const victim = room.addPlayer({ name: 'victim', color: '#5ef2e4' });
  const killer = room.addPlayer({ name: 'killer', color: '#ff6b8a' });

  victim.score = 100;
  victim.x = 200;
  victim.y = 200;
  victim.bodyPoints = [{ x: 200, y: 200 }];

  killer.x = 900;
  killer.y = 900;
  killer.bodyPoints = [
    { x: 900, y: 900 },
    { x: 880, y: 880 },
    { x: 200, y: 200 },
    { x: 180, y: 200 },
  ];

  room.resolveCollisions();

  assert.equal(victim.alive, false, 'victim should die');
  assert.equal(killer.alive, true, 'killer body should remain alive');
  assert.equal(killer.kills, 1, 'killer should receive credit');

  const dropped = [...room.orbs.values()].reduce((sum, orb) => sum + orb.v, 0);
  assert.equal(dropped, Math.round(5 + 100 * 0.82), 'drop value follows score');
  assert.ok(room.orbs.size >= 4, 'mass breaks into multiple orbs');

  const event = room.events.at(-1);
  assert.equal(event.type, 'death');
  assert.equal(event.reason, 'body');
  assert.equal(event.score, 100);
  assert.equal(event.victim.id, victim.id);
  assert.equal(event.killer.id, killer.id);
});

test('head-to-head and head/neck contact are not lethal', () => {
  const room = makeRoom();
  const a = room.addPlayer({ name: 'a', color: '#5ef2e4' });
  const b = room.addPlayer({ name: 'b', color: '#ff6b8a' });

  a.x = 0;
  a.y = 0;
  a.bodyPoints = [{ x: 0, y: 0 }, { x: 0, y: 16 }, { x: 900, y: 900 }];
  b.x = 0;
  b.y = 0;
  b.bodyPoints = [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 900, y: 900 }];

  room.resolveCollisions();

  assert.equal(a.alive, true);
  assert.equal(b.alive, true);
});

test('a snake crossing its own body is not lethal', () => {
  const room = makeRoom();
  const snake = room.addPlayer({ name: 'loop', color: '#ff8fe0' });
  snake.x = 0;
  snake.y = 0;
  snake.bodyPoints = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }];

  room.resolveCollisions();

  assert.equal(snake.alive, true);
});

test('hitting the arena boundary is lethal', () => {
  const room = makeRoom();
  const snake = room.addPlayer({ name: 'edge', color: '#ffd166' });
  snake.x = WORLD_RADIUS - 1;
  snake.y = 0;

  room.resolveCollisions();

  assert.equal(snake.alive, false);
  assert.equal(room.events.at(-1).reason, 'wall');
  assert.equal(room.events.at(-1).killer, null);
});

test('eating an orb increases score and length', () => {
  const room = makeRoom();
  const snake = room.addPlayer({ name: 'hungry', color: '#b6f36b' });
  snake.x = 0;
  snake.y = 0;
  room.addOrb({ x: 0, y: 0, v: 7, color: '#ffe29a' });

  const hadLength = snake.bodyLength;
  room.collectOrbs();

  assert.equal(snake.score, 7);
  assert.equal(snake.foodEaten, 1);
  assert.ok(snake.bodyLength > hadLength);
  assert.equal(room.orbs.size, 0);
});

test('death events are delivered once and snapshots carry playable body data', () => {
  const room = makeRoom();
  const snake = room.addPlayer({ name: 'snapshot', color: '#6cb8ff' });
  room.addOrb({ x: 0, y: 0, v: 2, color: '#ffe29a' });
  snake.x = WORLD_RADIUS + 20;

  room.resolveCollisions();

  const first = room.createSnapshot();
  assert.equal(first.events.length, 1);
  assert.ok(Array.isArray(first.snakes));
  assert.ok(first.snakes.every((entry) => Array.isArray(entry.body) && entry.body.length > 0));
  assert.equal(first.aliveCount, first.snakes.length);

  const second = room.createSnapshot();
  assert.equal(second.events.length, 0);
});

test('the room maintains its configured AI population', () => {
  const room = new GameRoom({ botCount: 7 });
  const stats = room.getStats();
  assert.equal(stats.alive, 7);
  assert.equal(stats.bots, 7);
  assert.ok(stats.orbs >= 200);
});
