/**
 * NotesPanel — personal notes for a notebook.
 * CRUD UI: create, edit, delete, pin notes.
 * Notes can link back to source excerpts.
 */
import { useState, useEffect } from 'react';
import type { Note } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';

interface NotesPanelProps {
  notebookId: string;
  repo: Repository;
  sources: Array<{ id: string; title: string; originalName: string }>;
}

export function NotesPanel({ notebookId, repo, sources }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPinned, setEditPinned] = useState(false);

  function refresh() {
    setNotes(repo.listNotes(notebookId));
  }

  useEffect(() => { refresh(); }, [notebookId, repo]);

  function startCreate() {
    setEditingId('new');
    setEditTitle('');
    setEditContent('');
    setEditPinned(false);
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditPinned(note.pinned);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
    setEditPinned(false);
  }

  function saveNote() {
    const title = editTitle.trim();
    if (!title) return;
    if (editingId === 'new') {
      repo.createNote({ notebookId, title, content: editContent, pinned: editPinned });
    } else if (editingId) {
      repo.updateNote(editingId, { title, content: editContent, pinned: editPinned });
    }
    cancelEdit();
    refresh();
  }

  function deleteNote(id: string) {
    repo.deleteNote(id);
    refresh();
  }

  function togglePin(note: Note) {
    repo.updateNote(note.id, { pinned: !note.pinned });
    refresh();
  }

  return (
    <div className="panel notes-panel">
      <div className="panel-header">
        <h2>Notes</h2>
        <button className="btn primary" onClick={startCreate}>+ New Note</button>
      </div>
      <div className="notes-list">
        {notes.length === 0 && !editingId && (
          <p className="empty">No notes yet. Create one to capture your thoughts.</p>
        )}
        {notes.map((note) => (
          <div key={note.id} className={`note-card ${note.pinned ? 'pinned' : ''}`}>
            <div className="note-card-header">
              <span className="note-title">{note.title}</span>
              {note.pinned && <span className="pin-badge">📌</span>}
              <div className="note-actions">
                <button className="btn small" onClick={() => togglePin(note)}>
                  {note.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button className="btn small" onClick={() => startEdit(note)}>Edit</button>
                <button className="btn small danger" onClick={() => deleteNote(note.id)}>Delete</button>
              </div>
            </div>
            <div className="note-content">{note.content}</div>
            {note.tags.length > 0 && (
              <div className="note-tags">
                {note.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}
              </div>
            )}
            {note.sourceLinks.length > 0 && (
              <div className="note-sources">
                {note.sourceLinks.map((link, i) => {
                  const src = sources.find((s) => s.id === link.sourceId);
                  return src ? (
                    <span key={i} className="source-link">→ {src.title}</span>
                  ) : null;
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {editingId && (
        <div className="note-editor overlay">
          <div className="note-editor-card">
            <input
              className="input"
              type="text"
              placeholder="Note title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <textarea
              className="input textarea"
              placeholder="Write your note here…"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editPinned}
                onChange={(e) => setEditPinned(e.target.checked)}
              />
              Pinned
            </label>
            <div className="editor-actions">
              <button className="btn" onClick={cancelEdit}>Cancel</button>
              <button className="btn primary" onClick={saveNote}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
