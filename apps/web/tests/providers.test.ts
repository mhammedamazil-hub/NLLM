import { describe, expect, it, vi, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '../src/core/providers/openai.ts';
import { GeminiProvider } from '../src/core/providers/gemini.ts';
import { AnthropicProvider } from '../src/core/providers/anthropic.ts';
import { buildChatPrompt, parseCitationRefs, resolveCitations } from '../src/core/providers/grounding.ts';
import { encryptSecret, decryptSecret, canDecrypt } from '../src/core/providers/keyvault.ts';

/**
 * Build an SSE response from event blocks. Each block is an array of lines
 * (e.g. ['event: ping', 'data: {...}']); blocks are separated by blank lines,
 * matching the real SSE wire format.
 */
function sseResponse(blocks: string[][], status = 200): Response {
  const body = blocks.map((lines) => lines.join('\n')).join('\n\n') + '\n\n';
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAI-compatible adapter', () => {
  it('streams chat completions and reports usage', async () => {
    const provider = new OpenAICompatibleProvider();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      ['data: {"choices":[{"delta":{"content":"Hello "}}]}'],
      ['data: {"choices":[{"delta":{"content":"world"}}]}'],
      ['data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":11,"completion_tokens":22}}'],
      ['data: [DONE]'],
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.generate('key', 'gpt-4o-mini', {
      baseUrl: 'https://api.openai.com/v1',
      system: 'You are a tutor.',
      prompt: 'Say hi.',
      onDelta: () => {},
    });
    expect(result.text).toBe('Hello world');
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key' });
  });

  it('maps 401 to an actionable error', async () => {
    const provider = new OpenAICompatibleProvider();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 }),
    ));
    await expect(provider.generate('bad', 'gpt-4o-mini', { baseUrl: 'https://x/v1', prompt: 'hi' }))
      .rejects.toThrow(/API key/i);
  });

  it('maps 429 to a quota error', async () => {
    const provider = new OpenAICompatibleProvider();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"rate limited"}}', { status: 429 }),
    ));
    await expect(provider.generate('k', 'm', { baseUrl: 'https://x/v1', prompt: 'hi' }))
      .rejects.toThrow(/rate limit|quota/i);
  });

  it('sends response_format for structured output', async () => {
    const provider = new OpenAICompatibleProvider();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([['data: [DONE]']]));
    vi.stubGlobal('fetch', fetchMock);
    await provider.generate('k', 'm', {
      baseUrl: 'https://x/v1', prompt: 'p',
      jsonSchema: { type: 'object', properties: { a: { type: 'string' } } },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { response_format?: unknown };
    expect(body.response_format).toBeDefined();
    expect(body.response_format).toMatchObject({ type: 'json_schema' });
  });
});

describe('Gemini adapter', () => {
  it('streams generateContent with alt=sse and extracts text', async () => {
    const provider = new GeminiProvider();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      ['data: {"candidates":[{"content":{"parts":[{"text":"Gem "}]}}]}'],
      ['data: {"candidates":[{"content":{"parts":[{"text":"ini"}]}}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":18}}'],
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const result = await provider.generate('gkey', 'gemini-2.5-flash', {
      baseUrl: 'https://generativelanguage.googleapis.com',
      system: 'sys', prompt: 'q',
    });
    expect(result.text).toBe('Gem ini');
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 18 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('streamGenerateContent');
    expect(url).toContain('alt=sse');
    expect(url).toContain('key=gkey');
  });
});

describe('Anthropic adapter', () => {
  it('streams messages and handles content_block_delta events', async () => {
    const provider = new AnthropicProvider();
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      ['event: content_block_delta', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Anth "}}'],
      ['event: content_block_delta', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ropic"}}'],
      ['event: message_stop', 'data: {"type":"message_stop","message":{"usage":{"input_tokens":3,"output_tokens":4}}}'],
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const result = await provider.generate('akey', 'claude-sonnet-4-5', {
      baseUrl: 'https://api.anthropic.com', prompt: 'q', system: 'sys',
    });
    expect(result.text).toBe('Anth ropic');
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('akey');
  });
});

describe('grounding helpers', () => {
  it('builds an evidence block with stable IDs', () => {
    const evidence = [
      { chunkId: 'c1', text: 'Photosynthesis uses light.', locationLabel: 'doc · page 1' },
      { chunkId: 'c2', text: 'It produces oxygen.', locationLabel: 'doc · page 2' },
    ];
    const prompt = buildChatPrompt('How does it work?', evidence);
    expect(prompt.user).toContain('[S1]');
    expect(prompt.user).toContain('[S2]');
    expect(prompt.user).toContain('QUESTION:');
  });

  it('parses and resolves citation refs', () => {
    const evidence = [
      { chunkId: 'c1', text: 'a', locationLabel: 'x' },
      { chunkId: 'c2', text: 'b', locationLabel: 'y' },
    ];
    const answer = 'Claim [S2] with detail [S1, S2].';
    const refs = parseCitationRefs(answer);
    expect(refs).toEqual([1, 2]);
    const resolved = resolveCitations(answer, evidence);
    expect(resolved.map((r) => r.chunkId)).toEqual(['c2', 'c1', 'c2']);
  });
});

describe('key vault', () => {
  it('encrypts and decrypts secrets with a passphrase', async () => {
    const blob = await encryptSecret('sk-secret123', 'passphrase-42');
    expect(blob).not.toContain('sk-secret123');
    const plain = await decryptSecret(blob, 'passphrase-42');
    expect(plain).toBe('sk-secret123');
  });

  it('fails closed with a wrong passphrase', async () => {
    const blob = await encryptSecret('sk-secret123', 'right');
    expect(await canDecrypt(blob, 'wrong')).toBe(false);
    expect(await canDecrypt(blob, 'right')).toBe(true);
  });

  it('uses random salts so identical secrets differ', async () => {
    const a = await encryptSecret('same', 'pw');
    const b = await encryptSecret('same', 'pw');
    expect(a).not.toBe(b);
  });
});
