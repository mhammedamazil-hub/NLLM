# ADR-004: Provider abstraction — direct client→provider, no fallback

**Status:** Accepted

## Context
Users configure their own API keys for OpenAI-compatible, Gemini, or
Anthropic endpoints. The app must never fabricate costs, log keys, or
silently fall back to a different provider when one fails.

## Decision
- `ModelProvider` interface: `generate(apiKey, model, options)`.
- Three adapters: OpenAI-compatible (`/chat/completions` SSE), Gemini
  (`streamGenerateContent?alt=sse&key=`), Anthropic (`/v1/messages` SSE).
- No intermediary services. The browser calls the provider directly.
- No silent fallback: a provider failure surfaces as a `ProviderError`
  with an actionable message (401 → API key, 429 → quota/rate limit).
- Keys encrypted at rest (PBKDF2 200k + AES-GCM); passphrase held in
  memory only; decrypted keys never logged or bundled.
- Usage records store only provider-reported token counts and cost
  (`costReported: number | null`). Costs are never fabricated.

## Consequences
- Users keep full control of their credentials and spending.
- Each provider adapter is independently testable (SSE parsing, usage
  mapping, error mapping).
- Provider-specific quirks (e.g. Anthropic's content_block_delta events)
  are contained in their adapter.
