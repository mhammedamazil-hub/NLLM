/**
 * Source import pipeline: file → source → chunks → FTS index.
 * Local only; no server-side extraction (MASTER.md §2.1.6).
 */
import type { Repository } from '../storage/repository.ts';
import type { Source } from '../domain/types.ts';
import { parserFor, isSupported } from './files.ts';
import { chunkText, locationLabel, normalizeText, sha256Hex } from './text.ts';

export interface ImportOptions {
  /** Preserve the original file bytes on disk (user choice). */
  preserveOriginal?: boolean;
  /** Custom chunking sizes. */
  targetChars?: number;
  overlapChars?: number;
}

export interface ImportProgress {
  source: Source;
  phase: 'extracting' | 'chunking' | 'indexing' | 'done' | 'error';
  message?: string;
}

export class UnsupportedFileError extends Error {}
export class DuplicateFileError extends Error {}

/** Check whether a file with this sha256 already exists in the notebook. */
export function isDuplicate(repo: Repository, notebookId: string, sha256: string): boolean {
  const rows = repo.listSources(notebookId);
  return rows.some((s) => s.sha256 === sha256);
}

/**
 * Import one file into a notebook. Throws UnsupportedFileError for unknown
 * formats and DuplicateFileError when the content hash already exists.
 */
export async function importSource(
  repo: Repository,
  notebookId: string,
  file: File | { name: string; arrayBuffer(): Promise<ArrayBuffer> },
  options: ImportOptions = {},
  onProgress?: (p: ImportProgress) => void,
): Promise<Source> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = (file as File).type ?? guessMimeType(file.name);
  if (!isSupported(file.name, mimeType)) {
    throw new UnsupportedFileError(`Unsupported file type: ${file.name}`);
  }

  const sha256 = await sha256Hex(bytes);
  if (isDuplicate(repo, notebookId, sha256)) {
    throw new DuplicateFileError(`Duplicate file: ${file.name} (same content as an existing source)`);
  }

  const source = repo.createSource({
    notebookId,
    kind: 'file',
    title: file.name.replace(/\.[^.]+$/, ''),
    originalName: file.name,
    mimeType,
    sha256,
    preserveOriginal: options.preserveOriginal ?? false,
  });
  onProgress?.({ source, phase: 'extracting' });

  try {
    const parser = parserFor(file.name, mimeType);
    if (!parser) throw new UnsupportedFileError(file.name);
    const { text: rawText, warnings } = await parser.extract(file.name, bytes);
    const normalized = normalizeText(rawText);
    if (!normalized) {
      repo.setSourceStatus(source.id, 'error', 'No extractable text found.');
      onProgress?.({ source: repo.getSource(source.id)!, phase: 'error', message: 'No extractable text.' });
      return repo.getSource(source.id)!;
    }

    const pieces = chunkText(normalized, {
      targetChars: options.targetChars,
      overlapChars: options.overlapChars,
    });
    onProgress?.({
      source: repo.getSource(source.id)!,
      phase: 'chunking',
      message: `${pieces.length} chunks`,
    });

    let inserted = 0;
    for (let i = 0; i < pieces.length; i++) {
      repo.insertChunk({
        notebookId,
        sourceId: source.id,
        ordIndex: i,
        text: pieces[i].text,
        rawText: normalized,
        location: {
          label: locationLabel(pieces[i], file.name),
          page: pieces[i].page,
          heading: pieces[i].heading,
        },
        extractionMethod: `local:${parser.extensions[0]}`,
        extractionWarnings: warnings,
      });
      inserted++;
    }

    repo.setSourceStatus(source.id, 'ready', undefined);
    onProgress?.({
      source: repo.getSource(source.id)!,
      phase: 'done',
      message: `Imported ${inserted} chunks.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    repo.setSourceStatus(source.id, 'error', message);
    onProgress?.({ source: repo.getSource(source.id)!, phase: 'error', message });
    throw err;
  }
  return repo.getSource(source.id)!;
}

function guessMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
    html: 'text/html', htm: 'text/html', pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}
