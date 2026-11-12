/**
 * Gemini adapter — official generativelanguage API, streaming via SSE.
 */
import type { GenerateOptions, GenerateResult, ModelProvider } from './types.ts';
import { readSSE, mapHttpError } from './sse.ts';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export class GeminiProvider implements ModelProvider {
  kind = 'gemini' as const;
  defaultBaseUrl = GEMINI_BASE_URL;

  async generate(apiKey: string, model: string, options: GenerateOptions): Promise<GenerateResult> {
    const base = (options.baseUrl || GEMINI_BASE_URL).replace(/\/+$/, '');
    const contents = [{ role: 'user', parts: [{ text: options.system ? `${options.system}\n\n${options.prompt}` : options.prompt }] }];
    const body: Record<string, unknown> = { contents };
    if (options.system) body.systemInstruction = { parts: [{ text: options.system }] };
    if (options.jsonSchema) {
      body.generationConfig = { responseMimeType: 'application/json', responseSchema: options.jsonSchema };
    }

    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw mapHttpError(response.status, await response.text().catch(() => ''));
    }

    let text = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    await readSSE(response, {
      signal: options.signal,
      onEvent: (_event, data) => {
        try {
          const json = JSON.parse(data) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };
          const parts = json.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) {
            if (p.text) {
              text += p.text;
              options.onDelta?.(p.text);
            }
          }
          if (json.usageMetadata) {
            inputTokens = json.usageMetadata.promptTokenCount;
            outputTokens = json.usageMetadata.candidatesTokenCount;
          }
        } catch {
          // Ignore non-JSON events.
        }
      },
    });
    const usage = inputTokens !== undefined || outputTokens !== undefined
      ? { inputTokens, outputTokens }
      : undefined;
    return { text, model, usage };
  }
}
