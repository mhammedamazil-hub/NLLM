/**
 * Notebook list — sidebar with create/select/delete.
 */
import type { Notebook } from '../core/domain/types.ts';

export interface NotebookListProps {
  notebooks: Notebook[];
  selectedId: string | null;
  sourceCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onCreate: (title: string, description: string) => void;
  onDelete: (id: string) => void;
}

export function NotebookList(props: NotebookListProps) {
  const { notebooks, selectedId, sourceCounts, onSelect, onCreate, onDelete } = props;

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem('description') as HTMLInputElement).value.trim();
    if (!title) return;
    onCreate(title, description);
    form.reset();
  };

  return (
    <aside className="sidebar">
      <h2>Notebooks</h2>
      <form onSubmit={submitCreate} className="new-notebook">
        <input name="title" placeholder="New notebook title" aria-label="Notebook title" />
        <input name="description" placeholder="Description (optional)" aria-label="Notebook description" />
        <button type="submit">Create</button>
      </form>
      <ul className="notebook-items">
        {notebooks.map((nb) => (
          <li
            key={nb.id}
            className={nb.id === selectedId ? 'notebook-item selected' : 'notebook-item'}
          >
            <button className="notebook-select" onClick={() => onSelect(nb.id)}>
              <span className="nb-title">{nb.title}</span>
              <span className="nb-meta">
                {nb.tags.length > 0 ? nb.tags.join(' · ') : `${sourceCounts[nb.id] ?? 0} sources`}
              </span>
            </button>
            <button
              className="nb-delete"
              aria-label={`Delete ${nb.title}`}
              onClick={() => {
                if (confirm(`Delete notebook "${nb.title}"? This removes all sources and chats.`)) onDelete(nb.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
        {notebooks.length === 0 && <li className="empty">No notebooks yet</li>}
      </ul>
    </aside>
  );
}
