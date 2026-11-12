/**
 * Sources panel — shows the notebook's sources and lets you import files.
 * Includes full-text search and a source detail view showing chunks.
 */
import { useRef, useState, useMemo } from 'react';
import type { Source, Chunk } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';

export interface SourcesPanelProps {
  notebookId: string;
  sources: Source[];
  repo: Repository;
  onImportFile: (file: File) => Promise<void>;
}

export function SourcesPanel(props: SourcesPanelProps) {
  const { sources, repo, onImportFile, notebookId } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Chunk[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  const sourceTitle = useMemo(() => {
    const map = new Map(sources.map((s) => [s.id, s.title]));
    return (id: string) => map.get(id) || 'Unknown source';
  }, [sources]);

  const handleSearch = () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setResults(repo.searchChunks(notebookId, q, 30));
  };

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await onImportFile(file);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const showResults = query.trim().length > 0;

  return (
    <section className="panel sources-panel">
      <header>
        <h2>Sources</h2>
        <label className="btn import-btn">
          {busy ? 'Importing…' : '+ Import'}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".txt,.md,.html,.htm,.pdf,text/*,application/pdf"
            onChange={(e) => handleFiles(e.target.files)}
            hidden
          />
        </label>
      </header>

      {/* Search bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search across all sources…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) setResults([]);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
        />
        {query && (
          <button className="btn small search-clear" onClick={handleClearSearch}>✕</button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {/* Search results */}
      {showResults && (
        <div className="search-results">
          <div className="search-results-header">
            <span className="hint">
              {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
            </span>
          </div>
          <ul className="search-result-list">
            {results.map((chunk) => {
              const text = chunk.text || '';
              const snippet = text.length > 200 ? text.slice(0, 200) + '…' : text;
              return (
                <li key={chunk.id} className="search-result-item">
                  <div className="search-result-meta">
                    <span className="search-result-source">{sourceTitle(chunk.sourceId)}</span>
                    <span className="search-result-location">{chunk.location.label}</span>
                  </div>
                  <p className="search-result-snippet">{snippet}</p>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="empty">No results found. Try different keywords.</li>
            )}
          </ul>
        </div>
      )}

      {/* Source list (hidden when searching) */}
      {!showResults && (
        <ul className="source-items">
          {sources.map((s) => (
            <li key={s.id} className="source-item">
              <button className="src-title-btn" onClick={() => setSelectedSource(s)}>
                <span className="src-title">{s.title}</span>
                <span className={`src-status ${s.status}`}>{s.status}</span>
                <span className="src-kind">{s.kind}</span>
                {s.originalName !== s.title && <span className="src-name">{s.originalName}</span>}
              </button>
            </li>
          ))}
          {sources.length === 0 && <li className="empty">No sources — import a .txt, .md, .html, or .pdf</li>}
        </ul>
      )}

      {/* Source detail modal */}
      {selectedSource && (
        <SourceDetailModal
          source={selectedSource}
          repo={repo}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </section>
  );
}

/** Source detail modal — shows chunks of a source with text preview. */
function SourceDetailModal({
  source,
  repo,
  onClose,
}: {
  source: Source;
  repo: Repository;
  onClose: () => void;
}) {
  const chunks = repo.listChunksBySource(source.id);

  return (
    <div className="note-editor overlay" onClick={onClose}>
      <div className="note-editor-card source-detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="source-detail-header">
          <h3>{source.title}</h3>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="source-detail-meta">
          <span className="src-kind">{source.kind}</span>
          <span className="hint">{source.originalName}</span>
          <span className="hint">{chunks.length} chunks</span>
        </div>
        <div className="source-detail-chunks">
          {chunks.map((chunk, i) => (
            <div key={chunk.id} className="source-chunk">
              <div className="source-chunk-meta">
                <span className="source-chunk-index">#{i + 1}</span>
                <span className="source-chunk-location">{chunk.location.label}</span>
              </div>
              <p className="source-chunk-text">{chunk.text}</p>
            </div>
          ))}
          {chunks.length === 0 && (
            <p className="empty">No chunks extracted from this source.</p>
          )}
        </div>
      </div>
    </div>
  );
}
