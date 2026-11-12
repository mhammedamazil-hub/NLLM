/**
 * Notebook header — shows notebook title, stats, and edit button.
 * Includes a settings modal for editing title, description, and tags.
 */
import { useState, useEffect } from 'react';
import type { Notebook } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';

export interface NotebookHeaderProps {
  notebook: Notebook;
  repo: Repository;
  sourceCount: number;
  chunkCount: number;
  onPersist: () => Promise<void>;
}

export function NotebookHeader(props: NotebookHeaderProps) {
  const { notebook, repo, sourceCount, chunkCount, onPersist } = props;
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <div className="notebook-header">
        <div className="notebook-header-info">
          <h2 className="notebook-header-title">{notebook.title}</h2>
          {notebook.description && (
            <p className="notebook-header-desc">{notebook.description}</p>
          )}
          <div className="notebook-header-stats">
            <span className="stat">{sourceCount} sources</span>
            <span className="stat-dot">·</span>
            <span className="stat">{chunkCount} chunks</span>
            {notebook.tags.length > 0 && (
              <>
                <span className="stat-dot">·</span>
                <span className="stat-tags">
                  {notebook.tags.map((t: string) => (
                    <span key={t} className="tag-small">{t}</span>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
        <button className="btn small settings-btn" onClick={() => setShowSettings(true)}>
          ⚙ Settings
        </button>
      </div>

      {showSettings && (
        <NotebookSettingsModal
          notebook={notebook}
          repo={repo}
          onClose={() => setShowSettings(false)}
          onPersist={onPersist}
        />
      )}
    </>
  );
}

function NotebookSettingsModal({
  notebook,
  repo,
  onClose,
  onPersist,
}: {
  notebook: Notebook;
  repo: Repository;
  onClose: () => void;
  onPersist: () => Promise<void>;
}) {
  const [title, setTitle] = useState(notebook.title);
  const [description, setDescription] = useState(notebook.description);
  const [tags, setTags] = useState(notebook.tags.join(', '));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTitle(notebook.title);
    setDescription(notebook.description);
    setTags(notebook.tags.join(', '));
  }, [notebook]);

  const handleSave = async () => {
    const tagList = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    repo.updateNotebook(notebook.id, {
      title: title.trim() || notebook.title,
      description: description.trim(),
      tags: tagList,
    });
    await onPersist();
    setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="note-editor overlay" onClick={onClose}>
      <div className="note-editor-card" onClick={(e) => e.stopPropagation()}>
        <div className="source-detail-header">
          <h3>Notebook Settings</h3>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>

        <label className="pm-label">Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </label>

        <label className="pm-label">Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="textarea"
            placeholder="What is this notebook about?"
            rows={3}
          />
        </label>

        <label className="pm-label">Tags (comma-separated)
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="input"
            placeholder="study, research, biology"
          />
        </label>

        {saved && <p className="success">Settings saved.</p>}

        <div className="editor-actions">
          <button className="btn small" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
