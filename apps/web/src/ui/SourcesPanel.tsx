/**
 * Sources panel — shows the notebook's sources and lets you import files.
 */
import { useRef, useState } from 'react';
import type { Source } from '../core/domain/types.ts';

export interface SourcesPanelProps {
  sources: Source[];
  onImportFile: (file: File) => Promise<void>;
}

export function SourcesPanel(props: SourcesPanelProps) {
  const { sources, onImportFile } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {error && <p className="error">{error}</p>}
      <ul className="source-items">
        {sources.map((s) => (
          <li key={s.id} className="source-item">
            <span className="src-title">{s.title}</span>
            <span className={`src-status ${s.status}`}>{s.status}</span>
            <span className="src-kind">{s.kind}</span>
            {s.originalName !== s.title && <span className="src-name">{s.originalName}</span>}
          </li>
        ))}
        {sources.length === 0 && <li className="empty">No sources — import a .txt, .md, .html, or .pdf</li>}
      </ul>
    </section>
  );
}
