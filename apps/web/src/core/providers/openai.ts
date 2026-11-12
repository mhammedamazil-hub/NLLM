/**
 * OpenAI-compatible chat completions adapter (streaming via SSE).
 * Covers OpenAI, Groq, OpenRouter, local vLLM/Ollama/LM Studio via base URL.
 */
import type { GenerateOptions, GenerateResult, ModelProvider } from './types.ts';
import { readSSE, mapHttpError } from './sse.ts';

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export class OpenAICompatibleProvider implements ModelProvider {
  kind = 'openai' as const;
  defaultBaseUrl = OPENAI_DEFAULT_BASE_URL;

  async generate(apiKey: string, model: string, options: GenerateOptions): Promise<GenerateResult> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options.system) messages.push({ role: 'system', content: options.system });
    messages.push({ role: 'user', content: options.prompt });

    const body: Record<string, unknown> = { model, messages, stream: true };
    if (options.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'artifact', schema: options.jsonSchema },
      };
    }

    const base = (options.baseUrl || OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw mapHttpError(response.status, await response.text().catch(() => ''));
    }

    let text = '';
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    await readSSE(response, {
      signal: options.signal,
      onEvent: (_event, data) => {
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            options.onDelta?.(delta);
          }
          if (json.usage) {
            usage = {
              inputTokens: json.usage.prompt_tokens,
              outputTokens: json.usage.completion_tokens,
            };
          }
        } catch {
          // Ignore keep-alive/non-JSON events.
        }
      },
    });
    return { text, model, usage };
  }
}
