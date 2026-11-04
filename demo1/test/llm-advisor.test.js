'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  requestAdvice,
  publicStatus,
  normalizeContext,
  localAdvice,
} = require('../server/ai/llmAdvisor');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function startMockProvider(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      requests.push({ url: req.url, headers: req.headers, body: parsed });
      handler(req, res, parsed);
    });
  });
  const port = await listen(server);
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => close(server),
  };
}

test('returns a local tactical fallback when no model is configured', async () => {
  const result = await requestAdvice(
    { reason: 'body', killer: '白噪', score: 12, length: 28, rank: 5, age: 9 },
    { env: {} },
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'local');
  assert.equal(result.fallbackReason, 'not-configured');
  assert.match(result.advice, /白噪/);
});

test('normalizes hostile or malformed death data for prompts', () => {
  const context = normalizeContext({
    reason: 'weird',
    score: '999999999999',
    length: -20,
    rank: 0,
    age: 'abc',
    killer: '<script>\n'.repeat(100),
  });

  assert.equal(context.reason, 'body');
  assert.equal(context.score, 1_000_000);
  assert.equal(context.length, 0);
  assert.equal(context.rank, 1);
  assert.equal(context.age, 0);
  assert.ok(context.killerName.length <= 24);
  assert.ok(!context.killerName.includes('<'));
});

test('local advice covers boundary deaths', () => {
  const advice = localAdvice({ reason: 'wall' });
  assert.match(advice, /边界/);
});

test('calls an OpenAI-compatible endpoint and returns its advice', async () => {
  const provider = await startMockProvider((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: '贴着对手头部外侧绕行，利用冲刺切到它的转弯内侧。' } }],
    }));
  });

  try {
    const env = {
      LLM_BASE_URL: provider.baseUrl,
      LLM_MODEL: 'mock-strategist',
      LLM_API_KEY: 'test-secret',
      LLM_TIMEOUT_MS: '3000',
    };
    const result = await requestAdvice(
      { reason: 'body', killer: '霓虹鳐', score: 31, length: 33, rank: 3, age: 22 },
      { env },
    );

    assert.equal(result.mode, 'llm');
    assert.equal(result.model, 'mock-strategist');
    assert.match(result.advice, /转弯内侧/);
    assert.equal(provider.requests.length, 1);
    assert.equal(provider.requests[0].url, '/v1/chat/completions');
    assert.equal(provider.requests[0].headers.authorization, 'Bearer test-secret');
    assert.equal(provider.requests[0].body.model, 'mock-strategist');
    assert.equal(provider.requests[0].body.messages[0].role, 'system');

    const status = publicStatus(env);
    assert.equal(status.configured, true);
    assert.equal(status.mode, 'llm');
    assert.equal(status.endpoint, provider.baseUrl.split('/').slice(0, 3).join('/').replace('http://', ''));
  } finally {
    await provider.close();
  }
});

test('falls back to local advice when the model provider fails', async () => {
  const provider = await startMockProvider((req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  });

  try {
    const result = await requestAdvice(
      { reason: 'wall', score: 90, length: 45, rank: 2, age: 30 },
      {
        env: {
          LLM_BASE_URL: provider.baseUrl,
          LLM_MODEL: 'mock-strategist',
          LLM_TIMEOUT_MS: '2000',
        },
      },
    );

    assert.equal(result.mode, 'local');
    assert.equal(result.fallbackReason, 'http-503');
    assert.ok(result.advice.length > 10);
  } finally {
    await provider.close();
  }
});
