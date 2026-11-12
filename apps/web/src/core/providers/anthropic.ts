/**
 * Anthropic Messages API adapter (streaming via SSE).
 */
import type { GenerateOptions, GenerateResult, ModelProvider } from './types.ts';
import { readSSE, mapHttpError } from './sse.ts';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export class AnthropicProvider implements ModelProvider {
  kind = 'anthropic' as const;
  defaultBaseUrl = ANTHROPIC_BASE_URL;

  async generate(apiKey: string, model: string, options: GenerateOptions): Promise<GenerateResult> {
    const base = (options.baseUrl || ANTHROPIC_BASE_URL).replace(/\/+$/, '');
    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      stream: true,
      messages: [{ role: 'user', content: options.prompt }],
    };
    if (options.system) body.system = options.system;

    const response = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw mapHttpError(response.status, await response.text().catch(() => ''));
    }

    let text = '';
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    await readSSE(response, {
      signal: options.signal,
      onEvent: (event, data) => {
        try {
          const json = JSON.parse(data) as {
            type?: string;
            delta?: { type?: string; text?: string };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          };
          if (event === 'content_block_delta' && json.delta?.text) {
            text += json.delta.text;
            options.onDelta?.(json.delta.text);
          }
          if (json.message?.usage) {
            usage = {
              inputTokens: json.message.usage.input_tokens,
              outputTokens: json.message.usage.output_tokens,
            };
          }
        } catch {
          // Ignore non-JSON events.
        }
      },
    });
    return { text, model, usage };
  }
}
