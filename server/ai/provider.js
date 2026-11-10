import { HttpError } from '../validation.js';

export function resolveAIConfig(options = {}) {
  const provider =
    options.provider ||
    process.env.AI_PROVIDER ||
    (process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'gemini');
  if (!['gemini', 'openai'].includes(provider))
    throw new HttpError(503, 'AI_PROVIDER must be gemini or openai.');
  const apiKey = (
    options.apiKey ??
    (provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) ??
    ''
  ).trim();
  const model = (
    options.model ??
    (provider === 'gemini'
      ? process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
      : process.env.OPENAI_MODEL) ??
    ''
  ).trim();
  return { provider, apiKey, model, configured: Boolean(apiKey && model) };
}

export function publicAIStatus(options) {
  const config = resolveAIConfig(options);
  return {
    provider: config.provider,
    model: config.model,
    configured: config.configured,
    mode: config.configured ? 'LIVE_AI' : 'LOCAL_DEMO',
  };
}

export async function requestCompletion(
  config,
  messages,
  tools,
  { fetchImpl = globalThis.fetch } = {},
) {
  const gemini = config.provider === 'gemini';
  const endpoint = gemini
    ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const declarations = gemini
    ? tools.map(({ type, function: fn }) => ({
        type,
        function: {
          name: fn.name,
          description: fn.description,
          parameters: {
            type: fn.parameters.type,
            properties: fn.parameters.properties,
            required: fn.parameters.required,
          },
        },
      }))
    : tools;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: declarations,
        ...(gemini ? { max_tokens: 4096 } : { max_completion_tokens: 1200 }),
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new HttpError(
      503,
      error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'AI request timed out. Try a shorter question.'
        : 'Could not reach the AI provider. Check your internet connection and server environment.',
    );
  }
  if (!response.ok) {
    // Do not expose provider response bodies, authorization values or prompts.
    if (response.status === 429)
      throw new HttpError(
        429,
        `${config.provider} quota/rate limit reached. Check your free-tier limits in AI Studio and retry later. No paid-provider fallback was attempted.`,
      );
    if (response.status === 401 || response.status === 403)
      throw new HttpError(
        502,
        `${config.provider} rejected the API key or project access. Check the server key, project eligibility and regional availability.`,
      );
    if (response.status === 404)
      throw new HttpError(
        502,
        `${config.provider} model '${config.model}' is unavailable for this project. Choose an accessible free-tier model in GEMINI_MODEL.`,
      );
    throw new HttpError(
      502,
      `${config.provider} request failed (${response.status}). Try again later.`,
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new HttpError(502, 'AI provider returned unreadable JSON.');
  }
  const message = body.choices?.[0]?.message;
  if (!message) throw new HttpError(502, 'AI provider returned an invalid response.');
  if (!message.tool_calls?.length && !message.content?.trim())
    throw new HttpError(
      502,
      'AI returned an empty answer. Try a shorter question or a different supported model.',
    );
  return message;
}
