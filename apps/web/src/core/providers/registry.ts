/**
 * Provider registry — maps provider kind to its adapter.
 */
import type { ModelProvider } from './types.ts';
import type { ProviderKind } from '../domain/types.ts';
import { OpenAICompatibleProvider } from './openai.ts';
import { GeminiProvider } from './gemini.ts';
import { AnthropicProvider } from './anthropic.ts';

const REGISTRY: Record<ProviderKind, () => ModelProvider> = {
  openai: () => new OpenAICompatibleProvider(),
  gemini: () => new GeminiProvider(),
  anthropic: () => new AnthropicProvider(),
};

export const SUPPORTED_PROVIDERS: ProviderKind[] = ['openai', 'gemini', 'anthropic'];

export function providerFor(kind: ProviderKind): ModelProvider {
  const factory = REGISTRY[kind];
  if (!factory) throw new Error(`Unknown provider kind: ${kind}`);
  return factory();
}
