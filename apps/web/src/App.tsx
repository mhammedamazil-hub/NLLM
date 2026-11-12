/**
 * Root app — Notebook Studio shell.
 * Notebook list (sidebar) + tabbed workspace (Sources, Chat, Artifacts, Notes).
 * ProviderManager (sidebar) manages API key lifecycle: add/unlock/save/delete.
 * Local-first: SQLite in WASM, keys encrypted at rest, no network calls
 * except direct to the configured provider.
 */
import { useState } from 'react';
import { useStore } from './ui/useStore.ts';
import { ProviderManager, type ActiveProvider } from './ui/ProviderManager.tsx';
import { NotebookList } from './ui/NotebookList.tsx';
import { SourcesPanel } from './ui/SourcesPanel.tsx';
import { ChatPanel } from './ui/ChatPanel.tsx';
import { ArtifactPanel } from './ui/ArtifactPanel.tsx';
import { NotesPanel } from './ui/NotesPanel.tsx';

type Tab = 'sources' | 'chat' | 'artifacts' | 'notes';

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('sources');
  const [activeProvider, setActiveProvider] = useState<ActiveProvider | null>(null);
  const [providerPassphrase, setProviderPassphrase] = useState('');

  const { notebooks, selectedNotebookId, sources, repo } = store;
  const sourceCounts: Record<string, number> = {};
  if (repo) {
    for (const nb of notebooks) {
      sourceCounts[nb.id] = repo.listSources(nb.id).length;
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NotebookList
          notebooks={notebooks}
          selectedId={selectedNotebookId}
          sourceCounts={sourceCounts}
          onSelect={store.selectNotebook}
          onCreate={store.createNotebook}
          onDelete={store.deleteNotebook}
        />
        {repo && (
          <ProviderManager
            repo={repo}
            onActivate={setActiveProvider}
            onPassphrase={setProviderPassphrase}
            onPersist={store.persist}
          />
        )}
      </aside>

      <main className="workspace">
        {store.error ? (
          <div className="error banner">Storage error: {store.error}</div>
        ) : !store.ready ? (
          <p className="loading">Loading Notebook Studio…</p>
        ) : !selectedNotebookId ? (
          <p className="empty">Select or create a notebook to get started.</p>
        ) : (
          <>
            <nav className="tabs">
              <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>Sources</button>
              <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
                Chat {activeProvider ? '●' : ''}
              </button>
              <button className={tab === 'artifacts' ? 'active' : ''} onClick={() => setTab('artifacts')}>Artifacts</button>
              <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>Notes</button>
            </nav>
            <div className="tab-body">
              {tab === 'sources' && (
                <SourcesPanel sources={sources} onImportFile={store.importFile} />
              )}
              {tab === 'chat' && repo && (
                <ChatPanel
                  notebookId={selectedNotebookId}
                  repo={repo}
                  activeProvider={activeProvider}
                  providerPassphrase={providerPassphrase}
                />
              )}
              {tab === 'artifacts' && repo && (
                <ArtifactPanel
                  notebookId={selectedNotebookId}
                  repo={repo}
                  activeProvider={activeProvider}
                  providerPassphrase={providerPassphrase}
                />
              )}
              {tab === 'notes' && repo && (
                <NotesPanel
                  notebookId={selectedNotebookId}
                  repo={repo}
                  sources={sources.map((s) => ({ id: s.id, title: s.title, originalName: s.originalName }))}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
