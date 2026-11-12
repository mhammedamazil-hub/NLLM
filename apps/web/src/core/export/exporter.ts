/**
 * Export — notebook → portable artifact (Markdown bundle) and
 * import — bundle → sources + chunks. Local-first, no network.
 */
import type { Notebook, Source, Chunk } from '../domain/types.ts';
import { chunkText, normalizeText } from '../ingestion/text.ts';

export interface ExportBundle {
  schemaVersion: 1;
  exportedAt: string;
  notebook: {
    id: string;
    title: string;
    description: string;
    tags: string[];
  };
  sources: Array<{
    id: string;
    kind: Source['kind'];
    title: string;
    originalName: string;
    mimeType: string;
    sha256?: string;
    url?: string;
    retrievalDate?: string;
  }>;
  chunks: Array<{
    id: string;
    sourceId: string;
    ordIndex: number;
    text: string;
    location: Chunk['location'];
    extractionMethod: string;
  }>;
}

/** Serialize a notebook's sources + chunks into a portable bundle. */
export function exportNotebook(
  notebook: Notebook,
  sources: Source[],
  chunks: Chunk[],
): ExportBundle {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notebook: {
      id: notebook.id,
      title: notebook.title,
      description: notebook.description,
      tags: notebook.tags,
    },
    sources: sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      originalName: s.originalName,
      mimeType: s.mimeType,
      sha256: s.sha256,
      url: s.url,
      retrievalDate: s.retrievalDate,
    })),
    chunks: chunks
      .filter((c) => sources.some((s) => s.id === c.sourceId))
      .map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        ordIndex: c.ordIndex,
        text: c.text,
        location: c.location,
        extractionMethod: c.extractionMethod,
      })),
  };
}

/** Serialize a bundle to a JSON string for storage/transfer. */
export function serializeBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export interface ImportBundleResult {
  notebookTitle: string;
  notebookDescription: string;
  notebookTags: string[];
  /** (source, chunks) pairs for the import pipeline. */
  sources: Array<{
    id: string;
    kind: Source['kind'];
    title: string;
    originalName: string;
    mimeType: string;
    sha256?: string;
    url?: string;
    retrievalDate?: string;
  }>;
  chunksBySource: Map<string, Array<{ ordIndex: number; text: string; location: Chunk['location'] }>>;
}

/** Parse a bundle back into importable pieces. */
export function parseBundle(json: string): ImportBundleResult {
  const bundle = JSON.parse(json) as ExportBundle;
  if (bundle.schemaVersion !== 1) {
    throw new Error(`Unsupported bundle schema version: ${bundle.schemaVersion}`);
  }
  const chunksBySource = new Map<string, Array<{ ordIndex: number; text: string; location: Chunk['location'] }>>();
  for (const c of bundle.chunks) {
    const list = chunksBySource.get(c.sourceId) ?? [];
    list.push({ ordIndex: c.ordIndex, text: c.text, location: c.location });
    chunksBySource.set(c.sourceId, list);
  }
  return {
    notebookTitle: bundle.notebook.title,
    notebookDescription: bundle.notebook.description,
    notebookTags: bundle.notebook.tags,
    sources: bundle.sources,
    chunksBySource,
  };
}

/**
 * Rebuild a Markdown export of the notebook (notebook → .md file content).
 * Includes source sections with provenance labels.
 */
export function notebookToMarkdown(
  notebook: Notebook,
  sources: Source[],
  chunks: Chunk[],
): string {
  const parts: string[] = [];
  parts.push(`# ${notebook.title}`);
  if (notebook.description) parts.push(`\n${notebook.description}`);
  if (notebook.tags.length > 0) parts.push(`\n**Tags:** ${notebook.tags.join(', ')}`);

  for (const source of sources) {
    parts.push(`\n---\n\n## ${source.title}`);
    if (source.url) parts.push(`*Source:* ${source.url}`);
    const sourceChunks = chunks
      .filter((c) => c.sourceId === source.id)
      .sort((a, b) => a.ordIndex - b.ordIndex);
    for (const c of sourceChunks) {
      const heading = c.location.heading ? `### ${c.location.heading}` : null;
      parts.push(`${heading ? `${heading}\n\n` : ''}${c.text}`);
    }
  }
  return parts.join('\n');
}

/**
 * Re-chunk imported text (used when importing a plain text bundle that
 * carries raw text rather than pre-chunked pieces).
 */
export function rechunkText(text: string, target = 800, overlap = 120): Array<{ text: string; heading?: string; page?: number }> {
  return chunkText(normalizeText(text), { targetChars: target, overlapChars: overlap });
}
