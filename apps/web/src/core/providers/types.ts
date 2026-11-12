/**
 * Provider abstraction — one user-configured credential, direct client→provider.
 * No intermediary services, no silent fallback (ADR-004).
 */
import type { ProviderKind } from '../domain/types.ts';

export interface EvidencePiece {
  chunkId: string;
  text: string;
  locationLabel: string;
}

export interface GenerateOptions {
  /** Resolved provider base URL (from the user's profile). */
  baseUrl: string;
  prompt: string;
  system?: string;
  /** Grounding evidence included in the prompt. */
  evidence?: EvidencePiece[];
  /** Optional JSON-schema constraint for structured output. */
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export interface GenerateResult {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelProvider {
  kind: ProviderKind;
  defaultBaseUrl: string;
  generate(apiKey: string, model: string, options: GenerateOptions): Promise<GenerateResult>;
}

export class ProviderError extends Error {
  readonly status: number;
  readonly kind: 'network' | 'unauthorized' | 'quota' | 'unsupported' | 'server' | 'aborted';

  constructor(message: string, status: number, kind: ProviderError['kind']) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.kind = kind;
  }
}

export class AbortedGenerationError extends ProviderError {
  constructor(message = 'Generation aborted by user') {
    super(message, 0, 'aborted');
    this.name = 'AbortedGenerationError';
  }
}
