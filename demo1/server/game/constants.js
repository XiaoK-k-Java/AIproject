'use strict';

module.exports = {
  TICK_HZ: 30,
  SNAPSHOT_HZ: 20,
  WORLD_RADIUS: 2200,

  BOT_COUNT: 8,
  ORB_TARGET: 260,
  MAX_ORBS: 720,

  BASE_LENGTH: 260,
  MAX_BODY_LENGTH: 2600,
  GROWTH_PER_SCORE: 2.25,

  BASE_HEAD_RADIUS: 18,
  MAX_HEAD_BONUS: 9,
  BODY_WIDTH_FACTOR: 1.58,

  BASE_SPEED: 158,
  BOOST_SPEED_BONUS: 92,
  BOOST_ENERGY_DRAIN: 27,
  BOOST_ENERGY_REGEN: 15,
  MIN_BOOST_ENERGY: 5,

  BASE_TURN_RATE: 4.25,
  MIN_TURN_RATE: 2.8,

  BODY_SPACING: 16,
  TRAIL_PADDING: 140,
  BODY_POINT_LIMIT: 180,

  BOT_RESPAWN_MIN: 2.4,
  BOT_RESPAWN_MAX: 5.2,
  PLAYER_RESPAWN_COOLDOWN: 0.7,

  ORB_COLORS: ['#ffe29a', '#ffadbf', '#97fff1', '#c9b8ff', '#ffd06e'],
  SNAKE_COLORS: [
    '#5ef2e4',
    '#ff6b8a',
    '#a78bfa',
    '#ffd166',
    '#b6f36b',
    '#6cb8ff',
    '#ff9e5e',
    '#ff8fe0',
  ],

  BOT_NAMES: [
    '霓虹鳐',
    '电离层',
    '午夜列车',
    '深空回响',
    '折光',
    '赤潮',
    '量子狐',
    '白噪',
    '引力井',
    '黑曜',
    '折跃者',
    '极光残响',
    '碳基幽灵',
    '零号环',
  ],
};
