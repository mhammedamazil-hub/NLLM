/**
 * Minimal SSE (Server-Sent Events) reader shared by provider adapters.
 */
export interface SSEHandlers {
  onEvent: (event: string, data: string) => void;
  signal?: AbortSignal;
}

/** Read an SSE stream from a fetch Response and dispatch events. */
export async function readSSE(response: Response, handlers: SSEHandlers): Promise<void> {
  if (!response.body) throw new Error('Provider returned no response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (raw: string): void => {
    const lines = raw.split('\n');
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (data) handlers.onEvent(event, data);
  };

  while (true) {
    if (handlers.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim()) dispatch(part);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}

/** Read a non-streaming JSON response, mapping provider error statuses. */
export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw mapHttpError(response.status, body);
  }
  return response.json();
}

export function mapHttpError(status: number, body: string): Error {
  let message = `Provider request failed with status ${status}`;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const err = parsed.error ?? parsed;
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>;
      message = String(e.message ?? e.error ?? message);
    }
  } catch {
    if (body) message = body.slice(0, 300);
  }
  if (status === 401 || status === 403) {
    return new Error(`Provider rejected the API key (${message}). Check the key or provider account.`);
  }
  if (status === 429) {
    return new Error(`Provider rate limit or quota exceeded (${message}).`);
  }
  if (status === 400 || status === 404) {
    return new Error(`Provider rejected the request or model (${message}).`);
  }
  return new Error(message);
}
