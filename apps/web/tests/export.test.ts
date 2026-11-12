import { describe, expect, it } from 'vitest';
import { exportNotebook, notebookToMarkdown, parseBundle, serializeBundle } from '../src/core/export/exporter.ts';
import type { Chunk, Notebook, Source } from '../src/core/domain/types.ts';

function makeFixtures() {
  const notebook: Notebook = {
    id: 'nb1', title: 'Biology', description: 'Cells and plants', tags: ['study'],
    archived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  const source: Source = {
    id: 's1', notebookId: 'nb1', kind: 'file', title: 'Bio notes', originalName: 'bio.txt',
    mimeType: 'text/plain', status: 'ready', preserveOriginal: false,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  const chunk: Chunk = {
    id: 'c1', notebookId: 'nb1', sourceId: 's1', ordIndex: 0, text: 'Photosynthesis uses light.',
    location: { label: 'bio.txt · page 1', heading: 'Photosynthesis' },
    extractionMethod: 'local:txt', extractionWarnings: [], createdAt: '2026-01-01',
  };
  return { notebook, source, chunk };
}

describe('export bundle', () => {
  it('exports a notebook bundle and round-trips it', () => {
    const { notebook, source, chunk } = makeFixtures();
    const bundle = exportNotebook(notebook, [source], [chunk]);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.notebook.title).toBe('Biology');
    expect(bundle.sources).toHaveLength(1);
    expect(bundle.chunks).toHaveLength(1);

    const json = serializeBundle(bundle);
    const parsed = parseBundle(json);
    expect(parsed.notebookTitle).toBe('Biology');
    expect(parsed.sources[0].id).toBe('s1');
    expect(parsed.chunksBySource.get('s1')).toHaveLength(1);
    expect(parsed.chunksBySource.get('s1')?.[0].text).toContain('Photosynthesis');
  });

  it('rejects unknown schema versions', () => {
    const bad = JSON.stringify({ schemaVersion: 99, exportedAt: '', notebook: {}, sources: [], chunks: [] });
    expect(() => parseBundle(bad)).toThrow(/schema version/i);
  });

  it('renders a notebook to Markdown with provenance', () => {
    const { notebook, source, chunk } = makeFixtures();
    const md = notebookToMarkdown(notebook, [source], [chunk]);
    expect(md).toContain('# Biology');
    expect(md).toContain('## Bio notes');
    expect(md).toContain('### Photosynthesis');
    expect(md).toContain('Photosynthesis uses light.');
  });
});
