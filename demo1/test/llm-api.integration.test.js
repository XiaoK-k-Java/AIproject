'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function getFreePort() {
  const server = http.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

async function waitForHealth(url, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('app server did not become healthy');
}

test('frontend-facing coach API reaches an OpenAI-compatible LLM and returns its answer', { timeout: 20_000 }, async (t) => {
  const llmRequests = [];
  const mockLlm = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      llmRequests.push({ url: req.url, auth: req.headers.authorization, body: parsed });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{
          message: {
            content: '不要追着尾巴跑：贴着对手头部外侧并行，等它转向时用冲刺切进内线。',
          },
        }],
      }));
    });
  });

  const llmPort = await listen(mockLlm);
  const appPort = await getFreePort();
  const serverPath = path.resolve(__dirname, '..', 'server', 'index.js');
  let stderr = '';

  const app = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      LLM_BASE_URL: `http://127.0.0.1:${llmPort}/v1`,
      LLM_MODEL: 'mock-orbit-coach',
      LLM_API_KEY: 'integration-test-key',
      LLM_TIMEOUT_MS: '3000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  app.stdout.on('data', () => {});

  t.after(async () => {
    if (app.exitCode == null) {
      app.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (app.exitCode == null) app.kill('SIGKILL');
          resolve();
        }, 1500);
        app.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await close(mockLlm);
  });

  await waitForHealth(`http://127.0.0.1:${appPort}/healthz`);

  const statusResponse = await fetch(`http://127.0.0.1:${appPort}/api/ai/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.configured, true);
  assert.equal(status.mode, 'llm');
  assert.equal(status.model, 'mock-orbit-coach');
  assert.equal(status.endpoint, `127.0.0.1:${llmPort}`);

  const response = await fetch(`http://127.0.0.1:${appPort}/api/ai/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: 'body',
      score: 48,
      length: 37,
      rank: 4,
      age: 17,
      killer: '白噪',
    }),
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'llm');
  assert.match(result.advice, /内线/);
  assert.equal(llmRequests.length, 1);
  assert.equal(llmRequests[0].url, '/v1/chat/completions');
  assert.equal(llmRequests[0].auth, 'Bearer integration-test-key');
  assert.equal(llmRequests[0].body.model, 'mock-orbit-coach');
  assert.match(JSON.stringify(llmRequests[0].body.messages), /白噪/);
  assert.equal(stderr.trim(), '');
});
