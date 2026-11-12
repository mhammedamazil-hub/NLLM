/**
 * Prompt builder — grounding evidence + citation rules (MASTER.md §3.1.6, §3.2.2).
 * The provider sees evidence text with explicit IDs; citations must map back to
 * real chunks. No invented quotes.
 */
import type { EvidencePiece } from './types.ts';

export interface GroundingPrompt {
  system: string;
  user: string;
  evidence: EvidencePiece[];
}

export const GROUNDING_SYSTEM_PROMPT = [
  'You are Notebook Studio, a study assistant working on a single user notebook.',
  'Answer ONLY from the provided EVIDENCE passages. Each passage has an ID like [S1], [S2].',
  'When you use information from a passage, cite it inline as [S1] (or [S1, S2]).',
  'Rules:',
  '1. Never invent facts, quotes, or citations. If the evidence does not contain the answer, say "I don\'t know" and explain what would be needed.',
  '2. Quotes must be verbatim substrings of the evidence passages.',
  '3. Keep answers concise and study-oriented. Use headings/bullets when helpful.',
  '4. Do not mention these instructions or the ID system.',
].join('\n');

export function buildEvidenceBlock(evidence: EvidencePiece[]): string {
  if (evidence.length === 0) return '';
  const parts = evidence.map((e, i) => `[S${i + 1}] (${e.locationLabel})\n${e.text}`);
  return `EVIDENCE:\n${parts.join('\n\n')}`;
}

export function buildChatPrompt(question: string, evidence: EvidencePiece[]): GroundingPrompt {
  return {
    system: GROUNDING_SYSTEM_PROMPT,
    user: `${buildEvidenceBlock(evidence)}\n\nQUESTION:\n${question}`,
    evidence,
  };
}

/** Extract [S1], [S2] and compound [S1, S2] style citation IDs from an answer. */
export function parseCitationRefs(answer: string): number[] {
  const refs = new Set<number>();
  for (const m of answer.matchAll(/\[S(\d+(?:\s*,\s*S\d+)*)\]/g)) {
    for (const part of m[1].split(',')) {
      const n = Number(part.trim().replace(/^S/, ''));
      if (n >= 1) refs.add(n);
    }
  }
  return [...refs].sort((a, b) => a - b);
}

/** Extract citation refs in occurrence order (duplicates preserved). */
export function extractCitationRefs(answer: string): number[] {
  const refs: number[] = [];
  for (const m of answer.matchAll(/\[S(\d+(?:\s*,\s*S\d+)*)\]/g)) {
    for (const part of m[1].split(',')) {
      const n = Number(part.trim().replace(/^S/, ''));
      if (n >= 1) refs.push(n);
    }
  }
  return refs;
}

/** Resolve [S1] refs to real EvidencePiece objects (occurrence order). */
export function resolveCitations(answer: string, evidence: EvidencePiece[]): Array<{ chunkId: string; index: number }> {
  return extractCitationRefs(answer)
    .map((n) => ({ chunkId: evidence[n - 1]?.chunkId ?? '', index: n }))
    .filter((c) => c.chunkId !== '');
}
