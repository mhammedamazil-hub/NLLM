/**
 * Artifact generation — builds artifact models from notebook evidence via
 * the provider abstraction, then validates locally. No provider, no
 * generation; falls back to a plain-text model when validation fails.
 */
import type { ArtifactKind, ArtifactModel, ID } from '../domain/types.ts';
import type { ModelProvider } from '../providers/types.ts';
import { jsonSchemaFor, validateArtifactModel } from './schemas.ts';

export interface GenerateArtifactInput {
  notebookId: ID;
  kind: ArtifactKind;
  title: string;
  /** Evidence chunks (text + provenance) grounding the generation. */
  evidence: Array<{ chunkId: ID; text: string; location: { label: string } }>;
  provider: ModelProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface GenerateArtifactResult {
  model: ArtifactModel;
  /** True when the provider output validated against the kind's schema. */
  valid: boolean;
  /** Provider-reported usage (tokens), when available. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Prompt for artifact generation (grounded in evidence, structured output). */
function buildGenerationPrompt(kind: ArtifactKind, title: string, evidence: GenerateArtifactInput['evidence']): string {
  const ev = evidence
    .map((e, i) => `[S${i + 1}] (${e.location.label})\n${e.text}`)
    .join('\n\n');
  return [
    `Create a ${kind} artifact titled "${title}" for the notebook.`,
    '',
    'EVIDENCE (ground your work strictly in these passages):',
    ev,
    '',
    'Rules:',
    '- Use only facts from the evidence. Do not invent.',
    '- Follow the requested structure exactly.',
  ].join('\n');
}

export async function generateArtifactModel(input: GenerateArtifactInput): Promise<GenerateArtifactResult> {
  const schema = jsonSchemaFor(input.kind);
  const result = await input.provider.generate(
    input.apiKey,
    input.model,
    {
      baseUrl: input.baseUrl,
      system: [
        'You are Notebook Studio, a study assistant.',
        'Create the requested artifact from the provided evidence only.',
        'Never invent facts. Cite evidence inline as [S1] when useful.',
      ].join('\n'),
      prompt: buildGenerationPrompt(input.kind, input.title, input.evidence),
      jsonSchema: schema,
    },
  );

  // Try to parse the model from the provider response (JSON text).
  let model: ArtifactModel;
  try {
    model = JSON.parse(result.text) as ArtifactModel;
  } catch {
    // Fallback: wrap the raw text in a minimal model so renderers still work.
    model = { sections: [{ heading: input.title, body: result.text }] };
  }

  const valid = validateArtifactModel(input.kind, model);
  return { model, valid, usage: result.usage };
}
