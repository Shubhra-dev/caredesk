// Checks configuration/model visibility only; does not make a generation call.
import { resolveAIConfig } from '../server/ai/provider.js';
const config = resolveAIConfig();
if (!config.configured) {
  console.error(
    'Missing API key/model. Put GEMINI_API_KEY in .env and restart. Never paste the key into chat.',
  );
  process.exitCode = 1;
} else if (config.provider !== 'gemini') {
  console.log(
    `Configured provider: ${config.provider}, model: ${config.model}. Use the Copilot page to test this provider.`,
  );
} else {
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      { headers: { 'x-goog-api-key': config.apiKey }, signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok)
      throw new Error(
        `Model-list request returned HTTP ${response.status}. Check key/project access and quota.`,
      );
    const body = await response.json();
    const names = (body.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
    console.log(
      `Provider: gemini\nConfigured model: ${config.model}\nModel listed: ${names.includes(config.model) ? 'yes' : 'NO'}`,
    );
    console.log(
      'Available Flash models (visibility does NOT prove free-tier quota):\n' +
        names
          .filter((n) => n.includes('flash'))
          .slice(0, 20)
          .join('\n'),
    );
    console.log(
      'Check pricing and project free-tier limits in AI Studio before generating. No generation request was sent.',
    );
    if (!names.includes(config.model)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
