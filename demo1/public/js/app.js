import { CONFIG } from './config.js';
import { Network } from './network.js';
import { GameRenderer } from './renderer.js';
import { InputController } from './input.js';
import { UI } from './ui.js';
import { SoundEngine } from './audio.js';
import { SnapshotInterpolator } from './interpolation.js';

const canvas = document.getElementById('arena');
const minimapCanvas = document.getElementById('minimap');

const renderer = new GameRenderer(canvas, minimapCanvas);
const network = new Network(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
const interpolator = new SnapshotInterpolator(CONFIG.snapshotDelay);

let audio = null;

const state = {
  selfId: null,
  inGame: false,
  dead: false,
  pendingStart: false,
  awaitingJoin: false,
  desiredJoin: false,
  connected: false,
  userName: '',
  userColor: CONFIG.colors[0],
  runBaselineBest: 0,
  peakRank: Infinity,
  lastOwnScore: null,
  seenEvents: new Set(),
  joinResponseTimer: null,
  joinWatchdog: null,
  hasConnectedOnce: false,
  tutorialShown: false,
  coachAbort: null,
  coachRequestId: 0,
};

const ui = new UI({
  onJoin: beginJoin,
  onRespawn: beginRespawn,
  onLeave: leaveGame,
  onToggleSound: (muted) => {
    audio?.setMuted(muted);
    if (!muted) audio?.notice();
  },
});

audio = new SoundEngine(ui.muted);
state.userName = (ui.name || '').trim() || '无名蛇';
state.userColor = ui.color;

const input = new InputController({
  canvas,
  joystick: document.getElementById('joystick'),
  knob: document.getElementById('joyKnob'),
  needle: document.getElementById('joyNeedle'),
  boostButton: document.getElementById('boostBtn'),
  getAimOrigin: () => renderer.getSelfScreen(),
});

ui.setNetState('connecting');

network.addEventListener('connecting', () => {
  if (!state.connected) ui.setNetState('connecting');
});

network.addEventListener('open', () => {
  const reconnected = state.hasConnectedOnce;
  state.connected = true;
  state.hasConnectedOnce = true;
  state.awaitingJoin = false;
  interpolator.reset();
  state.seenEvents.clear();
  ui.setNetState('online');
  ui.setConnectionBanner(false);

  if (state.desiredJoin) {
    sendJoinNow();
  } else if (reconnected && ui.view !== 'lobby') {
    ui.toast('星链已恢复');
  }
});

network.addEventListener('close', () => {
  state.connected = false;
  state.awaitingJoin = false;
  clearJoinTimers();
  ui.setNetState('offline');
  ui.setConnectionBanner(true);
  ui.setRespawnLoading(false);
  input.setEnabled(false);

  if ((ui.view === 'game' || state.pendingStart || state.awaitingJoin) && !state.dead) {
    state.desiredJoin = true;
    state.inGame = false;
  }
});

network.addEventListener('reconnecting', () => {
  ui.setConnectionBanner(true);
});

network.addEventListener('latency', (event) => {
  if (state.connected) ui.setNetState('online', event.detail);
});

network.addEventListener('hello', (event) => {
  renderer.setWorldRadius(event.detail.worldRadius || CONFIG.worldRadius);
});

network.addEventListener('joined', (event) => {
  clearJoinTimers();
  state.awaitingJoin = false;
  state.desiredJoin = false;
  state.selfId = event.detail.id;
  state.dead = false;
  state.pendingStart = true;
  state.runBaselineBest = ui.best;
  state.peakRank = Infinity;
  state.lastOwnScore = null;
  renderer.setSelfId(event.detail.id);
  renderer.resetCamera();
  input.setEnabled(false);
  input.resetAim();
  ui.setPlayer(event.detail);
  ui.setJoining(true);
  audio?.join();
});

network.addEventListener('snapshot', (event) => {
  handleSnapshot(event.detail);
});

network.addEventListener('notice', (event) => {
  state.awaitingJoin = false;
  state.desiredJoin = false;
  clearJoinTimers();
  ui.setRespawnLoading(false);
  ui.setJoining(false);
  ui.toast(event.detail.message || '环域暂不可用。');
  audio?.notice();
});

network.addEventListener('left', () => {
  resetToLobby();
  ui.showLobby();
});

function beginJoin({ name, color }) {
  state.userName = name || '无名蛇';
  state.userColor = color || CONFIG.colors[0];
  state.runBaselineBest = ui.best;
  state.desiredJoin = true;
  state.awaitingJoin = true;
  audio?.unlock();
  ui.setJoining(true);

  if (network.isOpen()) {
    sendJoinNow();
  } else {
    ui.toast('星链正在建立，即将进入环域…');
    window.clearTimeout(state.joinWatchdog);
    state.joinWatchdog = window.setTimeout(() => {
      if (!state.inGame && !state.pendingStart) {
        ui.setJoining(false);
        ui.toast('竞技场暂时没有响应，正在重试连接…');
      }
    }, 9000);
  }
}

function sendJoinNow() {
  if (!state.desiredJoin || !network.isOpen()) return;
  network.send({
    type: 'join',
    name: state.userName || '无名蛇',
    color: state.userColor,
  });
  state.awaitingJoin = true;
  scheduleJoinTimeout();
}

function beginRespawn() {
  audio?.unlock();
  ui.setRespawnLoading(true);

  if (!network.isOpen()) {
    state.desiredJoin = true;
    ui.setRespawnLoading(false);
    ui.toast('正在重新接入星链，请稍候…');
    return;
  }

  state.awaitingJoin = true;
  network.send({
    type: 'respawn',
    name: state.userName || '无名蛇',
    color: state.userColor,
  });
  scheduleJoinTimeout();
}

function leaveGame() {
  if (network.isOpen()) network.send({ type: 'leave' });
  resetToLobby();
  ui.showLobby();
}

function scheduleJoinTimeout() {
  clearJoinTimers();
  state.joinResponseTimer = window.setTimeout(() => {
    if (!state.awaitingJoin) return;
    state.awaitingJoin = false;
    state.desiredJoin = false;
    ui.setJoining(false);
    ui.setRespawnLoading(false);
    ui.toast('接入超时，请稍后再试。');
  }, 8000);
}

function clearJoinTimers() {
  if (state.joinResponseTimer) {
    window.clearTimeout(state.joinResponseTimer);
    state.joinResponseTimer = null;
  }
  if (state.joinWatchdog) {
    window.clearTimeout(state.joinWatchdog);
    state.joinWatchdog = null;
  }
}

function resetToLobby() {
  state.selfId = null;
  state.inGame = false;
  state.dead = false;
  state.pendingStart = false;
  state.awaitingJoin = false;
  state.desiredJoin = false;
  state.lastOwnScore = null;
  state.peakRank = Infinity;
  clearJoinTimers();
  cancelCoachRequest();
  renderer.setSelfId(null);
  input.setEnabled(false);
  input.resetAim();
  ui.setJoining(false);
  ui.setRespawnLoading(false);
}

function handleSnapshot(snapshot) {
  interpolator.push(snapshot);

  if (Array.isArray(snapshot.events) && snapshot.events.length) {
    processEvents(snapshot.events);
  }

  if (state.selfId == null) return;
  const own = snapshot.snakes.find((snake) => snake.id === state.selfId);

  if (!own) return;

  if (state.pendingStart) {
    state.pendingStart = false;
    state.inGame = true;
    state.dead = false;
    cancelCoachRequest();
    ui.showGame();
    renderer.resetCamera();
    input.resetAim();
    input.setAngle(own.angle);
    input.setEnabled(true);
    renderer.spawnBurst(own.x, own.y, own.color);
    if (!state.tutorialShown) {
      state.tutorialShown = true;
      ui.toast('拖动 360° 罗盘转向 · 按住闪电冲刺', 3400);
    }
  }

  if (state.lastOwnScore != null && own.score > state.lastOwnScore) {
    const gain = own.score - state.lastOwnScore;
    renderer.eatBurst(own.x, own.y, own.color, gain);
    audio?.eat(own.score);
  }
  state.lastOwnScore = own.score;
  if (Number.isFinite(own.rank)) {
    state.peakRank = Math.min(state.peakRank, own.rank);
  }
}

function processEvents(events) {
  for (const event of events) {
    if (!event || event.type !== 'death') continue;
    if (state.seenEvents.has(event.id)) continue;
    state.seenEvents.add(event.id);
    if (state.seenEvents.size > 300) {
      const oldest = state.seenEvents.values().next().value;
      state.seenEvents.delete(oldest);
    }

    renderer.addDeathEffect(event);
    ui.addKillfeed(event);

    if (state.selfId != null && event.victim?.id === state.selfId) {
      handleOwnDeath(event);
    } else if (state.selfId != null && event.killer?.id === state.selfId) {
      audio?.kill();
    }
  }
}

function handleOwnDeath(event) {
  const isRecord = event.score > state.runBaselineBest;
  ui.recordScore(event.score);
  state.dead = true;
  state.inGame = false;
  state.pendingStart = false;
  state.lastOwnScore = null;
  state.desiredJoin = false;
  input.setEnabled(false);
  renderer.setDeathFocus(event.x, event.y);
  ui.showDeath(event, {
    bestScore: ui.best,
    peakRank: Number.isFinite(state.peakRank) ? state.peakRank : null,
    isRecord,
  });
  requestCoachAdvice(event);
  audio?.death();
}

function cancelCoachRequest() {
  state.coachRequestId += 1;
  if (state.coachAbort) {
    state.coachAbort.abort();
    state.coachAbort = null;
  }
}

function requestCoachAdvice(event) {
  cancelCoachRequest();
  const requestId = state.coachRequestId;
  const controller = new AbortController();
  state.coachAbort = controller;
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  fetch('/api/ai/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      reason: event.reason,
      score: event.score,
      length: event.length,
      rank: Number.isFinite(state.peakRank) ? state.peakRank : 0,
      age: event.age,
      killer: event.killer?.name || '',
    }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`coach HTTP ${response.status}`);
      return response.json();
    })
    .then((result) => {
      if (requestId !== state.coachRequestId) return;
      ui.setCoach(result);
    })
    .catch(() => {
      if (requestId !== state.coachRequestId) return;
      ui.setCoachError();
    })
    .finally(() => {
      window.clearTimeout(timeout);
      if (state.coachAbort === controller) state.coachAbort = null;
    });
}

function sendInput() {
  if (!state.inGame || state.dead || !network.isOpen() || !input.enabled) return;
  const { angle, boost } = input.state;
  if (angle == null) return;
  network.send({ type: 'input', angle, boost });
}

let lastUiPaint = 0;

function animationLoop(now) {
  const frame = interpolator.sample(now);
  renderer.render(frame, { view: ui.view });
  input.update();

  if (frame && now - lastUiPaint > 55) {
    lastUiPaint = now;
    ui.update(frame, state.selfId);
  }

  window.requestAnimationFrame(animationLoop);
}

window.setInterval(sendInput, 1000 / CONFIG.inputSendHz);
window.requestAnimationFrame(animationLoop);
network.connect();

window.addEventListener('beforeunload', () => {
  network.stop();
});

// Keep the game resumable if the tab is backgrounded for a while.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && network.isOpen() && state.desiredJoin && !state.awaitingJoin) {
    sendJoinNow();
  }
});
