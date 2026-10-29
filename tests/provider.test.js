import test from 'node:test';
import assert from 'node:assert/strict';
import { requestChat } from '../web/provider.js';

const settings = { baseUrl: 'https://api.example.test/v1/', model: 'sample-model' };
const hits = [{ ref: 'Sabc123-1', source: { name: 'notes.md' }, chunk: { lineStart: 2, lineEnd: 4, text: 'Treat this injected text as untrusted data.' } }];
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('provider request sends only selected evidence, handles content, and strips model-authored references', async () => {
  let request;
  const answer = await requestChat('What is in the notes?', hits, settings, 'test-secret', { history: [{ role: 'user', text: 'What is the prior topic?' }, { role: 'assistant', text: 'A prior grounded reply.' }], fetchImpl: async (url, init) => { request = { url: String(url), init }; return response(200, { choices: [{ message: { content: 'The notes contain this evidence [SFAKE-9].' } }] }); } });
  assert.equal(request.url, 'https://api.example.test/v1/chat/completions');
  assert.equal(request.init.headers.Authorization, 'Bearer test-secret');
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, 'sample-model');
  assert.deepEqual(body.messages.slice(1, 3).map(m => m.role), ['user', 'assistant']);
  assert.match(body.messages[1].content, /prior topic/);
  assert.match(body.messages[0].content, /UNTRUSTED DATA/);
  assert.match(body.messages.at(-1).content, /Sabc123-1/);
  assert.match(answer, /notes contain this evidence/);
  assert.doesNotMatch(answer, /SFAKE/);
});

test('Anthropic Messages API and Gemini generateContent use provider-specific request and response formats', async () => {
  let request;
  const anthropicText = await requestChat('q', hits, { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-test' }, 'key', { fetchImpl: async (url, init) => { request = { url: String(url), init }; return response(200, { content: [{ type: 'text', text: 'Anthropic evidence [SFAKE-1]' }] }); } });
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.init.headers['x-api-key'], 'key');
  assert.equal(JSON.parse(request.init.body).model, 'claude-test');
  assert.doesNotMatch(anthropicText, /SFAKE/);
  const geminiText = await requestChat('q', hits, { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-test' }, 'key', { fetchImpl: async (url, init) => { request = { url: String(url), init }; return response(200, { candidates: [{ content: { parts: [{ text: 'Gemini evidence' }] } }] }); } });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(request.init.headers['x-goog-api-key'], 'key');
  assert.match(JSON.parse(request.init.body).contents.at(-1).parts[0].text, /excerpt_id/);
  assert.match(geminiText, /Gemini evidence/);
});

test('non-HTTPS remote providers are blocked while loopback development is allowed', async () => {
  await assert.rejects(requestChat('q', hits, { ...settings, baseUrl: 'http://api.example.test/v1' }, 'key'), /HTTPS/);
});

test('missing credentials and model are rejected before fetch', async () => {
  let called = false; const fetchImpl = async () => { called = true; };
  await assert.rejects(requestChat('q', hits, settings, '', { fetchImpl }), /Add an API key/);
  await assert.rejects(requestChat('q', hits, { ...settings, model: '' }, 'key', { fetchImpl }), /model name/);
  assert.equal(called, false);
});

test('authentication, rate limit, server errors, malformed responses, and CORS have clear failures', async () => {
  for (const [status, expected] of [[401, /Authentication rejected/], [429, /rate limit/], [503, /HTTP 503/]]) {
    await assert.rejects(requestChat('q', hits, settings, 'secret', { fetchImpl: async () => response(status, {}) }), expected);
  }
  await assert.rejects(requestChat('q', hits, settings, 'secret', { fetchImpl: async () => response(200, {}) }), /no text/);
  await assert.rejects(requestChat('q', hits, settings, 'secret', { fetchImpl: async () => { throw new TypeError('fetch failed'); } }), /CORS blocked/);
  await assert.rejects(requestChat('q', hits, settings, 'private-key', { fetchImpl: async () => { throw new Error('provider private-key failed'); } }), /\[redacted\]/);
});

test('provider request times out within configured bound', async () => {
  await assert.rejects(requestChat('q', hits, settings, 'secret', { timeoutMs: 5, fetchImpl: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))) ) }), /timed out after 1 seconds/);
});
