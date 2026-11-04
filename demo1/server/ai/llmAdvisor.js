'use strict';

const DEFAULT_TIMEOUT_MS = 9000;
const MAX_ADVICE_LENGTH = 180;

function clampInt(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>{}[\]\\`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeContext(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    reason: source.reason === 'wall' ? 'wall' : 'body',
    score: clampInt(source.score, 0, 1_000_000, 0),
    length: clampInt(source.length, 0, 10_000, 0),
    rank: clampInt(source.rank, 1, 999, 0),
    age: clampInt(source.age, 0, 86_400, 0),
    killerName: cleanText(source.killer ?? source.killerName, 24),
  };
}

function getConfig(env = process.env) {
  const baseUrl = String(env.LLM_BASE_URL || env.OPENAI_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(env.LLM_API_KEY || env.OPENAI_API_KEY || '').trim();
  const model = String(env.LLM_MODEL || env.OPENAI_MODEL || '').trim();
  const timeoutMs = clampInt(env.LLM_TIMEOUT_MS, 2000, 30_000, DEFAULT_TIMEOUT_MS);
  let endpointHost = '';

  try {
    endpointHost = baseUrl ? new URL(baseUrl).host : '';
  } catch {
    endpointHost = '';
  }

  return {
    configured: Boolean(baseUrl && model),
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    endpointHost,
  };
}

function publicStatus(env = process.env) {
  const config = getConfig(env);
  return {
    configured: config.configured,
    mode: config.configured ? 'llm' : 'local',
    provider: 'openai-compatible',
    model: config.model || null,
    endpoint: config.endpointHost || null,
  };
}

function buildEndpoint(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(trimmed)
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function buildMessages(context) {
  return [
    {
      role: 'system',
      content: [
        '你是《蛇环 SERPENT ORBIT》竞技场的战术教练。',
        '根据玩家本局的死亡数据，用中文给出一条具体、可执行的改进建议。',
        '要求：不超过80个汉字，不使用Markdown、列表、引号或任何前缀，不要提及自己是AI。',
      ].join(''),
    },
    {
      role: 'user',
      content: [
        `玩家本局数据：得分 ${context.score}，最终长度 ${context.length} 米，`,
        `最高排名 ${context.rank || '未知'}，存活 ${context.age} 秒，`,
        `死亡原因：${context.reason === 'wall' ? '撞上环域边界' : `撞上对手${context.killerName ? `「${context.killerName}」` : ''}的身体`}。`,
        '请给出下一条命最该修正的一个动作。',
      ].join(''),
    },
  ];
}

function localAdvice(rawContext) {
  const context = normalizeContext(rawContext);

  if (context.reason === 'wall') {
    return '把边界当成武器，而不是墙：靠近外圈时提前半秒转向，绕出一个大弧线，让追你的蛇收不住速度。';
  }

  if (context.killerName) {
    return `别正面追「${context.killerName}」的尾巴。贴着它的头部外侧并行，等它转向时从内侧切过去，把身体横在它前方。`;
  }

  return '先沿着食物密集区扩大体型，再切到对手的转弯内侧；你有冲刺时，才把身体横到对方头部前方。';
}

function extractAdvice(payload) {
  let content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content.map((part) => part?.text || part?.content || '').join('');
  }
  if (!content && typeof payload?.response === 'string') content = payload.response;
  if (typeof content !== 'string') return '';

  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^建议[：:]\s*/, '')
    .replace(/^["“]|["”]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ADVICE_LENGTH);
}

async function requestAdvice(rawContext, options = {}) {
  const context = normalizeContext(rawContext);
  const config = getConfig(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const startedAt = Date.now();

  if (!config.configured) {
    return {
      ok: true,
      mode: 'local',
      provider: 'local',
      advice: localAdvice(context),
      model: null,
      latencyMs: 0,
      fallbackReason: 'not-configured',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const response = await fetchImpl(buildEndpoint(config.baseUrl), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(context),
        temperature: 0.65,
        max_tokens: 180,
        stream: false,
      }),
    });

    const rawBody = await response.text();
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const fallbackReason = response.status === 429 ? 'rate-limited' : `http-${response.status}`;
      throw Object.assign(new Error(`LLM provider returned ${response.status}`), { fallbackReason });
    }

    const advice = extractAdvice(payload);
    if (!advice) {
      throw Object.assign(new Error('LLM provider returned an empty response'), {
        fallbackReason: 'empty-response',
      });
    }

    return {
      ok: true,
      mode: 'llm',
      provider: 'openai-compatible',
      advice,
      model: config.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const fallbackReason = error?.name === 'AbortError'
      ? 'timeout'
      : (error?.fallbackReason || 'provider-error');
    console.warn(`[ai] provider call failed (${fallbackReason}); using local advice.`);
    return {
      ok: true,
      mode: 'local',
      provider: 'local',
      advice: localAdvice(context),
      model: config.model,
      latencyMs: Date.now() - startedAt,
      fallbackReason,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getConfig,
  publicStatus,
  normalizeContext,
  localAdvice,
  requestAdvice,
};
