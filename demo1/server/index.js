'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('ws');

const GameRoom = require('./game/GameRoom');
const { publicStatus, normalizeContext, requestAdvice } = require('./ai/llmAdvisor');
const {
  SNAKE_COLORS,
  WORLD_RADIUS,
  TICK_HZ,
  SNAPSHOT_HZ,
  BOT_COUNT,
} = require('./game/constants');

// Minimal .env support so the optional LLM connector can be configured locally
// without adding another runtime dependency.
function loadLocalEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] != null) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    console.warn(`[env] could not read .env: ${error.message}`);
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const NAME_MAX_LENGTH = 10;
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_MAX = 20;
const AI_RATE_MIN_GAP_MS = 1_200;
const aiRateLimits = new Map();

const room = new GameRoom({ botCount: BOT_COUNT });
const clients = new Set();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; font-src 'self';",
  );
}

function sendJson(res, status, body) {
  setCommonHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function allowAiRequest(ip) {
  const now = Date.now();
  let entry = aiRateLimits.get(ip);
  if (!entry || now - entry.windowStart >= AI_RATE_WINDOW_MS) {
    entry = { windowStart: now, count: 0, lastAt: 0 };
    aiRateLimits.set(ip, entry);
  }
  if (now - entry.lastAt < AI_RATE_MIN_GAP_MS || entry.count >= AI_RATE_MAX) {
    return false;
  }
  entry.lastAt = now;
  entry.count += 1;

  // Keep the in-memory limiter bounded on a long-running server.
  if (aiRateLimits.size > 5000) {
    for (const [key, value] of aiRateLimits) {
      if (now - value.windowStart >= AI_RATE_WINDOW_MS) aiRateLimits.delete(key);
    }
  }
  return true;
}

function readJsonBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks = [];

    const fail = (statusCode, message) => {
      if (settled) return;
      settled = true;
      req.resume();
      reject(Object.assign(new Error(message), { statusCode }));
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(413, 'Request body too large');
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });

    req.on('error', (error) => fail(400, error.message));
  });
}

async function handleCoachRequest(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!allowAiRequest(ip)) {
    req.resume();
    sendJson(res, 429, {
      ok: false,
      mode: 'local',
      error: '战术分析请求过于频繁，请稍后再试。',
    });
    return;
  }

  try {
    const body = await readJsonBody(req, 4096);
    const context = normalizeContext(body);
    const result = await requestAdvice(context);
    sendJson(res, 200, result);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[ai] coach endpoint error:', error.message);
    if (!res.headersSent) {
      sendJson(res, status, {
        ok: false,
        mode: 'local',
        error: status === 413 ? '请求数据过大。' : '战术分析暂时不可用。',
      });
    } else {
      res.end();
    }
  }
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/status') {
    sendJson(res, 200, room.getStats());
    return;
  }

  if (pathname === '/api/ai/status') {
    sendJson(res, 200, publicStatus());
    return;
  }

  if (pathname === '/api/ai/coach') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    void handleCoachRequest(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      setCommonHeaders(res);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    setCommonHeaders(res);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 4096,
  clientTracking: false,
});

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 1024 * 1024) return;
  ws.send(typeof message === 'string' ? message : JSON.stringify(message));
}

function cleanName(value) {
  if (typeof value !== 'string') return '无名蛇';
  const stripped = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(stripped).slice(0, NAME_MAX_LENGTH);
  return chars.join('') || '无名蛇';
}

function cleanColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    return SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
  }
  return value.toLowerCase();
}

function joinPlayer(ws, message) {
  if (ws.snakeId != null) {
    const existing = room.snakes.get(ws.snakeId);
    if (existing && existing.alive) {
      send(ws, { type: 'joined', id: existing.id, name: existing.name, color: existing.color });
      return;
    }
    if (existing && !existing.alive) {
      const respawned = room.respawnPlayer(ws.snakeId);
      if (respawned) {
        send(ws, { type: 'joined', id: respawned.id, name: respawned.name, color: respawned.color });
      } else {
        send(ws, { type: 'notice', code: 'respawn-cooldown', message: '环域正在重组，请稍候。' });
      }
      return;
    }
  }

  const snake = room.addPlayer({
    name: cleanName(message.name),
    color: cleanColor(message.color),
  });
  ws.snakeId = snake.id;
  send(ws, {
    type: 'joined',
    id: snake.id,
    name: snake.name,
    color: snake.color,
  });

  // Keep at least the configured number of AI rivals in the arena.
  const bots = [...room.snakes.values()].filter((entry) => entry.isBot);
  if (bots.length < BOT_COUNT) room.spawnBot();
}

function handleMessage(ws, raw) {
  if (raw.length > 3500) return;

  const now = Date.now();
  if (now - ws.rateWindowStart > 1000) {
    ws.rateWindowStart = now;
    ws.rateCount = 0;
  }
  ws.rateCount += 1;
  if (ws.rateCount > 100) return;

  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (!message || typeof message.type !== 'string') return;

  switch (message.type) {
    case 'join':
      joinPlayer(ws, message);
      break;

    case 'respawn': {
      if (ws.snakeId == null) {
        // Connection was replaced while the death screen was open.
        joinPlayer(ws, message);
        break;
      }
      const existing = room.snakes.get(ws.snakeId);
      if (!existing) {
        ws.snakeId = null;
        joinPlayer(ws, message);
        break;
      }
      const snake = room.respawnPlayer(ws.snakeId);
      if (snake) {
        send(ws, { type: 'joined', id: snake.id, name: snake.name, color: snake.color });
      } else {
        send(ws, { type: 'notice', code: 'respawn-cooldown', message: '环域正在重组，请稍候。' });
      }
      break;
    }

    case 'leave':
      if (ws.snakeId != null) {
        room.removePlayer(ws.snakeId);
        ws.snakeId = null;
        send(ws, { type: 'left' });
      }
      break;

    case 'input':
      if (ws.snakeId != null) {
        room.setInput(ws.snakeId, Number(message.angle), message.boost === true);
      }
      break;

    case 'ping':
      send(ws, { type: 'pong', t: message.t, serverTime: Date.now() });
      break;

    default:
      break;
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.snakeId = null;
  ws.rateWindowStart = Date.now();
  ws.rateCount = 0;
  clients.add(ws);

  send(ws, {
    type: 'hello',
    worldRadius: WORLD_RADIUS,
    tickHz: TICK_HZ,
    snapshotHz: SNAPSHOT_HZ,
    maxNameLength: NAME_MAX_LENGTH,
    palette: SNAKE_COLORS,
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      handleMessage(ws, data);
    } catch (error) {
      console.error('[ws] message error:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (ws.snakeId != null) {
      room.removePlayer(ws.snakeId);
      ws.snakeId = null;
    }
  });

  ws.on('error', (error) => {
    console.error('[ws] socket error:', error.message);
  });
});

// Drop dead sockets that stop answering heartbeats.
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // The close handler will clean up.
    }
  }
}, 30_000);
heartbeat.unref();

let lastTick = performance.now();
let snapshotAccumulator = 0;
let cachedPayload = null;

const loop = setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.08, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;

  room.step(dt);
  snapshotAccumulator += dt;

  const snapshotInterval = 1 / SNAPSHOT_HZ;
  if (snapshotAccumulator >= snapshotInterval) {
    snapshotAccumulator %= snapshotInterval;

    if (clients.size === 0) {
      room.clearEvents();
      return;
    }

    const snapshot = room.createSnapshot();
    cachedPayload = JSON.stringify({ type: 'snapshot', ...snapshot });

    for (const ws of clients) {
      send(ws, cachedPayload);
    }
  }
}, 1000 / TICK_HZ);

loop.unref();

server.listen(PORT, HOST, () => {
  const ai = publicStatus();
  console.log('');
  console.log('  █ SERPENT ORBIT / 蛇环');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → ${BOT_COUNT} AI rivals · ${TICK_HZ}Hz sim · ${SNAPSHOT_HZ}Hz net`);
  console.log(
    ai.configured
      ? `  → LLM coach: ${ai.model} @ ${ai.endpoint}`
      : '  → LLM coach: local fallback (set LLM_BASE_URL / LLM_MODEL to enable)',
  );
  console.log('');
});

function shutdown() {
  console.log('\nShutting down...');
  clearInterval(loop);
  clearInterval(heartbeat);
  for (const ws of clients) ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
