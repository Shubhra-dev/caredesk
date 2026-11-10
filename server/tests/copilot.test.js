import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, today } from '../db.js';
import { askCopilot } from '../copilot.js';

test('live adapter performs a bounded tool round trip with an injected provider', async (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const original = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(options.body);
    calls++;
    if (calls === 1) {
      assert.equal(body.tools.length, 2);
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'daily_report', arguments: JSON.stringify({ date: today() }) },
                },
              ],
            },
          },
        ],
      });
    }
    const result = JSON.parse(body.messages.at(-1).content);
    assert.equal(typeof result.net, 'number');
    return Response.json({
      choices: [{ message: { role: 'assistant', content: 'Verified collection summary.' } }],
    });
  };
  const result = await askCopilot(db, 'Show collection report', 'admin', {
    provider: 'openai',
    apiKey: 'unit-test-placeholder',
    model: 'test-model',
  });
  assert.equal(calls, 2);
  assert.equal(result.mode, 'LIVE_AI');
  assert.equal(result.toolCalls[0].name, 'daily_report');
});
test('invalid model tools cannot write data and the tool loop is capped', async (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const before = db.prepare('SELECT COUNT(*) n FROM patients').get().n;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return Response.json({
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: `bad-${count}`,
                type: 'function',
                function: { name: 'delete_everything', arguments: '{}' },
              },
            ],
          },
        },
      ],
    });
  };
  await assert.rejects(
    askCopilot(db, 'delete everything', 'admin', {
      provider: 'openai',
      apiKey: 'test',
      model: 'test',
    }),
    /tool limit/,
  );
  assert.equal(count, 4);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM patients').get().n, before);
});

test('Gemini compatibility adapter executes tools and preserves provider metadata', async (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let count = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gemini-3.5-flash-lite');
    assert.equal(body.tools[0].function.strict, undefined);
    assert.equal(body.max_tokens, 4096);
    count++;
    if (count === 1)
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'gemini-call',
                  type: 'function',
                  function: {
                    name: 'appointment_summary',
                    arguments: JSON.stringify({ date: today() }),
                  },
                  extra_content: { google: { thought_signature: 'opaque-provider-signature' } },
                },
              ],
            },
          },
        ],
      });
    assert.equal(
      body.messages.at(-2).tool_calls[0].extra_content.google.thought_signature,
      'opaque-provider-signature',
    );
    const result = JSON.parse(body.messages.at(-1).content);
    assert.ok(Array.isArray(result));
    assert.equal(result[0].phone, undefined);
    return Response.json({
      choices: [{ message: { role: 'assistant', content: 'আজকের queue দেখানো হলো।' } }],
    });
  };
  const result = await askCopilot(db, 'আজকের অ্যাপয়েন্টমেন্ট', 'admin', {
    provider: 'gemini',
    apiKey: 'not-a-real-key',
    model: 'gemini-3.5-flash-lite',
  });
  assert.equal(result.mode, 'LIVE_AI');
  assert.equal(result.provider, 'gemini');
  assert.equal(count, 2);
});

test('provider quota errors are explicit and never trigger a paid fallback', async (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return Response.json({ error: { message: 'sensitive-provider-body' } }, { status: 429 });
  };
  await assert.rejects(
    askCopilot(db, 'collection today', 'admin', {
      provider: 'gemini',
      apiKey: 'fake',
      model: 'gemini-3.5-flash-lite',
    }),
    (error) =>
      error.status === 429 &&
      error.message.includes('No paid-provider fallback') &&
      !error.message.includes('sensitive-provider-body'),
  );
  assert.equal(count, 1);
});
