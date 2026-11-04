import { CONFIG } from './config.js';
import { formatDuration, formatNumber } from './utils.js';

function storageGet(key, fallback = '') {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private modes; preferences are optional.
  }
}

function element(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element #${id}`);
  return node;
}

export class UI {
  constructor({ onJoin, onRespawn, onLeave, onToggleSound }) {
    this.onJoin = onJoin;
    this.onRespawn = onRespawn;
    this.onLeave = onLeave;
    this.onToggleSound = onToggleSound;

    this.lobby = element('lobby');
    this.deathScreen = element('deathScreen');
    this.toastEl = element('toast');
    this.netPill = element('netPill');
    this.netText = element('netText');
    this.soundBtn = element('soundBtn');
    this.joinForm = element('joinForm');
    this.joinBtn = element('joinBtn');
    this.nameInput = element('nameInput');
    this.nameCount = element('nameCount');
    this.colorPalette = element('colorPalette');
    this.bestScoreEl = element('bestScore');
    this.lobbyAlive = element('lobbyAlive');
    this.lobbyLiveList = element('lobbyLiveList');
    this.playerPanel = element('playerPanel');
    this.playerName = element('playerName');
    this.rankBadge = element('rankBadge');
    this.statScore = element('statScore');
    this.statLength = element('statLength');
    this.statKills = element('statKills');
    this.energyFill = element('energyFill');
    this.energyText = element('energyText');
    this.boostBtn = element('boostBtn');
    this.energyRow = this.energyFill.closest('.energy-row');
    this.scoreStat = this.statScore.closest('.stat');
    this.leaderList = element('leaderList');
    this.aliveCount = element('aliveCount');
    this.killfeed = element('killfeed');
    this.deathTitle = element('deathTitle');
    this.deathReason = element('deathReason');
    this.deathScore = element('deathScore');
    this.deathTime = element('deathTime');
    this.deathLength = element('deathLength');
    this.deathRank = element('deathRank');
    this.bestBadge = element('bestBadge');
    this.aiCoach = element('aiCoach');
    this.aiCoachMode = element('aiCoachMode');
    this.aiCoachText = element('aiCoachText');
    this.respawnBtn = element('respawnBtn');
    this.leaveBtn = element('leaveBtn');
    this.connectBanner = element('connectBanner');
    this.deathFlash = element('deathFlash');
    this.snakeAvatar = element('snakeAvatar');

    this.view = 'lobby';
    this.selfId = null;
    this.joining = false;
    this.respawnLoading = false;
    this.best = Number(storageGet(CONFIG.storage.best, '0')) || 0;
    this.lastScore = null;
    this.lastLeaderUpdate = 0;
    this.lastLobbyUpdate = 0;
    this.lastLeaderSignature = '';
    this.toastTimer = null;
    this.feedTimers = new Set();

    this.name = storageGet(CONFIG.storage.name, '');
    const savedColor = storageGet(CONFIG.storage.color, CONFIG.colors[0]);
    this.color = CONFIG.colors.includes(savedColor) ? savedColor : CONFIG.colors[0];
    this.muted = storageGet(CONFIG.storage.muted, '0') === '1';

    this.initLobby();
    this.setBest(this.best);
    this.setSoundMuted(this.muted);
    this.bindEvents();
  }

  initLobby() {
    this.nameInput.value = Array.from(this.name).slice(0, 10).join('');
    this.updateNameCount();
    this.selectColor(this.color, false);
    this.setJoining(false);
  }

  bindEvents() {
    this.nameInput.addEventListener('input', () => {
      this.name = this.nameInput.value;
      this.updateNameCount();
      storageSet(CONFIG.storage.name, this.name);
    });

    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.joinForm.requestSubmit();
      }
    });

    this.colorPalette.addEventListener('click', (event) => {
      const button = event.target.closest('.swatch');
      if (!button) return;
      this.selectColor(button.dataset.color, true);
    });

    this.joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitJoin();
    });

    this.soundBtn.addEventListener('click', () => {
      this.muted = !this.muted;
      storageSet(CONFIG.storage.muted, this.muted ? '1' : '0');
      this.setSoundMuted(this.muted);
      this.onToggleSound?.(this.muted);
    });

    this.respawnBtn.addEventListener('click', () => {
      if (this.respawnLoading) return;
      this.setRespawnLoading(true);
      this.onRespawn?.();
    });

    this.leaveBtn.addEventListener('click', () => {
      if (this.respawnLoading) return;
      this.onLeave?.();
      this.showLobby();
    });
  }

  submitJoin() {
    if (this.joining) return;
    const raw = this.nameInput.value.replace(/\s+/g, ' ').trim();
    this.name = Array.from(raw).slice(0, 10).join('');
    this.nameInput.value = this.name;
    storageSet(CONFIG.storage.name, this.name);
    storageSet(CONFIG.storage.color, this.color);
    this.onJoin?.({ name: this.name || '无名蛇', color: this.color });
  }

  updateNameCount() {
    const length = Array.from(this.nameInput.value).length;
    this.nameCount.textContent = `${length}/10`;
  }

  selectColor(color, persist = true) {
    if (!CONFIG.colors.includes(color)) return;
    this.color = color;
    for (const button of this.colorPalette.querySelectorAll('.swatch')) {
      const selected = button.dataset.color === color;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
    if (persist) storageSet(CONFIG.storage.color, color);
  }

  setJoining(joining) {
    this.joining = joining;
    this.joinBtn.classList.toggle('is-loading', joining);
    this.joinBtn.setAttribute('aria-busy', joining ? 'true' : 'false');
    this.nameInput.disabled = joining;
    for (const button of this.colorPalette.querySelectorAll('.swatch')) {
      button.disabled = joining;
    }
  }

  setView(view) {
    this.view = view;
    document.body.dataset.view = view;
    this.lobby.classList.toggle('is-active', view === 'lobby');
    this.deathScreen.classList.toggle('is-active', view === 'dead');
    if (view !== 'lobby') {
      this.nameInput.blur();
    }
  }

  showLobby() {
    this.selfId = null;
    this.lastScore = null;
    this.lastLeaderSignature = '';
    this.setRespawnLoading(false);
    this.setJoining(false);
    this.setView('lobby');
    this.setBest(this.best);
    this.updateLobbyLive([]);
  }

  showGame() {
    this.setRespawnLoading(false);
    this.setJoining(false);
    this.setView('game');
  }

  setPlayer(info) {
    this.selfId = info.id;
    this.playerName.textContent = info.name;
    this.applyPlayerColor(info.color);
    this.lastScore = null;
  }

  applyPlayerColor(color) {
    document.documentElement.style.setProperty('--player-color', color);
    if (this.playerPanel) this.playerPanel.style.setProperty('--player-color', color);
    if (this.snakeAvatar) this.snakeAvatar.style.setProperty('--player-color', color);
  }

  setNetState(state, latency = null) {
    this.netPill.classList.remove('is-connecting', 'is-offline');
    if (state === 'online') {
      this.netText.textContent = Number.isFinite(latency) ? `已连接 · ${Math.round(latency)}ms` : '已连接';
    } else if (state === 'connecting') {
      this.netText.textContent = '正在连接';
      this.netPill.classList.add('is-connecting');
    } else {
      this.netText.textContent = '连接中断';
      this.netPill.classList.add('is-offline');
    }
  }

  setConnectionBanner(visible) {
    this.connectBanner.classList.toggle('is-visible', visible);
  }

  setSoundMuted(muted) {
    this.muted = muted;
    this.soundBtn.classList.toggle('is-muted', muted);
    this.soundBtn.setAttribute('aria-label', muted ? '开启声音' : '关闭声音');
    this.soundBtn.title = muted ? '开启声音' : '关闭声音';
  }

  setBest(score) {
    this.best = Math.max(0, Number(score) || 0);
    this.bestScoreEl.textContent = this.best > 0 ? formatNumber(this.best) : '—';
  }

  recordScore(score) {
    if (score > this.best) {
      this.best = score;
      storageSet(CONFIG.storage.best, String(score));
      this.bestScoreEl.textContent = formatNumber(score);
      return true;
    }
    return false;
  }

  update(frame, selfId) {
    if (!frame) return;
    const self = selfId == null ? null : frame.snakes.find((snake) => snake.id === selfId);

    if (self) {
      this.updatePlayerPanel(self);
      const now = performance.now();
      if (now - this.lastLeaderUpdate > 140) {
        this.lastLeaderUpdate = now;
        this.renderLeaderboard(frame.snakes, selfId);
      }
    }

    if (this.view === 'lobby') {
      this.updateLobbyLive(frame.snakes);
    }
  }

  updatePlayerPanel(self) {
    this.applyPlayerColor(self.color);
    this.playerName.textContent = self.name;
    this.statScore.textContent = formatNumber(self.score);
    this.statLength.textContent = formatNumber(self.length);
    this.statKills.textContent = formatNumber(self.kills || 0);
    this.rankBadge.textContent = `#${self.rank}`;

    const energy = Math.max(0, Math.min(100, self.energy ?? 100));
    this.energyFill.style.width = `${energy}%`;
    this.energyText.textContent = String(Math.round(energy));
    this.boostBtn.style.setProperty('--energy', energy.toFixed(1));
    this.boostBtn.classList.toggle('is-empty', energy < 5);
    this.energyRow.classList.toggle('is-empty', energy < 5);

    if (this.lastScore != null && self.score > this.lastScore) {
      this.scoreStat.classList.remove('is-bumped');
      void this.scoreStat.offsetWidth;
      this.scoreStat.classList.add('is-bumped');
    }
    this.lastScore = self.score;
    this.recordScore(self.score);
  }

  renderLeaderboard(snakes, selfId) {
    const top = snakes.slice(0, 7);
    let visible = top;
    if (selfId != null && !top.some((snake) => snake.id === selfId)) {
      const self = snakes.find((snake) => snake.id === selfId);
      if (self) visible = [...snakes.slice(0, 6), self];
    }

    const signature = visible
      .map((snake) => `${snake.id}:${snake.score}:${snake.rank}`)
      .join('|');
    this.aliveCount.textContent = String(snakes.length);
    if (signature === this.lastLeaderSignature) return;
    this.lastLeaderSignature = signature;

    const fragment = document.createDocumentFragment();
    for (const snake of visible) {
      const row = document.createElement('li');
      row.className = 'leader-row';
      if (snake.id === selfId) row.classList.add('is-you');
      if (snake.rank === 1) row.classList.add('is-first');
      row.style.setProperty('--row-color', snake.color);

      const rank = document.createElement('span');
      rank.className = 'leader-rank';
      rank.textContent = String(snake.rank).padStart(2, '0');

      const dot = document.createElement('span');
      dot.className = 'leader-dot';

      const name = document.createElement('span');
      name.className = 'leader-name';
      name.textContent = snake.name;
      if (snake.id === selfId) {
        const marker = document.createElement('em');
        marker.textContent = 'YOU';
        name.append(marker);
      }

      const score = document.createElement('span');
      score.className = 'leader-score';
      score.textContent = formatNumber(snake.score);

      row.append(rank, dot, name, score);
      fragment.append(row);
    }

    this.leaderList.replaceChildren(fragment);
  }

  updateLobbyLive(snakes) {
    const now = performance.now();
    if (now - this.lastLobbyUpdate < 450) return;
    this.lastLobbyUpdate = now;
    if (!snakes || snakes.length === 0) {
      this.lobbyAlive.textContent = '0';
      this.lobbyLiveList.replaceChildren();
      return;
    }

    this.lobbyAlive.textContent = String(snakes.length);
    const top = snakes.slice(0, 3);
    const fragment = document.createDocumentFragment();
    for (const snake of top) {
      const item = document.createElement('span');
      item.className = 'lobby-live-item';
      item.style.setProperty('--row-color', snake.color);
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = snake.name;
      const score = document.createElement('b');
      score.textContent = formatNumber(snake.score);
      item.append(dot, name, score);
      fragment.append(item);
    }
    this.lobbyLiveList.replaceChildren(fragment);
  }

  addKillfeed(event) {
    const item = document.createElement('div');
    item.className = 'killfeed-item';

    const victim = document.createElement('strong');
    victim.textContent = event.victim.name;
    victim.style.color = event.victim.color;

    const mark = document.createElement('span');
    mark.className = 'feed-mark';

    const action = document.createElement('em');
    if (event.reason === 'wall') {
      action.textContent = '撞上了环域边界';
    } else if (event.killer) {
      action.textContent = '撞上了';
    } else {
      action.textContent = '陨落';
    }

    item.append(victim, mark, action);

    if (event.reason === 'body' && event.killer) {
      const killer = document.createElement('strong');
      killer.textContent = event.killer.name;
      killer.style.color = event.killer.color;
      item.append(killer);
    }

    this.killfeed.prepend(item);
    while (this.killfeed.children.length > 4) {
      this.killfeed.lastElementChild.remove();
    }

    const timer = window.setTimeout(() => {
      this.feedTimers.delete(timer);
      item.classList.add('is-out');
      window.setTimeout(() => item.remove(), 340);
    }, 5100);
    this.feedTimers.add(timer);
  }

  showDeath(event, { bestScore, peakRank, isRecord }) {
    const isWall = event.reason === 'wall';
    this.deathTitle.textContent = isWall ? '你越界了' : '你撞毁了';

    this.deathReason.replaceChildren();
    if (isWall) {
      this.deathReason.append(document.createTextNode('你的蛇头越过了环域边界，身体在虚空中解体。'));
    } else if (event.killer) {
      this.deathReason.append(document.createTextNode('你的蛇头撞上了 '));
      const killer = document.createElement('strong');
      killer.textContent = `「${event.killer.name}」`;
      this.deathReason.append(killer, document.createTextNode(' 的身体。'));
    } else {
      this.deathReason.append(document.createTextNode('你的蛇头撞上了对手的身体。'));
    }

    this.deathScore.textContent = formatNumber(event.score);
    this.deathTime.textContent = formatDuration(event.age);
    this.deathLength.textContent = `${formatNumber(event.length)}m`;
    this.deathRank.textContent = `#${peakRank || '—'}`;
    this.bestBadge.parentElement.classList.toggle('is-record', Boolean(isRecord));
    this.bestBadge.textContent = 'NEW RECORD';

    this.setRespawnLoading(false);
    this.setCoachLoading();
    this.setView('dead');

    this.deathFlash.classList.remove('is-active');
    void this.deathFlash.offsetWidth;
    this.deathFlash.classList.add('is-active');

    if (bestScore > this.best) this.setBest(bestScore);
  }

  setCoachLoading() {
    this.aiCoach.classList.add('is-loading');
    this.aiCoachMode.className = 'ai-coach-mode';
    this.aiCoachMode.textContent = '分析中';
    this.aiCoachText.textContent = '正在分析本局航迹…';
  }

  setCoach(result) {
    const advice = typeof result?.advice === 'string' && result.advice.trim()
      ? result.advice.trim()
      : '贴着对手头部外侧绕行，等它转向时再从内侧切过去。';
    const isLlm = result?.mode === 'llm';
    const isFallback = !isLlm && result?.fallbackReason && result.fallbackReason !== 'not-configured';

    this.aiCoach.classList.remove('is-loading');
    this.aiCoachMode.className = `ai-coach-mode ${isLlm ? 'is-llm' : 'is-local'}`;
    if (isLlm) {
      const model = typeof result.model === 'string' ? result.model.slice(0, 28) : '';
      this.aiCoachMode.textContent = model ? `AI · ${model}` : 'AI ONLINE';
    } else {
      this.aiCoachMode.textContent = isFallback ? '本地回退' : '本地推演';
    }
    this.aiCoachText.textContent = advice;
  }

  setCoachError() {
    this.aiCoach.classList.remove('is-loading');
    this.aiCoachMode.className = 'ai-coach-mode is-error';
    this.aiCoachMode.textContent = '离线建议';
    this.aiCoachText.textContent = '战术分析暂时不可用。贴着对手头部外侧绕行，等它转向后再切进内线。';
  }

  setRespawnLoading(loading) {
    this.respawnLoading = loading;
    this.respawnBtn.classList.toggle('is-loading', loading);
    this.respawnBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    this.leaveBtn.disabled = loading;
    if (!loading) this.respawnBtn.querySelector('.btn-label').textContent = '再次进入环域';
  }

  toast(message, duration = 2800) {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('is-visible');
    }, duration);
  }
}
